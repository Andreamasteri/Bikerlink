/**
 * Tests: getDragonflyRejectionStreak() and forceUnlockMatchingLock() in
 * server/cache/matching-lock.ts
 *
 * getDragonflyRejectionStreak() verifies:
 *  1. Empty history → {consecutiveCount: 0, mostRecentRejectedAt: null}
 *  2. Each dragonfly rejection increments the consecutive count
 *  3. A successful dragonfly acquire resets the streak to 0
 *  4. mostRecentRejectedAt is correctly set to the most-recent rejection timestamp
 *  5. In-memory rejections (source="memory") do not contribute to the streak
 *  6. Non-rejection events at the tail (e.g. "released") break the streak
 *
 * forceUnlockMatchingLock() verifies:
 *  7. wasHeld=false and no crash when no lock is held
 *  8. wasHeld=true and correct holder when an in-memory lock is active
 *  9. State is fully cleared so a subsequent withMatchingLock can acquire
 * 10. wasHeld=true and correct holder when a dragonfly lock is active
 * 11. Holder details (owner, source) are accurate in the returned object
 *
 * Module-level history state is fully reset via vi.resetModules() + re-import
 * before each test. No external Redis/DragonflyDB connection is required.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Spin up a fresh instance of matching-lock.ts with controlled Redlock and
 * Redis behaviour so the module-level `history` array starts empty each time.
 *
 * @param isRedisAvail  - whether isRedisAvailable() returns true
 * @param acquireThrows - whether Redlock.acquire() throws (simulates "held by
 *                        another owner" → pushes a dragonfly "rejected" event)
 */
async function freshMatchingLock({
  isRedisAvail = true,
  acquireThrows = false,
}: {
  isRedisAvail?: boolean;
  acquireThrows?: boolean;
} = {}) {
  vi.resetModules();

  const mockRelease = vi.fn().mockResolvedValue(undefined);
  const mockAcquire = acquireThrows
    ? vi.fn().mockRejectedValue(
        new Error("ExecutionError: the operation was unable to achieve a quorum"),
      )
    : vi.fn().mockResolvedValue({
        release: mockRelease,
        attempts: [],
        expiration: Date.now() + 300_000,
      });

  // Redlock is used with `new Redlock(...)` — the mock MUST use a regular
  // function (not an arrow function) so it is constructable.
  vi.doMock("redlock", () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    default: vi.fn().mockImplementation(function (this: any) {
      this.acquire = mockAcquire;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.on = vi.fn<any>();
    }),
  }));

  const mockRedisClient = {
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  };

  vi.doMock("../../cache/redis", () => ({
    getRawRedis: vi.fn().mockReturnValue(isRedisAvail ? mockRedisClient : null),
    isRedisAvailable: vi.fn().mockReturnValue(isRedisAvail),
  }));

  // Dynamic import picks up the freshly-registered doMocks.
  const mod = await import("../../cache/matching-lock");
  return { mod, mockAcquire, mockRelease };
}

// ---------------------------------------------------------------------------
// 1. empty history
// ---------------------------------------------------------------------------

