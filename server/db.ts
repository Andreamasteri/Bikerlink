import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/db";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/**
 * application_name marcato su OGNI connessione del pool principale. Senza questo,
 * in pg_stat_activity le nostre connessioni hanno application_name vuoto e sono
 * INDISTINGUIBILI da quelle del Postgres managed di Replit (pooler/manutenzione
 * piattaforma). Questo rende il sintomo "pool saturo ma 0 query attive"
 * non-attribuibile: non si può sapere se le connessioni idle anomale sono nostre.
 * Marcandole, il detector in pool-collector filtra ESATTAMENTE le nostre.
 */
export const APP_NAME = "bikerlink-app";
const MONITOR_APP_NAME = "bikerlink-monitor";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  application_name: APP_NAME,
  keepAlive: true,
  // Rete di sicurezza lato SERVER contro il leak "idle in transaction": qualsiasi
  // sessione che apre una transazione (BEGIN) e resta idle oltre 60s viene uccisa
  // da Postgres, liberando il socket. Le query autocommit di drizzle non aprono
  // transazioni → non sono toccate. findSimilar usa BEGIN/COMMIT: se un percorso
  // d'errore lasciasse la txn appesa, Postgres la chiude invece di tenere la
  // connessione bloccata per minuti (causa diretta di "pool saturo ma 0 query
  // attive"). 60s > qualsiasi statement_timeout (5s pool / 12s bg) con margine.
  idle_in_transaction_session_timeout: 60000,
  // 10s < timeout lato Replit managed DB (~20s) → connessioni rilasciate prima
  // che il server le droppi, evitando "Connection terminated unexpectedly".
  idleTimeoutMillis: 10000,
  // 3s: quando il pool è saturo o il DB è irraggiungibile, ogni tentativo di
  // connessione fallisce entro 3s invece di 10s. Con 4 query sequenziali nel
  // login handler il worst-case è 12s — ben sotto il proxy timeout (~30s).
  connectionTimeoutMillis: 3000,
  // Limite esplicito di connessioni — evita saturation burst.
  // NOTA TUNING (saturazione pool): max resta 10 — coerente con i limiti del DB
  // managed di Replit; alzarlo sposterebbe solo la contesa lato server DB. La
  // soluzione adottata NON è ingrandire il pool ma ridurre la contesa: i job in
  // background pesanti passano da un budget connessioni cooperativo
  // (server/lib/bg-db-limiter.ts) che li tiene a ≤3 connessioni concorrenti,
  // lasciando sempre ≥7 connessioni libere per il traffico utente. Vedi anche la
  // route admin resource-monitor (refactor da 7+16 connect → 1 client) e il
  // resource-graph-sampler (ogni 10s, ora retry+budget).
  max: 10,
  // 5s: le query non tengono connessioni appese indefinitamente in caso di
  // query lente o lock. Ridotto da 15s → 5s per il login hardening: il
  // circuit breaker si apre dopo 3 ping-failure dal watchdog, ma fino ad
  // allora ogni query individuale deve fallire entro ≤5s.
  statement_timeout: 5000,
});

pool.on("error", (err) => {
  console.error("[DB] Pool connection error (ignorato per evitare crash):", err.message);
});

// ── Step 1 (Task #5229): tracer di checkout delle connessioni del pool ────────
//
// Strumentazione permanente e leggera per attribuire con CERTEZZA — non per
// indovinare — quale chiamante trattiene una connessione senza rilasciarla.
//
// Ogni `await pool.connect()` (forma promise) registra un id incrementale +
// timestamp + uno stack trace ridotto catturato AL MOMENTO dell'acquisizione;
// `release()` lo cancella (con guardia contro il doppio-release). Il detector in
// pool-collector legge getCheckedOutConnections(minAgeMs) per stampare lo stack
// di origine delle connessioni tenute oltre soglia.
//
// COSTO: la cattura dello stack avviene SOLO sulla forma promise di connect(),
// cioè i checkout ESPLICITI (raw `pool.connect()` + transazioni drizzle) — quelli
// rischiosi. Le query autocommit di drizzle passano da `pool.query()` che
// internamente usa la forma CALLBACK di connect(): quella la lasciamo passare
// non tracciata (vita brevissima, release automatico) → overhead trascurabile.
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
 * Connessioni del pool principale attualmente acquisite con `pool.connect()`
 * (forma promise) e tenute da almeno `minAgeMs`. Ordinate dalla più vecchia.
 * Una connessione qui da minuti = il chiamante nel suo `stack` non ha rilasciato.
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

export const db = drizzle(pool, { schema });

