/**
 * Contratto /calculate con segmentIntents.
 *
 * Gli intenti devono trasformare un giro in richieste indipendenti per ogni
 * tratta, senza cambiare il contratto di risposta già usato dal client.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  getActiveRouter: vi.fn(),
  resolveRouterOpts: vi.fn(),
}));

vi.mock("../routing/router-selector", () => ({
  getActiveRouter: mocks.getActiveRouter,
  CrossGroupRoutingError: class CrossGroupRoutingError extends Error {},
  AreaNotEnabledError: class AreaNotEnabledError extends Error {},
}));

vi.mock("../routes/planned-routes/waypoints.next", () => ({
  resolveRouterOpts: mocks.resolveRouterOpts,
  generateRouteObject: vi.fn(),
  streamRouteText: vi.fn(),
  poiExtraRouter: express.Router(),
}));

import waypointsRouter from "../routes/planned-routes/waypoints";

const USER_ID = "segment-intent-user";

function buildApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: { userId: USER_ID } });
    next();
  });
  app.use("/api/planned-routes", waypointsRouter);
  return app;
}

function makePath(coordinates: number[][], distance: number, time: number) {
  return {
    points: { coordinates },
    points_encoded: false,
    distance,
    time,
    instructions: [{ text: "Prosegui", distance, time, interval: [0, 1] as [number, number] }],
    details: { osm_way_id: [[0, 1, distance]] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveRouterOpts.mockResolvedValue({ rollout: "all", engine: "graphhopper", isMapTester: false });
});

describe("/calculate — intenti per sezione", () => {
  it("calcola ogni tratta con l'intento risolto e restituisce un solo percorso continuo", async () => {
    mocks.getActiveRouter
      .mockResolvedValueOnce({ paths: [makePath([[9, 45], [9.1, 45.1]], 10_000, 600_000)] })
      .mockResolvedValueOnce({ paths: [makePath([[9.1, 45.1], [9.2, 45.2]], 20_000, 1_200_000)] });

    const response = await request(buildApp())
      .post("/api/planned-routes/calculate")
      .send({
        waypoints: [
          { lat: 45, lng: 9 },
          { lat: 45.1, lng: 9.1 },
          { lat: 45.2, lng: 9.2 },
        ],
        style: "balanced",
        drivingProfile: "geometric",
        segmentIntents: [
          { kind: "transfer" },
          { kind: "guided", avoidUnpaved: true },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.distanceKm).toBe(30);
    expect(response.body.durationMinutes).toBe(30);
    expect(response.body.encoded.coordinates).toEqual([[9, 45], [9.1, 45.1], [9.2, 45.2]]);
    expect(response.body.instructions).toHaveLength(2);
    expect(response.body.instructions[1].interval).toEqual([1, 2]);
    expect(response.body.segmentResults).toEqual([
      expect.objectContaining({ index: 0, intent: expect.objectContaining({ kind: "transfer", style: "fast" }) }),
      expect.objectContaining({ index: 1, intent: expect.objectContaining({ kind: "guided", style: "curvy", avoidUnpaved: true }) }),
    ]);

    expect(mocks.getActiveRouter).toHaveBeenCalledTimes(2);
    expect(mocks.getActiveRouter.mock.calls[0][0].points).toEqual([[9, 45], [9.1, 45.1]]);
    expect(mocks.getActiveRouter.mock.calls[1][0].points).toEqual([[9.1, 45.1], [9.2, 45.2]]);
  });

  it("rifiuta un numero di intenti diverso dal numero di tratte", async () => {
    const response = await request(buildApp())
      .post("/api/planned-routes/calculate")
      .send({
        waypoints: [{ lat: 45, lng: 9 }, { lat: 45.1, lng: 9.1 }],
        segmentIntents: [{ kind: "guided" }, { kind: "transfer" }],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("intento per ogni tratto");
    expect(mocks.getActiveRouter).not.toHaveBeenCalled();
  });
});
