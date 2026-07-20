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
import { AGENT_MODEL_DEFAULTS } from "../../lib/agent-constants";
import { isRoutingAiBusy } from "../ai-priority-gate";
import { redactPII } from "../moderation/redact";
import { matchesSensitive } from "./security-filter";
import { storage } from "../../storage";
import {
  type ScanMode,
  type FileScanStore,
  computePending,
  readAndHashFile,
  saveFileScanStore,
  loadI18nDictionary,
  isLexiconEligible,
  HORUS_THINK_TAG_CONTRACT,
  MANUAL_LANGUAGE_STYLE_BLOCK,
} from "./codebase-inventory";
import { finalizeAnalysisScan } from "./horus-scanner-finalize";
import { finalizeManualScan } from "./horus-scanner-finalize-manual";
import {
  buildSecurityFilePrompt,
  SECURITY_NOTE_NUM_PREDICT,
  finalizeSecurityScan,
} from "./horus-scanner-security";

// Chiave app_settings usata per persistere lo stato della scan manuale tra restart.
const MANUAL_STATE_KEY = "horus_scan_manual_state";

const BATCH_SIZE = 4;
const TICK_DELAY_MS = 1500;
const ROUTING_BUSY_RETRY_MS = 8000;
const MAX_FILE_CHARS = 6000;
// Task #152 — La nota per-file del manuale è ora più ricca (descrizione
// funzionale in 4-7 frasi + nota lessicale con testi UI esatti), quindi il tetto
// di caratteri per nota è più alto di quello dell'analisi.
const NOTE_MAX = 2000;
// Vincolo operativo: timeout Cloudflare = 100s, GTX 1070 ~27 tok/s → max ~700
// token/call (~26s). Con 4000 tok ogni call durava ~148s (timeout CF garantito);
// con 700 la cold scan (2233 file × 2 call) scende a ~20-25 min invece di 102h.
// Non alzare oltre 700 senza aver misurato la latenza live sul ThinkCentre.
const NOTE_NUM_PREDICT = 700;

// `persona: "horus"` in callOllamaChat sceglie SOLO l'endpoint (URL/token), NON il
// modello: senza `model` esplicito la chiamata ricade su BOWIE_OLLAMA_MODEL (il
// modello di Bowie, più piccolo). Le scansioni devono girare sul modello di Horus
// (qwen3:4b) come tutti gli altri consult persona-specifici (inter-agent, group,
// proposer). Vedi memory: inter-agent-consult-model-mismatch.
const HORUS_MODEL_ID = process.env.HORUS_OLLAMA_MODEL?.trim() || AGENT_MODEL_DEFAULTS.horus;

export type ScanStatus = "idle" | "running" | "resuming" | "completed" | "interrupted" | "error";

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
  security: initialState("security"),
};

// ── Persistenza stato scan manuale (solo "manual") ────────────────────────────

/**
 * Serializza lo stato corrente della scan manuale in app_settings.
 * Fire-and-forget: gli errori DB non bloccano la scan.
 */
async function persistManualState(): Promise<void> {
  try {
    const s = states.manual;
    const payload = {
      status: s.status,
      filesAnalyzed: s.filesAnalyzed,
      filesSkipped: s.filesSkipped,
      filesPending: s.filesPending,
      filesTotal: s.filesTotal,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      lastFile: s.lastFile,
    };
    await storage.upsertAppSetting(MANUAL_STATE_KEY, undefined, payload);
  } catch (err) {
    console.warn("[horus-scan:manual] persistManualState fallita (non-fatal):", (err as Error).message);
  }
}

/**
 * Al boot (post-READY), controlla se la scan manuale era in corso al momento
 * dell'ultimo restart. Se sì, la riavvia automaticamente.
 * Chiamata solo da runPostReady() in boot-sequence.ts.
 */
export async function tryAutoResumeManualScan(): Promise<void> {
  try {
    const row = await storage.getAppSetting(MANUAL_STATE_KEY);
    if (!row?.valueJson) return;

    const saved = row.valueJson as {
      status?: string;
      finishedAt?: number | null;
    };

    // Riprendi solo se era in esecuzione e non aveva finito.
    if (saved.status !== "running" || saved.finishedAt != null) return;

    console.log("[horus-scan:manual] stato 'running' trovato al boot — ripresa automatica in corso...");

    // Segnala "resuming" nell'in-memory state così l'admin vede il feedback.
    states.manual = {
      ...states.manual,
      status: "resuming",
      startedAt: (saved as { startedAt?: number | null }).startedAt ?? null,
    };

    // Avvia la scan; startHorusScan sovrascriverà lo stato con "running" e
    // userà la cache SHA-256 per saltare i file già processati.
    const result = await startHorusScan("manual");
    if (!result.started) {
      console.warn(`[horus-scan:manual] ripresa automatica non avviata: ${result.reason ?? "motivo sconosciuto"}`);
      // Ripristina lo stato a "interrupted" così non ritenterà al prossimo boot.
      states.manual.status = "interrupted";
      await persistManualState();
    } else {
      console.log("[horus-scan:manual] ripresa automatica avviata con successo.");
    }
  } catch (err) {
    console.warn("[horus-scan:manual] tryAutoResumeManualScan fallita (non-fatal):", (err as Error).message);
  }
}
// Task #152 — Dizionario i18n caricato UNA sola volta all'avvio della scansione
// MANUALE e riusato dai prompt lessicali di ogni schermata (evita di rileggerlo
// per-file). Vuoto per le modalità analisi e security (che non lo usano).
let manualI18nDict = "";
const running: Record<ScanMode, boolean> = { analysis: false, manual: false, security: false };
const queues: Record<ScanMode, string[]> = { analysis: [], manual: [], security: [] };
const stores: Record<ScanMode, FileScanStore> = { analysis: {}, manual: {}, security: {} };
const timers: Record<ScanMode, NodeJS.Timeout | null> = { analysis: null, manual: null, security: null };

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

