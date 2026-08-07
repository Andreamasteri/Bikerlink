import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { sendError } from "../../lib/api-response";
import { logTelemetryEvent } from "../../lib/telemetry-error-log";

const router = Router();

router.get("/telemetry/users", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, parseInt(String(req.query.limit ?? "50"), 10) || 50);
    const page = Math.max(0, parseInt(String(req.query.page ?? "0"), 10) || 0);
    const offset = page * limit;

    const [usersResult, countResult] = await Promise.all([
      db.execute<{
        user_id: string;
        username: string;
        km_ride: string;
        km_track: string;
        session_count: string;
        last_sample: string | null;
      }>(sql`
        WITH ordered AS (
          SELECT
            user_id,
            session_id,
            session_type,
            created_at,
            id,
            lat, lon,
            LAG(lat) OVER (PARTITION BY user_id, session_id ORDER BY ts, id) AS prev_lat,
            LAG(lon) OVER (PARTITION BY user_id, session_id ORDER BY ts, id) AS prev_lon
          FROM ride_telemetry
        ),
        session_km AS (
          SELECT
            user_id,
            session_id,
            MAX(session_type) AS session_type,
            MAX(created_at) AS last_sample,
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
          FROM ordered
          GROUP BY user_id, session_id
        ),
        user_agg AS (
          SELECT
            user_id,
            COALESCE(SUM(km) FILTER (WHERE session_type NOT IN ('ideal_lap')), 0) AS km_ride,
            COALESCE(SUM(km) FILTER (WHERE session_type = 'ideal_lap'), 0) AS km_track,
            COUNT(*) AS session_count,
            MAX(last_sample) AS last_sample
          FROM session_km
          GROUP BY user_id
        )
        SELECT
          ua.user_id::text,
          COALESCE(u.nickname, 'utente#' || ua.user_id) AS username,
          ROUND(ua.km_ride::numeric, 2)::text AS km_ride,
          ROUND(ua.km_track::numeric, 2)::text AS km_track,
          ua.session_count::text,
          ua.last_sample::text AS last_sample
        FROM user_agg ua
        LEFT JOIN users u ON u.id = ua.user_id
        ORDER BY ua.km_ride DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      db.execute<{ total: string }>(sql`
        SELECT COUNT(DISTINCT user_id)::text AS total FROM ride_telemetry
      `),
    ]);

    const users = usersResult.rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      kmRide: Math.round(parseFloat(r.km_ride) * 10) / 10,
      kmTrack: Math.round(parseFloat(r.km_track) * 10) / 10,
      sessionCount: parseInt(r.session_count, 10),
      lastSample: r.last_sample ?? null,
    }));

    return res.json({
      users,
      total: parseInt(countResult.rows[0]?.total ?? "0", 10),
      page,
      limit,
    });
  } catch (err) {
    const cause = err instanceof Error ? ((err.cause as Error | null)?.message ?? "") : "";
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/telemetry/users] error:", err, cause ? `| PG: ${cause}` : "");
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "ERROR",
      context: "admin/telemetry/users",
      message: errMsg,
      detail: cause || (err instanceof Error ? err.stack : undefined),
    });
    return sendError(res, 500, "Errore lettura utenti telemetria");
  }
});

router.get("/telemetry/users/:userId/sessions", async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);
    if (!userId || userId.length < 1) return sendError(res, 400, "userId non valido");

    const result = await db.execute<{
      user_id: string;
      session_id: string;
      session_type: string;
      lap_name: string | null;
      sample_count: string;
      min_ts: string;
      max_ts: string;
      km: string;
    }>(sql`
      WITH ordered AS (
        SELECT
          user_id,
          session_id,
          id,
          session_type,
          lap_name,
          ts,
          lat, lon,
          LAG(lat) OVER (PARTITION BY user_id, session_id ORDER BY ts, id) AS prev_lat,
          LAG(lon) OVER (PARTITION BY user_id, session_id ORDER BY ts, id) AS prev_lon
        FROM ride_telemetry
        WHERE user_id = ${userId}
      )
      SELECT
        user_id,
        session_id,
        MAX(session_type) AS session_type,
        MAX(lap_name) AS lap_name,
        COUNT(*)::text AS sample_count,
        MIN(ts)::text AS min_ts,
        MAX(ts)::text AS max_ts,
        ROUND(COALESCE(SUM(
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
        ), 0)::numeric, 2)::text AS km
      FROM ordered
      GROUP BY session_id
      ORDER BY MIN(ts) DESC
    `);

    const sessions = result.rows.map((r) => ({
      userId: r.user_id,
      sessionId: r.session_id,
      sessionType: r.session_type,
      lapName: r.lap_name ?? null,
      sampleCount: parseInt(r.sample_count, 10),
      startedAt: new Date(Number(r.min_ts)).toISOString(),
      endedAt: new Date(Number(r.max_ts)).toISOString(),
      km: Math.round(parseFloat(r.km) * 10) / 10,
    }));

    return res.json({ sessions, userId });
  } catch (err) {
    const cause = err instanceof Error ? ((err.cause as Error | null)?.message ?? "") : "";
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/telemetry/users/:userId/sessions] error:", err, cause ? `| PG: ${cause}` : "");
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "ERROR",
      context: "admin/telemetry/users/:userId/sessions",
      message: errMsg,
      detail: cause || (err instanceof Error ? err.stack : undefined),
    });
    return sendError(res, 500, "Errore lettura sessioni utente");
  }
});

router.get("/telemetry/sessions/:sessionId/samples", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = String(req.query.userId ?? "");
    if (!sessionId) return sendError(res, 400, "sessionId obbligatorio");
    if (!userId) return sendError(res, 400, "userId obbligatorio");

    const MAX_SAMPLES = 200;

    const countResult = await db.execute<{ total: string }>(sql`
      SELECT COUNT(*)::text AS total
      FROM ride_telemetry
      WHERE user_id = ${userId} AND session_id = ${sessionId}
    `);
    const total = parseInt(countResult.rows[0]?.total ?? "0", 10);

    const step = total > MAX_SAMPLES ? Math.floor(total / MAX_SAMPLES) : 1;

    const result = await db.execute<{
      ts: string;
      lat: string;
      lon: string;
      speed_kmh: string | null;
      lean_angle: string | null;
      rn: string;
    }>(sql`
      WITH numbered AS (
        SELECT
          id, ts, lat, lon, speed_kmh, lean_angle,
          ROW_NUMBER() OVER (ORDER BY ts, id) AS rn
        FROM ride_telemetry
        WHERE user_id = ${userId} AND session_id = ${sessionId}
      )
      SELECT ts::text, lat::text, lon::text, speed_kmh::text, lean_angle::text, rn::text
      FROM numbered
      WHERE (rn - 1) % ${step} = 0
      ORDER BY ts
      LIMIT ${MAX_SAMPLES}
    `);

    const samples = result.rows.map((r) => ({
      ts: Number(r.ts),
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      speedKmh: r.speed_kmh != null ? Math.round(parseFloat(r.speed_kmh) * 10) / 10 : null,
      leanAngle: r.lean_angle != null ? Math.round(parseFloat(r.lean_angle) * 10) / 10 : null,
    }));

    return res.json({ samples, total, sessionId });
  } catch (err) {
    const cause = err instanceof Error ? ((err.cause as Error | null)?.message ?? "") : "";
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/telemetry/sessions/:sessionId/samples] error:", err, cause ? `| PG: ${cause}` : "");
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "ERROR",
      context: "admin/telemetry/sessions/:sessionId/samples",
      message: errMsg,
      detail: cause || (err instanceof Error ? err.stack : undefined),
    });
    return sendError(res, 500, "Errore lettura campioni sessione");
  }
});

export default router;
