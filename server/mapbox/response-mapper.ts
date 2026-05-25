/**
 * Mapbox Directions → GraphHopper-internal response mapper — BikerLink
 *
 * Mapbox Directions API usa Polyline precision 6 (geometries=polyline6).
 * GraphHopper usa Polyline precision 5 (fattore 1e5).
 *
 * Strategia: decodificare Polyline6 di Mapbox, ricodificare in Polyline5
 * per compatibilità con il client frontend (LeafletRouteMap) che si aspetta
 * il formato GraphHopper standard.
 *
 * Riferimento API: https://docs.mapbox.com/api/navigation/directions/
 */

import { decodePolyline, encodePolyline } from "../valhalla/response-mapper";

// ─── Mapbox Directions types ──────────────────────────────────────────────────

export interface MapboxStep {
  distance: number;
  duration: number;
  geometry: string;
  name: string;
  maneuver: {
    type: string;
    modifier?: string;
    instruction: string;
  };
}

export interface MapboxLeg {
  distance: number;
  duration: number;
  steps: MapboxStep[];
}

export interface MapboxRoute {
  distance: number;
  duration: number;
  geometry: string;
  legs: MapboxLeg[];
}

export interface MapboxDirectionsResponse {
  code: string;
  routes: MapboxRoute[];
  waypoints?: unknown[];
}

// ─── Maneuver mapping ─────────────────────────────────────────────────────────
// Mapbox maneuver type + modifier → GraphHopper sign code
// Ref: https://docs.mapbox.com/api/navigation/directions/#maneuver-object

function mapboxManeuverToSign(type: string, modifier?: string): number {
  if (type === "arrive" || type === "depart") {
    return type === "arrive" ? 4 : 1;
  }
  if (type === "rotary" || type === "roundabout") {
    return 6;
  }
  if (type === "fork" || type === "merge" || type === "on ramp" || type === "off ramp") {
    if (modifier === "right" || modifier === "slight right") return 2;
    if (modifier === "left" || modifier === "slight left") return -2;
    return 0;
  }
  if (type === "turn" || type === "new name" || type === "notification") {
    switch (modifier) {
      case "sharp right": return 3;
      case "right": return 2;
      case "slight right": return 1;
      case "straight": return 0;
      case "uturn": return -3;
      case "slight left": return -1;
      case "left": return -2;
      case "sharp left": return -3;
      default: return 0;
    }
  }
  if (type === "continue") {
    if (modifier === "right" || modifier === "slight right") return 1;
    if (modifier === "left" || modifier === "slight left") return -1;
    return 0;
  }
  return 0;
}

// ─── Main mapper ──────────────────────────────────────────────────────────────

export interface MappedRouteResult {
  paths: Array<{
    distance: number;
    time: number;
    points: string;
    instructions: Array<{
      text: string;
      distance: number;
      time: number;
      sign: number;
      street_name?: string;
    }>;
    points_encoded: boolean;
  }>;
}

/**
 * Mappa la risposta Mapbox Directions /directions/v5 nel formato GraphHopper-interno.
 *
 * Nota sul profilo: Mapbox usa "driving" (non esiste profilo motorcycle dedicato).
 * Per approssimare routing moto-friendly si usa exclude=motorway,ferry sul client.
 *
 * Conversioni:
 * - `routes[0].geometry` (Polyline6) → decodifica → ricodifica Polyline5
 * - `routes[0].distance` (metri) → distance (metri)
 * - `routes[0].duration` (secondi) → time (millisecondi)
 * - `routes[0].legs[].steps[]` → instructions GH-style
 */
export function mapMapboxResponse(response: MapboxDirectionsResponse): MappedRouteResult {
  if (!response.routes || response.routes.length === 0) {
    throw new Error("Risposta Mapbox vuota: nessun route nella risposta");
  }

  const route = response.routes[0];

  const coords = decodePolyline(route.geometry, 6);
  const encodedPolyline5 = encodePolyline(coords, 5);

  const instructions: MappedRouteResult["paths"][0]["instructions"] = [];
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      instructions.push({
        text: step.maneuver.instruction,
        distance: Math.round(step.distance),
        time: Math.round(step.duration * 1000),
        sign: mapboxManeuverToSign(step.maneuver.type, step.maneuver.modifier),
        street_name: step.name || undefined,
      });
    }
  }

  return {
    paths: [
      {
        distance: Math.round(route.distance),
        time: Math.round(route.duration * 1000),
        points: encodedPolyline5,
        points_encoded: true,
        instructions,
      },
    ],
  };
}
