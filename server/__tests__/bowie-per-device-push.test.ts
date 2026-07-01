/**
 * Task #5292 — Prova che sendBowieReplyPush(userId, {deviceId}) consegni SOLO
 * al token del device richiesto (bowie_terminal_tokens), non a tutti i device
 * Bowie dell'utente (push_tokens app_id="bowie"), e mai a un device revocato.
 *
 * Senza questo test, una futura regressione potrebbe far tornare
 * sendBowieReplyPush al broadcast per-utente anche quando un deviceId preciso
 * è disponibile, riconsegnando la risposta a device revocati o ad altri
 * dispositivi dello stesso utente.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bowieTerminalTokens, pushTokens } from "@shared/db";

function thenableRows<T>(rows: T[]) {
  return {
    then: (resolve: (v: T[]) => void) => resolve(rows),
    limit: () => Promise.resolve(rows),
  };
}

const bowieDeviceRow = vi.hoisted(() => ({ current: [] as Array<{ pushToken: string }> }));
const broadcastRows = vi.hoisted(() => ({ current: [] as Array<{ userId: string; token: string }> }));

vi.mock("../db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => {
          if (table === bowieTerminalTokens) return thenableRows(bowieDeviceRow.current);
          if (table === pushTokens) return thenableRows(broadcastRows.current);
          return thenableRows([]);
        }),
      })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  },
}));

import { sendBowieReplyPush } from "../push-notifications";

function mockExpoOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: "ok", id: "ticket-1" }] }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  bowieDeviceRow.current = [];
  broadcastRows.current = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendBowieReplyPush — targeting per-device (Task #5277/#5292)", () => {
  it("con deviceId, consegna SOLO al token di quel device, non al broadcast di tutti i device bowie", async () => {
    bowieDeviceRow.current = [{ pushToken: "ExponentPushToken[device-A]" }];
    // Se il codice regredisse al broadcast, questi altri token dell'utente
    // finirebbero nel messaggio inviato — non devono mai comparire.
    broadcastRows.current = [
      { userId: "user-1", token: "ExponentPushToken[device-A]" },
      { userId: "user-1", token: "ExponentPushToken[device-B]" },
      { userId: "user-1", token: "ExponentPushToken[device-C]" },
    ];
    mockExpoOk();

    const sent = await sendBowieReplyPush("user-1", { body: "risposta", deviceId: "device-A" });

    expect(sent).toBe(1);
    const fetchMock = vi.mocked(global.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body).toHaveLength(1);
    expect(body[0].to).toBe("ExponentPushToken[device-A]");
  });

  it("device revocato (non nella query, revoked_at valorizzato) → nessuna consegna, nessun fallback broadcast", async () => {
    // getBowieDeviceToken esclude sempre revoked_at IS NOT NULL: un device
    // revocato non compare mai tra le righe restituite.
    bowieDeviceRow.current = [];
    broadcastRows.current = [
      { userId: "user-1", token: "ExponentPushToken[device-B]" },
    ];
    mockExpoOk();

    const sent = await sendBowieReplyPush("user-1", { body: "risposta", deviceId: "device-revoked" });

    expect(sent).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("senza deviceId (client vecchi), torna al broadcast per app_id=bowie", async () => {
    bowieDeviceRow.current = [];
    broadcastRows.current = [
      { userId: "user-1", token: "ExponentPushToken[device-A]" },
      { userId: "user-1", token: "ExponentPushToken[device-B]" },
    ];
    mockExpoOk();

    const sent = await sendBowieReplyPush("user-1", { body: "risposta" });

    expect(sent).toBe(2);
    const fetchMock = vi.mocked(global.fetch);
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body).toHaveLength(2);
  });
});