describe("getDragonflyRejectionStreak – empty history", () => {
  it("returns consecutiveCount=0 and mostRecentRejectedAt=null when no events have been recorded", async () => {
    const { mod } = await freshMatchingLock();
    const result = mod.getDragonflyRejectionStreak();
    expect(result.consecutiveCount).toBe(0);
    expect(result.mostRecentRejectedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. streak increments on each dragonfly rejection
// ---------------------------------------------------------------------------

describe("getDragonflyRejectionStreak – streak increments", () => {
  it("records consecutiveCount=1 after a single dragonfly rejection", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: true, acquireThrows: true });

    await mod.withMatchingLock("owner-a", async () => "irrelevant");

    const { consecutiveCount, mostRecentRejectedAt } = mod.getDragonflyRejectionStreak();
    expect(consecutiveCount).toBe(1);
    expect(mostRecentRejectedAt).not.toBeNull();
  });

  it("records consecutiveCount=3 after three consecutive dragonfly rejections", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: true, acquireThrows: true });

    await mod.withMatchingLock("owner-a", async () => "r1");
    await mod.withMatchingLock("owner-b", async () => "r2");
    await mod.withMatchingLock("owner-c", async () => "r3");

    const { consecutiveCount } = mod.getDragonflyRejectionStreak();
    expect(consecutiveCount).toBe(3);
  });

  it("does not exceed the history cap (HISTORY_MAX=10) — still returns correct tail streak", async () => {
    // Force 12 rejections; history is capped at 10, tail still all-rejected.
    const { mod } = await freshMatchingLock({ isRedisAvail: true, acquireThrows: true });

    for (let i = 0; i < 12; i++) {
      await mod.withMatchingLock(`owner-${i}`, async () => "r");
    }

    const { consecutiveCount } = mod.getDragonflyRejectionStreak();
    // History cap is 10, all 10 slots are dragonfly rejections → count = 10.
    expect(consecutiveCount).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 3. streak resets after a successful dragonfly acquire
// ---------------------------------------------------------------------------

describe("getDragonflyRejectionStreak – resets after successful acquire", () => {
  it("resets streak to 0 after a successful acquire follows rejections", async () => {
    // Phase 1: two rejections
    const { mod, mockAcquire, mockRelease } = await freshMatchingLock({
      isRedisAvail: true,
      acquireThrows: true,
    });
    await mod.withMatchingLock("owner-a", async () => "r1");
    await mod.withMatchingLock("owner-b", async () => "r2");

    // Phase 2: switch to successful acquire
    mockAcquire.mockResolvedValue({
      release: mockRelease,
      attempts: [],
      expiration: Date.now() + 300_000,
    });
    await mod.withMatchingLock("owner-c", async () => "success");

    const { consecutiveCount, mostRecentRejectedAt } = mod.getDragonflyRejectionStreak();
    expect(consecutiveCount).toBe(0);
    expect(mostRecentRejectedAt).toBeNull();
  });

  it("streak is 0 and mostRecentRejectedAt is null immediately after the first successful acquire", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: true, acquireThrows: false });

    await mod.withMatchingLock("owner-a", async () => "ok");

    const { consecutiveCount, mostRecentRejectedAt } = mod.getDragonflyRejectionStreak();
    expect(consecutiveCount).toBe(0);
    expect(mostRecentRejectedAt).toBeNull();
  });

  it("can re-accumulate a new streak after a reset", async () => {
    const { mod, mockAcquire, mockRelease } = await freshMatchingLock({
      isRedisAvail: true,
      acquireThrows: true,
    });

    // First rejection
    await mod.withMatchingLock("owner-a", async () => "r1");

    // Clear via a success
    mockAcquire.mockResolvedValue({
      release: mockRelease,
      attempts: [],
      expiration: Date.now() + 300_000,
    });
    await mod.withMatchingLock("owner-b", async () => "success");

    // New rejection pair
    mockAcquire.mockRejectedValue(new Error("held again"));
    await mod.withMatchingLock("owner-c", async () => "r2");
    await mod.withMatchingLock("owner-d", async () => "r3");

    const { consecutiveCount } = mod.getDragonflyRejectionStreak();
    expect(consecutiveCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 4. mostRecentRejectedAt timestamp accuracy
// ---------------------------------------------------------------------------

describe("getDragonflyRejectionStreak – mostRecentRejectedAt timestamp", () => {
  it("sets mostRecentRejectedAt to a timestamp close to when the rejection occurred", async () => {
    const before = Date.now();
    const { mod } = await freshMatchingLock({ isRedisAvail: true, acquireThrows: true });
    await mod.withMatchingLock("owner-a", async () => "r1");
    const after = Date.now();

    const { mostRecentRejectedAt } = mod.getDragonflyRejectionStreak();
    expect(mostRecentRejectedAt).not.toBeNull();
    expect(mostRecentRejectedAt as number).toBeGreaterThanOrEqual(before);
    expect(mostRecentRejectedAt as number).toBeLessThanOrEqual(after + 10);
  });

  it("mostRecentRejectedAt reflects the LAST rejection (not the first)", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: true, acquireThrows: true });

    await mod.withMatchingLock("owner-a", async () => "r1");
    const midPoint = Date.now();
    // Brief pause so timestamps differ measurably (Node tick)
    await new Promise<void>((r) => setTimeout(r, 5));
    await mod.withMatchingLock("owner-b", async () => "r2");

    const { mostRecentRejectedAt } = mod.getDragonflyRejectionStreak();
    expect(mostRecentRejectedAt).not.toBeNull();
    // The most-recent rejection happened after midPoint
    expect(mostRecentRejectedAt as number).toBeGreaterThanOrEqual(midPoint);
  });
});

// ---------------------------------------------------------------------------
// 5. memory-mode rejections do NOT count
// ---------------------------------------------------------------------------

describe("getDragonflyRejectionStreak – memory mode rejections ignored", () => {
  it("returns consecutiveCount=0 when Redis is unavailable (memory fallback) even if a lock is held", async () => {
    // Use memory-only mode (isRedisAvail: false)
    const { mod } = await freshMatchingLock({ isRedisAvail: false });

    let resolveInner!: () => void;
    const innerDone = new Promise<void>((res) => { resolveInner = res; });
    // Acquire memory lock asynchronously (keep it held while we test rejection)
    const holdPromise = mod.withMatchingLock("holder", async () => { await innerDone; });

    // Second call in the SAME module instance → hits "already_held" with source="memory"
    const rejected = await mod.withMatchingLock("challenger", async () => "nope");
    expect(rejected.acquired).toBe(false);

    // Release holder
    resolveInner();
    await holdPromise;

    // getDragonflyRejectionStreak must still return 0 — all events are source="memory"
    const { consecutiveCount, mostRecentRejectedAt } = mod.getDragonflyRejectionStreak();
    expect(consecutiveCount).toBe(0);
    expect(mostRecentRejectedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. non-rejection tail breaks the streak
// ---------------------------------------------------------------------------

describe("getDragonflyRejectionStreak – tail event order matters", () => {
  it("returns consecutiveCount=0 when the tail is a 'released' event (not a rejection)", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: true, acquireThrows: false });

    // Success → pushes "acquired" + "released" (source=dragonfly)
    await mod.withMatchingLock("owner-a", async () => "ok");

    const { consecutiveCount, mostRecentRejectedAt } = mod.getDragonflyRejectionStreak();
    expect(consecutiveCount).toBe(0);
    expect(mostRecentRejectedAt).toBeNull();
  });

  it("only counts the TAIL consecutive rejections (earlier non-rejection breaks the run)", async () => {
    const { mod, mockAcquire, mockRelease } = await freshMatchingLock({
      isRedisAvail: true,
      acquireThrows: false,
    });

    // Success first — pushes "acquired" + "released"
    await mod.withMatchingLock("owner-a", async () => "ok");

    // Then two dragonfly rejections
    mockAcquire.mockRejectedValue(new Error("held"));
    await mod.withMatchingLock("owner-b", async () => "r1");
    await mod.withMatchingLock("owner-c", async () => "r2");

    const { consecutiveCount } = mod.getDragonflyRejectionStreak();
    // Tail has 2 consecutive dragonfly rejections; earlier "released" breaks the run
    expect(consecutiveCount).toBe(2);
    void mockRelease; // suppress unused-var
  });
});

// ---------------------------------------------------------------------------
// 7. forceUnlockMatchingLock – no lock held
// ---------------------------------------------------------------------------

describe("forceUnlockMatchingLock – no lock held", () => {
  it("returns wasHeld=false and holder=null when no lock is active", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: false });

    const result = mod.forceUnlockMatchingLock();

    expect(result.wasHeld).toBe(false);
    expect(result.holder).toBeNull();
  });

  it("does not throw when called with no lock held", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: false });

    expect(() => mod.forceUnlockMatchingLock()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 8 & 9. forceUnlockMatchingLock – in-memory lock active
// ---------------------------------------------------------------------------

describe("forceUnlockMatchingLock – in-memory lock active", () => {
  it("returns wasHeld=true and the correct holder owner while a memory lock is held", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: false });

    let resolveInner!: () => void;
    const innerDone = new Promise<void>((res) => { resolveInner = res; });

    // Start acquiring the lock; keep it held while we inspect.
    const holdPromise = mod.withMatchingLock("memory-owner", async () => {
      await innerDone;
    });

    // forceUnlock while the fn is still executing (lock is active).
    const result = mod.forceUnlockMatchingLock();

    expect(result.wasHeld).toBe(true);
    expect(result.holder).not.toBeNull();
    expect(result.holder?.owner).toBe("memory-owner");
    expect(result.holder?.source).toBe("memory");

    // Allow the original fn to finish (it will still run, but the lock is gone).
    resolveInner();
    await holdPromise;
  });

  it("clears state so a subsequent withMatchingLock can acquire after force-unlock", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: false });

    let resolveFirst!: () => void;
    const firstDone = new Promise<void>((res) => { resolveFirst = res; });

    // Acquire and hold the lock.
    const holdPromise = mod.withMatchingLock("first-owner", async () => {
      await firstDone;
    });

    // Force-unlock while held.
    mod.forceUnlockMatchingLock();

    // Release the original fn.
    resolveFirst();
    await holdPromise;

    // A new acquire should now succeed immediately.
    const secondResult = await mod.withMatchingLock("second-owner", async () => "ok");
    expect(secondResult.acquired).toBe(true);
    if (secondResult.acquired) {
      expect(secondResult.result).toBe("ok");
    }
  });

  it("returns holder details including acquiredAt and expiresAt", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: false });

    const before = Date.now();

    let resolveInner!: () => void;
    const innerDone = new Promise<void>((res) => { resolveInner = res; });

    const holdPromise = mod.withMatchingLock("time-owner", async () => {
      await innerDone;
    });

    const { holder } = mod.forceUnlockMatchingLock();

    expect(holder).not.toBeNull();
    expect(holder!.acquiredAt).toBeGreaterThanOrEqual(before);
    expect(holder!.expiresAt).toBeGreaterThan(holder!.acquiredAt);

    resolveInner();
    await holdPromise;
  });
});

