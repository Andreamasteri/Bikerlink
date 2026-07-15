// Task #64 — Database Monitor: API storia + download.
//
// Espone, dietro isAdmin (montato con _requireAdmin in server/routes/admin.ts):
//   GET /db-monitor/history?range=24h|48h|7d|30d
//     → serie temporale BUCKETATA server-side (bucket più grossi per 7d/30d così
//       il payload resta piccolo anche su 30 giorni) + totali di riepilogo +
//       stato corrente (per i banner di sovraccarico) + soglie.
//   GET /db-monitor/history/csv?range=...
//     → stesse righe grezze del range come CSV (Content-Disposition attachment),
//       stesso pattern degli altri export admin.
//
// Ogni lettura passa da withBgDbSlot: anche se sono SELECT, non devono competere
// col traffico utente sul pool (max=10).
import { Router } from "express";
import { sql } from "drizzle-orm";
import { db, getPoolStats } from "../../db";
import { withBgDbSlot } from "../../lib/bg-db-limiter";
import { getBackendLoad, BACKEND_LOAD_THRESHOLDS } from "../../lib/backend-load-probe";
import { getLatestSnapshot } from "../../ai/watchdog/aggregator.part2";

const router = Router();

const PING_OVERLOAD_MS = 500;
const POOL_OVERLOAD_PCT = 90;

// range → { secondi totali, secondi per bucket }. I bucket sono scelti per
// mantenere ~150-300 punti indipendentemente dalla finestra.
const RANGES = {
  "24h": { rangeSec: 24 * 3600, bucketSec: 300 },      // 5 min  → 288 punti
  "48h": { rangeSec: 48 * 3600, bucketSec: 600 },      // 10 min → 288 punti
  "7d": { rangeSec: 7 * 24 * 3600, bucketSec: 3600 },  // 1 h    → 168 punti
  "30d": { rangeSec: 30 * 24 * 3600, bucketSec: 14400 }, // 4 h  → 180 punti
} as const;
type RangeKey = keyof typeof RANGES;

function parseRange(raw: unknown): RangeKey {
  return typeof raw === "string" && raw in RANGES ? (raw as RangeKey) : "24h";
}

interface BucketRow {
  bucket: string;
  poolActivePct: number;
  poolWaiting: number;
  pingMs: number | null;
  pingMsMax: number | null;
  dbErrors: number;
  dbRestarts: number;
  dbOverload: boolean;
  backendCpuPct: number;
  backendLagMs: number;
  backendLagMsMax: number;
  backendRssMb: number;
  backendOverload: boolean;
  samples: number;
}

async function queryBuckets(rangeSec: number, bucketSec: number): Promise<BucketRow[]> {
  const result = await withBgDbSlot(() =>
    db.execute(sql`
      SELECT
        to_timestamp(floor(extract(epoch FROM sampled_at) / ${bucketSec}) * ${bucketSec}) AS bucket,
        round(avg(pool_active_pct))::int              AS pool_active_pct,
        max(pool_waiting)::int                        AS pool_waiting,
        round(avg(ping_ms))::int                      AS ping_ms,
        max(ping_ms)::int                             AS ping_ms_max,
        coalesce(sum(db_error_count), 0)::int         AS db_errors,
        coalesce(max(db_restart_count), 0)::int       AS db_restarts,
        bool_or(db_overload)                          AS db_overload,
        round(avg(backend_cpu_pct))::int              AS backend_cpu_pct,
        round(avg(backend_event_loop_lag_ms))::int    AS backend_lag_ms,
        max(backend_event_loop_lag_ms)::int           AS backend_lag_ms_max,
        round(avg(backend_rss_mb))::int               AS backend_rss_mb,
        bool_or(backend_overload)                     AS backend_overload,
        count(*)::int                                 AS samples
      FROM db_monitor_history
      WHERE sampled_at >= now() - make_interval(secs => ${rangeSec})
      GROUP BY bucket
      ORDER BY bucket ASC
    `),
  );
  return (result.rows as Record<string, unknown>[]).map((r) => ({
    bucket: r.bucket instanceof Date ? r.bucket.toISOString() : String(r.bucket ?? ""),
    poolActivePct: Number(r.pool_active_pct ?? 0),
    poolWaiting: Number(r.pool_waiting ?? 0),
    pingMs: r.ping_ms == null ? null : Number(r.ping_ms),
    pingMsMax: r.ping_ms_max == null ? null : Number(r.ping_ms_max),
    dbErrors: Number(r.db_errors ?? 0),
    dbRestarts: Number(r.db_restarts ?? 0),
    dbOverload: Boolean(r.db_overload),
    backendCpuPct: Number(r.backend_cpu_pct ?? 0),
    backendLagMs: Number(r.backend_lag_ms ?? 0),
    backendLagMsMax: Number(r.backend_lag_ms_max ?? 0),
    backendRssMb: Number(r.backend_rss_mb ?? 0),
    backendOverload: Boolean(r.backend_overload),
    samples: Number(r.samples ?? 0),
  }));
}

