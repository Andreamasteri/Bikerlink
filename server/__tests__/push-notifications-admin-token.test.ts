/**
 * Task #415 — Confirm sendSystemAlertPushToAdmins actually picks up tokens from
 * push_tokens (app_id="main") and delivers the push to the admin device.
 *
 * Senza questo test una regressione potrebbe far tornare la funzione a leggere
 * solo il campo legacy users.expoPushToken, ignorando silenziosamente i token
 * registrati nella nuova tabella push_tokens dopo la re-registrazione del device.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — tutti hoisted per garantire l'ordine corretto con vi.mock()
// ---------------------------------------------------------------------------

const sendExpoMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const getAppPushTokensMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const filterUserIdsMock = vi.hoisted(() =>
  vi.fn().mockImplementation((ids: string[]) => Promise.resolve(ids)),
);

// Counter per differenziare la prima chiamata DB (admin ids) dalla seconda (legacy tokens)
const dbWhereCallCount = vi.hoisted(() => ({ current: 0 }));

vi.mock("../push-notifications-internal", () => ({
  getAppPushTokens: getAppPushTokensMock,
  filterUserIdsByPreference: filterUserIdsMock,
  sendExpoMessages: sendExpoMock,
  isValidExpoPushToken: (token: string) =>
    token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["),
  getAdminPushTokenCount: vi.fn().mockResolvedValue(-1),
  clearStaleToken: vi.fn().mockResolvedValue(undefined),
  clearStalePushTokenRow: vi.fn().mockResolvedValue(undefined),
  recordNotificationHistory: vi.fn().mockResolvedValue(undefined),
}));

// DB mock: differenzia la prima chiamata (admin ids) dalla seconda (legacy expoPushToken)
// tramite un contatore reset in beforeEach.
const adminDbRows = vi.hoisted(() => ({
  current: [{ id: "admin-1" }] as Array<{ id: string; expoPushToken?: string | null }>,
}));
const legacyDbRows = vi.hoisted(() => ({
  current: [{ id: "admin-1", expoPushToken: null }] as Array<{
    id: string;
    expoPushToken: string | null;
  }>,
}));

vi.mock("../db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockImplementation(() => {
          // Prima chiamata per ogni test: SELECT id FROM users WHERE role='admin'
          // Seconda chiamata: SELECT id, expoPushToken FROM users WHERE id IN (...)
          const idx = dbWhereCallCount.current++;
          return idx === 0
            ? Promise.resolve(adminDbRows.current)
            : Promise.resolve(legacyDbRows.current);
        }),
      })),
    })),
  },
}));

import { sendSystemAlertPushToAdmins } from "../push-notifications-admin";

beforeEach(() => {
  vi.clearAllMocks();
  // Ripristina defaults after each clear
  dbWhereCallCount.current = 0;
  adminDbRows.current = [{ id: "admin-1" }];
  legacyDbRows.current = [{ id: "admin-1", expoPushToken: null }];
  filterUserIdsMock.mockImplementation((ids: string[]) => Promise.resolve(ids));
  sendExpoMock.mockResolvedValue(undefined);
});

describe("sendSystemAlertPushToAdmins — token pickup (Task #415)", () => {
  it("invia il push al token registrato in push_tokens (app_id='main') per un admin", async () => {
    const adminToken = "ExponentPushToken[admin-device-1]";
    getAppPushTokensMock.mockResolvedValue([{ userId: "admin-1", token: adminToken }]);

    const n = await sendSystemAlertPushToAdmins(
      "🔴 Sistema CRITICO",
      "Score 20/100 — DB irraggiungibile",
      { type: "watchdog_status", status: "red", score: 20 },
    );

    expect(n).toBe(1);
    expect(sendExpoMock).toHaveBeenCalledTimes(1);

    const [messages] = sendExpoMock.mock.calls[0] as [
      Array<{ to: string; title?: string; data?: Record<string, unknown> }>,
      Map<string, string>,
    ];
    expect(messages).toHaveLength(1);
    expect(messages[0].to).toBe(adminToken);
    expect(messages[0].title).toBe("🔴 Sistema CRITICO");
    expect(messages[0].data).toMatchObject({ type: "watchdog_status", status: "red" });
  });

  it("non invia nulla quando push_tokens è vuoto e non ci sono token legacy", async () => {
    getAppPushTokensMock.mockResolvedValue([]);
    // legacyDbRows già impostato con expoPushToken: null

    const n = await sendSystemAlertPushToAdmins("Titolo", "Corpo", { type: "test" });

    expect(n).toBe(0);
    expect(sendExpoMock).not.toHaveBeenCalled();
  });

  it("deduplicates: se lo stesso token appare sia in push_tokens che in expoPushToken legacy, invia UNA sola push", async () => {
    const sharedToken = "ExponentPushToken[shared-device]";
    getAppPushTokensMock.mockResolvedValue([{ userId: "admin-1", token: sharedToken }]);
    legacyDbRows.current = [{ id: "admin-1", expoPushToken: sharedToken }];

    const n = await sendSystemAlertPushToAdmins("Dedup test", "Corpo", { type: "test" });

    expect(n).toBe(1);
    const [messages] = sendExpoMock.mock.calls[0] as [Array<{ to: string }>, Map<string, string>];
    const sentToShared = messages.filter((m) => m.to === sharedToken);
    expect(sentToShared).toHaveLength(1);
  });

  it("invia sia al token push_tokens sia al token legacy quando sono diversi (multi-device)", async () => {
    const appToken = "ExponentPushToken[new-device]";
    const legacyToken = "ExponentPushToken[old-device]";
    getAppPushTokensMock.mockResolvedValue([{ userId: "admin-1", token: appToken }]);
    legacyDbRows.current = [{ id: "admin-1", expoPushToken: legacyToken }];

    const n = await sendSystemAlertPushToAdmins("Multi-device", "Corpo", { type: "test" });

    expect(n).toBe(2);
    const [messages] = sendExpoMock.mock.calls[0] as [Array<{ to: string }>, Map<string, string>];
    const tokens = messages.map((m) => m.to);
    expect(tokens).toContain(appToken);
    expect(tokens).toContain(legacyToken);
  });

  it("rispetta filterUserIdsByPreference: non invia se le preferenze dell'admin disabilitano system_alerts", async () => {
    getAppPushTokensMock.mockResolvedValue([
      { userId: "admin-1", token: "ExponentPushToken[admin-device]" },
    ]);
    // Simula preferenza disabilitata: filter restituisce array vuoto
    filterUserIdsMock.mockResolvedValue([]);

    const n = await sendSystemAlertPushToAdmins("Test", "Corpo", { type: "test" });

    expect(n).toBe(0);
    expect(sendExpoMock).not.toHaveBeenCalled();
  });

  it("restituisce 0 e non lancia quando non ci sono admin nel DB", async () => {
    adminDbRows.current = [];
    getAppPushTokensMock.mockResolvedValue([]);

    await expect(
      sendSystemAlertPushToAdmins("Test", "Corpo", { type: "test" }),
    ).resolves.toBe(0);
    expect(sendExpoMock).not.toHaveBeenCalled();
  });
});
