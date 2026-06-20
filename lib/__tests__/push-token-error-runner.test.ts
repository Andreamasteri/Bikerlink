/**
 * Test per il rendering della causa del mancato push token nel runner
 * diagnostico (lib/diagnostic/runner.sections.ts → testPushToken).
 *
 * Quando il backend restituisce data.pushTokenError (la causa reale persistita
 * dal PushTokenRegistrar), il test "Push token registrato" deve mostrare la
 * label leggibile (es. "Permessi notifiche negati...") invece del WARN generico
 * basato sui permessi locali. Senza questo test, una regressione del rendering
 * farebbe perdere la causa reale in-app.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

vi.mock("expo-location", () => ({
  getForegroundPermissionsAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
  Accuracy: { Balanced: 3 },
}));

const getPermissionsAsync = vi.fn();
vi.mock("expo-notifications", () => ({
  getPermissionsAsync: () => getPermissionsAsync(),
}));

vi.mock("@/lib/query-client", () => ({
  getApiUrl: () => "http://localhost:5000",
  authFetchHeaders: () => ({}),
}));

import { testPushToken } from "@/lib/diagnostic/runner.sections";

function mockMeResponse(body: Record<string, unknown>): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  }));
}

describe("testPushToken — rendering causa persistita", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPermissionsAsync.mockResolvedValue({ status: "granted" });
  });

  it("token presente → PASS senza leggere la causa", async () => {
    mockMeResponse({ expoPushToken: "ExponentPushToken[xyz]" });
    const [result] = await testPushToken();
    expect(result.name).toBe("Push token registrato");
    expect(result.status).toBe("PASS");
  });

  it("token assente + pushTokenError → WARN con label leggibile", async () => {
    mockMeResponse({
      expoPushToken: null,
      pushTokenError: "PERMESSI_NEGATI",
      pushTokenErrorPlatform: "android",
    });
    const [result] = await testPushToken();
    expect(result.status).toBe("WARN");
    expect(result.message).toContain("PERMESSI_NEGATI");
    expect(result.message).toContain("Permessi notifiche negati");
    // Non deve cadere nel fallback generico sui permessi locali.
    expect(result.message).not.toContain("Permessi notifiche non concessi");
  });

  it("causa con detail → include il dettaglio tra parentesi", async () => {
    mockMeResponse({
      expoPushToken: null,
      pushTokenError: "TOKEN_NON_OTTENUTO",
      pushTokenErrorDetail: "FCM senderId mancante",
    });
    const [result] = await testPushToken();
    expect(result.status).toBe("WARN");
    expect(result.message).toContain("FCM/APNs non configurato");
    expect(result.message).toContain("(FCM senderId mancante)");
  });

  it("causa annidata sotto profile → comunque renderizzata", async () => {
    mockMeResponse({
      profile: { expoPushToken: null, pushTokenError: "PROJECT_ID_MANCANTE" },
    });
    const [result] = await testPushToken();
    expect(result.status).toBe("WARN");
    expect(result.message).toContain("EAS projectId mancante");
  });

  it("nessuna causa persistita → fallback al check permessi locale", async () => {
    mockMeResponse({ expoPushToken: null });
    getPermissionsAsync.mockResolvedValue({ status: "denied" });
    const [result] = await testPushToken();
    expect(result.status).toBe("WARN");
    expect(result.message).toContain("Permessi notifiche non concessi");
    expect(result.message).not.toContain("PERMESSI_NEGATI");
  });
});
