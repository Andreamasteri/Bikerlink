/**
 * Response mapper — Mapbox Directions → RouteResult interno
 *
 * Converte la risposta della Mapbox Directions API nel formato interno
 * usato da GraphHopper (paths[].{distance, time, points, instructions}).
 *
 * Coordinate convention:
 *   - Mapbox geometry (Polyline6) → decodePolyline6 → [lat, lng]
 *   - Formato interno (GeoJSON) richiede [lng, lat]
 *   - Lo swap viene eseguito in buildCoords
 */

import { decodePolyline6 } from "../valhalla/polyline-convert";
import type { RouteResult, MapMatchResult } from "../graphhopper-adapter";

interface MapboxManeuver {
  instruction?: string;
  type?: string;
  modifier?: string;
}

interface MapboxStep {
  maneuver?: MapboxManeuver;
  distance?: number;
  duration?: number;
  geometry?: string;
}

interface MapboxLeg {
  steps?: MapboxStep[];
  distance?: number;
  duration?: number;
}

export interface MapboxRoute {
  geometry: string;
  distance: number;
  duration: number;
  legs?: MapboxLeg[];
}

export interface MapboxDirectionsResponse {
  code: string;
  routes?: MapboxRoute[];
  message?: string;
}

/**
 * Mappa tipo/modifier manovra Mapbox → sign GraphHopper (convenzione interna).
 */
function mapManeuverSign(type?: string, modifier?: string): number {
  if (!type) return 0;
  if (type === "arrive") return 4;
  if (type === "depart") return 4;
  if (type === "turn") {
    if (modifier === "left") return -2;
    if (modifier === "slight left") return -1;
    if (modifier === "sharp left") return -3;
    if (modifier === "right") return 2;
    if (modifier === "slight right") return 1;
    if (modifier === "sharp right") return 3;
    if (modifier === "uturn") return 6;
  }
  if (type === "roundabout" || type === "rotary") return 6;
  if (type === "merge") return 0;
  if (type === "fork") return modifier?.includes("left") ? -1 : 1;
  return 0;
}

/**
 * Decodifica una geometry Polyline6 e restituisce [lng, lat][] (GeoJSON interno).
 */
function buildCoords(geometry: string): [number, number][] {
  const decoded = decodePolyline6(geometry);
  return decoded.map(([lat, lng]) => [lng, lat]);
}

/**
 * Mappa la risposta Mapbox Directions API nel formato interno RouteResult.
 */
export function mapMapboxResponse(raw: MapboxDirectionsResponse): RouteResult {
  if (raw.code !== "Ok") {
    throw new Error(`Mapbox: codice risposta non Ok — ${raw.code}: ${raw.message ?? ""}`);
  }

  const routes = raw.routes ?? [];
  if (routes.length === 0) {
    throw new Error("Mapbox: nessuna route nella risposta");
  }

  const route = routes[0];
  const coords = buildCoords(route.geometry);

  const instructions: Array<{ text: string; distance: number; time: number; sign: number; interval: [number, number] }> = [];
  let stepOffset = 0;

  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      const stepCoords = step.geometry ? buildCoords(step.geometry) : [];
      const stepLen = Math.max(stepCoords.length, 1);

      instructions.push({
        text: step.maneuver?.instruction ?? "",
        distance: step.distance ?? 0,
        time: Math.round((step.duration ?? 0) * 1000),
        sign: mapManeuverSign(step.maneuver?.type, step.maneuver?.modifier),
        interval: [stepOffset, stepOffset + stepLen - 1],
      });

      stepOffset += Math.max(0, stepLen - 1);
    }
  }

  return {
    paths: [
      {
        distance: route.distance,
        time: Math.round(route.duration * 1000),
        points: { coordinates: coords },
        instructions,
      },
    ],
  };
}

/**
 * Stub: Mapbox non supporta map-matching nel piano gratuito.
 * Restituisce un MapMatchResult vuoto per compatibilità interfaccia.
 */
export function mapMapboxTraceResponse(_raw: unknown): MapMatchResult {
  return {
    paths: [
      {
        distance: 0,
        time: 0,
        points: { coordinates: [] },
      },
    ],
  };
}
