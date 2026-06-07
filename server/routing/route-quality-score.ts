/**
 * Task #3191 — Score qualità di una route per il confronto a doppio engine
 * dell'AI Routing Engine Selector.
 *
 * Lo score è deterministico e indipendente dall'engine: usa solo segnali
 * comparabili tra GraphHopper e Valhalla (distanza, tempo, eventuale road_class).
 * Più alto = migliore per lo stile richiesto.
 */
import type { RouteResult } from "./graphhopper-adapter";

export type RouteStyle = "curvy" | "balanced" | "fast" | "direct" | "extra_curvy" | string;

export interface RouteScoreBreakdown {
  distanceKm: number;
  durationMin: number;
  avgSpeedKmh: number;
  detourRatio: number;
  highwayFraction: number | null;
}

export interface RouteScore {
  score: number;
  breakdown: RouteScoreBreakdown;
}

// Classi OSM considerate "autostrada/superstrada" (da evitare nei profili curvy).
const MOTORWAY_CLASSES = new Set(["motorway", "trunk", "motorway_link", "trunk_link"]);

/**
 * Estrae la frazione di percorso su strade veloci dai details.road_class
 * (formato GraphHopper: [[fromIdx, toIdx, value], ...]). Ritorna null se i
 * dati non sono presenti (es. engine che non espone road_class).
 */
function extractHighwayFraction(path: RouteResult["paths"][number]): number | null {
  const roadClass = path.details?.road_class as unknown;
  if (!Array.isArray(roadClass) || roadClass.length === 0) return null;
  let total = 0;
  let highway = 0;
  for (const seg of roadClass) {
    if (!Array.isArray(seg) || seg.length < 3) continue;
    const span = Math.max(0, Number(seg[1]) - Number(seg[0]));
    total += span;
    if (MOTORWAY_CLASSES.has(String(seg[2]))) highway += span;
  }
  if (total <= 0) return null;
  return highway / total;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Valuta una route per uno stile dato.
 * @param result   Risultato dell'engine
 * @param aerialKm Distanza aerea (haversine) sommata sui waypoint — baseline detour
 * @param style    Stile percorso (curvy/balanced/fast/...)
 */
export function scoreRoute(result: RouteResult, aerialKm: number, style: RouteStyle): RouteScore {
  const path = result.paths?.[0];
  const distanceKm = (path?.distance ?? 0) / 1000;
  const durationMin = (path?.time ?? 0) / 60_000;
  const durationH = (path?.time ?? 0) / 3_600_000;
  const avgSpeedKmh = durationH > 0 ? distanceKm / durationH : 0;
  const detourRatio = aerialKm > 0 ? distanceKm / aerialKm : 1;
  const highwayFraction = path ? extractHighwayFraction(path) : null;

  // Normalizzazioni euristiche:
  // - detour: ratio 1.0 → 0, ~2.5 → 1 (più curve = ratio alto)
  const detourNorm = clamp01((detourRatio - 1) / 1.5);
  // - velocità media: 30 km/h → 0, 110 km/h → 1 (proxy strade veloci)
  const speedNorm = clamp01((avgSpeedKmh - 30) / 80);
  // road_class assente (es. Valhalla che non espone i details) → valore NEUTRO
  // (0.5), non best-case (0): altrimenti il termine anti-autostrada premierebbe
  // ingiustamente l'engine senza dati nel confronto dual-compare.
  const hw = highwayFraction ?? 0.5;

  const isFast = style === "fast" || style === "direct";

  const score = isFast
    // Veloce: premia velocità alta, penalizza detour eccessivo
    ? 0.7 * speedNorm + 0.3 * (1 - detourNorm)
    // Curvy/balanced: premia detour e strade secondarie (bassa velocità, no autostrade)
    : 0.45 * detourNorm + 0.35 * (1 - speedNorm) + 0.2 * (1 - hw);

  return {
    score: clamp01(score),
    breakdown: {
      distanceKm: Math.round(distanceKm * 10) / 10,
      durationMin: Math.round(durationMin),
      avgSpeedKmh: Math.round(avgSpeedKmh),
      detourRatio: Math.round(detourRatio * 100) / 100,
      highwayFraction: highwayFraction === null ? null : Math.round(highwayFraction * 100) / 100,
    },
  };
}
