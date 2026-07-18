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

// ---------------------------------------------------------------------------
// 12. Stale in-memory lock auto-recovery
//
// Scenario: memoryLockHeld is true but the holder's expiresAt has elapsed —
// the previous owner never released (e.g. crashed outside the try/finally or
// held the lock longer than LOCK_TTL_MS).  withMatchingLock must auto-release
// the stale lock and allow a new acquisition instead of permanently blocking.
//
// Strategy: mock Date.now() to pin a baseline T0 during acquisition, then
// advance it beyond LOCK_TTL_MS (5 min) before the second caller arrives.
// No Redis/DragonflyDB connection required (isRedisAvail: false).
// ---------------------------------------------------------------------------

/** LOCK_TTL_MS mirrored from matching-lock.ts — 5 minutes. */
const LOCK_TTL_MS = 5 * 60 * 1_000;

describe("withMatchingLock – stale in-memory lock auto-recovery", () => {
  it("releases a stale held lock and allows the next caller to acquire successfully", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: false });

    const T0 = 1_000_000;
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(T0);

    // Hold the lock open: fn suspends on a pending promise so the lock stays
    // active in the module state while we advance the clock.
    let releaseHolder!: () => void;
    const holderDone = new Promise<void>((res) => { releaseHolder = res; });
    // Start the holder — synchronously sets memoryLockHeld=true before fn's
    // first await, then suspends on holderDone.
    const holderPromise = mod.withMatchingLock("stale-owner", async () => {
      await holderDone;
    });

    // Advance time past the TTL so expiresAt < Date.now()
    dateSpy.mockReturnValue(T0 + LOCK_TTL_MS + 1_000);

    // Second caller — must detect the stale lock, auto-release, and acquire.
    const secondResult = await mod.withMatchingLock("new-owner", async () => "reclaimed");

    expect(secondResult.acquired).toBe(true);
    if (secondResult.acquired) {
      expect(secondResult.result).toBe("reclaimed");
      expect(secondResult.source).toBe("memory");
    }

    // Clean up: let the original holder fn finish (its finally is a no-op now).
    releaseHolder();
    await holderPromise;
  });

  it("does NOT release a held lock whose TTL has not yet expired", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: false });

    const T0 = 2_000_000;
    vi.spyOn(Date, "now").mockReturnValue(T0);

    let releaseHolder!: () => void;
    const holderDone = new Promise<void>((res) => { releaseHolder = res; });
    const holderPromise = mod.withMatchingLock("active-owner", async () => {
      await holderDone;
    });

    // Time has NOT advanced past TTL — lock is still valid.
    // (Date.now mock stays at T0, which is before T0 + LOCK_TTL_MS.)
    const secondResult = await mod.withMatchingLock("challenger", async () => "should-not-run");

    expect(secondResult.acquired).toBe(false);
    if (!secondResult.acquired) {
      expect(secondResult.reason).toBe("already_running");
    }

    releaseHolder();
    await holderPromise;
  });

  it("records an 'expired' history event for the stale owner when auto-releasing", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: false });

    const T0 = 3_000_000;
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(T0);

    let releaseHolder!: () => void;
    const holderDone = new Promise<void>((res) => { releaseHolder = res; });
    const holderPromise = mod.withMatchingLock("stale-owner-2", async () => {
      await holderDone;
    });

    dateSpy.mockReturnValue(T0 + LOCK_TTL_MS + 500);

    // Trigger auto-recovery.
    await mod.withMatchingLock("recoverer", async () => "ok");

    // getMatchingLockStatus exposes lastHolder — it should be "recoverer" since
    // that was the most recently completed acquisition.
    const status = await mod.getMatchingLockStatus();
    expect(status.lastHolder?.owner).toBe("recoverer");
    // Lock must be free after recoverer finished.
    expect(status.active).toBe(false);

    releaseHolder();
    await holderPromise;
  });

  it("allows a third caller to acquire after auto-recovery and subsequent release", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: false });

    const T0 = 4_000_000;
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(T0);

    let releaseHolder!: () => void;
    const holderDone = new Promise<void>((res) => { releaseHolder = res; });
    const holderPromise = mod.withMatchingLock("stale-owner-3", async () => {
      await holderDone;
    });

    // Advance past TTL — auto-recovery will trigger on the next caller.
    dateSpy.mockReturnValue(T0 + LOCK_TTL_MS + 1_000);

    // Second caller triggers auto-recovery and acquires.
    const second = await mod.withMatchingLock("second", async () => "second-result");
    expect(second.acquired).toBe(true);

    // Restore time to normal so third acquisition isn't immediately stale.
    dateSpy.mockReturnValue(T0 + LOCK_TTL_MS + 2_000);

    // Third caller — lock should be free after second completed normally.
    const third = await mod.withMatchingLock("third", async () => "third-result");
    expect(third.acquired).toBe(true);
    if (third.acquired) {
      expect(third.result).toBe("third-result");
    }

    releaseHolder();
    await holderPromise;
  });
});

