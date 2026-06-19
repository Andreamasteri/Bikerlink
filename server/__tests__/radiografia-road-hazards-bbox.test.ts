/**
 * Task #4443 — Test di regressione per la fix "bounding-box road hazards" (Task #4436).
 *
 * GET /api/road-hazards con lat/lng DEVE:
 *  1. aggiungere al WHERE 4 condizioni di range (gte/lte su lat e lng) — il
 *     bounding-box che evita la scansione globale prima del LIMIT.
 *  2. raffinare in JS con la distanza circolare, escludendo gli hazard fuori
 *     dal raggio anche se rientrati nel box quadrato.
 * Senza lat/lng nessuna condizione di range deve essere applicata.
 *
 * Pattern: mock di drizzle-orm con operatori "marker" per ispezionare il WHERE,
 * mock di server/db per catturare la catena select e restituire righe fisse.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

type Marker = { op: string; args: unknown[] };

// Operatori drizzle sostituiti da marker ispezionabili. pgTable (pg-core) resta
// reale, quindi @shared/db continua a definire roadHazards normalmente.
vi.mock("drizzle-orm", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  const mk = (op: string) => (...args: unknown[]) => ({ op, args });
  return {
    ...actual,
    eq: mk("eq"),
    and: mk("and"),
    isNull: mk("isNull"),
    or: mk("or"),
    gt: mk("gt"),
    gte: mk("gte"),
    lte: mk("lte"),
    desc: mk("desc"),
  };
});

const { mockRows, capturedWhere } = vi.hoisted(() => ({
  mockRows: { value: [] as Record<string, unknown>[] },
  capturedWhere: { value: null as Marker | null },
}));

vi.mock("../db", () => {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn((cond: Marker) => { capturedWhere.value = cond; return chain; });
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(mockRows.value));
  return {
    db: { select: vi.fn(() => chain) },
    pool: { query: vi.fn() },
  };
});

vi.mock("../storage", () => ({
  storage: {
    getAppSetting: vi.fn().mockResolvedValue(null), // null → road_hazards abilitate
    getUser: vi.fn().mockResolvedValue(null),
  },
}));

import roadHazardsRouter from "../routes/road-hazards";

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api/road-hazards", roadHazardsRouter);
  return app;
}

const MILAN = { id: "h-milan", lat: 45.464, lng: 9.188, deletedAt: null, expiresAt: null, isApproved: true, createdAt: new Date(), type: "pothole" };
const ROME = { id: "h-rome", lat: 41.9028, lng: 12.4964, deletedAt: null, expiresAt: null, isApproved: true, createdAt: new Date(), type: "pothole" };

function rangeOps(where: Marker | null): Marker[] {
  if (!where) return [];
  return (where.args as Marker[]).filter((a) => a && (a.op === "gte" || a.op === "lte"));
}

beforeEach(() => {
  capturedWhere.value = null;
  mockRows.value = [];
});

describe("GET /api/road-hazards — bounding-box con lat/lng", () => {
  it("con lat/lng aggiunge 4 condizioni di range (2 gte + 2 lte) al WHERE", async () => {
    mockRows.value = [MILAN];
    const res = await request(buildApp()).get("/api/road-hazards?lat=45.464&lng=9.188&radius=50");

    expect(res.status).toBe(200);
    const ranges = rangeOps(capturedWhere.value);
    expect(ranges.filter((r) => r.op === "gte")).toHaveLength(2);
    expect(ranges.filter((r) => r.op === "lte")).toHaveLength(2);
  });

  it("accetta anche l'alias `lon` per la longitudine", async () => {
    mockRows.value = [MILAN];
    const res = await request(buildApp()).get("/api/road-hazards?lat=45.464&lon=9.188&radius=50");

    expect(res.status).toBe(200);
    expect(rangeOps(capturedWhere.value)).toHaveLength(4);
  });

  it("senza lat/lng NON applica condizioni di range", async () => {
    mockRows.value = [MILAN, ROME];
    const res = await request(buildApp()).get("/api/road-hazards");

    expect(res.status).toBe(200);
    expect(rangeOps(capturedWhere.value)).toHaveLength(0);
    // Nessun raffinamento circolare: tutte le righe vengono restituite.
    expect(res.body.hazards).toHaveLength(2);
  });

  it("raffina in JS escludendo gli hazard fuori dal raggio", async () => {
    // Il box quadrato (mockato via DB) restituisce sia Milano che Roma, ma il
    // filtro circolare con raggio 50km tiene solo Milano.
    mockRows.value = [MILAN, ROME];
    const res = await request(buildApp()).get("/api/road-hazards?lat=45.464&lng=9.188&radius=50");

    expect(res.status).toBe(200);
    expect(res.body.hazards).toHaveLength(1);
    expect(res.body.hazards[0].id).toBe("h-milan");
  });
});
