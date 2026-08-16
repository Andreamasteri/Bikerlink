export const AUTOMATIC_START_SPEED_KMH = 5;
export const AUTOMATIC_START_DURATION_MS = 5000;
export const AUTOMATIC_START_MIN_DISPLACEMENT_M = 5;
export const AUTOMATIC_START_MAX_ACCURACY_M = 50;
export const AUTOMATIC_START_MIN_STRAIGHTNESS = 0.65;

export interface AutomaticStartSample {
  nowMs: number;
  speedKmh: number;
  accuracyM?: number | null;
  latitude: number;
  longitude: number;
}

export interface AutomaticStartState {
  candidateSinceMs: number | null;
  firstPoint: { latitude: number; longitude: number } | null;
  previousPoint: { latitude: number; longitude: number } | null;
  pathDistanceM: number;
  triggered: boolean;
}

export function createAutomaticStartState(): AutomaticStartState {
  return {
    candidateSinceMs: null,
    firstPoint: null,
    previousPoint: null,
    pathDistanceM: 0,
    triggered: false,
  };
}

function distanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const earthRadiusM = 6_371_000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Advances the arming state. A start is accepted only after a clean,
 * continuous movement window: >=5 km/h for 5 seconds, usable GPS accuracy,
 * and enough mostly-linear displacement to reject stationary GPS jitter.
 */
export function automaticStartTick(state: AutomaticStartState, sample: AutomaticStartSample): AutomaticStartState {
  if (state.triggered) return state;
  const point = { latitude: sample.latitude, longitude: sample.longitude };
  const accurate = sample.accuracyM == null || sample.accuracyM <= AUTOMATIC_START_MAX_ACCURACY_M;
  const moving = Number.isFinite(sample.speedKmh) && sample.speedKmh >= AUTOMATIC_START_SPEED_KMH;

  if (!accurate || !moving) {
    return { ...createAutomaticStartState(), previousPoint: point };
  }

  const candidateSinceMs = state.candidateSinceMs ?? sample.nowMs;
  const firstPoint = state.firstPoint ?? point;
  const previousPoint = state.previousPoint;
  const increment = previousPoint ? distanceM(previousPoint, point) : 0;
  const pathDistanceM = state.pathDistanceM + Math.min(increment, 100);
  const netDistanceM = distanceM(firstPoint, point);
  const straightness = pathDistanceM > 0 ? netDistanceM / pathDistanceM : 0;
  const triggered = sample.nowMs - candidateSinceMs >= AUTOMATIC_START_DURATION_MS
    && netDistanceM >= AUTOMATIC_START_MIN_DISPLACEMENT_M
    && straightness >= AUTOMATIC_START_MIN_STRAIGHTNESS;

  return { candidateSinceMs, firstPoint, previousPoint: point, pathDistanceM, triggered };
}
