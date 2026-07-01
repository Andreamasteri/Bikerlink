/**
 * Task #5292 — Prova che DELETE /api/admin/bowie-standalone/token/:id rimuova
 * anche la riga push_tokens (app_id="bowie") legata a quel device, non solo la
 * riga bowie_terminal_tokens. Senza questo, il broadcast di fallback (client
 * senza deviceId) continuerebbe a consegnare al device revocato.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import request from "supertest";
import { getTableName } from "drizzle-orm";
import { pushTokens } from "@shared/db";

const revokedRow = vi.hoisted(() => ({
  current: null as { id: string; pushToken: string | null } | null,
}));

const deleteCalls = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock("../db", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockImplementation(() =>
            Promise.resolve(revokedRow.current ? [revokedRow.current] : []),
          ),
        })),
      })),
    })),
    delete: vi.fn((table: unknown) => ({
      where: vi.fn((cond: unknown) => {
        deleteCalls.calls.push([table, cond]);
        return Promise.resolve(undefined);
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([]),
        leftJoin: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
        orderBy: vi.fn().mockResolvedValue([]),
        groupBy: vi.fn().mockResolvedValue([]),
        limit: vi.fn().mockResolvedValue([]),
      })),
    })),
  },
}));

import bowieStandaloneRouter from "../routes/admin/bowie-standalone";

function buildApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use((_req: Request, _res: Response, next) => next());
  app.use("/api/admin/bowie-standalone", bowieStandaloneRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  revokedRow.current = null;
  deleteCalls.calls = [];
});

describe("DELETE /token/:id — revoca cascata su push_tokens (Task #5277/#5292)", () => {
  it("device con push token: elimina anche la riga push_tokens app_id=bowie", async () => {
    revokedRow.current = { id: "device-1", pushToken: "ExponentPushToken[device-A]" };

    const res = await request(buildApp()).delete("/api/admin/bowie-standalone/token/device-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deleteCalls.calls).toHaveLength(1);
    expect(deleteCalls.calls[0][0]).toBe(pushTokens);
  });

  it("device senza push token: nessuna delete extra su push_tokens", async () => {
    revokedRow.current = { id: "device-2", pushToken: null };

    const res = await request(buildApp()).delete("/api/admin/bowie-standalone/token/device-2");

    expect(res.status).toBe(200);
    expect(deleteCalls.calls).toHaveLength(0);
  });

  it("device già revocato/non trovato: 404, nessuna delete", async () => {
    revokedRow.current = null;

    const res = await request(buildApp()).delete("/api/admin/bowie-standalone/token/ghost");

    expect(res.status).toBe(404);
    expect(deleteCalls.calls).toHaveLength(0);
  });
});

describe("sendBowieReplyPush — dopo revoca, il broadcast di fallback non colpisce il device revocato", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("getAppPushTokens non restituisce il token rimosso da push_tokens", async () => {
    vi.doMock("../db", () => ({
      db: {
        select: vi.fn(() => ({
          from: vi.fn((table: unknown) => ({
            where: vi.fn(() => {
              // vi.resetModules() ricarica anche @shared/db, quindi non possiamo
              // confrontare per identità di riferimento con la costante importata
              // in cima al file (sarebbe l'istanza del modulo precedente): usiamo
              // il nome tabella reale via drizzle getTableName.
              const name = getTableName(table as Parameters<typeof getTableName>[0]);
              if (name === "bowie_terminal_tokens") return Promise.resolve([]);
              if (name === "push_tokens") {
                // Simula che la riga del device revocato sia già stata
                // cancellata dalla DELETE /token/:id: resta solo l'altro device.
                return Promise.resolve([
                  { userId: "user-1", token: "ExponentPushToken[device-B]" },
                ]);
              }
              return Promise.resolve([]);
            }),
          })),
        })),
        update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
        delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      },
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ status: "ok", id: "t1" }] }),
      }),
    );

    const { sendBowieReplyPush } = await import("../push-notifications");
    const sent = await sendBowieReplyPush("user-1", { body: "ciao" });

    expect(sent).toBe(1);
    const fetchMock = vi.mocked(global.fetch);
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body).toHaveLength(1);
    expect(body[0].to).toBe("ExponentPushToken[device-B]");
    expect(body.some((m: { to: string }) => m.to === "ExponentPushToken[device-A]")).toBe(false);

    vi.unstubAllGlobals();
  });
});
