/**
 * Runner degli scenari di carico (Task #4970).
 *
 * Un worker chiama ripetutamente `executeOp`: acquisisce un client dal pool di
 * test, esegue una singola operazione e misura latenza/errore. La scelta
 * dell'operazione dipende dallo scenario attivo (`pickOp`). I literal vettoriali
 * sono pre-generati (vedi sandbox) per non bruciare CPU sul client che genera il
 * carico — vogliamo misurare il DB, non il container.
 */
import type { OpKind, Pool, RunContext, Scenario } from "./types";

/** Esito di una singola operazione. */
export interface OpResult {
  ms: number;
  /** Codice errore Postgres (es. 40P01) o sentinella (POOL_TIMEOUT) se fallita. */
  errorCode?: string;
}

/** Sceglie il tipo di operazione in base allo scenario e a un random [0,1). */
export function pickOp(scenario: Scenario): OpKind {
  const r = Math.random();
  switch (scenario) {
    case "read":
      return r < 0.5 ? "read_hnsw" : "read_spatial";
    case "write":
      return "write";
    case "saturation":
    case "mixed":
    case "all":
    default:
      // 60% read (metà HNSW, metà spatial) / 30% write / 10% spatial puro.
      if (r < 0.3) return "read_hnsw";
      if (r < 0.6) return "read_spatial";
      if (r < 0.9) return "write";
      return "read_spatial";
  }
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Riferimento mutabile al contatore di seq per i write (per-processo). */
let writeSeq = 0;

/**
 * Esegue una singola operazione DB.
 *
 * Acquisisce il client DENTRO la funzione così che lo scenario "pool saturation"
 * (worker > pool.max) faccia accodare le connect() in eccesso: se il pool è
 * configurato con `connectionTimeoutMillis`, la connect() fallisce con
 * POOL_TIMEOUT, segnale diretto di saturazione sostenuta.
 */
export async function executeOp(pool: Pool, op: OpKind, ctx: RunContext): Promise<OpResult> {
  const t0 = performance.now();
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    return { ms: performance.now() - t0, errorCode: classifyConnectError(err) };
  }
  try {
    switch (op) {
      case "read_hnsw":
        await client.query(
          `SELECT id, embedding <=> $1::vector AS distance
             FROM _stress_embeddings
            ORDER BY embedding <=> $1::vector
            LIMIT 10`,
          [randomFrom(ctx.vectorLiterals)],
        );
        break;
      case "read_spatial": {
        const lon = -10 + Math.random() * 50;
        const lat = 30 + Math.random() * 35;
        await client.query(
          `SELECT COUNT(*) FROM _stress_spatial
            WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`,
          [lon, lat, 50_000],
        );
        break;
      }
      case "write": {
        const seq = ++writeSeq;
        await client.query(
          `INSERT INTO _stress_writes (worker, seq, value, payload)
           VALUES ($1, $2, $3, $4)`,
          [seq % 64, seq, Math.random() * 1000, `payload_${seq}_${Date.now()}`],
        );
        break;
      }
    }
    return { ms: performance.now() - t0 };
  } catch (err) {
    return { ms: performance.now() - t0, errorCode: classifyQueryError(err) };
  } finally {
    client.release();
  }
}

/** Quante write sono state tentate finora (per la verifica integrità). */
export function attemptedWrites(): number {
  return writeSeq;
}

function classifyConnectError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout exceeded when trying to connect|connection timeout/i.test(msg)) return "POOL_TIMEOUT";
  const code = (err as { code?: string })?.code;
  return typeof code === "string" ? code : "CONNECT_ERROR";
}

function classifyQueryError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  if (typeof code === "string" && code.length > 0) return code;
  const msg = err instanceof Error ? err.message : String(err);
  if (/statement timeout|canceling statement/i.test(msg)) return "57014";
  if (/deadlock/i.test(msg)) return "40P01";
  return "QUERY_ERROR";
}

/** Codici considerati "critici" → loggati all'istante nel .jsonl. */
export const CRITICAL_ERROR_CODES = new Set<string>([
  "40P01", // deadlock_detected
  "57014", // query_canceled (statement_timeout)
  "53300", // too_many_connections
  "53400", // configuration_limit_exceeded
  "08006", // connection_failure
  "08003", // connection_does_not_exist
  "POOL_TIMEOUT",
  "CONNECT_ERROR",
]);
