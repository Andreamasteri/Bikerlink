/**
 * Task #4458 — Regressione del gate di init durante la finestra di boot.
 *
 * Garantisce che il fix di Task #4455 non torni indietro a un blanket-503:
 *   • mentre initState.initializing=true e dbReady=false TUTTE le /api/* (incluso
 *     /auth/login) ricevono 503 con Retry-After (DB non ancora pronto);
 *   • appena dbReady=true le rotte auth essenziali (login, me, logout) passano
 *     all'handler, mentre una rotta NON essenziale resta 503;
 *   • /api/health passa sempre durante l'init;
 *   • a boot finito (initializing=false) tutto passa.
 *
 * Esercita il gate REALE estratto in init-state.ts (initGate), quindi un
 * eventuale ritorno al blanket-503 in server/index.ts farebbe fallire il test.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express, { type Request, type Response } from "express";
import request from "supertest";
import { initState, initGate, INIT_ESSENTIAL_PATHS } from "../init-state";

function buildApp(): express.Application {
  const app = express();
  // Stesso montaggio di server/index.ts: il gate è relativo a "/api".
  app.use("/api", initGate);
  // Handler fittizi a valle del gate: rispondono 200 solo se il gate li lascia passare.
  app.get("/api/health", (_req: Request, res: Response) => res.json({ ok: true, route: "health" }));
  app.post("/api/auth/login", (_req: Request, res: Response) => res.json({ ok: true, route: "login" }));
  app.get("/api/auth/me", (_req: Request, res: Response) => res.json({ ok: true, route: "me" }));
  app.post("/api/auth/logout", (_req: Request, res: Response) => res.json({ ok: true, route: "logout" }));
  app.get("/api/proposals", (_req: Request, res: Response) => res.json({ ok: true, route: "proposals" }));
  return app;
}

const app = buildApp();

// Salva e ripristina lo stato globale condiviso così i test non si influenzano.
let savedInitializing: boolean;
let savedDbReady: boolean;

beforeEach(() => {
  savedInitializing = initState.initializing;
  savedDbReady = initState.dbReady;
});

afterEach(() => {
  initState.initializing = savedInitializing;
  initState.dbReady = savedDbReady;
});

describe("INIT_ESSENTIAL_PATHS", () => {
  it("contiene esattamente le rotte auth essenziali (login, me, logout)", () => {
    expect([...INIT_ESSENTIAL_PATHS].sort()).toEqual(["/auth/login", "/auth/logout", "/auth/me"]);
  });
});

describe("initGate — finestra di init, DB non ancora pronto (initializing=true, dbReady=false)", () => {
  beforeEach(() => {
    initState.initializing = true;
    initState.dbReady = false;
  });

  it("/api/auth/login → 503 con Retry-After (le migration non sono ancora applicate)", async () => {
    const res = await request(app).post("/api/auth/login");
    expect(res.status).toBe(503);
    expect(res.headers["retry-after"]).toBe("3");
    expect(res.body).toMatchObject({ status: "initializing", initializing: true });
  });

  it("/api/proposals (non essenziale) → 503 con Retry-After", async () => {
    const res = await request(app).get("/api/proposals");
    expect(res.status).toBe(503);
    expect(res.headers["retry-after"]).toBe("3");
  });

  it("/api/health passa sempre (initializing-aware) → 200", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, route: "health" });
  });
});

describe("initGate — DB pronto ma boot non finito (initializing=true, dbReady=true)", () => {
  beforeEach(() => {
    initState.initializing = true;
    initState.dbReady = true;
  });

  it("/api/auth/login NON è bloccato dal gate → passa all'handler (200)", async () => {
    const res = await request(app).post("/api/auth/login");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, route: "login" });
  });

  it("/api/auth/me e /api/auth/logout passano all'handler (200)", async () => {
    const me = await request(app).get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ ok: true, route: "me" });

    const logout = await request(app).post("/api/auth/logout");
    expect(logout.status).toBe(200);
    expect(logout.body).toMatchObject({ ok: true, route: "logout" });
  });

  it("/api/proposals (non essenziale) resta 503 con Retry-After", async () => {
    const res = await request(app).get("/api/proposals");
    expect(res.status).toBe(503);
    expect(res.headers["retry-after"]).toBe("3");
    expect(res.body).toMatchObject({ status: "initializing", initializing: true });
  });
});

describe("initGate — boot finito (initializing=false)", () => {
  beforeEach(() => {
    initState.initializing = false;
    initState.dbReady = true;
  });

  it("tutte le rotte passano all'handler (nessun 503 dal gate)", async () => {
    const login = await request(app).post("/api/auth/login");
    expect(login.status).toBe(200);

    const proposals = await request(app).get("/api/proposals");
    expect(proposals.status).toBe(200);
    expect(proposals.body).toMatchObject({ ok: true, route: "proposals" });
  });
});
