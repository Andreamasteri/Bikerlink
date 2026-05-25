import type { MapsRollout, RoutingEngineId } from "@shared/maps-config";
import { routeViaGraphHopper, type RouteRequest, type RouteResult } from "./graphhopper-adapter";

interface RouterSelectorOptions {
  rollout: MapsRollout;
  engine: RoutingEngineId;
  isMapTester: boolean;
}

function isNewEngineEnabled(opts: RouterSelectorOptions): boolean {
  if (opts.rollout === "disabled") return false;
  if (opts.rollout === "tester" && !opts.isMapTester) return false;
  return true;
}

export async function getActiveRouter(
  req: RouteRequest,
  opts: RouterSelectorOptions
): Promise<RouteResult> {
  if (!isNewEngineEnabled(opts)) {
    return routeViaGraphHopper(req);
  }

  if (opts.engine === "valhalla") {
    console.log("[router-selector] Valhalla stub — delegating to GraphHopper");
    return routeViaGraphHopper(req);
  }

  return routeViaGraphHopper(req);
}

export async function resolveActiveEngine(opts: RouterSelectorOptions): Promise<RoutingEngineId> {
  if (!isNewEngineEnabled(opts)) return "graphhopper";
  return opts.engine;
}
