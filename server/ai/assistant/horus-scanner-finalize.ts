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
import { callOllamaChat } from "../../lib/ollama-client";
import { redactPII } from "../moderation/redact";
import { matchesSensitive } from "./security-filter";
import { getLatestRunSummary, listOpenViolations } from "../db-integrity/runner";
import { saveNadirManualWithBackup, getNadirManualTranslations } from "../nadir/manual";
import { retranslateManualNow } from "../nadir/translate";
import { storage } from "../../storage";
import { hubPost, isHubAvailable } from "../../lib/ai-hub-client";
import {
  type FileScanStore,
  HORUS_THINK_TAG_CONTRACT,
  MANUAL_LANGUAGE_STYLE_BLOCK,
} from "./codebase-inventory";
import {
  TRANSLATABLE_APP_LANGUAGES,
  APP_LANGUAGE_NAMES,
  type AppLanguageCode,
} from "@shared/languages";

const MIRROR_DIR = path.join(process.cwd(), "logs");
const MIN_ARTIFACT_LEN = 30;
const MAX_ARTIFACT_LEN = 4000;
const ARTIFACT_TTL_DAYS = 30;
const MAX_VIOLATIONS = 20;
const SYNTHESIS_GROUP_CHARS = 8000;
// Task #152 — Il manuale documenta ogni area in profondità (domande specifiche +
// dizionario dell'interfaccia): più note in ingresso e più token in uscita.
const SECTION_MAX_NOTES_CHARS = 14000;
// Verificato live: con un tetto stretto il ragionamento di qwen3:4b (senza tag,
// vedi HORUS_THINK_TAG_CONTRACT) consuma tutto lo spazio e la sintesi/sezione vera
// non viene mai scritta per intero. Budget generoso: la finalizzazione gira poche
// volte per scansione (non per-file), nessuna fretta.
const SYNTHESIS_NUM_PREDICT = 6000;
const SECTION_NUM_PREDICT = 7000;
// Task #152 — Le sezioni del manuale sono più lunghe degli artifact d'analisi:
// non vanno troncate a MAX_ARTIFACT_LEN (tetto pensato per lo storage artifact).
const MANUAL_SECTION_MAX_LEN = 20000;

// `persona: "horus"` sceglie SOLO l'endpoint, NON il modello: senza `model`
// esplicito la sintesi ricadrebbe su BOWIE_OLLAMA_MODEL. Le proposte e il manuale
// devono essere prodotti dal modello di Horus (qwen3:4b), come gli altri consult
// persona-specifici. Vedi memory: inter-agent-consult-model-mismatch.
const HORUS_MODEL_ID = process.env.HORUS_OLLAMA_MODEL?.trim() || "qwen3:4b";

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

/**
 * Task #152 — Sanitizzazione per i BLOCCHI del manuale (sezioni, dizionario,
 * panoramica, glossario): stesse protezioni (redazione PII + filtro sensibile) ma
 * tetto molto più alto di MAX_ARTIFACT_LEN, perché i testi del manuale sono
 * legittimamente lunghi e non vanno troncati come gli artifact d'analisi.
 */
