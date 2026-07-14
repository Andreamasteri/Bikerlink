/**
 * Quebracho Client — BikerLink (Task #4)
 *
 * Quebracho ("Qq") è il coordinatore/regista degli agenti AI di BikerLink.
 * Gira su Ollama (ThinkCentre) con un modello leggero CPU/RAM (granite4:tiny-h).
 *
 * Variabili d'ambiente (secret Replit — i VALORI non vanno mai stampati):
 *   QUEBRACHO_OLLAMA_URL    — URL base Ollama dedicato a Quebracho. Se assente
 *                             ricade su HORUS_OLLAMA_URL → BOWIE_OLLAMA_URL (stessa
 *                             infra: il container Ollama del ThinkCentre serve
 *                             tutti gli agenti).
 *   QUEBRACHO_OLLAMA_MODEL  — modello da usare. Default: "granite4:tiny-h".
 *   QUEBRACHO_OLLAMA_TOKEN  — (opzionale) token custom Ollama (X-Ollama-Token).
 *                             Fallback su HORUS/BOWIE come per l'URL.
 *
 * Come Ares (ares-client.ts), Quebracho NON usa il Vercel AI SDK: fa una chiamata
 * HTTP diretta a `${URL}/api/chat` (NDJSON stream). Questo lo tiene ISOLATO dai
 * probe/log della persona OllamaPersona (bowie/horus) e coerente con l'endpoint
 * dedicato usato in agent.ts.
 *
 * `think: false` — granite4 è un modello ibrido che può "pensare": disattiviamo
 * il ragionamento esplicito così l'output di coordinamento resta pulito.
 */

import { cfAccessHeaders } from "./cf-access";

const QUEBRACHO_URL = (
  process.env.QUEBRACHO_OLLAMA_URL?.trim() ||
  process.env.HORUS_OLLAMA_URL?.trim() ||
  process.env.BOWIE_OLLAMA_URL?.trim() ||
  ""
).replace(/\/$/, "");
const QUEBRACHO_TOKEN =
  process.env.QUEBRACHO_OLLAMA_TOKEN ??
  process.env.HORUS_OLLAMA_TOKEN ??
  process.env.BOWIE_OLLAMA_TOKEN ??
  "";
const QUEBRACHO_MODEL = process.env.QUEBRACHO_OLLAMA_MODEL?.trim() || "granite4:tiny-h";

/** true quando un URL Ollama (dedicato o ereditato) è disponibile per Quebracho. */
export const isQuebrachoConfigured = Boolean(QUEBRACHO_URL);

/** Id del modello Quebracho (per logging ai_call_logs). */
export function getQuebrachoModelId(): string {
  return QUEBRACHO_MODEL;
}

/**
 * Header per le richieste verso Quebracho. Il Service Token Cloudflare Access
 * viene allegato SOLO verso origin di nostra proprietà (biker-link.net), con
 * l'eventuale override per-agente ("quebracho") e fallback alla coppia generica.
 */
function quebrachoHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (QUEBRACHO_TOKEN) h["X-Ollama-Token"] = QUEBRACHO_TOKEN;
  try {
    if (QUEBRACHO_URL) {
      const host = new URL(QUEBRACHO_URL).hostname.toLowerCase();
      if (host === "biker-link.net" || host.endsWith(".biker-link.net")) {
        Object.assign(h, cfAccessHeaders("quebracho"));
      }
    }
  } catch {
    /* URL malformato → nessun header CF */
  }
  return h;
}

export interface QuebrachoChatOptions {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
  /** Timeout duro della chiamata (default 60s). */
  timeoutMs?: number;
  /** Cap di lunghezza risposta (Ollama `num_predict`). Default QUEBRACHO_DEFAULT_NUM_PREDICT. */
  numPredict?: number;
}

// Cap di default sulla verbosità di Quebracho (risposte contenute, da regista).
const QUEBRACHO_DEFAULT_NUM_PREDICT = 768;

/**
 * Esegue una chat in streaming verso Quebracho e restituisce il testo completo.
 * Lancia un errore catchable se Quebracho non è configurato o irraggiungibile: il
 * chiamante è responsabile del fallback (messaggio garbato di Bowie, MAI cloud).
 */
export async function streamQuebrachoChat(opts: QuebrachoChatOptions): Promise<{ text: string }> {
  if (!QUEBRACHO_URL) {
    throw new Error("Quebracho non configurato: nessun URL Ollama disponibile.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let text = "";
  try {
    const res = await fetch(`${QUEBRACHO_URL}/api/chat`, {
      method: "POST",
      headers: quebrachoHeaders(),
      body: JSON.stringify({
        model: QUEBRACHO_MODEL,
        stream: true,
        think: false,
        messages: [{ role: "system", content: opts.system }, ...opts.messages],
        options: { temperature: 0.3, num_predict: opts.numPredict ?? QUEBRACHO_DEFAULT_NUM_PREDICT },
      }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`Quebracho non raggiungibile (HTTP ${res.status}).`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    // Ollama /api/chat in streaming emette un oggetto JSON per riga (NDJSON).
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const obj = JSON.parse(line) as {
            message?: { content?: string };
            done?: boolean;
            error?: string;
          };
          if (obj.error) throw new Error(`Quebracho: ${obj.error}`);
          const piece = obj.message?.content ?? "";
          if (piece) {
            text += piece;
            opts.onDelta?.(piece);
          }
        } catch (e) {
          // Errore esplicito di Quebracho → propaga; riga JSON malformata → ignora.
          if (e instanceof Error && e.message.startsWith("Quebracho:")) throw e;
        }
      }
    }
    return { text };
  } finally {
    clearTimeout(timer);
  }
}
