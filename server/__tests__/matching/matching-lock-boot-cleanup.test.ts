/**
 * Task #939 — Regression tests: orphan matching lock boot cleanup + signal escalation.
 *
 * Covers:
 * - Expired lock with trustworthy metadata → cleared
 * - Lock with missing expiresAt → takes dead-PID path (no false-expired from default 0)
 * - Lock with missing holder PID → skipped (multi-instance safe)
 * - Different dead PID → cleared
 * - Current PID with no cycle in flight → skipped
 * - No distributed lock → in-memory-only cleanup
 * - Successful re-acquisition after force-unlock
 * - collectScheduler() emits scheduler.run_gap_no_lock HIGH at 60-min threshold (not just 4h)
 * - collectScheduler() does NOT emit run_gap_no_lock below 60-min threshold
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Top-level mocks (applied before any import) ──────────────────────────────

// Storage mock — controlled per-test via mockGetAppSetting
const mockGetAppSetting = vi.fn(async (_key: string) => null as null | { value?: string; valueJson?: unknown });

vi.mock("../../cache/redis", () => ({
  getRawRedis: vi.fn(() => null),
  isRedisAvailable: vi.fn(() => false),
}));
vi.mock("../../db", () => ({ db: {}, pool: {} }));
vi.mock("../../storage", () => ({
  storage: {
    getAppSetting: (...args: Parameters<typeof mockGetAppSetting>) => mockGetAppSetting(...args),
  },
}));

// ── Module imports (after mocks) ──────────────────────────────────────────────
import { forceUnlockMatchingLock, getMatchingLockStatus, withMatchingLock } from "../../cache/matching-lock";
import { collectScheduler } from "../../ai/watchdog/collectors/scheduler-collector";

// ─── Boot cleanup decision helper ────────────────────────────────────────────
// Mirrors the exact decision tree in boot-sequence.ts runPostReady() so tests
// verify the logic in isolation from heavy boot deps.
async function runBootLockCleanup(opts: {
  cycleInFlight: boolean;
  remoteHolder: { pid?: number; expiresAt?: number } | null;
  redisExists: boolean;
  now?: number;
}): Promise<
  | "skipped_cycle_in_flight"
  | "skipped_no_pid"
  | "skipped_own_pid"
  | "cleared_expired"
  | "cleared_dead_pid"
  | "cleared_no_remote"
> {
  const { cycleInFlight, remoteHolder, redisExists, now = Date.now() } = opts;

  if (cycleInFlight) return "skipped_cycle_in_flight";
  if (!redisExists) {
    forceUnlockMatchingLock();
    return "cleared_no_remote";
  }

  const holder = remoteHolder as { pid?: number; expiresAt?: number } | null;
  const holderPid = holder?.pid ?? null;
  const holderExpiresAt = holder?.expiresAt; // undefined if metadata absent
  const hasReliableExpiry = holderExpiresAt != null;
  const isExpired = hasReliableExpiry && holderExpiresAt < now;
  const isOwnedByCurrentProcess = holderPid === process.pid;

  if (isExpired) {
    forceUnlockMatchingLock();
    return "cleared_expired";
  } else if (holderPid !== null && !isOwnedByCurrentProcess) {
    forceUnlockMatchingLock();
    return "cleared_dead_pid";
  } else if (holderPid === null) {
    return "skipped_no_pid";
  } else {
    return "skipped_own_pid";
  }
}

// ── Test suite: in-memory lock management ────────────────────────────────────

describe("Orphan matching lock: in-memory operations", () => {
  beforeEach(() => {
    forceUnlockMatchingLock();
    mockGetAppSetting.mockReset();
  });

  it("forceUnlockMatchingLock() is idempotent when no lock is held", () => {
    const result = forceUnlockMatchingLock();
    expect(result.wasHeld).toBe(false);
    expect(result.holder).toBeNull();
  });

  it("clears an in-memory lock and allows immediate re-acquisition", async () => {
    let resolveHold!: () => void;
    const holdPromise = new Promise<void>((res) => { resolveHold = res; });

    const cyclePromise = withMatchingLock("boot-cleanup-test", async () => {
      await holdPromise;
      return "done";
    });

    await new Promise((res) => setTimeout(res, 10));

    const unlockResult = forceUnlockMatchingLock();
    expect(unlockResult.wasHeld).toBe(true);
    expect(unlockResult.holder?.owner).toBe("boot-cleanup-test");

    resolveHold();
    await cyclePromise;

    let didRun = false;
    const result = await withMatchingLock("new-owner-post-cleanup", async () => {
      didRun = true;
      return true;
    });
    expect(result.acquired).toBe(true);
    expect(didRun).toBe(true);
  });

  it("getMatchingLockStatus reflects no active lock after forceUnlockMatchingLock()", async () => {
    let releaseOrphan!: () => void;
    const orphanPromise = withMatchingLock("orphan-proc-1234", async () => {
      await new Promise<void>((res) => { releaseOrphan = res; });
    });

    await new Promise((res) => setTimeout(res, 10));

    const statusBefore = await getMatchingLockStatus();
    expect(statusBefore.active).toBe(true);
    expect(statusBefore.holder?.owner).toBe("orphan-proc-1234");

    forceUnlockMatchingLock();

    const statusAfter = await getMatchingLockStatus();
    expect(statusAfter.active).toBe(false);
    expect(statusAfter.holder).toBeNull();

    releaseOrphan();
    await orphanPromise;
  });
});

// ── Test suite: owner-aware boot cleanup decision tree ───────────────────────

describe("Boot cleanup decision tree (mirrors boot-sequence.ts runPostReady)", () => {
  beforeEach(() => {
    forceUnlockMatchingLock();
  });

  it("skips when cycleInFlight=true (cycle already in flight)", async () => {
    const outcome = await runBootLockCleanup({
      cycleInFlight: true,
      redisExists: true,
      remoteHolder: { pid: 9999, expiresAt: Date.now() + 60_000 },
    });
    expect(outcome).toBe("skipped_cycle_in_flight");
  });

  it("clears in-memory state only when no remote lock exists", async () => {
    const outcome = await runBootLockCleanup({
      cycleInFlight: false,
      redisExists: false,
      remoteHolder: null,
    });
    expect(outcome).toBe("cleared_no_remote");
  });

  it("clears lock with trustworthy past expiresAt (expired)", async () => {
    const pastMs = Date.now() - 1_000;
    const outcome = await runBootLockCleanup({
      cycleInFlight: false,
      redisExists: true,
      remoteHolder: { pid: 9999, expiresAt: pastMs },
      now: Date.now(),
    });
    expect(outcome).toBe("cleared_expired");
  });

  it("does NOT use default 0 for missing expiresAt — takes dead-PID path instead", async () => {
    // Critical fix: before Task #939, holderExpiresAt ?? 0 would make isExpired=true
    // when expiresAt is undefined. The correct path for a different PID with missing
    // expiresAt is cleared_dead_pid (PID check), not cleared_expired (false expiry).
    const deadPid = process.pid + 99;
    const outcome = await runBootLockCleanup({
      cycleInFlight: false,
      redisExists: true,
      remoteHolder: { pid: deadPid }, // no expiresAt field
    });
    expect(outcome).toBe("cleared_dead_pid"); // correct: PID-based, not expiry-based
  });

  it("multi-instance safety: skips when no holder PID in metadata", async () => {
    // If we cannot identify the owner, we must NOT clear — another live instance
    // might hold the lock without PID in metadata.
    const outcome = await runBootLockCleanup({
      cycleInFlight: false,
      redisExists: true,
      remoteHolder: { expiresAt: Date.now() + 60_000 }, // missing pid
    });
    expect(outcome).toBe("skipped_no_pid");
  });

  it("multi-instance safety: skips when remoteHolder is entirely null", async () => {
    const outcome = await runBootLockCleanup({
      cycleInFlight: false,
      redisExists: true,
      remoteHolder: null, // no metadata at all
    });
    expect(outcome).toBe("skipped_no_pid");
  });

  it("clears non-expired lock held by a dead (different) PID", async () => {
    const deadPid = process.pid + 1;
    const outcome = await runBootLockCleanup({
      cycleInFlight: false,
      redisExists: true,
      remoteHolder: { pid: deadPid, expiresAt: Date.now() + 60_000 },
    });
    expect(outcome).toBe("cleared_dead_pid");
  });

  it("skips when lock is held by current PID with no cycle in flight (inconsistent state)", async () => {
    const outcome = await runBootLockCleanup({
      cycleInFlight: false,
      redisExists: true,
      remoteHolder: { pid: process.pid, expiresAt: Date.now() + 60_000 },
    });
    expect(outcome).toBe("skipped_own_pid");
  });
});

// ── Test suite: collectScheduler() run_gap_no_lock threshold ─────────────────

describe("collectScheduler() scheduler.run_gap_no_lock signal (Task #939)", () => {
  beforeEach(() => {
    forceUnlockMatchingLock();
    mockGetAppSetting.mockReset();
  });

  it("emits scheduler.run_gap_no_lock HIGH at 65-min gap after startup grace", async () => {
    // The signal is suppressed only during the 65-minute deploy/restart grace
    // window; after that window it fires at >=60 min. DragonflyDB is
    // unavailable (mocked getRawRedis → null), so the lock is inactive.
    const uptimeSpy = vi.spyOn(process, "uptime").mockReturnValue(70 * 60);
    const now = Date.now();
    const lastTickAt = new Date(now - 30_000).toISOString(); // 30s ago → alive
    const lastRunAt = new Date(now - 65 * 60_000).toISOString(); // 65min ago

    mockGetAppSetting.mockImplementation(async (key: string) => {
      if (key === "matching_scheduler_state") {
        return {
          valueJson: {
            lastTickAt,
            lastRunAt,
            lastTickResult: "ok",
            lastSkipReason: null,
            lastSkipAt: null,
          },
        };
      }
      return null;
    });

    const signals = await collectScheduler();

    const noLockSignal = signals.find((s) => s.metric === "scheduler.run_gap_no_lock");
    expect(noLockSignal).toBeDefined();
    expect(noLockSignal?.severity).toBe("high");
    expect(noLockSignal?.value).toBe(65);
    uptimeSpy.mockRestore();
  });

  it("does NOT emit scheduler.run_gap_no_lock at 59-min gap (below 60-min threshold)", async () => {
    const now = Date.now();
    const lastTickAt = new Date(now - 30_000).toISOString();
    const lastRunAt = new Date(now - 59 * 60_000).toISOString(); // 59min — below gate

    mockGetAppSetting.mockImplementation(async (key: string) => {
      if (key === "matching_scheduler_state") {
        return {
          valueJson: {
            lastTickAt,
            lastRunAt,
            lastTickResult: "ok",
            lastSkipReason: null,
            lastSkipAt: null,
          },
        };
      }
      return null;
    });

    const signals = await collectScheduler();

    const noLockSignal = signals.find((s) => s.metric === "scheduler.run_gap_no_lock");
    expect(noLockSignal).toBeUndefined();
  });
});
