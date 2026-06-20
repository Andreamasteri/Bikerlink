// Pool + bg-db-limiter pressure probe — surfaces Postgres contention before it
// causes a crash loop downstream.
//
// On each watchdog tick this reads two cheap, zero-I/O snapshots:
//   - getPoolStats()        → pg.Pool counters (total/idle/waiting/max)
//   - getBgDbLimiterStats() → cooperative bg-job semaphore (active/queued/max)
//
// Emitted signals:
//   - INFO     : normal snapshots (always emitted for the metrics dashboard)
//   - WARN     : early pressure (waiting>0 or limiter queued for 2+ ticks)
//   - HIGH     : persistent pressure (waiting>0 or limiter queued for 3+ ticks)
//   - CRITICAL : full pool exhaustion (waitingCount >= pool.max)
//
// Anti-blip rationale (mirrors db-collector): a single tick with a waiting
// client or a queued bg job is almost always a transient blip. Escalating the
// global watchdog status on an isolated sample generates false alarms, so we
// require the pressure to be PERSISTENT (N consecutive samples) before pushing
// severity to "high".
import { getPoolStats } from "../../../db";
import { getBgDbLimiterStats } from "../../../lib/bg-db-limiter";
import type { Signal } from "../types";

// Consecutive over-threshold samples required to escalate. Matches the
// db-collector anti-blip pattern (CONSECUTIVE_SLOW_FOR_HIGH = 3).
const CONSECUTIVE_FOR_WARN = 2;
const CONSECUTIVE_FOR_HIGH = 3;

// Module-level state: consecutive ticks under pressure for each gauge.
let consecutiveWaiting = 0;
let consecutiveLimiterQueued = 0;

export function collectPool(): Signal[] {
  const signals: Signal[] = [];

  // ── pg.Pool counters ────────────────────────────────────────────────────
  try {
    const { total, idle, waiting, max } = getPoolStats();

    // Counters (always emit for the metrics dashboard).
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

    // Waiting clients — escalate only after N consecutive ticks under pressure.
    if (waiting > 0) {
      consecutiveWaiting++;
    } else {
      consecutiveWaiting = 0;
    }

    let waitingSeverity: Signal["severity"];
    if (waiting >= max) {
      // CRITICAL: pool fully saturated (all slots checked out + clients waiting).
      waitingSeverity = "critical";
    } else if (consecutiveWaiting >= CONSECUTIVE_FOR_HIGH) {
      // HIGH: persistent pressure — waiting clients for 3+ consecutive ticks.
      waitingSeverity = "high";
    } else if (waiting > 0 && consecutiveWaiting >= CONSECUTIVE_FOR_WARN) {
      // WARN: early pressure — waiting clients for 2 consecutive ticks.
      waitingSeverity = "warn";
    } else {
      // INFO: normal (waiting === 0, or first tick with waiting > 0).
      waitingSeverity = "info";
    }
    signals.push({
      source: "db",
      metric: "db.pool.waiting",
      value: waiting,
      unit: "clients",
      severity: waitingSeverity,
      details: { total, idle, max, consecutiveWaiting },
    });
  } catch (err) {
    signals.push({
      source: "db",
      metric: "db.pool.collector.error",
      severity: "warn",
      details: { error: (err as Error).message?.slice(0, 200) },
    });
  }

  // ── bg-db-limiter (cooperative background-job semaphore) ──────────────────
  try {
    const { active, queued, max } = getBgDbLimiterStats();

    // Active slots in use (always emit for the metrics dashboard).
    signals.push({
      source: "db",
      metric: "db.bg_limiter.active",
      value: active,
      unit: "slots",
      severity: "info",
      details: { max },
    });

    // Queued bg jobs — a non-empty queue means background work is starved
    // waiting for a DB slot, i.e. the reserved bg budget is saturated. Escalate
    // only after N consecutive ticks to avoid blip-driven false alarms.
    if (queued > 0) {
      consecutiveLimiterQueued++;
    } else {
      consecutiveLimiterQueued = 0;
    }

    let queuedSeverity: Signal["severity"];
    if (consecutiveLimiterQueued >= CONSECUTIVE_FOR_HIGH) {
      queuedSeverity = "high";
    } else if (queued > 0 && consecutiveLimiterQueued >= CONSECUTIVE_FOR_WARN) {
      queuedSeverity = "warn";
    } else {
      queuedSeverity = "info";
    }
    signals.push({
      source: "db",
      metric: "db.bg_limiter.queued",
      value: queued,
      unit: "jobs",
      severity: queuedSeverity,
      details: { active, max, consecutiveQueued: consecutiveLimiterQueued },
    });
  } catch (err) {
    signals.push({
      source: "db",
      metric: "db.bg_limiter.collector.error",
      severity: "warn",
      details: { error: (err as Error).message?.slice(0, 200) },
    });
  }

  return signals;
}
