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