// ── Pool di monitoraggio riservato (Fix #3 pool-saturation diagnosis) ─────────
//
// Connessione SEPARATA dal pool principale: max=1, mai assegnata a job bg o
// traffico utente. Serve esclusivamente per interrogare pg_stat_activity durante
// una crisi di saturazione, quando il pool principale ha 0 connessioni libere e
// qualsiasi pool.connect() resta in attesa indefinitamente.
//
// In condizioni normali questo client è inattivo (idle). Viene usato solo da
// snapshotBlockedQueries(), chiamato automaticamente dal db-collector quando
// rileva pool saturo.
const monitoringPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  application_name: MONITOR_APP_NAME,
  max: 1,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 4_000,
  statement_timeout: 8_000,
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

export class DbTimeoutError extends Error {
  readonly isDbTimeout = true;
  constructor(ms: number) {
    super(`DB query timeout after ${ms}ms`);
    this.name = "DbTimeoutError";
  }
}

export function withDbTimeout<T>(promise: Promise<T>, ms = 4500): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DbTimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Codici di errore Postgres/socket considerati TRANSITORI: una disconnessione o
 * timeout di connessione che molto probabilmente rientra da solo entro pochi ms.
 * NON includono errori applicativi (constraint 23xxx, syntax 42xxx, ecc.): quelli
 * non vanno ritentati perché ritenteranno all'infinito senza successo.
 */
const TRANSIENT_DB_CODES = new Set<string>([
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "08000", // connection_exception
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08003", // connection_does_not_exist
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "08006", // connection_failure
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
]);

const TRANSIENT_DB_MESSAGE_RE =
  /connection terminated|connection timeout|terminated unexpectedly|timeout expired|server closed the connection|connection ended|connection reset|read econnreset|socket hang up/i;

/**
 * Riconoscimento centralizzato del "blip" DB transitorio. Unico punto di verità
 * usato sia dal retry wrapper sia dai cicli di background, così la definizione di
 * "transitorio" resta coerente in tutto il server.
 */
export function isTransientDbError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DbTimeoutError) return true;
  if (typeof err === "object" && (err as { isDbTimeout?: boolean }).isDbTimeout === true) return true;
  const code = typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  if (typeof code === "string" && TRANSIENT_DB_CODES.has(code)) return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return TRANSIENT_DB_MESSAGE_RE.test(message);
}

export interface DbRetryOptions {
  /** Numero di RITENTATIVI dopo il primo tentativo (default 2 → max 3 tentativi). */
  retries?: number;
  /** Backoff iniziale in ms (default 120). Cresce esponenzialmente con jitter. */
  baseDelayMs?: number;
  /** Cap massimo del backoff in ms (default 1000). */
  maxDelayMs?: number;
}

/**
 * Esegue una funzione DB ritentando SOLO su errori transitori riconosciuti
 * (timeout/disconnessione di connessione). Gli errori applicativi/di query
 * (constraint, syntax, ecc.) vengono propagati immediatamente senza retry.
 *
 * Backoff esponenziale con jitter, numero di tentativi piccolo: assorbe un
 * singolo blip del DB senza generare la cascata di errori, ma se il guasto è
 * prolungato esaurisce i retry e propaga l'errore (il chiamante degrada).
 */
export async function withDbRetry<T>(fn: () => Promise<T>, opts: DbRetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 120;
  const maxDelayMs = opts.maxDelayMs ?? 1000;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientDbError(err) || attempt >= retries) throw err;
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const delay = backoff * (0.5 + Math.random()); // ±50% jitter
      attempt++;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
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
  const maxConns = options?.max ?? 10;
  const saturated = totalCount >= maxConns && idleCount === 0 && waitingCount > 0;
  return !saturated;
}

/**
 * Backpressure veloce per il gate /api. Il pool è considerato "saturo in modo
 * sostenuto" solo se isPoolHealthy() resta false per almeno
 * POOL_SATURATION_GRACE_MS millisecondi CONTINUI. Un singolo istante di
 * saturazione (burst di pochi ms a regime) NON deve restituire 503: il grace
 * window evita falsi positivi sul percorso richiesta.
 *
 * Campionato a ogni chiamata: il gate lo invoca per richiesta, quindi sotto
 * carico è ben campionato; senza traffico non c'è comunque nulla da sheddare.
 *
 * Perché serve: con il fix al circuit breaker (db-collector) la sola saturazione
 * NON apre più il breaker, quindi questo è il meccanismo che degrada le
 * richieste con un 503 veloce + Retry-After invece di lasciarle in coda per
 * connectionTimeoutMillis e fallire poi con 500. Sheddare il carico fa drenare
 * il pool ed evita il pile-up che il 20 giu ha tenuto il pool a 10/10.
 */
const POOL_SATURATION_GRACE_MS = 500;
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
  const max = options?.max ?? 10;
  const active = Math.max(0, totalCount - idleCount);
  return {
    total: totalCount,
    idle: idleCount,
    waiting: waitingCount,
    max,
    activePct: max > 0 ? Math.round((active / max) * 100) : 0,
  };
}
