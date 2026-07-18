/**
 * Tests (part 2/2): forceUnlockMatchingLock() dragonfly path and
 * withMatchingLock() lifecycle — describes 10–13.
 *
 * forceUnlockMatchingLock() verifies:
 * 10. wasHeld=true and correct holder when a dragonfly lock is active
 * 11. Holder details (owner, source) are accurate in the returned object
 *
 * withMatchingLock() verifies:
 * 12. Stale in-memory lock auto-recovery (TTL elapsed → new caller takes over)
 * 13. Normal in-memory lock lifecycle (acquire → run → release, concurrency,
 *     error recovery, sequential re-acquisitions, status reporting)
 *
 * Part 1 covers describes 1–9 (getDragonflyRejectionStreak + force-unlock no-lock
 * and in-memory cases).
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
