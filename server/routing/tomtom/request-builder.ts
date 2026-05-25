/**
 * Request builder — RouteRequest → TomTom Routing API URL
 *
 * Endpoint: GET /routing/1/calculateRoute/{coords}/json
 * Parametri moto:
 *   travelMode=motorcycle  — profilo moto nativo TomTom
 *   traffic=true           — ETA real-time con traffico
 *   routeType=thrilling    — preferisce strade panoramiche/tortuose
 *   windingness=high       — massimizza le curve
 *   instructionsType=tagged — istruzioni strutturate
 *   sectionType=traffic    — sezioni traffico nella risposta
 */

import type { RouteRequest } from "../graphhopper-adapter";

const TOMTOM_BASE = "https://api.tomtom.com/routing/1/calculateRoute";

/**
 * Formatta le coordinate nel formato TomTom: "lat,lng:lat,lng:..."
 */
function formatCoords(points: [number, number][]): string {
  return points.map(([lng, lat]) => `${lat},${lng}`).join(":");
}

/**
 * Costruisce l'URL completo con query params per la TomTom Routing API.
 */
export function buildTomTomUrl(req: RouteRequest, apiKey: string): string {
  const coords = formatCoords(req.points);
  const isMoto = !req.profile || req.profile === "motorcycle";

  const params = new URLSearchParams({
    key: apiKey,
    travelMode: isMoto ? "motorcycle" : "car",
    traffic: "true",
    instructionsType: "tagged",
    language: "it-IT",
  });

  if (isMoto) {
    params.set("routeType", "thrilling");
    params.set("windingness", "high");
  }

  params.set("sectionType", "traffic");

  return `${TOMTOM_BASE}/${encodeURIComponent(coords)}/json?${params.toString()}`;
}
