// Task #7 — Hardening tool-calling backend AI Assistant (tranche a).
//
// Porta in BikerLink una prima tranche di bug di tool-calling già corretti nel
// repo gemello BikerBlog. Sono classi di bug legate al modello/tunnel (non ai
// contenuti del blog), quindi latenti anche qui. Ogni helper è PURO e testabile
// in isolamento; l'integrazione nel flusso streaming vive in `agent.ts`.
//
// Bug portati (con test dedicato in server/__tests__/):
//   #1 — Fallback tool-call testuale: modelli piccoli (es. llama3.2:3b) a volte
//        scrivono il JSON della tool call nel TESTO invece di emettere una vera
//        tool_call. `tryParseTextualToolCall` intercetta quel pattern e lo
//        converte in una chiamata reale, ma solo se il tool è davvero attivo.
//   #2 — Sentinel "tool mancante": se il modello dichiara di aver bisogno di un
//        tool che la selezione contestuale non ha allegato, emette
//        `[TOOL_MANCANTE: nome]` e il turno viene rieseguito con l'intero set di
//        tool — senza mostrare il sentinel all'utente.
//   #3 — Selezione contestuale + gating per capacità: il turno allega solo il
//        sottoinsieme minimo di tool pertinente al messaggio (o nessuno per un
//        messaggio conversazionale), e solo per i servizi effettivamente attivi.

// Task #75 — search_manual (Nadir): cue di richiamo semantico. Definito nel
// sottosistema Nadir (unica fonte di verità) e riusato qui per il gating del tool.
import { SEARCH_MANUAL_RE } from "../nadir/constants";

// ── #2 — Sentinel "tool mancante" ─────────────────────────────────────────────

/** Prefisso del sentinel emesso dal modello quando gli serve un tool non allegato. */
export const MISSING_TOOL_SENTINEL_PREFIX = "[TOOL_MANCANTE:";

// Deve stare all'INIZIO del testo (il modello lo emette da solo, senza prosa
// prima o dopo). `[a-z0-9_]+` copre i nomi dei tool (camelCase incluso via `i`).
const MISSING_TOOL_SENTINEL_RE = /^\s*\[TOOL_MANCANTE:\s*([a-z0-9_]+)\s*\]/i;

// Margine oltre il prefisso per far stare "[TOOL_MANCANTE: nomePiuLungo]".
export const MISSING_TOOL_SENTINEL_MAX_BUFFER = 64;

/**
 * Se `text` è (o inizia con) il sentinel `[TOOL_MANCANTE: nome]`, restituisce il
 * nome del tool richiesto; altrimenti null. Un testo che per caso inizia con `[`
 * ma non è il sentinel NON deve dare un falso positivo.
 */
export function detectMissingToolSentinel(text: string): string | null {
  if (!text) return null;
  const match = MISSING_TOOL_SENTINEL_RE.exec(text);
  return match ? match[1] : null;
}

/**
 * Istruzione da appendere al system prompt quando la selezione contestuale ha
 * ridotto i tool disponibili: dà al modello la via d'uscita del sentinel invece
 * di allucinare o di scrivere una tool call testuale per un tool non allegato.
 */
export function buildMissingToolInstruction(fullToolNames: string[]): string {
  return (
    "STRUMENTI: hai a disposizione solo i tool elencati per questo turno. " +
    "Se ti serve uno strumento NON tra questi, NON inventare i dati e NON " +
    "scrivere JSON: rispondi ESATTAMENTE e SOLO con " +
    `${MISSING_TOOL_SENTINEL_PREFIX} nome_tool] dove nome_tool è uno tra ` +
    `${fullToolNames.join(", ")}. Nient'altro prima o dopo.`
  );
}

// ── #1 — Fallback tool-call testuale ──────────────────────────────────────────

export interface ParsedTextualToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Rileva un blob JSON di tool call scritto come TESTO — es.
 * `{"name": "getBikerStats", "parameters": {"userId": "..."}}` — e lo converte
 * in una chiamata strutturata, SOLO quando il nome corrisponde a un tool
 * effettivamente disponibile in questo turno. Accetta sia la chiave
 * `parameters` sia `arguments`. Restituisce null per prosa normale o per un
 * tool non disponibile (così non si esegue mai qualcosa di non allegato).
 */
