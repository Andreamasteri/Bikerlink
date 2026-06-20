/**
 * Test di integrazione — fallback telemetrico end-to-end nel handler /calculate
 * (Task #4611)
 *
 * Esercita il VERO ramo catch dello strato telemetrico in
 * `server/routes/planned-routes/waypoints.ts`: quando `buildTelemetryWeightsForRoute`
 * restituisce `applied=true` ma il motore di routing rifiuta le regole su
 * `osm_way_id` (seconda chiamata a `getActiveRouter` che lancia), il handler DEVE:
 *   - mantenere il percorso geometrico di base (prima chiamata, custom_model senza telemetria);
 *   - impostare `warning="insufficient_data"`;
 *   - degradare `telemetryCoverage.reason` a `"engine_unsupported"` PRESERVANDO le metriche.
 *
 * A differenza di telemetry-coverage-reasons.test.ts (che blinda la sola
 * trasformazione del coverage), qui montiamo il router Express e verifichiamo
 * che il contratto arrivi davvero nella risposta JSON.
 *
 * Mock: router-selector (getActiveRouter), waypoints.next (resolveRouterOpts),
 *       route-weights (solo buildTelemetryWeightsForRoute; il resto è reale).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Stable mock refs (hoisted prima di vi.mock)
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  getActiveRouter: vi.fn(),
  resolveRouterOpts: vi.fn(),
  buildTelemetryWeightsForRoute: vi.fn(),
}));

// router-selector: il handler importa anche le classi d'errore per gli
// instanceof; le forniamo come stub così l'import resta valido.
vi.mock("../routing/router-selector", () => ({
  getActiveRouter: mocks.getActiveRouter,
  CrossGroupRoutingError: class CrossGroupRoutingError extends Error {},
  AreaNotEnabledError: class AreaNotEnabledError extends Error {},
}));

// waypoints.next: resolveRouterOpts (import dinamico nel handler) + gli export
// statici usati da waypoints.ts/planned-routes.ts.
vi.mock("../routes/planned-routes/waypoints.next", () => ({
  resolveRouterOpts: mocks.resolveRouterOpts,
  generateRouteObject: vi.fn(),
  streamRouteText: vi.fn(),
  poiExtraRouter: express.Router(),
}));

// route-weights: reale tranne buildTelemetryWeightsForRoute, che pilotiamo per
// forzare lo strato telemetrico ad "applied" e innescare il ramo catch.
vi.mock("../routing/route-weights", async () => {
  const actual = await vi.importActual<typeof import("../routing/route-weights")>(
    "../routing/route-weights",
  );
  return { ...actual, buildTelemetryWeightsForRoute: mocks.buildTelemetryWeightsForRoute };
});

// ---------------------------------------------------------------------------
// Import del router dopo i mock
// ---------------------------------------------------------------------------
import waypointsRouter from "../routes/planned-routes/waypoints";

const AUTH_USER_ID = "user-engine-unsupported";

function buildApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: { userId: AUTH_USER_ID } });
    next();
  });
  app.use("/api/planned-routes", waypointsRouter);
  return app;
}

// Percorso geometrico di base restituito dalla 1ª chiamata getActiveRouter.
const BASE_PATH = {
  points: { coordinates: [[9.0, 45.0, 200], [9.1, 45.1, 230]] },
  points_encoded: false,
  distance: 12345, // → distanceKm 12.3
  time: 600000, //    → durationMinutes 10
  instructions: [{ text: "Parti" }],
  details: { osm_way_id: [[0, 1, 1000]] },
};

// Coverage "applied" che il ramo catch deve degradare a engine_unsupported
// preservando ogni metrica.
const APPLIED_COVERAGE = {
  reason: "applied" as const,
  coveredSegments: 3,
  requiredSegments: 2,
  routeSegments: 20,
  userKm: null,
  targetKm: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveRouterOpts.mockResolvedValue({});
  mocks.buildTelemetryWeightsForRoute.mockResolvedValue({
    priority: [{ if: "osm_way_id == 1000", multiply_by: 1.5 }],
    applied: true,
    warning: null,
    coverage: APPLIED_COVERAGE,
  });
});

describe("/calculate — fallback geometrico quando il motore rifiuta lo strato telemetrico", () => {
  it("mantiene il percorso base, warning=insufficient_data e telemetryCoverage.reason=engine_unsupported", async () => {
    // 1ª chiamata (geometrico) ok; 2ª chiamata (boosted con regole osm_way_id) rifiutata.
    mocks.getActiveRouter
      .mockResolvedValueOnce({ paths: [BASE_PATH] })
      .mockRejectedValueOnce(new Error("custom_model priority on osm_way_id not supported by engine"));

    const res = await request(buildApp())
      .post("/api/planned-routes/calculate")
      .send({
        waypoints: [
          { lat: 45.0, lng: 9.0 },
          { lat: 45.1, lng: 9.1 },
        ],
        style: "curvy",
        drivingProfile: "real",
      });

    expect(res.status).toBe(200);

    // Warning strutturato e coverage degradato — ma metriche preservate.
    expect(res.body.warning).toBe("insufficient_data");
    expect(res.body.telemetryCoverage).toMatchObject({
      reason: "engine_unsupported",
      coveredSegments: APPLIED_COVERAGE.coveredSegments,
      requiredSegments: APPLIED_COVERAGE.requiredSegments,
      routeSegments: APPLIED_COVERAGE.routeSegments,
      userKm: APPLIED_COVERAGE.userKm,
      targetKm: APPLIED_COVERAGE.targetKm,
    });

    // Il percorso restituito è quello geometrico di base (non il boosted).
    expect(res.body.distanceKm).toBe(12.3);
    expect(res.body.durationMinutes).toBe(10);
    expect(res.body.instructions).toEqual([{ text: "Parti" }]);
    expect(res.body.encoded).toEqual(BASE_PATH.points);

    // Conferma il doppio dispatch: base + tentativo telemetrico fallito.
    expect(mocks.getActiveRouter).toHaveBeenCalledTimes(2);
    expect(mocks.buildTelemetryWeightsForRoute).toHaveBeenCalledTimes(1);

    // La 2ª chiamata porta DAVVERO le regole telemetriche su osm_way_id.
    const secondCallReq = mocks.getActiveRouter.mock.calls[1][0] as {
      custom_model?: { priority?: Array<{ if: string }> };
    };
    expect(secondCallReq.custom_model?.priority).toEqual(
      expect.arrayContaining([expect.objectContaining({ if: "osm_way_id == 1000" })]),
    );
  });

  it("non degrada il coverage se il motore accetta lo strato telemetrico (sanity)", async () => {
    // Entrambe le chiamate riescono → telemetria applicata, nessun fallback.
    const boostedPath = { ...BASE_PATH, distance: 13000 };
    mocks.getActiveRouter
      .mockResolvedValueOnce({ paths: [BASE_PATH] })
      .mockResolvedValueOnce({ paths: [boostedPath] });

    const res = await request(buildApp())
      .post("/api/planned-routes/calculate")
      .send({
        waypoints: [
          { lat: 45.0, lng: 9.0 },
          { lat: 45.1, lng: 9.1 },
        ],
        style: "curvy",
        drivingProfile: "real",
      });

    expect(res.status).toBe(200);
    expect(res.body.warning).toBeNull();
    expect(res.body.telemetryCoverage.reason).toBe("applied");
    // Adotta il percorso boosted.
    expect(res.body.distanceKm).toBe(13);
  });
});
