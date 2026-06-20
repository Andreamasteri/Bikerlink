/**
 * Tests for the telemetry collector state machine (Task #4588).
 *
 * The machine (lib/telemetry-collector-machine.ts) is pure: every side effect
 * is injected, so the transitions are exercised here with mock effects — no
 * React, no native modules. Each test drives a transition and awaits the
 * machine's serialized chain (`settled()`) before asserting.
 *
 * The critical invariant — foreground subscriptions and the background task can
 * NEVER both be the active source — is asserted by tracking which source is
 * "active" through the effect mocks and recording the maximum number of
 * simultaneously-active sources across the whole run.
 */

import { describe, it, expect, vi } from "vitest";
import {
  createTelemetryCollector,
  type CollectorEffects,
} from "@/lib/telemetry-collector-machine";

// ── test harness: effects that track which source is active ───────────────────
function makeHarness(opts: { backgroundStarts?: boolean } = {}) {
  const backgroundStarts = opts.backgroundStarts ?? true;

  let foregroundActive = false;
  let backgroundActive = false;
  let maxConcurrentSources = 0;

  const recordConcurrency = () => {
    const n = (foregroundActive ? 1 : 0) + (backgroundActive ? 1 : 0);
    if (n > maxConcurrentSources) maxConcurrentSources = n;
  };

  const calls: string[] = [];

  const effects: CollectorEffects = {
    beginSession: vi.fn(async () => { calls.push("beginSession"); }),
    startForeground: vi.fn(async () => {
      calls.push("startForeground");
      foregroundActive = true;
      recordConcurrency();
    }),
    stopForeground: vi.fn(() => {
      calls.push("stopForeground");
      foregroundActive = false;
    }),
    flush: vi.fn(async (force: boolean) => { calls.push(`flush:${force}`); }),
    startBackground: vi.fn(async () => {
      calls.push("startBackground");
      if (backgroundStarts) {
        backgroundActive = true;
        recordConcurrency();
      }
      return backgroundStarts;
    }),
    stopBackground: vi.fn(async () => {
      calls.push("stopBackground");
      backgroundActive = false;
    }),
    drainBackground: vi.fn(async () => { calls.push("drainBackground"); }),
    finishSession: vi.fn(async () => {
      calls.push("finishSession");
      foregroundActive = false;
      backgroundActive = false;
    }),
  };

  return {
    effects,
    calls,
    get foregroundActive() { return foregroundActive; },
    get backgroundActive() { return backgroundActive; },
    get maxConcurrentSources() { return maxConcurrentSources; },
  };
}

describe("telemetry collector machine — start → foreground", () => {
  it("idle → foreground: begins session then starts foreground subs, no bg task", async () => {
    const h = makeHarness();
    const m = createTelemetryCollector(h.effects);

    expect(m.getState()).toBe("idle");

    m.start();
    await m.settled();

    expect(m.getState()).toBe("foreground");
    expect(h.calls).toEqual(["beginSession", "startForeground"]);
    expect(h.foregroundActive).toBe(true);
    expect(h.backgroundActive).toBe(false);
    expect(h.effects.startBackground).not.toHaveBeenCalled();
  });

  it("start is a no-op when not idle", async () => {
    const h = makeHarness();
    const m = createTelemetryCollector(h.effects);
    m.start();
    await m.settled();
    (h.effects.beginSession as ReturnType<typeof vi.fn>).mockClear();

    m.start(); // already foreground
    await m.settled();

    expect(h.effects.beginSession).not.toHaveBeenCalled();
    expect(m.getState()).toBe("foreground");
  });
});

describe("telemetry collector machine — foreground → background", () => {
  it("stops foreground BEFORE starting bg task, flushes during the handoff", async () => {
    const h = makeHarness();
    const m = createTelemetryCollector(h.effects);
    m.start();
    await m.settled();

    m.toBackground();
    await m.settled();

    expect(m.getState()).toBe("background");
    // Order matters: foreground torn down + buffer flushed before bg task starts.
    const idxStop  = h.calls.indexOf("stopForeground");
    const idxFlush = h.calls.indexOf("flush:true");
    const idxStart = h.calls.indexOf("startBackground");
    expect(idxStop).toBeGreaterThan(-1);
    expect(idxStop).toBeLessThan(idxStart);
    expect(idxFlush).toBeLessThan(idxStart);
    expect(h.foregroundActive).toBe(false);
    expect(h.backgroundActive).toBe(true);
    // Invariant: the two sources were never simultaneously active.
    expect(h.maxConcurrentSources).toBe(1);
  });

  it("background-permission denied → falls back to a durable stop (idle)", async () => {
    const h = makeHarness({ backgroundStarts: false });
    const m = createTelemetryCollector(h.effects);
    m.start();
    await m.settled();

    m.toBackground();
    await m.settled();

    expect(m.getState()).toBe("idle");
    // finishSession (force-flush + persist) must run so nothing is dropped.
    expect(h.effects.finishSession).toHaveBeenCalledTimes(1);
    expect(h.foregroundActive).toBe(false);
    expect(h.backgroundActive).toBe(false);
  });

  it("toBackground is a no-op unless foreground", async () => {
    const h = makeHarness();
    const m = createTelemetryCollector(h.effects);

    m.toBackground(); // idle
    await m.settled();

    expect(h.effects.startBackground).not.toHaveBeenCalled();
    expect(m.getState()).toBe("idle");
  });
});

