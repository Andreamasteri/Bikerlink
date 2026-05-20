/**
 * Shared server-side geo utilities.
 * Single source of truth for the haversine formula — import from here
 * instead of copy-pasting across route files.
 */

/**
 * Returns the great-circle distance in kilometres between two WGS-84 points.
 * Uses the haversine formula with atan2 for numerical stability.
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Alias for `haversineKm` — kept for files that historically used the name
 * `haversineDistance`.
 */
export const haversineDistance = haversineKm;
