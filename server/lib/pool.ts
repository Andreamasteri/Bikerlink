/**
 * pool.ts — istanza pg.Pool + tracer checkout + stats + monitoringPool.
 *
 * Questo modulo ha un'unica responsabilità: gestire il ciclo di vita delle
 * connessioni Postgres. Nessuna business logic, nessun retry, nessun budget bg.
 * Importa tutte le costanti da pool-config.ts (fonte unica di verità).
 */
import pg from "pg";
import {
  APP_NAME,
  MONITOR_APP_NAME,
  POOL_MAX,
  POOL_MIN,
  POOL_IDLE_TIMEOUT_MS,
  POOL_CONNECTION_TIMEOUT_MS,
  POOL_STATEMENT_TIMEOUT_MS,
  POOL_IDLE_IN_TRANSACTION_TIMEOUT_MS,
  MONITORING_POOL_MAX,
  MONITORING_POOL_IDLE_TIMEOUT_MS,
  MONITORING_POOL_CONNECTION_TIMEOUT_MS,
  MONITORING_POOL_STATEMENT_TIMEOUT_MS,
  POOL_SATURATION_GRACE_MS,
} from "./pool-config";

const { Pool } = pg;

// DATABASE_URL_DEV ha priorità in workspace dev (Neon dev branch).
// In produzione DATABASE_URL_DEV non è impostata → fallback su DATABASE_URL (Neon prod).
const dbUrl = process.env.DATABASE_URL_DEV ?? process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// ── Pool principale ──────────────────────────────────────────────────────────

export const pool = new Pool({
  connectionString: dbUrl,
  application_name: APP_NAME,
  keepAlive: true,
  // Neon richiede TLS esplicito (Neon Frankfurt, eu-central-1). Il flag è condizionale per
  // mantenere compatibilità con ambienti locali (senza neon.tech nell'URL).
  ssl: dbUrl.includes("neon.tech")
    ? { rejectUnauthorized: true }
    : false,
  // Rete di sicurezza lato SERVER contro il leak "idle in transaction": qualsiasi
  // sessione che apre una transazione (BEGIN) e resta idle oltre 60s viene uccisa
  // da Postgres, liberando il socket. Le query autocommit di drizzle non aprono
  // transazioni → non sono toccate. findSimilar usa BEGIN/COMMIT: se un percorso
  // d'errore lasciasse la txn appesa, Postgres la chiude invece di tenere la
  // connessione bloccata per minuti (causa diretta di "pool saturo ma 0 query
  // attive"). 60s > qualsiasi statement_timeout (5s pool / 12s bg) con margine.
  idle_in_transaction_session_timeout: POOL_IDLE_IN_TRANSACTION_TIMEOUT_MS,
  // 10s < timeout lato Replit managed DB (~20s) → connessioni rilasciate prima
  // che il server le droppi, evitando "Connection terminated unexpectedly".
  idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
  // 8s: dato sufficiente per Neon (Frankfurt, eu-central-1) ad accettare
  // nuove connessioni durante picchi di concorrenza (tick watchdog con
  // più collector in parallelo).
  connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
  // Limite esplicito di connessioni — evita saturation burst.
  max: POOL_MAX,
  // min=1: mantiene almeno 1 connessione calda tra i tick del watchdog (60s).
  // idleTimeoutMillis=10s evictava tutte le connessioni tra un tick e l'altro
  // → pool ripartiva da 0 conn stabilite ad ogni tick → picco di concorrenza
  // al momento del Promise.allSettled dei collector → waiting>0 sistematico.
  min: POOL_MIN,
  // 5s: le query non tengono connessioni appese indefinitamente in caso di
  // query lente o lock.
  statement_timeout: POOL_STATEMENT_TIMEOUT_MS,
});

pool.on("error", (err) => {
  console.error("[DB] Pool connection error (ignorato per evitare crash):", err.message);
});

// ── Tracer di checkout (connessioni esplicite con pool.connect()) ─────────────
//
// Strumentazione permanente e leggera per attribuire con CERTEZZA quale chiamante
// trattiene una connessione senza rilasciarla. Viene tracciata SOLO la forma
// promise di connect() (checkout espliciti, i rischiosi): le query autocommit
// di drizzle usano la forma callback (pool.query → auto-release, vita brevissima)
// → lasciata passare non tracciata per overhead trascurabile.
//
// Il pool-collector legge getCheckedOutConnections(minAgeMs) per stampare lo stack
// delle connessioni tenute oltre soglia.

interface ConnCheckout {
  id: number;
  acquiredAt: number;
  stack: string;
}

let _connSeq = 0;
const _checkedOut = new Map<number, ConnCheckout>();

const _origConnect = pool.connect.bind(pool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pool as any).connect = function patchedConnect(maybeCb?: unknown) {
  // Forma callback (usata internamente da pool.query → query autocommit drizzle):
  // pass-through non tracciato, è già auto-release e di vita brevissima.
  if (typeof maybeCb === "function") {
    return (_origConnect as (cb: unknown) => unknown)(maybeCb);
  }
  // Forma promise: checkout esplicito → traccia.
  return (_origConnect() as Promise<import("pg").PoolClient>).then((client) => {
    const id = ++_connSeq;
    const stack = (new Error().stack ?? "")
      .split("\n")
      .slice(2, 8)
      .map((l) => l.trim())
      .join(" | ");
    _checkedOut.set(id, { id, acquiredAt: Date.now(), stack });
    const origRelease = client.release.bind(client);
    let released = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).release = (err?: Error | boolean) => {
      if (!released) {
        released = true;
        _checkedOut.delete(id);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (origRelease as (e?: any) => unknown)(err);
    };
    return client;
  });
};

