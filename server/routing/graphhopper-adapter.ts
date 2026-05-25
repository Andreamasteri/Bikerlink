import {
  calculateRoute,
  mapMatch,
  getServerInfo,
  type RouteRequest,
  type RouteResult,
  type MapMatchResult,
  type GHPoint,
  type GHServerInfo,
} from "../graphhopper-client";

export async function routeViaGraphHopper(req: RouteRequest): Promise<RouteResult> {
  return calculateRoute(req);
}

export async function matchViaGraphHopper(
  points: GHPoint[],
  profile?: string
): Promise<MapMatchResult> {
  return mapMatch(points, profile);
}

export async function graphHopperHealth(): Promise<GHServerInfo> {
  return getServerInfo();
}

export type { RouteRequest, RouteResult, MapMatchResult, GHPoint, GHServerInfo };
