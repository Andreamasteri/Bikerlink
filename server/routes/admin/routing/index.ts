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
  fetchSelfHostedProfiles,
  type GHServerInfo,
} from "../../../graphhopper-client";
import {
  getRoutingKillSwitchState,
  setRoutingEnabled,
} from "../../../routing/routing-kill-switch";
import { getInfo as getValhallaInfo, calculateRoute as valhallaCalculateRoute } from "../../../routing/valhalla-client";
import { getActiveRouter, graphHopperRoute } from "../../../routing/router-selector";
import { getRoutingCounters } from "../../../routing/routing-metrics";
import { getPipelineEvents, getPipelineSummary } from "../../../routing/routing-pipeline-log";
import {
  getFunctionEngineConfig,
  setFunctionEngineConfig,
  resolveRoutingEngine,
} from "../../../routing/function-engine-config";
import { ROUTING_FUNCTIONS } from "@shared/routing-functions";
import type { RouteRequest } from "../../../routing/graphhopper-adapter";
import { SELF_HOSTED_TILES_URL, isTilesSelfHosted } from "../../../../lib/map-tiles";
import { SELF_HOSTED_BASE_URL, isSelfHosted } from "../../../graphhopper-client";
import { ROUTING_AREAS, routingAreaUrl } from "@shared/routing-areas";
import { updateSystemStatus } from "../../../lib/system-status-cache";
import { sendError } from "../../../lib/api-response";

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
  const [killSwitch, ghInfo, valhallaInfo, activeEngine, rolloutSetting, profilesResult] = await Promise.all([
    getRoutingKillSwitchState(),
    getServerInfo().catch((): GHServerInfo => ({ status: "error" })),
    getValhallaInfo().catch((): GHServerInfo => ({ status: "error" })),
    resolveRoutingEngine(),
    storage.getAppSetting("maps_rollout"),
    fetchSelfHostedProfiles().catch(() => ({ reachable: false, profiles: null, error_reason: "exception" })),
  ]);

  const rollout = (rolloutSetting?.value ?? "disabled") as MapsRollout;
  const snap = getRoutingHealthSnapshot();
  const counters = getRoutingCounters();

  const ghOk = ghInfo.status !== "error" && ghInfo.status !== "disabled";
  const ghDown = snap.selfHosted && !ghOk;
  const valhallaOk = valhallaInfo.status === "ok";
  const valhallaConfigured = valhallaInfo.status !== "unconfigured";
  const valhallaDown = valhallaConfigured && !valhallaOk;

  // null = non self-hosted o server non raggiungibile (impossibile determinarlo)
  const motorcycleProfileAvailable: boolean | null = snap.selfHosted
    ? (profilesResult.reachable && profilesResult.profiles !== null
        ? profilesResult.profiles.includes("motorcycle")
        : null)
    : null;

  const { successes = 0, fallbacks = 0, failures = 0 } = counters as {
    successes?: number; fallbacks?: number; failures?: number;
  };
  const routingTotal = successes + fallbacks + failures;
  const routingDot =
    routingTotal === 0 ? "unknown" :
    failures > 0 ? "offline" :
    fallbacks > 0 ? "degraded" : "ok";
  updateSystemStatus({ routing: routingDot });

  return res.json({
    killSwitch: {
      enabled: killSwitch.enabled,
      envOverride: killSwitch.envOverride,
      softEnabled: killSwitch.softEnabled,
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
      motorcycleProfileAvailable,
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

/** PUT /kill-switch — imposta il soft toggle DB. */
router.put("/kill-switch", async (req: Request, res: Response) => {
  const { enabled } = req.body ?? {};
  if (typeof enabled !== "boolean") {
    return sendError(res, 400, "Campo 'enabled' (boolean) richiesto.");
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

  const engine = (requestedEngine ?? (await resolveRoutingEngine())) as RoutingEngineId;

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
      true, // coordinate hardcoded (MIRA, BELLUNO) — nessun geocoding
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
    return sendError(res, 400, "Payload non valido: atteso un oggetto config.");
  }
  const known = new Set(ROUTING_FUNCTIONS.map((f) => f.id as string));
  const unknownKeys = Object.keys(partial).filter((k) => !known.has(k));
  if (unknownKeys.length > 0) {
    return sendError(res, 400, `Funzioni sconosciute: ${unknownKeys.join(", ")}.`);
  }
  try {
    const config = await setFunctionEngineConfig(partial as Record<string, unknown>);
    return res.json({ ok: true, config });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return sendError(res, 400, msg);
  }
});

/**
 * GET /pipeline-log — log volatile del coordinamento engine (#3557).
 * Restituisce gli ultimi 50 eventi di routing (area GH risolta, engine
 * selezionato vs usato, motivo fallback/errore, latenza, esito) + i contatori
 * aggregati degli ultimi 5 minuti. In-memory: si azzera al riavvio.
 */
router.get("/pipeline-log", async (_req: Request, res: Response) => {
  return res.json({
    events: getPipelineEvents(50),
    summary: getPipelineSummary(),
    volatile: true,
  });
});

/**
 * POST /coherence-test — invia la STESSA rotta di prova (arco-alpino,
 * Mira→Belluno) a GraphHopper (istanza per-area se attiva) e a Valhalla in
 * parallelo, senza fallback incrociato, e confronta distanza/durata. Esito
 * "coerenti" se entrambe riescono ed entro ±10%, altrimenti "divergenti".
 */
router.post("/coherence-test", async (_req: Request, res: Response) => {
  const killSwitch = await getRoutingKillSwitchState();
  if (!killSwitch.enabled) {
    return res.status(409).json({
      ok: false,
      error: "Routing disabilitato dal kill-switch: riattivalo prima di eseguire il test.",
    });
  }

  const routeReq: RouteRequest = {
    points: [MIRA, BELLUNO],
    profile: "motorcycle",
    instructions: false,
    calc_points: true,
    points_encoded: false,
    elevation: false,
  };

  type Leg = {
    ok: boolean;
    distanceKm: number | null;
    durationMinutes: number | null;
    latencyMs: number;
    error: string | null;
  };

  const runLeg = async (fn: () => Promise<{ paths: Array<{ distance: number; time: number }> }>): Promise<Leg> => {
    const t0 = Date.now();
    try {
      const result = await fn();
      const path = result.paths[0];
      return {
        ok: !!path,
        distanceKm: path ? Math.round(path.distance / 100) / 10 : null,
        durationMinutes: path ? Math.round(path.time / 60000) : null,
        latencyMs: Date.now() - t0,
        error: path ? null : "Nessun percorso restituito",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, distanceKm: null, durationMinutes: null, latencyMs: Date.now() - t0, error: msg.slice(0, 300) };
    }
  };

  const [graphhopper, valhalla] = await Promise.all([
    runLeg(() => graphHopperRoute(routeReq, true)),
    runLeg(() => valhallaCalculateRoute(routeReq)),
  ]);

  const pctDiff = (a: number | null, b: number | null): number | null => {
    if (a == null || b == null) return null;
    const avg = (a + b) / 2;
    if (avg === 0) return 0;
    return Math.round((Math.abs(a - b) / avg) * 1000) / 10; // percentuale, 1 decimale
  };

  const bothOk = graphhopper.ok && valhalla.ok;
  const distanceDiffPct = bothOk ? pctDiff(graphhopper.distanceKm, valhalla.distanceKm) : null;
  const durationDiffPct = bothOk ? pctDiff(graphhopper.durationMinutes, valhalla.durationMinutes) : null;
  const coherent = bothOk && distanceDiffPct != null && durationDiffPct != null
    ? distanceDiffPct <= 10 && durationDiffPct <= 10
    : null;

  return res.json({
    ok: true,
    area: "arco-alpino",
    from: "Mira (VE)",
    to: "Belluno (BL)",
    graphhopper,
    valhalla,
    comparison: { coherent, distanceDiffPct, durationDiffPct, thresholdPct: 10 },
  });
});

export * from "./index.part2";

export default router;
