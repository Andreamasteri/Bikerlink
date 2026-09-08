/**
 * Test suite — Consistenza decision-log/pipeline ↔ routing-metrics (Task #5347)
 *
 * Copre i branch di getActiveRouterInner NON già coperti dalla suite AI
 * (ai-routing-engine-selector.test.ts), verificando gli invarianti per-request:
 * - route servita via fallback runtime A→B che riesce → recordRoutingFallback(A,B)
 *   registrato E success attribuito a B;
 * - nessun success attribuito a un engine che non ha prodotto la route;
 * - path "no dispatch" (kill-switch, errori area) → zero campioni metrics;
 * - guard engine archiviati = normalizzazione di config, NON fallback (niente
 *   header, niente campione fallback, pipeline outcome "ok" su graphhopper).
 *
 * Mock: valhalla/graphhopper client, kill-switch,
 *       area mode/resolver, thinkcentre-offline, ai-engine-decider, geo, score.
 * Reali: routing-metrics, routing-pipeline-log, ai-decision-log (ring buffer).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response } from "express";

const mocks = vi.hoisted(() => ({
  valhallaCalculateRoute: vi.fn(),
  routeViaGraphHopper: vi.fn(),
  decideEngineWithAI: vi.fn(),
  isRoutingEnabled: vi.fn(),
  isAreaRoutingActive: vi.fn(),
  resolveRoutingArea: vi.fn(),
  isThinkCentreOffline: vi.fn(),
  isThinkCentrePoweredOff: vi.fn(),
  scoreRoute: vi.fn(),
  haversineKm: vi.fn(),
}));

vi.mock("../routing/valhalla-client", () => ({ calculateRoute: mocks.valhallaCalculateRoute }));
vi.mock("../routing/graphhopper-adapter", () => ({ routeViaGraphHopper: mocks.routeViaGraphHopper }));
vi.mock("../routing/ai-engine-decider", () => ({ decideEngineWithAI: mocks.decideEngineWithAI }));
vi.mock("../routing/routing-kill-switch", () => ({ isRoutingEnabled: mocks.isRoutingEnabled }));
vi.mock("../routing/routing-area-mode", () => ({ isAreaRoutingActive: mocks.isAreaRoutingActive }));
vi.mock("../routing/routing-area-resolver", () => ({ resolveRoutingArea: mocks.resolveRoutingArea }));
vi.mock("../lib/thinkcentre-offline", () => ({ isThinkCentreOffline: mocks.isThinkCentreOffline }));
vi.mock("../lib/thinkcentre-powered-off", () => ({ isThinkCentrePoweredOff: mocks.isThinkCentrePoweredOff }));
vi.mock("../routing/route-quality-score", () => ({ scoreRoute: mocks.scoreRoute }));
vi.mock("../geo", () => ({ haversineKm: mocks.haversineKm }));

import {
  getActiveRouter,
  aiOverride,
  RoutingDisabledError,
  CrossGroupRoutingError,
  type RouterSelectorOptions,
} from "../routing/router-selector";
import type { RouteRequest, RouteResult } from "../routing/graphhopper-adapter";
import type { AiRoutingContext } from "../routing/ai-engine-decider";
import { ROUTING_AREA_OUTCOMES } from "@shared/routing-areas";
import { _resetRoutingMetricsForTests, getRoutingCounters } from "../routing/routing-metrics";
import { _resetPipelineLogForTests, getPipelineEvents } from "../routing/routing-pipeline-log";
import { _resetAiDecisionsForTests } from "../routing/ai-decision-log";

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

const FAKE_REQ: RouteRequest = {
  points: [
    [10.0, 45.0],
    [10.5, 45.5],
  ],
  profile: "motorcycle",
};

const BASE_OPTS: RouterSelectorOptions = {
  rollout: "all",
  engine: "graphhopper",
  isMapTester: false,
};

function makeRoute(distanceM: number): RouteResult {
  return { paths: [{ distance: distanceM, time: 60_000, points: { coordinates: [] } }] };
}

const GH_ROUTE = makeRoute(80_000);
const VALHALLA_ROUTE = makeRoute(75_000);

/** Res finto con header store — basta per setHeader/getHeader/headersSent. */
function makeRes(): Response {
  const headers: Record<string, string> = {};
  return {
    headersSent: false,
    setHeader(k: string, v: string) { headers[k.toLowerCase()] = v; },
    getHeader(k: string) { return headers[k.toLowerCase()]; },
  } as unknown as Response;
}