function sanitizeManual(text: string): string | null {
  const clean = redactPII((text ?? "").trim()).trim();
  if (!clean || clean.length < MIN_ARTIFACT_LEN) return null;
  if (matchesSensitive(clean)) return null;
  return clean.length > MANUAL_SECTION_MAX_LEN ? clean.slice(0, MANUAL_SECTION_MAX_LEN) : clean;
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
    model: HORUS_MODEL_ID,
    system: HORUS_THINK_TAG_CONTRACT,
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
    model: HORUS_MODEL_ID,
    system: HORUS_THINK_TAG_CONTRACT,
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
  // getOllamaModelId ignora la persona e ritorna sempre BOWIE_OLLAMA_MODEL: qui
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

// ═══════════════════════════════════════════════════════════════════════════
// MANUALE
// ═══════════════════════════════════════════════════════════════════════════

// Task #152 — Le 24 aree funzionali OBBLIGATORIE del manuale, ciascuna con le
// domande specifiche a cui la sezione deve rispondere. Sostituiscono la vecchia
// mappatura per cartella di codice (areaOf): il manuale è organizzato per
// FUNZIONALITÀ dell'app, non per struttura del repository.
const MANUAL_AREAS: ReadonlyArray<{ title: string; questions: string }> = [
  {
    title: "Mappa Live e Visibilità Rider",
    questions:
      "Chi vede chi sulla mappa? Come funzionano hide_from_map e il ghost mode? Come agiscono i filtri Biker/Zavorrina/Motoclub? Cosa succede con coordinate null? Che differenza c'è tra vista admin e vista utente?",
  },
  {
    title: "Routing Moto — Pianificazione Percorsi",
    questions:
      "Quali profili esistono (curvy, panoramico, auto panoramica, ecc.)? Quando si usa GraphHopper e quando Valhalla? Cosa sono le routing_areas? Come funziona il fallback offline? Cosa fa il pulsante \"Calcola Percorso\"?",
  },
  {
    title: "Navigazione in Tempo Reale",
    questions:
      "Come si inizia e si termina una sessione di navigazione? Cosa mostra l'overlay (istruzione, distanza, tempo)? Ci sono comandi vocali? Cosa fanno \"Inizia Navigazione\" e \"Arrivato\"?",
  },
  {
    title: "Tracking GPS e Sessioni di Guida",
    questions:
      "Come si avvia e conclude il tracking? Come si aggiungono i waypoint? Cos'è il Dead-Reckoning e come interagisce con la telemetria? Dove si vede lo storico giri? Come si cambia unità/velocità?",
  },
  {
    title: "Telemetria e Calibrazione Sensori",
    questions:
      "Come funziona il batch GPS? Cos'è il fusion gate? Cosa fa il Kalman filter? Cosa sono speedBias e headingBias? Cosa succede quando il ThinkCentre è offline?",
  },
  {
    title: "MotoClub — Gestione Club",
    questions:
      "Come si crea e si scopre un club? Cos'è il \"club padre\"? Come ci si iscrive? Chi è il responsabile? Come funzionano marketplace e mappa del club?",
  },
  {
    title: "Matching tra Rider",
    questions:
      "Su cosa si basa il matching? Come si generano le proposals? Come si accetta o rifiuta? Cosa succede senza telemetria? Cosa fa \"Trova Biker Compatibili\"?",
  },
  {
    title: "Proposte e Richieste di Giro",
    questions:
      "Quali tipi esistono (Giro, Raduno, Con Zavorrina, Richiesta)? Come si crea una proposta? Come si risponde? Dove appaiono le proposte?",
  },
  {
    title: "Eventi Motociclistici",
    questions:
      "Chi crea gli eventi? Come si partecipa? Come appaiono sulla mappa? Quali notifiche generano?",
  },
  {
    title: "SOS e Segnalazione Pericoli Stradali",
    questions:
      "Quali tipi di SOS esistono e chi viene notificato? Come funziona la segnalazione road-hazard e la durata di visibilità? Cosa fanno \"Segnala Pericolo\" e \"Invia Segnalazione\"?",
  },
  {
    title: "Contest Foto",
    questions:
      "Qual è il flusso del contest? Come si carica una foto? Come si vota? Dov'è l'albo dei vincitori? Quanti voti al giorno sono ammessi?",
  },
  {
    title: "Arcade e Gamification",
    questions:
      "Quali giochi esistono? Come funzionano le classifiche? Come si connette la gamification alla telemetria?",
  },
  {
    title: "Chat e Messaggistica",
    questions:
      "Quali tipi di chat esistono (privata, gruppo, amici)? Come si crea una chat? Cos'è la chat con Bowie? Cosa fa \"Nuovo messaggio\"?",
  },
  {
    title: "Profilo Utente e Garage",
    questions:
      "Cosa contiene il profilo? Come si modifica? Cos'è il garage? Quali statistiche mostra? Quali impostazioni privacy ci sono (fake position, ghost mode, visibilità)?",
  },
  {
    title: "Assistente AI Bowie",
    questions:
      "Quali sono le capacità di Bowie? Come si attiva? Dov'è il pulsante? Quali azioni può compiere? Come usa Nadir? Dà suggerimenti proattivi? Come si disattiva? Cosa fanno \"Chiedi a Bowie\" e il tour?",
  },
  {
    title: "Horus — AI di Routing e Analisi Codice",
    questions:
      "Cosa fa Horus per il routing? Come analizza il codice? Cos'è la modalità manuale? Come interagisce con Nadir?",
  },
  {
    title: "Nadir — Ricerca Semantica e RAG",
    questions:
      "Cos'è Nadir e cosa indicizza? Come funziona il reindex? Come cerca Bowie tramite Nadir? Come gestisce il multi-lingua e il sourceHash? Dove vivono i file (TC `agent-shared/nadir/manuale/` + fallback Replit)?",
  },
  {
    title: "Ares — Diagnostica Tecnica (solo admin)",
    questions:
      "Qual è la funzione di Ares? Come si invoca? Quali analisi produce? Come interagisce con Nadir?",
  },
  {
    title: "Quebracho — Coordinamento Job AI",
    questions:
      "Qual è il ruolo di Quebracho? Come orchestra i job? Come funzionano pause/resume? Cos'è un gated-job?",
  },
  {
    title: "Watchdog, Monitoraggio e Alert",
    questions:
      "Cosa monitora il watchdog? Come genera gli alert? Cos'è il kill-switch? Come funziona l'auto-fix? Quando invia notifiche push agli admin?",
  },
  {
    title: "Sistema OTA e Aggiornamenti App",
    questions:
      "Come funziona l'OTA? Cos'è il BootGate? Cos'è l'HWM? Come funziona il rollback? A cosa serve il canale \"diagnostic\"?",
  },
  {
    title: "ThinkCentre e Infrastruttura Self-Hosted",
    questions:
      "Quali servizi ospita il ThinkCentre? Come sono esposti (Cloudflare Tunnel)? Come funziona il fallback offline? Come si monitora la salute? Cosa sono ai-hub e la cartella `agent-shared/`?",
  },
  {
    title: "Autenticazione, Ruoli e Admin Panel",
    questions:
      "Quali ruoli esistono? Come funziona la registrazione (4 step)? Cos'è il pannello admin mobile? Come funziona la moderazione foto?",
  },
  {
    title: "Notifiche Push, Localizzazione e Multi-Lingua",
    questions:
      "Quali tipi di notifica esistono? Che differenze ci sono tra iOS e Android? Quali lingue sono supportate (elencale tutte con il nome nativo)? Come funziona la traduzione AI del manuale?",
  },
];

// Task #152 — I 35 termini obbligatori del glossario (chiude il manuale).
const GLOSSARY_TERMS =
  "ThinkCentre, Horus, Bowie, Nadir, Ares, Quebracho, OTA, BootGate, HWM, " +
  "curvy routing, routing area, telemetria, Dead-Reckoning, Kalman filter, " +
  "fusion gate, MotoClub, road-hazard, SOS, watchdog, kill-switch, AI Coordinator, " +
  "db-integrity, reindex, sourceHash, persona AI, RAG, embedding, Cloudflare Tunnel, " +
  "qwen3, EAS, ghost mode, fake position, zavorrina, biker matching, proposta";

/** Aggrega le note FUNZIONALI per-file in un corpus unico, entro un tetto di caratteri. */
function buildFunctionalCorpus(store: FileScanStore, maxChars: number): string {
  let corpus = "";
  for (const [p, r] of Object.entries(store)) {
    const note = (r.note ?? "").trim();
    if (!note || note.toUpperCase() === "OK") continue;
    const line = `- ${p}: ${note}\n`;
    if (corpus.length + line.length > maxChars) break;
    corpus += line;
  }
  return corpus;
}

/** Spezza le note LESSICALI aggregate in blocchi entro il tetto per-prompt. */
function chunkLexiconNotes(store: FileScanStore, maxChars: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const [p, r] of Object.entries(store)) {
    const note = (r.lexiconNote ?? "").trim();
    if (!note) continue;
    const block = `### File: ${p}\n${note}\n\n`;
    if (current.length + block.length > maxChars && current.length > 0) {
      chunks.push(current);
      current = "";
    }
    current += block;
  }
  if (current.trim().length > 0) chunks.push(current);
  return chunks;
}

