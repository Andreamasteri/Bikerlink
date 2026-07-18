/**
 * Tests: matching-dragonfly-blocked-collector watchdog signal coverage
 *
 * Verifies that collectMatchingDragonflyBlocked() emits the correct signals
 * and severities for:
 *   1. Not rejecting → empty signals
 *   2. Rejecting but isRedisAvailable=false (in-memory fallback active) → no alert
 *   3. Rejecting with isRedisAvailable=true, duration < threshold → no alert
 *   4. Rejecting with isRedisAvailable=true, duration ≥ threshold → "high" signal
 *   5. Recovery after a blocked period → "info" recovery signal
 *   6. Recovery signal not emitted twice for the same rientro
 *   7. Custom threshold read from storage (AppSetting)
 *   8. Signal details contain expected fields (blockedSinceAt, consecutiveCount, etc.)
 *
 * State (blockedSinceAt, recoveryEmittedAt, cachedThresholdMs) is reset via
 * _resetMatchingDragonflyBlockedStateForTests() before each test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── mock dependencies ───────────────────────────────────────────────────────
// These three modules are imported at module scope in the collector, so we must
// mock before importing the collector itself.

vi.mock("../../cache/redis", () => ({
  isRedisAvailable: vi.fn().mockReturnValue(true),
}));

vi.mock("../../cache/matching-lock", () => ({
  getDragonflyRejectionStreak: vi.fn().mockReturnValue({
    mostRecentRejectedAt: null,
    consecutiveCount: 0,
  }),
}));

vi.mock("../../storage", () => ({
  storage: {
    getAppSetting: vi.fn().mockResolvedValue(null),
  },
}));

import { isRedisAvailable } from "../../cache/redis";
import { getDragonflyRejectionStreak } from "../../cache/matching-lock";
import { storage } from "../../storage";
import {
  collectMatchingDragonflyBlocked,
  _resetMatchingDragonflyBlockedStateForTests,
} from "../../ai/watchdog/collectors/matching-dragonfly-blocked-collector";

// Typed aliases for vi mocks
const mockIsRedisAvailable = vi.mocked(isRedisAvailable);
const mockGetStreak = vi.mocked(getDragonflyRejectionStreak);
const mockGetAppSetting = vi.mocked(storage.getAppSetting);

// Default threshold: 60 min (3_600_000 ms) — matches DEFAULT_ALERT_THRESHOLD_MIN
const THRESHOLD_MS = 60 * 60_000;

// Helper: set the streak to "currently rejecting"
function setRejecting(consecutiveCount = 5, msAgo = 30_000) {
  mockGetStreak.mockReturnValue({
    mostRecentRejectedAt: Date.now() - msAgo,
    consecutiveCount,
  });
}

// Helper: set the streak to "not rejecting" (stale or null)
function setNotRejecting() {
  mockGetStreak.mockReturnValue({
    mostRecentRejectedAt: null,
    consecutiveCount: 0,
  });
}

beforeEach(() => {
  _resetMatchingDragonflyBlockedStateForTests();
  mockIsRedisAvailable.mockReturnValue(true);
  setNotRejecting();
  mockGetAppSetting.mockResolvedValue(null); // default threshold
  vi.restoreAllMocks();
});

afterEach(() => {
  _resetMatchingDragonflyBlockedStateForTests();
});

// ─── no rejection ────────────────────────────────────────────────────────────

describe("matching-dragonfly-blocked-collector: no rejection", () => {
  it("returns empty array when there is no recent rejection", async () => {
    setNotRejecting();
    const signals = await collectMatchingDragonflyBlocked();
    expect(signals).toEqual([]);
  });

  it("returns empty array when mostRecentRejectedAt is stale (> 5 min ago)", async () => {
    const SIX_MINUTES_MS = 6 * 60_000;
    mockGetStreak.mockReturnValue({
      mostRecentRejectedAt: Date.now() - SIX_MINUTES_MS,
      consecutiveCount: 10,
    });
    const signals = await collectMatchingDragonflyBlocked();
    expect(signals).toEqual([]);
  });
});

// ─── in-memory fallback active ───────────────────────────────────────────────

describe("matching-dragonfly-blocked-collector: in-memory fallback active", () => {
  it("returns empty array when isRedisAvailable() is false even if rejecting", async () => {
    mockIsRedisAvailable.mockReturnValue(false);
    setRejecting(10, 30_000);
    const signals = await collectMatchingDragonflyBlocked();
    expect(signals).toEqual([]);
  });
});

// ─── below threshold ─────────────────────────────────────────────────────────

describe("matching-dragonfly-blocked-collector: below threshold", () => {
  it("returns empty array when blocking duration is below the 60-min threshold", async () => {
    // Simulate: rejection started 30 min ago (well below 60 min threshold)
    mockGetStreak.mockReturnValue({
      mostRecentRejectedAt: Date.now() - 30_000, // recent = still actively rejecting
      consecutiveCount: 30,
    });
    // Make Date.now() return a value that puts blockedSinceAt 30 min in the past
    // by first calling to set blockedSinceAt to (now - THIRTY_MIN_MS) then checking
    // We can do this by calling once with a recently-set blockedSinceAt
    // The state is fresh, so the first call sets blockedSinceAt = mostRecentRejectedAt
    // which is Date.now() - 30s (recent). So blockedMs ≈ 30s, well below threshold.
    const signals = await collectMatchingDragonflyBlocked();
    expect(signals).toEqual([]);
  });

  it("does not emit when the latch is set but threshold not reached", async () => {
    // First call: sets blockedSinceAt to a recent timestamp
    setRejecting(3, 10_000);
    await collectMatchingDragonflyBlocked(); // sets blockedSinceAt

    // Second call still below threshold
    const signals = await collectMatchingDragonflyBlocked();
    expect(signals.find((s) => s.severity === "high")).toBeUndefined();
  });
});

// ─── threshold reached → high signal ────────────────────────────────────────

describe("matching-dragonfly-blocked-collector: threshold reached", () => {
  it("emits a high signal when blocking duration exceeds the threshold", async () => {
    // Simulate: mostRecentRejectedAt is recent (actively rejecting)
    setRejecting(42, 30_000);

    // First call: sets blockedSinceAt to (now - 30s) = well within 5 min stale window
    await collectMatchingDragonflyBlocked();

    // Advance blockedSinceAt into the past by patching Date.now so that
    // blockedMs = now - blockedSinceAt > threshold
    const originalNow = Date.now.bind(Date);
    vi.spyOn(Date, "now").mockImplementation(() => originalNow() + THRESHOLD_MS + 60_000);

    // mostRecentRejectedAt still looks recent relative to the new "now"
    mockGetStreak.mockReturnValue({
      mostRecentRejectedAt: originalNow() + THRESHOLD_MS, // within 5 min stale window from mocked now
      consecutiveCount: 42,
    });

    const signals = await collectMatchingDragonflyBlocked();
    const high = signals.find((s) => s.severity === "high");
    expect(high).toBeDefined();
    expect(high!.source).toBe("matching");
    expect(high!.metric).toBe("dragonfly_blocked");
    expect(high!.unit).toBe("min");
    expect(typeof high!.value).toBe("number");
    expect(high!.value).toBeGreaterThan(0);
  });

  it("high signal details include blockedSinceAt, consecutiveCount, and thresholdMin", async () => {
    setRejecting(15, 30_000);
    await collectMatchingDragonflyBlocked(); // latch

    const originalNow = Date.now.bind(Date);
    vi.spyOn(Date, "now").mockImplementation(() => originalNow() + THRESHOLD_MS + 60_000);
    mockGetStreak.mockReturnValue({
      mostRecentRejectedAt: originalNow() + THRESHOLD_MS,
      consecutiveCount: 15,
    });

    const signals = await collectMatchingDragonflyBlocked();
    const high = signals.find((s) => s.metric === "dragonfly_blocked");
    expect(high!.details).toMatchObject({
      consecutiveCount: 15,
      thresholdMin: 60,
    });
    expect(typeof high!.details!.blockedSinceAt).toBe("string");
    // ISO string check
    expect(new Date(high!.details!.blockedSinceAt as string).getTime()).toBeGreaterThan(0);
  });

  it("custom threshold from storage is applied (10 min)", async () => {
    // Custom threshold: 10 min
    mockGetAppSetting.mockResolvedValue({ value: "10" } as never);

    setRejecting(5, 30_000);
    await collectMatchingDragonflyBlocked(); // latch (blockedSinceAt set)

    const originalNow = Date.now.bind(Date);
    const CUSTOM_THRESHOLD_MS = 10 * 60_000;
    vi.spyOn(Date, "now").mockImplementation(() => originalNow() + CUSTOM_THRESHOLD_MS + 30_000);
    mockGetStreak.mockReturnValue({
      mostRecentRejectedAt: originalNow() + CUSTOM_THRESHOLD_MS, // recent
      consecutiveCount: 5,
    });

    const signals = await collectMatchingDragonflyBlocked();
    const high = signals.find((s) => s.metric === "dragonfly_blocked");
    expect(high).toBeDefined();
    expect(high!.details).toMatchObject({ thresholdMin: 10 });
  });
});

// ─── recovery ────────────────────────────────────────────────────────────────

describe("matching-dragonfly-blocked-collector: recovery signal", () => {
  it("emits an info recovery signal when blocking resolves", async () => {
    // Latch a blocking state
    setRejecting(8, 30_000);
    await collectMatchingDragonflyBlocked(); // sets blockedSinceAt

    // Now blocking clears
    setNotRejecting();
    const signals = await collectMatchingDragonflyBlocked();

    const recovery = signals.find((s) => s.metric === "dragonfly_blocked_recovered");
    expect(recovery).toBeDefined();
    expect(recovery!.source).toBe("matching");
    expect(recovery!.severity).toBe("info");
    expect(recovery!.unit).toBe("min");
  });

  it("recovery signal details include blockedSinceAt and recoveredAt", async () => {
    setRejecting(3, 30_000);
    await collectMatchingDragonflyBlocked(); // latch

    setNotRejecting();
    const signals = await collectMatchingDragonflyBlocked();

    const recovery = signals.find((s) => s.metric === "dragonfly_blocked_recovered");
    expect(typeof recovery!.details!.blockedSinceAt).toBe("string");
    expect(typeof recovery!.details!.recoveredAt).toBe("string");
    expect(typeof recovery!.details!.blockedMin).toBe("number");
  });

  it("does not emit a recovery signal when there was no prior blocked period", async () => {
    // State is fresh; no blockedSinceAt set
    setNotRejecting();
    const signals = await collectMatchingDragonflyBlocked();
    expect(signals.find((s) => s.metric === "dragonfly_blocked_recovered")).toBeUndefined();
  });

  it("emits the recovery signal only once (not on subsequent calls after recovery)", async () => {
    // Latch → then clear
    setRejecting(4, 30_000);
    await collectMatchingDragonflyBlocked(); // latch

    setNotRejecting();
    const first = await collectMatchingDragonflyBlocked(); // recovery emitted
    const second = await collectMatchingDragonflyBlocked(); // should NOT emit again

    const firstRecoveries = first.filter((s) => s.metric === "dragonfly_blocked_recovered");
    const secondRecoveries = second.filter((s) => s.metric === "dragonfly_blocked_recovered");

    expect(firstRecoveries).toHaveLength(1);
    expect(secondRecoveries).toHaveLength(0);
  });

  it("resets state correctly so a new block can be latched after recovery", async () => {
    // First block + recovery
    setRejecting(3, 30_000);
    await collectMatchingDragonflyBlocked();
    setNotRejecting();
    await collectMatchingDragonflyBlocked(); // recovery emitted, blockedSinceAt = null

    // Second block: latch first with real Date.now (blockedSinceAt = T0 ≈ now)
    setRejecting(7, 30_000);
    await collectMatchingDragonflyBlocked(); // latch: blockedSinceAt = T0

    // Now advance "now" so that blockedMs = (T0 + threshold + delta) - T0 > threshold
    const originalNow = Date.now.bind(Date);
    vi.spyOn(Date, "now").mockImplementation(() => originalNow() + THRESHOLD_MS + 60_000);
    // Keep mostRecentRejectedAt recent relative to the mocked "now"
    mockGetStreak.mockReturnValue({
      mostRecentRejectedAt: originalNow() + THRESHOLD_MS, // within 5 min of mocked now
      consecutiveCount: 7,
    });

    const signals = await collectMatchingDragonflyBlocked();
    // The new block should emit a high signal (threshold exceeded)
    const high = signals.find((s) => s.metric === "dragonfly_blocked");
    expect(high).toBeDefined();
    expect(high!.severity).toBe("high");
  });
});

// ─── storage error fallback ───────────────────────────────────────────────────

describe("matching-dragonfly-blocked-collector: storage error fallback", () => {
  it("falls back to 60-min default when getAppSetting throws", async () => {
    mockGetAppSetting.mockRejectedValue(new Error("DB timeout"));

    setRejecting(5, 30_000);
    await collectMatchingDragonflyBlocked(); // latch

    const originalNow = Date.now.bind(Date);
    vi.spyOn(Date, "now").mockImplementation(() => originalNow() + THRESHOLD_MS + 60_000);
    mockGetStreak.mockReturnValue({
      mostRecentRejectedAt: originalNow() + THRESHOLD_MS,
      consecutiveCount: 5,
    });

    const signals = await collectMatchingDragonflyBlocked();
    const high = signals.find((s) => s.metric === "dragonfly_blocked");
    expect(high).toBeDefined();
    // Fell back to 60 min threshold
    expect(high!.details).toMatchObject({ thresholdMin: 60 });
  });

  it("falls back to 60-min default when AppSetting value is not a valid number", async () => {
    mockGetAppSetting.mockResolvedValue({ value: "not-a-number" } as never);

    setRejecting(5, 30_000);
    await collectMatchingDragonflyBlocked(); // latch

    const originalNow = Date.now.bind(Date);
    vi.spyOn(Date, "now").mockImplementation(() => originalNow() + THRESHOLD_MS + 60_000);
    mockGetStreak.mockReturnValue({
      mostRecentRejectedAt: originalNow() + THRESHOLD_MS,
      consecutiveCount: 5,
    });

    const signals = await collectMatchingDragonflyBlocked();
    const high = signals.find((s) => s.metric === "dragonfly_blocked");
    expect(high!.details).toMatchObject({ thresholdMin: 60 });
  });
});
