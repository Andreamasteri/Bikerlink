/**
 * Unit tests — idle-leak kill actuator (Task #551)
 *
 * Tests runIdleLeakKill directly with a mocked pg.Client, without going
 * through pool-collector. Covers:
 *   - kill-switch OFF  → 0 kills, 0 failedKills
 *   - kill-switch ON   → kills only pids >= ACTUATOR_IDLE_KILL_MIN_AGE_S (60s)
 *   - TTL cache hits   → app_settings not re-read within the 3-min window
 *   - invalidateIdleKillCache() forces immediate re-read on the next call
 *   - AppSetting query throws → 0 kills (fail-safe)
 *   - partial pg_terminate_backend failure → correct killed + failedKills counts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── pg.Client stub ────────────────────────────────────────────────────────────
// Must use regular function (not arrow) so Vitest accepts it as a constructor.
const mockClientQuery = vi.hoisted(() => vi.fn());
const MockPgClient = vi.hoisted(() => vi.fn());

vi.mock("pg", () => ({
  default: { Client: MockPgClient },
}));

// ── module under test ─────────────────────────────────────────────────────────
import {
  runIdleLeakKill,
  invalidateIdleKillCache,
  ACTUATOR_IDLE_KILL_MIN_AGE_S,
} from "../ai/watchdog/actuator";
import type { AnomalousConnection } from "../ai/watchdog/actuator";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a pg.Client-like stub with a controllable query implementation. */
function makeClient(queryImpl: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) {
  return {
    query: vi.fn().mockImplementation(queryImpl),
    connect: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  } as unknown as import("pg").Client;
}

/** Count how many times a client stub's query was called with a given SQL fragment. */
function callsMatching(client: import("pg").Client, fragment: string): number {
  const mock = (client.query as ReturnType<typeof vi.fn>);
  return mock.mock.calls.filter(([sql]) => typeof sql === "string" && sql.includes(fragment)).length;
}

/** Pids passed to pg_terminate_backend on a client stub. */
function killedPids(client: import("pg").Client): number[] {
  const mock = (client.query as ReturnType<typeof vi.fn>);
  return mock.mock.calls
    .filter(([sql]) => typeof sql === "string" && sql.includes("pg_terminate_backend"))
    .map(([, params]) => (params as number[])[0]);
}

// ── fixture rows ──────────────────────────────────────────────────────────────

const OLD_ENOUGH: AnomalousConnection[] = [
  { pid: 101, idle_s: 90 },
  { pid: 102, idle_s: 75 },
  { pid: 103, idle_s: 120 },
];

const MIXED_AGE: AnomalousConnection[] = [
  { pid: 201, idle_s: 45 },   // < 60s → must NOT be killed
  { pid: 202, idle_s: 90 },   // >= 60s → must be killed
];

// ── tests ─────────────────────────────────────────────────────────────────────