/**
 * Task #152 — Prompt per-file FUNZIONALE (sostituisce il vecchio
 * buildManualFilePrompt). Oltre al blocco lingua, dà a Horus il contesto completo
 * di com'è fatta BikerLink e chiede una descrizione funzionale ricca.
 */
export function buildManualFunctionalPrompt(rel: string, content: string): string {
  return `${MANUAL_LANGUAGE_STYLE_BLOCK}

Sei Horus, in modalità MANUALE (SOLA LETTURA) dell'app BikerLink.

CONTESTO BIKERLINK (com'è fatta l'app):
- App mobile per motociclisti sviluppata in React Native (Expo).
- Pianificazione percorsi (routing) self-hosted sul ThinkCentre con GraphHopper e Valhalla.
- Stack AI multi-persona: Bowie (assistente utenti), Horus (routing e analisi codice),
  Nadir (ricerca semantica/RAG), Ares (diagnostica), Horus (coordinamento job).
- Backend Express + Drizzle ORM + PostgreSQL.
- Aggiornamenti dell'app distribuiti via OTA con EAS.

COMPITO:
In 4-7 frasi in italiano, descrivi il ruolo FUNZIONALE di questo file per
istruire un altro agente AI: COSA fa, CHI lo usa, il FLUSSO principale, il
COMPORTAMENTO in caso di errore e le INTERAZIONI critiche con altri moduli.
Niente codice, niente elenco di funzioni. Se il file è puramente tecnico/di
supporto senza una funzionalità utente, dillo in UNA sola frase.

FILE: ${rel}
\`\`\`
${content.slice(0, MAX_FILE_CHARS)}
\`\`\`

DESCRIZIONE:`;
}

/**
 * Task #152 — Prompt per-file LESSICALE (solo schermate/componenti UI). Con il
 * dizionario i18n, Horus risolve ogni `t("chiave")` nel label italiano esatto e
 * documenta l'interfaccia della schermata (titolo, tab, bottoni, campi, messaggi,
 * modal, voci di menu) con i testi precisi.
 */
