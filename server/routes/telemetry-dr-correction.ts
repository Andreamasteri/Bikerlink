import { Router, type Request, type Response } from "express";
import { requireUserId } from "../lib/auth-middleware";
import { sendError } from "../lib/api-response";
import { logTelemetryEvent } from "../lib/telemetry-error-log";
import {
  RECOVERY_FIXES_REQUIRED,
  RECOVERY_MAX_ACCURACY_M,
  MIN_BLACKOUT_DR_KM,
  type DrDeviationSample,
} from "@shared/dr-correction";
import { ingestDeviationBatch, getEffectiveModel } from "../dr-correction/engine";

const router = Router();

/** Max samples accepted per incremental packet (deviations are rare — one per blackout). */
const MAX_SAMPLES_PER_BATCH = 50;

function coerceNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Parse + quality-gate one raw sample. Returns null (dropped) when the recovery
 * fix is too imprecise or not yet stabilized to be a trustworthy ground truth.
 */
function parseSample(raw: unknown): DrDeviationSample | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const sessionId = typeof r.sessionId === "string" ? r.sessionId : String(r.sessionId ?? "");
  if (!sessionId) return null;

  const blackoutMs = coerceNum(r.blackoutMs);
  const drDistanceKm = coerceNum(r.drDistanceKm);
  const gpsDistanceKm = coerceNum(r.gpsDistanceKm);
  const posErrorM = coerceNum(r.posErrorM);
  const estSpeedKmh = coerceNum(r.estSpeedKmh);
  const obsSpeedKmh = coerceNum(r.obsSpeedKmh);
  const recoveryAccuracyM = coerceNum(r.recoveryAccuracyM);
  const recoveryFixCount = coerceNum(r.recoveryFixCount);
  const headingErrorDeg = r.headingErrorDeg == null ? null : coerceNum(r.headingErrorDeg);

  // Required numerics present + finite.
  if (
    [blackoutMs, drDistanceKm, gpsDistanceKm, posErrorM, estSpeedKmh, obsSpeedKmh, recoveryAccuracyM, recoveryFixCount].some(
      (n) => !Number.isFinite(n),
    )
  ) {
    return null;
  }

  // Server-side quality gate (mirrors the client): drop unstable / imprecise recoveries.
  if (recoveryFixCount < RECOVERY_FIXES_REQUIRED) return null;
  if (recoveryAccuracyM > RECOVERY_MAX_ACCURACY_M) return null;
  if (drDistanceKm < MIN_BLACKOUT_DR_KM) return null;
  if (blackoutMs <= 0) return null;

  return {
    sessionId,
    blackoutMs,
    drDistanceKm,
    gpsDistanceKm,
    posErrorM,
    estSpeedKmh,
    obsSpeedKmh,
    headingErrorDeg: headingErrorDeg != null && Number.isFinite(headingErrorDeg) ? headingErrorDeg : null,
    recoveryAccuracyM,
    recoveryFixCount,
  };
}

/**
 * POST /api/telemetry/dr-deviation
 * Incremental ingestion of GPS-vs-dead-reckoning deviation samples. Sent as small
 * packets as each blackout recovers (never one bulk upload at ride end). Samples
 * that fail the ground-truth gate are silently dropped and reported in `dropped`.
 */
router.post("/dr-deviation", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const body = req.body as { samples?: unknown[] };
    if (!Array.isArray(body.samples) || body.samples.length === 0) {
      return sendError(res, 400, "samples obbligatori");
    }
    const incoming = body.samples.slice(0, MAX_SAMPLES_PER_BATCH);
    const parsed: DrDeviationSample[] = [];
    let dropped = 0;
    for (const raw of incoming) {
      const s = parseSample(raw);
      if (s) parsed.push(s);
      else dropped += 1;
    }

    const { stored, isTest } = await ingestDeviationBatch(userId, parsed);
    return res.json({ stored, dropped, isTest });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[telemetry/dr-deviation] error:", err);
    logTelemetryEvent({
      ts: new Date().toISOString(),
      type: "ERROR",
      context: "telemetry/dr-deviation",
      message: errMsg,
      userId,
      detail: err instanceof Error ? err.stack : undefined,
    });
    return sendError(res, 500, "Errore ingestione scostamenti DR");
  }
});

/**
 * GET /api/telemetry/dr-correction
 * Returns the user's effective (per-user blended with global) correction model,
 * so the client can apply it to live dead-reckoning estimates.
 */
router.get("/dr-correction", async (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const model = await getEffectiveModel(userId);
    return res.json({ model });
  } catch (err) {
    console.error("[telemetry/dr-correction] error:", err);
    return sendError(res, 500, "Errore lettura modello di correzione DR");
  }
});

export default router;
