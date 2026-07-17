/**
 * db.ts — Facade thin per compatibilità backward.
 *
 * Questo file è la porta d'accesso storica al database usata da tutto il server.
 * Il pool e la sua configurazione sono stati estratti in:
 *
 *   server/lib/pool-config.ts  — costanti del pool (fonte unica di verità)
 *   server/lib/pool.ts         — istanza pg.Pool, tracer, stats, backpressure
 *   server/lib/pool-governor.ts — budget connessioni bg (rimpiazza bg-db-limiter)
 *
 * NOTA: isTransientDbError / withDbRetry (firma fn+opts) rimangono qui perché
 * esiste già server/lib/db-retry.ts con una firma diversa (label, fn) usata
 * da altri consumer. I due helper coesistono per scelta: quello qui serve agli
 * import da "../db", quello in lib/db-retry.ts serve agli import da "lib/db-retry".
 */
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/db";

// ── Re-export da pool.ts ────────────────────────────────────────────────────
export {
  APP_NAME,
  pool,
  CheckedOutConnection,
  getCheckedOutConnections,
  BlockedQueryRow,
  snapshotBlockedQueries,
  isPoolHealthy,
  isPoolSaturatedSustained,
  PoolStats,
  getPoolStats,
} from "./lib/pool";

// ── Istanza Drizzle ─────────────────────────────────────────────────────────
import { pool } from "./lib/pool";
export const db = drizzle(pool, { schema });

// ── Errori e utility timeout ────────────────────────────────────────────────

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

// ── Classificatore errori transitori ────────────────────────────────────────
//
// Unico punto di verità per decidere se un errore DB è transitorio (usato dal
// retry wrapper e dai cicli di background che importano da "../db"). La versione
// in lib/db-retry.ts ha firma diversa (label, fn) per consumer che importano
// direttamente da "lib/db-retry".

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