export function buildManualLexiconPrompt(rel: string, content: string, i18nDict: string): string {
  return `${MANUAL_LANGUAGE_STYLE_BLOCK}

Sei Horus, in modalità MANUALE LESSICALE (SOLA LETTURA) dell'app BikerLink.
Documenti l'interfaccia utente ESATTA di questa schermata/componente, così che un
altro agente AI possa dire all'utente il testo preciso di ogni elemento.

DIZIONARIO I18N (chiave=valore — risolvi OGNI t("chiave") con il valore italiano):
${i18nDict}

Per questa schermata produci in italiano SOLO le voci effettivamente presenti nel file:
- **TITOLO SCHERMATA** — il testo dell'header risolto dal dizionario i18n
- **TAB / SEZIONI INTERNE** — il nome esatto di ciascuna
- **BOTTONI E AZIONI** — "Testo esatto" → cosa succede (1 frase)
- **CAMPI DI INPUT** — label e placeholder esatti
- **MESSAGGI** — errori, toast, alert con testo esatto
- **MODAL E BOTTOM SHEET** — titolo e ogni opzione/bottone
- **VOCI DI MENU** — ogni voce con testo esatto

Se una chiave i18n non è nel dizionario, riportala come [chiave.non.trovata].
NON inventare testi: usa solo ciò che risolvi dal dizionario o trovi nel file.

FILE: ${rel}
\`\`\`
${content.slice(0, MAX_FILE_CHARS)}
\`\`\`

DIZIONARIO DELL'INTERFACCIA:`;
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

  // Task #152 — Carica il dizionario i18n UNA sola volta per scansione manuale,
  // così i prompt lessicali per-schermata risolvono i label italiani esatti.
  if (mode === "manual") {
    manualI18nDict = await loadI18nDictionary().catch((err) => {
      console.warn(`[horus-scan:manual] dizionario i18n non caricato (proseguo senza): ${(err as Error).message}`);
      return "";
    });
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
  // Persisti lo stato finale nel DB così il prossimo boot non la rilancia.
  if (mode === "manual") void persistManualState();
}

/** Processa un singolo file. Ritorna "interrupt" se Ollama è irraggiungibile. */
async function processFile(mode: ScanMode, rel: string): Promise<"ok" | "interrupt"> {
  const read = await readAndHashFile(rel);
  if (!read) return "ok"; // file sparito nel frattempo: salta
  try {
    if (mode === "analysis") {
      const raw = await callOllamaChat(buildAnalysisFilePrompt(rel, read.content), undefined, {
        persona: "horus",
        model: HORUS_MODEL_ID,
        system: HORUS_THINK_TAG_CONTRACT,
        temperature: 0.2,
        numPredict: NOTE_NUM_PREDICT,
      });
      stores[mode][rel] = {
        hash: read.hash,
        note: sanitizeNote(stripThink(raw ?? "")),
        at: new Date().toISOString(),
      };
      return "ok";
    }

    // Task #683 — Modalità SECURITY: prompt focalizzato su vulnerabilità,
    // numPredict = 700 (stesso vincolo CF 100s / GTX 1070 ~27 tok/s).
    if (mode === "security") {
      const raw = await callOllamaChat(buildSecurityFilePrompt(rel, read.content), undefined, {
        persona: "horus",
        model: HORUS_MODEL_ID,
        system: HORUS_THINK_TAG_CONTRACT,
        temperature: 0.1,
        numPredict: SECURITY_NOTE_NUM_PREDICT,
      });
      stores[mode][rel] = {
        hash: read.hash,
        note: sanitizeNote(stripThink(raw ?? "")),
        at: new Date().toISOString(),
      };
      return "ok";
    }

    // Modalità MANUALE: nota FUNZIONALE per ogni file (Task #152, step 3) e, solo
    // per le schermate/componenti UI, una nota LESSICALE separata (step 4).
    const rawFn = await callOllamaChat(buildManualFunctionalPrompt(rel, read.content), undefined, {
      persona: "horus",
      model: HORUS_MODEL_ID,
      system: HORUS_THINK_TAG_CONTRACT,
      temperature: 0.3,
      numPredict: NOTE_NUM_PREDICT,
    });
    let lexiconNote: string | undefined;
    if (isLexiconEligible(rel)) {
      const rawLx = await callOllamaChat(
        buildManualLexiconPrompt(rel, read.content, manualI18nDict),
        undefined,
        {
          persona: "horus",
          model: HORUS_MODEL_ID,
          system: HORUS_THINK_TAG_CONTRACT,
          temperature: 0.3,
          numPredict: NOTE_NUM_PREDICT,
        },
      );
      lexiconNote = sanitizeNote(stripThink(rawLx ?? "")) || undefined;
    }
    stores[mode][rel] = {
      hash: read.hash,
      note: sanitizeNote(stripThink(rawFn ?? "")),
      lexiconNote,
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

  // Persisti lo stato di avanzamento nel DB (solo scan manuale) così un restart
  // del server può riprendere dal punto in cui era senza riprocessare i file.
  if (mode === "manual") await persistManualState();

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
        : mode === "security"
          ? await finalizeSecurityScan(stores.security, states.security.filesTotal, states.security.filesSkipped)
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
    // Persisti lo stato finale nel DB (solo scan manuale) così il prossimo boot
    // non la rilancia (finishedAt != null → la logica di resume non scatta).
    if (mode === "manual") await persistManualState();
  }
}

// ── Lettura stato ──────────────────────────────────────────────────────────────

export function getHorusScanStatus(mode: ScanMode): ScanState {
  return { ...states[mode] };
}

export function getAllHorusScanStatus(): Record<ScanMode, ScanState> {
  return {
    analysis: { ...states.analysis },
    manual: { ...states.manual },
    security: { ...states.security },
  };
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
    line(states.security, "Security scan"),
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

/**
 * Task #683 — Riconosce nel messaggio grezzo dell'admin la richiesta di avviare
 * la scansione security. Separato da detectHorusScanRequest per evitare ambiguità
 * con il mode "analysis" (entrambi possono contenere "analisi" + "codice").
 * Ritorna `{ mode: "security" }` o null.
 */
export function detectHorusSecurityScanRequest(message: string): { mode: "security" } | null {
  const m = (message ?? "").toLowerCase();
  if (!m.trim()) return null;

  const wantsSecurity =
    // Frasi esplicite con "sicurezza" o "vulnerabilità" + verbo/azione
    /(scansion\w*|analis\w*|audit|cerca|controll\w*|trova)\w*\s+(la\s+)?(sicurezza|vulnerabilit\w*|security)/.test(m) ||
    /(sicurezza|security)\s+(scan|audit|codice|del\s+codice|backend)/.test(m) ||
    /\bvulnerabilit\w+/.test(m) ||
    /\bsecurity\s+(scan|audit)\b/.test(m) ||
    /\baudit\s+di\s+sicurezza\b/.test(m) ||
    /\bfai\s+(un\s+)?security\b/.test(m) ||
    /\bscansione\s+sicurezza\b/.test(m) ||
    /\banalisi\s+sicurezza\b/.test(m);

  return wantsSecurity ? { mode: "security" } : null;
}
