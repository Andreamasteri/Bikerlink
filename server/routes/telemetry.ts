import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { rideTelemetry } from "@shared/db";
import { requireUserId } from "../lib/auth-middleware";
import { sendSuccess, sendError } from "../lib/api-response";
import { logTelemetryEvent } from "../lib/telemetry-error-log";
import { storage } from "../storage";
import { getInternalProbeToken, getInternalProbeHeaderName, isLoopback } from "../ai/watchdog/internal-token";

const router = Router();

function isInternalProbe(req: Request): boolean {
  const headerVal = req.headers[getInternalProbeHeaderName()];
  return (
    typeof headerVal === "string" &&
    headerVal === getInternalProbeToken() &&
    isLoopback(req.ip)
  );
}

const TARGET_KM = parseFloat(process.env.TELEMETRY_TARGET_KM ?? "1000");

router.post("/batch", async (req: Request, res: Response) => {
  const probeMode = isInternalProbe(req);
  const userId: string | null = probeMode ? "__probe__" : requireUserId(req, res);
  if (!userId) {
    const ua = String(req.headers["user-agent"] ?? "").slice(0, 80);
    console.warn(`[telemetry/batch] AUTH FAIL — ip=${req.ip} ua=${ua}`);
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "WARN",
      context: "telemetry/batch",
      message: `Auth fallita (JWT scaduto o assente) — ip=${req.ip}`,
      detail: `ua=${ua}`,
    });
    return;
  }

  try {
    const { session_id, session_type, samples, lap_name } = req.body as {
      session_id?: string;
      session_type?: string;
      samples?: unknown[];
      lap_name?: string;
    };

    if (!session_id || typeof session_id !== "string") {
      logTelemetryEvent({
        ts: new Date().toISOString(),
        type: "WARN",
        context: "telemetry/batch",
        message: "Payload invalido: session_id mancante o non stringa",
        userId,
      });
      return sendError(res, 400, "session_id obbligatorio");
    }

    const validSessionTypes = ["ride", "trip", "free", "ideal_lap"];
    const resolvedType = validSessionTypes.includes(session_type ?? "") ? session_type! : "ride";

    if (!Array.isArray(samples) || samples.length === 0) {
      logTelemetryEvent({
        ts: new Date().toISOString(),
        type: "WARN",
        context: "telemetry/batch",
        message: "Payload senza samples",
        userId,
        sessionId: session_id,
      });
      return sendError(res, 400, "samples[] obbligatorio e non vuoto");
    }

    // Probe dry-run: payload valido ma nessun insert — __probe__ non è una FK valida.
    if (probeMode) {
      return res.status(200).json({ inserted: (samples as unknown[]).length, session_id, probe: true });
    }

    // Task #3115 — nome custom per i giri secondari (solo ideal_lap).
    // Se il nome è già usato dall'utente per un altro giro, appende la data per
    // distinguere i file (es. "casa-lavoro 03/06/2026").
    let resolvedLapName: string | null = null;
    if (resolvedType === "ideal_lap" && typeof lap_name === "string" && lap_name.trim()) {
      const base = lap_name.trim().slice(0, 40);
      const dup = await db.execute(sql`
        SELECT 1 FROM ride_telemetry
        WHERE user_id = ${userId}
          AND session_type = 'ideal_lap'
          AND lap_name = ${base}
          AND session_id <> ${session_id}
        LIMIT 1
      `);
      if (dup.rows.length > 0) {
        const d = new Date();
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yyyy = d.getFullYear();
        resolvedLapName = `${base} ${dd}/${mm}/${yyyy}`.slice(0, 60);
      } else {
        resolvedLapName = base;
      }
    }

    type RawSample = {
      ts?: unknown;
      lat?: unknown;
      lon?: unknown;
      speed_kmh?: unknown;
      lean_angle?: unknown;
      gforce_x?: unknown;
      gforce_y?: unknown;
      gforce_z?: unknown;
      heading?: unknown;
      altitude_m?: unknown;
    };

    const rows: typeof rideTelemetry.$inferInsert[] = [];
    for (const s of samples as RawSample[]) {
      // ts: null/undefined are treated as invalid (NaN) — JSON null is not a valid timestamp.
      const ts = (s.ts == null) ? NaN : (typeof s.ts === "number" ? s.ts : Number(s.ts));
      // lat/lon: null/undefined mean "no GPS fix" (sensor-only sample), not 0.
      const latNum = (s.lat == null) ? NaN : (typeof s.lat === "number" ? s.lat : Number(s.lat));
      const lonNum = (s.lon == null) ? NaN : (typeof s.lon === "number" ? s.lon : Number(s.lon));

      // ts is mandatory; lat/lon are optional (sensor-only samples have no GPS fix).
      if (!Number.isFinite(ts)) continue;

      const lat = Number.isFinite(latNum) ? latNum : null;
      const lon = Number.isFinite(lonNum) ? lonNum : null;

      rows.push({
        userId,
        sessionId: session_id,
        sessionType: resolvedType,
        lapName: resolvedLapName,
        ts,
        lat,
        lon,
        speedKmh: s.speed_kmh != null && Number.isFinite(Number(s.speed_kmh)) ? Number(s.speed_kmh) : null,
        leanAngle: s.lean_angle != null && Number.isFinite(Number(s.lean_angle)) ? Number(s.lean_angle) : null,
        gforceX: s.gforce_x != null && Number.isFinite(Number(s.gforce_x)) ? Number(s.gforce_x) : null,
        gforceY: s.gforce_y != null && Number.isFinite(Number(s.gforce_y)) ? Number(s.gforce_y) : null,
        gforceZ: s.gforce_z != null && Number.isFinite(Number(s.gforce_z)) ? Number(s.gforce_z) : null,
        heading: s.heading != null && Number.isFinite(Number(s.heading)) ? Number(s.heading) : null,
        altitudeM: s.altitude_m != null && Number.isFinite(Number(s.altitude_m)) ? Number(s.altitude_m) : null,
      });
    }

    const received = (samples as unknown[]).length;
    const discarded = received - rows.length;

    if (rows.length === 0) {
      logTelemetryEvent({
        ts: new Date().toISOString(),
        type: "WARN",
        context: "telemetry/batch",
        message: `Nessun campione valido — received=${received} valid=0 discarded=${discarded}`,
        userId,
        sessionId: session_id,
      });
      return sendError(res, 400, "Nessun campione valido (ts obbligatorio; lat/lon opzionali per campioni sensor-only)");
    }

    const CHUNK = 500;
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        await db.insert(rideTelemetry).values(rows.slice(i, i + CHUNK));
      }
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      const stack = dbErr instanceof Error ? dbErr.stack : undefined;
      console.error(`[telemetry/batch] DB ERROR userId=${userId} sessionId=${session_id}: ${msg}`);
      logTelemetryEvent({
        ts: new Date().toISOString(),
        type: "ERROR",
        context: "telemetry/batch",
        message: `DB insert fallito: ${msg}`,
        userId,
        sessionId: session_id,
        detail: stack,
      });
      return sendError(res, 500, "Errore salvataggio campioni");
    }

    console.log(`[telemetry/batch] userId=${userId} sessionId=${session_id} received=${received} valid=${rows.length} discarded=${discarded}`);
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "INFO",
      context: "telemetry/batch",
      message: `Insert OK — received=${received} inserted=${rows.length} discarded=${discarded} type=${resolvedType}`,
      userId,
      sessionId: session_id,
    });
    if (discarded > 0) {
      logTelemetryEvent({
        ts: new Date().toISOString(),
        type: "WARN",
        context: "telemetry/batch",
        message: `Campioni scartati (ts non valido) — received=${received} valid=${rows.length} discarded=${discarded}`,
        userId,
        sessionId: session_id,
      });
    }

    return res.status(200).json({ inserted: rows.length, session_id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[telemetry/batch] error:", err);
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "ERROR",
      context: "telemetry/batch",
      message: `Errore inatteso: ${msg}`,
      userId: (req as Request & { user?: { id?: number } }).user?.id,
      detail: stack,
    });
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/stats", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const startMs = Date.now();
  try {
    const statsResult = await db.execute(sql`
      SELECT
        COUNT(*) AS sample_count,
        COUNT(DISTINCT session_id) AS session_count,
        COUNT(*) FILTER (WHERE lat IS NULL AND lon IS NULL) AS sensor_only_count
      FROM ride_telemetry
      WHERE user_id = ${userId}
        AND session_type NOT IN ('ideal_lap')
    `);

    const row = statsResult.rows[0] as { sample_count: string; session_count: string; sensor_only_count: string } | undefined;
    const sampleCount = parseInt(row?.sample_count ?? "0", 10);
    const sessionCount = parseInt(row?.session_count ?? "0", 10);
    const sensorOnlyCount = parseInt(row?.sensor_only_count ?? "0", 10);
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: sampleCount === 0 ? "WARN" : "INFO",
      context: "telemetry/stats",
      message: `userId=${userId} campioni=${sampleCount} sessioni=${sessionCount}${sampleCount === 0 ? " — nessun dato per questo utente" : ""}`,
      userId,
    });

    const kmResult = await db.execute(sql`
      WITH ordered AS (
        SELECT
          session_id,
          lat,
          lon,
          ts,
          speed_kmh,
          LAG(lat) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lat,
          LAG(lon) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lon
        FROM ride_telemetry
        WHERE user_id = ${userId}
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
      SELECT COALESCE(SUM(dist_km), 0) AS km_collected
      FROM distances
    `);

    const kmRow = kmResult.rows[0] as { km_collected: string } | undefined;
    const kmCollected = Math.round(parseFloat(kmRow?.km_collected ?? "0") * 10) / 10;
    const progressPct = Math.min(100, Math.round((kmCollected / TARGET_KM) * 100));

    const trackKmResult = await db.execute(sql`
      WITH ordered AS (
        SELECT
          session_id,
          lat,
          lon,
          ts,
          LAG(lat) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lat,
          LAG(lon) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lon
        FROM ride_telemetry
        WHERE user_id = ${userId}
          AND session_type = 'ideal_lap'
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
      SELECT COALESCE(SUM(dist_km), 0) AS track_km
      FROM distances
    `);

    const trackKmRow = trackKmResult.rows[0] as { track_km: string } | undefined;
    const trackKm = Math.round(parseFloat(trackKmRow?.track_km ?? "0") * 10) / 10;

    const idealLapKmResult = await db.execute(sql`
      WITH ordered AS (
        SELECT
          session_id,
          lat,
          lon,
          ts,
          speed_kmh,
          LAG(lat) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lat,
          LAG(lon) OVER (PARTITION BY session_id ORDER BY ts) AS prev_lon
        FROM ride_telemetry
        WHERE user_id = ${userId}
          AND session_type = 'ideal_lap'
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
      SELECT COALESCE(SUM(dist_km), 0) AS ideal_lap_km
      FROM distances
    `);

    const idealLapKmRow = idealLapKmResult.rows[0] as { ideal_lap_km: string } | undefined;
    const idealLapKm = Math.round(parseFloat(idealLapKmRow?.ideal_lap_km ?? "0") * 10) / 10;

    return res.json({
      km_collected: kmCollected,
      sample_count: sampleCount,
      session_count: sessionCount,
      sensor_only_count: sensorOnlyCount,
      progress_pct: progressPct,
      target_km: TARGET_KM,
      track_km: trackKm,
      ideal_lap_km: idealLapKm,
    });
  } catch (err) {
    const elapsedMs = Date.now() - startMs;
    const pgMsg = (err as any)?.cause?.message ?? "";
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[telemetry/stats] error:", err, pgMsg ? `| PG: ${pgMsg}` : "");
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "ERROR",
      context: "telemetry/stats",
      message: `Fallita dopo ${elapsedMs}ms: ${errMsg}`,
      userId: (req as any).user?.id,
      detail: pgMsg || (err instanceof Error ? err.stack : undefined),
    });
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/ideal-laps", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const result = await db.execute(sql`
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
    `);

    type LapRow = {
      session_id: string;
      lap_name: string | null;
      started_at_ms: string;
      sample_count: string;
      max_speed_kmh: string | null;
      max_lean_deg: string | null;
      max_gforce: string | null;
    };

    const laps = (result.rows as LapRow[]).map((r, idx) => ({
      sessionId: r.session_id,
      lapName: r.lap_name ?? null,
      startedAt: new Date(Number(r.started_at_ms)).toISOString(),
      sampleCount: parseInt(r.sample_count, 10),
      maxSpeedKmh: r.max_speed_kmh != null ? Math.round(parseFloat(r.max_speed_kmh) * 10) / 10 : null,
      maxLeanDeg: r.max_lean_deg != null ? Math.round(parseFloat(r.max_lean_deg) * 10) / 10 : null,
      maxGforce: r.max_gforce != null ? Math.round(parseFloat(r.max_gforce) * 100) / 100 : null,
      lapNumber: (result.rows as LapRow[]).length - idx,
    }));

    return res.json({ laps });
  } catch (err) {
    console.error("[telemetry/ideal-laps] error:", err);
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

router.get("/sensor-settings", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const [globalSetting, userRow] = await Promise.all([
      storage.getAppSetting("telemetry_sensors_global_enabled"),
      db.execute(sql`SELECT telemetry_disabled FROM users WHERE id = ${userId} LIMIT 1`),
    ]);

    const globalEnabled = globalSetting?.value !== "false";
    const userRow0 = userRow.rows[0] as { telemetry_disabled?: boolean } | undefined;
    const userEnabled = !(userRow0?.telemetry_disabled ?? false);

    return res.json({ globalEnabled, userEnabled });
  } catch (err) {
    console.error("[telemetry/sensor-settings] error:", err);
    return sendError(res, 500, "Errore lettura impostazioni sensori");
  }
});

// ── GET /api/telemetry/calibration ───────────────────────────────────────────
router.get("/calibration", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const result = await db.execute(sql`
      SELECT mount_calibration FROM users WHERE id = ${userId} LIMIT 1
    `);
    const row = result.rows[0] as { mount_calibration: unknown } | undefined;
    return res.json({ calibration: row?.mount_calibration ?? null });
  } catch (err) {
    console.error("[telemetry/calibration GET] error:", err);
    return sendError(res, 500, "Errore lettura calibrazione");
  }
});

// ── PUT /api/telemetry/calibration ───────────────────────────────────────────
router.put("/calibration", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { calibration } = req.body as { calibration: unknown };

    if (calibration !== null && calibration !== undefined) {
      const c = calibration as Record<string, unknown>;
      const validAxes = ["x", "y", "z"];
      if (
        !validAxes.includes(c.longAxis as string) ||
        !validAxes.includes(c.latAxis as string) ||
        !validAxes.includes(c.vertAxis as string) ||
        (c.longSign !== 1 && c.longSign !== -1) ||
        typeof c.timestamp !== "number"
      ) {
        return sendError(res, 400, "Payload calibrazione non valido");
      }
    }

    const value = calibration == null ? null : JSON.stringify(calibration);
    await db.execute(sql`
      UPDATE users
      SET mount_calibration = ${value}::jsonb, updated_at = NOW()
      WHERE id = ${userId}
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error("[telemetry/calibration PUT] error:", err);
    return sendError(res, 500, "Errore salvataggio calibrazione");
  }
});

router.delete("/reset", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const result = await db.execute(sql`
      DELETE FROM ride_telemetry
      WHERE user_id = ${userId}
        AND session_type NOT IN ('ideal_lap')
    `);

    const deleted = result.rowCount ?? 0;
    return res.json({ deleted });
  } catch (err) {
    console.error("[telemetry/reset] error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
