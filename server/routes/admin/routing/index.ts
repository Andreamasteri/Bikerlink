/**
 * Hub Admin — Sistema Routing (Task #2824)
 *
 * Endpoint admin per il sistema di routing (separato da "Sistema Mappe"):
 *   GET  /api/admin/routing/status       → kill-switch + health engine + metriche
 *   PUT  /api/admin/routing/kill-switch  → abilita/disabilita routing (soft toggle DB)
 *   POST /api/admin/routing/test         → esegue una route di prova (Mira→Belluno)
 *
 * Riusa gli snapshot di salute esistenti (graphhopper-client, valhalla-client),
 * i contatori runtime (routing-metrics) e il selettore engine (router-selector).
 */
import { Router, type Request, type Response } from "express";
import type { MapsRollout, RoutingEngineId } from "@shared/maps-config";
import { storage } from "../../../storage";
import {
  GH_BASE_URL,
  getServerInfo,
  getRoutingHealthSnapshot,
  type GHServerInfo,
} from "../../../graphhopper-client";
import {
  getRoutingKillSwitchState,
  setRoutingEnabled,
  HAS_HARD_ENV_OVERRIDE,
  HARD_OFF,
} from "../../../routing/routing-kill-switch";
import { getInfo as getValhallaInfo } from "../../../routing/valhalla-client";
import { getActiveRouter } from "../../../routing/router-selector";
import { getRoutingCounters } from "../../../routing/routing-metrics";
import {
  getFunctionEngineConfig,
  setFunctionEngineConfig,
  resolveRoutingEngine,
} from "../../../routing/function-engine-config";
import { ROUTING_FUNCTIONS } from "@shared/routing-functions";
import type { RouteRequest } from "../../../routing/graphhopper-adapter";
import { SELF_HOSTED_TILES_URL, isTilesSelfHosted } from "../../../../lib/map-tiles";

const router = Router();

// Coordinate di prova: Mira (VE) → Belluno (BL) (~70 km, all'interno della copertura Nord-Est).
const MIRA: [number, number] = [12.128, 45.43];
const BELLUNO: [number, number] = [12.216, 46.1411];

