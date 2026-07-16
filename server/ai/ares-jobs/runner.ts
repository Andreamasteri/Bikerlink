/**
 * Ares Jobs — runner autonomo in background (Task #87).
 *
 * Espone start/stop/status per i due job long-running di Ares (analisi codice+DB
 * e generazione manuale). Ogni job, una volta avviato SU RICHIESTA ESPLICITA,
 * scorre da solo tutti i chunk di file (e, per l'analisi, il riferimento di
 * integrità DB), chiama Ares in modalità diagnostica, salva i risultati man mano
 * e persiste l'avanzamento. Nessun timer, nessuna schedulazione: parte solo da
 * qui, invocato dal pannello admin, da un'azione admin o da Bowie in chat.
 *
 * Garanzie:
 *  • un solo job per modalità alla volta (single-flight in-process);
 *  • se Ares non è raggiungibile il job FALLISCE con messaggio chiaro (no hang);
 *  • priorità alla chat interattiva (waitForAresIdle prima di ogni chunk);
 *  • nessuna auto-ripresa dopo un riavvio: serve una nuova richiesta esplicita.
 *
 * Ares resta SOLA LETTURA: l'unica scrittura è il manuale nello storage di Nadir.
 */

import { streamAresChat, isAresConfigured, getAresModelId } from "../../lib/ares-client";
import { withAresVramPriority } from "../../lib/vram-arbiter";
import { hubPost, isHubAvailable } from "../../lib/ai-hub-client";
import {
  saveNadirManualWithBackup,
  reindexNadir,
  runNadirSearchHealthProbe,
} from "../nadir";
import {
  ARES_JOB_LOG_PREFIX,
  ARES_CALL_TIMEOUT_MS,
  NUM_PREDICT_ANALYSIS,
  NUM_PREDICT_MANUAL,
  NUM_PREDICT_SYNTHESIS,
  MAX_ACCUM_CHARS,
  MAX_FINDING_CHARS,
  MAX_SECTION_CHARS,
  MANUAL_MAX_CHARS,
  type AresJobMode,
} from "./constants";
import {
  buildAresFileInventory,
  groupIntoChunks,
  readChunkContent,
  type AresChunk,
} from "./inventory";
import {
  readJobState,
  writeJobState,
  emptyState,
  isStaleRunning,
  type AresJobState,
  type AresJobTrigger,
} from "./state";
import { waitForAresIdle } from "./priority-gate";
import {
  sanitizeAresText,
  getDbIntegrityReference,
  analysisSystemPrompt,
  analysisChunkUserPrompt,
  analysisSynthesisPrompt,
  manualSystemPrompt,
  manualChunkUserPrompt,
} from "./prompts";

// ── Single-flight in-process ───────────────────────────────────────────────────
interface RunningHandle {
  abort: AbortController;
}
const running: Record<AresJobMode, RunningHandle | null> = {
  analysis: null,
  manual: null,
};

export interface StartResult {
  started: boolean;
  reason?: string;
  mode: AresJobMode;
}

/** Etichetta leggibile della modalità (messaggi/log). */
function modeLabel(mode: AresJobMode): string {
  return mode === "analysis" ? "analisi codice+DB" : "generazione manuale";
}

/**
 * Avvia un job Ares SU RICHIESTA ESPLICITA. Idempotente per modalità: se un job
 * della stessa modalità è già in corso, non ne parte un altro. Se Ares non è
 * configurato/raggiungibile come destinazione, fallisce subito con messaggio
 * chiaro. Il loop gira in background (fire-and-forget); lo stato è consultabile
 * via getAresJobStatus.
 */
export async function startAresJob(
  mode: AresJobMode,
  opts: { trigger: AresJobTrigger; startedBy?: string | null },
): Promise<StartResult> {
  if (running[mode]) {
    return { started: false, reason: `Un job di ${modeLabel(mode)} è già in corso.`, mode };
  }
  if (!isAresConfigured) {
    return {
      started: false,
      reason: "Ares non è configurato (PC fisso non raggiungibile). Riprova quando è online.",
      mode,
    };
  }

  const abort = new AbortController();
  running[mode] = { abort };

  const state = emptyState(mode);
  state.status = "running";
  state.startedAt = new Date().toISOString();
  state.trigger = opts.trigger;
  state.startedBy = opts.startedBy ?? null;
  state.model = getAresModelId();
  await writeJobState(state);

  console.log(
    `${ARES_JOB_LOG_PREFIX} avviato job "${mode}" (${modeLabel(mode)}) trigger=${opts.trigger}`,
  );

  // Fire-and-forget: il loop procede da solo fino al completamento.
  void runLoop(mode, state, abort.signal)
    .catch(async (err) => {
      await failJob(mode, (err as Error)?.message ?? "errore sconosciuto");
    })
    .finally(() => {
      running[mode] = null;
    });

  return { started: true, mode };
}