/** Intestazione standard di ogni file .md salvato sul TC (Task #152, step 8). */
function buildManualHeader(lang: AppLanguageCode, iso: string): string {
  const name = APP_LANGUAGE_NAMES[lang];
  return (
    `# Manuale BikerLink — generato da Horus\n` +
    `_Generato il ${iso}. Lingua: ${name}_\n` +
    `_Storage TC: ~/agent-shared/nadir/manuale/${lang}.md_\n` +
    `_Search: ai-hub POST /nadir/search (TC) | fallback: Replit pgvector_`
  );
}

/** Scrive UNA sezione funzionale del manuale per una delle 24 aree (step 5). */
async function writeManualSection(area: string, questions: string, corpus: string): Promise<string | null> {
  const prompt = `${MANUAL_LANGUAGE_STYLE_BLOCK}

Sei Horus. Scrivi UNA sezione del manuale di BikerLink per l'area "${area}",
pensata per ISTRUIRE un altro agente AI su COSA fa l'app e COME funziona
quest'area. Prosa scorrevole in italiano, 2-4 paragrafi.

DOMANDE A CUI RISPONDERE per quest'area:
${questions}

Basati SOLO sulle note per-file qui sotto (descrizioni funzionali raccolte
leggendo il codice). Aggrega SOLO le note pertinenti a quest'area e ignora le
altre. NON elencare i file uno per uno, NON incollare codice, NON inventare
funzionalità non presenti nelle note.

AUTO-VERIFICA prima di consegnare:
✓ Hai risposto alle domande dell'area
✓ Hai descritto il flusso d'uso principale e chi usa la funzionalità
✓ Hai descritto il comportamento in caso di errore
✓ Hai citato le interazioni con altri sistemi
✓ Nomi italiani esatti di bottoni/sezioni tra virgolette
✓ Frasi complete, nessun idioma non traducibile

NOTE PER-FILE:
${corpus}

SEZIONE "${area}":`;
  const raw = await callOllamaChat(prompt, undefined, {
    persona: "horus",
    model: HORUS_MODEL_ID,
    system: HORUS_THINK_TAG_CONTRACT,
    temperature: 0.3,
    numPredict: SECTION_NUM_PREDICT,
  });
  return sanitizeManual(stripThink(raw ?? ""));
}

