/**
 * Tests: bullmq-collector watchdog signal coverage
 *
 * Verifies that collectBullMq() emits the correct signals and severities for:
 *   1. bullmq import fails → empty array
 *   2. No __bikerlinkBullQueues registry → empty array
 *   3. Empty registry → empty array
 *   4. Queue with low counts → 4 "info" signals
 *   5. Queue with waiting > 100 → "warn" for waiting signal
 *   6. Queue with waiting > 500 → "high" for waiting signal
 *   7. Queue with failed > 10 → "warn" for failed signal
 *   8. Queue with failed > 50 → "high" for failed signal
 *   9. getJobCounts throws → queue.name.error signal at "warn"
 *  10. Multiple queues → signals emitted for each
 */
import { describe, it, expect, vi, afterEach } from "vitest";

// Helper: set the global queue registry
function setRegistry(entries: [string, unknown][] | null) {
  const g = globalThis as unknown as { __bikerlinkBullQueues?: Map<string, unknown> };
  if (entries === null) {
    delete g.__bikerlinkBullQueues;
  } else {
    g.__bikerlinkBullQueues = new Map(entries);
  }
}

// Helper: build a mock queue object
function makeQueue(counts: Record<string, number>) {
  return { getJobCounts: vi.fn().mockResolvedValue(counts) };
}

// Helper: fresh import of the collector with a mocked bullmq module
async function freshCollector(bullmqAvailable = true) {
  vi.resetModules();
  if (bullmqAvailable) {
    vi.doMock("bullmq", () => ({ Queue: vi.fn() }));
  } else {
    vi.doMock("bullmq", () => { throw new Error("Module not found"); });
  }
  const mod = await import("../../ai/watchdog/collectors/bullmq-collector");
  return mod.collectBullMq;
}

afterEach(() => {
  setRegistry(null);
  vi.restoreAllMocks();
});

// ─── import failure ─────────────────────────────────────────────────────────

describe("bullmq-collector: bullmq unavailable", () => {
  it("returns empty array when bullmq import fails", async () => {
    const collectBullMq = await freshCollector(false);
    setRegistry([["test-queue", makeQueue({ waiting: 0, failed: 0, active: 0, delayed: 0 })]]);
    const signals = await collectBullMq();
    expect(signals).toEqual([]);
  });
});

// ─── missing / empty registry ───────────────────────────────────────────────

describe("bullmq-collector: missing or empty registry", () => {
  it("returns empty array when __bikerlinkBullQueues is not set", async () => {
    const collectBullMq = await freshCollector();
    setRegistry(null);
    const signals = await collectBullMq();
    expect(signals).toEqual([]);
  });

  it("returns empty array when __bikerlinkBullQueues is empty", async () => {
    const collectBullMq = await freshCollector();
    setRegistry([]);
    const signals = await collectBullMq();
    expect(signals).toEqual([]);
  });

  it("skips queues without getJobCounts", async () => {
    const collectBullMq = await freshCollector();
    setRegistry([["bad-queue", { notAQueue: true }]]);
    const signals = await collectBullMq();
    expect(signals).toEqual([]);
  });
});

// ─── normal counts (info) ───────────────────────────────────────────────────

describe("bullmq-collector: low counts emit info signals", () => {
  it("emits 4 signals all at info for a healthy queue", async () => {
    const collectBullMq = await freshCollector();
    setRegistry([["email", makeQueue({ waiting: 5, failed: 0, active: 1, delayed: 2 })]]);
    const signals = await collectBullMq();

    expect(signals).toHaveLength(4);
    for (const s of signals) {
      expect(s.source).toBe("bullmq");
      expect(s.severity).toBe("info");
    }

    const names = signals.map((s) => s.metric);
    expect(names).toContain("queue.email.waiting");
    expect(names).toContain("queue.email.failed");
    expect(names).toContain("queue.email.active");
    expect(names).toContain("queue.email.delayed");
  });

  it("attaches the correct value and unit to each signal", async () => {
    const collectBullMq = await freshCollector();
    setRegistry([["jobs", makeQueue({ waiting: 3, failed: 1, active: 2, delayed: 4 })]]);
    const signals = await collectBullMq();

    const waiting = signals.find((s) => s.metric === "queue.jobs.waiting");
    expect(waiting?.value).toBe(3);
    expect(waiting?.unit).toBe("jobs");

    const failed = signals.find((s) => s.metric === "queue.jobs.failed");
    expect(failed?.value).toBe(1);

    const active = signals.find((s) => s.metric === "queue.jobs.active");
    expect(active?.value).toBe(2);

    const delayed = signals.find((s) => s.metric === "queue.jobs.delayed");
    expect(delayed?.value).toBe(4);
  });

  it("attaches counts object to the waiting signal details", async () => {
    const collectBullMq = await freshCollector();
    const counts = { waiting: 10, failed: 0, active: 0, delayed: 0 };
    setRegistry([["push", makeQueue(counts)]]);
    const signals = await collectBullMq();
    const waiting = signals.find((s) => s.metric === "queue.push.waiting");
    expect(waiting?.details).toMatchObject(counts);
  });
});

// ─── waiting severity ────────────────────────────────────────────────────────

