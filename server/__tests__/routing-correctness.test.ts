// Task #23 — Test unità: validazione correttezza routing/geocoding, derivazione
// pipeline combinata, gate di priorità AI di routing, namespace "horus" nei problemi.
import { describe, it, expect, beforeEach } from "vitest";
import {
  measureRouteResult,
  validateRoutePlausibility,
  measurePhotonResponse,
  validateGeocodePlausibility,
} from "../routing/route-plausibility";
import { derivePipelineCorrectness, type CorrectnessProbeResult } from "../ai/watchdog/routing-correctness-probes";
import {
  withRoutingAiPriority,
  isRoutingAiBusy,
  getRoutingAiPriorityStats,
  _resetRoutingAiPriorityForTests,
} from "../ai/ai-priority-gate";
import { deriveProblems } from "../ai/watchdog/aggregator";
import { haversineKm } from "../geo";
import type { Signal } from "../ai/watchdog/types";

const AERIAL = 40; // ~Milano→Como

// ── route-plausibility: RouteResult ──────────────────────────────────────────
describe("measureRouteResult", () => {
  it("estrae distanza/durata/geometria da GeoJSON", () => {
    const m = measureRouteResult({
      paths: [{ distance: 52000, time: 3_000_000, points: { coordinates: [[9, 45], [9.05, 45.4], [9.08, 45.8]] } }],
    });
    expect(m.distanceKm).toBeCloseTo(52);
    expect(m.durationMin).toBeCloseTo(50);
    expect(m.coordCount).toBe(3);
    expect(m.hasGeometry).toBe(true);
  });

  it("tratta la polyline codificata non vuota come geometria presente", () => {
    const m = measureRouteResult({ paths: [{ distance: 52000, time: 3_000_000, points: "abc_encoded" }] });
    expect(m.hasGeometry).toBe(true);
    expect(m.coordCount).toBe(2);
  });

  it("nessun path → nessuna geometria", () => {
    expect(measureRouteResult({ paths: [] }).hasGeometry).toBe(false);
    expect(measureRouteResult(null).hasGeometry).toBe(false);
  });
});

describe("validateRoutePlausibility", () => {
  const valid = { distanceKm: 52, durationMin: 50, coordCount: 3, hasGeometry: true };

  it("accetta un percorso plausibile", () => {
    const r = validateRoutePlausibility(AERIAL, valid);
    expect(r.plausible).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.impliedKmh).toBeCloseTo(62.4, 0);
  });

  it("rifiuta geometria assente (errore silenzioso)", () => {
    const r = validateRoutePlausibility(AERIAL, { distanceKm: 52, durationMin: 50, coordCount: 0, hasGeometry: false });
    expect(r.plausible).toBe(false);
    expect(r.reason).toMatch(/geometria assente/);
  });

  it("rifiuta distanza più corta della linea d'aria", () => {
    const r = validateRoutePlausibility(AERIAL, { ...valid, distanceKm: 5 });
    expect(r.plausible).toBe(false);
    expect(r.reason).toMatch(/sotto il minimo/);
  });

  it("rifiuta distanza enorme incoerente", () => {
    const r = validateRoutePlausibility(AERIAL, { ...valid, distanceKm: 5000 });
    expect(r.plausible).toBe(false);
    expect(r.reason).toMatch(/oltre il massimo/);
  });

  it("rifiuta durata zero", () => {
    const r = validateRoutePlausibility(AERIAL, { ...valid, durationMin: 0 });
    expect(r.plausible).toBe(false);
    expect(r.reason).toMatch(/durata/);
  });

  it("rifiuta velocità media implausibile", () => {
    // 52km in 5min → ~624 km/h
    const r = validateRoutePlausibility(AERIAL, { ...valid, durationMin: 5 });
    expect(r.plausible).toBe(false);
    expect(r.reason).toMatch(/velocità/);
  });
});

