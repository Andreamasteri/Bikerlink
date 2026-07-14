// Task #11 — Hardening backend AI Assistant (b) streaming.
//
// Heartbeat SSE per tenere viva la connessione (tunnel Cloudflare/proxy)
// durante i periodi di silenzio del turno — tipicamente l'esecuzione di un
// tool (query DB, chiamata meteo/webSearch) o il "prompt processing" di
// Ollama su CPU prima del primo token: in quella finestra nessun evento
// `delta` viene inviato, e un proxy/tunnel che chiude le connessioni idle
// (Cloudflare: ~100s) può interrompere il turno prima che l'utente veda
// qualsiasi output, anche se il server sta ancora lavorando correttamente.
//
// Pattern portato dal repo gemello BikerBlog (`writeHeartbeatPing`): il
// battito è un commento SSE (`: ping\n\n`), invisibile al parser
// `EventSource`/client (i commenti SSE iniziano con `:` e non generano un
// evento), quindi non richiede alcuna modifica lato client per essere
// ignorato in sicurezza.
//
// `res.write()` DEVE essere protetto da `writableEnded`/`destroyed` perché il
// timer può scattare DOPO che la connessione si è già chiusa (l'evento
// "close" e la clearInterval nel chiamante sono asincroni rispetto al timer):
// una scrittura non protetta su un socket già chiuso, dentro un callback di
// `setInterval` non catturato da nessun try/catch del chiamante, diventerebbe
// una `uncaughtException` e farebbe crashare l'intero processo Node — non
// solo questa singola chat, ma OGNI agente AI in corso in quel momento.
import type { Response } from "express";

export const SSE_HEARTBEAT_INTERVAL_MS = 15_000;

/** Scrive un singolo ping SSE, se la connessione è ancora scrivibile. */
export function writeSseHeartbeat(res: Response): void {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.write(": ping\n\n");
  } catch {
    // Connessione morta a metà scrittura: nessuna azione, il chiamante la
    // rileverà comunque tramite l'evento "close"/abort.
  }
}

/**
 * Avvia il battito periodico per la durata del turno. Ritorna una funzione di
 * stop da chiamare SEMPRE in un `finally` (turno completato, errore, o abort
 * del client) per non lasciare il timer attivo oltre la vita della risposta.
 */
export function startSseHeartbeat(
  res: Response,
  intervalMs: number = SSE_HEARTBEAT_INTERVAL_MS,
): () => void {
  const timer = setInterval(() => writeSseHeartbeat(res), intervalMs);
  return () => clearInterval(timer);
}