describe("telemetry collector machine — background → foreground (drain)", () => {
  it("stops bg task and drains its buffer BEFORE restarting foreground subs", async () => {
    const h = makeHarness();
    const m = createTelemetryCollector(h.effects);
    m.start();
    await m.settled();
    m.toBackground();
    await m.settled();
    h.calls.length = 0; // focus on the resume transition

    m.toForeground();
    await m.settled();

    expect(m.getState()).toBe("foreground");
    // bg task stopped + buffer drained before foreground subs come back.
    expect(h.calls).toEqual(["stopBackground", "drainBackground", "startForeground"]);
    expect(h.foregroundActive).toBe(true);
    expect(h.backgroundActive).toBe(false);
    // Invariant across the full start→bg→fg cycle.
    expect(h.maxConcurrentSources).toBe(1);
  });

  it("toForeground is a no-op unless background", async () => {
    const h = makeHarness();
    const m = createTelemetryCollector(h.effects);
    m.start();
    await m.settled();
    h.calls.length = 0;

    m.toForeground(); // currently foreground
    await m.settled();

    expect(h.effects.stopBackground).not.toHaveBeenCalled();
    expect(h.effects.drainBackground).not.toHaveBeenCalled();
    expect(m.getState()).toBe("foreground");
  });
});

describe("telemetry collector machine — stop with forced flush", () => {
  it("stop from foreground: tears down, drains bg, force-flushes, returns to idle", async () => {
    const h = makeHarness();
    const m = createTelemetryCollector(h.effects);
    m.start();
    await m.settled();

    await m.stop();

    expect(m.getState()).toBe("idle");
    expect(h.effects.stopForeground).toHaveBeenCalled();
    // Defensive bg teardown + drain even from the foreground path.
    expect(h.effects.stopBackground).toHaveBeenCalled();
    expect(h.effects.drainBackground).toHaveBeenCalled();
    expect(h.effects.finishSession).toHaveBeenCalledTimes(1);
  });

  it("stop from background: drains bg buffer before finishing", async () => {
    const h = makeHarness();
    const m = createTelemetryCollector(h.effects);
    m.start();
    await m.settled();
    m.toBackground();
    await m.settled();
    h.calls.length = 0;

    await m.stop();

    expect(m.getState()).toBe("idle");
    const idxDrain  = h.calls.indexOf("drainBackground");
    const idxFinish = h.calls.indexOf("finishSession");
    expect(idxDrain).toBeGreaterThan(-1);
    expect(idxDrain).toBeLessThan(idxFinish);
  });

  it("stop is idempotent (second stop is a no-op)", async () => {
    const h = makeHarness();
    const m = createTelemetryCollector(h.effects);
    m.start();
    await m.settled();
    await m.stop();
    (h.effects.finishSession as ReturnType<typeof vi.fn>).mockClear();

    await m.stop();

    expect(h.effects.finishSession).not.toHaveBeenCalled();
    expect(m.getState()).toBe("idle");
  });
});

describe("telemetry collector machine — serialized rapid transitions", () => {
  it("a background→foreground flip never lets both sources run at once", async () => {
    const h = makeHarness();
    const m = createTelemetryCollector(h.effects);

    // Fire a burst of transitions without awaiting in between.
    m.start();
    m.toBackground();
    m.toForeground();
    m.toBackground();
    m.toForeground();
    await m.settled();

    expect(m.getState()).toBe("foreground");
    // The whole serialized burst kept the one-active-source invariant.
    expect(h.maxConcurrentSources).toBe(1);
  });

  it("stop queued during a start still ends idle", async () => {
    const h = makeHarness();
    const m = createTelemetryCollector(h.effects);

    m.start();
    const stopped = m.stop();
    await stopped;

    expect(m.getState()).toBe("idle");
    expect(h.foregroundActive).toBe(false);
    expect(h.backgroundActive).toBe(false);
  });
});
