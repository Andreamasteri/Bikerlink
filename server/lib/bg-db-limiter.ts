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

const BG_DB_MAX_CONCURRENCY = 3;

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

function acquire(): Promise<void> {
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
 */
export async function withBgDbSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
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
} {
  return {
    active,
    queued: queue.length,
    max: BG_DB_MAX_CONCURRENCY,
    maxQueue: BG_DB_MAX_QUEUE,
    droppedOverflowTotal,
    droppedTimeoutTotal,
  };
}