/** Genera un blocco del "Dizionario dell'Interfaccia — Schermata per Schermata" (step 6). */
async function writeLexiconSection(notesText: string): Promise<string | null> {
  const prompt = `${MANUAL_LANGUAGE_STYLE_BLOCK}

Sei Horus. Componi una parte del "Dizionario dell'Interfaccia — Schermata per
Schermata" del manuale di BikerLink, a partire dalle note lessicali per-schermata
qui sotto (già estratte leggendo il codice UI). Per OGNI schermata distinta
produci un blocco con questo formato ESATTO:

### [Nome schermata]
**Percorso di accesso**: come ci si arriva
**Titolo visualizzato**: testo esatto nell'header
**Tab o sezioni interne**: nome esatto di ciascuna
**Bottoni e azioni**: "Testo" → cosa succede
**Campi di input**: label e placeholder esatti
**Messaggi**: errori, toast, alert con testo esatto
**Modal e fogli**: titolo e ogni opzione/bottone

Ometti una voce se non c'è nulla per quella schermata. NON inventare testi: usa
solo ciò che trovi nelle note. Mantieni i testi UI tra virgolette in italiano.

NOTE LESSICALI PER-SCHERMATA:
${notesText}

DIZIONARIO:`;
  const raw = await callOllamaChat(prompt, undefined, {
    persona: "horus",
    model: HORUS_MODEL_ID,
    system: HORUS_THINK_TAG_CONTRACT,
    temperature: 0.3,
    numPredict: SECTION_NUM_PREDICT,
  });
  return sanitizeManual(stripThink(raw ?? ""));
}

