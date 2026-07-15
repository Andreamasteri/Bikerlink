// Task #86 — Finalizzazione delle due scansioni autonome di Horus.
//
// Questo modulo NON gestisce il ciclo a lotti (vedi horus-scanner.ts): riceve
// lo store per-file già popolato e produce l'output finale di ciascuna modalità.
//
//  - ANALISI codice+DB → sintetizza le osservazioni per-file + lo stato dei
//    controlli di integrità DB già esistenti (riusati come fonte dati, non
//    duplicati) in PROPOSTE azionabili, persistite con lo stesso schema a doppia
//    scrittura (ai_analysis_runs + ai_analysis_artifacts + mirror .md) usato
//    dall'analisi autonoma esistente. Horus propone, non applica.
//
//  - MANUALE → assembla un manuale testuale organizzato per FUNZIONALITÀ/AREA
//    (non un elenco di file), lo salva nello storage del manuale di Nadir già
//    esistente CONSERVANDO la versione precedente, e avvia la reindicizzazione
//    così diventa subito ricercabile.
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { db } from "../../db";
import { aiAnalysisRuns, aiAnalysisArtifacts } from "@shared/db";
import { withBgDbSlot } from "../../lib/bg-db-limiter";
import { callOllamaChat, getOllamaModelId } from "../../lib/ollama-client";
import { redactPII } from "../moderation/redact";
import { matchesSensitive } from "./security-filter";
import { getLatestRunSummary, listOpenViolations } from "../db-integrity/runner";
import { saveNadirManualWithBackup } from "../nadir/manual";
import { reindexNadir } from "../nadir/reindex";
import type { FileScanStore } from "./codebase-inventory";

const MIRROR_DIR = path.join(process.cwd(), "logs");
const MIN_ARTIFACT_LEN = 30;
const MAX_ARTIFACT_LEN = 4000;
const ARTIFACT_TTL_DAYS = 30;
const MAX_VIOLATIONS = 20;
const SYNTHESIS_GROUP_CHARS = 8000;
const SECTION_MAX_NOTES_CHARS = 8000;
const SYNTHESIS_NUM_PREDICT = 800;
const SECTION_NUM_PREDICT = 700;

// ── Helper condivisi ─────────────────────────────────────────────────────────

/** qwen3 (Horus=qwen3:4b) può lasciare un `</think>` orfano anche con think:false. */
function stripThink(text: string): string {
  if (!text) return "";
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const orphan = out.lastIndexOf("</think>");
  if (orphan !== -1) out = out.slice(orphan + "</think>".length);
  return out.trim();
}

