// Task #50 — Client di supporto per i tool inter-agente di Bowie.
//
// Bowie resta Bowie ma può consultare un'altra AI a metà conversazione tramite
// tool-calling esplicito (call_horus / call_quebracho / call_ares), mostrando
// all'utente SOLO il risultato. Queste funzioni interrogano il rispettivo agente
// e restituiscono la risposta testuale, con timeout e un messaggio di cortesia se
// il target non è configurato o non raggiungibile — mai uno stack trace.
//
// Nota architetturale: a differenza dell'handoff di persona (roster.ts), qui NON
// si cambia la persona attiva. Bowie riceve `text` e lo incorpora nella propria
// risposta.
import { callOllamaChat, isOllamaConfigured, isOllamaReachable } from "../../lib/ollama-client";
import { isAresConfigured, getAresModelId, streamAresChat } from "../../lib/ares-client";
import { withAresVramPriority } from "../../lib/vram-arbiter";
import { isQuebrachoConfigured, streamQuebrachoChat } from "../../lib/quebracho-client";

export interface InterAgentResult {
  /** true se l'agente ha risposto; false se non configurato/irraggiungibile/vuoto. */
  ok: boolean;
  /** Testo da incorporare (risposta dell'agente) o messaggio di cortesia se !ok. */
  text: string;
}

const HORUS_CONSULT_SYSTEM =
  "Sei Horus, lo specialista di percorsi, itinerari e navigazione moto di BikerLink. " +
  "Bowie ti sta consultando a metà conversazione per conto dell'utente: rispondi SOLO a " +
  "ciò che ti viene chiesto, in italiano, conciso e concreto, senza convenevoli.";

const QUEBRACHO_CONSULT_SYSTEM =
  "Sei Quebracho, il coordinatore/regista degli agenti AI di BikerLink, affabile e diretto. " +
  "Bowie ti sta consultando a metà conversazione: dai il tuo punto di vista in italiano, " +
  "conciso e concreto, senza divagazioni.";

const ARES_CONSULT_SYSTEM =
  "Sei Ares, l'AI di diagnostica tecnica di BikerLink. Un amministratore ti attiva tramite Bowie " +
  "per analizzare una questione di supervisione tecnica. Analizza il contesto e proponi fino a due " +
  "percorsi di risoluzione. REGOLA ASSOLUTA: proponi, non applichi mai modifiche — la decisione " +
  "resta all'admin. Rispondi in italiano, conciso e strutturato.";

const HORUS_TIMEOUT_MS = 60_000;
const QUEBRACHO_TIMEOUT_MS = 60_000;
const ARES_TIMEOUT_MS = 90_000;

/** Rimuove i blocchi di ragionamento `<think>…</think>` che alcuni modelli (qwen3)
 *  emettono quando il think non è disattivato. Solo la risposta finale interessa. */
function stripThink(text: string): string {
  return (text ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/**
 * Combina il signal del chiamante con un timeout interno, così anche i client che
 * accettano SOLO un `abortSignal` (es. callOllamaChat) rispettano il tetto di
 * durata. Ritorna un signal composito, un flag `timedOut` (true se ad abortire è
 * stato il timeout, non il chiamante) e una `cleanup` da invocare in `finally`.
 */
export function createTimeoutSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; timedOut: () => boolean; cleanup: () => void } {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    },
  };
}

// ── Horus ────────────────────────────────────────────────────────────────────

export async function askHorus(
  prompt: string,
  opts: { signal?: AbortSignal } = {},
): Promise<InterAgentResult> {
  const clean = (prompt ?? "").trim();
  if (!clean) return { ok: false, text: "Non ho ricevuto una domanda chiara da inoltrare a Horus." };
  if (!isOllamaConfigured || !(await isOllamaReachable("horus"))) {
    return { ok: false, text: "Horus non è raggiungibile in questo momento. Riprova più tardi." };
  }
  // callOllamaChat accetta solo un abortSignal: applichiamo il timeout via signal
  // composito, così una consultazione appesa non blocca il turno di Bowie.
  const t = createTimeoutSignal(opts.signal, HORUS_TIMEOUT_MS);
  try {
    const raw = await callOllamaChat(clean, undefined, {
      persona: "horus",
      system: HORUS_CONSULT_SYSTEM,
      temperature: 0.3,
      numPredict: 700,
      abortSignal: t.signal,
    });
    const out = stripThink(raw ?? "");
    if (!out) return { ok: false, text: "Horus non ha fornito una risposta utilizzabile." };
    return { ok: true, text: out };
  } catch (err) {
    if (t.timedOut()) return { ok: false, text: "Horus ha impiegato troppo tempo a rispondere. Riprova più tardi." };
    return { ok: false, text: `Non sono riuscito a consultare Horus (${(err as Error).message.slice(0, 80)}).` };
  } finally {
    t.cleanup();
  }
}

// ── Quebracho ─────────────────────────────────────────────────────────────────

export async function askQuebracho(
  message: string,
  opts: { signal?: AbortSignal } = {},
): Promise<InterAgentResult> {
  const clean = (message ?? "").trim();
  if (!clean) return { ok: false, text: "Non ho ricevuto un messaggio chiaro da inoltrare a Quebracho." };
  if (!isQuebrachoConfigured) {
    return { ok: false, text: "Quebracho non è configurato o raggiungibile in questo momento." };
  }
  try {
    const { text } = await streamQuebrachoChat({
      system: QUEBRACHO_CONSULT_SYSTEM,
      messages: [{ role: "user", content: clean }],
      signal: opts.signal,
      timeoutMs: QUEBRACHO_TIMEOUT_MS,
      numPredict: 600,
    });
    const out = stripThink(text);
    if (!out) return { ok: false, text: "Quebracho non ha fornito una risposta." };
    return { ok: true, text: out };
  } catch (err) {
    return { ok: false, text: `Non sono riuscito a consultare Quebracho (${(err as Error).message.slice(0, 80)}).` };
  }
}

// ── Ares (solo admin, dal chiamante) ──────────────────────────────────────────

export async function askAres(
  prompt: string,
  opts: { signal?: AbortSignal } = {},
): Promise<InterAgentResult> {
  const clean = (prompt ?? "").trim();
  if (!clean) return { ok: false, text: "Non ho un contesto tecnico chiaro da passare ad Ares." };
  if (!isAresConfigured) {
    return { ok: false, text: "Ares non è configurato o raggiungibile in questo momento." };
  }
  try {
    // VRAM arbiter: Ares usa un modello pesante on-demand; libera la GPU prima e
    // ripristina la lineup residente dopo (best-effort, mai altera l'esito).
    const { text } = await withAresVramPriority(getAresModelId(), () =>
      streamAresChat({
        system: ARES_CONSULT_SYSTEM,
        messages: [{ role: "user", content: clean }],
        signal: opts.signal,
        timeoutMs: ARES_TIMEOUT_MS,
        numPredict: 700,
      }),
    );
    const out = stripThink(text);
    if (!out) return { ok: false, text: "Ares non ha prodotto una risposta." };
    return { ok: true, text: out };
  } catch (err) {
    return { ok: false, text: `Non sono riuscito ad attivare Ares (${(err as Error).message.slice(0, 80)}).` };
  }
}

// Timeout esportati per riuso/test.
export const INTER_AGENT_TIMEOUTS = {
  horus: HORUS_TIMEOUT_MS,
  quebracho: QUEBRACHO_TIMEOUT_MS,
  ares: ARES_TIMEOUT_MS,
} as const;
