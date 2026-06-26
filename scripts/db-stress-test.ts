/**
 * DB Stress Test — generatore di carico controllato sul database (Task #4970).
 *
 * Lancia uno stress test a lunga durata (default 24h) ad APP SPENTA per misurare
 * latenze, saturazione pool, errori e contesa sotto carico, e segnalare
 * automaticamente debolezze/incongruenze nel report finale.
 *
 * Uso:
 *   npx tsx scripts/db-stress-test.ts --duration=86400 --workers=6
 *   npx tsx scripts/db-stress-test.ts --scenario=saturation --workers=20
 *   npx tsx scripts/db-stress-test.ts --dry-run
 *
 * Flag:
 *   --duration=<sec>   durata totale (default 86400 = 24h)
 *   --workers=<n>      worker concorrenti (default 6)
 *   --scenario=<s>     all|read|write|saturation|mixed (default all)
 *   --dry-run          smoke test rapido (~10s): valida l'intera pipeline
 *   --quiet            niente progress bar (solo i tick e il report)
 *
 * Vedi .agents/skills/stress-test-db-prod/SKILL.md per il modello operativo
 * completo (Power mode, monitoraggio non presidiato, lettura findings).
 */
import pg from "pg";
import { setupSandbox, teardownSandbox, verifyWriteIntegrity, type IntegrityResult } from "./lib/stress-test/sandbox";
import { executeOp, pickOp, attemptedWrites, CRITICAL_ERROR_CODES } from "./lib/stress-test/scenarios";
import {
  Accumulator,
  appendJsonl,
  ensureLogDir,
  insertResourceSample,
  logCriticalEvent,
  logPaths,
  writeLive,
} from "./lib/stress-test/metrics";
import {
  buildFindings,
  explainSampleReads,
  sampleLocks,
  type LockSample,
  type SeqScanFinding,
} from "./lib/stress-test/findings";
import { buildReport, printSummary, writeReport } from "./lib/stress-test/report";
import type { CliOptions, Finding, Scenario, TickSnapshot } from "./lib/stress-test/types";

const { Pool } = pg;
const TICK_MS = 60_000;
const POOL_SAMPLE_MS = 1_000;
const SCENARIO_ROTATION: Scenario[] = ["read", "write", "saturation", "mixed"];

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const eq = args.find((a) => a.startsWith(`--${name}=`));
    if (eq) return eq.split("=")[1];
    const idx = args.indexOf(`--${name}`);
    if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith("--")) return args[idx + 1];
    return undefined;
  };
  const scenarioRaw = (get("scenario") ?? "all") as Scenario;
  const valid: Scenario[] = ["all", "read", "write", "saturation", "mixed"];
  return {
    durationSec: Math.max(1, parseInt(get("duration") ?? "86400", 10) || 86400),
    workers: Math.max(1, parseInt(get("workers") ?? "6", 10) || 6),
    scenario: valid.includes(scenarioRaw) ? scenarioRaw : "all",
    dryRun: args.includes("--dry-run"),
    quiet: args.includes("--quiet"),
  };
}

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL non impostata. Impossibile lanciare lo stress test.");
  process.exit(1);
}

const opts = parseArgs();

/**
 * In "all" gli scenari ruotano nel tempo; negli scenari singoli la fase è fissa.
 * Pool saturation forza testPool.max < workers per accodare le connect().
 */
function poolMaxFor(o: CliOptions): number {
  if (o.scenario === "saturation") return Math.max(1, Math.floor(o.workers / 2));
  return o.workers;
}

function activePhase(o: CliOptions, elapsedSec: number): Scenario {
  if (o.scenario !== "all") return o.scenario;
  // Ruota ogni ~quarto della durata totale (min 60s per fase).
  const slice = Math.max(60, Math.floor(o.durationSec / SCENARIO_ROTATION.length));
  return SCENARIO_ROTATION[Math.min(SCENARIO_ROTATION.length - 1, Math.floor(elapsedSec / slice))];
}

