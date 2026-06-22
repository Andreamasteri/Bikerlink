/**
 * Response mapper — TomTom Routing API → RouteResult interno
 *
 * Mappa routes[0].legs[].points → paths[].points (coordinate [lng,lat])
 * summary.lengthInMeters        → distance
 * summary.travelTimeInSeconds*1000 → time
 * guidance.instructions          → instructions (sign GraphHopper-compatibile)
 *
 * TomTom coordinate: { latitude, longitude } — vanno scambiate → [lng, lat]
 */

import type { RouteResult, MapMatchResult } from "../graphhopper-adapter";

interface TomTomLatLon {
  latitude: number;
  longitude: number;
}

interface TomTomSummary {
  lengthInMeters?: number;
  travelTimeInSeconds?: number;
}

interface TomTomLeg {
  points?: TomTomLatLon[];
  summary?: TomTomSummary;
}

interface TomTomInstruction {
  message?: string;
  roadName?: string;
  routeOffsetInMeters?: number;
  travelTimeInSeconds?: number;
  maneuver?: string;
  pointIndex?: number;
}

interface TomTomGuidance {
  instructions?: TomTomInstruction[];
}

interface TomTomRoute {
  summary?: TomTomSummary;
  legs?: TomTomLeg[];
  guidance?: TomTomGuidance;
}

export interface TomTomRoutingResponse {
  routes?: TomTomRoute[];
  error?: { description?: string };
}

function maneuverToSign(maneuver?: string): number {
  if (!maneuver) return 0;
  const m = maneuver.toLowerCase();
  if (m.includes("arrive")) return 4;
  if (m.includes("depart")) return 4;
  if (m === "turn_left" || m === "bear_left") return -2;
  if (m === "sharp_left") return -3;
  if (m === "keep_left") return -1;
  if (m === "turn_right" || m === "bear_right") return 2;
  if (m === "sharp_right") return 3;
  if (m === "keep_right") return 1;
  if (m.includes("roundabout") || m.includes("rotary")) return 6;
  if (m.includes("uturn") || m.includes("u_turn")) return 6;
  return 0;
}

export function mapTomTomResponse(raw: TomTomRoutingResponse): RouteResult {
  if (!raw.routes || raw.routes.length === 0) {
    throw new Error("TomTom: nessuna route nella risposta");
  }

  const route = raw.routes[0];
  const allPoints: [number, number][] = [];

  for (const leg of route.legs ?? []) {
    for (const pt of leg.points ?? []) {
      allPoints.push([pt.longitude, pt.latitude]);
    }
  }

  const totalDistance = route.summary?.lengthInMeters ?? 0;
  const totalTime = (route.summary?.travelTimeInSeconds ?? 0) * 1000;

  const instructions: any[] = (route.guidance?.instructions ?? []).map((instr) => ({
    text: instr.message ?? instr.roadName ?? "",
    distance: instr.routeOffsetInMeters ?? 0,
    time: (instr.travelTimeInSeconds ?? 0) * 1000,
    sign: maneuverToSign(instr.maneuver),
    interval: [instr.pointIndex ?? 0, instr.pointIndex ?? 0],
  }));

  return {
    paths: [
      {
        distance: totalDistance,
        time: totalTime,
        points: { coordinates: allPoints },
        instructions,
      },
    ],
  };
}

interface TomTomSnappedPoint {
  mappedPoint: { lat: number; lon: number };
}

export interface TomTomSnapResponse {
  snappedPoints?: TomTomSnappedPoint[];
}

function haversineM(latA: number, lonA: number, latB: number, lonB: number): number {
  const R = 6_371_000;
  const dLat = (latB - latA) * (Math.PI / 180);
  const dLon = (lonB - lonA) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(latA * (Math.PI / 180)) * Math.cos(latB * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function mapTomTomMatchResponse(raw: TomTomSnapResponse): MapMatchResult {
  const coords: [number, number][] = (raw.snappedPoints ?? []).map(
    (p) => [p.mappedPoint.lon, p.mappedPoint.lat]
  );
  let distance = 0;
  for (let i = 1; i < coords.length; i++) {
    distance += haversineM(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  }
  return { paths: [{ distance, time: 0, points: { coordinates: coords } }] };
}
