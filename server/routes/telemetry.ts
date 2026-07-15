import { Router, type Request, type Response } from "express";
import { db, withDbRetry } from "../db";
import { sql } from "drizzle-orm";
import { rideTelemetry } from "@shared/db";
import { requireUserId } from "../lib/auth-middleware";
import { sendError } from "../lib/api-response";
import { logTelemetryEvent } from "../lib/telemetry-error-log";
import { classifyTelemetrySample, coerceFiniteNumber } from "@shared/tracking-fusion";
import { getInternalProbeToken, getInternalProbeHeaderName, isLoopback } from "../ai/watchdog/internal-token";
import idealLapsRouter from "./telemetry-ideal-laps";
import calibrationRouter from "./telemetry-calibration";
import { updateTelemetrySessionStats } from "../lib/telemetry-session-stats";
import drCorrectionRouter from "./telemetry-dr-correction";

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
      const klass = classifyTelemetrySample(s);
      if (klass === "drop") continue;

      const ts = coerceFiniteNumber(s.ts) as number;

      rows.push({
        userId,
        sessionId: session_id,
        sessionType: resolvedType,
        lapName: resolvedLapName,
        ts,
        lat: coerceFiniteNumber(s.lat),
        lon: coerceFiniteNumber(s.lon),
        speedKmh: coerceFiniteNumber(s.speed_kmh),
        leanAngle: coerceFiniteNumber(s.lean_angle),
        gforceX: coerceFiniteNumber(s.gforce_x),
        gforceY: coerceFiniteNumber(s.gforce_y),
        gforceZ: coerceFiniteNumber(s.gforce_z),
        heading: coerceFiniteNumber(s.heading),
        altitudeM: coerceFiniteNumber(s.altitude_m),
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
      // Task #81 — insert campioni + aggiornamento del riepilogo per-sessione
      // (telemetry_session_stats) ATOMICI in un'unica transazione: o entrambi
      // committati o entrambi annullati. Così GET /stats (che legge SOLO il
      // riepilogo) non può mai divergere dai campioni realmente salvati.
      await db.transaction(async (tx) => {
        for (let i = 0; i < rows.length; i += CHUNK) {
          await tx.insert(rideTelemetry).values(rows.slice(i, i + CHUNK));
        }
        await updateTelemetrySessionStats(userId, session_id, resolvedType, rows, tx);
      });
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      const stack = dbErr instanceof Error ? dbErr.stack : undefined;
      console.error(`[telemetry/batch] DB ERROR userId=${userId} sessionId=${session_id}: ${msg}`);
      logTelemetryEvent({
        ts: new Date().toISOString(),
        type: "ERROR",
        context: "telemetry/batch",
        message: `DB insert/riepilogo fallito: ${msg}`,
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
    // Task #81 — i km per sessione sono pre-calcolati incrementalmente in
    // `telemetry_session_stats` (una riga per sessione, aggiornata ad ogni
    // POST /batch). I totali utente sono una semplice SUM/COUNT su poche righe:
    // niente più scansione Haversine con window function su tutti i campioni.
    //
    //   km_collected  = SUM(dist_speed_filtered) su TUTTE le sessioni (incl. ideal_lap)
    //   track_km      = SUM(dist_all)            solo sessioni 'ideal_lap'
    //   ideal_lap_km  = SUM(dist_speed_filtered) solo sessioni 'ideal_lap'
    //   sample_count / session_count / sensor_only_count escludono 'ideal_lap'
    const statsResult = await withDbRetry(() => db.execute(sql`
      SELECT
        COALESCE(SUM(dist_speed_filtered), 0) AS km_collected,
        COALESCE(SUM(dist_all) FILTER (WHERE session_type = 'ideal_lap'), 0) AS track_km,
        COALESCE(SUM(dist_speed_filtered) FILTER (WHERE session_type = 'ideal_lap'), 0) AS ideal_lap_km,
        COALESCE(SUM(sample_count) FILTER (WHERE session_type <> 'ideal_lap'), 0) AS sample_count,
        COUNT(*) FILTER (WHERE session_type <> 'ideal_lap') AS session_count,
        COALESCE(SUM(sensor_only_count) FILTER (WHERE session_type <> 'ideal_lap'), 0) AS sensor_only_count
      FROM telemetry_session_stats
      WHERE user_id = ${userId}
    `));

    const row = statsResult.rows[0] as
      | {
          km_collected: string;
          track_km: string;
          ideal_lap_km: string;
          sample_count: string;
          session_count: string;
          sensor_only_count: string;
        }
      | undefined;

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

    const kmCollected = Math.round(parseFloat(row?.km_collected ?? "0") * 10) / 10;
    const progressPct = Math.min(100, Math.round((kmCollected / TARGET_KM) * 100));
    const trackKm = Math.round(parseFloat(row?.track_km ?? "0") * 10) / 10;
    const idealLapKm = Math.round(parseFloat(row?.ideal_lap_km ?? "0") * 10) / 10;

    const payload = {
      km_collected: kmCollected,
      sample_count: sampleCount,
      session_count: sessionCount,
      sensor_only_count: sensorOnlyCount,
      progress_pct: progressPct,
      target_km: TARGET_KM,
      track_km: trackKm,
      ideal_lap_km: idealLapKm,
    };
    return res.json(payload);
  } catch (err) {
    const elapsedMs = Date.now() - startMs;
    const pgMsg = (err instanceof Error ? (err as Error & { cause?: { message?: string } }).cause?.message : undefined) ?? "";
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[telemetry/stats] error:", err, pgMsg ? `| PG: ${pgMsg}` : "");
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "ERROR",
      context: "telemetry/stats",
      message: `Fallita dopo ${elapsedMs}ms: ${errMsg}`,
      userId: (req as Request & { user?: { id?: number } }).user?.id,
      detail: pgMsg || (err instanceof Error ? err.stack : undefined),
    });
    return sendError(res, 500, "Errore interno del server");
  }
});

router.use(idealLapsRouter);
router.use(calibrationRouter);
router.use(drCorrectionRouter);

export default router;
