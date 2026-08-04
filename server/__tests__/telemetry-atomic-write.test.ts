import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

// Le spie sono condivise col factory di vi.mock (hoisted): vanno create con
// vi.hoisted o non sono accessibili al momento del mock.
const { txExecute, tx, transaction, dbExecute, dbUpdateReturning } = vi.hoisted(() => {
  const txExecute = vi.fn();
  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn((rows: unknown) => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(async () =>
            Array.isArray(rows)
              ? rows.map((row) => ({ ingestKey: (row as { ingestKey?: string }).ingestKey ?? null }))
              : [],
          ),
        })),
      })),
    })),
    execute: txExecute,
  };
  // `db.transaction(cb)` esegue davvero il callback con la fake tx: se il callback
  // lancia (es. aggiornamento riepilogo fallito), la promise viene rifiutata —
  // esattamente come un vero ROLLBACK propagherebbe l'errore al chiamante.
  const transaction = vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));
  const dbExecute = vi.fn();
  const dbUpdateReturning = vi.fn(async () => [{ id: "route-1", title: "x" }]);
  return { txExecute, tx, transaction, dbExecute, dbUpdateReturning };
});

vi.mock("../db", () => ({
  db: {
    transaction,
    execute: dbExecute,
    insert: vi.fn(() => ({ values: vi.fn() })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: dbUpdateReturning })) })) })),
  },
  pool: { query: vi.fn(), connect: vi.fn() },
  withDbRetry: (fn: () => unknown) => fn(),
}));

vi.mock("../storage", () => ({
  storage: {
    getRoute: vi.fn(async (id: string) => ({ id, userId: "test-user-atomic" })),
  },
}));

import telemetryRouter from "../routes/telemetry";
import routeCompletionRouter from "../routes/route-completion";

const USER_ID = "test-user-atomic";

function buildApp(mount: string, router: express.Router): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: { userId: USER_ID } });
    next();
  });
  app.use(mount, router);
  return app;
}

const SAMPLES = [
  { ts: 1000, lat: 45.0, lon: 9.0, speed_kmh: 50 },
  { ts: 2000, lat: 45.02, lon: 9.0, speed_kmh: 50 },
];

describe("Telemetry writes keep the per-session summary in sync atomically (Task #81)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txExecute.mockResolvedValue({ rows: [] });
    dbExecute.mockResolvedValue({ rows: [] });
  });

  it("POST /batch inserts samples AND updates the summary inside one transaction", async () => {
    const app = buildApp("/api/telemetry", telemetryRouter);
    const res = await request(app)
      .post("/api/telemetry/batch")
      .send({ session_id: "sess-1", session_type: "ride", samples: SAMPLES });

    expect(res.status).toBe(200);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalled(); // ride_telemetry insert
    // updateTelemetrySessionStats runs on the SAME tx: SELECT prior + UPSERT.
    expect(txExecute).toHaveBeenCalledTimes(3);
  });

  it("POST /batch returns 500 (no silent divergence) if the summary update fails", async () => {
    // SELECT prior ok, poi l'UPSERT del riepilogo fallisce → il callback lancia
    // → la transazione viene annullata → la rotta risponde 500, non 200.
    txExecute.mockReset();
    txExecute.mockResolvedValueOnce({ rows: [] }); // SELECT prior
    txExecute.mockRejectedValueOnce(new Error("boom")); // UPSERT summary

    const app = buildApp("/api/telemetry", telemetryRouter);
    const res = await request(app)
      .post("/api/telemetry/batch")
      .send({ session_id: "sess-1", session_type: "ride", samples: SAMPLES });

    expect(res.status).toBe(500);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("PATCH /routes/:id (non-batch write path) also updates the summary in a transaction", async () => {
    const app = buildApp("/api", routeCompletionRouter);
    const res = await request(app)
      .patch("/api/routes/route-1")
      .send({
        title: "Giro di prova",
        telemetryData: JSON.stringify([
          { timestamp: 1000, lat: 45.0, lon: 9.0, speedKmh: 50 },
          { timestamp: 2000, lat: 45.02, lon: 9.0, speedKmh: 50 },
        ]),
      });

    expect(res.status).toBe(200);
    // dedup SELECT su db.execute → nessuna riga esistente
    expect(dbExecute).toHaveBeenCalled();
    // insert + riepilogo dentro la stessa transazione
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalled();
    expect(txExecute).toHaveBeenCalledTimes(2); // SELECT prior + UPSERT summary
  });
});
