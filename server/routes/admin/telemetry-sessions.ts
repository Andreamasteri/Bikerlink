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
        sample_count: string;
        lean_sample_count: string;
        max_lean: string | null;
        avg_lean: string | null;
        max_lean_left: string | null;
        max_lean_right: string | null;
        left_turn_samples: string;
        right_turn_samples: string;
        lean_bias: string | null;
        dr_sample_count: string | null;
        dr_distance_scale: string | null;
        dr_speed_scale: string | null;
        dr_speed_bias_kmh: string | null;
        dr_heading_bias_deg: string | null;
        dr_mean_pos_error_m: string | null;
        dr_updated_at: string | null;
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
        ),
        lean_agg AS (
          SELECT
            user_id,
            COUNT(*) AS sample_count,
            COUNT(*) FILTER (WHERE lean_angle IS NOT NULL) AS lean_sample_count,
            MAX(ABS(lean_angle)) FILTER (WHERE lean_angle IS NOT NULL) AS max_lean,
            AVG(ABS(lean_angle)) FILTER (WHERE lean_angle IS NOT NULL) AS avg_lean,
            MAX(CASE WHEN lean_angle < 0 THEN ABS(lean_angle) END) AS max_lean_left,
            MAX(CASE WHEN lean_angle > 0 THEN ABS(lean_angle) END) AS max_lean_right,
            COUNT(*) FILTER (WHERE lean_angle <= -5) AS left_turn_samples,
            COUNT(*) FILTER (WHERE lean_angle >= 5) AS right_turn_samples,
            AVG(lean_angle) FILTER (WHERE lean_angle IS NOT NULL) AS lean_bias
          FROM ordered
          GROUP BY user_id
        )
        SELECT
          u.id::text AS user_id,
          COALESCE(u.nickname, 'utente#' || u.id) AS username,
          ROUND(COALESCE(ua.km_ride, 0)::numeric, 2)::text AS km_ride,
          ROUND(COALESCE(ua.km_track, 0)::numeric, 2)::text AS km_track,
          COALESCE(ua.session_count, 0)::text AS session_count,
          ua.last_sample::text AS last_sample,
          COALESCE(la.sample_count, 0)::text AS sample_count,
          COALESCE(la.lean_sample_count, 0)::text AS lean_sample_count,
          ROUND(la.max_lean::numeric, 1)::text AS max_lean,
          ROUND(la.avg_lean::numeric, 1)::text AS avg_lean,
          ROUND(la.max_lean_left::numeric, 1)::text AS max_lean_left,
          ROUND(la.max_lean_right::numeric, 1)::text AS max_lean_right,
          COALESCE(la.left_turn_samples, 0)::text AS left_turn_samples,
          COALESCE(la.right_turn_samples, 0)::text AS right_turn_samples,
          ROUND(la.lean_bias::numeric, 1)::text AS lean_bias,
          dr.sample_count::text AS dr_sample_count,
          dr.distance_scale::text AS dr_distance_scale,
          dr.speed_scale::text AS dr_speed_scale,
          dr.speed_bias_kmh::text AS dr_speed_bias_kmh,
          dr.heading_bias_deg::text AS dr_heading_bias_deg,
          dr.mean_pos_error_m::text AS dr_mean_pos_error_m,
          dr.updated_at::text AS dr_updated_at
        FROM users u
        LEFT JOIN user_agg ua ON ua.user_id = u.id
        LEFT JOIN lean_agg la ON la.user_id = u.id
        LEFT JOIN dr_correction_model dr ON dr.user_id = u.id
        ORDER BY COALESCE(ua.km_ride, 0) DESC, u.id
        LIMIT ${limit} OFFSET ${offset}
      `),
      db.execute<{ total: string }>(sql`
        SELECT COUNT(*)::text AS total FROM users
      `),
    ]);

    const users = usersResult.rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      kmRide: Math.round(parseFloat(r.km_ride) * 10) / 10,
      kmTrack: Math.round(parseFloat(r.km_track) * 10) / 10,
      sessionCount: parseInt(r.session_count, 10),
      lastSample: r.last_sample ?? null,
      leanSampleCount: parseInt(r.lean_sample_count ?? "0", 10),
      maxLean: r.max_lean != null ? Math.round(parseFloat(r.max_lean) * 10) / 10 : null,
      avgLean: r.avg_lean != null ? Math.round(parseFloat(r.avg_lean) * 10) / 10 : null,
      maxLeanLeft: r.max_lean_left != null ? Math.round(parseFloat(r.max_lean_left) * 10) / 10 : null,
      maxLeanRight: r.max_lean_right != null ? Math.round(parseFloat(r.max_lean_right) * 10) / 10 : null,
      leftTurnSamples: parseInt(r.left_turn_samples ?? "0", 10),
      rightTurnSamples: parseInt(r.right_turn_samples ?? "0", 10),
      leanBias: r.lean_bias != null ? Math.round(parseFloat(r.lean_bias) * 10) / 10 : null,
      leanCoveragePct: parseInt(r.sample_count ?? "0", 10) > 0
        ? Math.round((parseInt(r.lean_sample_count ?? "0", 10) / parseInt(r.sample_count ?? "0", 10)) * 100)
        : 0,
      drCorrection: r.dr_sample_count != null ? {
        sampleCount: parseInt(r.dr_sample_count, 10),
        distanceScale: r.dr_distance_scale != null ? Number(r.dr_distance_scale) : 1,
        speedScale: r.dr_speed_scale != null ? Number(r.dr_speed_scale) : 1,
        speedBiasKmh: r.dr_speed_bias_kmh != null ? Number(r.dr_speed_bias_kmh) : 0,
        headingBiasDeg: r.dr_heading_bias_deg != null ? Number(r.dr_heading_bias_deg) : 0,
        meanPosErrorM: r.dr_mean_pos_error_m != null ? Number(r.dr_mean_pos_error_m) : 0,
        updatedAt: r.dr_updated_at ?? null,
      } : null,
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
      GROUP BY user_id, session_id
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

    const [leanSummaryResult, drResult] = await Promise.all([
      db.execute<{
        sample_count: string;
        lean_sample_count: string;
        avg_abs_lean: string | null;
        max_abs_lean: string | null;
        max_lean_left: string | null;
        max_lean_right: string | null;
        avg_lean: string | null;
        left_turn_samples: string;
        right_turn_samples: string;
      }>(sql`
        SELECT
          COUNT(*)::text AS sample_count,
          COUNT(*) FILTER (WHERE lean_angle IS NOT NULL)::text AS lean_sample_count,
          AVG(ABS(lean_angle))::text AS avg_abs_lean,
          MAX(ABS(lean_angle))::text AS max_abs_lean,
          MAX(CASE WHEN lean_angle < 0 THEN ABS(lean_angle) END)::text AS max_lean_left,
          MAX(CASE WHEN lean_angle > 0 THEN ABS(lean_angle) END)::text AS max_lean_right,
          AVG(lean_angle)::text AS avg_lean,
          COUNT(*) FILTER (WHERE lean_angle <= -5)::text AS left_turn_samples,
          COUNT(*) FILTER (WHERE lean_angle >= 5)::text AS right_turn_samples
        FROM ride_telemetry
        WHERE user_id = ${userId}
      `),
      db.execute<{
        sample_count: string;
        distance_scale: string;
        speed_scale: string;
        speed_bias_kmh: string;
        heading_bias_deg: string;
        mean_pos_error_m: string;
        mean_speed_error_kmh: string;
        updated_at: string | null;
      }>(sql`
        SELECT
          sample_count::text,
          distance_scale::text,
          speed_scale::text,
          speed_bias_kmh::text,
          heading_bias_deg::text,
          mean_pos_error_m::text,
          mean_speed_error_kmh::text,
          updated_at::text
        FROM dr_correction_model
        WHERE user_id = ${userId}
        LIMIT 1
      `),
    ]);

    const leanRow = leanSummaryResult.rows[0];
    const totalSamples = parseInt(leanRow?.sample_count ?? "0", 10);
    const leanSamples = parseInt(leanRow?.lean_sample_count ?? "0", 10);
    const leanSummary = {
      sampleCount: totalSamples,
      leanSampleCount: leanSamples,
      leanCoveragePct: totalSamples > 0 ? Math.round((leanSamples / totalSamples) * 100) : 0,
      avgAbsLean: leanRow?.avg_abs_lean != null ? Number(leanRow.avg_abs_lean) : null,
      maxAbsLean: leanRow?.max_abs_lean != null ? Number(leanRow.max_abs_lean) : null,
      maxLeanLeft: leanRow?.max_lean_left != null ? Number(leanRow.max_lean_left) : null,
      maxLeanRight: leanRow?.max_lean_right != null ? Number(leanRow.max_lean_right) : null,
      leanBias: leanRow?.avg_lean != null ? Number(leanRow.avg_lean) : null,
      leftTurnSamples: parseInt(leanRow?.left_turn_samples ?? "0", 10),
      rightTurnSamples: parseInt(leanRow?.right_turn_samples ?? "0", 10),
    };

    const drRow = drResult.rows[0];
    const drCorrection = drRow ? {
      sampleCount: parseInt(drRow.sample_count, 10),
      distanceScale: Number(drRow.distance_scale),
      speedScale: Number(drRow.speed_scale),
      speedBiasKmh: Number(drRow.speed_bias_kmh),
      headingBiasDeg: Number(drRow.heading_bias_deg),
      meanPosErrorM: Number(drRow.mean_pos_error_m),
      meanSpeedErrorKmh: Number(drRow.mean_speed_error_kmh),
      updatedAt: drRow.updated_at ?? null,
    } : null;

    return res.json({ sessions, userId, lean: leanSummary, drCorrection });
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