export interface CheckedOutConnection {
  id: number;
  ageMs: number;
  stack: string;
}

/**
 * Connessioni del pool principale attualmente acquisite con pool.connect()
 * (forma promise) e tenute da almeno minAgeMs. Ordinate dalla più vecchia.
 * Una connessione qui da minuti = il chiamante nel suo stack non ha rilasciato.
 */
export function getCheckedOutConnections(minAgeMs = 0): CheckedOutConnection[] {
  const now = Date.now();
  const out: CheckedOutConnection[] = [];
  for (const c of _checkedOut.values()) {
    const ageMs = now - c.acquiredAt;
    if (ageMs >= minAgeMs) out.push({ id: c.id, ageMs, stack: c.stack });
  }
  return out.sort((a, b) => b.ageMs - a.ageMs);
}

// ── Pool di monitoraggio riservato (max:1) ────────────────────────────────────
//
// Connessione SEPARATA dal pool principale: mai assegnata a job bg o traffico
// utente. Serve esclusivamente per interrogare pg_stat_activity durante una crisi
// di saturazione, quando il pool principale ha 0 connessioni libere.
//
// NOTE: va rimosso solo dopo che pool-governor ha il bypass critico (slot riservato
// per le query di diagnostica) — vedi task Fasi 4-7.

const monitoringPool = new Pool({
  connectionString: dbUrl,
  application_name: MONITOR_APP_NAME,
  max: MONITORING_POOL_MAX,
  idleTimeoutMillis: MONITORING_POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: MONITORING_POOL_CONNECTION_TIMEOUT_MS,
  statement_timeout: MONITORING_POOL_STATEMENT_TIMEOUT_MS,
  ssl: dbUrl.includes("neon.tech")
    ? { rejectUnauthorized: true }
    : false,
});
monitoringPool.on("error", (err) => {
  console.error("[DB/monitor] pool error:", err.message);
});

export interface BlockedQueryRow {
  pid: number;
  state: string;
  duration_s: number;
  state_duration_s: number;
  query: string;
  wait_event: string | null;
  wait_event_type: string | null;
  application_name: string;
}

/**
 * Snapshot istantaneo delle query non-idle in esecuzione sul DB.
 * Usa il pool di monitoraggio riservato: funziona anche quando il pool
 * principale è completamente saturo. Restituisce [] in caso di errore.
 */
export async function snapshotBlockedQueries(): Promise<BlockedQueryRow[]> {
  let client: import("pg").PoolClient | null = null;
  try {
    client = await monitoringPool.connect();
    const r = await client.query<BlockedQueryRow>(`
      SELECT
        pid,
        state,
        EXTRACT(EPOCH FROM (now() - query_start))::int   AS duration_s,
        EXTRACT(EPOCH FROM (now() - state_change))::int  AS state_duration_s,
        LEFT(query, 200)                                 AS query,
        wait_event,
        wait_event_type,
        COALESCE(application_name, '')                   AS application_name
      FROM pg_stat_activity
      WHERE datname  =  current_database()
        AND pid      <> pg_backend_pid()
        AND state    IS NOT NULL
      ORDER BY state_duration_s DESC NULLS LAST
      LIMIT 15
    `);
    return r.rows;
  } catch {
    return [];
  } finally {
    client?.release();
  }
}

// ── Stats e backpressure ──────────────────────────────────────────────────────

export interface PoolStats {
  total: number;
  idle: number;
  waiting: number;
  max: number;
  activePct: number;
}

/**
 * Snapshot of pg.Pool counters — zero I/O, instant read.
 * active = total − idle (connections currently executing a query).
 * activePct = active / max * 100 (saturation gauge, 0–100).
 */
export function getPoolStats(): PoolStats {
  const { totalCount, idleCount, waitingCount, options } = pool as typeof pool & {
    options: { max?: number };
  };
  const max = options?.max ?? POOL_MAX;
  const active = Math.max(0, totalCount - idleCount);
  return {
    total: totalCount,
    idle: idleCount,
    waiting: waitingCount,
    max,
    activePct: max > 0 ? Math.round((active / max) * 100) : 0,
  };
}

/**
 * Fast pool-health check — no DB query involved.
 * Returns false when the pool is saturated (all connections busy and at least
 * one request already waiting), meaning any new query would queue and likely
 * time out. Callers should return 503 immediately instead of touching the DB.
 */
export function isPoolHealthy(): boolean {
  const { totalCount, idleCount, waitingCount, options } = pool as typeof pool & {
    options: { max?: number };
  };
  const maxConns = options?.max ?? POOL_MAX;
  const saturated = totalCount >= maxConns && idleCount === 0 && waitingCount > 0;
  return !saturated;
}

/**
 * Backpressure veloce per il gate /api. Il pool è considerato "saturo in modo
 * sostenuto" solo se isPoolHealthy() resta false per almeno
 * POOL_SATURATION_GRACE_MS millisecondi CONTINUI. Un singolo istante di
 * saturazione (burst di pochi ms a regime) NON deve restituire 503.
 */
let poolSaturatedSince: number | null = null;

export function isPoolSaturatedSustained(): boolean {
  if (isPoolHealthy()) {
    poolSaturatedSince = null;
    return false;
  }
  const now = Date.now();
  if (poolSaturatedSince === null) {
    poolSaturatedSince = now;
    return false;
  }
  return now - poolSaturatedSince >= POOL_SATURATION_GRACE_MS;
}

// Re-export APP_NAME for consumers that import it from db.ts (backward compat)
export { APP_NAME, MONITOR_APP_NAME } from "./pool-config";
