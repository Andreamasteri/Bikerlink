/**
 * Ares Client — BikerLink (Task #5197)
 *
 * Ares è l'AI di diagnostica tecnica della piattaforma. Gira su un PC fisso
 * dedicato (SEPARATO dal ThinkCentre che ospita Bowie/Horus) ed è esposto su
 * Ollama via le variabili d'ambiente DIAG_OLLAMA_*.
 *
 * Variabili d'ambiente (secret Replit — i VALORI non vanno mai stampati):
 *   ARES_OLLAMA_URL    — URL base Ollama del PC fisso (via Cloudflare Tunnel).
 *                        Se assente, isAresConfigured è false e il chiamante
 *                        degrada con grazia (messaggio garbato, niente crash).
 *   ARES_OLLAMA_MODEL  — modello da usare per la chat diagnostica.
 *   ARES_OLLAMA_TOKEN  — (opzionale) token custom Ollama, header X-Ollama-Token.
 *
 * A differenza di Bowie/Horus (ollama-client.ts), Ares NON usa il Vercel AI SDK:
 * fa una chiamata HTTP diretta a `${ARES_OLLAMA_URL}/api/chat` (NDJSON stream),
 * coerente con gli altri tocchi ad Ares (scripts/ollama-diagnose.ts, monitor
 * thinkcentre-health-ares-probe.ts).
 */

import { cfAccessHeaders } from "./cf-access";

const ARES_URL = process.env.ARES_OLLAMA_URL?.trim().replace(/\/$/, "");
const ARES_TOKEN = process.env.ARES_OLLAMA_TOKEN ?? "";
const ARES_MODEL = process.env.ARES_OLLAMA_MODEL?.trim() || "qwen3-coder:30b";

/** true quando ARES_OLLAMA_URL è impostato (Ares disponibile come destinazione). */
export const isAresConfigured = Boolean(ARES_URL);

/** Id del modello Ares (per logging ai_call_logs). */
export function getAresModelId(): string {
  return ARES_MODEL;
}

/**
 * Header per le richieste verso Ares. Il Service Token Cloudflare Access viene
 * allegato SOLO verso origin di nostra proprietà (biker-link.net): se per errore
 * ARES_OLLAMA_URL puntasse a un host esterno, non disclosiamo il token CF.
 */
function aresHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (ARES_TOKEN) h["X-Ollama-Token"] = ARES_TOKEN;
  try {
    if (ARES_URL) {
      const host = new URL(ARES_URL).hostname.toLowerCase();
      if (host === "biker-link.net" || host.endsWith(".biker-link.net")) {
        Object.assign(h, cfAccessHeaders());
      }
    }
  } catch {
    /* URL malformato → nessun header CF */
  }
  return h;
}

export interface AresChatOptions {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
  /** Timeout duro della chiamata (default 60s). */
  timeoutMs?: number;
  /**
   * Task #5322 — Cap di lunghezza risposta (Ollama `num_predict`). Serve a tenere
   * Ares CONTENUTO e strutturato a runtime, SENZA toccare il suo Modelfile. Se
   * assente si usa ARES_DEFAULT_NUM_PREDICT.
   */
  numPredict?: number;
}

// Task #5322 — Cap di default sulla verbosità di Ares (risposte contenute).
const ARES_DEFAULT_NUM_PREDICT = 768;

/**
 * Esegue una chat in streaming verso Ares e restituisce il testo completo.
 * Lancia un errore catchable se Ares non è configurato o irraggiungibile: il
 * chiamante è responsabile del fallback (messaggio garbato di Bowie).
 */
export async function streamAresChat(opts: AresChatOptions): Promise<{ text: string }> {
  if (!ARES_URL) {
    throw new Error("Ares non configurato: variabile ARES_OLLAMA_URL mancante.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let text = "";
  try {
    const res = await fetch(`${ARES_URL}/api/chat`, {
      method: "POST",
      headers: aresHeaders(),
      body: JSON.stringify({
        model: ARES_MODEL,
        stream: true,
        messages: [{ role: "system", content: opts.system }, ...opts.messages],
        options: { temperature: 0.3, num_predict: opts.numPredict ?? ARES_DEFAULT_NUM_PREDICT },
      }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`Ares non raggiungibile (HTTP ${res.status}).`);
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
          if (obj.error) throw new Error(`Ares: ${obj.error}`);
          const piece = obj.message?.content ?? "";
          if (piece) {
            text += piece;
            opts.onDelta?.(piece);
          }
        } catch (e) {
          // Errore esplicito di Ares → propaga; riga JSON malformata → ignora.
          if (e instanceof Error && e.message.startsWith("Ares:")) throw e;
        }
      }
    }
    return { text };
  } finally {
    clearTimeout(timer);
  }
}
