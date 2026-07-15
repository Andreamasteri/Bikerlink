/**
 * Task #4443 — Test di regressione per la fix "cache OTA" (Task #4436).
 *
 * GET /api/admin/ota/releases innesca il sync EAS in background con TTL 60s e
 * dedup delle richieste in volo: due GET ravvicinate NON devono provocare due
 * chiamate GraphQL a EAS (prima la probe OTA andava in timeout sul sync sincrono).
 *
 * Pattern: mock di server/db (catena select per le releases), EAS_TOKEN settato,
 * stub di global.fetch che conta le chiamate all'endpoint GraphQL EAS.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../db", () => {
  // Chain thenable: ogni metodo builder restituisce la catena e la catena
  // stessa è awaitable → funziona con qualsiasi ordine di .where/.orderBy/.limit
  // (ota.ts usa .orderBy(...).limit(...), quindi orderBy NON può restituire una Promise).
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.then = (resolve: (v: unknown[]) => unknown) => Promise.resolve([]).then(resolve);
  return {
    db: {
      select: vi.fn(() => chain),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) })) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    },
    // Passthrough: il wrapper di retry deve solo eseguire la funzione avvolta.
    withDbRetry: <T>(fn: () => Promise<T> | T): Promise<T> | T => fn(),
  };
});

import otaRouter from "../routes/admin/ota";

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { userId: "admin-1" } });
    next();
  });
  app.use("/api/admin/ota", otaRouter);
  return app;
}

const EAS_GRAPHQL_URL = "https://api.expo.dev/graphql";

beforeEach(() => {
  process.env.EAS_TOKEN = "test-token";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/admin/ota/releases — dedup del sync EAS entro 60s", () => {
  it("due GET ravvicinate provocano una sola chiamata GraphQL a EAS", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (typeof url === "string" && url.startsWith(EAS_GRAPHQL_URL)) {
        return {
          ok: true,
          json: async () => ({ data: { app: { byId: { updateBranches: [] } } } }),
        } as unknown as Response;
      }
      throw new Error(`fetch inatteso: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = buildApp();
    const r1 = await request(app).get("/api/admin/ota/releases");
    const r2 = await request(app).get("/api/admin/ota/releases");
    // lascia girare il microtask del sync background fire-and-forget
    await new Promise((r) => setTimeout(r, 30));

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const easCalls = fetchMock.mock.calls.filter(
      ([url]) => typeof url === "string" && (url as string).startsWith(EAS_GRAPHQL_URL),
    );
    expect(easCalls).toHaveLength(1);
  });

  it("con ?sync=false non chiama affatto EAS", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await request(buildApp()).get("/api/admin/ota/releases?sync=false");
    await new Promise((r) => setTimeout(r, 20));

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