describe("bullmq-collector: waiting severity thresholds", () => {
  it("emits waiting at warn when waiting is between 100 and 500 (exclusive)", async () => {
    const collectBullMq = await freshCollector();
    setRegistry([["q", makeQueue({ waiting: 101, failed: 0, active: 0, delayed: 0 })]]);
    const signals = await collectBullMq();
    const waiting = signals.find((s) => s.metric === "queue.q.waiting");
    expect(waiting?.severity).toBe("warn");
  });

  it("emits waiting at warn at exactly 101 waiting jobs", async () => {
    const collectBullMq = await freshCollector();
    setRegistry([["q", makeQueue({ waiting: 101, failed: 0, active: 0, delayed: 0 })]]);
    const signals = await collectBullMq();
    const waiting = signals.find((s) => s.metric === "queue.q.waiting");
    expect(waiting?.severity).toBe("warn");
  });

  it("emits waiting at high when waiting exceeds 500", async () => {
    const collectBullMq = await freshCollector();
    setRegistry([["q", makeQueue({ waiting: 501, failed: 0, active: 0, delayed: 0 })]]);
    const signals = await collectBullMq();
    const waiting = signals.find((s) => s.metric === "queue.q.waiting");
    expect(waiting?.severity).toBe("high");
    expect(waiting?.value).toBe(501);
  });

  it("emits waiting at info when exactly at threshold boundary (100)", async () => {
    const collectBullMq = await freshCollector();
    setRegistry([["q", makeQueue({ waiting: 100, failed: 0, active: 0, delayed: 0 })]]);
    const signals = await collectBullMq();
    const waiting = signals.find((s) => s.metric === "queue.q.waiting");
    // 100 is NOT > 100, so info
    expect(waiting?.severity).toBe("info");
  });
});

// ─── failed severity ─────────────────────────────────────────────────────────

describe("bullmq-collector: failed severity thresholds", () => {
  it("emits failed at warn when failed is between 10 and 50 (exclusive)", async () => {
    const collectBullMq = await freshCollector();
    setRegistry([["q", makeQueue({ waiting: 0, failed: 11, active: 0, delayed: 0 })]]);
    const signals = await collectBullMq();
    const failed = signals.find((s) => s.metric === "queue.q.failed");
    expect(failed?.severity).toBe("warn");
  });

  it("emits failed at high when failed exceeds 50", async () => {
    const collectBullMq = await freshCollector();
    setRegistry([["q", makeQueue({ waiting: 0, failed: 51, active: 0, delayed: 0 })]]);
    const signals = await collectBullMq();
    const failed = signals.find((s) => s.metric === "queue.q.failed");
    expect(failed?.severity).toBe("high");
    expect(failed?.value).toBe(51);
  });

  it("emits failed at info when exactly at threshold boundary (10)", async () => {
    const collectBullMq = await freshCollector();
    setRegistry([["q", makeQueue({ waiting: 0, failed: 10, active: 0, delayed: 0 })]]);
    const signals = await collectBullMq();
    const failed = signals.find((s) => s.metric === "queue.q.failed");
    // 10 is NOT > 10, so info
    expect(failed?.severity).toBe("info");
  });
});

// ─── getJobCounts throws ─────────────────────────────────────────────────────

describe("bullmq-collector: getJobCounts error handling", () => {
  it("emits a queue.name.error signal at warn when getJobCounts throws", async () => {
    const collectBullMq = await freshCollector();
    const failingQueue = {
      getJobCounts: vi.fn().mockRejectedValue(new Error("ECONNRESET")),
    };
    setRegistry([["crash-queue", failingQueue]]);
    const signals = await collectBullMq();

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      source: "bullmq",
      metric: "queue.crash-queue.error",
      severity: "warn",
    });
    expect(signals[0].details).toMatchObject({ error: "ECONNRESET" });
  });
});

// ─── multiple queues ─────────────────────────────────────────────────────────

describe("bullmq-collector: multiple queues", () => {
  it("emits signals for every queue in the registry", async () => {
    const collectBullMq = await freshCollector();
    setRegistry([
      ["alpha", makeQueue({ waiting: 0, failed: 0, active: 0, delayed: 0 })],
      ["beta", makeQueue({ waiting: 200, failed: 0, active: 0, delayed: 0 })],
      ["gamma", makeQueue({ waiting: 0, failed: 60, active: 0, delayed: 0 })],
    ]);
    const signals = await collectBullMq();

    // 4 signals per queue × 3 queues = 12
    expect(signals).toHaveLength(12);

    const alphaWaiting = signals.find((s) => s.metric === "queue.alpha.waiting");
    expect(alphaWaiting?.severity).toBe("info");

    const betaWaiting = signals.find((s) => s.metric === "queue.beta.waiting");
    expect(betaWaiting?.severity).toBe("warn"); // 200 > 100

    const gammaFailed = signals.find((s) => s.metric === "queue.gamma.failed");
    expect(gammaFailed?.severity).toBe("high"); // 60 > 50
  });

  it("continues processing remaining queues after one fails", async () => {
    const collectBullMq = await freshCollector();
    setRegistry([
      ["broken", { getJobCounts: vi.fn().mockRejectedValue(new Error("timeout")) }],
      ["ok", makeQueue({ waiting: 0, failed: 0, active: 0, delayed: 0 })],
    ]);
    const signals = await collectBullMq();

    const errorSignal = signals.find((s) => s.metric === "queue.broken.error");
    expect(errorSignal).toBeDefined();
    expect(errorSignal?.severity).toBe("warn");

    const okWaiting = signals.find((s) => s.metric === "queue.ok.waiting");
    expect(okWaiting).toBeDefined();
    expect(okWaiting?.severity).toBe("info");
  });
});
