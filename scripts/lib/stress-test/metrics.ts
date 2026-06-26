/**
 * Accumulatore metriche + logging live (Task #4970).
 *
 * Un singolo Accumulator raccoglie le latenze e gli errori da TUTTI i worker; a
 * ogni tick (default 60s) `snapshot()` calcola percentili e throughput della
 * finestra e azzera. Le latenze globali finiscono in un istogramma a bucket fissi
 * (memoria costante anche su 24h). I writer appendono al .jsonl, sovrascrivono il
 * live.json e inseriscono una riga in resource_samples (source='stress_test').
 */
import * as fs from "fs";
import type { OpResult } from "./scenarios";
import type { LiveSnapshot, Pool, Scenario, TickSnapshot } from "./types";

/** Bordi superiori dei bucket istogramma (ms). L'ultimo è "overflow". */
export const HISTOGRAM_BUCKETS_MS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, Infinity];

export class Accumulator {
  // Finestra corrente (azzerata a ogni tick).
  private winLatencies: number[] = [];
  private winErrors = 0;
  private winQueries = 0;
  private winErrorCodes: Record<string, number> = {};
  private winPoolFullSamples = 0;
  private winPoolSamples = 0;
  private winPoolWaitingMax = 0;

  // Globali (intero test).
  readonly histogram = new Array(HISTOGRAM_BUCKETS_MS.length).fill(0);
  totalQueries = 0;
  totalErrors = 0;
  readonly totalErrorCodes: Record<string, number> = {};
  globalMaxMs = 0;

  record(res: OpResult): void {
    this.winQueries++;
    this.totalQueries++;
    this.winLatencies.push(res.ms);
    this.bumpHistogram(res.ms);
    if (res.ms > this.globalMaxMs) this.globalMaxMs = res.ms;
    if (res.errorCode) {
      this.winErrors++;
      this.totalErrors++;
      this.winErrorCodes[res.errorCode] = (this.winErrorCodes[res.errorCode] ?? 0) + 1;
      this.totalErrorCodes[res.errorCode] = (this.totalErrorCodes[res.errorCode] ?? 0) + 1;
    }
  }

  /** Campiona lo stato del pool (chiamato spesso dal tick loop di monitoraggio). */
  samplePool(full: boolean, waiting: number): void {
    this.winPoolSamples++;
    if (full) this.winPoolFullSamples++;
    if (waiting > this.winPoolWaitingMax) this.winPoolWaitingMax = waiting;
  }

  private bumpHistogram(ms: number): void {
    for (let i = 0; i < HISTOGRAM_BUCKETS_MS.length; i++) {
      if (ms <= HISTOGRAM_BUCKETS_MS[i]) {
        this.histogram[i]++;
        return;
      }
    }
  }

  /** Aggrega la finestra in uno snapshot e azzera per il tick successivo. */
  snapshot(tick: number, phase: Scenario, windowSec: number, remainingSec: number): TickSnapshot {
    const sorted = [...this.winLatencies].sort((a, b) => a - b);
    const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
    const snap: TickSnapshot = {
      tick,
      ts: new Date().toISOString(),
      phase,
      queries: this.winQueries,
      errors: this.winErrors,
      errorRate: this.winQueries ? this.winErrors / this.winQueries : 0,
      throughputQps: windowSec ? round2(this.winQueries / windowSec) : 0,
      p50Ms: round2(pct(0.5)),
      p95Ms: round2(pct(0.95)),
      p99Ms: round2(pct(0.99)),
      maxMs: round2(sorted.length ? sorted[sorted.length - 1] : 0),
      poolFullPct: this.winPoolSamples ? round2((this.winPoolFullSamples / this.winPoolSamples) * 100) : 0,
      poolWaiting: this.winPoolWaitingMax,
      errorCodes: { ...this.winErrorCodes },
      remainingSec,
    };
    // Reset finestra.
    this.winLatencies = [];
    this.winErrors = 0;
    this.winQueries = 0;
    this.winErrorCodes = {};
    this.winPoolFullSamples = 0;
    this.winPoolSamples = 0;
    this.winPoolWaitingMax = 0;
    return snap;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Path dei file di log per la data odierna (locale). */
export function logPaths(now = new Date()): { jsonl: string; live: string; report: string; dir: string } {
  const dir = "logs";
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return {
    dir,
    jsonl: `${dir}/stress-test-${ymd}.jsonl`,
    live: `${dir}/stress-test-live.json`,
    report: `${dir}/stress-test-${ymd}-report.json`,
  };
}

export function ensureLogDir(): void {
  if (!fs.existsSync("logs")) fs.mkdirSync("logs", { recursive: true });
}

export function appendJsonl(path: string, obj: unknown): void {
  fs.appendFileSync(path, JSON.stringify(obj) + "\n");
}

export function writeLive(path: string, live: LiveSnapshot): void {
  fs.writeFileSync(path, JSON.stringify(live, null, 2));
}

/**
 * Evento critico loggato all'ISTANTE (non al tick) con throttling per codice:
 * massimo un evento per codice ogni THROTTLE_MS per non inondare il .jsonl
 * durante una tempesta (es. deadlock a raffica).
 */
const THROTTLE_MS = 5_000;
const _lastCritical: Record<string, number> = {};

export function logCriticalEvent(jsonlPath: string, code: string, detail: Record<string, unknown>): void {
  const now = Date.now();
  if (_lastCritical[code] && now - _lastCritical[code] < THROTTLE_MS) return;
  _lastCritical[code] = now;
  appendJsonl(jsonlPath, { type: "critical", ts: new Date().toISOString(), code, ...detail });
}

/** Inserisce una riga in resource_samples con source='stress_test' via monitoring pool. */
export async function insertResourceSample(monPool: Pool, rssMb: number): Promise<void> {
  const client = await monPool.connect();
  try {
    const sizeRes = await client.query<{ size_bytes: string }>(
      `SELECT pg_database_size(current_database()) AS size_bytes`,
    );
    const dbSizeMb = Math.round(Number(sizeRes.rows[0]?.size_bytes ?? 0) / 1024 / 1024);
    await client.query(
      `INSERT INTO resource_samples (sampled_at, db_size_mb, backend_rss_mb, source)
       VALUES (now(), $1, $2, 'stress_test')`,
      [dbSizeMb, rssMb],
    );
  } finally {
    client.release();
  }
}
