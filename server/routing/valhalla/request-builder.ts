/**
 * Request builder — RouteRequest → Valhalla /route payload
 *
 * Profilo motorcycle:
 *   use_highways: 0.3  — penalizza autostrade, favorisce statali/provinciali
 *   use_trails: 0.0    — evita sterrati (profilo road touring, non enduro)
 *   use_ferry: 0.5     — ferries consentiti con peso neutro
 *   country_crossing_penalty: 0  — nessuna penalità per attraversare confini
 */

import type { RouteRequest } from "../graphhopper-adapter";

const MOTORCYCLE_COSTING_OPTIONS = {
  use_highways: 0.3,
  use_trails: 0.0,
  use_ferry: 0.5,
  country_crossing_penalty: 0,
} as const;

interface ValhallaLocation {
  lat: number;
  lon: number;
  type?: "break" | "through";
}

export interface ValhallaRoutePayload {
  locations: ValhallaLocation[];
  costing: string;
  costing_options: Record<string, unknown>;
  directions_options: { language: string; units: string };
  exclude_polygons?: unknown[];
}

function resolveCosting(profile?: string): string {
  if (!profile || profile === "motorcycle") return "motorcycle";
  if (profile === "car") return "auto";
  return "motorcycle";
}

/**
 * Converte i punti [lng, lat][] del formato interno in {lat, lon}[] per Valhalla.
 * Il formato interno usa [lng, lat] (GeoJSON), Valhalla vuole {lat, lon}.
 */
function buildLocations(points: [number, number][]): ValhallaLocation[] {
  return points.map((p, idx) => ({
    lat: p[1],
    lon: p[0],
    type: idx === 0 || idx === points.length - 1 ? "break" : "through",
  }));
}

/**
 * Costruisce il payload per POST /route di Valhalla.
 */
export function buildValhallaRoutePayload(req: RouteRequest): ValhallaRoutePayload {
  const costing = resolveCosting(req.profile);

  return {
    locations: buildLocations(req.points),
    costing,
    costing_options: {
      [costing]: MOTORCYCLE_COSTING_OPTIONS,
    },
    directions_options: {
      language: "it-IT",
      units: "kilometers",
    },
  };
}

/**
 * Costruisce il payload per POST /trace_attributes di Valhalla.
 * Usato per map-matching (matchTrace) — restituisce way_id e attributi per edge.
 */
export function buildValhallaTracePayload(points: [number, number][], profile?: string): object {
  const costing = resolveCosting(profile);
  return {
    shape: points.map((p) => ({ lat: p[1], lon: p[0] })),
    costing,
    costing_options: { [costing]: MOTORCYCLE_COSTING_OPTIONS },
    shape_match: "map_snap",
    filters: {
      attributes: ["edge.way_id", "edge.length", "edge.speed"],
      action: "include",
    },
  };
}
