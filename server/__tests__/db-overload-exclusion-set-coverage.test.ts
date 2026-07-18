/**
 * CI gate — Task #556
 *
 * Guards against a new derived Problem ID re-introducing the feedback loop
 * fixed by Task #545. Any signal emitted by a watchdog collector with
 * `origin === "derived"` and `source === "db"` produces a Problem ID that feeds
 * into `dbErrorCount` — which in turn drives `dbOverload` in
 * `recordDbMonitorSample`. If such an ID is NOT in OVERLOAD_DISPLAY_EXCLUDED_IDS,
 * the feedback loop is live again.
 *
 * HOW THIS GATE WORKS
 * -------------------
 * 1. `collectOverload()` runs with the sustainedTracker stubbed so that
 *    db.sustained=true → the derived signal `db.overload_sustained` is emitted.
 * 2. All signals with `source === "db"` AND `origin === "derived"` are extracted.
 * 3. Their Problem IDs (= `${source}.${metric}`, same formula as deriveProblems)
 *    are checked against OVERLOAD_DISPLAY_EXCLUDED_IDS.
 * 4. A separate hardcoded list (ALWAYS_EXCLUDED_IDS) covers Problem IDs that are
 *    NOT tagged `origin:"derived"` but are excluded because they directly feed the
 *    dbOverload formula (e.g. db.db.pool.waiting → poolWaiting → poolActivePct).
 *
 * WHEN YOU ADD A NEW DERIVED DB SIGNAL
 * -------------------------------------
 * If you add a new signal with `{ source: "db", origin: "derived" }` to any
 * collector:
 *   1. Add its Problem ID (`${source}.${metric}`) to OVERLOAD_DISPLAY_EXCLUDED_IDS
 *      in `server/db-monitor-history.ts`.
 *   2. This test will then pass automatically (no manual update needed here).
 *
 * If you add a non-derived source="db" signal that still feeds directly into the
 * dbOverload formula (like db.pool.waiting did):
 *   1. Add its Problem ID to OVERLOAD_DISPLAY_EXCLUDED_IDS in db-monitor-history.ts.
 *   2. Also add it to ALWAYS_EXCLUDED_IDS below so this test keeps it covered.
 */

import { describe, it, expect, vi } from "vitest";
import { OVERLOAD_DISPLAY_EXCLUDED_IDS } from "../db-monitor-history";

// ── ALWAYS_EXCLUDED_IDS ────────────────────────────────────────────────────────
// Problem IDs that are NOT tagged `origin:"derived"` but MUST stay in the
// exclusion set because they represent metrics already captured directly in the
// dbOverload formula (poolActivePct, poolWaiting) and would cause double-counting.
// If you need to add a new entry here, also add it to OVERLOAD_DISPLAY_EXCLUDED_IDS
// in server/db-monitor-history.ts.
const ALWAYS_EXCLUDED_IDS: string[] = [
  "db.db.pool.waiting", // pool.waiting → poolWaiting/poolActivePct already in formula
];

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Stub the sustainedTracker so collectOverload() emits the derived db signal.
// We drive db.sustained=true to force the derived signal to appear in the output.
vi.mock("../ai/watchdog/state/sustained-tracker", () => ({
  sustainedTracker: {
    getState: () => ({
      db: {
        sustained: true,
        recovered: false,
        consecutiveTicks: 4,
        healthyTicks: 0,
        poolActivePct: 95,
        poolWaiting: 2,
        pingMs: 600,
        dbErrorCount: 0,
        reasons: ["pool"],
      },
      backend: {
        sustained: false,
        recovered: false,
        consecutiveTicks: 0,
        healthyTicks: 0,
        cpuPct: 10,
        eventLoopLagMs: 5,
        eventLoopP99Ms: 10,
        rssMb: 200,
        reasons: [],
      },
    }),
    reset: vi.fn(),
  },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("OVERLOAD_DISPLAY_EXCLUDED_IDS coverage gate (Task #556)", () => {
  it("every source=db origin=derived signal from collectOverload has its Problem ID in OVERLOAD_DISPLAY_EXCLUDED_IDS", async () => {
    // Dynamic import AFTER mocks are registered.
    const { collectOverload } = await import("../ai/watchdog/collectors/overload-collector");
    const signals = collectOverload();

    // Extract signals that would produce a Problem ID feeding into dbErrorCount.
    const derivedDbSignals = signals.filter(
      (s) => s.source === "db" && s.origin === "derived",
    );

    // There must be at least one such signal (db.overload_sustained) when
    // sustainedTracker reports db.sustained=true. If this assertion fails,
    // collectOverload no longer emits derived signals and the gate itself is broken.
    expect(derivedDbSignals.length).toBeGreaterThan(0);

    // Every derived Problem ID must be in the exclusion set.
    for (const sig of derivedDbSignals) {
      const problemId = `${sig.source}.${sig.metric}`;
      expect(
        OVERLOAD_DISPLAY_EXCLUDED_IDS.has(problemId),
        `Problem ID "${problemId}" (source="${sig.source}", metric="${sig.metric}", origin="derived") ` +
          `is NOT in OVERLOAD_DISPLAY_EXCLUDED_IDS. ` +
          `Add it to server/db-monitor-history.ts to prevent the feedback loop.`,
      ).toBe(true);
    }
  });

  it("db.db.overload_sustained is in OVERLOAD_DISPLAY_EXCLUDED_IDS", () => {
    // Pinpoint check: this is the original feedback-loop culprit (Task #545).
    // Keep it explicit so regressions are immediately identifiable.
    expect(OVERLOAD_DISPLAY_EXCLUDED_IDS.has("db.db.overload_sustained")).toBe(true);
  });

  it.each(ALWAYS_EXCLUDED_IDS)(
    '"%s" (non-derived but formula-coupled) is in OVERLOAD_DISPLAY_EXCLUDED_IDS',
    (problemId) => {
      expect(
        OVERLOAD_DISPLAY_EXCLUDED_IDS.has(problemId),
        `Problem ID "${problemId}" must stay in OVERLOAD_DISPLAY_EXCLUDED_IDS — ` +
          `it feeds directly into the dbOverload formula and removing it re-introduces double-counting.`,
      ).toBe(true);
    },
  );
});
