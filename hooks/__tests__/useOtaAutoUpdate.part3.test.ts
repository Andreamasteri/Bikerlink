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
function approvedManifest(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      allowed: true,
      isAdmin: false,
      releaseId: "release-p3",
      allowedEasUpdateId: "eas-upd-p3",
      allowedEasGroupId: "grp-p3",
      allowedEasUpdateIds: ["eas-upd-p3"],
      runtimeVersion: "54.10.27",
      otaVersion: "54.10.1",
      status: "approved",
      ...overrides,
    }),
  };
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
// Test 6 — Fail-closed: manifest senza id né group → skip fetchUpdateAsync
//
// Verifica che se il manifest restituito da checkForUpdateAsync non contiene
// né `id` né `group`, il hook non proceda con fetchUpdateAsync (fail-closed),
// invece di "passare attraverso" i tre blocchi di confronto e scaricare
// l'update non verificato.
// ══════════════════════════════════════════════════════════════════════════
describe("useOtaAutoUpdate — fail-closed: manifest senza identity info", () => {
  it("non chiama fetchUpdateAsync se manifest non ha né id né group", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(approvedManifest());

    checkForUpdateAsync.mockResolvedValue({
      isAvailable: true,
      manifest: {},
    });

    useOtaAutoUpdate(true);
    await flushPromises();

    expect(checkForUpdateAsync).toHaveBeenCalledTimes(1);
    expect(fetchUpdateAsync).not.toHaveBeenCalled();
    expect(reloadAsync).not.toHaveBeenCalled();
  });

  it("non chiama fetchUpdateAsync se manifest è null/undefined", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(approvedManifest());

    checkForUpdateAsync.mockResolvedValue({
      isAvailable: true,
      manifest: undefined,
    });

    useOtaAutoUpdate(true);
    await flushPromises();

    expect(checkForUpdateAsync).toHaveBeenCalledTimes(1);
    expect(fetchUpdateAsync).not.toHaveBeenCalled();
    expect(reloadAsync).not.toHaveBeenCalled();
  });

  it("non chiama fetchUpdateAsync se manifest ha id e group entrambi stringa vuota", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(approvedManifest());

    checkForUpdateAsync.mockResolvedValue({
      isAvailable: true,
      manifest: { id: "", group: "" },
    });

    useOtaAutoUpdate(true);
    await flushPromises();

    expect(fetchUpdateAsync).not.toHaveBeenCalled();
    expect(reloadAsync).not.toHaveBeenCalled();
  });

  it("procede normalmente quando il manifest ha un group valido", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(approvedManifest());

    checkForUpdateAsync.mockResolvedValue({
      isAvailable: true,
      manifest: { id: "eas-upd-p3", group: "grp-p3" },
    });
    fetchUpdateAsync.mockResolvedValue({ isNew: true });

    useOtaAutoUpdate(true);
    await flushPromises();

    expect(fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(reloadAsync).toHaveBeenCalledTimes(1);
  });

  it("procede normalmente quando il manifest ha solo id (senza group, fallback lista)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      approvedManifest({ allowedEasGroupId: null })
    );

    checkForUpdateAsync.mockResolvedValue({
      isAvailable: true,
      manifest: { id: "eas-upd-p3" },
    });
    fetchUpdateAsync.mockResolvedValue({ isNew: true });

    useOtaAutoUpdate(true);
    await flushPromises();

    expect(fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(reloadAsync).toHaveBeenCalledTimes(1);
  });
});
