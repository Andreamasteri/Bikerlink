/**
 * Tests: OTA _doReload flag survival across background reload attempts.
 *
 * The key behaviour under test (lib/ota-check.ts lines 76-90):
 *   - When reloadAsync() succeeds → AsyncStorage.removeItem(OTA_PENDING_KEY) is called
 *     (flag cleared, update was applied).
 *   - When reloadAsync() rejects (common on Android background) → removeItem is NOT called
 *     (flag survives, OtaStartupChecker picks it up on next cold-start).
 *
 * Strategy
 * ─────────
 * 1. vi.doMock() + vi.resetModules() + dynamic import gives a fresh module
 *    instance per test (resets all module-level vars: _pendingReload, lastCheckAt…).
 * 2. triggerOtaCheck("appstate") is called with:
 *      - checkForUpdateAsync → isAvailable: true
 *      - fetchUpdateAsync    → isNew: true
 *      - AppState.currentState = "active"  (so the code schedules on background)
 *    This writes OTA_PENDING_KEY="1" and registers the AppState listener.
 * 3. The captured AppState listener is invoked with "background".
 * 4. vi.useFakeTimers() + vi.advanceTimersByTimeAsync(5000) fires _doReload.
 * 5. Assertions differ between the two paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── per-test state shared between beforeEach and tests ──────────────────────
let capturedListeners: Array<(state: string) => void> = [];
let mockReloadAsync: ReturnType<typeof vi.fn>;
let mockSetItem: ReturnType<typeof vi.fn>;
let mockRemoveItem: ReturnType<typeof vi.fn>;
let asyncStorageStore: Record<string, string> = {};

// ── common helper: import a fresh module after doMock + resetModules ─────────
async function importFresh() {
  const mod = await import("../ota-check");
  return mod;
}

// ── setup / teardown ─────────────────────────────────────────────────────────
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();

  capturedListeners = [];
  asyncStorageStore = {};
  mockReloadAsync = vi.fn();

  mockSetItem = vi.fn((key: string, value: string) => {
    asyncStorageStore[key] = value;
    return Promise.resolve();
  });

  mockRemoveItem = vi.fn((key: string) => {
    delete asyncStorageStore[key];
    return Promise.resolve();
  });

  // Minimal global fetch stub (reportOtaEvent / runProbe use it).
  global.fetch = vi.fn().mockResolvedValue({
    status: 200,
    headers: { get: () => "application/json" },
    text: () => Promise.resolve("{}"),
  }) as unknown as typeof fetch;

  // expo-updates: update available, fetch succeeds, reload behaviour per-test.
  vi.doMock("expo-updates", () => ({
    checkForUpdateAsync: vi.fn().mockResolvedValue({ isAvailable: true }),
    fetchUpdateAsync: vi.fn().mockResolvedValue({ isNew: true }),
    reloadAsync: mockReloadAsync,
    updateId: "embedded",
    runtimeVersion: "1.0.0",
    updateUrl: null,
    channel: "default",
  }));

  // react-native: AppState.currentState = "active" triggers the "schedule on bg" path.
  vi.doMock("react-native", () => ({
    AppState: {
      currentState: "active",
      addEventListener: vi.fn((_event: string, listener: (s: string) => void) => {
        capturedListeners.push(listener);
        return {
          remove: vi.fn(() => {
            capturedListeners = capturedListeners.filter((l) => l !== listener);
          }),
        };
      }),
    },
    Platform: { OS: "android" },
  }));

  vi.doMock("@react-native-async-storage/async-storage", () => ({
    default: {
      setItem: mockSetItem,
      removeItem: mockRemoveItem,
      getItem: vi.fn((key: string) => Promise.resolve(asyncStorageStore[key] ?? null)),
    },
  }));

  vi.doMock("@/lib/query-client", () => ({
    getApiUrl: () => "http://localhost:5000",
  }));

  vi.doMock("@/lib/ota-stuck", () => ({
    getLastFetchedId: vi.fn().mockResolvedValue(null),
    setLastFetchedId: vi.fn().mockResolvedValue(undefined),
    incrementStuckSessions: vi.fn().mockResolvedValue(undefined),
  }));

  vi.doMock("@/lib/device-id", () => ({
    getCachedDeviceId: vi.fn().mockReturnValue("test-device"),
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────

describe("_doReload: OTA_PENDING_KEY flag persistence", () => {
  it("flag is REMOVED when reloadAsync() resolves (update applied)", async () => {
    mockReloadAsync.mockResolvedValue(undefined);

    const { triggerOtaCheck, OTA_PENDING_KEY } = await importFresh();

    // Trigger OTA check — app is active, so schedules reload on background.
    await triggerOtaCheck("appstate");

    // Verify the flag was written by triggerOtaCheck.
    expect(mockSetItem).toHaveBeenCalledWith(OTA_PENDING_KEY, "1");
    expect(asyncStorageStore[OTA_PENDING_KEY]).toBe("1");

    // At least one AppState listener should have been registered.
    expect(capturedListeners.length).toBeGreaterThan(0);

    // Simulate app going to background → starts the 5 s timer.
    for (const listener of capturedListeners) listener("background");

    // Advance past BG_RELOAD_DELAY_MS (5 000 ms) to fire _doReload.
    await vi.advanceTimersByTimeAsync(5_500);

    // Let the Promise chain inside _doReload (.then → removeItem) resolve.
    await Promise.resolve();
    await Promise.resolve();

    // reloadAsync was called.
    expect(mockReloadAsync).toHaveBeenCalledTimes(1);

    // Flag must have been removed.
    expect(mockRemoveItem).toHaveBeenCalledWith(OTA_PENDING_KEY);
    expect(asyncStorageStore[OTA_PENDING_KEY]).toBeUndefined();
  });

  it("flag SURVIVES when reloadAsync() rejects (Android background failure)", async () => {
    mockReloadAsync.mockRejectedValue(new Error("reload-failed"));

    const { triggerOtaCheck, OTA_PENDING_KEY } = await importFresh();

    // Trigger OTA check.
    await triggerOtaCheck("appstate");

    // Verify flag was written.
    expect(mockSetItem).toHaveBeenCalledWith(OTA_PENDING_KEY, "1");
    expect(asyncStorageStore[OTA_PENDING_KEY]).toBe("1");

    expect(capturedListeners.length).toBeGreaterThan(0);

    // Simulate background.
    for (const listener of capturedListeners) listener("background");

    // Fire _doReload.
    await vi.advanceTimersByTimeAsync(5_500);

    // Let the rejection catch() settle.
    await Promise.resolve();
    await Promise.resolve();

    // reloadAsync was called (and failed).
    expect(mockReloadAsync).toHaveBeenCalledTimes(1);

    // Flag must NOT have been removed — OtaStartupChecker will pick it up.
    expect(mockRemoveItem).not.toHaveBeenCalledWith(OTA_PENDING_KEY);
    expect(asyncStorageStore[OTA_PENDING_KEY]).toBe("1");
  });
});