describe("runIdleLeakKill — actuator unit tests", () => {
  beforeEach(() => {
    // Reset the module-level TTL cache before each test so tests are isolated.
    invalidateIdleKillCache();

    // Wire the pg.Client mock as a proper constructor.
    MockPgClient.mockReset();
    MockPgClient.mockImplementation(function (this: unknown) {
      return {
        connect: vi.fn().mockResolvedValue(undefined),
        query: mockClientQuery,
        end: vi.fn().mockResolvedValue(undefined),
      };
    });
    mockClientQuery.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Kill-switch OFF ──────────────────────────────────────────────────────

  it("returns 0 and calls no pg_terminate_backend when kill-switch is OFF", async () => {
    const client = makeClient((sql) => {
      if (sql.includes("app_settings")) {
        return Promise.resolve({ rows: [{ value: "false", value_json: null }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const { killed, failedKills } = await runIdleLeakKill(client, OLD_ENOUGH);

    expect(killed).toBe(0);
    expect(failedKills).toBe(0);
    expect(killedPids(client)).toHaveLength(0);
  });

  it("returns 0 when app_settings row is absent (no row → default OFF)", async () => {
    const client = makeClient((sql) => {
      if (sql.includes("app_settings")) {
        return Promise.resolve({ rows: [] }); // no row → undefined → false
      }
      return Promise.resolve({ rows: [] });
    });

    const { killed, failedKills } = await runIdleLeakKill(client, OLD_ENOUGH);

    expect(killed).toBe(0);
    expect(failedKills).toBe(0);
    expect(killedPids(client)).toHaveLength(0);
  });

  // ── 2. Kill-switch ON + age filter ─────────────────────────────────────────

  it("kills all anomalous connections when kill-switch is ON and all are old enough", async () => {
    const client = makeClient((sql) => {
      if (sql.includes("app_settings")) {
        return Promise.resolve({ rows: [{ value: "true", value_json: null }] });
      }
      if (sql.includes("pg_terminate_backend")) {
        return Promise.resolve({ rows: [{ pg_terminate_backend: true }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const { killed, failedKills } = await runIdleLeakKill(client, OLD_ENOUGH);

    expect(killed).toBe(3);
    expect(failedKills).toBe(0);
    expect(killedPids(client)).toEqual(expect.arrayContaining([101, 102, 103]));
  });

  it(`skips connections younger than ACTUATOR_IDLE_KILL_MIN_AGE_S (${ACTUATOR_IDLE_KILL_MIN_AGE_S}s)`, async () => {
    const client = makeClient((sql) => {
      if (sql.includes("app_settings")) {
        return Promise.resolve({ rows: [{ value: "true", value_json: null }] });
      }
      if (sql.includes("pg_terminate_backend")) {
        return Promise.resolve({ rows: [{ pg_terminate_backend: true }] });
      }
      return Promise.resolve({ rows: [] });
    });

    // MIXED_AGE has pid 201 (45s → skip) and pid 202 (90s → kill)
    const { killed, failedKills } = await runIdleLeakKill(client, MIXED_AGE);

    expect(killed).toBe(1);
    expect(failedKills).toBe(0);
    const pids = killedPids(client);
    expect(pids).toContain(202);
    expect(pids).not.toContain(201);
  });

  it("accepts value_json boolean true as kill-switch ON", async () => {
    const client = makeClient((sql) => {
      if (sql.includes("app_settings")) {
        return Promise.resolve({ rows: [{ value: null, value_json: true }] });
      }
      if (sql.includes("pg_terminate_backend")) {
        return Promise.resolve({ rows: [{ pg_terminate_backend: true }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const { killed } = await runIdleLeakKill(client, OLD_ENOUGH);
    expect(killed).toBe(3);
  });

  it("accepts value_json string 'true' as kill-switch ON", async () => {
    const client = makeClient((sql) => {
      if (sql.includes("app_settings")) {
        return Promise.resolve({ rows: [{ value: null, value_json: "true" }] });
      }
      if (sql.includes("pg_terminate_backend")) {
        return Promise.resolve({ rows: [{ pg_terminate_backend: true }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const { killed } = await runIdleLeakKill(client, OLD_ENOUGH);
    expect(killed).toBe(3);
  });

  // ── 3. TTL cache — no re-read within the 3-min window ──────────────────────

  it("does NOT re-read app_settings on a second call within the TTL window", async () => {
    // Freeze Date.now so both calls appear to happen at the same instant.
    const frozenNow = 1_000_000;
    vi.spyOn(Date, "now").mockReturnValue(frozenNow);

    const client = makeClient((sql) => {
      if (sql.includes("app_settings")) {
        return Promise.resolve({ rows: [{ value: "true", value_json: null }] });
      }
      if (sql.includes("pg_terminate_backend")) {
        return Promise.resolve({ rows: [{ pg_terminate_backend: true }] });
      }
      return Promise.resolve({ rows: [] });
    });

    // First call: populates the TTL cache.
    await runIdleLeakKill(client, OLD_ENOUGH);
    const firstSettingCalls = callsMatching(client, "app_settings");
    expect(firstSettingCalls).toBe(1);

    // Second call: same frozen time → TTL not expired → must NOT re-read.
    await runIdleLeakKill(client, OLD_ENOUGH);
    const totalSettingCalls = callsMatching(client, "app_settings");
    expect(totalSettingCalls).toBe(1); // still 1 — cache served it
  });

  it("re-reads app_settings after the TTL window expires", async () => {
    const t0 = 1_000_000;
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(t0);

    const client = makeClient((sql) => {
      if (sql.includes("app_settings")) {
        return Promise.resolve({ rows: [{ value: "true", value_json: null }] });
      }
      if (sql.includes("pg_terminate_backend")) {
        return Promise.resolve({ rows: [{ pg_terminate_backend: true }] });
      }
      return Promise.resolve({ rows: [] });
    });

    // First call at t0.
    await runIdleLeakKill(client, OLD_ENOUGH);
    expect(callsMatching(client, "app_settings")).toBe(1);

    // Advance clock past 3-minute TTL.
    dateSpy.mockReturnValue(t0 + 3 * 60_000 + 1);

    // Second call: TTL expired → must re-read.
    await runIdleLeakKill(client, OLD_ENOUGH);
    expect(callsMatching(client, "app_settings")).toBe(2);
  });

  // ── 4. invalidateIdleKillCache forces immediate re-read ─────────────────────

  it("re-reads app_settings immediately after invalidateIdleKillCache even within TTL", async () => {
    const frozenNow = 1_000_000;
    vi.spyOn(Date, "now").mockReturnValue(frozenNow);

    let killEnabled = false;
    const client = makeClient((sql) => {
      if (sql.includes("app_settings")) {
        return Promise.resolve({ rows: [{ value: killEnabled ? "true" : "false", value_json: null }] });
      }
      if (sql.includes("pg_terminate_backend")) {
        return Promise.resolve({ rows: [{ pg_terminate_backend: true }] });
      }
      return Promise.resolve({ rows: [] });
    });

    // First call: kill OFF, cache populated.
    const { killed: killed1 } = await runIdleLeakKill(client, OLD_ENOUGH);
    expect(killed1).toBe(0);
    expect(callsMatching(client, "app_settings")).toBe(1);

    // Admin flips the switch and invalidates the cache.
    killEnabled = true;
    invalidateIdleKillCache();

    // Second call at same frozen time: cache was invalidated → must re-read.
    const { killed: killed2 } = await runIdleLeakKill(client, OLD_ENOUGH);
    expect(callsMatching(client, "app_settings")).toBe(2); // re-read happened
    expect(killed2).toBe(3); // now enabled → all pids killed
  });

  // ── 5. Fail-safe: AppSetting query throws → 0 kills ────────────────────────

  it("returns 0 and calls no pg_terminate_backend when the app_settings query throws", async () => {
    const client = makeClient((sql) => {
      if (sql.includes("app_settings")) {
        return Promise.reject(new Error("DB error"));
      }
      return Promise.resolve({ rows: [] });
    });

    const { killed, failedKills } = await runIdleLeakKill(client, OLD_ENOUGH);

    expect(killed).toBe(0);
    expect(failedKills).toBe(0);
    expect(killedPids(client)).toHaveLength(0);
  });

  it("returns 0 when the anomalous list is empty even if kill-switch is ON", async () => {
    const client = makeClient((sql) => {
      if (sql.includes("app_settings")) {
        return Promise.resolve({ rows: [{ value: "true", value_json: null }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const { killed, failedKills } = await runIdleLeakKill(client, []);

    expect(killed).toBe(0);
    expect(failedKills).toBe(0);
    expect(killedPids(client)).toHaveLength(0);
  });

  // ── 6. Partial pg_terminate_backend failure → failedKills surfaced ──────────

  it("skips a PID gracefully when pg_terminate_backend throws and continues with the rest", async () => {
    let termCalls = 0;
    const client = makeClient((sql, params) => {
      if (sql.includes("app_settings")) {
        return Promise.resolve({ rows: [{ value: "true", value_json: null }] });
      }
      if (sql.includes("pg_terminate_backend")) {
        termCalls++;
        const pid = (params as number[])[0];
        if (pid === 101) {
          // First PID fails — should not abort the rest.
          return Promise.reject(new Error("permission denied"));
        }
        return Promise.resolve({ rows: [{ pg_terminate_backend: true }] });
      }
      return Promise.resolve({ rows: [] });
    });

    // THREE connections all old enough; first one's terminate call throws.
    const { killed, failedKills } = await runIdleLeakKill(client, OLD_ENOUGH);

    // pid 101 threw → counted in failedKills, NOT in killed; pids 102 and 103 succeeded.
    expect(killed).toBe(2);
    expect(failedKills).toBe(1);
    expect(termCalls).toBe(3); // all three were attempted
  });

  it("reports failedKills=2 when two out of three pids throw", async () => {
    const client = makeClient((sql, params) => {
      if (sql.includes("app_settings")) {
        return Promise.resolve({ rows: [{ value: "true", value_json: null }] });
      }
      if (sql.includes("pg_terminate_backend")) {
        const pid = (params as number[])[0];
        if (pid === 101 || pid === 102) {
          return Promise.reject(new Error("permission denied"));
        }
        return Promise.resolve({ rows: [{ pg_terminate_backend: true }] });
      }
      return Promise.resolve({ rows: [] });
    });

    // OLD_ENOUGH has pids 101, 102, 103 — first two throw, third succeeds.
    const { killed, failedKills } = await runIdleLeakKill(client, OLD_ENOUGH);

    expect(killed).toBe(1);
    expect(failedKills).toBe(2);
  });
});
