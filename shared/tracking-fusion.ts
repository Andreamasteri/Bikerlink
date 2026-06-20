/**
 * Shared tracking-fusion utilities — single source of truth for the distance
 * quality gate so the client live accumulation and the server recompute never
 * diverge beyond a documented tolerance.
 *
 * Used by:
 *  - client: hooks/tracking/useTrackingEffects.ts (live accumulation)
 *  - server: server/routes/tracking/stats.ts (fallback recompute from points)
 */

export const TRACKING_FUSION = {
  /** GPS accuracy (metres) above which a fix is too noisy to count as distance. */
  ACCURACY_GATE_M: 35,
  /** Smallest segment (metres) that ever counts — noise floor at perfect accuracy. */
  MIN_SEGMENT_FLOOR_M: 3,
  /** Largest accuracy-derived segment floor (metres) — keeps slow moves countable. */
  MAX_SEGMENT_FLOOR_M: 8,
  /** Implied instantaneous speed (km/h) above which a segment is a GPS jump. */
  MAX_PLAUSIBLE_KMH: 360,
  /** Speed (km/h) below which the rider is treated as idle. */
  IDLE_THRESHOLD_KMH: 2,
  /** A GPS fix older than this (ms) is considered stale → no live GPS. */
  GPS_STALE_MS: 6000,
  /** Grace period (ms) after Start with no usable GPS fix before sensors-only
   * recording engages, so a cold/absent GPS start still records via sensors. */
  ACQUIRING_GRACE_MS: 8000,
  /** Sustained |DR speed − GPS speed| (km/h) flagged as sensor divergence. */
  DIVERGENCE_KMH: 50,
  /** Consecutive divergent samples before sensors are dropped as a source. */
  DIVERGENCE_SAMPLES: 3,
} as const;

/**
 * Fusion mode for the active recording, surfaced to the UI for observability.
 * - acquiring: waiting for the first usable GPS fix
 * - gps_sensors: GPS + sensors fused (default when both healthy)
 * - gps_only: GPS only (sensors off or diverging from GPS)
 * - sensors_only: GPS absent/stale, recording continues from sensors (dead reckoning)
 */
export type FusionMode = "acquiring" | "gps_sensors" | "gps_only" | "sensors_only";

/** Great-circle distance in kilometres (haversine, atan2 form for stability). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Minimum segment length (km) required to count, scaled by reported accuracy so
 * noisy fixes need to move more before they register. `null` accuracy (e.g. server
 * route points that don't store accuracy) falls back to the floor.
 */
export function accuracyAwareMinSegmentKm(accuracyM: number | null | undefined): number {
  const acc = accuracyM == null || accuracyM < 0 ? 0 : accuracyM;
  const m = Math.min(
    TRACKING_FUSION.MAX_SEGMENT_FLOOR_M,
    Math.max(TRACKING_FUSION.MIN_SEGMENT_FLOOR_M, acc * 0.5),
  );
  return m / 1000;
}

export interface SegmentInput {
  prevLat: number;
  prevLng: number;
  prevTimeMs: number;
  lat: number;
  lng: number;
  timeMs: number;
  /** Reported GPS accuracy in metres, or null/undefined when unknown. */
  accuracyM?: number | null;
}

export interface SegmentDecision {
  accept: boolean;
  distanceKm: number;
  reason?: "low_accuracy" | "below_floor" | "speed_jump";
}

/**
 * Decide whether a GPS segment is a real movement worth adding to total distance.
 * Rejects poor-accuracy fixes, sub-noise-floor jitter and implausible jumps.
 */
export function evaluateSegment(input: SegmentInput): SegmentDecision {
  const { prevLat, prevLng, prevTimeMs, lat, lng, timeMs, accuracyM } = input;
  if (accuracyM != null && accuracyM > TRACKING_FUSION.ACCURACY_GATE_M) {
    return { accept: false, distanceKm: 0, reason: "low_accuracy" };
  }
  const distKm = haversineKm(prevLat, prevLng, lat, lng);
  if (distKm < accuracyAwareMinSegmentKm(accuracyM)) {
    return { accept: false, distanceKm: 0, reason: "below_floor" };
  }
  const dtSec = Math.max((timeMs - prevTimeMs) / 1000, 0.001);
  const impliedKmh = (distKm / dtSec) * 3600;
  if (impliedKmh > TRACKING_FUSION.MAX_PLAUSIBLE_KMH) {
    return { accept: false, distanceKm: 0, reason: "speed_jump" };
  }
  return { accept: true, distanceKm: distKm };
}
