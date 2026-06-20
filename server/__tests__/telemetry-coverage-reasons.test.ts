/**
 * Test suite — Stati di copertura telemetrica del routing (Task #4608)
 *
 * Copre OGNI `reason` di `TelemetryCoverage` prodotto da
 * `buildTelemetryWeightsForRoute`, più la derivazione `engine_unsupported`
 * applicata dal route handler quando il motore rifiuta lo strato telemetrico.
 *
 * Per ogni ramo si verifica:
 *  - il `reason` strutturato corretto;
 *  - le metriche (coveredSegments / requiredSegments / routeSegments,
 *    userKm / targetKm);
 *  - il mantenimento del fallback geometrico (priority vuota + applied=false +
 *    warning="insufficient_data") nei casi di cold-start.
 *
 * Mock: db (db.execute), curvy-score-job (getCurvyScoreWeights, getUserStyleProfile),
 *       storage (getAppSetting). Reale: tutta la logica di route-weights.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Stable mock refs (hoisted prima di vi.mock)
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  dbExecute: vi.fn(),
  getCurvyScoreWeights: vi.fn(),
  getUserStyleProfile: vi.fn(),
  getAppSetting: vi.fn(),
}));

vi.mock("../db", () => ({
  db: { execute: mocks.dbExecute },
}));

vi.mock("../curvy-score-job", () => ({
  getCurvyScoreWeights: mocks.getCurvyScoreWeights,
  getUserStyleProfile: mocks.getUserStyleProfile,
}));

vi.mock("../storage", () => ({
  storage: { getAppSetting: mocks.getAppSetting },
}));

// ---------------------------------------------------------------------------
// Imports (dopo i mock)
// ---------------------------------------------------------------------------
import {
  buildTelemetryWeightsForRoute,
  type TelemetryCoverage,
} from "../routing/route-weights";

const MIN_SAMPLES = 5;
const USER_ID = "user-1";

/** Costruisce N osm_way_id univoci e plausibili per il percorso. */
function wayIds(n: number): number[] {
  return Array.from({ length: n }, (_, i) => 1000 + i);
}

/** Righe segment_telemetry come restituite da db.execute (text-cast). */
function telemetryRows(scores: number[]): { rows: { osm_way_id: string; curvy_score: string }[] } {
  return {
    rows: scores.map((s, i) => ({ osm_way_id: String(1000 + i), curvy_score: String(s) })),
  };
}

/** Asserisce il mantenimento del fallback geometrico nel cold-start. */
function expectGeometricFallback(r: { priority: unknown[]; applied: boolean; warning: string | null }) {
  expect(r.applied).toBe(false);
  expect(r.priority).toEqual([]);
  expect(r.warning).toBe("insufficient_data");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurvyScoreWeights.mockReturnValue({
    weightLean: 0.65,
    weightGforce: 0.35,
    minSamples: MIN_SAMPLES,
  });
});