/** Interrompe un job in corso (annulla il loop; lo stato passa a "interrupted"). */
export async function stopAresJob(mode: AresJobMode): Promise<boolean> {
  const handle = running[mode];
  if (!handle) return false;
  handle.abort.abort();
  running[mode] = null;
  const state = (await readJobState(mode)) ?? emptyState(mode);
  if (state.status === "running") {
    state.status = "interrupted";
    state.error = "Job interrotto manualmente.";
    await writeJobState(state);
  }
  console.log(`${ARES_JOB_LOG_PREFIX} job "${mode}" interrotto manualmente`);
  return true;
}

async function failJob(mode: AresJobMode, message: string): Promise<void> {
  const state = (await readJobState(mode)) ?? emptyState(mode);
  state.status = "failed";
  state.error = message;
  await writeJobState(state);
  console.error(`${ARES_JOB_LOG_PREFIX} job "${mode}" fallito: ${message}`);
}

// ── Stato consultabile ─────────────────────────────────────────────────────────
export interface AresJobStatusView extends AresJobState {
  /** true se il loop è vivo in questo processo in questo momento. */
  liveInProcess: boolean;
}

/**
 * Stato del job consultabile mentre gira (senza tenere aperta la chat). Se lo
 * stato persistito è "running" ma nessun loop è vivo (es. riavvio del processo) e
 * risulta stantio, viene riportato come "interrupted": la ripresa richiede una
 * nuova richiesta esplicita.
 */
export async function getAresJobStatus(mode: AresJobMode): Promise<AresJobStatusView> {
  const state = (await readJobState(mode)) ?? emptyState(mode);
  const liveInProcess = Boolean(running[mode]);
  if (!liveInProcess && isStaleRunning(state)) {
    state.status = "interrupted";
    state.error = state.error ?? "Job interrotto (processo riavviato). Serve una nuova richiesta.";
  }
  return { ...state, liveInProcess };
}

export async function getAllAresJobStatuses(): Promise<Record<AresJobMode, AresJobStatusView>> {
  const [analysis, manual] = await Promise.all([
    getAresJobStatus("analysis"),
    getAresJobStatus("manual"),
  ]);
  return { analysis, manual };
}

// ── Loop principale ────────────────────────────────────────────────────────────
async function runLoop(
  mode: AresJobMode,
  state: AresJobState,
  signal: AbortSignal,
): Promise<void> {
  const inventory = buildAresFileInventory();
  const chunks = groupIntoChunks(inventory);
  state.totalFiles = inventory.length;
  state.totalChunks = chunks.length;
  await writeJobState(state);

  // Riferimento integrità DB (solo per l'analisi), letto una volta.
  const dbRef = mode === "analysis" ? await getDbIntegrityReference() : null;

  const model = getAresModelId();

  for (let i = state.cursor; i < chunks.length; i++) {
    if (signal.aborted) return; // stopAresJob ha già scritto "interrupted"
    // Cede la precedenza alle consultazioni interattive di Ares.
    await waitForAresIdle(signal);
    if (signal.aborted) return;

    const chunk = chunks[i];
    const codeText = readChunkContent(chunk.files);
    const out = await callAresForChunk(mode, model, codeText, i === 0 ? dbRef : null, signal);
    const clean = sanitizeAresText(
      out,
      mode === "analysis" ? MAX_FINDING_CHARS : MAX_SECTION_CHARS,
    );

    accumulate(state, chunk, clean);
    state.cursor = i + 1;
    state.processedFiles += chunk.files.length;
    await writeJobState(state);
  }

  if (signal.aborted) return;
  await finalize(mode, state, model, signal);
}

async function callAresForChunk(
  mode: AresJobMode,
  model: string,
  codeText: string,
  dbRef: string | null,
  signal: AbortSignal,
): Promise<string> {
  const system = mode === "analysis" ? analysisSystemPrompt() : manualSystemPrompt();
  const user =
    mode === "analysis"
      ? analysisChunkUserPrompt(codeText, dbRef)
      : manualChunkUserPrompt(codeText);
  const numPredict = mode === "analysis" ? NUM_PREDICT_ANALYSIS : NUM_PREDICT_MANUAL;

  const { text } = await withAresVramPriority(model, () =>
    streamAresChat({
      system,
      messages: [{ role: "user", content: user }],
      timeoutMs: ARES_CALL_TIMEOUT_MS,
      numPredict,
      signal,
    }),
  );
  return text;
}

function accumulate(state: AresJobState, chunk: AresChunk, clean: string): void {
  if (!clean) return;
  if (state.mode === "analysis") {
    state.findings = state.findings ?? [];
    if (totalChars(state.findings) < MAX_ACCUM_CHARS) {
      state.findings.push(`### Lotto ${chunk.index + 1} (${chunk.files.length} file)\n${clean}`);
    }
  } else {
    state.sections = state.sections ?? [];
    if (totalChars(state.sections) < MAX_ACCUM_CHARS) {
      state.sections.push(clean);
    }
  }
}

function totalChars(arr: string[]): number {
  return arr.reduce((sum, s) => sum + s.length, 0);
}

// ── Salvataggio report sull'ai-hub (non-fatale) ────────────────────────────────

