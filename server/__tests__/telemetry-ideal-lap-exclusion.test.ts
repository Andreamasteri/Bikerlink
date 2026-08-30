import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

vi.mock("../db", () => ({
  db: {
    execute: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn() })),
  },
  pool: { query: vi.fn(), connect: vi.fn() },
  // withDbRetry non era nel mock originale: le chiamate reali del route
  // ("../routes/telemetry" usa withDbRetry(() => db.execute(...))) restituivano
  // undefined() → 500 in ogni test, mascherando qualunque regressione reale
  // (task #65 — mock DB stantii che nascondono bug veri).
  withDbRetry: (fn: () => unknown) => fn(),
}));

import { db } from "../db";
import telemetryRouter from "../routes/telemetry";

const USER_ID = "test-user-ideal-lap";

function buildApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: { userId: USER_ID } });
    next();
  });
  app.use("/api/telemetry", telemetryRouter);
  return app;
}

// Task #81 — GET /stats ora legge i totali pre-calcolati da
// `telemetry_session_stats` con UNA sola aggregazione (SUM/COUNT), non più le
// due query (counts + Haversine window function) su ride_telemetry. Ogni mock
// restituisce quindi la singola riga aggregata attesa dall'endpoint.
describe("GET /api/telemetry/stats — Giro Ideale separato dal contatore generale", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it("progress_pct stays 0 when there is no precomputed distance", async () => {
    const dbExecute = vi.mocked(db.execute);
    dbExecute.mockResolvedValueOnce({
      rows: [{ km_collected: "0", track_km: "0", ideal_lap_km: "0", sample_count: "0", session_count: "0", sensor_only_count: "0" }],
    } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const res = await request(app).get("/api/telemetry/stats");

    expect(res.status).toBe(200);
    expect(dbExecute).toHaveBeenCalledTimes(1);
    expect(res.body.km_collected).toBe(0);
    expect(res.body.session_count).toBe(0);
    expect(res.body.progress_pct).toBe(0);
    expect(res.body.track_km).toBe(0);
    expect(res.body.ideal_lap_km).toBe(0);
  });

  it("km_collected includes ride sessions (sample_count/session_count still exclude ideal_lap)", async () => {
    const dbExecute = vi.mocked(db.execute);
    dbExecute.mockResolvedValueOnce({
      rows: [{ km_collected: "150.5", track_km: "0", ideal_lap_km: "0", sample_count: "200", session_count: "3", sensor_only_count: "0" }],
    } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const res = await request(app).get("/api/telemetry/stats");

    expect(res.status).toBe(200);
    expect(res.body.session_count).toBe(3);
    expect(res.body.km_collected).toBe(150.5);
    expect(res.body.progress_pct).toBe(15);
    expect(res.body.target_km).toBe(1000);
    expect(res.body.track_km).toBe(0);
  });

  it("Giro Ideale espone i propri km senza creare km generali", async () => {
    const dbExecute = vi.mocked(db.execute);
    dbExecute.mockResolvedValueOnce({
      rows: [{ km_collected: "12.3", track_km: "8.5", ideal_lap_km: "8.5", sample_count: "300", session_count: "3", sensor_only_count: "0" }],
    } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const res = await request(app).get("/api/telemetry/stats");

    expect(res.status).toBe(200);
    expect(res.body.km_collected).toBe(12.3);
    expect(res.body.track_km).toBe(8.5);
    expect(res.body.ideal_lap_km).toBe(8.5);
    expect(res.body.progress_pct).toBe(1);
  });

  it("adding more km increases progress_pct correctly", async () => {
    const dbExecute = vi.mocked(db.execute);
    dbExecute.mockResolvedValueOnce({
      rows: [{ km_collected: "300", track_km: "0", ideal_lap_km: "0", sample_count: "500", session_count: "5", sensor_only_count: "0" }],
    } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const res = await request(app).get("/api/telemetry/stats");

    expect(res.status).toBe(200);
    expect(res.body.progress_pct).toBe(30);
    expect(res.body.km_collected).toBe(300);
    expect(res.body.track_km).toBe(0);
  });

  it("ideal_lap_km retains the unfiltered lap distance", async () => {
    const dbExecute = vi.mocked(db.execute);
    dbExecute.mockResolvedValueOnce({
      rows: [{ km_collected: "202.5", track_km: "12.5", ideal_lap_km: "12.5", sample_count: "300", session_count: "4", sensor_only_count: "0" }],
    } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const res = await request(app).get("/api/telemetry/stats");

    expect(res.status).toBe(200);
    expect(res.body.km_collected).toBe(202.5);
    expect(res.body.track_km).toBe(12.5);
    expect(res.body.ideal_lap_km).toBe(12.5);
    expect(res.body.progress_pct).toBe(20);
  });

  it("reads precomputed totals with a single aggregation query (no Haversine scan)", async () => {
    const dbExecute = vi.mocked(db.execute);
    dbExecute.mockResolvedValueOnce({
      rows: [{ km_collected: "5", track_km: "0", ideal_lap_km: "0", sample_count: "10", session_count: "1", sensor_only_count: "2" }],
    } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const res = await request(app).get("/api/telemetry/stats");
    expect(res.status).toBe(200);
    expect(res.body.km_collected).toBe(5);
    expect(res.body.sensor_only_count).toBe(2);
    // Una sola query DB: i totali sono già pre-calcolati per sessione.
    expect(dbExecute).toHaveBeenCalledTimes(1);
  });
});
