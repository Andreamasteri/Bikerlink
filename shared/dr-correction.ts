/**
 * DR Correction Engine — shared deterministic/statistical math (Task #47).
 *
 * This module is the shared core of the "dead-reckoning (DR) correction engine".
 * It is a PURE, deterministic, statistical layer — NOT an AI/LLM agent. It has
 * nothing to do with the routing-health AI agents (do NOT confuse it with the
 * "Horus" escalation/analyzer modules under server/ai/*). It only turns observed
 * GPS-vs-dead-reckoning deviations into per-user correction parameters and applies
 * them back to raw DR estimates.
 *
 * It intentionally lives OUTSIDE shared/tracking-fusion.ts: the live GPS/DR fusion
 * quality gate there is out of scope for this task and stays untouched. This is the
 * "correzione successiva" (subsequent correction) layered on top of the collected data.
 *
 * Used by:
 *  - client: collection thresholds (how many coherent recovery fixes to wait for)
 *    and applying a learned correction to the DR distance step;
 *  - server: computing/blending per-user and global correction models from the
 *    deviation samples.
 */

// ---------------------------------------------------------------------------
// Collection thresholds (client-side)
// ---------------------------------------------------------------------------

/**
 * How many consecutive, mutually-coherent usable GPS fixes must arrive after a
 * dead-reckoning blackout before the recovery is trusted as ground truth. The
 * first recovery fix is frequently noisy (tunnel exit / multipath), so a single
 * fix is never enough.
 */
export const RECOVERY_FIXES_REQUIRED = 3;

/**
 * A recovery fix must be at least this accurate (meters) to count toward the
 * consecutive-fix requirement. Looser than the live distance gate on purpose:
 * we only want to reject clearly unusable fixes here.
 */
export const RECOVERY_MAX_ACCURACY_M = 35;

/**
 * Two consecutive recovery fixes are "coherent" only if the implied speed between
 * them is physically plausible. A jump beyond this (km/h) resets the recovery
 * streak — we keep waiting for a stable lock instead of recording a bogus sample.
 */
export const RECOVERY_COHERENCE_MAX_KMH = 240;

/**
 * Ignore trivially short blackouts: if dead reckoning only bridged a few meters
 * the deviation signal is dominated by noise and not worth recording.
 */
export const MIN_BLACKOUT_DR_KM = 0.03;

// ---------------------------------------------------------------------------
// Model bounds (server-side)
// ---------------------------------------------------------------------------

/** Distance/speed scale factors are clamped to a sane band so a few outliers
 *  can never blow up a rider's live totals. */
export const DR_SCALE_MIN = 0.5;
export const DR_SCALE_MAX = 2.0;
export const DR_SPEED_BIAS_MAX_KMH = 40;
export const DR_HEADING_BIAS_MAX_DEG = 45;

/** Minimum samples before a per-user model is trusted on its own; below this we
 *  lean more heavily on the global model. */
export const MIN_SAMPLES_FOR_USER_MODEL = 5;

/** Blend smoothing constant: userWeight = n / (n + K). With K = MIN_SAMPLES_FOR_USER_MODEL
 *  a user reaches ~50% self-weight at K samples and asymptotes to 1 with more data. */
export const BLEND_SMOOTHING_K = MIN_SAMPLES_FOR_USER_MODEL;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One deviation observation, produced on the client at a confirmed GPS recovery. */
export interface DrDeviationSample {
  /** Route/session id this deviation belongs to. */
  sessionId: string;
  /** Blackout duration in ms (last accepted GPS fix → confirmed recovery). */
  blackoutMs: number;
  /** Distance (km) dead reckoning accumulated during the blackout. */
  drDistanceKm: number;
  /** Straight-line distance (km) from the frozen anchor to the recovery position. */
  gpsDistanceKm: number;
  /** Position error (m) between the DR-estimated position and the GPS recovery position. */
  posErrorM: number;
  /** DR-estimated speed (km/h) at the moment of recovery. */
  estSpeedKmh: number;
  /** GPS-observed speed (km/h) at the recovery fix. */
  obsSpeedKmh: number;
  /** Heading error (deg) between DR travel bearing and GPS travel bearing; null if unknown. */
  headingErrorDeg: number | null;
  /** Accuracy (m) of the confirmed recovery fix. */
  recoveryAccuracyM: number;
  /** How many coherent consecutive fixes were used to confirm the recovery. */
  recoveryFixCount: number;
}

/** The correction parameters learned for a user (or globally). */
export interface DrCorrectionModel {
  /** Multiplier applied to raw DR distance (gpsDistance / drDistance median). */
  distanceScale: number;
  /** Multiplier applied to raw DR speed (obsSpeed / estSpeed median). */
  speedScale: number;
  /** Additive speed bias in km/h (obsSpeed - estSpeed median). */
  speedBiasKmh: number;
  /** Additive heading bias in degrees. */
  headingBiasDeg: number;
  /** Mean position error (m) across the samples that built this model. */
  meanPosErrorM: number;
  /** Mean absolute speed error (km/h) across the samples. */
  meanSpeedErrorKmh: number;
  /** Number of samples this model was computed from. */
  sampleCount: number;
}

/** The neutral (identity) model — applying it changes nothing. */
export const IDENTITY_MODEL: DrCorrectionModel = {
  distanceScale: 1,
  speedScale: 1,
  speedBiasKmh: 0,
  headingBiasDeg: 0,
  meanPosErrorM: 0,
  meanSpeedErrorKmh: 0,
  sampleCount: 0,
};

