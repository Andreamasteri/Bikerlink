/**
 * Test routing endpoint — Admin
 *
 * GET /api/admin/maps/test-routing
 * Esegue una richiesta Milano → Como sull'engine attualmente configurato
 * e restituisce { engine, latency_ms, ok, distanceKm?, durationMinutes?, error? }.
 */

import { Router, type Request, type Response } from "express";
import { storage } from "../../../storage";
import { getActiveRouter } from "../../../routing/router-selector";
import type { RouteRequest } from "../../../routing/graphhopper-adapter";
import type { MapsRollout, RoutingEngineId } from "@shared/maps-config";

const router = Router();

const MILANO: [number, number] = [9.19, 45.4642];
const COMO: [number, number] = [9.0852, 45.808];

router.get("/test-routing", async (req: Request, res: Response) => {
  const start = Date.now();

  const [rolloutSetting, engineSetting] = await Promise.all([
    storage.getAppSetting("maps_rollout"),
    storage.getAppSetting("maps_routing_engine"),
  ]);

  const rollout = (rolloutSetting?.value ?? "disabled") as MapsRollout;
  const engine = (engineSetting?.value ?? "graphhopper") as RoutingEngineId;

  const routeReq: RouteRequest = {
    points: [MILANO, COMO],
    profile: "motorcycle",
    instructions: false,
    calc_points: true,
    points_encoded: false,
    elevation: false,
  };

  try {
    const result = await getActiveRouter(
      routeReq,
      { rollout, engine, isMapTester: true },
      res
    );

    const latency_ms = Date.now() - start;
    const path = result.paths[0];
    const usedEngine = res.getHeader("X-Routing-Fallback") === "graphhopper"
      ? "graphhopper"
      : engine;

    return res.json({
      ok: true,
      engine: usedEngine,
      configured_engine: engine,
      latency_ms,
      distanceKm: path ? Math.round(path.distance / 100) / 10 : null,
      durationMinutes: path ? Math.round(path.time / 60000) : null,
    });
  } catch (err: unknown) {
    const latency_ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/maps/test-routing] errore:", msg);
    return res.status(502).json({
      ok: false,
      engine,
      latency_ms,
      error: msg.slice(0, 300),
    });
  }
});

export default router;