function counters() {
  return getRoutingCounters(60_000);
}

beforeEach(() => {
  _resetRoutingMetricsForTests();
  _resetPipelineLogForTests();
  _resetAiDecisionsForTests();
  vi.clearAllMocks();
  mocks.isRoutingEnabled.mockResolvedValue(true);
  mocks.isAreaRoutingActive.mockResolvedValue(false);
  mocks.isThinkCentreOffline.mockResolvedValue(false);
  mocks.isThinkCentrePoweredOff.mockResolvedValue(false);
  mocks.haversineKm.mockReturnValue(50);
});

// ---------------------------------------------------------------------------
// engine=valhalla (routeViaValhallaWithFallback)
// ---------------------------------------------------------------------------

describe("engine=valhalla — fallback runtime a GraphHopper", () => {
  const OPTS: RouterSelectorOptions = { ...BASE_OPTS, engine: "valhalla" };

  it("successo diretto: success attribuito SOLO a valhalla, zero fallback", async () => {
    mocks.valhallaCalculateRoute.mockResolvedValue(VALHALLA_ROUTE);
    const res = makeRes();

    const out = await getActiveRouter(FAKE_REQ, OPTS, res, true);

    expect(out).toBe(VALHALLA_ROUTE);
    const c = counters();
    expect(c.byEngine["valhalla"]?.success).toBe(1);
    expect(c.byEngine["graphhopper"]?.success ?? 0).toBe(0);
    expect(c.fallbacks).toBe(0);
    const ev = getPipelineEvents(1)[0];
    expect(ev.outcome).toBe("ok");
    expect(ev.engineUsed).toBe("valhalla");
  });

  it("errore transient → fallback(valhalla) registrato E success attribuito a graphhopper", async () => {
    mocks.valhallaCalculateRoute.mockRejectedValue(new Error("Valhalla: connection refused"));
    mocks.routeViaGraphHopper.mockResolvedValue(GH_ROUTE);
    const res = makeRes();

    const out = await getActiveRouter(FAKE_REQ, OPTS, res, true);

    expect(out).toBe(GH_ROUTE);
    const c = counters();
    expect(c.byEngine["valhalla"]?.fallback).toBe(1);
    expect(c.byEngine["graphhopper"]?.success).toBe(1);
    expect(c.byEngine["valhalla"]?.success ?? 0).toBe(0);
    const ev = getPipelineEvents(1)[0];
    expect(ev.outcome).toBe("fallback");
    expect(ev.engineUsed).toBe("graphhopper");
  });

  it("fallback a GH che POI fallisce → failure attribuito a graphhopper, non a valhalla", async () => {
    mocks.valhallaCalculateRoute.mockRejectedValue(new Error("Valhalla: 503"));
    mocks.routeViaGraphHopper.mockRejectedValue(new Error("GraphHopper: 500"));
    const res = makeRes();

    await expect(getActiveRouter(FAKE_REQ, OPTS, res, true)).rejects.toThrow("GraphHopper: 500");

    const c = counters();
    expect(c.byEngine["valhalla"]?.fallback).toBe(1);
    expect(c.byEngine["graphhopper"]?.failure).toBe(1);
    expect(c.byEngine["valhalla"]?.failure ?? 0).toBe(0);
    expect(getPipelineEvents(1)[0].outcome).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// ThinkCentre offline — nessun fallback cloud
// ---------------------------------------------------------------------------

describe("ThinkCentre offline — routing indisponibile", () => {
  beforeEach(() => {
    mocks.isThinkCentreOffline.mockResolvedValue(true);
  });

  it("non tenta fallback e non registra metriche", async () => {
    const res = makeRes();

    await expect(getActiveRouter(FAKE_REQ, BASE_OPTS, res, true)).rejects.toThrow("ThinkCentre spento");

    const c = counters();
    expect(c.successes + c.failures + c.fallbacks).toBe(0);
    expect(getPipelineEvents(1)[0]?.outcome).toBe("error");
  });
});
// ---------------------------------------------------------------------------
// Guard engine archiviati — normalizzazione config, NON fallback
// ---------------------------------------------------------------------------

describe("engine archiviato — config guard, non fallback runtime", () => {
  it("aiMode con engine 'ai' archiviato: AI non chiamata, servito da GH, pipeline ok su graphhopper", async () => {
    mocks.routeViaGraphHopper.mockResolvedValue(GH_ROUTE);
    const res = makeRes();
    const opts: RouterSelectorOptions = { ...BASE_OPTS, aiMode: true };

    const out = await getActiveRouter(FAKE_REQ, opts, res, true);

    expect(out).toBe(GH_ROUTE);
    expect(mocks.decideEngineWithAI).not.toHaveBeenCalled();
    expect(res.getHeader("X-Routing-Fallback")).toBeUndefined();
    const c = counters();
    expect(c.fallbacks).toBe(0);
    expect(c.byEngine["graphhopper"]?.success).toBe(1);
    const ev = getPipelineEvents(1)[0];
    expect(ev.outcome).toBe("ok");
    expect(ev.engineSelected).toBe("ai");
    expect(ev.engineUsed).toBe("graphhopper");
  });
});

// ---------------------------------------------------------------------------
// Baseline: rollout disabilitato / default GraphHopper
// ---------------------------------------------------------------------------

describe("baseline GraphHopper", () => {
  it("rollout=disabled → success a graphhopper, pipeline ok", async () => {
    mocks.routeViaGraphHopper.mockResolvedValue(GH_ROUTE);
    const res = makeRes();
    const opts: RouterSelectorOptions = { ...BASE_OPTS, rollout: "disabled", engine: "valhalla" };

    const out = await getActiveRouter(FAKE_REQ, opts, res, true);

    expect(out).toBe(GH_ROUTE);
    expect(mocks.valhallaCalculateRoute).not.toHaveBeenCalled();
    const c = counters();
    expect(c.byEngine["graphhopper"]?.success).toBe(1);
    expect(c.byEngine["valhalla"]).toBeUndefined();
    expect(getPipelineEvents(1)[0].outcome).toBe("ok");
  });

  it("failure GH default attribuito a graphhopper", async () => {
    mocks.routeViaGraphHopper.mockRejectedValue(new Error("GraphHopper: 502"));
    const res = makeRes();

    await expect(getActiveRouter(FAKE_REQ, BASE_OPTS, res, true)).rejects.toThrow("GraphHopper: 502");

    const c = counters();
    expect(c.byEngine["graphhopper"]?.failure).toBe(1);
    expect(getPipelineEvents(1)[0].outcome).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// Path "no dispatch" — zero campioni metrics
// ---------------------------------------------------------------------------

describe("path senza dispatch — zero campioni metrics", () => {
  it("kill-switch attivo → RoutingDisabledError, zero metrics e zero eventi pipeline", async () => {
    mocks.isRoutingEnabled.mockResolvedValue(false);
    const res = makeRes();

    await expect(getActiveRouter(FAKE_REQ, BASE_OPTS, res, true)).rejects.toThrow(RoutingDisabledError);

    const c = counters();
    expect(c.successes + c.failures + c.fallbacks).toBe(0);
    expect(getPipelineEvents(1)).toHaveLength(0);
  });

  it("errore area (cross-group) → nessun failure attribuito a graphhopper", async () => {
    mocks.isAreaRoutingActive.mockResolvedValue(true);
    mocks.resolveRoutingArea.mockResolvedValue({ kind: ROUTING_AREA_OUTCOMES.CROSS_GROUP, codes: [] });
    const res = makeRes();

    await expect(getActiveRouter(FAKE_REQ, BASE_OPTS, res, true)).rejects.toThrow(CrossGroupRoutingError);

    const c = counters();
    expect(c.successes + c.failures + c.fallbacks).toBe(0);
    expect(getPipelineEvents(1)[0]?.outcome).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// aiOverride confidence alta — failure attribuito all'engine ESEGUITO
// ---------------------------------------------------------------------------

describe("aiOverride ai-direct — failure dopo fallback attribuito all'engine eseguito", () => {
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
  const AI_OPTS: RouterSelectorOptions = { ...BASE_OPTS, aiMode: true, aiContext: FAKE_CTX };

  it("valhalla→GH e GH fallisce → fallback(valhalla) + failure(graphhopper), MAI failure(valhalla)", async () => {
    mocks.decideEngineWithAI.mockResolvedValue({
      engine: "valhalla", confidence: 0.9, reason: "test", provider: "groq",
    });
    mocks.valhallaCalculateRoute.mockRejectedValue(new Error("Valhalla: timeout"));
    mocks.routeViaGraphHopper.mockRejectedValue(new Error("GraphHopper: 500"));
    const res = makeRes();

    await expect(aiOverride(FAKE_REQ, AI_OPTS, res)).rejects.toThrow("GraphHopper: 500");

    const c = counters();
    expect(c.byEngine["valhalla"]?.fallback).toBe(1);
    expect(c.byEngine["graphhopper"]?.failure).toBe(1);
    expect(c.byEngine["valhalla"]?.failure ?? 0).toBe(0);
  });

  it("errore valhalla NON transient → failure attribuito a valhalla (nessun fallback tentato)", async () => {
    mocks.decideEngineWithAI.mockResolvedValue({
      engine: "valhalla", confidence: 0.8, reason: "test", provider: "groq",
    });
    mocks.valhallaCalculateRoute.mockRejectedValue(new RangeError("bug interno"));
    const res = makeRes();

    await expect(aiOverride(FAKE_REQ, AI_OPTS, res)).rejects.toThrow("bug interno");

    const c = counters();
    expect(c.byEngine["valhalla"]?.failure).toBe(1);
    expect(c.byEngine["graphhopper"]?.failure ?? 0).toBe(0);
    expect(mocks.routeViaGraphHopper).not.toHaveBeenCalled();
  });

  it("GH diretto con errore area (cross-group) → ZERO failure (no dispatch)", async () => {
    mocks.decideEngineWithAI.mockResolvedValue({
      engine: "graphhopper", confidence: 0.9, reason: "test", provider: "groq",
    });
    mocks.isAreaRoutingActive.mockResolvedValue(true);
    mocks.resolveRoutingArea.mockResolvedValue({ kind: ROUTING_AREA_OUTCOMES.CROSS_GROUP, codes: [] });
    const res = makeRes();

    await expect(aiOverride(FAKE_REQ, AI_OPTS, res)).rejects.toThrow(CrossGroupRoutingError);

    const c = counters();
    expect(c.successes + c.failures + c.fallbacks).toBe(0);
  });

  it("valhalla→GH e GH fallisce per errore area → fallback(valhalla) MA zero failure", async () => {
    mocks.decideEngineWithAI.mockResolvedValue({
      engine: "valhalla", confidence: 0.9, reason: "test", provider: "groq",
    });
    mocks.valhallaCalculateRoute.mockRejectedValue(new Error("Valhalla: timeout"));
    mocks.isAreaRoutingActive.mockResolvedValue(true);
    mocks.resolveRoutingArea.mockResolvedValue({ kind: ROUTING_AREA_OUTCOMES.CROSS_GROUP, codes: [] });
    const res = makeRes();

    await expect(aiOverride(FAKE_REQ, AI_OPTS, res)).rejects.toThrow(CrossGroupRoutingError);

    const c = counters();
    expect(c.byEngine["valhalla"]?.fallback).toBe(1);
    expect(c.failures).toBe(0);
  });
});