/** Panoramica introduttiva (~400 parole) che apre il manuale (step 7). */
async function writeManualOverview(): Promise<string | null> {
  const prompt = `${MANUAL_LANGUAGE_STYLE_BLOCK}

Sei Horus. Scrivi la PANORAMICA introduttiva del manuale di BikerLink (circa 400
parole, prosa scorrevole in italiano) che apre il documento. Copri:
- Cos'è BikerLink e a chi serve (biker, zavorrine, coppie)
- Le 5 funzionalità principali (mappa live, routing moto, matching tra rider,
  proposte ed eventi, assistente AI Bowie)
- La struttura tecnica (app mobile React Native + backend Express/PostgreSQL +
  ThinkCentre self-hosted + stack AI multi-persona)
- I differenziatori rispetto ad altre app (routing curvy self-hosted, privacy con
  ghost mode e fake position, assistente AI integrato)
Frasi complete e traducibili, nessun elenco di file, nessun codice.

PANORAMICA:`;
  const raw = await callOllamaChat(prompt, undefined, {
    persona: "horus",
    model: HORUS_MODEL_ID,
    system: HORUS_THINK_TAG_CONTRACT,
    temperature: 0.4,
    numPredict: SECTION_NUM_PREDICT,
  });
  return sanitizeManual(stripThink(raw ?? ""));
}

/** Glossario di 35 termini che chiude il manuale (step 7). */
async function writeManualGlossary(corpus: string): Promise<string | null> {
  const prompt = `${MANUAL_LANGUAGE_STYLE_BLOCK}

Sei Horus. Scrivi il GLOSSARIO che chiude il manuale di BikerLink: per CIASCUNO
dei 35 termini elencati qui sotto, una voce con definizione breve (1-2 frasi) in
italiano. I nomi propri (Bowie, Horus, Nadir, Ares, Quebracho, ThinkCentre, EAS,
qwen3…) restano invariati in tutte le lingue. Formato per riga:
**Termine** — definizione.

TERMINI (35):
${GLOSSARY_TERMS}

Puoi appoggiarti a queste note tecniche per definizioni accurate (ignora ciò che
non serve, non elencare i file):
${corpus}

GLOSSARIO:`;
  const raw = await callOllamaChat(prompt, undefined, {
    persona: "horus",
    model: HORUS_MODEL_ID,
    system: HORUS_THINK_TAG_CONTRACT,
    temperature: 0.3,
    numPredict: SECTION_NUM_PREDICT,
  });
  return sanitizeManual(stripThink(raw ?? ""));
}

/** Salva un file del manuale sul TC via ai-hub (best-effort). Ritorna true se ok. */
async function hubWriteManual(fileName: string, content: string): Promise<boolean> {
  const res = await hubPost("/files/write", { path: `nadir/manuale/${fileName}`, content });
  if (!res.ok) {
    console.warn(`[horus-manual] salvataggio TC ${fileName} fallito (non-fatale): ${res.error ?? res.status}`);
  }
  return res.ok;
}

