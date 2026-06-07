/**
 * Test suite — AI Routing Engine Selector (Task #3191)
 *
 * Tre scenari:
 * (a) Valhalla down durante il dual-compare a confidence bassa — il candidato
 *     valhalla viene escluso e non si confronta GraphHopper con se stesso.
 * (b) Timeout AI a 800ms — aiOverride ritorna null e si ricade sul selettore
 *     normale (la route non viene calcolata dentro aiOverride).
 * (c) Consistenza tra ai-decision-log e routing-metrics — l'engine registrato
 *     come success deve essere quello che ha realmente prodotto la route.
 *
 * Mock: valhalla-client, graphhopper-adapter, ai-engine-decider, routing-kill-switch,
 *       routing-area-mode, routing-area-resolver, mapbox-directions-client,
 *       tomtom-routing-client, quota-guard (mapbox + tomtom), geo, route-quality-score.
 * Reali: routing-metrics (ring buffer in-memory), ai-decision-log (ring buffer in-memory).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Stable mock refs (hoisted prima di vi.mock)
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  valhallaCalculateRoute: vi.fn(),
  routeViaGraphHopper: vi.fn(),
  decideEngineWithAI: vi.fn(),
  isRoutingEnabled: vi.fn().mockResolvedValue(true),
  isAreaRoutingActive: vi.fn().mockResolvedValue(false),
  resolveRoutingArea: vi.fn(),
  scoreRoute: vi.fn(),
  haversineKm: vi.fn().mockReturnValue(50),
  mapboxCalculateRoute: vi.fn(),
  tomtomCalculateRoute: vi.fn(),
  checkMapboxQuota: vi.fn().mockResolvedValue({ ok: true }),
  checkTomTomQuota: vi.fn().mockResolvedValue({ ok: true }),
}));

// ---------------------------------------------------------------------------
// Module mocks — hoisted automaticamente da vitest
// ---------------------------------------------------------------------------

vi.mock("../routing/valhalla-client", () => ({
  calculateRoute: mocks.valhallaCalculateRoute,
}));

vi.mock("../routing/graphhopper-adapter", () => ({
  routeViaGraphHopper: mocks.routeViaGraphHopper,
}));

vi.mock("../routing/ai-engine-decider", () => ({
  decideEngineWithAI: mocks.decideEngineWithAI,
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

// ---------------------------------------------------------------------------
// Imports (dopo i mock)
// ---------------------------------------------------------------------------
import { aiOverride, type RouterSelectorOptions } from "../routing/router-selector";
import type { RouteRequest, RouteResult } from "../routing/graphhopper-adapter";
import type { AiRoutingContext } from "../routing/ai-engine-decider";
import {
  _resetAiDecisionsForTests,
  getAiDecisions,
} from "../routing/ai-decision-log";
import {
  _resetRoutingMetricsForTests,
  getRoutingCounters,
} from "../routing/routing-metrics";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_REQ: RouteRequest = {
  points: [
    [10.0, 45.0],
    [10.5, 45.5],
  ],
  profile: "moto_curvy",
};

const FAKE_CTX: AiRoutingContext = {
  style: "curvy",
  area: { centerLat: 45.25, centerLon: 10.25 },
  bboxKey: "45.0,10.0",
  hourOfDay: 10,
  valhallaConfigured: true,
  engineHealth: {
    graphhopper: { success: 10, fallback: 0, failure: 0, down: false },
    valhalla: { success: 10, fallback: 0, failure: 0, down: false },
  },
  recentLatencyMs: { graphhopper: 300, valhalla: 250 },
  bboxQuality: {},
};

const FAKE_OPTS: RouterSelectorOptions = {
  rollout: "all",
  engine: "graphhopper",
  isMapTester: false,
  aiMode: true,
  aiContext: FAKE_CTX,
};

function makeRoute(distanceM: number, timeMs: number): RouteResult {
  return {
    paths: [
      {
        distance: distanceM,
        time: timeMs,
        points: { coordinates: [] },
      },
    ],
  };
}

const GH_ROUTE = makeRoute(80_000, 5_400_000);
const VALHALLA_ROUTE = makeRoute(75_000, 5_000_000);

// ---------------------------------------------------------------------------
// beforeEach — reset stati in-memory e mock calls
// ---------------------------------------------------------------------------

beforeEach(() => {
  _resetAiDecisionsForTests();
  _resetRoutingMetricsForTests();
  vi.clearAllMocks();
  mocks.isRoutingEnabled.mockResolvedValue(true);
  mocks.isAreaRoutingActive.mockResolvedValue(false);
  mocks.haversineKm.mockReturnValue(50);
  mocks.checkMapboxQuota.mockResolvedValue({ ok: true });
  mocks.checkTomTomQuota.mockResolvedValue({ ok: true });
});

// ---------------------------------------------------------------------------
// (a) Valhalla down durante dual-compare a confidence bassa
// ---------------------------------------------------------------------------

describe("(a) dual-compare: valhalla down — escluso, GH non si confronta con se stesso", () => {
  it("ritorna la route GH quando Valhalla lancia errore durante il dual-compare", async () => {
    mocks.decideEngineWithAI.mockResolvedValue({
      engine: "graphhopper",
      confidence: 0.3, // < 0.6 → dual-compare
      reason: "dati insufficienti",
      provider: "groq",
    });
    mocks.routeViaGraphHopper.mockResolvedValue(GH_ROUTE);
    mocks.valhallaCalculateRoute.mockRejectedValue(new Error("Valhalla: connection refused"));
    mocks.scoreRoute.mockReturnValue({ score: 0.72, breakdown: {} });

    const result = await aiOverride(FAKE_REQ, FAKE_OPTS);

    expect(result).toBe(GH_ROUTE);
  });

  it("ai-decision-log registra mode=ai-dual-compare con chosenEngine=graphhopper", async () => {
    mocks.decideEngineWithAI.mockResolvedValue({
      engine: "valhalla",
      confidence: 0.25,
      reason: "area senza dati",
      provider: "gemini",
    });
    mocks.routeViaGraphHopper.mockResolvedValue(GH_ROUTE);
    mocks.valhallaCalculateRoute.mockRejectedValue(new Error("Valhalla: 503 Service Unavailable"));
    mocks.scoreRoute.mockReturnValue({ score: 0.68, breakdown: {} });

    await aiOverride(FAKE_REQ, FAKE_OPTS);

    const decisions = getAiDecisions(1);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].mode).toBe("ai-dual-compare");
    expect(decisions[0].chosenEngine).toBe("graphhopper");
  });

  it("dualScores contiene solo 'graphhopper' — nessun candidato valhalla", async () => {
    mocks.decideEngineWithAI.mockResolvedValue({
      engine: "graphhopper",
      confidence: 0.4,
      reason: "test",
      provider: "groq",
    });
    mocks.routeViaGraphHopper.mockResolvedValue(GH_ROUTE);
    mocks.valhallaCalculateRoute.mockRejectedValue(new Error("Valhalla: timeout"));
    mocks.scoreRoute.mockReturnValue({ score: 0.75, breakdown: {} });

    await aiOverride(FAKE_REQ, FAKE_OPTS);

    const decisions = getAiDecisions(1);
    expect(decisions[0].dualScores).not.toBeNull();
    expect(Object.keys(decisions[0].dualScores!)).toEqual(["graphhopper"]);
    expect("valhalla" in decisions[0].dualScores!).toBe(false);
  });

  it("routing-metrics registra failure per valhalla e success per graphhopper", async () => {
    mocks.decideEngineWithAI.mockResolvedValue({
      engine: "graphhopper",
      confidence: 0.5,
      reason: "test",
      provider: "groq",
    });
    mocks.routeViaGraphHopper.mockResolvedValue(GH_ROUTE);
    mocks.valhallaCalculateRoute.mockRejectedValue(new Error("Valhalla: 500"));
    mocks.scoreRoute.mockReturnValue({ score: 0.7, breakdown: {} });

    await aiOverride(FAKE_REQ, FAKE_OPTS);

    const counters = getRoutingCounters(60_000);
    expect(counters.byEngine["graphhopper"]?.success).toBe(1);
    expect(counters.byEngine["valhalla"]?.failure).toBe(1);
    // valhalla NON deve avere success (non ha prodotto una route)
    expect(counters.byEngine["valhalla"]?.success ?? 0).toBe(0);
  });

  it("aiOverride ritorna null se ENTRAMBI gli engine falliscono (nessun candidato)", async () => {
    mocks.decideEngineWithAI.mockResolvedValue({
      engine: "graphhopper",
      confidence: 0.2,
      reason: "test",
      provider: "groq",
    });
    mocks.routeViaGraphHopper.mockRejectedValue(new Error("GraphHopper: 500"));
    mocks.valhallaCalculateRoute.mockRejectedValue(new Error("Valhalla: down"));

    const result = await aiOverride(FAKE_REQ, FAKE_OPTS);

    expect(result).toBeNull();
    const decisions = getAiDecisions(1);
    expect(decisions[0].mode).toBe("fallback-smart");
  });
});

// ---------------------------------------------------------------------------
// (b) Timeout AI a 800ms — fallback al selettore normale
// ---------------------------------------------------------------------------

describe("(b) timeout AI — aiOverride ritorna null senza chiamare gli engine", () => {
  it("ritorna null quando decideEngineWithAI ritorna null (timeout/errore AI)", async () => {
    mocks.decideEngineWithAI.mockResolvedValue(null);

    const result = await aiOverride(FAKE_REQ, FAKE_OPTS);

    expect(result).toBeNull();
  });

  it("NON chiama routeViaGraphHopper né valhallaCalculateRoute quando AI torna null", async () => {
    mocks.decideEngineWithAI.mockResolvedValue(null);

    await aiOverride(FAKE_REQ, FAKE_OPTS);

    expect(mocks.routeViaGraphHopper).not.toHaveBeenCalled();
    expect(mocks.valhallaCalculateRoute).not.toHaveBeenCalled();
  });

  it("ai-decision-log registra mode=fallback-smart quando AI non risponde", async () => {
    mocks.decideEngineWithAI.mockResolvedValue(null);

    await aiOverride(FAKE_REQ, FAKE_OPTS);

    const decisions = getAiDecisions(1);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].mode).toBe("fallback-smart");
    expect(decisions[0].confidence).toBeNull();
  });

  it("routing-metrics NON registra alcun campione quando AI fa timeout", async () => {
    mocks.decideEngineWithAI.mockResolvedValue(null);

    await aiOverride(FAKE_REQ, FAKE_OPTS);

    const counters = getRoutingCounters(60_000);
    expect(counters.successes).toBe(0);
    expect(counters.failures).toBe(0);
    expect(counters.fallbacks).toBe(0);
  });

  it("aiOverride ritorna null se aiContext è assente (guard)", async () => {
    const optsNoCtx: RouterSelectorOptions = { ...FAKE_OPTS, aiContext: undefined };

    const result = await aiOverride(FAKE_REQ, optsNoCtx);

    expect(result).toBeNull();
    expect(mocks.decideEngineWithAI).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (c) Consistenza ai-decision-log ↔ routing-metrics
// ---------------------------------------------------------------------------

describe("(c) consistenza ai-decision-log ↔ routing-metrics", () => {
  describe("path confidence alta (≥ 0.6) — engine diretto", () => {
    it("confidence alta su valhalla: chosenEngine in log = engine con success in metrics", async () => {
      mocks.decideEngineWithAI.mockResolvedValue({
        engine: "valhalla",
        confidence: 0.85,
        reason: "valhalla ottimale per curvy",
        provider: "groq",
      });
      mocks.valhallaCalculateRoute.mockResolvedValue(VALHALLA_ROUTE);

      await aiOverride(FAKE_REQ, FAKE_OPTS);

      const decisions = getAiDecisions(1);
      const counters = getRoutingCounters(60_000);

      expect(decisions[0].mode).toBe("ai-direct");
      expect(decisions[0].chosenEngine).toBe("valhalla");
      // routing-metrics deve registrare success su valhalla, non su graphhopper
      expect(counters.byEngine["valhalla"]?.success).toBe(1);
      expect(counters.byEngine["graphhopper"]?.success ?? 0).toBe(0);
    });

    it("confidence alta su graphhopper: chosenEngine in log = engine con success in metrics", async () => {
      mocks.decideEngineWithAI.mockResolvedValue({
        engine: "graphhopper",
        confidence: 0.9,
        reason: "graphhopper sicuro per fast",
        provider: "groq",
      });
      mocks.routeViaGraphHopper.mockResolvedValue(GH_ROUTE);

      await aiOverride(FAKE_REQ, FAKE_OPTS);

      const decisions = getAiDecisions(1);
      const counters = getRoutingCounters(60_000);

      expect(decisions[0].mode).toBe("ai-direct");
      expect(decisions[0].chosenEngine).toBe("graphhopper");
      expect(counters.byEngine["graphhopper"]?.success).toBe(1);
      expect(counters.byEngine["valhalla"]?.success ?? 0).toBe(0);
    });

    it("l'engine registrato in metrics è lo stesso che ha restituito la route (valhalla wins)", async () => {
      mocks.decideEngineWithAI.mockResolvedValue({
        engine: "valhalla",
        confidence: 0.75,
        reason: "test",
        provider: "gemini",
      });
      mocks.valhallaCalculateRoute.mockResolvedValue(VALHALLA_ROUTE);

      const result = await aiOverride(FAKE_REQ, FAKE_OPTS);

      const decisions = getAiDecisions(1);
      const counters = getRoutingCounters(60_000);
      const successEngines = Object.entries(counters.byEngine)
        .filter(([, v]) => v.success > 0)
        .map(([k]) => k);

      // La route risultante è quella di Valhalla
      expect(result).toBe(VALHALLA_ROUTE);
      // L'engine nel log e quello con success in metrics coincidono
      expect(decisions[0].chosenEngine).toBe("valhalla");
      expect(successEngines).toContain("valhalla");
      expect(successEngines).not.toContain("graphhopper");
    });
  });

  describe("path confidence bassa (< 0.6) — dual-compare", () => {
    it("dual-compare: il vincitore nel log coincide con l'unico engine con success più alto in metrics", async () => {
      mocks.decideEngineWithAI.mockResolvedValue({
        engine: "graphhopper",
        confidence: 0.45,
        reason: "dati insufficienti per decidere",
        provider: "groq",
      });
      mocks.routeViaGraphHopper.mockResolvedValue(GH_ROUTE);
      mocks.valhallaCalculateRoute.mockResolvedValue(VALHALLA_ROUTE);
      // GH vince con score più alto
      mocks.scoreRoute
        .mockReturnValueOnce({ score: 0.82, breakdown: {} }) // GH
        .mockReturnValueOnce({ score: 0.55, breakdown: {} }); // Valhalla

      const result = await aiOverride(FAKE_REQ, FAKE_OPTS);

      const decisions = getAiDecisions(1);
      const counters = getRoutingCounters(60_000);

      expect(decisions[0].mode).toBe("ai-dual-compare");
      expect(decisions[0].chosenEngine).toBe("graphhopper");
      // Il result è la route del vincitore
      expect(result).toBe(GH_ROUTE);
      // dualScores contiene entrambi i candidati
      expect(decisions[0].dualScores).toMatchObject({ graphhopper: expect.any(Number), valhalla: expect.any(Number) });
      // In metrics: entrambi hanno success (entrambi sono stati eseguiti nel dual-compare)
      expect(counters.byEngine["graphhopper"]?.success).toBe(1);
      expect(counters.byEngine["valhalla"]?.success).toBe(1);
    });

    it("dual-compare: quando valhalla vince, il log e i metrics concordano su valhalla", async () => {
      mocks.decideEngineWithAI.mockResolvedValue({
        engine: "valhalla",
        confidence: 0.35,
        reason: "test",
        provider: "groq",
      });
      mocks.routeViaGraphHopper.mockResolvedValue(GH_ROUTE);
      mocks.valhallaCalculateRoute.mockResolvedValue(VALHALLA_ROUTE);
      // Valhalla vince
      mocks.scoreRoute
        .mockReturnValueOnce({ score: 0.50, breakdown: {} }) // GH
        .mockReturnValueOnce({ score: 0.90, breakdown: {} }); // Valhalla

      const result = await aiOverride(FAKE_REQ, FAKE_OPTS);

      const decisions = getAiDecisions(1);

      expect(decisions[0].chosenEngine).toBe("valhalla");
      expect(result).toBe(VALHALLA_ROUTE);
    });

    it("dualScores nel log riflette i valori calcolati da scoreRoute (arrotondati a 2 decimali)", async () => {
      mocks.decideEngineWithAI.mockResolvedValue({
        engine: "graphhopper",
        confidence: 0.4,
        reason: "test",
        provider: "groq",
      });
      mocks.routeViaGraphHopper.mockResolvedValue(GH_ROUTE);
      mocks.valhallaCalculateRoute.mockResolvedValue(VALHALLA_ROUTE);
      mocks.scoreRoute
        .mockReturnValueOnce({ score: 0.7777, breakdown: {} }) // GH → arrotondato a 0.78
        .mockReturnValueOnce({ score: 0.5555, breakdown: {} }); // Valhalla → arrotondato a 0.56

      await aiOverride(FAKE_REQ, FAKE_OPTS);

      const decisions = getAiDecisions(1);
      expect(decisions[0].dualScores!["graphhopper"]).toBeCloseTo(0.78, 2);
      expect(decisions[0].dualScores!["valhalla"]).toBeCloseTo(0.56, 2);
    });
  });
});