function sanitize(text: string): string | null {
  const clean = redactPII((text ?? "").trim()).trim();
  if (!clean || clean.length < MIN_ARTIFACT_LEN) return null;
  if (matchesSensitive(clean)) return null;
  return clean.length > MAX_ARTIFACT_LEN ? clean.slice(0, MAX_ARTIFACT_LEN) : clean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALISI codice+DB
// ═══════════════════════════════════════════════════════════════════════════

interface Finding {
  path: string;
  note: string;
}

/** Stato dei controlli di integrità DB già esistenti (riuso, non duplicazione). */
async function collectDbIntegrityText(): Promise<string> {
  const [runSummary, violations] = await Promise.all([
    withBgDbSlot(() => getLatestRunSummary()).catch(() => null),
    withBgDbSlot(() => listOpenViolations(MAX_VIOLATIONS)).catch(() => [] as Awaited<ReturnType<typeof listOpenViolations>>),
  ]);
  if (!runSummary) return "Nessun run db-integrity disponibile.";
  const sample =
    violations.length > 0
      ? violations
          .slice(0, MAX_VIOLATIONS)
          .map((v) => `[${v.severity}/${v.category}] ${v.checkName} (${v.count} righe)`)
          .join("; ")
      : "nessuna";
  return (
    `Ultimo run db-integrity (${runSummary.runAt}, salute=${runSummary.health}): ` +
    `${runSummary.violationsFound} violazioni (${runSummary.autoFixed} auto-fixed, ` +
    `${runSummary.manualPending} manuali), check eseguiti=${runSummary.checksRun}. ` +
    `Violazioni aperte (campione): ${sample}`
  );
}

/** Raggruppa i finding in blocchi di sintesi entro un tetto di caratteri. */
function chunkFindings(findings: Finding[], maxChars: number): Finding[][] {
  const groups: Finding[][] = [];
  let current: Finding[] = [];
  let size = 0;
  for (const f of findings) {
    const len = f.path.length + f.note.length + 8;
    if (size + len > maxChars && current.length > 0) {
      groups.push(current);
      current = [];
      size = 0;
    }
    current.push(f);
    size += len;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function renderFindings(group: Finding[]): string {
  return group.map((f) => `### ${f.path}\n${f.note}`).join("\n\n");
}

async function synthesizeGroup(group: Finding[], multi: boolean): Promise<string | null> {
  const prompt = `Sei Horus, in modalità ANALISI CODICE (SOLA LETTURA) dell'app BikerLink.
Qui sotto ci sono osservazioni per-file raccolte leggendo il codice. ${
    multi ? "Questo è UNO dei blocchi. " : ""
  }Trasformale in PROPOSTE azionabili concrete (variazioni, miglioramenti o vere proposte di task), aggregando le osservazioni simili. NON riscrivere il codice, NON proporre scritture dirette su GitHub/DB: solo proposte da valutare. Italiano, elenco puntato conciso.

OSSERVAZIONI:
${renderFindings(group)}

PROPOSTE:`;
  const raw = await callOllamaChat(prompt, undefined, {
    persona: "horus",
    temperature: 0.2,
    numPredict: SYNTHESIS_NUM_PREDICT,
  });
  return sanitize(stripThink(raw ?? ""));
}

async function mergeProposals(
  partials: string[],
  dbText: string,
  findingsCount: number,
): Promise<string | null> {
  const prompt = `Sei Horus, in modalità ANALISI (SOLA LETTURA) dell'app BikerLink.
Unifica le proposte parziali qui sotto (raccolte da ${findingsCount} file con osservazioni) e lo stato dei controlli di integrità del DB in UN unico elenco di PROPOSTE azionabili, senza duplicati, ordinate per impatto. Includi eventuali proposte su coerenza/struttura del database (schema vs migration, indici, drift, tabelle/colonne orfane) basandoti sullo stato DB. NON applicare nulla, NON riscrivere codice: solo proposte da valutare. Italiano.

STATO INTEGRITÀ DB:
${dbText}

PROPOSTE PARZIALI:
${partials.join("\n\n---\n\n")}

PROPOSTE FINALI:`;
  const raw = await callOllamaChat(prompt, undefined, {
    persona: "horus",
    temperature: 0.2,
    numPredict: SYNTHESIS_NUM_PREDICT,
  });
  return sanitize(stripThink(raw ?? ""));
}

async function writeMirrorFile(runId: string, title: string, content: string): Promise<string | null> {
  try {
    await fs.mkdir(MIRROR_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(MIRROR_DIR, `horus-scan-${ts}.md`);
    const body = `# Horus — Scansione completa codice+DB\n\nRun: ${runId}\nData: ${new Date().toISOString()}\n\n## ${title}\n\n${content}\n`;
    await fs.writeFile(filePath, body, "utf8");
    return filePath;
  } catch (err) {
    console.warn("[horus-scan] mirror file fallito (non-fatale, il DB resta valido):", (err as Error).message);
    return null;
  }
}

async function persistAnalysisRun(
  proposals: string,
  dbText: string,
  fingerprint: string,
  filesTotal: number,
  findingsCount: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ARTIFACT_TTL_DAYS * 24 * 60 * 60_000);
  const modelId = getOllamaModelId("horus");
  await withBgDbSlot(async () => {
    const [run] = await db
      .insert(aiAnalysisRuns)
      .values({
        persona: "horus",
        trigger: "repo-study",
        fingerprint,
        status: "completed",
        modelId,
        summary:
          `Scansione completa: ${filesTotal} file, ${findingsCount} con osservazioni. ` +
          proposals.slice(0, 300),
        artifactCount: 2,
      })
      .returning({ id: aiAnalysisRuns.id });

    const mirrorPath = await writeMirrorFile(run.id, "Proposte da analisi codice+DB", proposals);
    const contentHash = createHash("sha256").update(proposals).digest("hex").slice(0, 64);

    await db.insert(aiAnalysisArtifacts).values([
      {
        runId: run.id,
        kind: "repo-study",
        title: "Proposte da analisi codice completa (Horus)",
        content: proposals.slice(0, MAX_ARTIFACT_LEN),
        sensitivity: "internal",
        mirrorPath,
        contentHash,
        expiresAt,
      },
      {
        runId: run.id,
        kind: "db-integrity",
        title: "Stato integrità DB (input analisi Horus)",
        content: dbText.slice(0, MAX_ARTIFACT_LEN),
        sensitivity: "internal",
        mirrorPath,
        contentHash,
        expiresAt,
      },
    ]);
  });
}

/**
 * Finalizza la modalità ANALISI: sintetizza osservazioni + stato DB in proposte
 * azionabili e le persiste (dual-write). Ritorna un riassunto per lo stato.
 */
export async function finalizeAnalysisScan(
  store: FileScanStore,
  filesTotal: number,
  filesSkipped: number,
): Promise<string> {
  const findings: Finding[] = Object.entries(store)
    .filter(([, r]) => {
      const n = (r.note ?? "").trim();
      return n.length > 0 && n.toUpperCase() !== "OK";
    })
    .map(([p, r]) => ({ path: p, note: r.note.trim() }));

  const dbText = await collectDbIntegrityText();

  let proposals: string;
  if (findings.length === 0) {
    // Nessuna osservazione dal codice: proponi comunque a partire dallo stato DB.
    proposals =
      (await mergeProposals(["Nessuna osservazione rilevante emersa dai file di codice."], dbText, 0)) ??
      `Nessuna proposta rilevante dal codice. Stato integrità DB:\n${dbText}`;
  } else {
    const groups = chunkFindings(findings, SYNTHESIS_GROUP_CHARS);
    const partials: string[] = [];
    for (const g of groups) {
      const p = await synthesizeGroup(g, groups.length > 1);
      if (p) partials.push(p);
    }
    if (partials.length === 0) {
      proposals = `Analisi completata ma nessuna proposta sintetizzabile. Stato integrità DB:\n${dbText}`;
    } else if (partials.length === 1 && dbText.startsWith("Nessun run")) {
      proposals = partials[0];
    } else {
      proposals =
        (await mergeProposals(partials, dbText, findings.length)) ?? partials.join("\n\n");
    }
  }

  const fingerprint = createHash("sha256")
    .update(Object.entries(store).map(([p, r]) => `${p}:${r.hash}`).join("|"))
    .digest("hex")
    .slice(0, 64);

  await persistAnalysisRun(proposals, dbText, fingerprint, filesTotal, findings.length);

  return (
    `Analisi codice+DB completata: ${filesTotal} file totali ` +
    `(${filesSkipped} invariati saltati), ${findings.length} con osservazioni. ` +
    `Proposte salvate (ai_analysis_runs trigger=repo-study + mirror logs/horus-scan-*.md).`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MANUALE
// ═══════════════════════════════════════════════════════════════════════════

/** Mappa un path di file a un'area funzionale leggibile del manuale. */
function areaOf(relPath: string): string {
  const p = relPath.replace(/\\/g, "/");
  if (p.startsWith("shared/")) return "Modelli e schema condivisi";
  // Frontend dell'app Expo (distribuito su più cartelle, non sotto client/).
  if (p.startsWith("app/")) return "Interfaccia utente (schermate e routing)";
  if (p.startsWith("components/")) return "Interfaccia utente (componenti)";
  if (p.startsWith("hooks/")) return "Interfaccia utente (hook e logica client)";
  if (p.startsWith("constants/")) return "Costanti e configurazione client";
  if (p.startsWith("lib/")) return "Librerie client condivise";
  if (p.startsWith("server/ai/nadir/")) return "Ricerca semantica (Nadir)";
  if (p.startsWith("server/ai/assistant/")) return "Assistenti AI (Bowie, Horus, ...)";
  if (p.startsWith("server/ai/watchdog/")) return "Monitoraggio e watchdog";
  if (p.startsWith("server/ai/db-integrity/")) return "Integrità del database";
  if (p.startsWith("server/ai/coordinator/")) return "Coordinamento job AI";
  if (p.startsWith("server/ai/")) return "Intelligenza artificiale";
  if (p.startsWith("server/routes/")) return "API ed endpoint";
  if (p.startsWith("server/")) return "Backend (servizi e infrastruttura)";
  return "Altro";
}

async function writeManualSection(area: string, notesText: string): Promise<string | null> {
  const prompt = `Sei Horus. Scrivi UNA sezione di manuale (italiano, prosa scorrevole, 1-3 paragrafi) per l'area "${area}" dell'app BikerLink, pensata per ISTRUIRE un altro agente AI su COSA fa l'app e COME funziona quest'area. Basati SOLO sulle note per-file qui sotto, aggregandole per funzionalità. NON elencare i file uno per uno, NON incollare codice, NON inventare funzionalità non presenti nelle note.

NOTE PER-FILE (area "${area}"):
${notesText}

SEZIONE:`;
  const raw = await callOllamaChat(prompt, undefined, {
    persona: "horus",
    temperature: 0.3,
    numPredict: SECTION_NUM_PREDICT,
  });
  return sanitize(stripThink(raw ?? ""));
}

/**
 * Finalizza la modalità MANUALE: raggruppa le descrizioni per-file per area,
 * fa scrivere a Horus una sezione per area, assembla il manuale, lo salva nello
 * storage di Nadir CONSERVANDO la versione precedente e reindicizza.
 */
export async function finalizeManualScan(store: FileScanStore): Promise<string> {
  // Raggruppa le note (non vuote) per area.
  const byArea = new Map<string, Array<{ path: string; note: string }>>();
  for (const [p, r] of Object.entries(store)) {
    const note = (r.note ?? "").trim();
    if (!note) continue;
    const area = areaOf(p);
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area)!.push({ path: p, note });
  }

  const areas = [...byArea.keys()].sort();
  const sections: string[] = [];
  for (const area of areas) {
    const items = byArea.get(area)!;
    // Concatena le note fino al tetto di caratteri per non gonfiare il prompt.
    let notesText = "";
    for (const it of items) {
      const line = `- ${it.path}: ${it.note}\n`;
      if (notesText.length + line.length > SECTION_MAX_NOTES_CHARS) break;
      notesText += line;
    }
    const section = await writeManualSection(area, notesText);
    if (section) sections.push(`## ${area}\n\n${section}`);
  }

  const now = new Date().toISOString();
  const manual =
    `# Manuale BikerLink — generato da Horus\n\n` +
    `_Aggiornato il ${now}. Generato automaticamente dall'analisi completa del codice dell'app da parte di Horus (sola lettura). Descrive le funzionalità dell'app per istruire gli agenti AI._\n\n` +
    (sections.length > 0 ? sections.join("\n\n") : "_Nessuna sezione generata (nessuna nota disponibile)._");

  const { backedUp } = await saveNadirManualWithBackup(manual);
  const index = await reindexNadir("manual").catch((e) => {
    console.warn("[horus-scan:manual] reindicizzazione fallita (manuale salvato comunque):", (e as Error).message);
    return null;
  });

  return (
    `Manuale generato (${sections.length} aree, ${manual.length} caratteri) e salvato nello storage di Nadir` +
    `${backedUp ? " (versione precedente conservata per confronto)" : ""}. ` +
    `${index ? (index.ok ? "Reindicizzazione OK." : "Reindicizzazione con avvisi.") : "Reindicizzazione da riprovare."}`
  );
}
