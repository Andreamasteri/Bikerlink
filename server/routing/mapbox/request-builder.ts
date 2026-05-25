/**
 * Request builder — RouteRequest → Mapbox Directions API URL + params
 *
 * Mapbox non ha profilo motorcycle nativo; si usa "driving" con:
 *   exclude=motorway,ferry  — approssima percorsi moto-friendly
 *
 * Endpoint: GET /directions/v5/mapbox/driving/{coords}
 * Params:   geometries=polyline6&overview=full&steps=true
 */

import type { RouteRequest } from "../graphhopper-adapter";

const MAPBOX_BASE = "https://api.mapbox.com/directions/v5/mapbox/driving";

export interface MapboxRequestParams {
  url: string;
  excludes: string[];
}

/**
 * Formatta le coordinate nel formato Mapbox: "lng,lat;lng,lat;..."
 */
function formatCoords(points: [number, number][]): string {
  return points.map(([lng, lat]) => `${lng},${lat}`).join(";");
}

/**
 * Determina le esclusioni stradali in base al profilo.
 * "motorcycle" → exclude motorway + ferry per favorire statali/provinciali.
 * "car"        → nessuna esclusione (routing standard).
 */
function buildExcludes(profile?: string): string[] {
  if (!profile || profile === "motorcycle") return ["motorway", "ferry"];
  return [];
}

/**
 * Costruisce l'URL completo con query params per la Mapbox Directions API.
 */
export function buildMapboxUrl(req: RouteRequest, accessToken: string): string {
  const coords = formatCoords(req.points);
  const excludes = buildExcludes(req.profile);

  const params = new URLSearchParams({
    geometries: "polyline6",
    overview: "full",
    steps: "true",
    access_token: accessToken,
  });

  if (excludes.length > 0) {
    params.set("exclude", excludes.join(","));
  }

  return `${MAPBOX_BASE}/${encodeURIComponent(coords)}?${params.toString()}`;
}
