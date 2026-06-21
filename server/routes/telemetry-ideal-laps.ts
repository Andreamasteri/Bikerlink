import { Router, type Request, type Response } from "express";
import { db, withDbRetry } from "../db";
import { sql } from "drizzle-orm";
import { requireUserId } from "../lib/auth-middleware";
import { sendSuccess, sendError } from "../lib/api-response";

const router = Router();

router.get("/ideal-laps", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const [result, distResult] = await Promise.all([
      withDbRetry(() => db.execute(sql`
        SELECT
          session_id,
          MAX(lap_name) AS lap_name,
          MIN(ts) AS started_at_ms,
          COUNT(*) AS sample_count,
          MAX(speed_kmh) AS max_speed_kmh,
          MAX(ABS(lean_angle)) AS max_lean_deg,
          MAX(
            SQRT(
              COALESCE(gforce_x, 0) * COALESCE(gforce_x, 0)
              + COALESCE(gforce_y, 0) * COALESCE(gforce_y, 0)
              + COALESCE(gforce_z, 0) * COALESCE(gforce_z, 0)
            )
          ) AS max_gforce
        FROM ride_telemetry
        WHERE user_id = ${userId}
          AND session_type = 'ideal_lap'
        GROUP BY session_id
        ORDER BY MIN(ts) DESC
      `)),
      withDbRetry(() => db.execute(sql`
        SELECT session_id, SUM(seg_km) AS distance_km
        FROM (
          SELECT
            session_id,
            CASE
              WHEN next_lat IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL AND next_lon IS NOT NULL
              THEN 2 * 6371 * ASIN(SQRT(
                POWER(SIN((next_lat - lat) * PI() / 360), 2)
                + COS(lat * PI() / 180) * COS(next_lat * PI() / 180)
                  * POWER(SIN((next_lon - lon) * PI() / 360), 2)
              ))
              ELSE 0
            END AS seg_km
          FROM (
            SELECT
              session_id, lat, lon,
              LEAD(lat) OVER (PARTITION BY session_id ORDER BY ts) AS next_lat,
              LEAD(lon) OVER (PARTITION BY session_id ORDER BY ts) AS next_lon
            FROM ride_telemetry
            WHERE user_id = ${userId}
              AND session_type = 'ideal_lap'
              AND lat IS NOT NULL AND lon IS NOT NULL
          ) pts
        ) segs
        GROUP BY session_id
      `)),
    ]);

    type LapRow = {
      session_id: string;
      lap_name: string | null;
      started_at_ms: string;
      sample_count: string;
      max_speed_kmh: string | null;
      max_lean_deg: string | null;
      max_gforce: string | null;
    };

    type DistRow = { session_id: string; distance_km: string | null };

    const distMap = new Map<string, number | null>();
    for (const d of distResult.rows as DistRow[]) {
      distMap.set(d.session_id, d.distance_km != null ? Math.round(parseFloat(d.distance_km) * 100) / 100 : null);
    }

    const laps = (result.rows as LapRow[]).map((r, idx) => ({
      sessionId: r.session_id,
      lapName: r.lap_name ?? null,
      startedAt: new Date(Number(r.started_at_ms)).toISOString(),
      sampleCount: parseInt(r.sample_count, 10),
      maxSpeedKmh: r.max_speed_kmh != null ? Math.round(parseFloat(r.max_speed_kmh) * 10) / 10 : null,
      maxLeanDeg: r.max_lean_deg != null ? Math.round(parseFloat(r.max_lean_deg) * 10) / 10 : null,
      maxGforce: r.max_gforce != null ? Math.round(parseFloat(r.max_gforce) * 100) / 100 : null,
      lapNumber: (result.rows as LapRow[]).length - idx,
      distanceKm: distMap.get(r.session_id) ?? null,
    }));

    return res.json({ laps });
  } catch (err) {
    console.error("[telemetry/ideal-laps] error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/ideal-laps/:sessionId/samples", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { sessionId } = req.params;
  if (!sessionId) return sendError(res, 400, "sessionId obbligatorio");

  try {
    const result = await withDbRetry(() => db.execute(sql`
      SELECT
        ts,
        speed_kmh,
        lean_angle,
        SQRT(
          COALESCE(gforce_x, 0) * COALESCE(gforce_x, 0)
          + COALESCE(gforce_y, 0) * COALESCE(gforce_y, 0)
          + COALESCE(gforce_z, 0) * COALESCE(gforce_z, 0)
        ) AS gforce,
        lat,
        lon
      FROM ride_telemetry
      WHERE user_id = ${userId}
        AND session_id = ${sessionId}
        AND session_type = 'ideal_lap'
      ORDER BY ts ASC
      LIMIT 2000
    `));

    type SampleRow = {
      ts: string;
      speed_kmh: string | null;
      lean_angle: string | null;
      gforce: string | null;
      lat: string | null;
      lon: string | null;
    };

    const samples = (result.rows as SampleRow[]).map((r) => ({
      ts: parseInt(r.ts, 10),
      speedKmh: r.speed_kmh != null ? Math.round(parseFloat(r.speed_kmh) * 10) / 10 : null,
      leanAngle: r.lean_angle != null ? Math.round(parseFloat(r.lean_angle) * 10) / 10 : null,
      gforce: r.gforce != null ? Math.round(parseFloat(r.gforce) * 100) / 100 : null,
      lat: r.lat != null ? parseFloat(r.lat) : null,
      lon: r.lon != null ? parseFloat(r.lon) : null,
    }));

    return res.json({ samples });
  } catch (err) {
    console.error("[telemetry/ideal-laps/samples] error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/ideal-laps/:sessionId", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { sessionId } = req.params;
  if (!sessionId) return sendError(res, 400, "sessionId obbligatorio");

  try {
    await db.execute(sql`
      DELETE FROM ride_telemetry
      WHERE user_id = ${userId}
        AND session_id = ${sessionId}
        AND session_type = 'ideal_lap'
    `);
    return sendSuccess(res);
  } catch (err) {
    console.error("[telemetry/ideal-laps DELETE] error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
