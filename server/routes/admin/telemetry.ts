import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { sendError } from "../../lib/api-response";
import { storage } from "../../storage";
import { logTelemetryEvent } from "../../lib/telemetry-error-log";
import {
  isMapMatchingRunning,
  runMapMatchingJob,
  getMapMatchingStats,
  requeueUnmatchable,
  drainStuckRetryBacklog,
} from "../../map-matching-job";
import {
  isCurvyScoreJobRunning,
  runCurvyScoreJob,
  getCurvyScoreStats,
} from "../../curvy-score-job";
import { isSelfHosted } from "../../graphhopper-client";
import telemetrySessionsRouter from "./telemetry-sessions";
import telemetryHealthRouter from "./telemetry-health";

const router = Router();

const TARGET_KM_SETTING = "telemetry_target_km";
const DEFAULT_TARGET_KM = parseFloat(process.env.TELEMETRY_TARGET_KM ?? "1000");

const KM_WINDOW_DAYS = 90;

type CacheEntry = { data: unknown; expiresAt: number };
const serverCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = serverCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    serverCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached(key: string, data: unknown): void {
  serverCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function getTargetKm(): Promise<number> {
  const setting = await storage.getAppSetting(TARGET_KM_SETTING);
  if (setting?.value) {
    const parsed = parseFloat(setting.value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TARGET_KM;
}

router.use("/", telemetrySessionsRouter);
router.use("/", telemetryHealthRouter);

router.get("/telemetry-stats", async (_req: Request, res: Response) => {
  const CACHE_KEY = "telemetry-stats";
  const cached = getCached<object>(CACHE_KEY);
  if (cached) return res.json(cached);
  const startMs = Date.now();
  try {
    const targetKm = await getTargetKm();
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '8000'`);
      return tx.execute<{
        users_with_telemetry: string; active_users_24h: string; total_rides: string;
        total_samples: string; latest_sample: string | null; total_km: string;
      }>(sql`
        SELECT
          COUNT(DISTINCT user_id)::text AS users_with_telemetry,
          COUNT(DISTINCT user_id) FILTER (WHERE updated_at >= NOW() - INTERVAL '24 hours')::text AS active_users_24h,
          COUNT(*)::text AS total_rides,
          COALESCE(SUM(sample_count), 0)::text AS total_samples,
          MAX(updated_at)::text AS latest_sample,
          COALESCE(SUM(dist_speed_filtered), 0)::text AS total_km
        FROM telemetry_session_stats
        WHERE session_type <> 'ideal_lap'
      `);
    });
    const row = result.rows[0];
    const activeUsers = parseInt(row?.active_users_24h ?? "0", 10);
    const totalUsersWithTelemetry = parseInt(row?.users_with_telemetry ?? "0", 10);
    const totalRides = parseInt(row?.total_rides ?? "0", 10);
    const totalSamples = parseInt(row?.total_samples ?? "0", 10);
    const latestSample = row?.latest_sample ?? null;
    const kmCollected = Math.round(parseFloat(row?.total_km ?? "0") * 10) / 10;
    const avgKmPerUser = totalUsersWithTelemetry > 0 ? Math.round((kmCollected / totalUsersWithTelemetry) * 10) / 10 : 0;
    const payload = {
      totalSamples, activeUsers, kmCollected, latestSample, totalRides, avgKmPerUser, targetKm,
      // This is now cumulative. A time-windowed value needs a separate daily rollup,
      // never another Haversine scan over raw telemetry.
      kmWindowDays: 0,
    };
    setCached(CACHE_KEY, payload);
    logTelemetryEvent({ ts: new Date().toISOString(), type: "INFO", context: "admin/telemetry-stats", message: `OK in ${Date.now() - startMs}ms — summary rows only; campioni=${totalSamples} utenti=${totalUsersWithTelemetry} km=${kmCollected}` });
    return res.json(payload);
  } catch (err) {
    const elapsedMs = Date.now() - startMs;
    const pgMsg = err instanceof Error ? ((err.cause as Error | null)?.message ?? "") : "";
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/telemetry-stats] error:", err, pgMsg ? `| PG: ${pgMsg}` : "");
    logTelemetryEvent({ ts: new Date().toISOString(), type: "ERROR", context: "admin/telemetry-stats", message: `Fallita dopo ${elapsedMs}ms: ${errMsg}`, detail: pgMsg || (err instanceof Error ? err.stack : undefined) });
    return res.status(500).json({ success: false, message: "Errore lettura statistiche telemetria", detail: pgMsg || errMsg });
  }
});

router.get("/map-matching-stats", async (_req: Request, res: Response) => {
  try {
    const stats = await getMapMatchingStats();
    return res.json(stats);
  } catch (err) {
    const cause = err instanceof Error ? ((err.cause as Error | null)?.message ?? "") : "";
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/map-matching-stats] error:", err, cause ? `| PG: ${cause}` : "");
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "ERROR",
      context: "admin/map-matching-stats",
      message: errMsg,
      detail: cause || (err instanceof Error ? err.stack : undefined),
    });
    return sendError(res, 500, "Errore lettura statistiche map matching");
  }
});

router.get("/curvy-score-stats", async (_req: Request, res: Response) => {
  try {
    const raw = await getCurvyScoreStats();
    return res.json({
      totalSegments: raw.totalSegments,
      withScore: raw.segmentsWithScore,
      withoutScore: raw.totalSegments - raw.segmentsWithScore,
      coveragePct: raw.coveragePct,
      avgScore: raw.avgScore,
      lastRun: raw.lastRun,
      isRunning: raw.isRunning,
    });
  } catch (err) {
    const cause = err instanceof Error ? ((err.cause as Error | null)?.message ?? "") : "";
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/curvy-score-stats] error:", err, cause ? `| PG: ${cause}` : "");
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "ERROR",
      context: "admin/curvy-score-stats",
      message: errMsg,
      detail: cause || (err instanceof Error ? err.stack : undefined),
    });
    return sendError(res, 500, "Errore lettura statistiche curvy score");
  }
});

const SENSORS_GLOBAL_SETTING = "telemetry_sensors_global_enabled";

router.put("/sensors-global", async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== "boolean") {
      return sendError(res, 400, "enabled deve essere un booleano");
    }
    await storage.upsertAppSetting(SENSORS_GLOBAL_SETTING, String(enabled));
    return res.json({ enabled });
  } catch (err) {
    const cause = err instanceof Error ? ((err.cause as Error | null)?.message ?? "") : "";
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/sensors-global] error:", err, cause ? `| PG: ${cause}` : "");
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "ERROR",
      context: "admin/sensors-global PUT",
      message: errMsg,
      detail: cause || (err instanceof Error ? err.stack : undefined),
    });
    return sendError(res, 500, "Errore aggiornamento sensori globali");
  }
});

router.get("/sensors-global", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting(SENSORS_GLOBAL_SETTING);
    const enabled = setting?.value !== "false";
    return res.json({ enabled });
  } catch (err) {
    const cause = err instanceof Error ? ((err.cause as Error | null)?.message ?? "") : "";
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/sensors-global GET] error:", err, cause ? `| PG: ${cause}` : "");
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "ERROR",
      context: "admin/sensors-global GET",
      message: errMsg,
      detail: cause || (err instanceof Error ? err.stack : undefined),
    });
    return sendError(res, 500, "Errore lettura sensori globali");
  }
});

router.put("/telemetry-target-km", async (req: Request, res: Response) => {
  try {
    const { target_km } = req.body as { target_km?: unknown };
    const val = Number(target_km);
    if (!Number.isFinite(val) || val < 10 || val > 100_000) {
      return sendError(res, 400, "target_km deve essere un numero tra 10 e 100.000");
    }
    await storage.upsertAppSetting(TARGET_KM_SETTING, String(val));
    return res.json({ target_km: val });
  } catch (err) {
    const cause = err instanceof Error ? ((err.cause as Error | null)?.message ?? "") : "";
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/telemetry-target-km] error:", err, cause ? `| PG: ${cause}` : "");
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "ERROR",
      context: "admin/telemetry-target-km PUT",
      message: errMsg,
      detail: cause || (err instanceof Error ? err.stack : undefined),
    });
    return sendError(res, 500, "Errore aggiornamento obiettivo km");
  }
});

router.post("/map-matching/run", async (_req: Request, res: Response) => {
  if (isMapMatchingRunning()) {
    return sendError(res, 409, "Job map matching già in esecuzione.");
  }
  const ghConfigured = isSelfHosted || Boolean(process.env.GRAPHHOPPER_API_KEY);
  if (!ghConfigured) {
    return sendError(res, 503, "GraphHopper non configurato (GRAPHHOPPER_URL o GRAPHHOPPER_API_KEY mancanti).");
  }
  runMapMatchingJob().catch((err) => {
    console.error("[admin/map-matching/run] background error:", err);
  });
  return res.json({ started: true });
});

// Riaccoda le sessioni non matchabili (+ retry al cap) per un nuovo tentativo.
router.post("/map-matching/rematch", async (_req: Request, res: Response) => {
  try {
    const result = await requeueUnmatchable();
    return res.json({ success: true, ...result });
  } catch (err) {
    const cause = err instanceof Error ? ((err.cause as Error | null)?.message ?? "") : "";
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/map-matching/rematch] error:", err, cause ? `| PG: ${cause}` : "");
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "ERROR",
      context: "admin/map-matching/rematch",
      message: errMsg,
      detail: cause || (err instanceof Error ? err.stack : undefined),
    });
    return sendError(res, 500, "Errore nel riaccodamento delle sessioni non matchabili");
  }
});

// Task #4706 — Drena il backlog "fantasma": le sessioni 'retry' rimaste oltre il
// cap tentativi (scritte prima dello stato terminale 'exhausted') le marca come
// 'exhausted' così escono dal conteggio pending+retry e l'allarme matching.pending
// si calma. One-shot, idempotente.
router.post("/map-matching/drain-backlog", async (_req: Request, res: Response) => {
  try {
    const result = await drainStuckRetryBacklog();
    return res.json({ success: true, ...result });
  } catch (err) {
    const cause = err instanceof Error ? ((err.cause as Error | null)?.message ?? "") : "";
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/map-matching/drain-backlog] error:", err, cause ? `| PG: ${cause}` : "");
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "ERROR",
      context: "admin/map-matching/drain-backlog",
      message: errMsg,
      detail: cause || (err instanceof Error ? err.stack : undefined),
    });
    return sendError(res, 500, "Errore nel drenaggio del backlog map-matching");
  }
});

router.post("/curvy-score/run", async (_req: Request, res: Response) => {
  if (isCurvyScoreJobRunning()) {
    return sendError(res, 409, "Job curvy score già in esecuzione.");
  }
  runCurvyScoreJob().catch((err) => {
    console.error("[admin/curvy-score/run] background error:", err);
  });
  return res.json({ started: true });
});

router.get("/telemetry-top-riders", async (req: Request, res: Response) => {
  const limit = Math.max(1, Math.min(20, parseInt(String(req.query.limit ?? "5"), 10) || 5));
  const CACHE_KEY = `top-riders-${limit}`;
  const cached = getCached<object>(CACHE_KEY);
  if (cached) return res.json(cached);

  const startMs = Date.now();
  logTelemetryEvent({ ts: new Date().toISOString(), type: "INFO", context: "admin/telemetry-top-riders", message: `Avvio query top-riders limit=${limit}` });

  try {
    const rawCountResult = await db.execute<{ raw_24h: string }>(
      sql`SELECT COUNT(*)::text AS raw_24h FROM ride_telemetry WHERE created_at >= NOW() - INTERVAL '24 hours' AND session_type NOT IN ('ideal_lap')`
    );
    const raw24h = parseInt(rawCountResult.rows[0]?.raw_24h ?? "0", 10);
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "INFO",
      context: "admin/telemetry-top-riders",
      message: `Campioni ride (non ideal_lap) nelle ultime 24h: ${raw24h}`,
    });

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '8000'`);
      return tx.execute<{
      user_id: string;
      username: string;
      sample_count: string;
      km: string;
    }>(sql`
      WITH recent AS (
        SELECT
          user_id,
          session_id,
          lat, lon,
          LAG(lat) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lat,
          LAG(lon) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lon
        FROM ride_telemetry
        WHERE created_at >= NOW() - INTERVAL '24 hours'
          AND session_type NOT IN ('ideal_lap')
      ),
      user_agg AS (
        SELECT
          user_id,
          COUNT(*) AS sample_count,
          COALESCE(SUM(
            CASE
              WHEN prev_lat IS NOT NULL AND prev_lon IS NOT NULL
                AND ABS(lat - prev_lat) < 0.5 AND ABS(lon - prev_lon) < 0.5
              THEN 2 * 6371 * ASIN(
                SQRT(
                  POWER(SIN(RADIANS(lat - prev_lat) / 2), 2)
                  + COS(RADIANS(prev_lat)) * COS(RADIANS(lat))
                  * POWER(SIN(RADIANS(lon - prev_lon) / 2), 2)
                )
              )
              ELSE 0
            END
          ), 0) AS km
        FROM recent
        GROUP BY user_id
      )
      SELECT
        ua.user_id::text,
        COALESCE(u.nickname, 'utente#' || ua.user_id) AS username,
        ua.sample_count::text,
        ROUND(ua.km::numeric, 1)::text AS km
      FROM user_agg ua
      LEFT JOIN users u ON u.id = ua.user_id
      ORDER BY ua.sample_count DESC
      LIMIT ${limit}
    `);
    });

    const riders = result.rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      sampleCount: parseInt(r.sample_count, 10),
      km: Math.round(parseFloat(r.km) * 10) / 10,
    }));

    const elapsedMs = Date.now() - startMs;
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "INFO",
      context: "admin/telemetry-top-riders",
      message: `OK in ${elapsedMs}ms — riders restituiti: ${riders.length}`,
    });

    const payload = { riders };
    setCached(CACHE_KEY, payload);
    return res.json(payload);
  } catch (err) {
    const elapsedMs = Date.now() - startMs;
    const pgMsg = err instanceof Error ? ((err.cause as Error | null)?.message ?? "") : "";
    const errMsg = err instanceof Error ? err.message : String(err);
    const cause = pgMsg || errMsg;
    console.error("[admin/telemetry-top-riders] error:", err, pgMsg ? `| PG: ${pgMsg}` : "");
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "ERROR",
      context: "admin/telemetry-top-riders",
      message: `Fallita dopo ${elapsedMs}ms: ${errMsg}`,
      detail: pgMsg || (err instanceof Error ? err.stack : undefined),
    });
    return res.status(500).json({ success: false, message: "Errore lettura top rider", detail: cause });
  }
});

export default router;
