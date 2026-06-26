/**
 * Tipi condivisi dello stress test DB (Task #4970).
 *
 * Tutti i moduli sotto scripts/lib/stress-test/ importano da qui per restare
 * disaccoppiati: il CLI orchestratore (scripts/db-stress-test.ts) compone questi
 * pezzi senza che si conoscano fra loro.
 */
import type pg from "pg";

export type Pool = pg.Pool;

/** Scenari di carico selezionabili via --scenario. */
export type Scenario = "all" | "read" | "write" | "saturation" | "mixed";

/** Tipo di singola operazione DB eseguita da un worker. */
export type OpKind = "read_hnsw" | "read_spatial" | "write";

export interface CliOptions {
  durationSec: number;
  workers: number;
  scenario: Scenario;
  dryRun: boolean;
  quiet: boolean;
}

/** Severità di un finding del motore di rilevamento debolezze. */
export type Severity = "info" | "warn" | "critical";

export interface Finding {
  severity: Severity;
  /** Categoria stabile (latency, pool, errors, lock, slow_query, index, integrity). */
  category: string;
  description: string;
  /** Evidenza concreta: numeri, timestamp, codici errore. */
  evidence: Record<string, unknown>;
  /** Raccomandazione testuale azionabile. */
  recommendation: string;
}

/** Snapshot aggregato di una finestra di tick (60s di default). */
export interface TickSnapshot {
  tick: number;
  ts: string;
  /** Fase/scenario attivo in questo tick. */
  phase: Scenario;
  queries: number;
  errors: number;
  errorRate: number;
  throughputQps: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  /** % di tempo nel tick con pool saturo (campionato). */
  poolFullPct: number;
  poolWaiting: number;
  errorCodes: Record<string, number>;
  remainingSec: number;
}

/** Stato vivo scritto in logs/stress-test-live.json ogni tick. */
export interface LiveSnapshot {
  startedAt: string;
  updatedAt: string;
  scenario: Scenario;
  workers: number;
  elapsedSec: number;
  remainingSec: number;
  progressPct: number;
  totalQueries: number;
  totalErrors: number;
  lastTick: TickSnapshot | null;
  findings: Finding[];
}

/** Contesto runtime passato ai runner degli scenari. */
export interface RunContext {
  /** Vettori 1536-dim pre-generati (literal pgvector) per la similarity HNSW. */
  vectorLiterals: string[];
  /** Numero di righe seed nelle tabelle sandbox. */
  spatialRows: number;
  embeddingRows: number;
}
