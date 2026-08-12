/**
 * Task #4443 — Test di regressione per la fix "storico notifiche" (Task #4436).
 *
 * Ogni invio push (riuscito o fallito) DEVE produrre esattamente una riga in
 * notification_history, così la probe "Notifiche Push" della Radiografia ha
 * dati reali invece di restare a 0.
 *
 * Pattern: mock di server/db + override del tag `sql` di drizzle-orm per
 * catturare i valori interpolati (in particolare lo status di ogni riga), e
 * stub di global.fetch per simulare le risposte di Expo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Override del tag `sql` per catturare gli args interpolati. pgTable proviene
// da drizzle-orm/pg-core (modulo diverso) quindi @shared/db resta intatto.
vi.mock("drizzle-orm", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  const sqlTag = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: true, strings, values }),
    actual.sql as object,
  );
  return { ...actual, sql: sqlTag };
});

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn().mockResolvedValue({ rows: [] }) }));

vi.mock("../db", () => ({
  db: {
    execute: mockExecute,
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
  },
}));

import { recordNotificationHistory, sendExpoMessages, type ExpoPushMessage } from "../push-notifications-internal";

// Estrae lo status (4° valore interpolato) da una chiamata catturata a db.execute.
function statusOfCall(callIndex: number): string {
  const arg = mockExecute.mock.calls[callIndex][0] as { values: unknown[] };
  return arg.values[3] as string;
}
function tokenOfCall(callIndex: number): string {
  const arg = mockExecute.mock.calls[callIndex][0] as { values: unknown[] };
  return arg.values[2] as string;
}

beforeEach(() => {
  mockExecute.mockClear();
  mockExecute.mockResolvedValue({ rows: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recordNotificationHistory — una INSERT per riga", () => {
  it("inserisce esattamente una riga per ogni elemento passato", async () => {
    await recordNotificationHistory([
      { userId: "u1", notificationType: "match", token: "ExponentPushToken[a]", status: "sent" },
      { userId: "u2", notificationType: "chat", token: "ExponentPushToken[b]", status: "failed", errorMessage: "boom" },
      { userId: null, notificationType: "system", token: "ExponentPushToken[c]", status: "sent" },
    ]);
    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(statusOfCall(0)).toBe("sent");
    expect(statusOfCall(1)).toBe("failed");
    expect(statusOfCall(2)).toBe("sent");
  });

  it("non esegue alcuna INSERT con array vuoto", async () => {
    await recordNotificationHistory([]);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("ignora i watchdog_status ripetitivi", async () => {
    await recordNotificationHistory([
      { userId: null, notificationType: "watchdog_status", token: "ExponentPushToken[status]", status: "sent" },
      { userId: null, notificationType: "watchdog_restart", token: "ExponentPushToken[restart]", status: "sent" },
    ]);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(tokenOfCall(0)).toBe("ExponentPushToken[restart]");
  });

  it("non propaga errori se la INSERT fallisce (non-fatal)", async () => {
    mockExecute.mockRejectedValueOnce(new Error("db down"));
    await expect(
      recordNotificationHistory([
        { userId: "u1", notificationType: "match", token: "ExponentPushToken[a]", status: "sent" },
      ]),
    ).resolves.toBeUndefined();
  });
});

describe("sendExpoMessages — registra una riga di storico per messaggio", () => {
  const messages: ExpoPushMessage[] = [
    { to: "ExponentPushToken[a]", title: "t1", body: "b1", data: { type: "match" } },
    { to: "ExponentPushToken[b]", title: "t2", body: "b2", data: { type: "chat" } },
  ];
  const userIdByToken = new Map<string, string>([
    ["ExponentPushToken[a]", "u1"],
    ["ExponentPushToken[b]", "u2"],
  ]);

  it("ticket misti (ok + error) → una riga sent e una failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { status: "ok", id: "ticket-1" },
            { status: "error", message: "rate", details: { error: "MessageRateExceeded" } },
          ],
        }),
      }),
    );

    await sendExpoMessages(messages, userIdByToken);

    expect(mockExecute).toHaveBeenCalledTimes(2);
    const statuses = [statusOfCall(0), statusOfCall(1)];
    expect(statuses).toContain("sent");
    expect(statuses).toContain("failed");
    expect([tokenOfCall(0), tokenOfCall(1)]).toEqual(
      expect.arrayContaining(["ExponentPushToken[a]", "ExponentPushToken[b]"]),
    );
  });

  it("HTTP error da Expo → tutte le righe failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "down" }),
    );

    await sendExpoMessages(messages, userIdByToken);

    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(statusOfCall(0)).toBe("failed");
    expect(statusOfCall(1)).toBe("failed");
  });

  it("errore di rete (fetch throw) → tutte le righe failed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));

    await sendExpoMessages(messages, userIdByToken);

    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(statusOfCall(0)).toBe("failed");
    expect(statusOfCall(1)).toBe("failed");
  });

  it("meno ticket dei messaggi → il messaggio senza ticket è failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ status: "ok", id: "ticket-1" }] }),
      }),
    );

    await sendExpoMessages(messages, userIdByToken);

    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(statusOfCall(0)).toBe("sent");
    expect(statusOfCall(1)).toBe("failed");
  });
});