export function tryParseTextualToolCall(
  content: string,
  availableToolNames: string[],
): ParsedTextualToolCall | null {
  const trimmed = (content ?? "").trim();
  if (!trimmed.includes("{") || !trimmed.includes("name")) return null;

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const obj = parsed as Record<string, unknown>;
  const name = obj["name"];
  const rawArgs = obj["parameters"] ?? obj["arguments"];
  if (typeof name !== "string" || !availableToolNames.includes(name)) return null;
  if (rawArgs !== undefined && (typeof rawArgs !== "object" || rawArgs === null)) return null;

  return {
    name,
    arguments: (rawArgs as Record<string, unknown> | undefined) ?? {},
  };
}

// ── #3 — Selezione contestuale dei tool + gating per capacità ─────────────────

export interface ToolSelectionCapabilities {
  /** webSearch è allegabile solo se SearXNG è configurato (SEARXNG_URL). */
  webSearchAvailable: boolean;
  /** i tool user-scoped (stats/percorsi) servono un userId reale. */
  hasUserId: boolean;
}

// Intento "storia di guida / statistiche": km, strade, giri percorsi, percorsi
// pianificati/salvati, tappe. Copre le due facce (aggregato + elenco percorsi).
const RIDING_HISTORY_RE =
  /statistic|riepilog|quant[ei]\b[\s\S]*\b(km|chilometr|strad|gir[oi]|percors|viagg)|(km|chilometr|strad|gir[oi]|percors|viagg)\b[\s\S]*\b(fatt|percors|total|complet|pianificat|salvat|recent)|media\s+km|(miei|mie|i)\s+(percors|gir[oi]|itinerari|viagg)|percors\w*\s+(pianificat|salvat|recent|mie[ei]?)|gir[oi]\s+pianificat|\btapp\w*|\bwaypoint|destinazion/i;

const WEATHER_RE =
  /meteo|prevision|piov|pioggia|\bsole\b|nuvol|\bvento\b|temperatur|che\s+tempo\s+fa|\bclima\b|weather/i;

const EVENTS_RE =
  /event[oi]|radun|manifestazion|concentr|(vicin\w*[\s\S]*(event|radun|moto))|((event|radun)[\s\S]*vicin)|cosa\s+c'?è\s+(in\s+giro|vicino)/i;

const THINKCENTRE_RE =
  /thinkcentre|think\s?centre|server\s+di\s+casa|self.?hosted|(stato|attiv\w*|funzion\w*|online|offline|gi[uù]|raggiungibil\w*)[\s\S]*(serviz|ollama|graphhopper|photon|server)|(serviz|ollama|graphhopper|photon)[\s\S]*(stato|attiv\w*|funzion\w*|online|offline|gi[uù]|raggiungibil\w*)/i;

const WEB_SEARCH_RE =
  /cerca\s+(online|sul\s+web|in\s+rete|su\s+internet|in\s+internet)|ultime\s+notizie|\bnovità\b|\bnotizie\b|\bprezz\w+|normativ|regolament|aggiornament\w*[\s\S]*(web|internet|online)|sul\s+web\b|in\s+rete\b/i;

// Task #50 — Tool inter-agente + memoria + revisione piani.
//
// call_horus: delega/consultazione esplicita di Horus, o intento di
// routing/itinerario (Horus è lo specialista), oltre alla menzione diretta.
const CALL_HORUS_RE =
  /\bhorus\b|(chied\w*|chiam\w*|us\w*|deleg\w*|pass\w*|senti\w*|coinvolg\w*|fall?o?\s+fare)\s+(a\s+)?horus|(itinerari|percors\w+\s+moto|pianific\w*\s+(un\s+)?(percors|itinerari|gir[oi]))/i;

// Note: Quebracho has been unified into Horus (Task #591). Mentions of quebracho/qq
// are now redirected to Horus via the roster alias; no separate call_quebracho tool.

// call_ares: attivazione esplicita di Ares (solo admin — il gating avviene a
// monte tramite la disponibilità del tool), o menzione diretta.
const CALL_ARES_RE =
  /\bares\b|(chiam\w*|attiv\w*|lanc\w*|avvi\w*|mand\w*|us\w*)\s+(ares|are)|ares\s+(analizz\w*|esamin\w*|guard\w*|controll\w*)/i;

// remember_note: richiesta di memorizzare qualcosa (solo Horus vede il tool).
const REMEMBER_NOTE_RE =
  /\bricord\w+|memorizz\w+|non\s+dimenticare|tieni\s+a\s+mente|segna\w*|prendi\s+nota|appunt\w+|annot\w+/i;

// review_task_plan: revisione di un task plan / piano di lavoro.
const REVIEW_TASK_PLAN_RE =
  /task\s*plan|(revision\w*|rivedi|rivedere|rived\w*|controll\w*|analizz\w*|esamin\w*|valut\w*)\s+(il\s+|questo\s+|un\s+|il\s+mio\s+)?(piano|task|task\s*plan)|review\s+(del\s+)?(task|piano)|(piano|task)\s+di\s+lavoro/i;