/** Maschera credenziali/host sensibili negli URL esposti all'admin. */
function maskUrl(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? ":" + u.port : ""}`;
  } catch {
    return url.replace(/:\/\/[^/]*@/, "://***@");
  }
}

/**
 * GET /status — snapshot completo per l'Hub: stato kill-switch, salute di ogni
 * engine (GraphHopper self-hosted, Cloud fallback, Valhalla, tiles) e contatori.
 */
router.get("/status", async (_req: Request, res: Response) => {
  const [killSwitch, ghInfo, valhallaInfo, activeEngine, rolloutSetting] = await Promise.all([
    getRoutingKillSwitchState(),
    getServerInfo().catch((): GHServerInfo => ({ status: "error" })),
    getValhallaInfo().catch((): GHServerInfo => ({ status: "error" })),
    resolveRoutingEngine(),
    storage.getAppSetting("maps_rollout"),
  ]);

  const rollout = (rolloutSetting?.value ?? "disabled") as MapsRollout;
  const snap = getRoutingHealthSnapshot();
  const counters = getRoutingCounters();

  const ghOk = ghInfo.status !== "error" && ghInfo.status !== "disabled";
  const ghDown = snap.selfHosted && !ghOk;
  const valhallaOk = valhallaInfo.status === "ok";
  const valhallaConfigured = valhallaInfo.status !== "unconfigured";
  const valhallaDown = valhallaConfigured && !valhallaOk;

  return res.json({
    killSwitch: {
      enabled: killSwitch.enabled,
      envOverride: killSwitch.envOverride,
      softEnabled: killSwitch.softEnabled,
      hasHardOverride: HAS_HARD_ENV_OVERRIDE,
    },
    activeEngine,
    rollout,
    graphhopper: {
      url: maskUrl(GH_BASE_URL),
      selfHosted: snap.selfHosted,
      status: ghInfo.status,
      ok: ghOk,
      down: ghDown,
      latencyMs: snap.latencyMs,
      lastCheckAt: snap.lastCheckAt,
      consecutiveFailures: snap.consecutiveFailures,
      error: snap.error,
      version: ghInfo.version,
    },
    cloudFallback: {
      available: snap.cloudFallbackAvailable,
      active: snap.cloudFallbackActive,
    },
    valhalla: {
      status: valhallaInfo.status,
      ok: valhallaOk,
      configured: valhallaConfigured,
      down: valhallaDown,
      version: valhallaInfo.version,
    },
    tiles: {
      selfHosted: isTilesSelfHosted,
      url: isTilesSelfHosted && SELF_HOSTED_TILES_URL ? maskUrl(SELF_HOSTED_TILES_URL) : null,
    },
    envConfig: {
      graphhopperUrl: !!process.env.GRAPHHOPPER_URL,
      graphhopperToken: !!process.env.GRAPHHOPPER_TOKEN,
      graphhopperApiKey: !!process.env.GRAPHHOPPER_API_KEY,
    },
    metrics: counters,
  });
});

/**
 * PUT /kill-switch — imposta il soft toggle DB.
 * Bloccato (409) solo se HARD_OFF (env forza routing SPENTO), perché in quel
 * caso il toggle è completamente ignorato a runtime. Quando HARD_ON (env="0",
 * routing forzato ON) il toggle DB può essere pre-impostato: avrà effetto
 * non appena l'env override verrà rimosso.
 */
router.put("/kill-switch", async (req: Request, res: Response) => {
  const { enabled } = req.body ?? {};
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ ok: false, message: "Campo 'enabled' (boolean) richiesto." });
  }
  if (HARD_OFF) {
    return res.status(409).json({
      ok: false,
      message: "ROUTING_DISABLED forza il routing SPENTO via env: rimuovi la variabile d'ambiente per riabilitare il toggle.",
    });
  }
  await setRoutingEnabled(enabled);
  const state = await getRoutingKillSwitchState();
  return res.json({ ok: true, enabled: state.enabled, softEnabled: state.softEnabled });
});

/**
 * POST /test — esegue una route di prova forzando il rollout su "all" così da
 * testare l'engine richiesto (o quello attivo) ignorando il gating tester.
 */
router.post("/test", async (req: Request, res: Response) => {
  const start = Date.now();
  const requestedEngine = (req.body?.engine ?? null) as RoutingEngineId | null;

  const killSwitch = await getRoutingKillSwitchState();
  if (!killSwitch.enabled) {
    return res.status(409).json({
      ok: false,
      engine: requestedEngine ?? "graphhopper",
      latencyMs: 0,
      error: "Routing disabilitato dal kill-switch: riattivalo prima di eseguire un test.",
    });
  }

  const engineSetting = await storage.getAppSetting("maps_routing_engine");
  const engine = (requestedEngine ?? engineSetting?.value ?? "graphhopper") as RoutingEngineId;

  const routeReq: RouteRequest = {
    points: [MIRA, BELLUNO],
    profile: "motorcycle",
    instructions: false,
    calc_points: true,
    points_encoded: false,
    elevation: false,
  };

  try {
    const result = await getActiveRouter(
      routeReq,
      { rollout: "all", engine, isMapTester: true },
      res,
    );
    const latencyMs = Date.now() - start;
    const path = result.paths[0];
    const usedEngine =
      res.getHeader("X-Routing-Fallback") === "graphhopper" ? "graphhopper" : engine;

    return res.json({
      ok: true,
      engine: usedEngine,
      configuredEngine: engine,
      latencyMs,
      distanceKm: path ? Math.round(path.distance / 100) / 10 : null,
      durationMinutes: path ? Math.round(path.time / 60000) : null,
    });
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/routing/test] errore:", msg);
    return res.status(502).json({
      ok: false,
      engine,
      latencyMs,
      error: msg.slice(0, 300),
    });
  }
});

/**
 * GET /function-engines — registro funzioni + engine ammessi + config corrente.
 * Alimenta la schermata admin "Assegnazione funzioni per engine" (#3193).
 */
router.get("/function-engines", async (_req: Request, res: Response) => {
  const config = await getFunctionEngineConfig();
  return res.json({ functions: ROUTING_FUNCTIONS, config });
});

/**
 * PUT /function-engines — aggiorna (parzialmente) la config per-funzione.
 * Body: { config: { routing?, map_matching?, isochrone?, matrix? } } oppure la
 * mappa direttamente. Valida engine↔funzione; 400 sul primo valore non valido.
 */
router.put("/function-engines", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const partial = body.config ?? body;
  if (!partial || typeof partial !== "object" || Array.isArray(partial)) {
    return res.status(400).json({ ok: false, message: "Payload non valido: atteso un oggetto config." });
  }
  const known = new Set(ROUTING_FUNCTIONS.map((f) => f.id as string));
  const unknownKeys = Object.keys(partial).filter((k) => !known.has(k));
  if (unknownKeys.length > 0) {
    return res.status(400).json({ ok: false, message: `Funzioni sconosciute: ${unknownKeys.join(", ")}.` });
  }
  try {
    const config = await setFunctionEngineConfig(partial as Record<string, unknown>);
    return res.json({ ok: true, config });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ ok: false, message: msg });
  }
});

export default router;
