/**
 * Integration test — idle-leak kill-switch end-to-end (Task #343)
 *
 * Exercises the full path:
 *   admin enables kill-switch → invalidateIdleKillCache() clears TTL cache →
 *   next pool probe detects idle anomalous connections →
 *   pg_terminate_backend is called for the correct PIDs →
 *   collectPool() emits a "high" signal with killed count
 *
 * All I/O is mocked: pg.Client is replaced by a controllable stub,
 * getPoolStats/getCheckedOutConnections come from vitest mocks.
 * No real DB connection is needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Signal } from "../ai/watchdog/types";

// ── pg.Client stub ───────────────────────────────────────────────────────────
// Intercepts the out-of-band pg.Client instantiated inside probePgStatActivity.
// MockPgClient must use a regular function (not arrow) so that Vitest treats it
// as a valid constructor mock — arrow functions cannot be called with `new`.
const mockClientQuery = vi.hoisted(() => vi.fn());
const mockClientConnect = vi.hoisted(() => vi.fn());
const mockClientEnd = vi.hoisted(() => vi.fn());
const MockPgClient = vi.hoisted(() => vi.fn());

vi.mock("pg", () => ({
  default: { Client: MockPgClient },
}));

// ── pool / db mocks ──────────────────────────────────────────────────────────
const poolStatsMock = vi.hoisted(() => vi.fn());
const checkedOutMock = vi.hoisted(() => vi.fn());

vi.mock("../db", () => ({
  getPoolStats: poolStatsMock,
  getCheckedOutConnections: checkedOutMock,
  APP_NAME: "bikerlink-test",
}));

vi.mock("../lib/bg-db-limiter", () => ({
  getBgDbLimiterStats: vi.fn().mockReturnValue({
    active: 0,
    queued: 0,
    max: 3,
    droppedOverflowTotal: 0,
    droppedTimeoutTotal: 0,
  }),
}));

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a mockClientQuery implementation that routes SQL calls to the right
 * result based on content:
 *   - active-connection probe  → activeRows (default: [])
 *   - idle-leak probe          → idleRows
 *   - app_settings lookup      → settingRow
 *   - pg_terminate_backend     → success
 */
function makeQueryImpl(opts: {
  activeRows?: object[];
  idleRows: Array<{ pid: number; state: string; idle_s: number; last_query: string }>;
  settingRow: () => { value: string | null; value_json: unknown };
}) {
  // Regular function (not arrow) so it can be used as a constructor and to
  // avoid the "did not use function or class" Vitest warning on the factory.
  return function mockQuery(sql: string) {
    if (typeof sql === "string" && sql.includes("state <> 'idle'")) {
      // probePgStatActivity: active connections query
      return Promise.resolve({ rows: opts.activeRows ?? [] });
    }
    if (typeof sql === "string" && sql.includes("idle in transaction")) {
      // detectIdleLeak: anomalous idle connections
      return Promise.resolve({ rows: opts.idleRows });
    }
    if (typeof sql === "string" && sql.includes("app_settings")) {
      // detectIdleLeak: reads kill-switch setting via out-of-band client
      return Promise.resolve({ rows: [opts.settingRow()] });
    }
    if (typeof sql === "string" && sql.includes("pg_terminate_backend")) {
      return Promise.resolve({ rows: [{ pg_terminate_backend: true }] });
    }
    return Promise.resolve({ rows: [] });
  };
}

const leakSignal = (s: Signal[]) => s.find((x) => x.metric === "db.pool.idle_leak");

/** Count pg_terminate_backend calls on the mock. */
function terminateCalls(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls.filter(
    ([sql]) => typeof sql === "string" && (sql as string).includes("pg_terminate_backend"),
  );
}

// ── fixture rows ─────────────────────────────────────────────────────────────

/** Three idle connections all older than IDLE_KILL_MIN_AGE_S (60 s). */
const ANOMALOUS_ROWS = [
  { pid: 101, state: "idle", idle_s: 90, last_query: "SELECT 1" },
  { pid: 102, state: "idle in transaction", idle_s: 75, last_query: "BEGIN" },
  { pid: 103, state: "idle", idle_s: 120, last_query: "SELECT version()" },
];

