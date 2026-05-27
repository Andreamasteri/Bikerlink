import { cacheGetOrSet, cacheDelNamespace } from "./cache";

/**
 * Proximity-by-zone cache (Task #2517).
 *
 * Common matching queries ("utenti entro Rkm da lat/lon") repeat hundreds of
 * times per cycle. We memoise by snapping lat/lon to a small grid (default
 * 0.05° ≈ 5km) so nearby callers share the same key, with a short TTL so
 * results don't drift past their usefulness window.
 */

const NAMESPACE = "zone-candidates";
const DEFAULT_TTL_S = 60;
const DEFAULT_GRID = 0.05;

function snap(value: number, grid: number): string {
  return (Math.round(value / grid) * grid).toFixed(3);
}

export type ZoneCandidate = { userId: string; distanceKm?: number };

export async function cachedCandidatesForZone<T = ZoneCandidate>(
  lat: number,
  lon: number,
  radiusKm: number,
  loader: () => Promise<T[]>,
  opts: { ttlSeconds?: number; gridDegrees?: number; variant?: string } = {},
): Promise<T[]> {
  const grid = opts.gridDegrees ?? DEFAULT_GRID;
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_S;
  const key = `${opts.variant ?? "default"}:${snap(lat, grid)}:${snap(lon, grid)}:${Math.round(radiusKm)}`;
  return await cacheGetOrSet(NAMESPACE, key, ttl, loader);
}

export async function invalidateZoneCache(): Promise<number> {
  return await cacheDelNamespace(NAMESPACE);
}
