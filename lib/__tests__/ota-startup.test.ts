/**
 * Tests: applyPendingOtaIfNeeded (lib/ota-startup.ts)
 *
 * This is the cold-start path: OtaStartupChecker calls this function on every
 * app launch. If OTA_PENDING_KEY is set, reloadAsync() is fired immediately
 * (before the normal 3-second timer). The key must survive a failed reload so
 * the next cold-start can retry.
 *
 * Key invariants under test:
 *   - reloadAsync() resolves → removeItem(OTA_PENDING_KEY) IS called (flag cleared)
 *   - reloadAsync() rejects  → removeItem(OTA_PENDING_KEY) is NOT called (flag survives)
 *   - OTA_PENDING_KEY not set → reloadAsync() is never called
 *   - mounted = false at read time → reloadAsync() is never called
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let mockReloadAsync: ReturnType<typeof vi.fn>;
let mockGetItem: ReturnType<typeof vi.fn>;
let mockSetItem: ReturnType<typeof vi.fn>;
let mockRemoveItem: ReturnType<typeof vi.fn>;
let asyncStorageStore: Record<string, string | null>;

async function importFresh() {
  const mod = await import("../ota-startup");
  return mod;
}

beforeEach(() => {
  vi.resetModules();

  asyncStorageStore = {};
  mockReloadAsync = vi.fn();

  mockGetItem = vi.fn((key: string) =>
    Promise.resolve(asyncStorageStore[key] ?? null),
  );
  mockSetItem = vi.fn((key: string, value: string) => {
    asyncStorageStore[key] = value;
    return Promise.resolve();
  });
  mockRemoveItem = vi.fn((key: string) => {
    delete asyncStorageStore[key];
    return Promise.resolve();
  });

  vi.doMock("expo-updates", () => ({
    reloadAsync: mockReloadAsync,
    updateId: "embedded",
    runtimeVersion: "1.0.0",
  }));

  vi.doMock("react-native", () => ({
    Platform: { OS: "android" },
  }));

  vi.doMock("@react-native-async-storage/async-storage", () => ({
    default: {
      getItem: mockGetItem,
      setItem: mockSetItem,
      removeItem: mockRemoveItem,
    },
  }));

  vi.doMock("@/lib/ota-check", () => ({
    OTA_PENDING_KEY: "@bikerlink/ota_pending_reload",
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("applyPendingOtaIfNeeded — cold-start path", () => {
  it("removes the flag when reloadAsync() resolves (update applied successfully)", async () => {
    mockReloadAsync.mockResolvedValue(undefined);
    asyncStorageStore["@bikerlink/ota_pending_reload"] = "1";

    const { applyPendingOtaIfNeeded } = await importFresh();

    const result = await applyPendingOtaIfNeeded(() => true);

    expect(result).toBe(true);
    expect(mockReloadAsync).toHaveBeenCalledTimes(1);

    // Let the .then() inside reloadAsync().then(...) settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(mockRemoveItem).toHaveBeenCalledWith(
      "@bikerlink/ota_pending_reload",
    );
    expect(asyncStorageStore["@bikerlink/ota_pending_reload"]).toBeUndefined();
  });

  it("flag SURVIVES when reloadAsync() rejects (failed cold-start reload)", async () => {
    mockReloadAsync.mockRejectedValue(new Error("reload-failed"));
    asyncStorageStore["@bikerlink/ota_pending_reload"] = "1";

    const { applyPendingOtaIfNeeded } = await importFresh();

    const result = await applyPendingOtaIfNeeded(() => true);

    expect(result).toBe(true);
    expect(mockReloadAsync).toHaveBeenCalledTimes(1);

    // Let the .catch() inside reloadAsync().catch(...) settle.
    await Promise.resolve();
    await Promise.resolve();

    // removeItem must NOT have been called — flag stays for the next cold-start.
    expect(mockRemoveItem).not.toHaveBeenCalledWith(
      "@bikerlink/ota_pending_reload",
    );
    expect(asyncStorageStore["@bikerlink/ota_pending_reload"]).toBe("1");
  });

  it("does nothing and returns false when the flag is absent", async () => {
    mockReloadAsync.mockResolvedValue(undefined);

    const { applyPendingOtaIfNeeded } = await importFresh();

    const result = await applyPendingOtaIfNeeded(() => true);

    expect(result).toBe(false);
    expect(mockReloadAsync).not.toHaveBeenCalled();
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });

  it("does nothing when component unmounts before the flag is read (isMounted = false)", async () => {
    mockReloadAsync.mockResolvedValue(undefined);
    asyncStorageStore["@bikerlink/ota_pending_reload"] = "1";

    const { applyPendingOtaIfNeeded } = await importFresh();

    // isMounted returns false — simulates unmount between getItem and reload.
    const result = await applyPendingOtaIfNeeded(() => false);

    expect(result).toBe(false);
    expect(mockReloadAsync).not.toHaveBeenCalled();
    // Flag must remain untouched.
    expect(asyncStorageStore["@bikerlink/ota_pending_reload"]).toBe("1");
  });
});