// Task #153 — Tool file sharing TC ai-hub (~/agent-shared/).
// save_file: salvare/scrivere un file nella cartella condivisa.
const SAVE_FILE_RE =
  /\b(salv\w+|scriv\w+|crea\w*|memorizz\w+)\s+(un\s+|il\s+|questo\s+)?file|file\s+(condivis\w+|nella\s+cartella)|agent[\s-]?shared/i;
// read_file: leggere/aprire un file dalla cartella condivisa.
const READ_FILE_RE =
  /\b(legg\w+|apri|apr\w+|mostra\w*|visualizz\w+)\s+(il\s+|un\s+|questo\s+)?file|contenut\w*\s+del\s+file|agent[\s-]?shared/i;
// list_files: elencare i file / directory della cartella condivisa.
const LIST_FILES_RE =
  /\b(elenc\w+|list\w+)\s+(i\s+|dei\s+)?file|quali\s+file|che\s+file\s+ci\s+sono|file\s+(present\w+|disponibil\w+)|contenut\w*\s+della\s+cartella|agent[\s-]?shared/i;
// check_vram_usage: utilizzo VRAM/GPU del ThinkCentre.
const VRAM_RE =
  /\bvram\b|memoria\s+(della\s+)?gpu|gpu\s+memory|utilizzo\s+(della\s+)?gpu|carico\s+(della\s+)?gpu/i;

// Task #683 — run_security_scan: avvio o interrogazione dello stato della
// scansione security di Horus (admin-only). Riconoscimento distinto da
// "analisi codice" generico: richiede esplicitamente sicurezza/vulnerabilità.
const RUN_SECURITY_SCAN_RE =
  /\bsicurezza\b.*\b(scan|audit|codice|backend|vulnerabilit\w*)|vulnerabilit\w+|\bsecurity\s+(scan|audit)\b|\baudit\s+di\s+sicurezza\b|\bscansione\s+sicurezza\b|\banalisi\s+sicurezza\b|\bstato\s+security\b|\brun.?security\b/i;

/**
 * Restituisce i NOMI dei tool da allegare al turno, partendo dai tool
 * effettivamente disponibili per la persona (`availableToolNames`). Applica la
 * selezione contestuale (solo ciò che serve al messaggio) e il gating per
 * capacità (webSearch solo se SearXNG è su; stats/percorsi solo con userId).
 * Un messaggio conversazionale ("ciao") restituisce `[]` (nessun tool).
 */
export function selectToolNamesForMessage(
  availableToolNames: string[],
  message: string,
  caps: ToolSelectionCapabilities,
): string[] {
  const available = new Set(availableToolNames);
  const m = (message ?? "").toLowerCase();
  const wanted = new Set<string>();

  const want = (name: string) => {
    if (available.has(name)) wanted.add(name);
  };

  if (WEATHER_RE.test(m)) want("getWeather");
  if (EVENTS_RE.test(m)) want("getNearbyEvents");
  if (THINKCENTRE_RE.test(m)) want("getThinkCentreStatus");
  if (RIDING_HISTORY_RE.test(m)) {
    // I due tool sono complementari: "quante strade/km ho percorso" può volere
    // sia l'aggregato (getBikerStats) sia l'elenco percorsi (getUserPlannedRoutes).
    if (caps.hasUserId) {
      want("getBikerStats");
      want("getUserPlannedRoutes");
    }
  }
  if (caps.webSearchAvailable && WEB_SEARCH_RE.test(m)) want("webSearch");

  // Task #50 — Tool inter-agente / memoria / revisione. `want()` allega solo i
  // tool DAVVERO disponibili per la persona (call_* solo Bowie, call_ares solo
  // admin, remember_note solo Horus): la selezione contestuale non li "crea".
  if (CALL_HORUS_RE.test(m)) want("call_horus");
  // quebracho/qq mentions redirect to Horus via roster — no separate call_quebracho tool.
  if (CALL_ARES_RE.test(m)) want("call_ares");
  if (REMEMBER_NOTE_RE.test(m)) want("remember_note");
  if (REVIEW_TASK_PLAN_RE.test(m)) want("review_task_plan");
  // Task #75 — search_manual (Nadir): mai un default silenzioso, solo su cue esplicito.
  if (SEARCH_MANUAL_RE.test(m)) want("search_manual");

  // Task #153 — Tool TC ai-hub (file sharing + VRAM). `want()` allega solo i
  // tool DAVVERO disponibili per la persona (save_file solo Horus, check_vram
  // solo Horus; read/list per entrambe).
  if (SAVE_FILE_RE.test(m)) want("save_file");
  if (READ_FILE_RE.test(m)) want("read_file");
  if (LIST_FILES_RE.test(m)) want("list_files");
  if (VRAM_RE.test(m)) want("check_vram_usage");

  // Task #683 — run_security_scan (solo Horus, solo admin — want() garantisce
  // che il tool sia disponibile prima di aggiungerlo al set).
  if (RUN_SECURITY_SCAN_RE.test(m)) want("run_security_scan");

  // Ordine stabile e deterministico = ordine di dichiarazione della persona.
  return availableToolNames.filter((n) => wanted.has(n));
}

