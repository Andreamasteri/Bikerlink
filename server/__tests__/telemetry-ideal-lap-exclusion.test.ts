import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

vi.mock("../db", () => ({
  db: {
    execute: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn() })),
  },
  pool: { query: vi.fn(), connect: vi.fn() },
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

describe("GET /api/telemetry/stats — km_collected includes ideal_lap, speed filter applied", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it("progress_pct stays 0 when DB returns 0 km (no movement at speed >= 20 km/h)", async () => {
    const dbExecute = vi.mocked(db.execute);
    dbExecute
      .mockResolvedValueOnce({ rows: [{ sample_count: "0", session_count: "0" }] } as unknown as Awaited<ReturnType<typeof db.execute>>)
      .mockResolvedValueOnce({ rows: [{ km_collected: "0" }] } as unknown as Awaited<ReturnType<typeof db.execute>>)
      .mockResolvedValueOnce({ rows: [{ track_km: "0" }] } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const res = await request(app).get("/api/telemetry/stats");

    expect(res.status).toBe(200);
    expect(res.body.km_collected).toBe(0);
    expect(res.body.session_count).toBe(0);
    expect(res.body.progress_pct).toBe(0);
    expect(res.body.track_km).toBe(0);
  });

  it("km_collected includes ride sessions (sample_count/session_count still exclude ideal_lap)", async () => {
    const dbExecute = vi.mocked(db.execute);
    dbExecute
      .mockResolvedValueOnce({ rows: [{ sample_count: "200", session_count: "3" }] } as unknown as Awaited<ReturnType<typeof db.execute>>)
      .mockResolvedValueOnce({ rows: [{ km_collected: "150.5" }] } as unknown as Awaited<ReturnType<typeof db.execute>>)
      .mockResolvedValueOnce({ rows: [{ track_km: "0" }] } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const res = await request(app).get("/api/telemetry/stats");

    expect(res.status).toBe(200);
    expect(res.body.session_count).toBe(3);
    expect(res.body.km_collected).toBe(150.5);
    expect(res.body.progress_pct).toBe(15);
    expect(res.body.target_km).toBe(1000);
    expect(res.body.track_km).toBe(0);
  });

  it("km_collected reflects ideal_lap km — DB returns combined total (ride + ideal_lap)", async () => {
    const dbExecute = vi.mocked(db.execute);
    dbExecute
      .mockResolvedValueOnce({ rows: [{ sample_count: "300", session_count: "3" }] } as unknown as Awaited<ReturnType<typeof db.execute>>)
      .mockResolvedValueOnce({ rows: [{ km_collected: "18.5" }] } as unknown as Awaited<ReturnType<typeof db.execute>>)
      .mockResolvedValueOnce({ rows: [{ track_km: "8.5" }] } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const res = await request(app).get("/api/telemetry/stats");

    expect(res.status).toBe(200);
    expect(res.body.km_collected).toBe(18.5);
    expect(res.body.track_km).toBe(8.5);
    expect(res.body.progress_pct).toBe(2);
  });

  it("adding more km increases progress_pct correctly", async () => {
    const dbExecute = vi.mocked(db.execute);
    dbExecute
      .mockResolvedValueOnce({ rows: [{ sample_count: "500", session_count: "5" }] } as unknown as Awaited<ReturnType<typeof db.execute>>)
      .mockResolvedValueOnce({ rows: [{ km_collected: "300" }] } as unknown as Awaited<ReturnType<typeof db.execute>>)
      .mockResolvedValueOnce({ rows: [{ track_km: "0" }] } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const res = await request(app).get("/api/telemetry/stats");

    expect(res.status).toBe(200);
    expect(res.body.progress_pct).toBe(30);
    expect(res.body.km_collected).toBe(300);
    expect(res.body.track_km).toBe(0);
  });

  it("track_km is populated from ideal_lap sessions only", async () => {
    const dbExecute = vi.mocked(db.execute);
    dbExecute
      .mockResolvedValueOnce({ rows: [{ sample_count: "300", session_count: "4" }] } as unknown as Awaited<ReturnType<typeof db.execute>>)
      .mockResolvedValueOnce({ rows: [{ km_collected: "200" }] } as unknown as Awaited<ReturnType<typeof db.execute>>)
      .mockResolvedValueOnce({ rows: [{ track_km: "12.5" }] } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const res = await request(app).get("/api/telemetry/stats");

    expect(res.status).toBe(200);
    expect(res.body.km_collected).toBe(200);
    expect(res.body.track_km).toBe(12.5);
    expect(res.body.progress_pct).toBe(20);
  });
});