// ---------------------------------------------------------------------------
// Geo / stats helpers (self-contained; does not import tracking-fusion)
// ---------------------------------------------------------------------------

const R_EARTH_M = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const y = Math.sin(toRad(bLng - aLng)) * Math.cos(toRad(bLat));
  const x =
    Math.cos(toRad(aLat)) * Math.sin(toRad(bLat)) -
    Math.sin(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.cos(toRad(bLng - aLng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Signed smallest angular difference a→b in [-180, 180]. */
export function angleDiffDeg(a: number, b: number): number {
  let d = ((b - a + 540) % 360) - 180;
  if (d === -180) d = 180;
  return d;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function median(values: number[]): number {
  const xs = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

// ---------------------------------------------------------------------------
// Model computation (deterministic, statistical — no AI)
// ---------------------------------------------------------------------------

/**
 * Build a correction model from a set of deviation samples using robust medians.
 * Deterministic: the same input always yields the same output.
 */
export function computeModelFromSamples(samples: DrDeviationSample[]): DrCorrectionModel {
  if (samples.length === 0) return { ...IDENTITY_MODEL };

  const distRatios: number[] = [];
  const speedRatios: number[] = [];
  const speedBiases: number[] = [];
  const headingBiases: number[] = [];
  const posErrors: number[] = [];
  const speedErrorsAbs: number[] = [];

  for (const s of samples) {
    if (s.drDistanceKm > MIN_BLACKOUT_DR_KM && s.gpsDistanceKm > 0) {
      distRatios.push(s.gpsDistanceKm / s.drDistanceKm);
    }
    if (s.estSpeedKmh > 1 && s.obsSpeedKmh >= 0) {
      speedRatios.push(s.obsSpeedKmh / s.estSpeedKmh);
    }
    speedBiases.push(s.obsSpeedKmh - s.estSpeedKmh);
    speedErrorsAbs.push(Math.abs(s.obsSpeedKmh - s.estSpeedKmh));
    if (s.headingErrorDeg != null && Number.isFinite(s.headingErrorDeg)) {
      headingBiases.push(s.headingErrorDeg);
    }
    if (Number.isFinite(s.posErrorM)) posErrors.push(s.posErrorM);
  }

  return {
    distanceScale: clamp(distRatios.length ? median(distRatios) : 1, DR_SCALE_MIN, DR_SCALE_MAX),
    speedScale: clamp(speedRatios.length ? median(speedRatios) : 1, DR_SCALE_MIN, DR_SCALE_MAX),
    speedBiasKmh: clamp(median(speedBiases), -DR_SPEED_BIAS_MAX_KMH, DR_SPEED_BIAS_MAX_KMH),
    headingBiasDeg: clamp(
      headingBiases.length ? median(headingBiases) : 0,
      -DR_HEADING_BIAS_MAX_DEG,
      DR_HEADING_BIAS_MAX_DEG,
    ),
    meanPosErrorM: posErrors.length ? posErrors.reduce((a, b) => a + b, 0) / posErrors.length : 0,
    meanSpeedErrorKmh: speedErrorsAbs.length
      ? speedErrorsAbs.reduce((a, b) => a + b, 0) / speedErrorsAbs.length
      : 0,
    sampleCount: samples.length,
  };
}

/**
 * Blend a per-user model with the global model. A user with few samples leans on
 * the global picture; as their own sample count grows they trust themselves more.
 * userWeight = n / (n + K).
 */
export function blendWithGlobal(
  user: DrCorrectionModel,
  global: DrCorrectionModel,
): DrCorrectionModel {
  const n = user.sampleCount;
  const w = n / (n + BLEND_SMOOTHING_K); // 0 when no user data, →1 with lots of data
  const mix = (u: number, g: number) => u * w + g * (1 - w);
  return {
    distanceScale: clamp(mix(user.distanceScale, global.distanceScale), DR_SCALE_MIN, DR_SCALE_MAX),
    speedScale: clamp(mix(user.speedScale, global.speedScale), DR_SCALE_MIN, DR_SCALE_MAX),
    speedBiasKmh: clamp(
      mix(user.speedBiasKmh, global.speedBiasKmh),
      -DR_SPEED_BIAS_MAX_KMH,
      DR_SPEED_BIAS_MAX_KMH,
    ),
    headingBiasDeg: clamp(
      mix(user.headingBiasDeg, global.headingBiasDeg),
      -DR_HEADING_BIAS_MAX_DEG,
      DR_HEADING_BIAS_MAX_DEG,
    ),
    meanPosErrorM: user.meanPosErrorM,
    meanSpeedErrorKmh: user.meanSpeedErrorKmh,
    sampleCount: user.sampleCount,
  };
}

/**
 * Apply a correction model to a raw dead-reckoning estimate. Pure function; the
 * caller decides where the corrected values are consumed (e.g. the client DR step).
 */
export function applyDrCorrection(
  model: DrCorrectionModel,
  raw: { distanceKm?: number; speedKmh?: number; headingDeg?: number },
): { distanceKm: number; speedKmh: number; headingDeg: number } {
  const distanceKm = (raw.distanceKm ?? 0) * model.distanceScale;
  const speedKmh = Math.max(0, (raw.speedKmh ?? 0) * model.speedScale + model.speedBiasKmh);
  const headingDeg =
    raw.headingDeg != null ? (raw.headingDeg + model.headingBiasDeg + 360) % 360 : 0;
  return { distanceKm, speedKmh, headingDeg };
}