/** Legge il numero di chunk manuale indicizzati (per il log finale). */
async function readManualChunkCount(): Promise<number | null> {
  try {
    const row = await storage.getAppSetting("nadir_index_status");
    const raw = (row?.valueJson ?? row?.value) as { counts?: { manual?: number } } | undefined;
    return typeof raw?.counts?.manual === "number" ? raw.counts.manual : null;
  } catch {
    return null;
  }
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Mirror su filesystem: logs/nadir-manual-{ts}.md + logs/nadir-manual-latest.md. */
async function writeManualMirror(
  when: Date,
  iso: string,
  manualBody: string,
): Promise<{ tsPath: string | null; latestPath: string | null }> {
  try {
    await fs.mkdir(MIRROR_DIR, { recursive: true });
    const ts = `${when.getFullYear()}-${pad2(when.getMonth() + 1)}-${pad2(when.getDate())}_${pad2(when.getHours())}-${pad2(when.getMinutes())}`;
    const content = `${buildManualHeader("it", iso)}\n\n${manualBody}\n`;
    const tsPath = path.join(MIRROR_DIR, `nadir-manual-${ts}.md`);
    const latestPath = path.join(MIRROR_DIR, "nadir-manual-latest.md");
    await fs.writeFile(tsPath, content, "utf8");
    await fs.writeFile(latestPath, content, "utf8");
    return { tsPath, latestPath };
  } catch (err) {
    console.warn("[horus-manual] mirror filesystem fallito (non-fatale):", (err as Error).message);
    return { tsPath: null, latestPath: null };
  }
}

/**
 * Finalizza la modalità MANUALE (Task #152): assembla un manuale italiano ricco
 * (Panoramica → 24 sezioni funzionali → Dizionario dell'Interfaccia → Glossario),
 * lo salva sul ThinkCentre via ai-hub (storage primario) e su Replit (storage
 * secondario: nadir_manual_text + traduzioni + reindicizzazione vettoriale +
 * mirror filesystem). La traduzione vera e propria vive in ../nadir/translate.ts
 * (NON modificata) e produce le 6 lingue target; le traduzioni riuscite vengono
 * rispecchiate sul TC. Tutto il salvataggio TC è best-effort: se ai-hub è offline
 * si prosegue con Replit.
 */
export async function finalizeManualScan(store: FileScanStore): Promise<string> {
  const when = new Date();
  const iso = when.toISOString();

  // 1) Corpus funzionale (una volta) condiviso da tutte le sezioni.
  const corpus = buildFunctionalCorpus(store, SECTION_MAX_NOTES_CHARS);

  // 2) Panoramica (apre il manuale).
  const overview = await writeManualOverview();

  // 3) 24 sezioni funzionali con domande specifiche.
  const sections: string[] = [];
  for (const { title, questions } of MANUAL_AREAS) {
    const section = await writeManualSection(title, questions, corpus);
    if (section) sections.push(`## ${title}\n\n${section}`);
  }

  // 4) Dizionario dell'Interfaccia — Schermata per Schermata (dalle note lessicali).
  const lexiconChunks = chunkLexiconNotes(store, SECTION_MAX_NOTES_CHARS);
  const lexiconParts: string[] = [];
  for (const chunk of lexiconChunks) {
    const part = await writeLexiconSection(chunk);
    if (part) lexiconParts.push(part);
  }

  // 5) Glossario (chiude il manuale).
  const glossary = await writeManualGlossary(corpus);

  // 6) Assembla il corpo italiano (senza intestazione TC: quella si aggiunge per file).
  const parts: string[] = [];
  if (overview) parts.push(`## Panoramica\n\n${overview}`);
  if (sections.length > 0) parts.push(sections.join("\n\n"));
  parts.push(
    `## Dizionario dell'Interfaccia — Schermata per Schermata\n\n` +
      (lexiconParts.length > 0
        ? lexiconParts.join("\n\n")
        : "_Nessuna nota lessicale disponibile (ri-esegui una scansione completa delle schermate)._"),
  );
  if (glossary) parts.push(`## Glossario\n\n${glossary}`);
  const manualBody = parts.join("\n\n");

  // 7) Storage secondario Replit — salva l'italiano conservando la versione precedente.
  const { backedUp } = await saveNadirManualWithBackup(manualBody);

  // 8) Storage primario ThinkCentre — it.md + latest.md (best-effort).
  const hubUp = isHubAvailable();
  const tcResults: Record<string, boolean | undefined> = {};
  if (hubUp) {
    const itFile = `${buildManualHeader("it", iso)}\n\n${manualBody}`;
    tcResults.it = await hubWriteManual("it.md", itFile);
    tcResults.latest = await hubWriteManual("latest.md", itFile);
  } else {
    console.warn("[horus-manual] ai-hub non disponibile: salvataggio TC saltato (solo Replit).");
  }

  // 9) Traduzioni Replit (6 lingue) + reindicizzazione (retranslateManualNow include il reindex).
  const { translatedLangs } = await retranslateManualNow("horus-scan");
  const missingLangs = TRANSLATABLE_APP_LANGUAGES.filter((l) => !translatedLangs.includes(l));

  // 10) Rispecchia sul TC ogni traduzione riuscita (best-effort).
  if (hubUp && translatedLangs.length > 0) {
    const translations = await getNadirManualTranslations().catch(() => ({} as Record<string, { text?: string }>));
    for (const lang of translatedLangs) {
      const text = translations[lang]?.text;
      if (!text) continue;
      const file = `${buildManualHeader(lang, iso)}\n\n${text}`;
      tcResults[lang] = await hubWriteManual(`${lang}.md`, file);
    }
  }

  // 11) Mirror filesystem + conteggio chunk indicizzati.
  const mirror = await writeManualMirror(when, iso, manualBody);
  const chunkCount = await readManualChunkCount();

  // 12) Log finale esplicito (stato di ogni file TC + Replit + filesystem).
  const tcMark = (lang: string): string => {
    if (!hubUp) return "skip";
    if (tcResults[lang] === true) return "✓";
    if (tcResults[lang] === false) return "✗";
    return "—";
  };
  const tcLine = ["it", "en", "de", "es", "fr", "el", "tr", "latest"]
    .map((l) => `${l}.md ${tcMark(l)}`)
    .join(" | ");
  console.log(
    `[horus-manual] Italiano: ${manualBody.length} car, ${sections.length} sezioni.\n\n` +
      `TC agent-shared/nadir/manuale/:\n  ${tcLine}\n\n` +
      `Replit:\n  nadir_manual_text ✓ | translations ${translatedLangs.length}/${TRANSLATABLE_APP_LANGUAGES.length} | ` +
      `embeddings ${chunkCount ?? "?"} chunks\n\n` +
      `Filesystem: ${mirror.tsPath ? `logs/${path.basename(mirror.tsPath)} ✓` : "✗"} | ` +
      `${mirror.latestPath ? "nadir-manual-latest.md ✓" : "✗"}`,
  );

  return (
    `Manuale generato (${sections.length}/24 sezioni, ${lexiconParts.length} blocchi lessicali, ` +
    `${manualBody.length} caratteri) e salvato nello storage di Nadir` +
    `${backedUp ? " (versione precedente conservata)" : ""}. ` +
    `TC: ${hubUp ? "salvato via ai-hub" : "saltato (ai-hub offline)"}. ` +
    `Tradotto in ${translatedLangs.length}/${TRANSLATABLE_APP_LANGUAGES.length} lingue` +
    `${missingLangs.length > 0 ? ` (mancanti: ${missingLangs.join(", ")}, ricadono sull'italiano)` : ""}. ` +
    `Reindicizzazione inclusa${chunkCount != null ? ` (${chunkCount} chunk manuale)` : ""}. ` +
    `Mirror: ${mirror.tsPath ? path.basename(mirror.tsPath) : "non scritto"}.`
  );
}