// ---------------------------------------------------------------------------
// 10 & 11. forceUnlockMatchingLock – dragonfly lock active
// ---------------------------------------------------------------------------

describe("forceUnlockMatchingLock – dragonfly lock active", () => {
  it("returns wasHeld=true and the correct holder owner while a dragonfly lock is held", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: true, acquireThrows: false });

    let resolveInner!: () => void;
    const innerDone = new Promise<void>((res) => { resolveInner = res; });

    // Acquire via dragonfly path (isRedisAvail=true, acquireThrows=false).
    const holdPromise = mod.withMatchingLock("dragonfly-owner", async () => {
      await innerDone;
    });

    // Yield to the event loop so the mock acquire resolves and memoryLockHolder
    // is populated before we inspect it.
    await Promise.resolve();

    // Force-unlock while the fn is still executing (awaiting innerDone).
    const result = mod.forceUnlockMatchingLock();

    expect(result.wasHeld).toBe(true);
    expect(result.holder).not.toBeNull();
    expect(result.holder?.owner).toBe("dragonfly-owner");
    expect(result.holder?.source).toBe("dragonfly");

    resolveInner();
    await holdPromise;
  });

  it("clears memoryLockHolder so a second force-unlock sees wasHeld=false", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: true, acquireThrows: false });

    let resolveInner!: () => void;
    const innerDone = new Promise<void>((res) => { resolveInner = res; });

    const holdPromise = mod.withMatchingLock("dragonfly-owner-2", async () => {
      await innerDone;
    });

    // Yield so the mock acquire resolves and sets memoryLockHolder.
    await Promise.resolve();

    // First force-unlock clears state.
    mod.forceUnlockMatchingLock();

    // Second force-unlock should see no lock.
    const second = mod.forceUnlockMatchingLock();
    expect(second.wasHeld).toBe(false);
    expect(second.holder).toBeNull();

    resolveInner();
    await holdPromise;
  });

  it("clears state so a subsequent withMatchingLock acquires via dragonfly after force-unlock", async () => {
    const { mod, mockAcquire, mockRelease } = await freshMatchingLock({
      isRedisAvail: true,
      acquireThrows: false,
    });

    let resolveFirst!: () => void;
    const firstDone = new Promise<void>((res) => { resolveFirst = res; });

    // Acquire and hold the dragonfly lock.
    const holdPromise = mod.withMatchingLock("first-dragonfly-owner", async () => {
      await firstDone;
    });

    // Yield so the mock acquire resolves and sets memoryLockHolder.
    await Promise.resolve();

    // Force-unlock while the lock is held.
    const unlockResult = mod.forceUnlockMatchingLock();
    expect(unlockResult.wasHeld).toBe(true);

    // Release the original fn.
    resolveFirst();
    await holdPromise;

    // A new withMatchingLock should now acquire successfully via dragonfly.
    const secondResult = await mod.withMatchingLock("second-dragonfly-owner", async () => "re-acquired");
    expect(secondResult.acquired).toBe(true);
    if (secondResult.acquired) {
      expect(secondResult.result).toBe("re-acquired");
      expect(secondResult.source).toBe("dragonfly");
    }

    void mockRelease; // suppress unused-var
    void mockAcquire; // suppress unused-var
  });
});
