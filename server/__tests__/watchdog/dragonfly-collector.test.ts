/**
 * Tests: dragonfly-collector watchdog signal coverage
 *
 * Verifies that collectDragonfly() emits the correct signals and severities for:
 *   1. TC_DRAGONFLY_URL unset → dragonfly.absent at "info"
 *   2. PING success (fast) → dragonfly.ping_ms at "info"
 *   3. PING success (slow >200ms) → dragonfly.ping_ms at "warn"
 *   4. PING success + INFO memory → dragonfly.used_memory_mb emitted
 *   5. PING failure, never connected → dragonfly.unreachable at "info"
 *   6. PING failure after successful connection → "warn" on 1st+2nd, "high" at 3rd+
 *   7. ioredis unavailable → no signal emitted (empty array)
 *
 * Module-level state (hadSuccessfulConnection, consecutiveFailures) is reset
 * via vi.resetModules() + re-import before each test.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

// Helper: build a mock ioredis client and a constructor that always returns it.
// Uses a regular function (not arrow) so it works correctly with `new`.
function makeIoredisMock(overrides: {
  ping?: () => Promise<string>;
  info?: (section?: string) => Promise<string>;
  quit?: () => Promise<unknown>;
} = {}) {
  const client = {
    ping: overrides.ping ?? vi.fn().mockResolvedValue("PONG"),
    info: overrides.info ?? vi.fn().mockResolvedValue("used_memory:10485760\r\n"),
    quit: overrides.quit ?? vi.fn().mockResolvedValue("OK"),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor = vi.fn().mockImplementation(function (this: any) { return client; });
  return { Ctor, client };
}

// Helper: reset modules, set URL, register ioredis mock, import fresh collector.
async function freshCollector(
  Ctor: ReturnType<typeof makeIoredisMock>["Ctor"] | null,
  url = "redis://tc:6380",
) {
  vi.resetModules();
  if (url) {
    process.env.TC_DRAGONFLY_URL = url;
  } else {
    delete process.env.TC_DRAGONFLY_URL;
  }
  if (Ctor !== null) {
    vi.doMock("ioredis", () => ({ default: Ctor }));
  } else {
    // Simulate ioredis import failure
    vi.doMock("ioredis", () => { throw new Error("Module not found"); });
  }
  const mod = await import("../../ai/watchdog/collectors/dragonfly-collector");
  return mod.collectDragonfly;
}

afterEach(() => {
  delete process.env.TC_DRAGONFLY_URL;
  vi.restoreAllMocks();
});

// ─── absent ─────────────────────────────────────────────────────────────────

describe("dragonfly-collector: absent signal", () => {
  it("emits dragonfly.absent at info when TC_DRAGONFLY_URL is unset", async () => {
    vi.resetModules();
    delete process.env.TC_DRAGONFLY_URL;
    const { collectDragonfly } = await import(
      "../../ai/watchdog/collectors/dragonfly-collector"
    );
    const signals = await collectDragonfly();
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      source: "dragonfly",
      metric: "dragonfly.absent",
      severity: "info",
    });
  });
});

// ─── PING success ────────────────────────────────────────────────────────────

describe("dragonfly-collector: PING success", () => {
  it("emits dragonfly.ping_ms at info for a fast ping", async () => {
    const { Ctor } = makeIoredisMock();
    const collectDragonfly = await freshCollector(Ctor);
    const signals = await collectDragonfly();
    const ping = signals.find((s) => s.metric === "dragonfly.ping_ms");
    expect(ping).toBeDefined();
    expect(ping!.severity).toBe("info");
    expect(typeof ping!.value).toBe("number");
    expect(ping!.unit).toBe("ms");
  });

  it("emits dragonfly.ping_ms at warn when ping exceeds 200ms", async () => {
    const { Ctor } = makeIoredisMock();
    const collectDragonfly = await freshCollector(Ctor);

    // Stub Date.now so the elapsed time appears as 250ms
    let callCount = 0;
    const realNow = Date.now.bind(Date);
    vi.spyOn(Date, "now").mockImplementation(() => (callCount++ === 0 ? 0 : 250));

    const signals = await collectDragonfly();
    const ping = signals.find((s) => s.metric === "dragonfly.ping_ms");
    expect(ping).toBeDefined();
    expect(ping!.severity).toBe("warn");
    expect(ping!.value).toBe(250);
    Date.now = realNow;
  });

  it("emits dragonfly.used_memory_mb when INFO memory is parsable", async () => {
    const tenMbBytes = 10 * 1024 * 1024;
    const { Ctor } = makeIoredisMock({
      info: vi.fn().mockResolvedValue(`used_memory:${tenMbBytes}\r\n`),
    });
    const collectDragonfly = await freshCollector(Ctor);
    const signals = await collectDragonfly();
    const mem = signals.find((s) => s.metric === "dragonfly.used_memory_mb");
    expect(mem).toBeDefined();
    expect(mem!.value).toBe(10);
    expect(mem!.unit).toBe("MB");
    expect(mem!.severity).toBe("info");
  });

  it("emits dragonfly.used_memory_mb at warn when memory exceeds 800MB", async () => {
    const bigBytes = 850 * 1024 * 1024;
    const { Ctor } = makeIoredisMock({
      info: vi.fn().mockResolvedValue(`used_memory:${bigBytes}\r\n`),
    });
    const collectDragonfly = await freshCollector(Ctor);
    const signals = await collectDragonfly();
    const mem = signals.find((s) => s.metric === "dragonfly.used_memory_mb");
    expect(mem).toBeDefined();
    expect(mem!.severity).toBe("warn");
  });

  it("does not emit dragonfly.used_memory_mb when INFO has no used_memory field", async () => {
    const { Ctor } = makeIoredisMock({
      info: vi.fn().mockResolvedValue("# Memory\r\nsome_other_field:123\r\n"),
    });
    const collectDragonfly = await freshCollector(Ctor);
    const signals = await collectDragonfly();
    expect(signals.find((s) => s.metric === "dragonfly.used_memory_mb")).toBeUndefined();
    // ping signal is still present
    expect(signals.find((s) => s.metric === "dragonfly.ping_ms")).toBeDefined();
  });
});

// ─── PING failure / hysteresis ───────────────────────────────────────────────

describe("dragonfly-collector: PING failure hysteresis", () => {
  it("emits dragonfly.unreachable at info on first failure when never connected", async () => {
    const err = new Error("ECONNREFUSED");
    const { Ctor } = makeIoredisMock({ ping: vi.fn().mockRejectedValue(err) });
    const collectDragonfly = await freshCollector(Ctor);

    const signals = await collectDragonfly();
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      source: "dragonfly",
      metric: "dragonfly.unreachable",
      severity: "info",
    });
    expect(signals[0].details).toMatchObject({
      consecutiveFailures: 1,
      fallback: "in-memory",
    });
  });

  it("escalates to warn on the 1st failure after a successful connection", async () => {
    const { Ctor, client } = makeIoredisMock({ ping: vi.fn().mockResolvedValue("PONG") });
    const collectDragonfly = await freshCollector(Ctor);

    // Establish hadSuccessfulConnection = true
    await collectDragonfly();

    // Now fail
    client.ping = vi.fn().mockRejectedValue(new Error("timeout"));
    const signals = await collectDragonfly();
    const unreach = signals.find((s) => s.metric === "dragonfly.unreachable");
    expect(unreach).toBeDefined();
    expect(unreach!.severity).toBe("warn");
    expect(unreach!.details).toMatchObject({ consecutiveFailures: 1 });
  });

  it("stays at warn on the 2nd consecutive failure (threshold is 3)", async () => {
    const { Ctor, client } = makeIoredisMock({ ping: vi.fn().mockResolvedValue("PONG") });
    const collectDragonfly = await freshCollector(Ctor);

    await collectDragonfly(); // success

    client.ping = vi.fn().mockRejectedValue(new Error("timeout"));
    await collectDragonfly(); // 1st failure → warn
    const signals = await collectDragonfly(); // 2nd failure → still warn
    const unreach = signals.find((s) => s.metric === "dragonfly.unreachable");
    expect(unreach!.severity).toBe("warn");
    expect(unreach!.details).toMatchObject({ consecutiveFailures: 2 });
  });

  it("escalates to high at the 3rd consecutive failure (FAILURES_BEFORE_HIGH = 3)", async () => {
    const { Ctor, client } = makeIoredisMock({ ping: vi.fn().mockResolvedValue("PONG") });
    const collectDragonfly = await freshCollector(Ctor);

    await collectDragonfly(); // success

    client.ping = vi.fn().mockRejectedValue(new Error("timeout"));
    await collectDragonfly(); // 1st → warn
    await collectDragonfly(); // 2nd → warn
    const signals = await collectDragonfly(); // 3rd → high
    const unreach = signals.find((s) => s.metric === "dragonfly.unreachable");
    expect(unreach!.severity).toBe("high");
    expect(unreach!.details).toMatchObject({ consecutiveFailures: 3 });
  });

  it("resets consecutiveFailures after a successful recovery", async () => {
    const { Ctor, client } = makeIoredisMock({ ping: vi.fn().mockResolvedValue("PONG") });
    const collectDragonfly = await freshCollector(Ctor);

    await collectDragonfly(); // success

    // Two failures
    client.ping = vi.fn().mockRejectedValue(new Error("timeout"));
    await collectDragonfly();
    await collectDragonfly();

    // Recovery
    client.ping = vi.fn().mockResolvedValue("PONG");
    const recoverySignals = await collectDragonfly();
    expect(recoverySignals.find((s) => s.metric === "dragonfly.ping_ms")).toBeDefined();
    expect(recoverySignals.find((s) => s.metric === "dragonfly.unreachable")).toBeUndefined();

    // Next single failure should be warn (counter was reset to 0)
    client.ping = vi.fn().mockRejectedValue(new Error("timeout again"));
    const afterRecovery = await collectDragonfly();
    const unreach = afterRecovery.find((s) => s.metric === "dragonfly.unreachable");
    expect(unreach!.severity).toBe("warn");
    expect(unreach!.details).toMatchObject({ consecutiveFailures: 1 });
  });
});

// ─── ioredis unavailable ─────────────────────────────────────────────────────

describe("dragonfly-collector: ioredis unavailable", () => {
  it("returns an empty signal array when ioredis import fails", async () => {
    const collectDragonfly = await freshCollector(null);
    const signals = await collectDragonfly();
    expect(signals).toHaveLength(0);
  });
});
