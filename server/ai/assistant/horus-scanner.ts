// Task #86 — Scanner autonomo a lotti di Horus (SOLO su richiesta esplicita).
//
// Due modalità on-demand basate sulla stessa lettura completa del codice locale:
//   - "analysis" → osservazioni per-file + stato integrità DB → proposte azionabili.
//   - "manual"   → descrizioni per-file → manuale testuale per area (Nadir).
//
// INVARIANTI (dal piano):
//   * NESSUN avvio automatico: nessun timer/ricorrenza. Si parte solo con
//     startHorusScan() chiamata da un trigger esplicito (azione admin o chat).
//   * Una volta avviata, la scansione prosegue DA SOLA a lotti fino a coprire
//     tutti i file pendenti, poi finalizza. Single-flight per modalità.
//   * Cede alla routing-AI (isRoutingAiBusy) come l'analisi autonoma esistente.
//   * Se Horus/Ollama non è raggiungibile, si ferma in modo PULITO segnalando
//     dove si è interrotta, senza perdere il progresso (i file già letti restano
//     nello store persistente e non vengono rianalizzati alla ripresa).
//   * SOLA LETTURA: nessuna scrittura su codice/GitHub/DB oltre alle proposte,
//     lo store dei fingerprint e il manuale (nello storage di Nadir).
import { callOllamaChat, isOllamaConfigured, isOllamaReachable } from "../../lib/ollama-client";
import { isRoutingAiBusy } from "../ai-priority-gate";
import { redactPII } from "../moderation/redact";
import { matchesSensitive } from "./security-filter";
import {
  type ScanMode,
  type FileScanStore,
  computePending,
  readAndHashFile,
  saveFileScanStore,
} from "./codebase-inventory";
import { finalizeAnalysisScan, finalizeManualScan } from "./horus-scanner-finalize";

const BATCH_SIZE = 4;
const TICK_DELAY_MS = 1500;
const ROUTING_BUSY_RETRY_MS = 8000;
const MAX_FILE_CHARS = 6000;
const NOTE_MAX = 800;
const NOTE_NUM_PREDICT = 320;

export type ScanStatus = "idle" | "running" | "completed" | "interrupted" | "error";

export interface ScanState {
  mode: ScanMode;
  status: ScanStatus;
  startedAt: number | null;
  finishedAt: number | null;
  filesTotal: number;
  filesAnalyzed: number;
  filesSkipped: number;
  filesPending: number;
  lastFile: string | null;
  lastError: { at: string; message: string } | null;
  resultSummary: string | null;
}

function initialState(mode: ScanMode): ScanState {
  return {
    mode,
    status: "idle",
    startedAt: null,
    finishedAt: null,
    filesTotal: 0,
    filesAnalyzed: 0,
    filesSkipped: 0,
    filesPending: 0,
    lastFile: null,
    lastError: null,
    resultSummary: null,
  };
}

const states: Record<ScanMode, ScanState> = {
  analysis: initialState("analysis"),
  manual: initialState("manual"),
};
const running: Record<ScanMode, boolean> = { analysis: false, manual: false };
const queues: Record<ScanMode, string[]> = { analysis: [], manual: [] };
const stores: Record<ScanMode, FileScanStore> = { analysis: {}, manual: {} };
const timers: Record<ScanMode, NodeJS.Timeout | null> = { analysis: null, manual: null };

// ── Helper testo ─────────────────────────────────────────────────────────────

/** qwen3 (Horus=qwen3:4b) può lasciare un `</think>` orfano anche con think:false. */
function stripThink(text: string): string {
  if (!text) return "";
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const orphan = out.lastIndexOf("</think>");
  if (orphan !== -1) out = out.slice(orphan + "</think>".length);
  return out.trim();
}

function sanitizeNote(text: string): string {
  const clean = redactPII((text ?? "").trim()).trim();
  if (!clean) return "";
  if (matchesSensitive(clean)) return "";
  return clean.length > NOTE_MAX ? clean.slice(0, NOTE_MAX) : clean;
}

function buildAnalysisFilePrompt(rel: string, content: string): string {
  return `Sei Horus, in modalità ANALISI CODICE (SOLA LETTURA) dell'app BikerLink. Esamina questo file sorgente ed elenca in modo CONCISO (max 5 punti, italiano) SOLO problemi concreti: bug potenziali, rischi, incongruenze, code smell o possibili miglioramenti. Se non trovi nulla di rilevante rispondi ESATTAMENTE "OK". Non inventare, non riscrivere il codice, non proporre scritture dirette.

FILE: ${rel}
\`\`\`
${content.slice(0, MAX_FILE_CHARS)}
\`\`\`

OSSERVAZIONI:`;
}

