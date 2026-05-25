import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { sendError } from "../../lib/api-response";
import { storage } from "../../storage";
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

const router = Router();

const TARGET_KM_SETTING = "telemetry_target_km";
const DEFAULT_TARGET_KM = parseFloat(process.env.TELEMETRY_TARGET_KM ?? "1000");

async function getTargetKm(): Promise<number> {
  const setting = await storage.getAppSetting(TARGET_KM_SETTING);
  if (setting?.value) {
    const parsed = parseFloat(setting.value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TARGET_KM;
}

router.get("/telemetry-stats", async (_req: Request, res: Response) => {
  try {
    const [targetKm, countResult, kmResult] = await Promise.all([
      getTargetKm(),
      db.execute<{
        users_with_telemetry: string;
        total_rides: string;
        total_samples: string;
      }>(sql`
        SELECT
          COUNT(DISTINCT user_id)::text AS users_with_telemetry,
          COUNT(DISTINCT session_id)::text AS total_rides,
          COUNT(*)::text AS total_samples
        FROM ride_telemetry
        WHERE session_type NOT IN ('ideal_lap')
      `),
      db.execute<{ total_km: string }>(sql`
        WITH ordered AS (
          SELECT
            session_id,
            lat, lon, ts,
            LAG(lat) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lat,
            LAG(lon) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lon
          FROM ride_telemetry
          WHERE session_type NOT IN ('ideal_lap')
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
        )
        SELECT COALESCE(SUM(dist_km), 0)::text AS total_km FROM distances
      `),
    ]);

    const countRow = countResult.rows[0];
    const usersWithTelemetry = parseInt(countRow?.users_with_telemetry ?? "0", 10);
    const totalRides = parseInt(countRow?.total_rides ?? "0", 10);
    const totalSamples = parseInt(countRow?.total_samples ?? "0", 10);
    const totalKm = Math.round(parseFloat(kmResult.rows[0]?.total_km ?? "0") * 10) / 10;
    const avgKmPerUser = usersWithTelemetry > 0
      ? Math.round((totalKm / usersWithTelemetry) * 10) / 10
      : 0;

    return res.json({
      users_with_telemetry: usersWithTelemetry,
      total_rides: totalRides,
      total_samples: totalSamples,
      total_km: totalKm,
      avg_km_per_user: avgKmPerUser,
      target_km: targetKm,
    });
  } catch (err) {
    console.error("[admin/telemetry-stats] error:", err);
    return sendError(res, 500, "Errore lettura statistiche telemetria");
  }
});

router.get("/map-matching-stats", async (_req: Request, res: Response) => {
  try {
    const stats = await getMapMatchingStats();
    return res.json(stats);
  } catch (err) {
    console.error("[admin/map-matching-stats] error:", err);
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
    console.error("[admin/curvy-score-stats] error:", err);
    return sendError(res, 500, "Errore lettura statistiche curvy score");
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
    console.error("[admin/telemetry-target-km] error:", err);
    return sendError(res, 500, "Errore aggiornamento obiettivo km");
  }
});

router.post("/map-matching/run", async (_req: Request, res: Response) => {
  if (isMapMatchingRunning()) {
    return res.status(409).json({ message: "Job map matching già in esecuzione." });
  }
  const ghConfigured = isSelfHosted || Boolean(process.env.GRAPHHOPPER_API_KEY);
  if (!ghConfigured) {
    return res.status(503).json({ message: "GraphHopper non configurato (GRAPHHOPPER_URL o GRAPHHOPPER_API_KEY mancanti)." });
  }
  runMapMatchingJob().catch((err) => {
    console.error("[admin/map-matching/run] background error:", err);
  });
  return res.json({ started: true });
});

router.post("/curvy-score/run", async (_req: Request, res: Response) => {
  if (isCurvyScoreJobRunning()) {
    return res.status(409).json({ message: "Job curvy score già in esecuzione." });
  }
  runCurvyScoreJob().catch((err) => {
    console.error("[admin/curvy-score/run] background error:", err);
  });
  return res.json({ started: true });
});

export default router;