async function querySummary(rangeSec: number) {
  const result = await withBgDbSlot(() =>
    db.execute(sql`
      SELECT
        count(*)::int                                          AS total_samples,
        count(*) FILTER (WHERE db_overload)::int               AS db_overload_samples,
        count(*) FILTER (WHERE backend_overload)::int          AS backend_overload_samples,
        count(*) FILTER (WHERE db_error_count > 0)::int        AS db_error_samples,
        coalesce(sum(db_error_count), 0)::int                  AS db_errors_total,
        coalesce(max(db_restart_count), 0)::int                AS db_restarts_max,
        coalesce(max(ping_ms), 0)::int                         AS ping_ms_max,
        coalesce(max(pool_active_pct), 0)::int                 AS pool_active_pct_max,
        coalesce(max(backend_cpu_pct), 0)::int                 AS backend_cpu_pct_max,
        coalesce(max(backend_event_loop_lag_ms), 0)::int       AS backend_lag_ms_max
      FROM db_monitor_history
      WHERE sampled_at >= now() - make_interval(secs => ${rangeSec})
    `),
  );
  const r = (result.rows[0] ?? {}) as Record<string, unknown>;
  return {
    totalSamples: Number(r.total_samples ?? 0),
    dbOverloadSamples: Number(r.db_overload_samples ?? 0),
    backendOverloadSamples: Number(r.backend_overload_samples ?? 0),
    dbErrorSamples: Number(r.db_error_samples ?? 0),
    dbErrorsTotal: Number(r.db_errors_total ?? 0),
    dbRestartsMax: Number(r.db_restarts_max ?? 0),
    pingMsMax: Number(r.ping_ms_max ?? 0),
    poolActivePctMax: Number(r.pool_active_pct_max ?? 0),
    backendCpuPctMax: Number(r.backend_cpu_pct_max ?? 0),
    backendLagMsMax: Number(r.backend_lag_ms_max ?? 0),
  };
}

/** Stato corrente (live, zero-I/O) per i banner di sovraccarico. */
function currentState() {
  const { activePct, waiting } = getPoolStats();
  const snap = getLatestSnapshot();
  const metrics = snap?.metrics ?? {};
  const pingRaw = metrics["db.db.ping_ms"] ?? metrics["db.ping_ms"];
  const pingMs = typeof pingRaw === "number" && Number.isFinite(pingRaw) ? Math.round(pingRaw) : null;
  const dbErrors = (snap?.problems ?? []).filter(
    (p) => p.source === "db" && (p.severity === "high" || p.severity === "critical"),
  ).length;
  const dbOverload =
    dbErrors > 0 || activePct >= POOL_OVERLOAD_PCT || (pingMs != null && pingMs >= PING_OVERLOAD_MS);
  const backend = getBackendLoad();
  return {
    poolActivePct: Math.round(activePct),
    poolWaiting: Math.round(waiting),
    pingMs,
    dbErrors,
    dbOverload,
    backendCpuPct: backend.cpuPct,
    backendEventLoopLagMs: backend.eventLoopLagMs,
    backendRssMb: backend.rssMb,
    backendOverload: backend.overloaded,
  };
}

router.get("/db-monitor/history", async (req, res) => {
  const range = parseRange(req.query.range);
  const { rangeSec, bucketSec } = RANGES[range];
  try {
    const [series, summary] = await Promise.all([
      queryBuckets(rangeSec, bucketSec),
      querySummary(rangeSec),
    ]);
    return res.json({
      range,
      bucketSec,
      sampleIntervalSec: 60,
      current: currentState(),
      thresholds: {
        poolActivePct: POOL_OVERLOAD_PCT,
        pingMs: PING_OVERLOAD_MS,
        backend: BACKEND_LOAD_THRESHOLDS,
      },
      summary,
      series,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/db-monitor/history/csv", async (req, res) => {
  const range = parseRange(req.query.range);
  const { rangeSec } = RANGES[range];
  try {
    const result = await withBgDbSlot(() =>
      db.execute(sql`
        SELECT sampled_at, pool_active_pct, pool_waiting, ping_ms, db_error_count,
               db_restart_count, db_overload, backend_cpu_pct,
               backend_event_loop_lag_ms, backend_rss_mb, backend_overload
        FROM db_monitor_history
        WHERE sampled_at >= now() - make_interval(secs => ${rangeSec})
        ORDER BY sampled_at ASC
      `),
    );
    const rows = result.rows as Record<string, unknown>[];
    const header =
      "sampled_at,pool_active_pct,pool_waiting,ping_ms,db_error_count,db_restart_count,db_overload,backend_cpu_pct,backend_event_loop_lag_ms,backend_rss_mb,backend_overload\n";
    const body = rows
      .map((r) => {
        const ts = r.sampled_at instanceof Date ? r.sampled_at.toISOString() : String(r.sampled_at ?? "");
        return [
          ts,
          r.pool_active_pct ?? 0,
          r.pool_waiting ?? 0,
          r.ping_ms ?? "",
          r.db_error_count ?? 0,
          r.db_restart_count ?? 0,
          r.db_overload ? 1 : 0,
          r.backend_cpu_pct ?? 0,
          r.backend_event_loop_lag_ms ?? 0,
          r.backend_rss_mb ?? 0,
          r.backend_overload ? 1 : 0,
        ].join(",");
      })
      .join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="db_monitor_${range}_${Date.now()}.csv"`);
    return res.send(header + body + (body ? "\n" : ""));
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
