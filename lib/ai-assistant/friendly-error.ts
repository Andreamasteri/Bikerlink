// Task #8 — Mapping "errore di rete → messaggio amichevole in italiano" per la
// chat dell'AI Assistant. Portato dal repo gemello BikerBlog (friendly-error.ts,
// Task #181 lì), dove il tunnel Cloudflare verso il ThinkCentre ("TC") chiude le
// connessioni lunghe (>~100s) prima che Ollama finisca di generare.
//
// Un'interruzione di rete a basso livello (fetch fallita o, più spesso qui, lo
// stream SSE del body chiuso a metà dal tunnel durante una generazione lunga)
// arriva SEMPRE come eccezione, ma il testo grezzo cambia per browser/runtime e
// per momento del fallimento — e NESSUNA di queste stringhe è adatta all'utente:
//   - Chrome, connessione iniziale fallita:        "Failed to fetch"
//   - Chrome, stream del body interrotto a metà:   "network error"
//   - Firefox:                  "NetworkError when attempting to fetch resource."
//   - Safari:                                      "Load failed"
//   - React Native (expo/fetch):                   "Network request failed"
// Alcuni drop del tunnel a metà stream arrivano invece come Error generico (non
// TypeError) con messaggio comunque grezzo/inglese ("terminated", "other side
// closed", "fetch failed"): la regex sotto copre questi casi non-TypeError.
import { AI_KEY_MISSING_MESSAGE, isAiKeyMissingError, isAiKeyMissingResponse } from "@/lib/ai-errors";

export const CHAT_CONNECTION_INTERRUPTED_MESSAGE =
  "La risposta sta impiegando troppo tempo o la connessione con il server è stata interrotta. Riprova tra qualche istante.";
export const CHAT_TIMEOUT_MESSAGE =
  "Il server ha impiegato troppo tempo a rispondere (timeout). Riprova tra qualche istante.";
export const CHAT_SERVER_ERROR_MESSAGE =
  "Il server ha risposto con un errore temporaneo. Riprova tra qualche istante.";
export const CHAT_GENERIC_ERROR_MESSAGE = "Errore di connessione. Riprova tra qualche istante.";

const RAW_NETWORK_ERROR_RE =
  /network\s?error|failed to fetch|network request failed|load failed|terminated|other side closed|fetch failed|connection (?:reset|closed|refused|aborted|was lost)/i;

function isAbort(err: unknown): boolean {
  // DOMException può non esistere in Hermes/RN: mai usarlo in un `instanceof`
  // nudo (ReferenceError). Il controllo sul `.name` copre tutti i runtime.
  return (err as { name?: string } | null)?.name === "AbortError";
}

function friendlyFromMessage(message: string): string {
  const match = /HTTP (\d+)/.exec(message);
  if (match) {
    const status = Number(match[1]);
    if (status === 408 || status === 504 || status === 524) return CHAT_TIMEOUT_MESSAGE;
    if (status >= 500) return CHAT_SERVER_ERROR_MESSAGE;
  }
  if (RAW_NETWORK_ERROR_RE.test(message)) return CHAT_CONNECTION_INTERRUPTED_MESSAGE;
  // Messaggio già amichevole/italiano prodotto dal server: passa invariato.
  return message;
}

/**
 * Traduce un'eccezione lanciata durante lo streaming (fetch iniziale o
 * `reader.read()` a metà stream) in un messaggio comprensibile per l'utente.
 * Restituisce "" solo se l'utente ha annullato di proposito (AbortError): in
 * quel caso la UI non deve mostrare alcun errore.
 */
export function friendlyChatErrorMessage(err: unknown): string {
  if (isAbort(err)) return "";
  // Provider/chiave AI non configurati → banner dedicato "Funzione AI non attivata".
  if (isAiKeyMissingError(err)) return AI_KEY_MISSING_MESSAGE;
  // Ogni interruzione di rete/stream a basso livello arriva come TypeError con
  // testo variabile per runtime: trattale TUTTE come errore di connessione, mai
  // esporre la stringa grezza (era il bug: prima si filtrava solo "fetch").
  if (err instanceof TypeError) return CHAT_CONNECTION_INTERRUPTED_MESSAGE;
  if (err instanceof Error) return friendlyFromMessage(err.message);
  return CHAT_GENERIC_ERROR_MESSAGE;
}

/**
 * Variante per l'evento SSE `error` emesso dal server ({ code, message }):
 * lì l'informazione arriva strutturata, non come eccezione.
 */
export function friendlyChatErrorFromEvent(code?: number, message?: string | null): string {
  if (isAiKeyMissingResponse(code ?? 0, message)) return AI_KEY_MISSING_MESSAGE;
  const c = code ?? 0;
  if (c === 408 || c === 504 || c === 524) return CHAT_TIMEOUT_MESSAGE;
  if (c >= 500) return CHAT_SERVER_ERROR_MESSAGE;
  if (message) {
    if (RAW_NETWORK_ERROR_RE.test(message)) return CHAT_CONNECTION_INTERRUPTED_MESSAGE;
    return message;
  }
  return CHAT_GENERIC_ERROR_MESSAGE;
}
