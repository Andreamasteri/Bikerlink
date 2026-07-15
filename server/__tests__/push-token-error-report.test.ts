/**
 * Test per la segnalazione della causa del mancato push token
 * (server/routes/users/profile.next.ts).
 *
 * Copre la logica introdotta per rendere visibile nel diagnostic in-app la
 * causa reale del mancato token push, senza accesso ai log:
 *   • PUT /api/users/me/push-token-error persiste causa + platform + timestamp;
 *   • PUT /api/users/me/push-token con token valido AZZERA i campi
 *     push_token_error* (così il diagnostic non mostra più una causa stantia).
 *
 * Senza questi test, una futura regressione (es. il push-token che smette di
 * azzerare la causa precedente) passerebbe silenziosamente.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

vi.mock("../storage", () => ({
  storage: {
    updateUser: vi.fn().mockResolvedValue(undefined),
  },
}));

// La route profile.next scrive nella tabella push_tokens (insert upsert + delete).
// Senza questo mock il test colpirebbe il DB reale e fallirebbe con una FK
// violation su user_id — mascherando la vera copertura del test.
vi.mock("../db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) })),
    })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  },
  withDbRetry: <T>(fn: () => Promise<T> | T): Promise<T> | T => fn(),
}));

import { storage } from "../storage";
import profileNextRouter from "../routes/users/profile.next";

function buildApp(userId: string | null = "user-123"): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: userId ? { userId } : {} });
    next();
  });
  app.use("/api/users", profileNextRouter);
  return app;
}

describe("PUT /api/users/me/push-token-error — persistenza causa", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persiste cause + detail + platform + timestamp", async () => {
    const app = buildApp("user-123");
    const res = await request(app)
      .put("/api/users/me/push-token-error")
      .send({
        cause: "PERMESSI_NEGATI",
        detail: "Utente ha negato i permessi notifiche",
        platform: "android",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updateMock = vi.mocked(storage.updateUser);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [calledUserId, patch] = updateMock.mock.calls[0];
    expect(calledUserId).toBe("user-123");
    expect(patch.pushTokenError).toBe("PERMESSI_NEGATI");
    expect(patch.pushTokenErrorDetail).toBe("Utente ha negato i permessi notifiche");
    expect(patch.pushTokenErrorPlatform).toBe("android");
    expect(patch.pushTokenErrorAt).toBeInstanceOf(Date);
  });

  it("detail e platform assenti → null (mai undefined)", async () => {
    const app = buildApp("user-123");
    const res = await request(app)
      .put("/api/users/me/push-token-error")
      .send({ cause: "TOKEN_NON_OTTENUTO" });

    expect(res.status).toBe(200);
    const patch = vi.mocked(storage.updateUser).mock.calls[0][1];
    expect(patch.pushTokenError).toBe("TOKEN_NON_OTTENUTO");
    expect(patch.pushTokenErrorDetail).toBeNull();
    expect(patch.pushTokenErrorPlatform).toBeNull();
    expect(patch.pushTokenErrorAt).toBeInstanceOf(Date);
  });

  it("cause non riconosciuta → 400, nessuna scrittura", async () => {
    const app = buildApp("user-123");
    const res = await request(app)
      .put("/api/users/me/push-token-error")
      .send({ cause: "CAUSA_INESISTENTE" });

    expect(res.status).toBe(400);
    expect(vi.mocked(storage.updateUser)).not.toHaveBeenCalled();
  });

  it("senza sessione → 401, nessuna scrittura", async () => {
    const app = buildApp(null);
    const res = await request(app)
      .put("/api/users/me/push-token-error")
      .send({ cause: "PERMESSI_NEGATI" });

    expect(res.status).toBe(401);
    expect(vi.mocked(storage.updateUser)).not.toHaveBeenCalled();
  });
});

describe("PUT /api/users/me/push-token — azzeramento causa stantia", () => {
  beforeEach(() => vi.clearAllMocks());

  it("token valido azzera tutti i campi push_token_error*", async () => {
    const app = buildApp("user-123");
    const token = "ExponentPushToken[abc123def456]";
    const res = await request(app)
      .put("/api/users/me/push-token")
      .send({ token });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updateMock = vi.mocked(storage.updateUser);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [calledUserId, patch] = updateMock.mock.calls[0];
    expect(calledUserId).toBe("user-123");
    expect(patch.expoPushToken).toBe(token);
    expect(patch.pushTokenError).toBeNull();
    expect(patch.pushTokenErrorDetail).toBeNull();
    expect(patch.pushTokenErrorPlatform).toBeNull();
    expect(patch.pushTokenErrorAt).toBeNull();
  });

  it("accetta anche il prefisso ExpoPushToken[", async () => {
    const app = buildApp("user-123");
    const token = "ExpoPushToken[xyz789]";
    const res = await request(app)
      .put("/api/users/me/push-token")
      .send({ token });

    expect(res.status).toBe(200);
    const patch = vi.mocked(storage.updateUser).mock.calls[0][1];
    expect(patch.expoPushToken).toBe(token);
    expect(patch.pushTokenError).toBeNull();
  });

  it("token vuoto → solo clear del token, NON tocca i campi error", async () => {
    const app = buildApp("user-123");
    const res = await request(app)
      .put("/api/users/me/push-token")
      .send({ token: "" });

    expect(res.status).toBe(200);
    expect(res.body.cleared).toBe(true);
    const patch = vi.mocked(storage.updateUser).mock.calls[0][1];
    expect(patch.expoPushToken).toBeNull();
    expect("pushTokenError" in patch).toBe(false);
  });

  it("token non valido → 400, nessuna scrittura", async () => {
    const app = buildApp("user-123");
    const res = await request(app)
      .put("/api/users/me/push-token")
      .send({ token: "non-un-token-expo" });

    expect(res.status).toBe(400);
    expect(vi.mocked(storage.updateUser)).not.toHaveBeenCalled();
  });
});
