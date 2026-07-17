/**
 * pool-governor.ts — Control plane: budget connessioni DB per job background.
 *
 * Rimpiazza bg-db-limiter.ts con la stessa interfaccia pubblica ma con le
 * costanti importate da pool-config (fonte unica di verità) invece di essere
 * hardcoded qui. bg-db-limiter.ts diventa un thin re-export verso questo modulo.
 *
 * RESPONSABILITÀ:
 *   - Semaforo slot (≤ BG_DB_MAX_CONCURRENCY connessioni bg in parallelo)
 *   - Coda FIFO con tetto (BG_DB_MAX_QUEUE) e timeout (BG_DB_QUEUE_TIMEOUT_MS)
 *   - Kill-switch adattivo (rifiuta job non critici se DB lento)
 *   - Reentranza via AsyncLocalStorage (evita deadlock negli annidamenti)
 *   - statement_timeout su connessioni bg (BG_DB_STATEMENT_TIMEOUT_MS)
 *
 * NON È:
 *   - Osservabilità (quella è nel pool-collector)
 *   - Configurazione del pool (quella è in pool-config)
 *   - Retry (quello è in db-retry)
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { pool } from "./pool";
import {
  BG_DB_MAX_CONCURRENCY,
  BG_DB_STATEMENT_TIMEOUT_MS,
  BG_DB_MAX_QUEUE,
  BG_DB_QUEUE_TIMEOUT_MS,
  BG_DB_SLOW_THRESHOLD,
  POOL_STATEMENT_TIMEOUT_MS,
} from "./pool-config";

// ── Classi di errore (API pubblica, identica a bg-db-limiter) ────────────────

export class BgDbQueueOverflowError extends Error {
  constructor(queued: number, max: number) {
    super(`bg-db-limiter queue overflow (queued=${queued}, max=${max}) — job dropped`);
    this.name = "BgDbQueueOverflowError";
  }
}

export class BgDbQueueTimeoutError extends Error {
  constructor(waitedMs: number, timeoutMs: number) {
    super(`bg-db-limiter queue wait timed out after ${waitedMs}ms (limit ${timeoutMs}ms) — stale job dropped`);
    this.name = "BgDbQueueTimeoutError";
  }
}

export class BgDbSlowKillSwitchError extends Error {
  constructor(consecutive: number, threshold: number) {
    super(`bg-db-limiter kill-switch active (${consecutive} consecutive slow pings ≥${threshold}) — job dropped`);
    this.name = "BgDbSlowKillSwitchError";
  }
}

/**
 * Distingue i drop "attesi" del governor (kill-switch, coda piena, coda scaduta)
 * dagli errori reali. I chiamanti (es. scheduler.cycle.ts) usano questo helper
 * per loggare i drop come WARN "posticipato" invece di ERROR generico, ed
 * escluderli dal conteggio errori che alimenta gli alert del watchdog.
 */
export function isBgDbLimiterDropError(err: unknown): boolean {
  return (
    err instanceof BgDbSlowKillSwitchError ||
    err instanceof BgDbQueueOverflowError ||
    err instanceof BgDbQueueTimeoutError
  );
}

// ── Stato interno ────────────────────────────────────────────────────────────

let active = 0;
let droppedOverflowTotal = 0;
let droppedTimeoutTotal = 0;
let droppedSlowKillSwitchTotal = 0;
let dbSlowPingsConsecutive = 0;

interface Waiter {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  settled: boolean;
}

const queue: Waiter[] = [];

// ── Reentranza (AsyncLocalStorage) ───────────────────────────────────────────
//
// Un job bg può avvolgere l'intera durata in withBgDbSlot e, al suo interno,
// chiamare withBgDbConnection o altri helper budgettati. Senza reentranza questo
// annidamento causerebbe un deadlock: il secondo acquire() attenderebbe uno slot
// mentre il primo lo tiene occupato. Con AsyncLocalStorage i wrapper annidati
// NELLO STESSO contesto non riacquisiscono lo slot.

const bgSlotContext = new AsyncLocalStorage<true>();

function isHoldingBgSlot(): boolean {
  return bgSlotContext.getStore() === true;
}

// ── Meccanica acquire/release ────────────────────────────────────────────────

