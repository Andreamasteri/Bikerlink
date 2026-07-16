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
import { ARCHIVED_ROUTING_ENGINES, type MapsRollout, type RoutingEngineId } from "@shared/maps-config";
import {
  GH_BASE_URL, isSelfHosted, getServerInfo,
  getRoutingHealthSnapshot,
  getRoutingHistory,
  fetchSelfHostedProfiles,
  classifyGHError,
  type GHServerInfo,
} from "../../../graphhopper-client";
import { isRoutingEnabled } from "../../../routing/routing-kill-switch";
import { getInfo as getValhallaInfo } from "../../../routing/valhalla-client";
import { SELF_HOSTED_TILES_URL, isTilesSelfHosted } from "../../../../lib/map-tiles";
import { resolveRoutingEngine } from "../../../routing/function-engine-config";
import { isAiRoutingMode, buildAiRoutingContext } from "../../../routing/ai-engine-decider";

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
  const [ghInfo, valhallaInfo, engineSetting, profilesResult] = await Promise.all([
    getServerInfo().catch((): GHServerInfo => ({ status: "error" })),
    getValhallaInfo().catch((): GHServerInfo => ({ status: "error" })),
    storage.getAppSetting("maps_routing_engine"),
    fetchSelfHostedProfiles().catch(() => ({ reachable: false, profiles: null, error_reason: "exception" })),
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

  // Classifica il tipo di errore per il pannello admin
  const errorType = classifyGHError(snap.error);

  let message: string;
  if (routingDisabled) {
    message = "Routing disabilitato via kill-switch.";
  } else if (activeEngine === "valhalla" && valhallaDown) {
    message = "Valhalla (ThinkCentre) OFFLINE — fallback automatico a GraphHopper.";
  } else if (ghDown) {
    if (errorType === "tunnel_down") {
      message = snap.cloudFallbackAvailable
        ? "Tunnel Cloudflare non raggiungibile — routing servito dalla Cloud API (profilo car)."
        : "Tunnel Cloudflare non raggiungibile — nessun fallback Cloud configurato (GRAPHHOPPER_API_KEY).";
    } else if (errorType === "profile_missing") {
      message = "Profilo motorcycle non disponibile sul server GH.";
    } else {
      message = snap.cloudFallbackAvailable
        ? "ThinkCentre OFFLINE — routing servito dalla Cloud API (profilo car)."
        : "ThinkCentre OFFLINE — nessun fallback Cloud configurato (GRAPHHOPPER_API_KEY).";
    }
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
      last_failure_at: snap.lastFailureAt,
      consecutive_failures: snap.consecutiveFailures,
      error: snap.error,
      error_detail: snap.error,
      error_type: errorType,
      version: ghInfo.version,
      available_profiles: profilesResult.profiles,
      profiles_reachable: profilesResult.reachable,
      profiles_error_reason: profilesResult.error_reason,
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

/**
 * GET /api/admin/maps/routing-history
 * Ring-buffer degli ultimi eventi up/down nelle ultime 24h (max 100 eventi).
 */
router.get("/routing-history", (_req: Request, res: Response) => {
  const events = getRoutingHistory();
  return res.json({ events, self_hosted: isSelfHosted });
});

async function handleTestRouting(_req: Request, res: Response): Promise<Response> {
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

  const TEST_POINTS: [number, number][] = [MIRA, BELLUNO];

  // Legge la config effettiva (override admin → legacy → default) invece del
  // solo setting legacy maps_routing_engine: garantisce che la modalità AI sia
  // attiva nel test se l'admin ha impostato routing_function_engines["routing"]="ai".
  const [rolloutSetting, engine, aiModeRaw] = await Promise.all([
    storage.getAppSetting("maps_rollout"),
    resolveRoutingEngine(),
    isAiRoutingMode(),
  ]);

  const rollout = (rolloutSetting?.value ?? "disabled") as MapsRollout;
  // La modalità AI è attiva solo se l'engine effettivo è "ai" E "ai" non è archiviato
  // (stessa logica di waypoints.next.part2.ts resolveRouterOpts).
  const aiMode = aiModeRaw && !ARCHIVED_ROUTING_ENGINES.has("ai" as RoutingEngineId);

  const routeReq: RouteRequest = {
    points: TEST_POINTS,
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
      {
        rollout,
        engine,
        isMapTester: true,
        aiMode,
        // Costruisce il contesto AI con stile "motorcycle" (identico al route
        // planner reale) così il decider riceve metriche rilevanti per il test.
        aiContext: aiMode ? buildAiRoutingContext(TEST_POINTS, "motorcycle") : undefined,
      },
      res,
      true, // coordinate dirette — nessun geocoding testuale upstream
    );

    const latency_ms = Date.now() - start;
    const path = result.paths[0];
    // In modalità AI l'engine effettivo è trasmesso via header X-Routing-Ai
    // (ai-direct) o X-Routing-Ai-Compare (ai-dual-compare). Fuori modalità AI:
    // fallback header o guard archived→graphhopper.
    const aiDirectHeader = res.getHeader("X-Routing-Ai");
    const aiCompareHeader = res.getHeader("X-Routing-Ai-Compare");
    const aiUsedEngine = typeof aiDirectHeader === "string" ? aiDirectHeader
      : typeof aiCompareHeader === "string" ? aiCompareHeader
      : null;
    const usedEngine = aiUsedEngine
      ?? (res.getHeader("X-Routing-Fallback") === "graphhopper"
        ? "graphhopper"
        // Engine archiviati: il selettore li serve sempre via GraphHopper senza
        // header di fallback (guard di config, non fallback runtime — Task #5347).
        : (ARCHIVED_ROUTING_ENGINES.has(engine) ? "graphhopper" : engine));

    return res.json({
      ok: true,
      engine: usedEngine,
      configured_engine: engine,
      ai_mode: aiMode,
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
}

router.get("/test-routing", handleTestRouting);
router.post("/test-routing", handleTestRouting);

export default router;
