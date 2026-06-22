/**
 * Response mapper — Valhalla → RouteResult interno
 *
 * Converte la risposta di Valhalla /route nel formato interno
 * usato da GraphHopper (paths[].{distance, time, points, instructions}).
 *
 * Coordinate convention:
 *   - decodePolyline6 restituisce [lat, lng]
 *   - Il formato interno (GeoJSON) richiede [lng, lat]
 *   - mergeLegsShape esegue lo swap prima di restituire
 */

import { decodePolyline6 } from "./polyline-convert";
import type { RouteResult, MapMatchResult } from "../graphhopper-adapter";

interface ValhallaManeuver {
  instruction?: string;
  length?: number;
  time?: number;
  begin_shape_index?: number;
  end_shape_index?: number;
  type?: number;
}

interface ValhallaLeg {
  shape: string;
  summary?: { length?: number; time?: number };
  maneuvers?: ValhallaManeuver[];
}

interface ValhallaSummary {
  length?: number;
  time?: number;
}

export interface ValhallaRouteResponse {
  trip?: {
    summary?: ValhallaSummary;
    legs?: ValhallaLeg[];
    status_message?: string;
    status?: number;
  };
}

/**
 * Mappa tipo manovra Valhalla → sign GraphHopper (convenzione interna).
 */
function mapManeuverType(type?: number): number {
  if (type === undefined) return 0;
  if (type === 0) return 4;
  if (type === 1) return 0;
  if (type === 6) return -3;
  if (type === 7) return 3;
  if (type === 10) return -2;
  if (type === 11) return 2;
  if (type === 12) return -1;
  if (type === 13) return 1;
  if (type === 23) return 6;
  return 0;
}

/**
 * Combina le shape di tutte le leg in [lng, lat][] (formato GeoJSON interno).
 * decodePolyline6 restituisce [lat, lng] → qui viene eseguito lo swap a [lng, lat].
 */
function mergeLegsShape(legs: ValhallaLeg[]): [number, number][] {
  const merged: [number, number][] = [];
  for (let i = 0; i < legs.length; i++) {
    const decoded = decodePolyline6(legs[i].shape ?? "");
    // swap [lat,lng] → [lng,lat] per rispettare il formato GeoJSON interno
    const coords: [number, number][] = decoded.map(([lat, lng]) => [lng, lat]);
    if (i === 0) {
      merged.push(...coords);
    } else {
      merged.push(...coords.slice(1));
    }
  }
  return merged;
}

/**
 * Mappa la risposta Valhalla /route nel formato interno RouteResult.
 */
export function mapValhallaResponse(raw: ValhallaRouteResponse): RouteResult {
  const trip = raw.trip;
  if (!trip) throw new Error("Valhalla: risposta senza campo 'trip'");

  const legs: ValhallaLeg[] = trip.legs ?? [];
  if (legs.length === 0) throw new Error("Valhalla: nessuna leg nel trip");

  const summary = trip.summary ?? {};
  const distanceM = (summary.length ?? 0) * 1000;
  const timeMs = (summary.time ?? 0) * 1000;

  const coords = mergeLegsShape(legs);

  const instructions: any[] = [];
  let shapeOffset = 0;

  for (const leg of legs) {
    const maneuvers = leg.maneuvers ?? [];
    for (const m of maneuvers) {
      instructions.push({
        text: m.instruction ?? "",
        distance: (m.length ?? 0) * 1000,
        time: (m.time ?? 0) * 1000,
        sign: mapManeuverType(m.type),
        interval: [
          shapeOffset + (m.begin_shape_index ?? 0),
          shapeOffset + (m.end_shape_index ?? 0),
        ],
      });
    }
    const legDecoded = decodePolyline6(leg.shape ?? "");
    shapeOffset += Math.max(0, legDecoded.length - 1);
  }

  return {
    paths: [
      {
        distance: distanceM,
        time: timeMs,
        points: { coordinates: coords },
        instructions,
      },
    ],
  };
}

/**
 * Mappa la risposta Valhalla /trace_attributes nel formato interno MapMatchResult.
 * /trace_attributes restituisce edges[] + shape (Polyline6).
 */
export function mapValhallaTraceResponse(raw: unknown): MapMatchResult {
  const r = raw as {
    edges?: Array<{ way_id?: number; length?: number }>;
    shape?: string;
  };

  const decoded = decodePolyline6(r.shape ?? "");
  const coords: [number, number][] = decoded.map(([lat, lng]) => [lng, lat]);

  const edges = r.edges ?? [];
  const totalDistKm = edges.reduce((sum, e) => sum + (e.length ?? 0), 0);

  const osmWayIds: [number, number, number][] = [];
  for (let i = 0; i < edges.length; i++) {
    const w = edges[i].way_id;
    if (w !== undefined) osmWayIds.push([i, i + 1, w]);
  }

  return {
    paths: [
      {
        distance: totalDistKm * 1000,
        time: 0,
        points: { coordinates: coords },
        details: osmWayIds.length > 0 ? { osm_way_id: osmWayIds } : undefined,
      },
    ],
  };
}