// ── #1 / #2 — Gate di streaming per l'output Ollama ───────────────────────────
//
// Modelli piccoli emettono a volte SOLO un sentinel `[TOOL_MANCANTE: ...]` o un
// blob JSON di tool call al posto di una risposta reale. Questo gate — sullo
// stesso principio di createHandoffMarkerFilter/security-filter — TRATTIENE
// l'output finché non è chiaro se è prosa normale (→ la lascia passare in
// streaming) oppure uno di quei due casi speciali (→ lo SOPPRIME, così il blob
// grezzo non raggiunge mai l'utente e il chiamante può fare il recovery).

export type OllamaGateMode = "normal" | "sentinel" | "toolcall";

export interface OllamaGateResult {
  mode: OllamaGateMode;
  /** Solo per mode="sentinel": nome del tool richiesto dal modello. */
  sentinelTool?: string;
  /** Solo per mode="toolcall": la tool call testuale parsata. */
  toolCall?: ParsedTextualToolCall;
  /** Testo grezzo completo bufferizzato (per diagnostica/log). */
  capturedText: string;
}

const MAX_TOOLCALL_BUFFER = 8_192;

export interface OllamaOutputGate {
  /** Consuma un delta; emette (via `emit`) solo il testo confermato prosa normale. */
  push(delta: string, emit: (safe: string) => void): void;
  /** Rilascia l'output residuo a fine stream e finalizza la classificazione. */
  flush(emit: (safe: string) => void): OllamaGateResult;
}

export function createOllamaOutputGate(availableToolNames: string[]): OllamaOutputGate {
  let buffer = "";
  let decidedNormal = false;
  let result: OllamaGateResult | null = null;

  const classifyLocked = (final: boolean): OllamaGateResult | null => {
    const t = buffer.trimStart();
    if (t.length === 0) return null;
    const c = t[0];

    // Prosa normale: qualsiasi cosa che non inizi con '[' o '{'.
    if (c !== "[" && c !== "{") {
      return { mode: "normal", capturedText: buffer };
    }

    if (c === "[") {
      const sentinel = detectMissingToolSentinel(t);
      if (sentinel) return { mode: "sentinel", sentinelTool: sentinel, capturedText: buffer };
      // Ha raggiunto la chiusura o superato il margine senza combaciare → prosa.
      if (t.includes("]") || t.length >= MISSING_TOOL_SENTINEL_MAX_BUFFER || final) {
        return { mode: "normal", capturedText: buffer };
      }
      return null; // ancora indeciso: attendi altri delta
    }

    // c === "{": possibile tool call testuale.
    const toolCall = tryParseTextualToolCall(t, availableToolNames);
    if (toolCall) return { mode: "toolcall", toolCall, capturedText: buffer };
    // JSON incompleto o non-tool: attendi finché non si chiude o si supera il tetto.
    if (t.length >= MAX_TOOLCALL_BUFFER || final) {
      return { mode: "normal", capturedText: buffer };
    }
    return null;
  };

  return {
    push(delta, emit) {
      // Già classificato come sentinel/toolcall: soppresso, ignora il resto.
      if (result) return;
      if (decidedNormal) {
        emit(delta);
        return;
      }
      buffer += delta;
      const decision = classifyLocked(false);
      if (!decision) return;
      if (decision.mode === "normal") {
        decidedNormal = true;
        emit(buffer);
        buffer = "";
      } else {
        // sentinel/toolcall: soppresso, non emettere nulla.
        result = decision;
      }
    },
    flush(emit) {
      if (result) return result;
      if (decidedNormal) {
        if (buffer) {
          emit(buffer);
          buffer = "";
        }
        return { mode: "normal", capturedText: "" };
      }
      const decision = classifyLocked(true) ?? { mode: "normal" as const, capturedText: buffer };
      if (decision.mode === "normal") {
        if (buffer) emit(buffer);
        buffer = "";
      }
      result = decision;
      return decision;
    },
  };
}
