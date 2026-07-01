// === CONTROL PLANE — budget connessioni DB ===
// Questo modulo APPARTIENE al control plane: protegge attivamente una risorsa
// (le connessioni del pool) regolando la concorrenza dei job di background. Non
// è osservabilità (non misura/segnala lo stato): è un meccanismo che CAMBIA il
// comportamento del sistema per preservarne la salute. La salute risultante è
// poi esposta separatamente dall'Health Arbiter (server/lib/health-arbiter.ts).
//
// Limita la concorrenza dei job DB in background per riservare connessioni al
// traffico utente.
//
// Il pool Postgres ha max=10 connessioni (vedi server/db.ts). Senza un
// coordinamento globale, se più job interni (sampler risorse, monitor admin,
// collettori, manutenzione) finiscono nella stessa finestra temporale possono
// acquisire molte connessioni insieme e affamare le route API utente: il pool
// va in `waiting`, le query in coda scadono e si genera la cascata di
// `DrizzleQueryError` osservata (matching, CoordinateHistory, push, ecc. —
// tutte vittime collaterali della saturazione).
//
// Questo semaforo cooperativo garantisce che i consumatori in background che vi
// si avvolgono non usino MAI più di BG_DB_MAX_CONCURRENCY connessioni del pool
// contemporaneamente, lasciando sempre (max - BG_DB_MAX_CONCURRENCY) connessioni
// libere per il traffico utente. È un budget *opt-in*: solo i job interni pesanti
// vi si registrano; le route utente restano non vincolate (devono poter usare
// tutte le connessioni rimanenti senza attese).
//
// Scelta del valore: con max=10 riserviamo 3 slot ai job interni e teniamo 7
// connessioni sempre disponibili per gli utenti. È sufficiente per far girare i
// cicli interni con un minimo di parallelismo senza mai poter saturare il pool
// da soli.

import { pool } from "../db";

const BG_DB_MAX_CONCURRENCY = 3;

// ─── Fix 1: statement_timeout su connessioni bg ──────────────────────────────
// Ogni connessione acquisita da withBgDbConnection riceve un timeout esplicito
// di 12s. Postgres uccide la query e rilascia la connessione automaticamente:
// nessuna query bg può più tenere bloccato uno slot oltre 12 secondi.
// NOTA: VACUUM è escluso da statement_timeout in Postgres — il timeout non
// interrompe operazioni di manutenzione legittime.
const BG_DB_STATEMENT_TIMEOUT_MS = 12_000;
// Timeout del pool (usato per ripristinare la connessione prima del release).
const POOL_DEFAULT_STATEMENT_TIMEOUT_MS = 5_000;

// ─── Fix 2: kill-switch adattivo ─────────────────────────────────────────────
// Quando il db-collector rileva DB lento (≥N campioni consecutivi con p95>5s)
// lo comunica via setDbSlowPingsConsecutive(). withBgDbSlot / withBgDbConnection
// rifiutano i nuovi job non critici immediatamente (BgDbSlowKillSwitchError),
// lasciando che il DB si scarichi. Appena i campioni lenti tornano a 0 i job
// riprendono automaticamente. I job critici (es. health check, circuit breaker)
// sono esclusi impostando { critical: true }.
const BG_DB_SLOW_THRESHOLD = 2; // campioni consecutivi lenti per attivare il kill-switch

let dbSlowPingsConsecutive = 0;
let droppedSlowKillSwitchTotal = 0;

/** Chiamato da db-collector ad ogni tick per aggiornare il contatore slow. */
export function setDbSlowPingsConsecutive(n: number): void {
  dbSlowPingsConsecutive = n;
}

// ─── Backlog containment (Task #4798) ───────────────────────────────────────
//
// Quando il DB rallenta (ping a decine di secondi, pool saturo) ogni timer
// periodico continua a chiamare withBgDbSlot mentre gli slot non si liberano:
// senza un tetto la coda cresce illimitata (osservato `db.bg_limiter.queued`
// salire da 16 a 101 in una notte) → pile-up che peggiora la saturazione.
//
// Due guardie cooperano:
//   1. Tetto sulla coda (BG_DB_MAX_QUEUE): oltre questa soglia i nuovi job
//      vengono RIFIUTATI subito (BgDbQueueOverflowError). I chiamanti sono job
//      di background non critici (sampler, collector, manutenzione): rieseguono
//      al tick successivo, quindi rigettare = coalescing naturale.
//   2. Timeout d'attesa in coda (BG_DB_QUEUE_TIMEOUT_MS): un job che resta in
//      coda oltre questo limite è ormai stantio (il suo tick è già passato) →
//      viene scartato (BgDbQueueTimeoutError) liberando spazio per lavoro
//      fresco. Sotto un ping DB lungo questo drena la coda mentre i 3 slot
//      attivi macinano, impedendo l'accumulo.
const BG_DB_MAX_QUEUE = Number.parseInt(process.env.BG_DB_MAX_QUEUE ?? "", 10) || 64;
const BG_DB_QUEUE_TIMEOUT_MS = Number.parseInt(process.env.BG_DB_QUEUE_TIMEOUT_MS ?? "", 10) || 30_000;

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

