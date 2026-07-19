// Task #877 — Regressione: runAutoFix() (ciclo scheduler) NON deve invocare
// rebuild_index / restart_worker / scale_concurrency, che sono riservati
// esclusivamente all'accettazione esplicita di proposte admin via PROPOSAL_DISPATCH_RULES.
import { describe, it, expect, vi } from "vitest";

// Stub del DB e del log (richiesti indirettamente dall'import di auto-fix/index).
vi.mock("../db", () => ({
  db: { execute: vi.fn(async () => ({ rows: [] })), insert: vi.fn(() => ({ values: () => ({ catch: () => {} }) })) },
  pool: {},
}));
vi.mock("../ai/watchdog/log", () => ({
  writeWatchdogLog: vi.fn().mockResolvedValue("log-id"),
}));
vi.mock("../storage", () => ({
  storage: { getAppSetting: vi.fn(), upsertAppSetting: vi.fn() },
}));

// Stub delle implementazioni reali che userebbero DB / pg pool.
vi.mock("../embeddings/store", () => ({
  rebuildHnswIndex: vi.fn(),
  getHnswIndexStatus: vi.fn(async () => ({ exists: true, valid: true })),
}));
vi.mock("../ai/watchdog/collectors/db-collector", () => ({ resetState: vi.fn() }));
vi.mock("../ai/watchdog/collectors/pool-collector", () => ({ resetState: vi.fn() }));

import { runAutoFix, AUTO_FIX_RULES, PROPOSAL_DISPATCH_RULES } from "../ai/watchdog/auto-fix";
import type { HealthSnapshot } from "../ai/watchdog/types";

function makeSnapshot(overrides: Partial<HealthSnapshot["metrics"]> = {}): HealthSnapshot {
  return {
    status: "red",
    score: 20,
    problems: [],
    metrics: {
      "latency.latency.p99_ms": 8000,
      "db.db.ping_ms": 6000,
      "bullmq.queue.matching.waiting": 0,
      ...overrides,
    },
    generatedAt: new Date().toISOString(),
  };
}

const PROPOSAL_ONLY_IDS = ["rebuild_index", "restart_worker", "scale_concurrency"] as const;

describe("AUTO_FIX_RULES vs PROPOSAL_DISPATCH_RULES isolation (Task #877)", () => {
  it("AUTO_FIX_RULES non contiene rebuild_index, restart_worker o scale_concurrency", () => {
    const schedulerIds = AUTO_FIX_RULES.map((r) => r.id);
    for (const id of PROPOSAL_ONLY_IDS) {
      expect(schedulerIds, `${id} non deve essere in AUTO_FIX_RULES (scheduler-driven)`).not.toContain(id);
    }
  });

  it("PROPOSAL_DISPATCH_RULES contiene tutte e 3 le regole accept-time", () => {
    for (const id of PROPOSAL_ONLY_IDS) {
      expect(
        PROPOSAL_DISPATCH_RULES[id],
        `${id} deve essere in PROPOSAL_DISPATCH_RULES`,
      ).toBeDefined();
      expect(typeof PROPOSAL_DISPATCH_RULES[id].run).toBe("function");
    }
  });

  it("runAutoFix() non invoca rebuild_index anche con snapshot degradato (indice non valido)", async () => {
    // Anche se l'indice fosse mancante, runAutoFix() non deve invocarlo.
    // Verifichiamo che le regole scheduler non abbiano l'id rebuild_index.
    const snap = makeSnapshot();
    const results = await runAutoFix(snap);
    const invokedIds = results.map((r) => r.ruleId);
    for (const id of PROPOSAL_ONLY_IDS) {
      expect(invokedIds, `runAutoFix() non deve invocare ${id} autonomamente`).not.toContain(id);
    }
  });

  it("runAutoFix() non invoca restart_worker anche con latenza DB critica", async () => {
    const snap = makeSnapshot({ "db.db.ping_ms": 60_000, "latency.latency.p99_ms": 20_000 });
    const results = await runAutoFix(snap);
    const invokedIds = results.map((r) => r.ruleId);
    expect(invokedIds).not.toContain("restart_worker");
    expect(invokedIds).not.toContain("scale_concurrency");
  });
});
