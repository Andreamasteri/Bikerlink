// Task #11 — Hardening backend AI Assistant (b) streaming.
//
// Cache best-effort delle risposte COMPLETE dell'assistente, per lo stesso
// motivo documentato nel repo gemello BikerBlog (Task #185 lì): il tunnel
// Cloudflare/la rete mobile possono interrompere una connessione SSE DOPO che
// il server ha già generato la risposta completa (silenzio prolungato durante
// tool calling, sospensione della rete su mobile, drop del tunnel). Senza
// questa cache, un retry dell'utente con lo STESSO messaggio rigenera da zero
// (altri secondi di attesa, un'altra chiamata AI, un altro possibile drop) e
// la risposta già prodotta va persa in silenzio.
//
// Con questa cache, il chiamante (route SSE) registra ogni evento SSE inviato
// per un turno; se il turno arriva a un evento "done", lo salviamo. Al retry
// IDENTICO (stesso utente, piattaforma/modalità, messaggio, cronologia) la
// route rispedisce all'istante gli eventi già prodotti invece di rieseguire
// l'intero turno — nessuna duplicazione (l'AI non viene richiamata) e nessuna
// perdita silenziosa (il client ottiene comunque la risposta).
//
// Cache in RAM, per-istanza: su deployment autoscale non è condivisa tra
// istanze, ma per l'uso reale (stesso utente, retry entro pochi secondi sulla
// stessa istanza calda) è sufficiente; su un'altra istanza si rigenera
// semplicemente, come prima di questa modifica.
import { createHash } from "node:crypto";

export interface CachedSseEvent {
  event: string;
  data: unknown;
}

interface CacheEntry {
  events: CachedSseEvent[];
  expiresAt: number;
}

export const REPLY_CACHE_TTL_MS = 10 * 60_000;
export const REPLY_CACHE_MAX_ENTRIES = 200;

const replyCache = new Map<string, CacheEntry>();

/**
 * Chiave deterministica per un turno: identica per due richieste IDENTICHE
 * (stesso utente, contesto piattaforma/modalità, messaggio, cronologia). Non
 * include timestamp/nonce di sorta: è esattamente questo che permette a un
 * retry genuino di trovare la cache, e a due messaggi diversi di non
 * colludere.
 */
export function computeReplyCacheKey(parts: {
  userId: string;
  mode: string;
  message: string;
  history: unknown;
}): string {
  return createHash("sha256")
    .update(parts.userId)
    .update("\u0000")
    .update(parts.mode)
    .update("\u0000")
    .update(parts.message)
    .update("\u0000")
    .update(JSON.stringify(parts.history ?? []))
    .digest("hex");
}

export function getCachedReply(key: string): CachedSseEvent[] | null {
  const hit = replyCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    replyCache.delete(key);
    return null;
  }
  // Re-inserimento in coda: comportamento LRU-ish, l'entry usata di recente
  // non è la prima candidata allo sfratto quando la cache è piena.
  replyCache.delete(key);
  replyCache.set(key, hit);
  return hit.events;
}

export function setCachedReply(key: string, events: CachedSseEvent[]): void {
  if (events.length === 0) return;
  replyCache.delete(key);
  replyCache.set(key, { events, expiresAt: Date.now() + REPLY_CACHE_TTL_MS });
  if (replyCache.size <= REPLY_CACHE_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of replyCache) {
    if (v.expiresAt <= now) replyCache.delete(k);
  }
  while (replyCache.size > REPLY_CACHE_MAX_ENTRIES) {
    const oldest = replyCache.keys().next().value;
    if (oldest === undefined) break;
    replyCache.delete(oldest);
  }
}

/** Solo per i test: svuota la cache così ogni test parte da uno stato pulito. */
export function __clearReplyCacheForTests(): void {
  replyCache.clear();
}
