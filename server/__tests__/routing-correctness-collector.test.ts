// Task #414 — Test di integrazione a livello collector: verifica che
// collectRoutingCorrectness() NON emetta il segnale "routing.area_resolver.error"
// dopo il fix PostGIS, e che lo emetta (severity warn) solo quando l'area
// resolver lancia davvero un errore SQL.
//
// Prod evidence (2026-07-17): query su system_signals WHERE metric =
// 'routing.area_resolver.error' AND source = 'horus' ha restituito 0 righe
// dopo il deploy del fix sqlFloatArray() in routing-area-resolver.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CorrectnessProbeResult } from "../ai/watchdog/routing-correctness-probes";

// ---------------------------------------------------------------------------
// Mock stabile di runRoutingCorrectnessProbes
// ---------------------------------------------------------------------------
const runProbesMock = vi.hoisted(() => vi.fn<[], Promise<CorrectnessProbeResult[]>>());

vi.mock("../ai/watchdog/routing-correctness-probes", () => ({
  runRoutingCorrectnessProbes: runProbesMock,
}));

// getHistory usato da safeHistory nel collector — non tocca il DB.
vi.mock("../routes/admin/thinkcentre-health-utils", () => ({
  getHistory: () => [],
}));

import { collectRoutingCorrectness } from "../ai/watchdog/collectors/routing-correctness-collector";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function makeProbe(
  engine: CorrectnessProbeResult["engine"],
  overrides: Partial<CorrectnessProbeResult> = {},
): CorrectnessProbeResult {
  return {
    engine,
    configured: true,
    reachable: true,
    plausible: true,
    ok: true,
    skipped: false,
    latencyMs: null,
    distanceKm: null,
    durationMin: null,
    reason: null,
    severity: "info",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe("collectRoutingCorrectness — segnale area_resolver.error", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("NON emette routing.area_resolver.error quando GH funziona correttamente", async () => {
    // Simula il path post-fix: GH risponde ok, nessun errore area resolver.
    runProbesMock.mockResolvedValue([
      makeProbe("graphhopper", { ok: true, latencyMs: 150, distanceKm: 47, durationMin: 52 }),
      makeProbe("valhalla", { configured: false, reachable: false, plausible: false, ok: false }),
      makeProbe("photon", { ok: true }),
      makeProbe("pipeline", { ok: true }),
      // Nessuna entry "area_resolver" — il fix ha rimosso l'errore SQL.
    ]);

    const signals = await collectRoutingCorrectness();

    const areaResolverSignal = signals.find((s) => s.metric === "routing.area_resolver.error");
    expect(areaResolverSignal).toBeUndefined();

    // I segnali GH e pipeline devono comunque essere presenti.
    expect(signals.find((s) => s.metric === "routing.graphhopper.correct")).toBeDefined();
    expect(signals.find((s) => s.metric === "pipeline.correct")).toBeDefined();
  });

  it("emette routing.area_resolver.error con severity warn quando il probe lo segnala", async () => {
    // Simula il path pre-fix: l'area resolver lancia un errore SQL.
    runProbesMock.mockResolvedValue([
      makeProbe("graphhopper", {
        ok: false, skipped: true, reachable: false, plausible: false, severity: "info",
        reason: "area resolver: errore SQL prima della chiamata GH — sonda saltata",
      }),
      makeProbe("valhalla", { configured: false, reachable: false, plausible: false, ok: false }),
      makeProbe("photon", { ok: true }),
      makeProbe("pipeline"),
      // Entry area_resolver separata — come la probe la restituisce.
      makeProbe("area_resolver", {
        ok: false, reachable: false, plausible: false, skipped: false, severity: "warn",
        reason: "errore SQL nell'area resolver: cannot cast type record to double precision[]",
        detail: { sqlError: "cannot cast type record to double precision[]", sqlCode: "42846" },
      }),
    ]);

    const signals = await collectRoutingCorrectness();

    const areaResolverSignal = signals.find((s) => s.metric === "routing.area_resolver.error");
    expect(areaResolverSignal).toBeDefined();
    expect(areaResolverSignal!.severity).toBe("warn");
    expect(areaResolverSignal!.source).toBe("horus");
    // Il messaggio dell'errore SQL deve essere propagato nei details.
    expect(JSON.stringify(areaResolverSignal!.details)).toMatch(/area resolver/);
  });

  it("NON emette routing.area_resolver.error quando la sonda GH è saltata per TC spento (non per SQL)", async () => {
    // ThinkCentre spento: GH skipped, nessun area_resolver separato.
    runProbesMock.mockResolvedValue([
      makeProbe("graphhopper", {
        ok: false, skipped: true, reachable: false, plausible: false, severity: "info",
        reason: "ThinkCentre spento/in manutenzione — sonda saltata",
      }),
      makeProbe("valhalla", { ok: false, skipped: true, severity: "info" }),
      makeProbe("photon", { configured: false, ok: false }),
      makeProbe("pipeline", { ok: false, skipped: true, severity: "info" }),
      // Nessun entry area_resolver quando il salto è per TC spento.
    ]);

    const signals = await collectRoutingCorrectness();

    const areaResolverSignal = signals.find((s) => s.metric === "routing.area_resolver.error");
    expect(areaResolverSignal).toBeUndefined();
  });
});
