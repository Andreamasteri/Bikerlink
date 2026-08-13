/**
 * Test POST /api/telemetry/batch — campioni sensor-only (lat/lon null).
 *
 * Comportamenti blindati:
 * (a) Campione con lat/lon null         → salvato (non scartato)
 * (b) Campione con lat/lon non-finiti   → normalizzati a null e salvati
 * (c) Campione senza ts valido          → scartato; se tutti invalidi → 400
 * (d) Mix: alcuni ts invalidi + altri validi → solo i validi vengono salvati
 * (e) ts valido + lat/lon misti         → i non-finiti diventano null, i finiti restano
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

vi.mock("../db", () => {
  const execute = vi.fn();
  const insert = vi.fn(() => {
    const values = vi.fn((rows: unknown) => ({
      onConflictDoNothing: vi.fn(() => ({
        returning: vi.fn(async () =>
          Array.isArray(rows)
            ? rows.map((row) => ({ ingestKey: (row as { ingestKey?: string }).ingestKey ?? null }))
            : [],
        ),
      })),
    }));
    return { values };
  });
  // POST /batch ora esegue insert + aggiornamento riepilogo in una transazione:
  // la fake tx riusa gli stessi spy così i test sui campioni inseriti continuano
  // a valere e updateTelemetrySessionStats (che chiama tx.execute) non rompe.
  const transaction = vi.fn(async (cb: (t: { execute: typeof execute; insert: typeof insert }) => Promise<unknown>) =>
    cb({ execute, insert }),
  );
  return {
    db: { execute, insert, transaction },
    pool: { query: vi.fn(), connect: vi.fn() },
    withDbRetry: (fn: () => unknown) => fn(),
  };
});

vi.mock("../lib/telemetry-error-log", () => ({
  logTelemetryEvent: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: {
    getAppSetting: vi.fn().mockResolvedValue(null),
  },
}));

import { db } from "../db";
import telemetryRouter from "../routes/telemetry";

const USER_ID = "test-user-sensor-only";

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

const SESSION_ID = "sess-sensor-only-test";
const VALID_TS   = Date.now();

describe("POST /api/telemetry/batch — campioni sensor-only", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();

    vi.mocked(db.execute).mockResolvedValue({ rows: [] } as unknown as Awaited<ReturnType<typeof db.execute>>);
  });

  // ── (a) lat/lon esplicitamente null → salvato ─────────────────────────────
  it("(a) campione con lat/lon null viene salvato (non scartato)", async () => {
    const res = await request(app)
      .post("/api/telemetry/batch")
      .send({
        session_id: SESSION_ID,
        session_type: "ride",
        samples: [{ ts: VALID_TS, lat: null, lon: null, gforce_x: 0.1, gforce_y: 0.0, gforce_z: 0.99 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);
    expect(res.body.session_id).toBe(SESSION_ID);

    const insertValues = vi.mocked(db.insert).mock.results[0]?.value as { values: ReturnType<typeof vi.fn> };
    const rows = insertValues.values.mock.calls[0]?.[0] as Array<{ lat: unknown; lon: unknown }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].lat).toBeNull();
    expect(rows[0].lon).toBeNull();
  });

  // ── (b) lat/lon non-finiti (NaN, Infinity) → normalizzati a null, salvati ─
  it("(b) lat NaN e lon Infinity vengono normalizzati a null e il campione è salvato", async () => {
    const res = await request(app)
      .post("/api/telemetry/batch")
      .send({
        session_id: SESSION_ID,
        session_type: "ride",
        samples: [{ ts: VALID_TS, lat: NaN, lon: Infinity }],
      });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);

    const insertValues = vi.mocked(db.insert).mock.results[0]?.value as { values: ReturnType<typeof vi.fn> };
    const rows = insertValues.values.mock.calls[0]?.[0] as Array<{ lat: unknown; lon: unknown }>;
    expect(rows[0].lat).toBeNull();
    expect(rows[0].lon).toBeNull();
  });

  // ── (b2) lat/lon come stringa non numerica → null ─────────────────────────
  it("(b2) lat/lon stringa non-numerica → normalizzati a null, campione salvato", async () => {
    const res = await request(app)
      .post("/api/telemetry/batch")
      .send({
        session_id: SESSION_ID,
        session_type: "ride",
        samples: [{ ts: VALID_TS, lat: "nope", lon: "???" }],
      });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);

    const insertValues = vi.mocked(db.insert).mock.results[0]?.value as { values: ReturnType<typeof vi.fn> };
    const rows = insertValues.values.mock.calls[0]?.[0] as Array<{ lat: unknown; lon: unknown }>;
    expect(rows[0].lat).toBeNull();
    expect(rows[0].lon).toBeNull();
  });

  // ── (c) ts invalido → campione scartato; tutti invalidi → 400 ─────────────
  it("(c) campione con ts NaN viene scartato; payload tutto invalido → 400", async () => {
    const res = await request(app)
      .post("/api/telemetry/batch")
      .send({
        session_id: SESSION_ID,
        session_type: "ride",
        samples: [{ ts: NaN, lat: 45.0, lon: 9.0 }],
      });

    expect(res.status).toBe(400);
    expect(vi.mocked(db.insert)).not.toHaveBeenCalled();
  });

  it("(c2) campione con ts=Infinity viene scartato → 400", async () => {
    const res = await request(app)
      .post("/api/telemetry/batch")
      .send({
        session_id: SESSION_ID,
        session_type: "ride",
        samples: [{ ts: Infinity, lat: 45.0, lon: 9.0 }],
      });

    expect(res.status).toBe(400);
    expect(vi.mocked(db.insert)).not.toHaveBeenCalled();
  });

  it("(c3) campione con ts assente (undefined) viene scartato → 400", async () => {
    const res = await request(app)
      .post("/api/telemetry/batch")
      .send({
        session_id: SESSION_ID,
        session_type: "ride",
        samples: [{ lat: 45.0, lon: 9.0 }],
      });

    expect(res.status).toBe(400);
    expect(vi.mocked(db.insert)).not.toHaveBeenCalled();
  });

  // ── (d) mix: ts invalido e ts valido → solo i validi salvati ─────────────
  it("(d) 3 campioni — 1 ts valido + 2 invalidi: solo 1 inserito", async () => {
    const res = await request(app)
      .post("/api/telemetry/batch")
      .send({
        session_id: SESSION_ID,
        session_type: "ride",
        samples: [
          { ts: VALID_TS,  lat: 45.464, lon: 9.188 },
          { ts: NaN,       lat: 45.465, lon: 9.189 },
          { ts: Infinity,  lat: 45.466, lon: 9.190 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);

    const insertValues = vi.mocked(db.insert).mock.results[0]?.value as { values: ReturnType<typeof vi.fn> };
    const rows = insertValues.values.mock.calls[0]?.[0] as unknown[];
    expect(rows).toHaveLength(1);
  });

  // ── (e) ts valido + mix lat/lon validi e non-finiti ──────────────────────
  it("(e) lat finita + lon non-finita: lat salvata, lon → null", async () => {
    const res = await request(app)
      .post("/api/telemetry/batch")
      .send({
        session_id: SESSION_ID,
        session_type: "ride",
        samples: [{ ts: VALID_TS, lat: 45.464, lon: NaN }],
      });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);

    const insertValues = vi.mocked(db.insert).mock.results[0]?.value as { values: ReturnType<typeof vi.fn> };
    const rows = insertValues.values.mock.calls[0]?.[0] as Array<{ lat: unknown; lon: unknown }>;
    expect(rows[0].lat).toBe(45.464);
    expect(rows[0].lon).toBeNull();
  });

  // ── payload sensor-only puro: ts + solo accelerometro, niente GPS ─────────
  it("campione sensor-only con solo ts + gforce — nessun GPS — viene salvato", async () => {
    const res = await request(app)
      .post("/api/telemetry/batch")
      .send({
        session_id: SESSION_ID,
        session_type: "ride",
        samples: [
          {
            ts:       VALID_TS,
            gforce_x: 0.05,
            gforce_y: 0.02,
            gforce_z: 0.98,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);

    const insertValues = vi.mocked(db.insert).mock.results[0]?.value as { values: ReturnType<typeof vi.fn> };
    const rows = insertValues.values.mock.calls[0]?.[0] as Array<{ lat: unknown; lon: unknown; gforceX?: unknown }>;
    expect(rows[0].lat).toBeNull();
    expect(rows[0].lon).toBeNull();
  });
});