// ─── Task #5316 — distinguere i drop "attesi" del limiter dagli errori reali ──
// Un job scartato da questo modulo (kill-switch adattivo, coda piena, coda
// scaduta) NON è un bug applicativo: è la valvola di sfogo che protegge il
// pool. I chiamanti (es. scheduler.cycle.ts) usano questo helper per loggare
// questi drop come WARN "posticipato" invece di ERROR generico, ed escluderli
// dal conteggio errori che alimenta gli alert high/critical del watchdog.
export function isBgDbLimiterDropError(err: unknown): boolean {
  return (
    err instanceof BgDbSlowKillSwitchError ||
    err instanceof BgDbQueueOverflowError ||
    err instanceof BgDbQueueTimeoutError
  );
}

interface Waiter {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  settled: boolean;
}

let active = 0;
let droppedOverflowTotal = 0;
let droppedTimeoutTotal = 0;
const queue: Waiter[] = [];

function acquire(critical?: boolean): Promise<void> {
  // Fix 2: kill-switch adattivo — rifiuta i job non critici quando il DB è lento.
  // I job critici (es. health check) bypassano il kill-switch con { critical: true }.
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
    // Non bloccare lo shutdown del processo per via di questi timer.
    waiter.timer.unref?.();
    queue.push(waiter);
  });
}

function release(): void {
  // Trova il prossimo waiter ancora valido (non scaduto) e passagli lo slot.
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (next.settled) continue; // già scaduto: salta, lo slot resta da assegnare
    next.settled = true;
    clearTimeout(next.timer);
    // Passa lo slot direttamente al prossimo in coda: `active` resta invariato.
    next.resolve();
    return;
  }
  active = Math.max(0, active - 1);
}

/**
 * Esegue `fn` occupando uno slot del budget connessioni dei job in background.
 * Se tutti gli slot sono occupati, attende (FIFO) finché uno si libera. Lo slot
 * è sempre rilasciato in `finally`, anche sui rami d'errore.
 *
 * Sotto pressione la coda è limitata: oltre BG_DB_MAX_QUEUE i nuovi job sono
 * rigettati con BgDbQueueOverflowError, e un job che attende oltre
 * BG_DB_QUEUE_TIMEOUT_MS viene scartato con BgDbQueueTimeoutError. In entrambi i
 * casi `fn` NON viene eseguita. I chiamanti di background devono tollerare il
 * rigetto (rieseguono al tick successivo) — è una valvola di sfogo voluta.
 *
 * Va avvolto attorno alla porzione di lavoro che ACQUISISCE connessioni dal pool
 * (query/`pool.connect()`), non attorno a calcoli in-memory: tenere lo slot più
 * a lungo del necessario riduce inutilmente il parallelismo degli altri job.
 *
 * Per job che acquisiscono una PoolClient esplicitamente, preferire
 * `withBgDbConnection` che gestisce anche il statement_timeout a 12s (Fix 1).
 *
 * @param opts.critical  Se true, bypassa il kill-switch adattivo (Fix 2).
 *                       Usare solo per job essenziali alla salute del sistema.
 */
export async function withBgDbSlot<T>(fn: () => Promise<T>, opts?: { critical?: boolean }): Promise<T> {
  await acquire(opts?.critical);
  try {
    return await fn();
  } finally {
    release();
  }
}

/**
 * Fix 1 — Combina slot bg + connessione pg + statement_timeout a 12s.
 *
 * Acquisce uno slot del budget bg, poi una PoolClient dal pool principale,
 * imposta `statement_timeout = 12s` sulla sessione e passa la connessione a
 * `fn`. In `finally` ripristina il timeout di default del pool, rilascia la
 * connessione e libera lo slot — in quest'ordine, anche su eccezioni.
 *
 * Questo garantisce che nessuna query bg possa tenere bloccata una connessione
 * oltre 12 secondi (Postgres uccide la query e rilascia il socket). VACUUM e
 * altri comandi di manutenzione non sono interrotti da statement_timeout in
 * Postgres, quindi questo wrapper è sicuro anche per operazioni di pulizia.
 *
 * NON fare `client.release()` dentro `fn`: il release è gestito da questo
 * wrapper. NON annidare `withBgDbConnection` o `withBgDbSlot` dentro `fn`:
 * l'annidamento può causare deadlock sul semaforo.
 *
 * @param opts.critical  Se true, bypassa il kill-switch adattivo (Fix 2).
 */
export async function withBgDbConnection<T>(
  fn: (client: import("pg").PoolClient) => Promise<T>,
  opts?: { critical?: boolean },
): Promise<T> {
  await acquire(opts?.critical);
  let client: import("pg").PoolClient | null = null;
  try {
    client = await pool.connect();
    try { await client.query(`SET statement_timeout = '${BG_DB_STATEMENT_TIMEOUT_MS}'`); } catch { /* best-effort */ }
    return await fn(client);
  } finally {
    if (client) {
      try { await client.query(`SET statement_timeout = '${POOL_DEFAULT_STATEMENT_TIMEOUT_MS}'`); } catch { /* best-effort */ }
      client.release();
    }
    release();
  }
}

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
