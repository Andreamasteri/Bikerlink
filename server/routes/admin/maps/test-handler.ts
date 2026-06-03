/**
 * Test routing endpoint — Admin
 *
 * GET /api/admin/maps/test-routing
 * Esegue una richiesta Mira → Belluno sull'engine configurato e restituisce
 * sia il risultato del percorso sia info diagnostiche (URL, self-hosted, ecc.).
 */

import { Router, type Request, type Response } from "express";
import { storage } from "../../../storage";
import { getActiveRouter } from "../../../routing/router-selector";
import type { RouteRequest } from "../../../routing/graphhopper-adapter";
import type { MapsRollout, RoutingEngineId } from "@shared/maps-config";
import {
  GH_BASE_URL, isSelfHosted, getServerInfo,
  getRoutingHealthSnapshot,
  type GHServerInfo,
} from "../../../graphhopper-client";
import { isRoutingEnabled } from "../../../routing/routing-kill-switch";
import { getInfo as getValhallaInfo } from "../../../routing/valhalla-client";
import { SELF_HOSTED_TILES_URL, isTilesSelfHosted } from "../../../../lib/map-tiles";

const router = Router();

// Coordinate di prova: Mira (VE) → Belluno (BL) (~70 km, copertura Nord-Est).
const MIRA: [number, number] = [12.128, 45.43];
const BELLUNO: [number, number] = [12.216, 46.1411];

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return url.slice(0, 40);
  }
}

/**
 * GET /api/admin/maps/routing-health
 * Stato di salute del server di routing self-hosted (PC di casa) + Valhalla.
 * Non esegue routing reale: legge lo snapshot in-memory aggiornato a ogni
 * chiamata + un probe diretto /health (GraphHopper) e /status (Valhalla).
 */
router.get("/routing-health", async (_req: Request, res: Response) => {
  const [ghInfo, valhallaInfo, engineSetting] = await Promise.all([
    getServerInfo().catch((): GHServerInfo => ({ status: "error" })),
    getValhallaInfo().catch((): GHServerInfo => ({ status: "error" })),
    storage.getAppSetting("maps_routing_engine"),
  ]);

  const activeEngine = (engineSetting?.value ?? "graphhopper") as RoutingEngineId;
  const routingDisabled = !(await isRoutingEnabled());
  const snap = getRoutingHealthSnapshot();
  const ghOk = ghInfo.status !== "error" && ghInfo.status !== "disabled";
  const ghDown = snap.selfHosted && !ghOk;
  // Valhalla è self-hosted: "down" se configurato (status != unconfigured) ma non ok.
  const valhallaOk = valhallaInfo.status === "ok";
  const valhallaConfigured = valhallaInfo.status !== "unconfigured";
  const valhallaDown = valhallaConfigured && !valhallaOk;

  // L'engine attivo determina se l'app è realmente degradata.
  const activeEngineDown =
    activeEngine === "valhalla" ? valhallaDown : ghDown;

  let message: string;
  if (routingDisabled) {
    message = "Routing disabilitato via kill-switch.";
  } else if (activeEngine === "valhalla" && valhallaDown) {
    message = "Valhalla (server di casa) OFFLINE — fallback automatico a GraphHopper.";
  } else if (ghDown) {
    message = snap.cloudFallbackAvailable
      ? "Server di casa OFFLINE — routing servito dalla Cloud API (profilo car)."
      : "Server di casa OFFLINE — nessun fallback Cloud configurato (GRAPHHOPPER_API_KEY).";
  } else {
    message = "Server di routing operativo.";
  }

  return res.json({
    self_hosted: snap.selfHosted,
    active_engine: activeEngine,
    graphhopper: {
      url: maskUrl(GH_BASE_URL),
      status: ghInfo.status,
      ok: ghOk,
      down: ghDown,
      latency_ms: snap.latencyMs,
      last_check_at: snap.lastCheckAt,
      consecutive_failures: snap.consecutiveFailures,
      error: snap.error,
      version: ghInfo.version,
    },
    valhalla: {
      status: valhallaInfo.status,
      ok: valhallaOk,
      down: valhallaDown,
      version: valhallaInfo.version,
    },
    cloud_fallback_available: snap.cloudFallbackAvailable,
    cloud_fallback_active: snap.cloudFallbackActive,
    routing_disabled: routingDisabled,
    // Riepilogo per banner admin — riflette l'engine attivo
    degraded: activeEngineDown,
    message,
  });
});

router.get("/test-routing", async (req: Request, res: Response) => {
  if (!(await isRoutingEnabled())) {
    return res.json({
      ok: false,
      source: "disabled",
      graphhopper_url: null,
      tiles_url: null,
      is_self_hosted: false,
      is_tiles_self_hosted: false,
      latency_ms: null,
      status: "disabled",
      message: "Routing disabilitato via kill-switch",
    });
  }

  const start = Date.now();

  const [rolloutSetting, engineSetting] = await Promise.all([
    storage.getAppSetting("maps_rollout"),
    storage.getAppSetting("maps_routing_engine"),
  ]);

  const rollout = (rolloutSetting?.value ?? "disabled") as MapsRollout;
  const engine = (engineSetting?.value ?? "graphhopper") as RoutingEngineId;

  const routeReq: RouteRequest = {
    points: [MIRA, BELLUNO],
    profile: "motorcycle",
    instructions: false,
    calc_points: true,
    points_encoded: false,
    elevation: false,
  };

  const ghInfo: GHServerInfo = await getServerInfo().catch(() => ({ status: "error" }));

  const diagnostics = {
    source: isSelfHosted ? "self-hosted" : "cloud",
    graphhopper_url: maskUrl(GH_BASE_URL),
    tiles_url: isTilesSelfHosted && SELF_HOSTED_TILES_URL ? maskUrl(SELF_HOSTED_TILES_URL) : null,
    is_self_hosted: isSelfHosted,
    is_tiles_self_hosted: isTilesSelfHosted,
    gh_status: ghInfo.status,
    gh_graph_loaded: ghInfo.graph_loaded,
    gh_version: ghInfo.version,
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
      ...diagnostics,
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
      ...diagnostics,
    });
  }
});

export default router;