// ── route-plausibility: geocoding ────────────────────────────────────────────
describe("geocoding plausibility", () => {
  const romaBody = { features: [{ geometry: { coordinates: [12.4964, 41.9028] }, properties: { name: "Roma" } }] };
  const expected = { lat: 41.9028, lon: 12.4964, tolKm: 80 };

  it("misura correttamente la prima feature", () => {
    const m = measurePhotonResponse(romaBody);
    expect(m.featureCount).toBe(1);
    expect(m.firstLat).toBeCloseTo(41.9028);
    expect(m.firstLon).toBeCloseTo(12.4964);
  });

  it("accetta un geocoding corretto entro tolleranza", () => {
    const r = validateGeocodePlausibility(measurePhotonResponse(romaBody), { expected, distanceKm: haversineKm });
    expect(r.plausible).toBe(true);
  });

  it("rifiuta features vuote (200 ma geocoding vuoto)", () => {
    const r = validateGeocodePlausibility(measurePhotonResponse({ features: [] }));
    expect(r.plausible).toBe(false);
    expect(r.reason).toMatch(/nessun risultato/);
  });

  it("rifiuta un risultato lontano dal punto atteso (geocoding sbagliato ma OK)", () => {
    const berlino = { features: [{ geometry: { coordinates: [13.405, 52.52] }, properties: { name: "Berlin" } }] };
    const r = validateGeocodePlausibility(measurePhotonResponse(berlino), { expected, distanceKm: haversineKm });
    expect(r.plausible).toBe(false);
    expect(r.reason).toMatch(/dal punto atteso/);
  });

  // ── Calibrazione Task #34: ranking riordinato non deve essere un falso positivo ──
  it("accetta il risultato corretto anche se NON è il primo (ranking riordinato)", () => {
    // Simula un Photon che, per un aggiornamento indice/bias viewbox, restituisce
    // prima un omonimo minore e SOLO al secondo posto la Roma attesa: servizio
    // comunque sano, non deve produrre una KO.
    const reordered = {
      features: [
        { geometry: { coordinates: [-84.2, 33.58] }, properties: { name: "Rome" } }, // Rome, Georgia (USA)
        { geometry: { coordinates: [12.4964, 41.9028] }, properties: { name: "Roma" } },
      ],
    };
    const r = validateGeocodePlausibility(measurePhotonResponse(reordered), { expected, distanceKm: haversineKm });
    expect(r.plausible).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("rifiuta comunque se NESSUNO dei primi risultati è vicino al punto atteso", () => {
    const allWrong = {
      features: [
        { geometry: { coordinates: [-84.2, 33.58] }, properties: { name: "Rome" } },
        { geometry: { coordinates: [13.405, 52.52] }, properties: { name: "Berlin" } },
      ],
    };
    const r = validateGeocodePlausibility(measurePhotonResponse(allWrong), { expected, distanceKm: haversineKm });
    expect(r.plausible).toBe(false);
    expect(r.reason).toMatch(/nessuno dei primi/);
  });

  it("measurePhotonResponse espone i candidati fino a topN in ordine di ranking", () => {
    const reordered = {
      features: [
        { geometry: { coordinates: [-84.2, 33.58] }, properties: { name: "Rome" } },
        { geometry: { coordinates: [12.4964, 41.9028] }, properties: { name: "Roma" } },
      ],
    };
    const m = measurePhotonResponse(reordered, 5);
    expect(m.candidates).toHaveLength(2);
    expect(m.candidates[1].name).toBe("Roma");
    // firstLat/firstLon restano quelli del PRIMO risultato (retro-compatibilità).
    expect(m.firstName).toBe("Rome");
  });
});

// ── pipeline combinata ───────────────────────────────────────────────────────
function probe(engine: CorrectnessProbeResult["engine"], over: Partial<CorrectnessProbeResult>): CorrectnessProbeResult {
  return {
    engine, configured: true, reachable: true, plausible: true, ok: true, skipped: false,
    latencyMs: 100, distanceKm: 52, durationMin: 50, reason: null, severity: "info", ...over,
  };
}
const noCounters = { windowMs: 0, successes: 0, fallbacks: 0, failures: 0, byEngine: {}, enginesDown: {} } as never;
const noPipeline = { windowMs: 0, total: 0, ok: 0, fallback: 0, error: 0, fallbackRate: 0, byEngineUsed: {} } as never;

describe("derivePipelineCorrectness", () => {
  it("entrambi i motori corretti → pipeline ok", () => {
    const r = derivePipelineCorrectness(probe("graphhopper", {}), probe("valhalla", {}), noCounters, noPipeline);
    expect(r.ok).toBe(true);
    expect(r.severity).toBe("info");
  });

  it("Valhalla giù ma GraphHopper su → fallback funzionale (warn)", () => {
    const r = derivePipelineCorrectness(
      probe("graphhopper", {}),
      probe("valhalla", { ok: false, plausible: false, severity: "high" }),
      noCounters, noPipeline,
    );
    expect(r.ok).toBe(true);
    expect(r.severity).toBe("warn");
    expect(r.reason).toMatch(/fallback GraphHopper/);
  });

  it("entrambi i motori giù → pipeline critica", () => {
    const r = derivePipelineCorrectness(
      probe("graphhopper", { ok: false, plausible: false }),
      probe("valhalla", { ok: false, plausible: false }),
      noCounters, noPipeline,
    );
    expect(r.ok).toBe(false);
    expect(r.severity).toBe("critical");
  });

  it("nessun motore configurato → info, non allarme", () => {
    const r = derivePipelineCorrectness(
      probe("graphhopper", { configured: false, ok: false }),
      probe("valhalla", { configured: false, ok: false }),
      noCounters, noPipeline,
    );
    expect(r.severity).toBe("info");
    expect(r.configured).toBe(false);
  });

  it("TC spento (probe skipped) → skipped, non allarme", () => {
    const r = derivePipelineCorrectness(
      probe("graphhopper", { skipped: true, ok: false }),
      probe("valhalla", { skipped: true, ok: false }),
      noCounters, noPipeline,
    );
    expect(r.skipped).toBe(true);
    expect(r.severity).toBe("info");
  });

  it("motori sondati OK ma alto tasso di errore reale → high", () => {
    const counters = { windowMs: 0, successes: 5, fallbacks: 0, failures: 10, byEngine: {}, enginesDown: {} } as never;
    const r = derivePipelineCorrectness(probe("graphhopper", {}), probe("valhalla", {}), counters, noPipeline);
    expect(r.ok).toBe(false);
    expect(r.severity).toBe("high");
    expect(r.reason).toMatch(/tasso di errore reale/);
  });
});

// ── gate di priorità AI di routing ───────────────────────────────────────────
describe("ai-priority-gate", () => {
  beforeEach(() => _resetRoutingAiPriorityForTests());

  it("è occupato mentre una chiamata di routing è in volo", async () => {
    expect(isRoutingAiBusy()).toBe(false);
    let busyDuring = false;
    await withRoutingAiPriority(async () => {
      busyDuring = isRoutingAiBusy();
    });
    expect(busyDuring).toBe(true);
  });

  it("resta occupato nella finestra di grazia poi si libera", async () => {
    await withRoutingAiPriority(async () => {});
    const stats = getRoutingAiPriorityStats();
    const at = new Date(stats.lastActiveAt!).getTime();
    expect(isRoutingAiBusy(at + 1000)).toBe(true);   // entro i 2s di grazia
    expect(isRoutingAiBusy(at + 2500)).toBe(false);  // oltre la grazia
    expect(stats.totalRoutingCalls).toBe(1);
  });

  it("conta le chiamate concorrenti", async () => {
    let peakActive = 0;
    await Promise.all([
      withRoutingAiPriority(async () => { peakActive = Math.max(peakActive, getRoutingAiPriorityStats().active); }),
      withRoutingAiPriority(async () => { peakActive = Math.max(peakActive, getRoutingAiPriorityStats().active); }),
    ]);
    expect(peakActive).toBeGreaterThanOrEqual(1);
  });
});

// ── namespace "horus" nei problemi ───────────────────────────────────────────
describe("deriveProblems — namespace horus", () => {
  it("assegna id/source horus.* e titoli dedicati alle sonde di correttezza", () => {
    const signals: Signal[] = [
      { source: "horus", metric: "routing.graphhopper.correct", severity: "high", details: { reason: "distanza incoerente" } },
      { source: "horus", metric: "geocoding.photon.correct", severity: "high", details: { reason: "geocoding vuoto" } },
      { source: "horus", metric: "pipeline.correct", severity: "critical", details: { reason: "nessun motore corretto" } },
    ];
    const problems = deriveProblems(signals);
    expect(problems).toHaveLength(3);
    for (const p of problems) {
      expect(p.source).toBe("horus");
      expect(p.id.startsWith("horus.")).toBe(true);
    }
    expect(problems.find((p) => p.id === "horus.routing.graphhopper.correct")?.title).toMatch(/graphhopper.*correttezza KO/i);
    expect(problems.find((p) => p.id === "horus.pipeline.correct")?.title).toMatch(/Pipeline routing/);
  });

  it("il namespace horus è isolabile con un filtro startsWith (per il proposer #25)", () => {
    const problems = deriveProblems([
      { source: "horus", metric: "routing.valhalla.correct", severity: "high", details: {} },
      { source: "maps", metric: "routing.fallback_rate", value: 0.6, severity: "critical", details: {} },
    ]);
    const horusOnly = problems.filter((p) => p.source === "horus");
    const nonHorus = problems.filter((p) => p.source !== "horus");
    expect(horusOnly).toHaveLength(1);
    expect(nonHorus).toHaveLength(1);
  });
});
