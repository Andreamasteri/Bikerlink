import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── helpers ────────────────────────────────────────────────────────────────
const OTA_STARTUP_DELAY_MS = 4000;
const flushPromises = () => vi.advanceTimersByTimeAsync(OTA_STARTUP_DELAY_MS + 1000);

// ── mock: expo-updates ─────────────────────────────────────────────────────
const checkForUpdateAsync = vi.hoisted(() => vi.fn());
const fetchUpdateAsync = vi.hoisted(() => vi.fn());
const reloadAsync = vi.hoisted(() => vi.fn());

vi.mock("expo-updates", () => ({
  checkForUpdateAsync,
  fetchUpdateAsync,
  reloadAsync,
  isEnabled: true,
  updateId: null,
  runtimeVersion: "54.10.27",
}));

// ── mock: react-native ─────────────────────────────────────────────────────
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  InteractionManager: {
    runAfterInteractions: (cb: () => void) => {
      const id = setTimeout(cb, 0);
      return { cancel: () => clearTimeout(id) };
    },
  },
}));

// ── mock: expo-device ─────────────────────────────────────────────────────
vi.mock("expo-device", () => ({
  modelName: "iPhone 15 Pro",
}));

// ── mock: AsyncStorage ─────────────────────────────────────────────────────
const asyncStorageGetItem = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const asyncStorageSetItem = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const asyncStorageRemoveItem = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: asyncStorageGetItem,
    setItem: asyncStorageSetItem,
    removeItem: asyncStorageRemoveItem,
  },
}));

// ── mock: @/lib/query-client ───────────────────────────────────────────────
const authFetchHeadersMock = vi.hoisted(() =>
  vi.fn().mockReturnValue({ "Content-Type": "application/json" })
);
const getSessionTokenMock = vi.hoisted(() => vi.fn<() => string | null>().mockReturnValue(null));

vi.mock("@/lib/query-client", () => ({
  getApiUrl: () => "http://localhost:5000",
  authFetchHeaders: authFetchHeadersMock,
  getSessionToken: getSessionTokenMock,
}));

// ── mock: react ────────────────────────────────────────────────────────────
vi.mock("react", () => ({
  useEffect: (fn: () => void | (() => void)) => { fn(); },
  useRef: (initial: unknown) => ({ current: initial }),
}));

// ── import del modulo sotto test (DOPO i mock) ────────────────────────────
import { useOtaAutoUpdate } from "../useOtaAutoUpdate";

// ── helpers per costruire risposte fetch ───────────────────────────────────
function approvedManifest() {
  return {
    ok: true,
    json: async () => ({
      allowed: true,
      isAdmin: false,
      releaseId: "release-xyz",
      allowedEasUpdateId: "eas-upd-001",
      allowedEasGroupId: "grp-001",
      allowedEasUpdateIds: ["eas-upd-001"],
      runtimeVersion: "54.10.27",
      otaVersion: "54.10.1",
      status: "approved",
    }),
  };
}

function withStableDeviceId() {
  asyncStorageGetItem.mockImplementation(async (key: string) => {
    if (key === "bikerlink:ota:device-id:v1") return "test-device-unit-001";
    return null;
  });
}

function captureEventBody(
  fetchMock: ReturnType<typeof vi.fn>
): Record<string, unknown> | null {
  const eventCall = (
    fetchMock.mock.calls as Array<[string, { body?: string }]>
  ).find(([url]) => url.includes("/api/ota/event"));
  if (!eventCall) return null;
  return JSON.parse(eventCall[1].body ?? "{}") as Record<string, unknown>;
}

// ── setup ──────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
  fetchUpdateAsync.mockResolvedValue({ isNew: false });
  reloadAsync.mockResolvedValue(undefined);
  authFetchHeadersMock.mockReturnValue({ "Content-Type": "application/json" });
  getSessionTokenMock.mockReturnValue(null);
  asyncStorageGetItem.mockResolvedValue(null);
  asyncStorageSetItem.mockResolvedValue(undefined);
  asyncStorageRemoveItem.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

// ══════════════════════════════════════════════════════════════════════════
// Test 5 — postOtaEvent: sessionToken nel body al cold start pre-login.
// ══════════════════════════════════════════════════════════════════════════
describe("postOtaEvent — sessionToken fallback nel body al cold start pre-login", () => {
  it("include sessionToken nel body quando Authorization è assente", async () => {
    authFetchHeadersMock.mockReturnValue({ "Content-Type": "application/json" });
    getSessionTokenMock.mockReturnValue("s%3Amy-session-id.my-hmac");
    withStableDeviceId();

    checkForUpdateAsync.mockResolvedValue({
      isAvailable: true,
      manifest: { id: "eas-upd-001", group: "grp-001" },
    });
    fetchUpdateAsync.mockResolvedValue({ isNew: true });
    reloadAsync.mockResolvedValue(undefined);

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if ((url as string).includes("/api/ota/manifest")) return approvedManifest();
      return { ok: true, json: async () => ({ ok: true }) };
    });
    globalThis.fetch = fetchMock;

    useOtaAutoUpdate(true);
    await flushPromises();

    const body = captureEventBody(fetchMock);
    expect(body).not.toBeNull();
    expect(body!.sessionToken).toBe("s%3Amy-session-id.my-hmac");
    expect(body!.eventType).toBe("downloaded");
  });

  it("NON include sessionToken nel body quando Authorization è presente", async () => {
    authFetchHeadersMock.mockReturnValue({
      "Content-Type": "application/json",
      Authorization: "Bearer my-valid-token",
    });
    getSessionTokenMock.mockReturnValue("should-not-appear-in-body");
    withStableDeviceId();

    checkForUpdateAsync.mockResolvedValue({
      isAvailable: true,
      manifest: { id: "eas-upd-001", group: "grp-001" },
    });
    fetchUpdateAsync.mockResolvedValue({ isNew: true });
    reloadAsync.mockResolvedValue(undefined);

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if ((url as string).includes("/api/ota/manifest")) return approvedManifest();
      return { ok: true, json: async () => ({ ok: true }) };
    });
    globalThis.fetch = fetchMock;

    useOtaAutoUpdate(true);
    await flushPromises();

    const body = captureEventBody(fetchMock);
    expect(body).not.toBeNull();
    expect(body!.sessionToken).toBeUndefined();
    expect(body!.eventType).toBe("downloaded");
  });

  it("NON include sessionToken nel body quando getSessionToken() ritorna null", async () => {
    authFetchHeadersMock.mockReturnValue({ "Content-Type": "application/json" });
    getSessionTokenMock.mockReturnValue(null);
    withStableDeviceId();

    checkForUpdateAsync.mockResolvedValue({
      isAvailable: true,
      manifest: { id: "eas-upd-001", group: "grp-001" },
    });
    fetchUpdateAsync.mockResolvedValue({ isNew: true });
    reloadAsync.mockResolvedValue(undefined);

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if ((url as string).includes("/api/ota/manifest")) return approvedManifest();
      return { ok: true, json: async () => ({ ok: true }) };
    });
    globalThis.fetch = fetchMock;

    useOtaAutoUpdate(true);
    await flushPromises();

    const body = captureEventBody(fetchMock);
    expect(body).not.toBeNull();
    expect(body!.sessionToken).toBeUndefined();
  });
});