function buildManualFilePrompt(rel: string, content: string): string {
  return `Sei Horus, in modalità MANUALE (SOLA LETTURA) dell'app BikerLink. In 2-4 frasi in italiano, descrivi COSA fa questo file e a quale FUNZIONALITÀ/AREA dell'app contribuisce, pensando a istruire un altro agente AI. Niente codice, niente elenco di funzioni: solo il ruolo funzionale. Se il file è puramente tecnico/di supporto senza una funzionalità utente, dillo in una frase.

FILE: ${rel}
\`\`\`
${content.slice(0, MAX_FILE_CHARS)}
\`\`\`

DESCRIZIONE:`;
}

// ── Avvio (SOLO esplicito) ────────────────────────────────────────────────────

export interface StartResult {
  started: boolean;
  reason?: string;
  status: ScanState;
}

/**
 * Avvia una scansione. NON è mai chiamata da un timer: solo da un trigger
 * esplicito. Se già in corso, o se Ollama non è configurato/raggiungibile,
 * non parte e spiega perché.
 */
export async function startHorusScan(mode: ScanMode): Promise<StartResult> {
  if (running[mode]) {
    return { started: false, reason: "scansione già in corso", status: { ...states[mode] } };
  }
  if (!isOllamaConfigured) {
    return { started: false, reason: "Ollama non configurato", status: { ...states[mode] } };
  }
  if (!(await isOllamaReachable("horus").catch(() => false))) {
    return {
      started: false,
      reason: "Horus (Ollama) non raggiungibile — riprova quando il ThinkCentre è online",
      status: { ...states[mode] },
    };
  }

  let comp: Awaited<ReturnType<typeof computePending>>;
  try {
    comp = await computePending(mode);
  } catch (err) {
    return {
      started: false,
      reason: `impossibile costruire l'inventario: ${(err as Error).message}`,
      status: { ...states[mode] },
    };
  }

  stores[mode] = comp.store;
  queues[mode] = [...comp.pending];
  states[mode] = {
    mode,
    status: "running",
    startedAt: Date.now(),
    finishedAt: null,
    filesTotal: comp.files.length,
    filesAnalyzed: 0,
    filesSkipped: comp.unchanged,
    filesPending: comp.pending.length,
    lastFile: null,
    lastError: null,
    resultSummary: null,
  };
  running[mode] = true;

  console.log(
    `[horus-scan:${mode}] avviata — ${comp.pending.length} file da leggere, ` +
      `${comp.unchanged} invariati saltati (${comp.files.length} totali)`,
  );

  if (comp.pending.length === 0) {
    // Niente di cambiato: finalizza subito usando lo store esistente.
    void runFinalize(mode);
  } else {
    scheduleTick(mode, 0);
  }

  return { started: true, status: { ...states[mode] } };
}

// ── Ciclo a lotti autonomo ────────────────────────────────────────────────────

function scheduleTick(mode: ScanMode, delay = TICK_DELAY_MS): void {
  if (timers[mode]) clearTimeout(timers[mode]!);
  const t = setTimeout(() => {
    void runTick(mode);
  }, delay);
  t.unref?.();
  timers[mode] = t;
}

function interrupt(mode: ScanMode, message: string): void {
  running[mode] = false;
  if (timers[mode]) {
    clearTimeout(timers[mode]!);
    timers[mode] = null;
  }
  const s = states[mode];
  s.status = "interrupted";
  s.finishedAt = Date.now();
  s.lastError = { at: new Date().toISOString(), message };
  s.resultSummary =
    `Scansione interrotta dopo ${s.filesAnalyzed} file: ${message}. ` +
    `Il progresso è salvato: una nuova richiesta esplicita riprende senza rianalizzare i file già letti.`;
  console.warn(`[horus-scan:${mode}] interrotta: ${message}`);
}

/** Processa un singolo file. Ritorna "interrupt" se Ollama è irraggiungibile. */
async function processFile(mode: ScanMode, rel: string): Promise<"ok" | "interrupt"> {
  const read = await readAndHashFile(rel);
  if (!read) return "ok"; // file sparito nel frattempo: salta
  const prompt =
    mode === "analysis"
      ? buildAnalysisFilePrompt(rel, read.content)
      : buildManualFilePrompt(rel, read.content);
  try {
    const raw = await callOllamaChat(prompt, undefined, {
      persona: "horus",
      temperature: mode === "analysis" ? 0.2 : 0.3,
      numPredict: NOTE_NUM_PREDICT,
    });
    stores[mode][rel] = {
      hash: read.hash,
      note: sanitizeNote(stripThink(raw ?? "")),
      at: new Date().toISOString(),
    };
    return "ok";
  } catch (err) {
    // Se Ollama è caduto → interruzione pulita (progresso già persistito a lotti).
    const reachable = await isOllamaReachable("horus").catch(() => false);
    if (!reachable) return "interrupt";
    // Errore transitorio ma Ollama vivo: marca nota vuota per non ciclare e prosegui.
    stores[mode][rel] = { hash: read.hash, note: "", at: new Date().toISOString() };
    console.warn(`[horus-scan:${mode}] lettura file fallita (proseguo): ${rel}: ${(err as Error).message}`);
    return "ok";
  }
}

