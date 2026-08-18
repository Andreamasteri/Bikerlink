/**
 * Regression test — Task #550
 *
 * Guards the anti-feedback-loop fix in `recordDbMonitorSample` (Task #545).
 *
 * The old bug: `dbOverload` was computed with `dbErrorCount > 0` where
 * `dbErrorCount` included Problems with id `db.db.overload_sustained`. Once the
 * overload was sustained the Problem appeared, kept `dbErrorCount=1`, kept
 * `dbOverload=true`, and latched DEGRADED forever even after pool/ping recovered.
 *
 * The fix excludes derived Problem IDs from the formula. This file verifies that:
 *   (a) `db.db.overload_sustained` in the snap problems does NOT alone keep
 *       `dbOverload` true — sustained clears after N healthy ticks, and
 *   (b) having ONLY `db.db.overload_sustained` in problems (with healthy pool/ping)
 *       never lets the tracker enter sustained state at all.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { sustainedTracker } from "../ai/watchdog/state/sustained-tracker";
import { recordDbMonitorSample } from "../db-monitor-history";

// ── Controlled pool stats (read at call-time by the mock closure) ───────────
let mockPoolActivePct = 20;
let mockPoolWaiting = 0;

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../db", async () => {
  const { createDbMock } = await import("./helpers/db-mock");
  return {
    ...createDbMock(),
    // getPoolStats is the live path in recordDbMonitorSample — returns the
    // controlled values so each test scenario can drive pool pressure on/off.
    getPoolStats: () => ({ activePct: mockPoolActivePct, waiting: mockPoolWaiting }),
  };
});

vi.mock("drizzle-orm", () => ({
  lt: vi.fn(),
  // sql is required here; db-integrity/counters.ts uses it at module scope and
  // would crash with "undefined is not a function" without it (see memory
  // drizzle-sql-mock-agent-import.md).
  sql: vi.fn(),
}));

vi.mock("@shared/db", () => ({
  dbMonitorHistory: {},
}));

vi.mock("../lib/bg-db-limiter", () => ({
  withBgDbSlot: (fn: () => unknown) => fn(),
}));

vi.mock("../lib/backend-load-probe", () => ({
  getBackendLoad: () => ({
    overloaded: false,
    cpuPct: 10,
    eventLoopLagMs: 5,
    eventLoopP99Ms: 10,
    rssMb: 200,
  }),
  startBackendLoadProbe: vi.fn(),
}));

vi.mock("../lib/overload-thresholds", () => ({
  getOverloadThresholds: () => ({
    poolActivePct: 90,
    pingMs: 500,
    consecutiveTicks: 3,
    eventLoopLagMs: 100,
    eventLoopP99Ms: 200,
    cpuPct: 80,
  }),
  refreshOverloadThresholds: async () => {},
}));

vi.mock("../lib/dedup-logger", () => ({
  dedupWarn: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Snap with no problems and a healthy ping metric. */
function healthySnap() {
  return {
    problems: [] as Array<{ id?: string; source: string; severity: string }>,
    metrics: { "db.db.ping_ms": 10 },
  };
}

/**
 * Snap that mimics the feedback-loop scenario: pool/ping metrics are healthy
 * but the sustained-overload derived Problem is still present (as it would be
 * for several ticks after pool pressure drops while the Problem signal lags).
 */
function healthySnapWithDerivedProblem() {
  return {
    problems: [
      { id: "db.db.overload_sustained", source: "db", severity: "high" },
    ] as Array<{ id?: string; source: string; severity: string }>,
    metrics: { "db.db.ping_ms": 10 },
  };
}

/** Snap with a DB-integrity health problem but no DB connectivity pressure. */
function healthySnapWithIntegrityProblem() {
  return {
    problems: [
      { id: "db.db_integrity.high_violations", source: "db", severity: "high" },
    ] as Array<{ id?: string; source: string; severity: string }>,
    metrics: { "db.db.ping_ms": 10 },
  };
}

/** Snap that triggers genuine pool overload (poolActivePct driven via mock). */
function overloadSnap() {
  return {
    problems: [] as Array<{ id?: string; source: string; severity: string }>,
    metrics: { "db.db.ping_ms": 10 },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("recordDbMonitorSample — anti-feedback-loop regression (Task #550)", () => {
  beforeEach(() => {
    // Always start from a clean state so tests are fully independent.
    sustainedTracker.reset();
    mockPoolActivePct = 20;
    mockPoolWaiting = 0;
  });

  it("sustained clears after N healthy-pool ticks even when db.db.overload_sustained remains in problems", async () => {
    // Phase 1 — create a sustained overload via genuine pool pressure.
    mockPoolActivePct = 95; // above the 90% threshold
    for (let i = 0; i < 3; i++) {
      await recordDbMonitorSample(overloadSnap());
    }
    expect(sustainedTracker.getState().db.sustained).toBe(true);

    // Phase 2 — pool recovers, but the derived Problem is still present.
    // If dbOverload were erroneously driven by the Problem, dbErrorCount=1 would
    // keep dbOverload=true and the latch would never clear.
    mockPoolActivePct = 20;
    for (let i = 0; i < 3; i++) {
      await recordDbMonitorSample(healthySnapWithDerivedProblem());
    }

    // The fix: db.db.overload_sustained is excluded → dbOverload=false → latch clears.
    const state = sustainedTracker.getState().db;
    expect(state.sustained).toBe(false);
    expect(state.recovered).toBe(true);
  });

  it("tracker never enters sustained state when only db.db.overload_sustained is in problems (pool/ping healthy)", async () => {
    // All pool stats are healthy; only the derived Problem is present.
    mockPoolActivePct = 20;

    // Drive more ticks than the consecutiveTicks window (3) to make sure.
    for (let i = 0; i < 5; i++) {
      await recordDbMonitorSample(healthySnapWithDerivedProblem());
    }

    const state = sustainedTracker.getState().db;
    // Should never have counted an overload tick.
    expect(state.sustained).toBe(false);
    expect(state.consecutiveTicks).toBe(0);
  });

  it("tracker never enters sustained state for db-integrity alerts alone", async () => {
    mockPoolActivePct = 20;

    for (let i = 0; i < 5; i++) {
      await recordDbMonitorSample(healthySnapWithIntegrityProblem());
    }

    const state = sustainedTracker.getState().db;
    expect(state.sustained).toBe(false);
    expect(state.consecutiveTicks).toBe(0);
  });

  it("sustained correctly enters and clears on genuine pool pressure (control: no derived problems)", async () => {
    // Baseline: genuine overload → genuine recovery, no derived problems involved.
    mockPoolActivePct = 95;
    for (let i = 0; i < 3; i++) {
      await recordDbMonitorSample(healthySnap());
    }
    expect(sustainedTracker.getState().db.sustained).toBe(true);

    mockPoolActivePct = 20;
    for (let i = 0; i < 3; i++) {
      await recordDbMonitorSample(healthySnap());
    }
    expect(sustainedTracker.getState().db.sustained).toBe(false);
    expect(sustainedTracker.getState().db.recovered).toBe(true);
  });
});