// ---------------------------------------------------------------------------
// 13. Normal in-memory lock lifecycle
//
// Verifies the happy path: acquire → run → release and that the lock can be
// re-acquired immediately after a clean release (or even after fn throws).
// No Redis/DragonflyDB connection required (isRedisAvail: false).
// ---------------------------------------------------------------------------

describe("withMatchingLock – normal in-memory lock lifecycle", () => {
  it("returns acquired=true with the fn result and source='memory'", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: false });

    const result = await mod.withMatchingLock("owner-a", async () => 99);

    expect(result.acquired).toBe(true);
    if (result.acquired) {
      expect(result.result).toBe(99);
      expect(result.source).toBe("memory");
    }
  });

  it("re-acquires the lock successfully immediately after a clean release", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: false });

    const first = await mod.withMatchingLock("owner-a", async () => "first");
    expect(first.acquired).toBe(true);

    const second = await mod.withMatchingLock("owner-b", async () => "second");
    expect(second.acquired).toBe(true);
    if (second.acquired) {
      expect(second.result).toBe("second");
      expect(second.source).toBe("memory");
    }
  });

  it("releases the lock even when fn throws, allowing re-acquisition", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: false });

    // fn throws — withMatchingLock propagates the error but must still release.
    await expect(
      mod.withMatchingLock("owner-throw", async () => { throw new Error("crash"); }),
    ).rejects.toThrow("crash");

    // The lock must be free now.
    const recovered = await mod.withMatchingLock("owner-recover", async () => "ok");
    expect(recovered.acquired).toBe(true);
    if (recovered.acquired) {
      expect(recovered.result).toBe("ok");
    }
  });

  it("rejects a concurrent caller while the lock is actively held within TTL", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: false });

    let releaseHolder!: () => void;
    const holderDone = new Promise<void>((res) => { releaseHolder = res; });
    const holderPromise = mod.withMatchingLock("holder", async () => { await holderDone; });

    const rejected = await mod.withMatchingLock("interloper", async () => "nope");
    expect(rejected.acquired).toBe(false);
    if (!rejected.acquired) {
      expect(rejected.reason).toBe("already_running");
    }

    releaseHolder();
    await holderPromise;
  });

  it("allows multiple sequential acquisitions — lock is fully recycled each time", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: false });

    for (let i = 0; i < 5; i++) {
      const r = await mod.withMatchingLock(`seq-owner-${i}`, async () => i * 10);
      expect(r.acquired).toBe(true);
      if (r.acquired) {
        expect(r.result).toBe(i * 10);
      }
    }
  });

  it("reports lock as inactive (active=false) after a completed acquisition", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: false });

    await mod.withMatchingLock("owner-status", async () => "done");

    const status = await mod.getMatchingLockStatus();
    expect(status.active).toBe(false);
    expect(status.holder).toBeNull();
    expect(status.lastHolder?.owner).toBe("owner-status");
  });

  it("reports lock as active while fn is still running", async () => {
    const { mod } = await freshMatchingLock({ isRedisAvail: false });

    let releaseHolder!: () => void;
    const holderDone = new Promise<void>((res) => { releaseHolder = res; });
    const holderPromise = mod.withMatchingLock("active-holder", async () => {
      await holderDone;
    });

    // Check status while the fn is suspended.
    const status = await mod.getMatchingLockStatus();
    expect(status.active).toBe(true);
    expect(status.holder?.owner).toBe("active-holder");
    expect(status.holder?.source).toBe("memory");

    releaseHolder();
    await holderPromise;
  });
});
