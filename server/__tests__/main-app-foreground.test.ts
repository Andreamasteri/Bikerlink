/**
 * Task #5298 — Contratto degli endpoint del segnale "app principale in foreground".
 *
 *   POST /api/users/me/main-app-foreground  → scrive users.lastMainAppForegroundAt
 *                                             SOLO per l'utente in sessione.
 *   GET  /api/users/me/main-app-foreground  → restituisce { lastMainAppForegroundAt }
 *                                             come ISO string o null.
 *
 * Verifica: auth richiesta (401 senza sessione), scrittura per-utente corretta,
 * lettura del valore, formato ISO/null.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

const updateUser = vi.fn();
const getUser = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    updateUser: (...args: unknown[]) => updateUser(...args),
    getUser: (...args: unknown[]) => getUser(...args),
    // metodi toccati da altre route dello stesso router: non usati qui
    getUserProfile: vi.fn(),
    getAppSetting: vi.fn(),
    updateUserProfile: vi.fn(),
    createUserProfile: vi.fn(),
  },
}));

vi.mock("../matching-engine", () => ({
  triggerProposalProfileMatchingForZavorrina: vi.fn(),
}));

import usersRouter from "../routes/users";

function buildApp(userId?: string): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: userId ? { userId } : {} });
    next();
  });
  app.use("/api/users", usersRouter);
  return app;
}

describe("POST /api/users/me/main-app-foreground", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateUser.mockResolvedValue({ id: "u1" });
  });

  it("senza sessione → 401 e nessuna scrittura", async () => {
    const res = await request(buildApp()).post("/api/users/me/main-app-foreground");
    expect(res.status).toBe(401);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("con sessione → 200 e scrive lastMainAppForegroundAt SOLO per l'utente in sessione", async () => {
    const res = await request(buildApp("user-42")).post("/api/users/me/main-app-foreground");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(updateUser).toHaveBeenCalledTimes(1);
    const [id, patch] = updateUser.mock.calls[0];
    expect(id).toBe("user-42");
    expect(patch).toHaveProperty("lastMainAppForegroundAt");
    expect(patch.lastMainAppForegroundAt).toBeInstanceOf(Date);
    // Solo quel campo viene toccato dalla route.
    expect(Object.keys(patch)).toEqual(["lastMainAppForegroundAt"]);
  });

  it("errore storage → 500", async () => {
    updateUser.mockRejectedValueOnce(new Error("db down"));
    const res = await request(buildApp("user-42")).post("/api/users/me/main-app-foreground");
    expect(res.status).toBe(500);
  });
});

describe("GET /api/users/me/main-app-foreground", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("senza sessione → 401", async () => {
    const res = await request(buildApp()).get("/api/users/me/main-app-foreground");
    expect(res.status).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("restituisce il timestamp come ISO string", async () => {
    const at = new Date("2026-07-01T10:00:00.000Z");
    getUser.mockResolvedValue({ id: "user-42", lastMainAppForegroundAt: at });
    const res = await request(buildApp("user-42")).get("/api/users/me/main-app-foreground");
    expect(res.status).toBe(200);
    expect(res.body.lastMainAppForegroundAt).toBe("2026-07-01T10:00:00.000Z");
    expect(getUser).toHaveBeenCalledWith("user-42");
  });

  it("restituisce null quando il campo non è mai stato scritto", async () => {
    getUser.mockResolvedValue({ id: "user-42", lastMainAppForegroundAt: null });
    const res = await request(buildApp("user-42")).get("/api/users/me/main-app-foreground");
    expect(res.status).toBe(200);
    expect(res.body.lastMainAppForegroundAt).toBeNull();
  });

  it("utente inesistente → 404", async () => {
    getUser.mockResolvedValue(undefined);
    const res = await request(buildApp("ghost")).get("/api/users/me/main-app-foreground");
    expect(res.status).toBe(404);
  });
});