// ── tests ─────────────────────────────────────────────────────────────────────

describe("pool-collector idle-leak kill-switch (end-to-end)", () => {
  beforeEach(() => {
    // Wire the pg.Client mock as a proper constructor (regular function).
    // Each call to `new pg.Client()` returns a fresh stub object that delegates
    // to the per-test mockClientQuery / mockClientConnect / mockClientEnd refs.
    MockPgClient.mockReset();
    MockPgClient.mockImplementation(function (this: unknown) {
      return {
        connect: mockClientConnect,
        query: mockClientQuery,
        end: mockClientEnd,
      };
    });

    mockClientConnect.mockReset().mockResolvedValue(undefined);
    mockClientEnd.mockReset().mockResolvedValue(undefined);
    mockClientQuery.mockReset();
    checkedOutMock.mockReset().mockReturnValue([]);

    // Saturated pool — waiting > 0 on every tick drives consecutiveWaiting up,
    // which fires probePgStatActivity at tick 5 (CONSECUTIVE_FOR_ACTIVITY_PROBE).
    poolStatsMock.mockReset();
    poolStatsMock.mockReturnValue({ total: 10, idle: 0, waiting: 5, max: 10, activePct: 100 });

    // Provide a valid DATABASE_URL so probePgStatActivity doesn't exit early.
    process.env.DATABASE_URL = "postgres://test:test@localhost/test"; // pragma: allowlist secret
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  it("calls pg_terminate_backend for every anomalous idle PID when kill-switch is enabled", async () => {
    const { collectPool, invalidateIdleKillCache, resetState } =
      await import("../ai/watchdog/collectors/pool-collector");

    resetState();
    invalidateIdleKillCache(); // ensure TTL cache doesn't serve a stale value

    mockClientQuery.mockImplementation(
      makeQueryImpl({
        idleRows: ANOMALOUS_ROWS,
        settingRow: () => ({ value: "true", value_json: null }),
      }),
    );

    // Drive consecutiveWaiting to 5 → probePgStatActivity fires on the 5th tick.
    for (let i = 0; i < 5; i++) collectPool();

    // Wait for the full async probe chain to complete.
    await vi.waitFor(() => {
      expect(terminateCalls(mockClientQuery)).toHaveLength(3);
    });

    const killed = terminateCalls(mockClientQuery);
    const killedPids = killed.map(([, params]) => (params as number[])[0]);
    expect(killedPids).toEqual(expect.arrayContaining([101, 102, 103]));
  });

  it("emits a 'high' idle_leak signal with correct killed count on the next collectPool tick", async () => {
    const { collectPool, invalidateIdleKillCache, resetState } =
      await import("../ai/watchdog/collectors/pool-collector");

    resetState();
    invalidateIdleKillCache();

    mockClientQuery.mockImplementation(
      makeQueryImpl({
        idleRows: ANOMALOUS_ROWS,
        settingRow: () => ({ value: "true", value_json: null }),
      }),
    );

    for (let i = 0; i < 5; i++) collectPool();

    // Wait for probe to finish and populate lastIdleLeak.
    await vi.waitFor(() => {
      expect(terminateCalls(mockClientQuery).length).toBeGreaterThan(0);
    });

    // The next tick picks up lastIdleLeak and emits "high".
    const signals = collectPool();
    const sig = leakSignal(signals);
    expect(sig?.severity).toBe("high");
    expect(sig?.details?.killed).toBe(3);
    expect(sig?.details?.pids).toEqual(expect.arrayContaining([101, 102, 103]));
  });

  it("does NOT call pg_terminate_backend when kill-switch is disabled (detector still logs)", async () => {
    const { collectPool, invalidateIdleKillCache, resetState } =
      await import("../ai/watchdog/collectors/pool-collector");

    resetState();
    invalidateIdleKillCache();

    mockClientQuery.mockImplementation(
      makeQueryImpl({
        idleRows: ANOMALOUS_ROWS,
        settingRow: () => ({ value: "false", value_json: null }),
      }),
    );

    for (let i = 0; i < 5; i++) collectPool();

    // Wait for the probe to complete (app_settings is still queried).
    await vi.waitFor(() => {
      const settingCalls = mockClientQuery.mock.calls.filter(
        ([sql]) => typeof sql === "string" && (sql as string).includes("app_settings"),
      );
      expect(settingCalls.length).toBeGreaterThan(0);
    });

    expect(terminateCalls(mockClientQuery)).toHaveLength(0);

    // Leak IS still detected and emits high, but killed = 0.
    const signals = collectPool();
    const sig = leakSignal(signals);
    expect(sig?.severity).toBe("high");
    expect(sig?.details?.killed).toBe(0);
  });

  it("re-reads the setting after invalidateIdleKillCache and starts killing on the next probe", async () => {
    const { collectPool, invalidateIdleKillCache, resetState } =
      await import("../ai/watchdog/collectors/pool-collector");

    resetState();
    invalidateIdleKillCache();

    let killEnabled = false;

    mockClientQuery.mockImplementation(
      makeQueryImpl({
        idleRows: [
          { pid: 201, state: "idle", idle_s: 90, last_query: "SELECT 1" },
          { pid: 202, state: "idle", idle_s: 80, last_query: "SELECT 2" },
        ],
        settingRow: () => ({ value: killEnabled ? "true" : "false", value_json: null }),
      }),
    );

    // First probe cycle (ticks 1-5): kill disabled → no terminations.
    for (let i = 0; i < 5; i++) collectPool();

    await vi.waitFor(() => {
      const settingCalls = mockClientQuery.mock.calls.filter(
        ([sql]) => typeof sql === "string" && (sql as string).includes("app_settings"),
      );
      expect(settingCalls.length).toBeGreaterThan(0);
    });
    expect(terminateCalls(mockClientQuery)).toHaveLength(0);

    // Admin flips the kill-switch ON and calls invalidateIdleKillCache
    // (mirroring what the PUT /:key route does after writing db_idle_conn_kill_enabled).
    killEnabled = true;
    invalidateIdleKillCache();
    mockClientQuery.mockClear();

    // Second probe cycle (ticks 6-10): kill enabled → connections are terminated.
    for (let i = 0; i < 5; i++) collectPool();

    await vi.waitFor(() => {
      expect(terminateCalls(mockClientQuery).length).toBeGreaterThan(0);
    });

    const killed = terminateCalls(mockClientQuery);
    const killedPids = killed.map(([, params]) => (params as number[])[0]);
    expect(killedPids).toEqual(expect.arrayContaining([201, 202]));
  });

  it("does NOT terminate connections younger than IDLE_KILL_MIN_AGE_S (60 s) even when kill is enabled", async () => {
    const { collectPool, invalidateIdleKillCache, resetState } =
      await import("../ai/watchdog/collectors/pool-collector");

    resetState();
    invalidateIdleKillCache();

    // Two anomalous connections (above IDLE_LEAK_THRESHOLD = 2) but one is young.
    mockClientQuery.mockImplementation(
      makeQueryImpl({
        idleRows: [
          { pid: 301, state: "idle", idle_s: 45, last_query: "SELECT 1" }, // < 60 s → skip
          { pid: 302, state: "idle", idle_s: 90, last_query: "SELECT 2" }, // >= 60 s → kill
        ],
        settingRow: () => ({ value: "true", value_json: null }),
      }),
    );

    for (let i = 0; i < 5; i++) collectPool();

    // Wait for the probe to finish (at least one terminate call expected).
    await vi.waitFor(() => {
      expect(terminateCalls(mockClientQuery)).toHaveLength(1);
    });

    // Only PID 302 is old enough to be terminated.
    const killed = terminateCalls(mockClientQuery);
    expect((killed[0][1] as number[])[0]).toBe(302);
  });
});
