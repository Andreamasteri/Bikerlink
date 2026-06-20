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

let active = 0;
const queue: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < BG_DB_MAX_CONCURRENCY) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => queue.push(resolve));
}

function release(): void {
  const next = queue.shift();
  if (next) {
    // Passa lo slot direttamente al prossimo in coda: `active` resta invariato.
    next();
  } else {
    active = Math.max(0, active - 1);
  }
}

/**
 * Esegue `fn` occupando uno slot del budget connessioni dei job in background.
 * Se tutti gli slot sono occupati, attende (FIFO) finché uno si libera. Lo slot
 * è sempre rilasciato in `finally`, anche sui rami d'errore.
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

export function getBgDbLimiterStats(): { active: number; queued: number; max: number } {
  return { active, queued: queue.length, max: BG_DB_MAX_CONCURRENCY };
}