function acquire(critical?: boolean): Promise<void> {
  // Kill-switch adattivo: rifiuta i job non critici quando il DB è lento.
  if (!critical && dbSlowPingsConsecutive >= BG_DB_SLOW_THRESHOLD) {
    droppedSlowKillSwitchTotal++;
    return Promise.reject(new BgDbSlowKillSwitchError(dbSlowPingsConsecutive, BG_DB_SLOW_THRESHOLD));
  }

  if (active < BG_DB_MAX_CONCURRENCY) {
    active++;
    return Promise.resolve();
  }

  if (queue.length >= BG_DB_MAX_QUEUE) {
    droppedOverflowTotal++;
    return Promise.reject(new BgDbQueueOverflowError(queue.length, BG_DB_MAX_QUEUE));
  }

  return new Promise<void>((resolve, reject) => {
    const enqueuedAt = Date.now();
    const waiter: Waiter = {
      resolve,
      reject,
      settled: false,
      timer: setTimeout(() => {
        if (waiter.settled) return;
        waiter.settled = true;
        const idx = queue.indexOf(waiter);
        if (idx !== -1) queue.splice(idx, 1);
        droppedTimeoutTotal++;
        reject(new BgDbQueueTimeoutError(Date.now() - enqueuedAt, BG_DB_QUEUE_TIMEOUT_MS));
      }, BG_DB_QUEUE_TIMEOUT_MS),
    };
    waiter.timer.unref?.();
    queue.push(waiter);
  });
}

function release(): void {
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (next.settled) continue; // già scaduto: salta
    next.settled = true;
    clearTimeout(next.timer);
    // Passa lo slot direttamente al prossimo in coda: active resta invariato.
    next.resolve();
    return;
  }
  active = Math.max(0, active - 1);
}

// ── API pubblica ─────────────────────────────────────────────────────────────

/**
 * Chiamato da db-collector ad ogni tick per aggiornare il contatore slow.
 * Quando il DB torna veloce (n=0) il kill-switch si disattiva automaticamente.
 */
export function setDbSlowPingsConsecutive(n: number): void {
  dbSlowPingsConsecutive = n;
}

/**
 * Esegue fn occupando uno slot del budget connessioni dei job in background.
 * Se tutti gli slot sono occupati, attende (FIFO) finché uno si libera.
 * Lo slot è sempre rilasciato in finally, anche sui rami d'errore.
 *
 * Rientrante: se il contesto async corrente tiene già uno slot, non
 * riacquisisce — riusa lo slot esterno.
 *
 * @param opts.critical  Bypassa il kill-switch adattivo. Solo per job essenziali.
 */
export async function withBgDbSlot<T>(fn: () => Promise<T>, opts?: { critical?: boolean }): Promise<T> {
  if (isHoldingBgSlot()) {
    return await fn();
  }
  await acquire(opts?.critical);
  try {
    return await bgSlotContext.run(true, fn);
  } finally {
    release();
  }
}

/**
 * Combina slot bg + connessione pg + statement_timeout a BG_DB_STATEMENT_TIMEOUT_MS.
 * Acquisisce uno slot del budget bg, poi una PoolClient dal pool principale,
 * imposta statement_timeout sulla sessione e passa la connessione a fn.
 * In finally ripristina il timeout di default, rilascia la connessione e libera
 * lo slot — in quest'ordine, anche su eccezioni.
 *
 * NON fare client.release() dentro fn: il release è gestito da questo wrapper.
 *
 * @param opts.critical  Bypassa il kill-switch adattivo.
 */
export async function withBgDbConnection<T>(
  fn: (client: import("pg").PoolClient) => Promise<T>,
  opts?: { critical?: boolean },
): Promise<T> {
  const reentrant = isHoldingBgSlot();
  if (!reentrant) await acquire(opts?.critical);
  let client: import("pg").PoolClient | null = null;
  try {
    client = await pool.connect();
    try { await client.query(`SET statement_timeout = '${BG_DB_STATEMENT_TIMEOUT_MS}'`); } catch { /* best-effort */ }
    if (reentrant) {
      return await fn(client);
    }
    const c = client;
    return await bgSlotContext.run(true, () => fn(c));
  } finally {
    if (client) {
      try { await client.query(`SET statement_timeout = '${POOL_STATEMENT_TIMEOUT_MS}'`); } catch { /* best-effort */ }
      client.release();
    }
    if (!reentrant) release();
  }
}

/**
 * Snapshot dello stato interno del governor. Identico a getBgDbLimiterStats()
 * di bg-db-limiter per compatibilità con i consumer esistenti (pool-collector).
 */
export function getBgDbLimiterStats(): {
  active: number;
  queued: number;
  max: number;
  maxQueue: number;
  droppedOverflowTotal: number;
  droppedTimeoutTotal: number;
  droppedSlowKillSwitchTotal: number;
  dbSlowPingsConsecutive: number;
} {
  return {
    active,
    queued: queue.length,
    max: BG_DB_MAX_CONCURRENCY,
    maxQueue: BG_DB_MAX_QUEUE,
    droppedOverflowTotal,
    droppedTimeoutTotal,
    droppedSlowKillSwitchTotal,
    dbSlowPingsConsecutive,
  };
}
