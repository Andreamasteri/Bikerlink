// Surfaces high-frequency diagnostic signals (js_thread_freeze, gps_flood,
// memory_pressure, native_module_missing) from the crash_logs table to the
// watchdog aggregator. These signals are stored as crash_js rows with a
// [resume:X] prefix in error_message (written by lib/crash-logger.ts).
//
// Thresholds (over a 2h rolling window):
//   js_thread_freeze:      ≥10 total from ≥2 distinct users → warn; ≥50/≥3 → high
//   gps_flood:             ≥15 total from ≥2 distinct users → warn; ≥60/≥3 → high
//   memory_pressure:       ≥5 total from ≥2 distinct users → warn; ≥20/≥3 → high
//   native_module_missing: ≥3 total from ≥1 distinct user  → warn (rare, serious)
//
// appstate_transition is intentionally excluded: too noisy to be actionable.
import { db } from "../../../db";
import { sql } from "drizzle-orm";
import type { Signal } from "../types";

interface SignalRow {
  signal_type: string;
  total: number;
  distinct_users: number;
  [key: string]: unknown;
}

const SIGNAL_CONFIG: Record<string, {
  warnCount: number; warnUsers: number;
  highCount: number; highUsers: number;
  label: string;
}> = {
  js_thread_freeze:      { warnCount: 10,  warnUsers: 2, highCount: 50,  highUsers: 3, label: "JS thread freeze" },
  gps_flood:             { warnCount: 15,  warnUsers: 2, highCount: 60,  highUsers: 3, label: "GPS flood" },
  memory_pressure:       { warnCount: 5,   warnUsers: 2, highCount: 20,  highUsers: 3, label: "pressione RAM" },
  native_module_missing: { warnCount: 3,   warnUsers: 1, highCount: 999, highUsers: 999, label: "modulo nativo mancante" },
};

export async function collectCrashSignals(): Promise<Signal[]> {
  try {
    const result = await db.execute<SignalRow>(sql`
      SELECT
        CASE
          WHEN error_message LIKE '[resume:js_thread_freeze]%'      THEN 'js_thread_freeze'
          WHEN error_message LIKE '[resume:gps_flood]%'             THEN 'gps_flood'
          WHEN error_message LIKE '[resume:memory_pressure]%'       THEN 'memory_pressure'
          WHEN error_message LIKE '[resume:native_module_missing]%' THEN 'native_module_missing'
        END AS signal_type,
        COUNT(*)::int            AS total,
        COUNT(DISTINCT user_id)::int AS distinct_users
      FROM app_crash_logs
      WHERE error_message LIKE '[resume:%]%'
        AND error_message NOT LIKE '[resume:appstate_transition]%'
        AND reported_at >= NOW() - INTERVAL '2 hours'
      GROUP BY signal_type
      HAVING signal_type IS NOT NULL
    `);

    const signals: Signal[] = [];

    for (const row of result.rows) {
      const cfg = SIGNAL_CONFIG[row.signal_type];
      if (!cfg) continue;

      const isHigh = row.total >= cfg.highCount && row.distinct_users >= cfg.highUsers;
      const isWarn = row.total >= cfg.warnCount && row.distinct_users >= cfg.warnUsers;
      if (!isHigh && !isWarn) continue;

      signals.push({
        source: "app",
        metric: `crash_signal.${row.signal_type}`,
        severity: isHigh ? "high" : "warn",
        value: row.total,
        unit: "events/2h",
        details: {
          signalType: row.signal_type,
          label: cfg.label,
          total: row.total,
          distinctUsers: row.distinct_users,
          windowH: 2,
        },
      });
    }

    return signals;
  } catch (err) {
    return [{
      source: "app",
      metric: "collector.error",
      severity: "warn",
      details: { collector: "crash-signals", error: (err as Error).message?.slice(0, 200) },
    }];
  }
}
