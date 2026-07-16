// Task #392 — Test: la probe GH non classifica come "critical" un errore SQL
// nell'area resolver (pre-GH). Verifica la separazione dei segnali:
//   - gh → skipped/info (non critical)
//   - area_resolver → warn (distinto da graphhopper.correct)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Stable mock refs (hoisted prima di vi.mock)
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  graphHopperRoute: vi.fn<[], Promise<unknown>>(),
  isThinkCentrePoweredOff: vi.fn().mockResolvedValue(false),
  isThinkCentreInMaintenance: vi.fn().mockResolvedValue(false),
  isRoutingExplicitlyDisabled: vi.fn().mockResolvedValue(false),
  getRoutingCounters: vi.fn().mockReturnValue({
    windowMs: 0, successes: 0, fallbacks: 0, failures: 0, byEngine: {}, enginesDown: {},
  }),
  getPipelineSummary: vi.fn().mockReturnValue({
    windowMs: 0, total: 0, ok: 0, fallback: 0, error: 0, fallbackRate: 0, byEngineUsed: {},
  }),
}));

vi.mock("../routing/router-selector", () => ({
  graphHopperRoute: mocks.graphHopperRoute,
}));
vi.mock("../routing/valhalla-client", () => ({
  calculateRoute: vi.fn().mockRejectedValue(new Error("valhalla not configured")),
}));
vi.mock("../lib/thinkcentre-powered-off", () => ({
  isThinkCentrePoweredOff: mocks.isThinkCentrePoweredOff,
}));
vi.mock("../lib/thinkcentre-maintenance", () => ({
  isThinkCentreInMaintenance: mocks.isThinkCentreInMaintenance,
}));
vi.mock("../routing/routing-kill-switch", () => ({
  isRoutingExplicitlyDisabled: mocks.isRoutingExplicitlyDisabled,
}));
vi.mock("../routing/routing-metrics", () => ({
  getRoutingCounters: mocks.getRoutingCounters,
}));
vi.mock("../routing/routing-pipeline-log", () => ({
  getPipelineSummary: mocks.getPipelineSummary,
}));
vi.mock("../lib/cf-access", () => ({
  cfAccessHeaders: () => ({}),
}));

import { runRoutingCorrectnessProbes, _resetCorrectnessProbesForTests } from "../ai/watchdog/routing-correctness-probes";

// Helper: costruisce un errore con le proprietà del driver PostgreSQL (pg).
function makeDbError(message: string, sqlState = "42846"): Error & { code: string; severity: string } {
  const err = new Error(message) as Error & { code: string; severity: string };
  err.code = sqlState;
  err.severity = "ERROR";
  return err;
}

describe("probeGraphHopperCorrectness — errore SQL area resolver", () => {
  const originalGhUrl = process.env.GRAPHHOPPER_URL;

  beforeEach(() => {
    process.env.GRAPHHOPPER_URL = "http://gh-test.local";
    // Assicuriamoci che Valhalla e Photon non siano configurati per isolare il test GH.
    delete process.env.VALHALLA_URL;
    delete process.env.PHOTON_URL;
    _resetCorrectnessProbesForTests();
    vi.clearAllMocks();
    mocks.isThinkCentrePoweredOff.mockResolvedValue(false);
    mocks.isThinkCentreInMaintenance.mockResolvedValue(false);
    mocks.isRoutingExplicitlyDisabled.mockResolvedValue(false);
  });

  afterEach(() => {
    if (originalGhUrl !== undefined) {
      process.env.GRAPHHOPPER_URL = originalGhUrl;
    } else {
      delete process.env.GRAPHHOPPER_URL;
    }
    _resetCorrectnessProbesForTests();
  });

  it("NON classifica come critical la sonda GH quando l'area resolver lancia un errore SQL", async () => {
    const dbErr = makeDbError(
      "cannot cast type record to double precision[] (42846)",
      "42846",
    );
    mocks.graphHopperRoute.mockRejectedValue(dbErr);

    const results = await runRoutingCorrectnessProbes(true);
    const gh = results.find((r) => r.engine === "graphhopper");

    expect(gh).toBeDefined();
    // La sonda GH deve essere saltata (info), NON critica.
    expect(gh!.severity).toBe("info");
    expect(gh!.skipped).toBe(true);
    // Non deve contenere "correttezza KO" nel reason.
    expect(gh!.reason).not.toMatch(/richiesta fallita/);
    expect(gh!.reason).toMatch(/area resolver/i);
  });

  it("emette un risultato area_resolver separato con severity warn", async () => {
    const dbErr = makeDbError("ST_Contains: function not found", "42883");
    mocks.graphHopperRoute.mockRejectedValue(dbErr);

    const results = await runRoutingCorrectnessProbes(true);
    const areaResolver = results.find((r) => r.engine === "area_resolver");

    expect(areaResolver).toBeDefined();
    expect(areaResolver!.severity).toBe("warn");
    expect(areaResolver!.skipped).toBe(false);
    expect(areaResolver!.ok).toBe(false);
    // Il messaggio dell'errore SQL deve essere propagato.
    expect(areaResolver!.reason).toMatch(/ST_Contains/);
    // Il codice SQLSTATE deve essere in detail.
    expect((areaResolver!.detail as Record<string, unknown>)?.sqlCode).toBe("42883");
  });

  it("NON crea un risultato area_resolver quando GH fallisce per timeout/rete (non DB)", async () => {
    const netErr = new Error("graphhopper: timeout 8000ms");
    mocks.graphHopperRoute.mockRejectedValue(netErr);

    const results = await runRoutingCorrectnessProbes(true);
    const areaResolver = results.find((r) => r.engine === "area_resolver");
    const gh = results.find((r) => r.engine === "graphhopper");

    // Nessun risultato area_resolver per errori di rete.
    expect(areaResolver).toBeUndefined();
    // La sonda GH deve essere classificata come critical (guasto reale).
    expect(gh!.severity).toBe("critical");
    expect(gh!.skipped).toBe(false);
    expect(gh!.reason).toMatch(/richiesta fallita/);
  });

  it("classifica come DB error anche un errore con severity FATAL (pg driver)", async () => {
    const fatalErr = Object.assign(new Error("FATAL: too many connections"), {
      code: "53300",
      severity: "FATAL",
    });
    mocks.graphHopperRoute.mockRejectedValue(fatalErr);

    const results = await runRoutingCorrectnessProbes(true);
    const gh = results.find((r) => r.engine === "graphhopper");
    const areaResolver = results.find((r) => r.engine === "area_resolver");

    expect(gh!.severity).toBe("info");
    expect(gh!.skipped).toBe(true);
    expect(areaResolver).toBeDefined();
    expect(areaResolver!.severity).toBe("warn");
  });

  it("GH funzionante → nessun errore area_resolver, nessuna sonda saltata", async () => {
    mocks.graphHopperRoute.mockResolvedValue({
      paths: [{ distance: 52000, time: 3_000_000, points: { coordinates: [[9, 45], [9.05, 45.4], [9.08, 45.8]] } }],
    });

    const results = await runRoutingCorrectnessProbes(true);
    const gh = results.find((r) => r.engine === "graphhopper");
    const areaResolver = results.find((r) => r.engine === "area_resolver");

    // GH funzionante → nessun risultato area_resolver aggiuntivo.
    expect(areaResolver).toBeUndefined();
    expect(gh!.ok).toBe(true);
    expect(gh!.skipped).toBe(false);
    expect(gh!.severity).toBe("info");
  });
});
