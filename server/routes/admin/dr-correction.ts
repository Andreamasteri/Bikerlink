import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { sendError } from "../../lib/api-response";
import { logTelemetryEvent } from "../../lib/telemetry-error-log";
import { getEffectiveModel } from "../../dr-correction/engine";

const router = Router();

/**
 * GET /api/admin/dr-correction/users
 * Lists users that have a DR correction model, with model params and a summary of
 * their GPS/telemetry/dead-reckoning deviations.
 */
router.get("/dr-correction/users", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, parseInt(String(req.query.limit ?? "50"), 10) || 50);
    const page = Math.max(0, parseInt(String(req.query.page ?? "0"), 10) || 0);
    const offset = page * limit;

    const [usersResult, countResult] = await Promise.all([
      db.execute<{
        user_id: string;
        username: string;
        is_test: boolean;
        distance_scale: string;
        speed_scale: string;
        speed_bias_kmh: string;
        heading_bias_deg: string;
        sample_count: string;
        mean_pos_error_m: string;
        mean_speed_error_kmh: string;
        updated_at: string | null;
        last_sample_at: string | null;
      }>(sql`
        SELECT
          m.user_id::text,
          COALESCE(u.nickname, 'utente#' || m.user_id) AS username,
          m.is_test,
          m.distance_scale::text,
          m.speed_scale::text,
          m.speed_bias_kmh::text,
          m.heading_bias_deg::text,
          m.sample_count::text,
          m.mean_pos_error_m::text,
          m.mean_speed_error_kmh::text,
          m.updated_at::text,
          (SELECT MAX(recorded_at) FROM dr_deviation_samples s WHERE s.user_id = m.user_id)::text AS last_sample_at
        FROM dr_correction_model m
        LEFT JOIN users u ON u.id = m.user_id
        ORDER BY m.sample_count DESC, m.updated_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      db.execute<{ total: string }>(sql`SELECT COUNT(*)::text AS total FROM dr_correction_model`),
    ]);

    const users = usersResult.rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      isTest: Boolean(r.is_test),
      distanceScale: parseFloat(r.distance_scale),
      speedScale: parseFloat(r.speed_scale),
      speedBiasKmh: parseFloat(r.speed_bias_kmh),
      headingBiasDeg: parseFloat(r.heading_bias_deg),
      sampleCount: parseInt(r.sample_count, 10),
      meanPosErrorM: parseFloat(r.mean_pos_error_m),
      meanSpeedErrorKmh: parseFloat(r.mean_speed_error_kmh),
      updatedAt: r.updated_at ?? null,
      lastSampleAt: r.last_sample_at ?? null,
    }));

    return res.json({
      users,
      total: parseInt(countResult.rows[0]?.total ?? "0", 10),
      page,
      limit,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/dr-correction/users] error:", err);
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "ERROR",
      context: "admin/dr-correction/users",
      message: errMsg,
      detail: err instanceof Error ? err.stack : undefined,
    });
    return sendError(res, 500, "Errore lettura modelli di correzione DR");
  }
});

/**
 * GET /api/admin/dr-correction/global
 * Returns the global cross-user aggregate model (identity if not yet computed).
 */
router.get("/dr-correction/global", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute<Record<string, string | null>>(sql`
      SELECT
        distance_scale::text, speed_scale::text, speed_bias_kmh::text, heading_bias_deg::text,
        sample_count::text, contributing_users::text, mean_pos_error_m::text,
        mean_speed_error_kmh::text, updated_at::text
      FROM dr_correction_global WHERE id = 'global' LIMIT 1
    `);
    const g = result.rows[0];
    if (!g) {
      return res.json({ global: null });
    }
    return res.json({
      global: {
        distanceScale: parseFloat(g.distance_scale ?? "1"),
        speedScale: parseFloat(g.speed_scale ?? "1"),
        speedBiasKmh: parseFloat(g.speed_bias_kmh ?? "0"),
        headingBiasDeg: parseFloat(g.heading_bias_deg ?? "0"),
        sampleCount: parseInt(g.sample_count ?? "0", 10),
        contributingUsers: parseInt(g.contributing_users ?? "0", 10),
        meanPosErrorM: parseFloat(g.mean_pos_error_m ?? "0"),
        meanSpeedErrorKmh: parseFloat(g.mean_speed_error_kmh ?? "0"),
        updatedAt: g.updated_at ?? null,
      },
    });
  } catch (err) {
    console.error("[admin/dr-correction/global] error:", err);
    return sendError(res, 500, "Errore lettura modello globale");
  }
});

/**
 * GET /api/admin/dr-correction/users/:userId/export
 * Full JSON export for one user: current model, effective (blended) model, and the
 * complete deviation time series. Served as a downloadable attachment.
 */
router.get("/dr-correction/users/:userId/export", async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);
    if (!userId) return sendError(res, 400, "userId obbligatorio");

    const [modelRes, samplesRes, effective] = await Promise.all([
      db.execute<Record<string, string | boolean | null>>(sql`
        SELECT
          distance_scale::text, speed_scale::text, speed_bias_kmh::text, heading_bias_deg::text,
          sample_count::text, mean_pos_error_m::text, mean_speed_error_kmh::text,
          data_quality::text, is_test, created_at::text, updated_at::text
        FROM dr_correction_model WHERE user_id = ${userId} LIMIT 1
      `),
      db.execute<Record<string, string | boolean | null>>(sql`
        SELECT
          id::text, session_id, recorded_at::text, blackout_ms::text,
          dr_distance_km::text, gps_distance_km::text, pos_error_m::text,
          est_speed_kmh::text, obs_speed_kmh::text, speed_error_kmh::text,
          heading_error_deg::text, recovery_accuracy_m::text, recovery_fix_count::text, is_test
        FROM dr_deviation_samples
        WHERE user_id = ${userId}
        ORDER BY recorded_at ASC
      `),
      getEffectiveModel(userId),
    ]);

    const m = modelRes.rows[0];
    const currentModel = m
      ? {
          distanceScale: parseFloat(String(m.distance_scale)),
          speedScale: parseFloat(String(m.speed_scale)),
          speedBiasKmh: parseFloat(String(m.speed_bias_kmh)),
          headingBiasDeg: parseFloat(String(m.heading_bias_deg)),
          sampleCount: parseInt(String(m.sample_count), 10),
          meanPosErrorM: parseFloat(String(m.mean_pos_error_m)),
          meanSpeedErrorKmh: parseFloat(String(m.mean_speed_error_kmh)),
          dataQuality: parseInt(String(m.data_quality), 10),
          isTest: Boolean(m.is_test),
          createdAt: (m.created_at as string) ?? null,
          updatedAt: (m.updated_at as string) ?? null,
        }
      : null;

    const samples = samplesRes.rows.map((r) => ({
      id: parseInt(String(r.id), 10),
      sessionId: String(r.session_id),
      recordedAt: (r.recorded_at as string) ?? null,
      blackoutMs: parseInt(String(r.blackout_ms), 10),
      drDistanceKm: parseFloat(String(r.dr_distance_km)),
      gpsDistanceKm: parseFloat(String(r.gps_distance_km)),
      posErrorM: parseFloat(String(r.pos_error_m)),
      estSpeedKmh: parseFloat(String(r.est_speed_kmh)),
      obsSpeedKmh: parseFloat(String(r.obs_speed_kmh)),
      speedErrorKmh: parseFloat(String(r.speed_error_kmh)),
      headingErrorDeg: r.heading_error_deg == null ? null : parseFloat(String(r.heading_error_deg)),
      recoveryAccuracyM: parseFloat(String(r.recovery_accuracy_m)),
      recoveryFixCount: parseInt(String(r.recovery_fix_count), 10),
      isTest: Boolean(r.is_test),
    }));

    const payload = {
      exportedAt: new Date().toISOString(),
      userId,
      currentModel,
      effectiveModel: effective,
      sampleCount: samples.length,
      samples,
    };

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="dr-correction-${userId}.json"`,
    );
    return res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[admin/dr-correction/export] error:", err);
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "ERROR",
      context: "admin/dr-correction/export",
      message: errMsg,
      detail: err instanceof Error ? err.stack : undefined,
    });
    return sendError(res, 500, "Errore export dati correzione DR");
  }
});

export default router;
