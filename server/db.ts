import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/db";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  keepAlive: true,
  // 10s < timeout lato Replit managed DB (~20s) → connessioni rilasciate prima
  // che il server le droppi, evitando "Connection terminated unexpectedly".
  idleTimeoutMillis: 10000,
  // 3s: quando il pool è saturo o il DB è irraggiungibile, ogni tentativo di
  // connessione fallisce entro 3s invece di 10s. Con 4 query sequenziali nel
  // login handler il worst-case è 12s — ben sotto il proxy timeout (~30s).
  connectionTimeoutMillis: 3000,
  // Limite esplicito di connessioni — evita saturation burst.
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

export const db = drizzle(pool, { schema });

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