async function runTick(mode: ScanMode): Promise<void> {
  if (!running[mode]) return;

  // Probe Ollama a ogni tick: interruzione pulita se irraggiungibile.
  if (!(await isOllamaReachable("horus").catch(() => false))) {
    interrupt(mode, "Horus (Ollama) non raggiungibile durante la scansione");
    return;
  }

  // Priorità alla routing-AI: se occupata, riprova più tardi senza consumare batch.
  if (isRoutingAiBusy()) {
    scheduleTick(mode, ROUTING_BUSY_RETRY_MS);
    return;
  }

  const batch = queues[mode].splice(0, BATCH_SIZE);
  for (const rel of batch) {
    if (!running[mode]) return;
    const outcome = await processFile(mode, rel);
    if (outcome === "interrupt") {
      await saveFileScanStore(mode, stores[mode]).catch(() => {});
      interrupt(mode, "Horus non raggiungibile a metà scansione");
      return;
    }
    states[mode].filesAnalyzed++;
    states[mode].lastFile = rel;
  }
  states[mode].filesPending = queues[mode].length;

  // Persisti lo store dopo ogni lotto (durabilità del progresso).
  await saveFileScanStore(mode, stores[mode]).catch(() => {});

  if (queues[mode].length === 0) {
    await runFinalize(mode);
  } else {
    scheduleTick(mode);
  }
}

async function runFinalize(mode: ScanMode): Promise<void> {
  try {
    // Persisti lo store un'ultima volta prima della sintesi.
    await saveFileScanStore(mode, stores[mode]).catch(() => {});
    const summary =
      mode === "analysis"
        ? await finalizeAnalysisScan(stores.analysis, states.analysis.filesTotal, states.analysis.filesSkipped)
        : await finalizeManualScan(stores.manual);
    states[mode].resultSummary = summary;
    states[mode].status = "completed";
  } catch (err) {
    states[mode].status = "error";
    states[mode].lastError = {
      at: new Date().toISOString(),
      message: (err as Error).message?.slice(0, 300) ?? "errore sconosciuto",
    };
    console.error(`[horus-scan:${mode}] finalizzazione fallita:`, err);
  } finally {
    states[mode].finishedAt = Date.now();
    running[mode] = false;
    if (timers[mode]) {
      clearTimeout(timers[mode]!);
      timers[mode] = null;
    }
    console.log(`[horus-scan:${mode}] terminata (status=${states[mode].status})`);
  }
}

// ── Lettura stato ──────────────────────────────────────────────────────────────

export function getHorusScanStatus(mode: ScanMode): ScanState {
  return { ...states[mode] };
}

export function getAllHorusScanStatus(): Record<ScanMode, ScanState> {
  return { analysis: { ...states.analysis }, manual: { ...states.manual } };
}

/** Riassunto testuale dello stato di entrambe le scansioni (per chat/pannello). */
export function formatScanStatusText(): string {
  const line = (s: ScanState, label: string): string => {
    const base = `${label}: ${s.status}`;
    if (s.status === "idle") return `${base} (mai avviata in questa sessione).`;
    const prog = `${s.filesAnalyzed}/${s.filesPending + s.filesAnalyzed} file letti, ${s.filesSkipped} invariati saltati`;
    const detail = s.resultSummary ? ` — ${s.resultSummary}` : "";
    const err = s.lastError && s.status !== "completed" ? ` [errore: ${s.lastError.message}]` : "";
    return `${base} (${prog})${detail}${err}`;
  };
  return [
    line(states.analysis, "Analisi codice+DB"),
    line(states.manual, "Generazione manuale"),
  ].join("\n");
}

// ── Riconoscimento intento in chat (Bowie/Horus) ──────────────────────────────

/**
 * Riconosce nel messaggio grezzo dell'admin la richiesta di avviare una delle
 * due scansioni complete. Ritorna la modalità o null. Distingue dal semplice
 * "analizza X" perché richiede esplicitamente lo SCOPE dell'intera app + codice.
 */
export function detectHorusScanRequest(message: string): { mode: ScanMode } | null {
  const m = (message ?? "").toLowerCase();
  if (!m.trim()) return null;

  // MANUALE: parola-chiave "manuale" + verbo di produzione, oppure "leggi l'app...manuale".
  const wantsManual =
    /\bmanuale\b/.test(m) &&
    /(produ|gener|scriv|aggiorn|redig|crea|compon|prepar|fai|leggi)/.test(m);
  if (wantsManual) return { mode: "manual" };

  // ANALISI: verbo di analisi + oggetto codice/db + scope completo/intera app.
  const wantsAnalysisVerb = /(analisi|analizz|revision|rivedi|passa\s+in\s+rassegna|scansion|studia|esamin)/.test(m);
  const mentionsCodeOrDb = /(codice|codebase|\bdb\b|database|schema)/.test(m);
  const fullScope = /(complet|inter[oa]|tutt[oa]|whole|dell'app|dell'?intera|codebase)/.test(m);
  if (wantsAnalysisVerb && mentionsCodeOrDb && fullScope) return { mode: "analysis" };

  return null;
}
