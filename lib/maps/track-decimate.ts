const DEFAULT_MAX_POINTS = 1500;

export function decimateTrack<T extends { lat: number }>(
  points: T[],
  maxPoints: number = DEFAULT_MAX_POINTS
): T[] {
  const clampedMax = Math.max(2, Math.round(maxPoints));
  if (points.length <= clampedMax) return points;
  const result: T[] = [];
  const stride = (points.length - 1) / (clampedMax - 1);
  for (let i = 0; i < clampedMax; i++) {
    const idx = i === clampedMax - 1 ? points.length - 1 : Math.round(i * stride);
    result.push(points[idx]);
  }
  return result;
}

function _bearingDeg(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLng = (b.lng - a.lng) * (Math.PI / 180);
  const lat1 = a.lat * (Math.PI / 180);
  const lat2 = b.lat * (Math.PI / 180);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function _angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Curvature-aware decimation.
 *
 * First marks every point whose incoming/outgoing bearing change exceeds
 * `bendThresholdDeg` as a "must-keep" bend point.  The remaining budget is
 * filled with uniformly-strided non-bend points.  This guarantees that sharp
 * hairpin turns are never silently dropped by a pure stride-based pass, which
 * is critical for curvature-gradient rendering accuracy.
 *
 * Falls back gracefully: when bend points alone already exceed the budget they
 * are thinned uniformly (never producing more than `maxPoints` output).
 */
export function decimateTrackCurvatureAware<
  T extends { lat: number; lng: number },
>(
  points: T[],
  maxPoints: number = DEFAULT_MAX_POINTS,
  bendThresholdDeg: number = 10
): T[] {
  const clampedMax = Math.max(2, Math.round(maxPoints));
  if (points.length <= clampedMax) return points;

  const bendSet = new Set<number>();
  bendSet.add(0);
  bendSet.add(points.length - 1);

  for (let i = 1; i < points.length - 1; i++) {
    const b1 = _bearingDeg(points[i - 1], points[i]);
    const b2 = _bearingDeg(points[i], points[i + 1]);
    if (_angleDiff(b1, b2) >= bendThresholdDeg) {
      bendSet.add(i);
    }
  }

  const bendArr = Array.from(bendSet).sort((a, b) => a - b);

  if (bendArr.length >= clampedMax) {
    const result: T[] = [];
    const stride = (bendArr.length - 1) / (clampedMax - 1);
    for (let i = 0; i < clampedMax; i++) {
      const idx =
        i === clampedMax - 1
          ? bendArr.length - 1
          : Math.round(i * stride);
      result.push(points[bendArr[idx]]);
    }
    return result;
  }

  const remaining = clampedMax - bendArr.length;
  const nonBend: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    if (!bendSet.has(i)) nonBend.push(i);
  }

  const selectedNonBend = new Set<number>();
  if (remaining > 0 && nonBend.length > 0) {
    if (nonBend.length <= remaining) {
      nonBend.forEach((i) => selectedNonBend.add(i));
    } else if (remaining === 1) {
      selectedNonBend.add(nonBend[Math.floor(nonBend.length / 2)]);
    } else {
      const stride = (nonBend.length - 1) / (remaining - 1);
      for (let i = 0; i < remaining; i++) {
        const idx = Math.min(Math.round(i * stride), nonBend.length - 1);
        selectedNonBend.add(nonBend[idx]);
      }
    }
  }

  const merged = Array.from(new Set([...bendArr, ...selectedNonBend])).sort(
    (a, b) => a - b
  );
  return merged.map((i) => points[i]);
}