async function main(): Promise<void> {
  ensureLogDir();
  const paths = logPaths();
  const startedAt = Date.now();
  const acc = new Accumulator();
  const history: TickSnapshot[] = [];
  const lockSamples: LockSample[] = [];
  let seqScans: SeqScanFinding[] = [];
  let integrity: IntegrityResult | null = null;
  let stopping = false;
  let finalized = false;

  // Pool di test (load generator) + pool di monitoraggio isolato (max=1).
  // Il pool di monitoraggio NON interferisce col carico: serve a leggere
  // pg_stat_activity/pg_locks, EXPLAIN e inserire in resource_samples.
  const testPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: poolMaxFor(opts),
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    idleTimeoutMillis: 10_000,
  });
  testPool.on("error", (err) => logCriticalEvent(paths.jsonl, "POOL_ERROR", { message: err.message }));
  const monPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 8_000,
    idleTimeoutMillis: 60_000,
  });
  monPool.on("error", () => {});

  console.log(`🔥 DB Stress Test — scenario=${opts.scenario} workers=${opts.workers} durata=${opts.durationSec}s${opts.dryRun ? " [DRY-RUN]" : ""}`);
  console.log(`   Log: ${paths.jsonl}  Live: ${paths.live}`);

  console.log("   Setup tabelle sandbox _stress_*…");
  const ctx = await setupSandbox(testPool, {
    embeddingRows: opts.dryRun ? 50 : 1_000,
    spatialRows: opts.dryRun ? 200 : 5_000,
    vectorPoolSize: opts.dryRun ? 4 : 20,
  });

  const deadline = startedAt + (opts.dryRun ? 10_000 : opts.durationSec * 1000);

  const cleanup = async (reason: string): Promise<void> => {
    if (finalized) return;
    finalized = true;
    stopping = true;
    console.log(`\n🧹 Finalizzazione (${reason})…`);
    try {
      integrity = await verifyWriteIntegrity(monPool, attemptedWrites());
    } catch { /* sandbox forse già rimossa */ }
    try {
      seqScans = await explainSampleReads(monPool);
    } catch { /* ignore */ }
    // Snapshot finale della finestra parziale in corso.
    const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    history.push(acc.snapshot(history.length + 1, activePhase(opts, (Date.now() - startedAt) / 1000), TICK_MS / 1000, remaining));

    const findings = buildFindings({
      history,
      totalQueries: acc.totalQueries,
      totalErrors: acc.totalErrors,
      totalErrorCodes: acc.totalErrorCodes,
      lockSamples,
      seqScans,
      integrity,
    });
    const report = buildReport({
      scenario: opts.scenario,
      workers: opts.workers,
      durationSec: opts.dryRun ? 10 : opts.durationSec,
      elapsedSec: Math.round((Date.now() - startedAt) / 1000),
      totalQueries: acc.totalQueries,
      totalErrors: acc.totalErrors,
      globalMaxMs: acc.globalMaxMs,
      histogram: acc.histogram,
      errorCodes: acc.totalErrorCodes,
      history,
      findings,
    });
    writeReport(paths.report, report);
    writeLiveSnapshot(findings);
    appendJsonl(paths.jsonl, { type: "report", ts: new Date().toISOString(), summary: { totalQueries: report.totalQueries, totalErrors: report.totalErrors, findings: findings.length } });
    printSummary(report, paths.report);

    console.log("   Teardown tabelle sandbox…");
    try { await teardownSandbox(testPool); } catch { /* ignore */ }
    await testPool.end().catch(() => {});
    await monPool.end().catch(() => {});
  };

  function writeLiveSnapshot(findings: Finding[]): void {
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    const totalSec = opts.dryRun ? 10 : opts.durationSec;
    writeLive(paths.live, {
      startedAt: new Date(startedAt).toISOString(),
      updatedAt: new Date().toISOString(),
      scenario: opts.scenario,
      workers: opts.workers,
      elapsedSec,
      remainingSec: Math.max(0, totalSec - elapsedSec),
      progressPct: Math.min(100, Math.round((elapsedSec / totalSec) * 1000) / 10),
      totalQueries: acc.totalQueries,
      totalErrors: acc.totalErrors,
      lastTick: history[history.length - 1] ?? null,
      findings,
    });
  }

  // SIGTERM/SIGINT: cleanup + report parziale prima di uscire.
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      console.log(`\n↩︎  Ricevuto ${sig}.`);
      cleanup(sig).then(() => process.exit(0)).catch(() => process.exit(1));
    });
  }

  // Campionamento pool ad alta frequenza (1s) per la % di saturazione.
  const poolSampler = setInterval(() => {
    const p = testPool as pg.Pool & { totalCount: number; idleCount: number; waitingCount: number; options: { max?: number } };
    const full = p.totalCount >= (p.options?.max ?? opts.workers) && p.idleCount === 0 && p.waitingCount > 0;
    acc.samplePool(full, p.waitingCount);
  }, POOL_SAMPLE_MS);
  poolSampler.unref();

  // Worker loop: ognuno esegue operazioni in continuazione fino al deadline.
  const worker = async (): Promise<void> => {
    while (!stopping && Date.now() < deadline) {
      const phase = activePhase(opts, (Date.now() - startedAt) / 1000);
      const op = pickOp(phase);
      const res = await executeOp(testPool, op, ctx);
      acc.record(res);
      if (res.errorCode && CRITICAL_ERROR_CODES.has(res.errorCode)) {
        logCriticalEvent(paths.jsonl, res.errorCode, { op, latencyMs: Math.round(res.ms) });
      }
    }
  };

  // Tick loop: aggrega, logga, campiona lock, inserisce resource_sample.
  let tick = 0;
  const tickTimer = setInterval(async () => {
    if (stopping) return;
    tick++;
    const elapsedSec = (Date.now() - startedAt) / 1000;
    const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    const snap = acc.snapshot(tick, activePhase(opts, elapsedSec), TICK_MS / 1000, remaining);
    history.push(snap);
    appendJsonl(paths.jsonl, { type: "tick", ...snap });
    try {
      const lock = await sampleLocks(monPool);
      lockSamples.push(lock);
      if (lock.blockedPids > 0) logCriticalEvent(paths.jsonl, "LOCK_WAIT", { blockedPids: lock.blockedPids, waiters: lock.lockWaiters });
    } catch { /* ignore */ }
    if (tick % 5 === 1) {
      try { seqScans = await explainSampleReads(monPool); } catch { /* ignore */ }
    }
    try { await insertResourceSample(monPool, Math.round(process.memoryUsage().rss / 1024 / 1024)); } catch { /* ignore */ }
    const interimFindings = buildFindings({
      history, totalQueries: acc.totalQueries, totalErrors: acc.totalErrors,
      totalErrorCodes: acc.totalErrorCodes, lockSamples, seqScans, integrity: null,
    });
    writeLiveSnapshot(interimFindings);
  }, opts.dryRun ? 2_000 : TICK_MS);
  tickTimer.unref();

  // Progress bar ogni minuto (salvo --quiet).
  let progressTimer: ReturnType<typeof setInterval> | null = null;
  if (!opts.quiet) {
    progressTimer = setInterval(() => {
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      const totalSec = opts.dryRun ? 10 : opts.durationSec;
      const pct = Math.min(100, (elapsedSec / totalSec) * 100);
      const filled = Math.round(pct / 5);
      const bar = "█".repeat(filled) + "░".repeat(20 - filled);
      const last = history[history.length - 1];
      const lat = last ? `p99=${last.p99Ms}ms qps=${last.throughputQps}` : "warmup…";
      process.stdout.write(`\r[${bar}] ${pct.toFixed(1)}%  ${elapsedSec}/${totalSec}s  q=${acc.totalQueries} err=${acc.totalErrors}  ${lat}   `);
    }, opts.dryRun ? 2_000 : TICK_MS);
    progressTimer.unref();
  }

  // Avvia i worker.
  const workers = Array.from({ length: opts.workers }, () => worker());

  // Attende il deadline (i worker escono da soli a Date.now() >= deadline).
  await Promise.race([
    Promise.all(workers),
    new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (Date.now() >= deadline || stopping) {
          clearInterval(check);
          resolve();
        }
      }, 500);
      check.unref();
    }),
  ]);
  stopping = true;
  await Promise.allSettled(workers);

  clearInterval(tickTimer);
  clearInterval(poolSampler);
  if (progressTimer) clearInterval(progressTimer);

  await cleanup("completato");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Stress test fallito:", err instanceof Error ? err.message : err);
  process.exit(1);
});
