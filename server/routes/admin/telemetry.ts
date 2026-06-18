import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { sendError } from "../../lib/api-response";
import { storage } from "../../storage";
import { getTelemetryErrorLog, logTelemetryEvent } from "../../lib/telemetry-error-log";
import {
  isMapMatchingRunning,
  runMapMatchingJob,
  getMapMatchingStats,
} from "../../map-matching-job";
import {
  isCurvyScoreJobRunning,
  runCurvyScoreJob,
  getCurvyScoreStats,
} from "../../curvy-score-job";
import { isSelfHosted } from "../../graphhopper-client";
import { getAllMapsFlags } from "../../ai/watchdog/maps-kill-switch";
import { mapsTelemetryEvents } from "@shared/db";
import telemetrySessionsRouter from "./telemetry-sessions";

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

router.get("/telemetry-stats", async (_req: Request, res: Response) => {
  const CACHE_KEY = "telemetry-stats";
  const cached = getCached<object>(CACHE_KEY);
  if (cached) return res.json(cached);

  const startMs = Date.now();
  logTelemetryEvent({ ts: new Date().toISOString(), type: "INFO", context: "admin/telemetry-stats", message: "Avvio query statistiche" });

  try {
    const targetKm = await getTargetKm();

    const rawCountResult = await db.execute<{ raw_total: string }>(
      sql`SELECT COUNT(*)::text AS raw_total FROM ride_telemetry`
    );
    const rawTotal = parseInt(rawCountResult.rows[0]?.raw_total ?? "0", 10);
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "INFO",
      context: "admin/telemetry-stats",
      message: `Conteggio grezzo ride_telemetry: ${rawTotal} righe (senza filtri)`,
    });

    if (rawTotal === 0) {
      logTelemetryEvent({
        ts: new Date().toISOString(),
        type: "WARN",
        context: "admin/telemetry-stats",
        message: "Tabella ride_telemetry vuota — nessun dato inviato dall'app",
      });
    }

    const [countResult, kmResult] = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '8000'`);

      const count = await tx.execute<{
        users_with_telemetry: string;
        active_users_24h: string;
        total_rides: string;
        total_samples: string;
        latest_sample: string | null;
      }>(sql`
        SELECT
          COUNT(DISTINCT user_id)::text AS users_with_telemetry,
          COUNT(DISTINCT CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN user_id END)::text AS active_users_24h,
          COUNT(DISTINCT session_id)::text AS total_rides,
          COUNT(*)::text AS total_samples,
          MAX(created_at)::text AS latest_sample
        FROM ride_telemetry
        WHERE session_type NOT IN ('ideal_lap')
      `);

      const km = await tx.execute<{ total_km: string }>(sql`
        WITH ordered AS (
          SELECT
            session_id,
            lat, lon, ts,
            speed_kmh,
            LAG(lat) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lat,
            LAG(lon) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lon
          FROM ride_telemetry
          WHERE session_type NOT IN ('ideal_lap')
            AND created_at >= NOW() - INTERVAL '${sql.raw(String(KM_WINDOW_DAYS))} days'
        ),
        distances AS (
          SELECT
            2 * 6371 * ASIN(
              SQRT(
                POWER(SIN(RADIANS(lat - prev_lat) / 2), 2)
                + COS(RADIANS(prev_lat)) * COS(RADIANS(lat))
                * POWER(SIN(RADIANS(lon - prev_lon) / 2), 2)
              )
            ) AS dist_km
          FROM ordered
          WHERE prev_lat IS NOT NULL AND prev_lon IS NOT NULL
            AND ABS(lat - prev_lat) < 0.5
            AND ABS(lon - prev_lon) < 0.5
            AND (speed_kmh IS NULL OR speed_kmh >= 20)
        )
        SELECT COALESCE(SUM(dist_km), 0)::text AS total_km FROM distances
      `);

      return [count, km] as const;
    });

    const countRow = countResult.rows[0];
    const activeUsers = parseInt(countRow?.active_users_24h ?? "0", 10);
    const totalUsersWithTelemetry = parseInt(countRow?.users_with_telemetry ?? "0", 10);
    const totalRides = parseInt(countRow?.total_rides ?? "0", 10);
    const totalSamples = parseInt(countRow?.total_samples ?? "0", 10);
    const latestSample = countRow?.latest_sample ?? null;
    const kmCollected = Math.round(parseFloat(kmResult.rows[0]?.total_km ?? "0") * 10) / 10;
    const avgKmPerUser = totalUsersWithTelemetry > 0
      ? Math.round((kmCollected / totalUsersWithTelemetry) * 10) / 10
      : 0;

    const elapsedMs = Date.now() - startMs;
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "INFO",
      context: "admin/telemetry-stats",
      message: `OK in ${elapsedMs}ms — campioni=${totalSamples} utenti=${totalUsersWithTelemetry} attivi24h=${activeUsers} km=${kmCollected} latestSample=${latestSample ?? "null"}`,
    });

    const payload = {
      totalSamples,
      activeUsers,
      kmCollected,
      latestSample,
      totalRides,
      avgKmPerUser,
      targetKm,
      kmWindowDays: KM_WINDOW_DAYS,
    };

    setCached(CACHE_KEY, payload);
    return res.json(payload);
  } catch (err) {
    const elapsedMs = Date.now() - startMs;
    const pgMsg = (err as any)?.cause?.message ?? "";
    const errMsg = err instanceof Error ? err.message : String(err);
    const cause = pgMsg || errMsg;
    console.error("[admin/telemetry-stats] error:", err, pgMsg ? `| PG: ${pgMsg}` : "");
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "ERROR",
      context: "admin/telemetry-stats",
      message: `Fallita dopo ${elapsedMs}ms: ${errMsg}`,
      detail: pgMsg || (err instanceof Error ? err.stack : undefined),
    });
    return res.status(500).json({ success: false, message: "Errore lettura statistiche telemetria", detail: cause });
  }
});

router.get("/map-matching-stats", async (_req: Request, res: Response) => {
  try {
    const stats = await getMapMatchingStats();
    return res.json(stats);
  } catch (err) {
    const cause = (err as any)?.cause?.message ?? "";
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
    const cause = (err as any)?.cause?.message ?? "";
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
    const cause = (err as any)?.cause?.message ?? "";
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
    const cause = (err as any)?.cause?.message ?? "";
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
    const cause = (err as any)?.cause?.message ?? "";
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
    const pgMsg = (err as any)?.cause?.message ?? "";
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

router.get("/telemetry/error-log", (_req: Request, res: Response) => {
  try {
    const entries = getTelemetryErrorLog();
    return res.json({ entries, count: entries.length });
  } catch (err) {
    const cause = (err as any)?.cause?.message ?? "";
    console.error("[admin/telemetry/error-log] error:", err, cause ? `| PG: ${cause}` : "");
    return sendError(res, 500, "Errore lettura log errori");
  }
});

// GET /api/admin/telemetry-health — stato pipeline telemetria in tempo reale.
// Ritorna count 24h + ultimo evento per maps_telemetry_events, device_metrics,
// ota_boot_events e stato kill-switch maps. Admin-only (già gated in admin.ts).
router.get("/telemetry-health", async (_req: Request, res: Response) => {
  try {
    const [rows, flags] = await Promise.all([
      db.execute<{
        maps_count: string;
        maps_last: string | null;
        device_count: string;
        device_last: string | null;
        ota_count: string;
        ota_last: string | null;
        ota_boot_success: string;
      }>(sql`
        SELECT
          (SELECT COUNT(*)::text FROM maps_telemetry_events WHERE created_at >= NOW() - INTERVAL '24 hours') AS maps_count,
          (SELECT REPLACE(MAX(created_at)::text, ' ', 'T') || 'Z' FROM maps_telemetry_events) AS maps_last,
          (SELECT COUNT(*)::text FROM device_metrics WHERE recorded_at >= NOW() - INTERVAL '24 hours') AS device_count,
          (SELECT REPLACE(MAX(recorded_at)::text, ' ', 'T') || 'Z' FROM device_metrics) AS device_last,
          (SELECT COUNT(*)::text FROM ota_boot_events WHERE created_at >= NOW() - INTERVAL '24 hours') AS ota_count,
          (SELECT REPLACE(MAX(created_at)::text, ' ', 'T') || 'Z' FROM ota_boot_events) AS ota_last,
          (SELECT COUNT(*)::text FROM ota_boot_events WHERE event_type = 'boot_success') AS ota_boot_success
      `),
      getAllMapsFlags(),
    ]);

    const r = rows.rows[0];
    return res.json({
      maps: {
        count24h: parseInt(r?.maps_count ?? "0", 10),
        lastEvent: r?.maps_last ?? null,
        killSwitchEnabled: flags.telemetry,
      },
      device: {
        count24h: parseInt(r?.device_count ?? "0", 10),
        lastEvent: r?.device_last ?? null,
      },
      ota: {
        count24h: parseInt(r?.ota_count ?? "0", 10),
        lastEvent: r?.ota_last ?? null,
        bootSuccessTotal: parseInt(r?.ota_boot_success ?? "0", 10),
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/telemetry-health] error:", err);
    return sendError(res, 500, `Errore lettura stato pipeline: ${errMsg}`);
  }
});

// GET /api/admin/telemetry/debug-events — ultimi 20 eventi maps_telemetry_events
// + sommario ride_telemetry (totale campioni + ultimo campione). Admin-only.
router.get("/telemetry/debug-events", async (_req: Request, res: Response) => {
  try {
    const [eventsResult, rideResult] = await Promise.all([
      db.execute<{
        id: string;
        event: string;
        component: string | null;
        platform: string | null;
        app_version: string | null;
        created_at: string;
      }>(sql`
        SELECT id, event, component, platform, app_version, created_at::text
        FROM maps_telemetry_events
        ORDER BY created_at DESC
        LIMIT 20
      `),
      db.execute<{ total: string; last_at: string | null }>(sql`
        SELECT COUNT(*)::text AS total, MAX(created_at)::text AS last_at
        FROM ride_telemetry
      `),
    ]);

    const mapsEvents = eventsResult.rows.map((r) => ({
      id: r.id,
      event: r.event,
      component: r.component ?? null,
      platform: r.platform ?? null,
      appVersion: r.app_version ?? null,
      createdAt: r.created_at,
    }));

    const rideRow = rideResult.rows[0];
    const rideSummary = {
      total: parseInt(rideRow?.total ?? "0", 10),
      lastAt: rideRow?.last_at ?? null,
    };

    return res.json({ mapsEvents, rideSummary });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/telemetry/debug-events] error:", err);
    return sendError(res, 500, `Errore lettura debug events: ${errMsg}`);
  }
});

// POST /api/admin/telemetry/debug-ping — inserisce un evento test tramite
// recordMapsTelemetryBatch e risponde con { inserted, eventId }.
router.post("/telemetry/debug-ping", async (_req: Request, res: Response) => {
  try {
    const { recordMapsTelemetryBatch } = await import("../../ai/watchdog/maps-telemetry-store");
    const result = await recordMapsTelemetryBatch([
      { event: "map_init", component: "admin-debug-ping", platform: "web" },
    ]);
    const inserted = result.inserted > 0;

    let eventId: string | null = null;
    if (inserted) {
      const row = await db.execute<{ id: string }>(sql`
        SELECT id FROM maps_telemetry_events
        WHERE component = 'admin-debug-ping'
        ORDER BY created_at DESC
        LIMIT 1
      `);
      eventId = row.rows[0]?.id ?? null;
    }

    return res.json({ inserted, eventId });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/telemetry/debug-ping] error:", err);
    return sendError(res, 500, `Errore debug ping: ${errMsg}`);
  }
});

// POST /api/admin/telemetry-health/ping — inserisce una riga di test in
// maps_telemetry_events e risponde con il conteggio aggiornato nelle ultime 24h.
// Utile per verificare che la pipeline server→DB funzioni indipendentemente dal client.
router.post("/telemetry-health/ping", async (_req: Request, res: Response) => {
  try {
    await db.insert(mapsTelemetryEvents).values({
      event: "map_init",
      component: "admin_ping",
      platform: "web",
    });

    const countRow = await db.execute<{ cnt: string }>(
      sql`SELECT COUNT(*)::text AS cnt FROM maps_telemetry_events WHERE created_at >= NOW() - INTERVAL '24 hours'`
    );
    const count24h = parseInt(countRow.rows[0]?.cnt ?? "0", 10);
    return res.json({ ok: true, maps_count_24h: count24h });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/telemetry-health/ping] error:", err);
    return sendError(res, 500, `Errore ping telemetria: ${errMsg}`);
  }
});

export default router;