/**
 * Scrive il report finale sull'ai-hub TC (~/agent-shared/ares/<mode>-<date>.md).
 * Best-effort: qualsiasi errore viene loggato ma non rilancia e non marca il job
 * come fallito. Hub non disponibile → warning e ritorno senza tentare la rete.
 *
 * Restituisce il path relativo scritto (es. "ares/analysis-2026-07-16.md"), o null
 * se la scrittura non è avvenuta.
 */
async function saveReportToHub(mode: AresJobMode, content: string): Promise<string | null> {
  if (!isHubAvailable()) {
    console.warn(`${ARES_JOB_LOG_PREFIX} hub non disponibile — report "${mode}" non salvato su TC`);
    return null;
  }
  if (!content.trim()) {
    console.warn(`${ARES_JOB_LOG_PREFIX} report "${mode}" vuoto — skip salvataggio hub`);
    return null;
  }

  // Genera un filename sicuro con la data di oggi (UTC).
  const dateTag = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const hubPath = `ares/${mode}-${dateTag}.md`;

  try {
    const res = await hubPost("/files/write", { path: hubPath, content });
    if (res.ok) {
      console.log(`${ARES_JOB_LOG_PREFIX} report "${mode}" salvato su hub: "${hubPath}"`);
      return hubPath;
    } else {
      console.warn(
        `${ARES_JOB_LOG_PREFIX} salvataggio hub fallito per "${mode}" (non-fatale): ${res.error ?? `HTTP ${res.status}`}`,
      );
      return null;
    }
  } catch (err) {
    console.warn(
      `${ARES_JOB_LOG_PREFIX} salvataggio hub eccezione per "${mode}" (non-fatale): ${(err as Error)?.message ?? String(err)}`,
    );
    return null;
  }
}

// ── Finalizzazione ─────────────────────────────────────────────────────────────
async function finalize(
  mode: AresJobMode,
  state: AresJobState,
  model: string,
  signal: AbortSignal,
): Promise<void> {
  let reportContent: string;
  if (mode === "analysis") {
    await finalizeAnalysis(state, model, signal);
    reportContent = state.report ?? "";
  } else {
    reportContent = await finalizeManual(state);
  }

  // Salva il report sull'hub TC (non-fatale: il job è comunque completato).
  const hubPath = await saveReportToHub(mode, reportContent);
  if (hubPath) {
    state.hubFilePath = hubPath;
    state.hubFileSavedAt = new Date().toISOString();
  }

  state.status = "completed";
  state.completedAt = new Date().toISOString();
  await writeJobState(state);
  console.log(`${ARES_JOB_LOG_PREFIX} job "${mode}" completato`);
}

async function finalizeAnalysis(
  state: AresJobState,
  model: string,
  signal: AbortSignal,
): Promise<void> {
  const findings = (state.findings ?? []).join("\n\n");
  if (!findings.trim()) {
    state.report = "Nessuna osservazione rilevante prodotta dall'analisi.";
    return;
  }
  // Sintesi finale orientata all'azione. La lista appunti è troncata per stare
  // nel contesto della chiamata di sintesi.
  const truncated = findings.length > 24_000 ? findings.slice(0, 24_000) : findings;
  try {
    const { text } = await withAresVramPriority(model, () =>
      streamAresChat({
        system: analysisSystemPrompt(),
        messages: [{ role: "user", content: analysisSynthesisPrompt(truncated) }],
        timeoutMs: ARES_CALL_TIMEOUT_MS,
        numPredict: NUM_PREDICT_SYNTHESIS,
        signal,
      }),
    );
    const synthesis = sanitizeAresText(text, MAX_ACCUM_CHARS);
    state.report =
      (synthesis || "(sintesi non disponibile)") +
      "\n\n---\nAppunti per lotto:\n" +
      findings;
  } catch {
    // La sintesi è best-effort: se Ares cade sul finale, conserva gli appunti.
    state.report = "Sintesi finale non disponibile (Ares irraggiungibile a fine job).\n\n" + findings;
  }
}

/** Restituisce il testo del manuale assemblato, dopo averlo salvato su Nadir. */
async function finalizeManual(state: AresJobState): Promise<string> {
  const sections = state.sections ?? [];
  const header =
    `# Manuale BikerLink (generato da Ares)\n\n` +
    `_Documento generato automaticamente leggendo l'intera app. Organizzato per funzionalità, ` +
    `pensato per istruire gli agenti AI. Sola lettura: nessuna modifica al codice o al DB._\n\n`;
  let manual = header + sections.join("\n\n");
  if (manual.length > MANUAL_MAX_CHARS) manual = manual.slice(0, MANUAL_MAX_CHARS);

  // Salva nello storage del manuale di Nadir, archiviando la versione precedente.
  const { previous } = await saveNadirManualWithBackup(manual);
  state.manualLength = manual.length;
  state.previousManualLength = previous ? previous.text.length : null;

  // Reindicizza così diventa subito ricercabile semanticamente da Nadir.
  try {
    await reindexNadir("manual");
    await runNadirSearchHealthProbe("manual");
    state.reindexed = true;
  } catch (err) {
    state.reindexed = false;
    console.error(
      `${ARES_JOB_LOG_PREFIX} reindicizzazione Nadir fallita dopo la generazione manuale: ${(err as Error)?.message}`,
    );
  }

  return manual;
}
