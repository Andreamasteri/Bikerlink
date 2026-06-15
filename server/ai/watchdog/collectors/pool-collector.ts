// Pool metrics probe — tracks pg.Pool exhaustion before it causes a crash loop.
// Reads pool.totalCount / idleCount / waitingCount on each watchdog tick and
// emits:
//   - INFO  : normal pool snapshot (always emitted for metrics dashboard)
//   - WARN  : waitingCount > 0 for 2+ consecutive ticks
//   - CRITICAL: waitingCount >= pool.max (full pool exhaustion)
import { pool } from "../../../db";
import type { Signal } from "../types";

// Module-level state: how many consecutive ticks had waitingCount > 0.
let consecutiveWaiting = 0;

// pool.max is set to 10 in server/db.ts; read it dynamically so this stays
// in sync if the config ever changes.
function getPoolMax(): number {
  // pg.Pool exposes options.max at runtime.
  const opts = (pool as unknown as { options?: { max?: number } }).options;
  return typeof opts?.max === "number" ? opts.max : 10;
}

export function collectPool(): Signal[] {
  const signals: Signal[] = [];
  try {
    const total = pool.totalCount;
    const idle = pool.idleCount;
    const waiting = pool.waitingCount;
    const max = getPoolMax();

    // ── Counters (always emit for the metrics dashboard) ──────────────────
    signals.push({
      source: "db",
      metric: "db.pool.total",
      value: total,
      unit: "conn",
      severity: "info",
    });
    signals.push({
      source: "db",
      metric: "db.pool.idle",
      value: idle,
      unit: "conn",
      severity: "info",
    });

    // ── Waiting clients ────────────────────────────────────────────────────
    if (waiting > 0) {
      consecutiveWaiting++;
    } else {
      consecutiveWaiting = 0;
    }

    // CRITICAL: pool fully saturated (all slots checked out + clients waiting).
    if (waiting >= max) {
      signals.push({
        source: "db",
        metric: "db.pool.waiting",
        value: waiting,
        unit: "clients",
        severity: "critical",
        details: { total, idle, max, consecutiveWaiting },
      });
    } else if (waiting > 0 && consecutiveWaiting >= 2) {
      // WARN: waiting clients for 2+ consecutive ticks — early pressure signal.
      signals.push({
        source: "db",
        metric: "db.pool.waiting",
        value: waiting,
        unit: "clients",
        severity: "warn",
        details: { total, idle, max, consecutiveWaiting },
      });
    } else {
      // INFO: normal (waiting === 0, or first tick with waiting > 0).
      signals.push({
        source: "db",
        metric: "db.pool.waiting",
        value: waiting,
        unit: "clients",
        severity: "info",
        details: { total, idle, max },
      });
    }
  } catch (err) {
    signals.push({
      source: "db",
      metric: "db.pool.collector.error",
      severity: "warn",
      details: { error: (err as Error).message?.slice(0, 200) },
    });
  }
  return signals;
}