// ---------------------------------------------------------------------------
// not_applicable — profilo geometrico (telemetria non richiesta)
// ---------------------------------------------------------------------------
describe("reason=not_applicable (profilo geometrico)", () => {
  it("ritorna coverage neutra senza toccare DB/profilo/setting", async () => {
    const r = await buildTelemetryWeightsForRoute("geometric", USER_ID, wayIds(20));

    expect(r.applied).toBe(false);
    expect(r.priority).toEqual([]);
    expect(r.warning).toBeNull();
    const c: TelemetryCoverage = r.coverage;
    expect(c.reason).toBe("not_applicable");
    expect(c).toMatchObject({
      coveredSegments: 0,
      requiredSegments: 0,
      routeSegments: 0,
      userKm: null,
      targetKm: null,
    });
    expect(mocks.dbExecute).not.toHaveBeenCalled();
    expect(mocks.getUserStyleProfile).not.toHaveBeenCalled();
    expect(mocks.getAppSetting).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// no_community_data — nessun curvy_score qualificato in tutta la community
// ---------------------------------------------------------------------------
describe("reason=no_community_data", () => {
  it("0 righe sulla rotta E nessun dato community → no_community_data + fallback geometrico", async () => {
    // 1ª query (segmenti rotta): vuota. 2ª query (communityDataExists): vuota.
    mocks.dbExecute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const r = await buildTelemetryWeightsForRoute("real", USER_ID, wayIds(20));

    expectGeometricFallback(r);
    const c = r.coverage;
    expect(c.reason).toBe("no_community_data");
    expect(c.coveredSegments).toBe(0);
    expect(c.routeSegments).toBe(20);
    // required = max(2, ceil(20 * 0.05)) = 2
    expect(c.requiredSegments).toBe(2);
    expect(c.userKm).toBeNull();
    expect(c.targetKm).toBeNull();
    expect(mocks.dbExecute).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// route_coverage_insufficient — dati esistono, ma non bastano su QUESTA rotta
// ---------------------------------------------------------------------------
describe("reason=route_coverage_insufficient", () => {
  it("0 righe sulla rotta MA community ha dati → route_coverage_insufficient", async () => {
    mocks.dbExecute
      .mockResolvedValueOnce({ rows: [] }) // nessun segmento della rotta coperto
      .mockResolvedValueOnce({ rows: [{ one: 1 }] }); // community ha dati altrove

    const r = await buildTelemetryWeightsForRoute("real", USER_ID, wayIds(20));

    expectGeometricFallback(r);
    expect(r.coverage.reason).toBe("route_coverage_insufficient");
    expect(r.coverage.coveredSegments).toBe(0);
    expect(r.coverage.routeSegments).toBe(20);
    expect(r.coverage.requiredSegments).toBe(2);
    expect(mocks.dbExecute).toHaveBeenCalledTimes(2);
  });

  it("righe presenti ma sotto la soglia richiesta → route_coverage_insufficient (no check community)", async () => {
    // 1 sola riga coperta, required=2 → insufficiente. rows>0 ⇒ NON interroga community.
    mocks.dbExecute.mockResolvedValueOnce(telemetryRows([70]));

    const r = await buildTelemetryWeightsForRoute("real", USER_ID, wayIds(20));

    expectGeometricFallback(r);
    expect(r.coverage.reason).toBe("route_coverage_insufficient");
    expect(r.coverage.coveredSegments).toBe(1);
    expect(r.coverage.requiredSegments).toBe(2);
    expect(r.coverage.routeSegments).toBe(20);
    expect(mocks.dbExecute).toHaveBeenCalledTimes(1);
  });

  it("nessun segmento nel percorso (routeWayIds vuoto) → route_coverage_insufficient senza query DB", async () => {
    const r = await buildTelemetryWeightsForRoute("real", USER_ID, []);

    expectGeometricFallback(r);
    expect(r.coverage.reason).toBe("route_coverage_insufficient");
    expect(r.coverage.routeSegments).toBe(0);
    expect(r.coverage.coveredSegments).toBe(0);
    // required = max(2, ceil(0 * 0.05)) = 2
    expect(r.coverage.requiredSegments).toBe(2);
    expect(mocks.dbExecute).not.toHaveBeenCalled();
  });

  it("errore lettura segment_telemetry → fallback geometrico con route_coverage_insufficient", async () => {
    mocks.dbExecute.mockRejectedValueOnce(new Error("DB connection refused"));

    const r = await buildTelemetryWeightsForRoute("real", USER_ID, wayIds(20));

    expectGeometricFallback(r);
    expect(r.coverage.reason).toBe("route_coverage_insufficient");
    expect(r.coverage.routeSegments).toBe(20);
    expect(r.coverage.coveredSegments).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// user_km_below_target — (my_style) l'utente non ha ancora i km richiesti
// ---------------------------------------------------------------------------
describe("reason=user_km_below_target (my_style)", () => {
  it("km utente sotto il target → user_km_below_target con progresso km, senza query segmenti", async () => {
    mocks.getUserStyleProfile.mockResolvedValueOnce({ totalKm: 120, avgLeanAngle: 28 });
    mocks.getAppSetting.mockResolvedValueOnce({ value: "400" });

    const r = await buildTelemetryWeightsForRoute("my_style", USER_ID, wayIds(20));

    expectGeometricFallback(r);
    const c = r.coverage;
    expect(c.reason).toBe("user_km_below_target");
    expect(c.userKm).toBe(120);
    expect(c.targetKm).toBe(400);
    expect(c.coveredSegments).toBe(0);
    expect(c.requiredSegments).toBe(2);
    expect(c.routeSegments).toBe(20);
    // Esce prima di interrogare segment_telemetry.
    expect(mocks.dbExecute).not.toHaveBeenCalled();
  });

  it("km raggiunti ma avgLeanAngle assente → comunque user_km_below_target", async () => {
    mocks.getUserStyleProfile.mockResolvedValueOnce({ totalKm: 900, avgLeanAngle: null });
    mocks.getAppSetting.mockResolvedValueOnce({ value: "400" });

    const r = await buildTelemetryWeightsForRoute("my_style", USER_ID, wayIds(10));

    expectGeometricFallback(r);
    expect(r.coverage.reason).toBe("user_km_below_target");
    expect(r.coverage.userKm).toBe(900);
    expect(r.coverage.targetKm).toBe(400);
    expect(mocks.dbExecute).not.toHaveBeenCalled();
  });

  it("profilo utente assente → userKm=0 e fallback user_km_below_target", async () => {
    mocks.getUserStyleProfile.mockResolvedValueOnce(null);
    mocks.getAppSetting.mockResolvedValueOnce(undefined); // default target 400

    const r = await buildTelemetryWeightsForRoute("my_style", USER_ID, wayIds(5));

    expectGeometricFallback(r);
    expect(r.coverage.reason).toBe("user_km_below_target");
    expect(r.coverage.userKm).toBe(0);
    expect(r.coverage.targetKm).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// applied — strato telemetrico effettivamente applicato
// ---------------------------------------------------------------------------
describe("reason=applied (strato telemetrico attivo)", () => {
  it("real: copertura sufficiente → applied con priority per-segmento e metriche", async () => {
    mocks.dbExecute.mockResolvedValueOnce(telemetryRows([90, 60, 45]));

    const r = await buildTelemetryWeightsForRoute("real", USER_ID, wayIds(20));

    expect(r.applied).toBe(true);
    expect(r.warning).toBeNull();
    expect(r.priority).toHaveLength(3);
    // Ogni regola è un boost su osm_way_id specifico.
    for (const rule of r.priority) {
      expect(rule.if).toMatch(/^osm_way_id == \d+$/);
      expect(rule.multiply_by).toBeGreaterThanOrEqual(1.2);
      expect(rule.multiply_by).toBeLessThanOrEqual(2.5);
    }
    const c = r.coverage;
    expect(c.reason).toBe("applied");
    expect(c.coveredSegments).toBe(3);
    expect(c.requiredSegments).toBe(2);
    expect(c.routeSegments).toBe(20);
    expect(c.userKm).toBeNull();
    expect(c.targetKm).toBeNull();
  });

  it("my_style: km raggiunti + lean valido → applied con userKm/targetKm popolati", async () => {
    mocks.getUserStyleProfile.mockResolvedValueOnce({ totalKm: 600, avgLeanAngle: 35 });
    mocks.getAppSetting.mockResolvedValueOnce({ value: "400" });
    mocks.dbExecute.mockResolvedValueOnce(telemetryRows([80, 55]));

    const r = await buildTelemetryWeightsForRoute("my_style", USER_ID, wayIds(20));

    expect(r.applied).toBe(true);
    expect(r.warning).toBeNull();
    const c = r.coverage;
    expect(c.reason).toBe("applied");
    expect(c.coveredSegments).toBe(2);
    expect(c.requiredSegments).toBe(2);
    expect(c.routeSegments).toBe(20);
    expect(c.userKm).toBe(600);
    expect(c.targetKm).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// engine_unsupported — derivazione del route handler (waypoints.ts)
// ---------------------------------------------------------------------------
//
// Quando lo strato telemetrico è `applied` ma il motore di routing rifiuta le
// regole su osm_way_id, il handler mantiene il percorso geometrico e marca il
// coverage come `engine_unsupported` PRESERVANDO le metriche. Replichiamo qui
// quella trasformazione (server/routes/planned-routes/waypoints.ts) per
// blindarne il contratto: una regressione sulle metriche o sul reason romperebbe
// il surfacing del cold-start lato client.
describe("reason=engine_unsupported (derivato dal route handler)", () => {
  it("preserva le metriche dello strato applied ma cambia reason in engine_unsupported", async () => {
    mocks.dbExecute.mockResolvedValueOnce(telemetryRows([90, 60, 45]));
    const applied = await buildTelemetryWeightsForRoute("real", USER_ID, wayIds(20));
    expect(applied.coverage.reason).toBe("applied");

    // Trasformazione identica a waypoints.ts nel ramo catch del telemetry layer.
    const downgraded: TelemetryCoverage = { ...applied.coverage, reason: "engine_unsupported" };

    expect(downgraded.reason).toBe("engine_unsupported");
    expect(downgraded.coveredSegments).toBe(applied.coverage.coveredSegments);
    expect(downgraded.requiredSegments).toBe(applied.coverage.requiredSegments);
    expect(downgraded.routeSegments).toBe(applied.coverage.routeSegments);
    expect(downgraded.userKm).toBe(applied.coverage.userKm);
    expect(downgraded.targetKm).toBe(applied.coverage.targetKm);
  });
});
