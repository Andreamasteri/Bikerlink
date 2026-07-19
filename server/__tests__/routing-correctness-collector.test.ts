// Task #414 — Test di integrazione a livello collector: verifica che
// collectRoutingCorrectness() NON emetta il segnale "routing.area_resolver.error"
// dopo il fix PostGIS, e che lo emetta (severity warn) solo quando l'area
// resolver lancia davvero un errore SQL.
//
// Prod evidence (2026-07-17): query su system_signals WHERE metric =
// 'routing.area_resolver.error' AND source = 'horus' ha restituito 0 righe
// dopo il deploy del fix sqlFloatArray() in routing-area-resolver.ts.
//
// Task #704 — Regression test per severity: probe con esito OK devono produrre
// segnali severity="info" (filtrati da recordSignals nell'aggregator prima della
// scrittura su system_signals). Solo i probe KO devono produrre high/critical.

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

// ---------------------------------------------------------------------------
// Task #704 — Regression: severity mapping probe OK → "info", KO → high/critical
//
// Il collector deve mappare:
//   - probe ok=true           → severity "info"  (filtrato da recordSignals, mai scritto su system_signals)
//   - probe ok=false, errore di rete → severity "critical"
//   - probe ok=false, risposta non plausibile → severity "high"
//   - probe non configurato o skipped → severity "info"
//
// Questo impedisce che i segnali horus.routing.*.correct e
// horus.geocoding.*.correct con esito positivo compaiano nella coda
// high/critical di system_signals, coprendo alert reali.
// ---------------------------------------------------------------------------
describe("collectRoutingCorrectness — severity mapping (Task #704)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tutti i segnali hanno severity='info' quando tutte le sonde sono ok", async () => {
    runProbesMock.mockResolvedValue([
      makeProbe("graphhopper", { ok: true, latencyMs: 200, distanceKm: 47, durationMin: 52 }),
      makeProbe("valhalla",    { ok: true, latencyMs: 180, distanceKm: 47, durationMin: 50 }),
      makeProbe("photon",      { ok: true, latencyMs: 80 }),
      makeProbe("pipeline",    { ok: true }),
    ]);

    const signals = await collectRoutingCorrectness();

    // Tutti e 4 i segnali devono avere severity info (→ non scritti su system_signals).
    for (const s of signals) {
      expect(s.severity).toBe("info");
    }
    // Tutti i segnali devono avere source "horus".
    for (const s of signals) {
      expect(s.source).toBe("horus");
    }
  });

  it("routing.graphhopper.correct ha severity='critical' quando il probe GH fallisce per errore di rete", async () => {
    runProbesMock.mockResolvedValue([
      makeProbe("graphhopper", {
        ok: false, reachable: false, plausible: false,
        severity: "critical",
        reason: "richiesta fallita: timeout 8000ms",
      }),
      makeProbe("valhalla", { ok: true }),
      makeProbe("photon",   { ok: true }),
      makeProbe("pipeline", { ok: false, severity: "critical", reason: "nessun motore restituisce percorsi corretti" }),
    ]);

    const signals = await collectRoutingCorrectness();

    const ghSignal = signals.find((s) => s.metric === "routing.graphhopper.correct");
    expect(ghSignal).toBeDefined();
    expect(ghSignal!.severity).toBe("critical");
  });

  it("routing.valhalla.correct ha severity='high' quando il percorso è non plausibile", async () => {
    runProbesMock.mockResolvedValue([
      makeProbe("graphhopper", { ok: true }),
      makeProbe("valhalla", {
        ok: false, reachable: true, plausible: false,
        severity: "high",
        reason: "risultato non plausibile: distanza <10% della linea d'aria",
      }),
      makeProbe("photon",   { ok: true }),
      makeProbe("pipeline", { ok: true }),
    ]);

    const signals = await collectRoutingCorrectness();

    const valhallaSignal = signals.find((s) => s.metric === "routing.valhalla.correct");
    expect(valhallaSignal).toBeDefined();
    expect(valhallaSignal!.severity).toBe("high");
  });

  it("geocoding.photon.correct ha severity='critical' quando Photon restituisce HTTP 500", async () => {
    runProbesMock.mockResolvedValue([
      makeProbe("graphhopper", { ok: true }),
      makeProbe("valhalla",    { ok: true }),
      makeProbe("photon", {
        ok: false, reachable: false, plausible: false,
        severity: "critical",
        reason: "HTTP 500",
      }),
      makeProbe("pipeline", { ok: true }),
    ]);

    const signals = await collectRoutingCorrectness();

    const photonSignal = signals.find((s) => s.metric === "geocoding.photon.correct");
    expect(photonSignal).toBeDefined();
    expect(photonSignal!.severity).toBe("critical");
  });

  it("sonda non configurata produce severity='info' (non è un errore)", async () => {
    runProbesMock.mockResolvedValue([
      makeProbe("graphhopper", { ok: true }),
      makeProbe("valhalla",    { configured: false, ok: false, reachable: false, plausible: false, severity: "info" }),
      makeProbe("photon",      { configured: false, ok: false, reachable: false, plausible: false, severity: "info" }),
      makeProbe("pipeline",    { configured: false, ok: false, severity: "info" }),
    ]);

    const signals = await collectRoutingCorrectness();

    const valhallaSignal = signals.find((s) => s.metric === "routing.valhalla.correct");
    expect(valhallaSignal).toBeDefined();
    expect(valhallaSignal!.severity).toBe("info");

    const photonSignal = signals.find((s) => s.metric === "geocoding.photon.correct");
    expect(photonSignal).toBeDefined();
    expect(photonSignal!.severity).toBe("info");
  });

  it("sonda skipped (TC spento) produce severity='info' per tutti i segnali self-hosted", async () => {
    runProbesMock.mockResolvedValue([
      makeProbe("graphhopper", { ok: false, skipped: true, reachable: false, plausible: false, severity: "info" }),
      makeProbe("valhalla",    { ok: false, skipped: true, reachable: false, plausible: false, severity: "info" }),
      makeProbe("photon",      { ok: false, skipped: true, reachable: false, plausible: false, severity: "info" }),
      makeProbe("pipeline",    { ok: false, skipped: true, reachable: false, plausible: false, severity: "info" }),
    ]);

    const signals = await collectRoutingCorrectness();

    for (const s of signals) {
      expect(s.severity).toBe("info");
    }
  });
});
