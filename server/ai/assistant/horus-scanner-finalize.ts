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
//  - MANUALE → vedi horus-scanner-finalize-manual.ts (split per ratchet 600 righe).
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { db } from "../../db";
import { aiAnalysisRuns, aiAnalysisArtifacts } from "@shared/db";
import { withBgDbSlot } from "../../lib/bg-db-limiter";
import { callOllamaChat } from "../../lib/ollama-client";
import { AGENT_MODEL_DEFAULTS } from "../../lib/agent-constants";
import { redactPII } from "../moderation/redact";
import { matchesSensitive } from "./security-filter";
import { getLatestRunSummary, listOpenViolations } from "../db-integrity/runner";
import {
  type FileScanStore,
  HORUS_THINK_TAG_CONTRACT,
} from "./codebase-inventory";

// ── Costanti condivise (esportate per horus-scanner-finalize-manual.ts) ──────

export const MIRROR_DIR = path.join(process.cwd(), "logs");
export const MIN_ARTIFACT_LEN = 30;
export const MAX_ARTIFACT_LEN = 4000;
// Task #152 — Le sezioni del manuale sono più lunghe degli artifact d'analisi.
export const MANUAL_SECTION_MAX_LEN = 20000;

// `persona: "horus"` sceglie SOLO l'endpoint, NON il modello: senza `model`
// esplicito la sintesi ricadrebbe su BOWIE_OLLAMA_MODEL. Le proposte e il manuale
// devono essere prodotti dal modello di Horus (qwen3:4b), come gli altri consult
// persona-specifici. Vedi memory: inter-agent-consult-model-mismatch.
export const HORUS_MODEL_ID = process.env.HORUS_OLLAMA_MODEL?.trim() || AGENT_MODEL_DEFAULTS.horus;

// ── Helper condivisi (esportati per horus-scanner-finalize-manual.ts) ────────

/** qwen3 (Horus=qwen3:4b) può lasciare un `</think>` orfano anche con think:false. */
export function stripThink(text: string): string {
  if (!text) return "";
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const orphan = out.lastIndexOf("</think>");
  if (orphan !== -1) out = out.slice(orphan + "</think>".length);
  return out.trim();
}

export function sanitize(text: string): string | null {
  const clean = redactPII((text ?? "").trim()).trim();
  if (!clean || clean.length < MIN_ARTIFACT_LEN) return null;
  if (matchesSensitive(clean)) return null;
  return clean.length > MAX_ARTIFACT_LEN ? clean.slice(0, MAX_ARTIFACT_LEN) : clean;
}

/**
 * Task #152 — Sanitizzazione per i BLOCCHI del manuale (sezioni, dizionario,
 * panoramica, glossario): stesse protezioni (redazione PII + filtro sensibile) ma
 * tetto molto più alto di MAX_ARTIFACT_LEN, perché i testi del manuale sono
 * legittimamente lunghi e non vanno troncati come gli artifact d'analisi.
 */
export function sanitizeManual(text: string): string | null {
  const clean = redactPII((text ?? "").trim()).trim();
  if (!clean || clean.length < MIN_ARTIFACT_LEN) return null;
  if (matchesSensitive(clean)) return null;
  return clean.length > MANUAL_SECTION_MAX_LEN ? clean.slice(0, MANUAL_SECTION_MAX_LEN) : clean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALISI codice+DB
// ═══════════════════════════════════════════════════════════════════════════

const ARTIFACT_TTL_DAYS = 30;
const MAX_VIOLATIONS = 20;
const SYNTHESIS_GROUP_CHARS = 8000;
const SYNTHESIS_NUM_PREDICT = 6000;

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
  // stream:true → Ollama stream:true via doStream → CF riceve token subito (no 524 timeout).
  const raw = await callOllamaChat(prompt, undefined, {
    persona: "horus",
    model: HORUS_MODEL_ID,
    system: HORUS_THINK_TAG_CONTRACT,
    temperature: 0.2,
    numPredict: SYNTHESIS_NUM_PREDICT,
    stream: true,
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
  // stream:true → Ollama stream:true via doStream → CF riceve token subito (no 524 timeout).
  const raw = await callOllamaChat(prompt, undefined, {
    persona: "horus",
    model: HORUS_MODEL_ID,
    system: HORUS_THINK_TAG_CONTRACT,
    temperature: 0.2,
    numPredict: SYNTHESIS_NUM_PREDICT,
    stream: true,
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
  // HORUS_MODEL_ID risolve come getOllamaModelId("horus") (Task #165): qui
  // registriamo il modello REALE che ha prodotto le proposte (Horus/qwen3:4b).
  const modelId = HORUS_MODEL_ID;
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
