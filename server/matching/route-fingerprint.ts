/**
 * Route Fingerprint — helpers per estrazione celle geohash e similarità Jaccard pesata.
 *
 * Una "fingerprint" è un set di celle geohash (precisione 6 = ~1.2km) che l'utente
 * ha attraversato, ciascuna con un weight derivato da frequenza e decay temporale.
 *
 * Formato cells in jsonb: { "<geohash>": weight, ... }
 */

import ngeohash from "ngeohash";

export const GEOHASH_PRECISION = 6;
export const SAMPLE_STEP_METERS = 500;
export const HALF_LIFE_DAYS = 90;

export type CellMap = Record<string, number>;

/** Haversine in metri tra due punti (più stabile di gradi). */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Campiona i punti GPS ogni `stepMeters` lungo il tracciato e restituisce
 * il set di geohash univoci attraversati (precisione 6, ~1.2km).
 */
export function extractCellsFromPoints(
  points: Array<{ latitude: number; longitude: number }>,
  stepMeters: number = SAMPLE_STEP_METERS,
  precision: number = GEOHASH_PRECISION,
): Set<string> {
  const cells = new Set<string>();
  if (points.length === 0) return cells;

  let acc = 0;
  let prev = points[0];
  cells.add(ngeohash.encode(prev.latitude, prev.longitude, precision));

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const d = haversineMeters(prev.latitude, prev.longitude, p.latitude, p.longitude);
    acc += d;
    if (acc >= stepMeters) {
      cells.add(ngeohash.encode(p.latitude, p.longitude, precision));
      acc = 0;
    }
    prev = p;
  }
  return cells;
}

/** Decay esponenziale: peso = 0.5 ^ (ageDays / halfLife). */
export function temporalWeight(ageDays: number, halfLifeDays: number = HALF_LIFE_DAYS): number {
  if (ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/** Merge celle nuove con weight in un CellMap esistente (somma pesi). */
export function mergeCells(into: CellMap, cells: Iterable<string>, weight: number): CellMap {
  for (const c of cells) {
    into[c] = (into[c] ?? 0) + weight;
  }
  return into;
}

/** Applica decay globale ai pesi correnti (per refresh periodici). */
export function applyDecay(map: CellMap, factor: number): CellMap {
  if (factor >= 1) return map;
  const out: CellMap = {};
  for (const [k, v] of Object.entries(map)) {
    const nv = v * factor;
    if (nv >= 0.01) out[k] = nv;
  }
  return out;
}

/** Centro geografico (media) delle celle in input. */
export function fingerprintCenter(map: CellMap): { lat: number; lon: number } | null {
  const keys = Object.keys(map);
  if (keys.length === 0) return null;
  let lat = 0;
  let lon = 0;
  let totalW = 0;
  for (const k of keys) {
    const { latitude, longitude } = ngeohash.decode(k);
    const w = map[k];
    lat += latitude * w;
    lon += longitude * w;
    totalW += w;
  }
  if (totalW === 0) return null;
  return { lat: lat / totalW, lon: lon / totalW };
}

/**
 * Jaccard pesato sul set di celle con bonus per celle "rare":
 *   numerator   = sum over c in A∩B of min(wA, wB) * rarity(c)
 *   denominator = sum over c in A∪B of max(wA, wB) * rarity(c)
 *
 * rarity(c) = 1 / log2(2 + globalCount(c))  → celle viste da molti utenti pesano meno.
 * Se globalCellCount non è fornito, rarity = 1 per tutte (Jaccard pesato puro).
 */
export function routeSimilarity(
  a: CellMap,
  b: CellMap,
  globalCellCount?: Map<string, number>,
): { score: number; common: string[] } {
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  if (keys.size === 0) return { score: 0, common: [] };

  let num = 0;
  let den = 0;
  const common: string[] = [];

  for (const c of keys) {
    const wA = a[c] ?? 0;
    const wB = b[c] ?? 0;
    const rarity = globalCellCount
      ? 1 / Math.log2(2 + (globalCellCount.get(c) ?? 0))
      : 1;
    if (wA > 0 && wB > 0) {
      num += Math.min(wA, wB) * rarity;
      common.push(c);
    }
    den += Math.max(wA, wB) * rarity;
  }
  return { score: den > 0 ? num / den : 0, common };
}

/** Restituisce le top-N celle comuni ordinate per peso combinato. */
export function topCommonCells(
  a: CellMap,
  b: CellMap,
  limit: number,
): Array<{ cell: string; weight: number }> {
  const out: Array<{ cell: string; weight: number }> = [];
  for (const c of Object.keys(a)) {
    if (b[c] != null) {
      out.push({ cell: c, weight: Math.min(a[c], b[c]) });
    }
  }
  out.sort((x, y) => y.weight - x.weight);
  return out.slice(0, limit);
}

export { ngeohash };
