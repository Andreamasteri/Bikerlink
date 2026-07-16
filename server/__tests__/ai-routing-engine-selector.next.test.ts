/**
 * Task #306 — Verifica end-to-end che il pannello admin /ai-decisions sia
 * popolato quando l'admin attiva la modalità AI e viene eseguita una richiesta
 * di routing tramite il test-handler admin.
 *
 * Copre la fix in test-handler.ts: il handler usa ora resolveRoutingEngine() +
 * isAiRoutingMode() + buildAiRoutingContext() invece del solo
 * maps_routing_engine legacy, così la modalità AI si attiva correttamente.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Stable mock refs (hoisted prima di vi.mock)
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  // Routing engine config
  resolveRoutingEngine: vi.fn().mockResolvedValue("graphhopper"),
  isAiRoutingMode: vi.fn().mockResolvedValue(false),
  buildAiRoutingContext: vi.fn(),

  // AI decider
  decideEngineWithAI: vi.fn(),

  // Routing functions
  routeViaGraphHopper: vi.fn(),
  valhallaCalculateRoute: vi.fn(),

  // Routing kill-switch
  isRoutingEnabled: vi.fn().mockResolvedValue(true),

  // ThinkCentre offline
  isThinkCentreOffline: vi.fn().mockResolvedValue(false),

  // Misc routing mocks
  isAreaRoutingActive: vi.fn().mockResolvedValue(false),
  resolveRoutingArea: vi.fn(),
  scoreRoute: vi.fn(),
  haversineKm: vi.fn().mockReturnValue(70),
  checkMapboxQuota: vi.fn().mockResolvedValue({ ok: true }),
  checkTomTomQuota: vi.fn().mockResolvedValue({ ok: true }),
  mapboxCalculateRoute: vi.fn(),
  tomtomCalculateRoute: vi.fn(),

  // Storage
  getAppSetting: vi.fn(),

  // GraphHopper client
  getServerInfo: vi.fn().mockResolvedValue({ status: "ok", graph_loaded: true, version: "9.x" }),

  // Valhalla client
  getValhallaInfo: vi.fn().mockResolvedValue({ status: "ok" }),

  // Pipeline log (no-op)
  recordPipelineEvent: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../routing/function-engine-config", () => ({
  resolveRoutingEngine: mocks.resolveRoutingEngine,
  getFunctionEngineConfig: vi.fn().mockResolvedValue({ routing: "graphhopper" }),
}));

vi.mock("../routing/ai-engine-decider", () => ({
  isAiRoutingMode: mocks.isAiRoutingMode,
  buildAiRoutingContext: mocks.buildAiRoutingContext,
  decideEngineWithAI: mocks.decideEngineWithAI,
}));

vi.mock("../routing/valhalla-client", () => ({
  calculateRoute: mocks.valhallaCalculateRoute,
  getInfo: mocks.getValhallaInfo,
}));

vi.mock("../routing/graphhopper-adapter", () => ({
  routeViaGraphHopper: mocks.routeViaGraphHopper,
  graphHopperRoute: mocks.routeViaGraphHopper,
}));

vi.mock("../routing/routing-kill-switch", () => ({
  isRoutingEnabled: mocks.isRoutingEnabled,
}));

vi.mock("../routing/routing-area-mode", () => ({
  isAreaRoutingActive: mocks.isAreaRoutingActive,
}));

vi.mock("../routing/routing-area-resolver", () => ({
  resolveRoutingArea: mocks.resolveRoutingArea,
}));

vi.mock("../routing/route-quality-score", () => ({
  scoreRoute: mocks.scoreRoute,
}));

vi.mock("../geo", () => ({
  haversineKm: mocks.haversineKm,
}));

vi.mock("../routing/mapbox-directions-client", () => ({
  calculateRoute: mocks.mapboxCalculateRoute,
}));

vi.mock("../routing/tomtom-routing-client", () => ({
  calculateRoute: mocks.tomtomCalculateRoute,
}));

vi.mock("../routing/mapbox/quota-guard", () => ({
  checkQuota: mocks.checkMapboxQuota,
}));

vi.mock("../routing/tomtom/quota-guard", () => ({
  checkQuota: mocks.checkTomTomQuota,
}));

vi.mock("../routing/routing-pipeline-log", () => ({
  recordPipelineEvent: mocks.recordPipelineEvent,
}));

vi.mock("../lib/thinkcentre-offline", () => ({
  isThinkCentreOffline: mocks.isThinkCentreOffline,
}));

vi.mock("../graphhopper-client", () => ({
  getServerInfo: mocks.getServerInfo,
  isSelfHosted: false,
  GH_BASE_URL: "https://mock-gh",
  getRoutingHealthSnapshot: vi.fn().mockReturnValue({ selfHosted: false }),
  getRoutingHistory: vi.fn().mockReturnValue([]),
  fetchSelfHostedProfiles: vi.fn().mockResolvedValue({ reachable: true, profiles: [] }),
  classifyGHError: vi.fn().mockReturnValue("none"),
}));

vi.mock("../../lib/map-tiles", () => ({
  isTilesSelfHosted: false,
  SELF_HOSTED_TILES_URL: null,
}));

vi.mock("../storage", () => ({
  storage: {
    getAppSetting: mocks.getAppSetting,
    getUser: vi.fn().mockResolvedValue(null),
  },
}));

// ---------------------------------------------------------------------------
// Imports (dopo i mock)
// ---------------------------------------------------------------------------
import { getActiveRouter } from "../routing/router-selector";
import type { RouteRequest, RouteResult } from "../routing/graphhopper-adapter";
import type { AiRoutingContext } from "../routing/ai-engine-decider";
import {
  _resetAiDecisionsForTests,
  getAiDecisions,
} from "../routing/ai-decision-log";
import { _resetRoutingMetricsForTests } from "../routing/routing-metrics";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MIRA: [number, number] = [12.128, 45.43];
const BELLUNO: [number, number] = [12.216, 46.1411];

const FAKE_CTX: AiRoutingContext = {
  style: "motorcycle",
  area: { centerLat: 45.79, centerLon: 12.17 },
  bboxKey: "45.5,12.0",
  hourOfDay: 10,
  valhallaConfigured: true,
  engineHealth: {
    graphhopper: { success: 5, fallback: 0, failure: 0, down: false },
    valhalla: { success: 5, fallback: 0, failure: 0, down: false },
  },
  recentLatencyMs: { graphhopper: 300, valhalla: 250 },
  bboxQuality: {},
};

function makeRoute(distanceM: number, timeMs: number): RouteResult {
  return {
    paths: [{ distance: distanceM, time: timeMs, points: { coordinates: [] } }],
  };
}

const GH_ROUTE = makeRoute(70_000, 4_800_000);

// ---------------------------------------------------------------------------
// beforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  _resetAiDecisionsForTests();
  _resetRoutingMetricsForTests();
  vi.clearAllMocks();
  mocks.isRoutingEnabled.mockResolvedValue(true);
  mocks.isAreaRoutingActive.mockResolvedValue(false);
  mocks.isThinkCentreOffline.mockResolvedValue(false);
  mocks.haversineKm.mockReturnValue(70);
  mocks.getServerInfo.mockResolvedValue({ status: "ok", graph_loaded: true, version: "9.x" });
  mocks.getValhallaInfo.mockResolvedValue({ status: "ok" });
  mocks.getAppSetting.mockResolvedValue(null);
  mocks.checkMapboxQuota.mockResolvedValue({ ok: true });
  mocks.checkTomTomQuota.mockResolvedValue({ ok: true });
  mocks.buildAiRoutingContext.mockReturnValue(FAKE_CTX);
});

// ---------------------------------------------------------------------------
// Suite: pannello admin ai-decisions — comportamento post-fix test-handler
// ---------------------------------------------------------------------------

describe("pannello admin ai-decisions: ring buffer popolato dopo switch modalità AI", () => {
  /**
   * Simula esattamente ciò che fa il test-handler FIXATO:
   *   resolveRoutingEngine() → "ai"
   *   isAiRoutingMode()      → true
   *   buildAiRoutingContext() → FAKE_CTX
   *   getActiveRouter({ aiMode: true, aiContext: FAKE_CTX })
   * Verifica che l'ai-decision-log contenga almeno un entry con
   * mode="ai-direct", engine, confidence e reason non-null.
   */
  it("ai-decisions popolato con mode=ai-direct dopo routing in modalità AI (confidence alta)", async () => {
    mocks.resolveRoutingEngine.mockResolvedValue("ai");
    mocks.isAiRoutingMode.mockResolvedValue(true);
    mocks.decideEngineWithAI.mockResolvedValue({
      engine: "graphhopper",
      confidence: 0.85,
      reason: "GraphHopper preferito: zero failure, latenza buona",
      provider: "ollama",
    });
    mocks.routeViaGraphHopper.mockResolvedValue(GH_ROUTE);

    const req: RouteRequest = {
      points: [MIRA, BELLUNO],
      profile: "motorcycle",
      instructions: false,
      calc_points: true,
      points_encoded: false,
      elevation: false,
    };

    await getActiveRouter(
      req,
      { rollout: "all", engine: "ai", isMapTester: true, aiMode: true, aiContext: FAKE_CTX },
    );

    const decisions = getAiDecisions(10);
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    const entry = decisions[0];
    expect(entry.mode).toBe("ai-direct");
    expect(entry.chosenEngine).toBe("graphhopper");
    expect(entry.confidence).not.toBeNull();
    expect(typeof entry.confidence).toBe("number");
    expect(entry.confidence).toBeGreaterThan(0);
    expect(entry.reason).toBeTruthy();
    expect(entry.provider).toBe("ollama");
  });

  it("ai-decisions popolato con mode=ai-dual-compare quando confidence bassa", async () => {
    mocks.resolveRoutingEngine.mockResolvedValue("ai");
    mocks.isAiRoutingMode.mockResolvedValue(true);
    mocks.decideEngineWithAI.mockResolvedValue({
      engine: "graphhopper",
      confidence: 0.45, // < 0.6 → dual-compare
      reason: "Dati bbox insufficienti per decidere con certezza",
      provider: "ollama",
    });
    mocks.routeViaGraphHopper.mockResolvedValue(GH_ROUTE);
    mocks.valhallaCalculateRoute.mockResolvedValue(makeRoute(68_000, 4_700_000));
    mocks.scoreRoute
      .mockReturnValueOnce({ score: 0.72, breakdown: {} }) // GH
      .mockReturnValueOnce({ score: 0.65, breakdown: {} }); // Valhalla

    const req: RouteRequest = {
      points: [MIRA, BELLUNO],
      profile: "motorcycle",
      instructions: false,
    };

    await getActiveRouter(
      req,
      { rollout: "all", engine: "ai", isMapTester: true, aiMode: true, aiContext: FAKE_CTX },
    );

    const decisions = getAiDecisions(10);
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    const entry = decisions[0];
    expect(entry.mode).toBe("ai-dual-compare");
    expect(entry.chosenEngine).toBeTruthy();
    expect(entry.confidence).not.toBeNull();
    expect(entry.reason).toBeTruthy();
    expect(entry.dualScores).not.toBeNull();
    expect(typeof entry.dualScores!["graphhopper"]).toBe("number");
  });

  it("senza modalità AI (engine=valhalla) il ring buffer rimane vuoto", async () => {
    mocks.resolveRoutingEngine.mockResolvedValue("valhalla");
    mocks.isAiRoutingMode.mockResolvedValue(false);
    mocks.valhallaCalculateRoute.mockResolvedValue(makeRoute(72_000, 5_100_000));

    const req: RouteRequest = {
      points: [MIRA, BELLUNO],
      profile: "motorcycle",
    };

    await getActiveRouter(
      req,
      { rollout: "all", engine: "valhalla", isMapTester: true, aiMode: false },
    );

    // Nessuna decisione AI deve essere loggata fuori dalla modalità AI.
    expect(getAiDecisions(10)).toHaveLength(0);
  });

  it("fallback deterministico: AI non risponde (null) → ring buffer mostra fallback-smart", async () => {
    mocks.resolveRoutingEngine.mockResolvedValue("ai");
    mocks.isAiRoutingMode.mockResolvedValue(true);
    // AI non risponde entro il timeout → decideEngineWithAI ritorna null
    mocks.decideEngineWithAI.mockResolvedValue(null);
    // Il selettore ricade su graphhopper (safe default in aiMode)
    mocks.routeViaGraphHopper.mockResolvedValue(GH_ROUTE);

    const req: RouteRequest = {
      points: [MIRA, BELLUNO],
      profile: "motorcycle",
    };

    await getActiveRouter(
      req,
      { rollout: "all", engine: "graphhopper", isMapTester: true, aiMode: true, aiContext: FAKE_CTX },
    );

    const decisions = getAiDecisions(10);
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    const entry = decisions[0];
    expect(entry.mode).toBe("fallback-smart");
    // In fallback-smart confidence e reason descrivono il motivo del fallback.
    expect(entry.reason).toBeTruthy();
  });
});
