// Surfaces high-frequency diagnostic signals (js_thread_freeze, gps_flood,
// memory_pressure, native_module_missing, appstate_transition) from the
// crash_logs table to the watchdog aggregator. These signals are stored as
// crash_js rows with a [resume:X] prefix in error_message (written by
// lib/crash-logger.ts).
//
// Default thresholds (over a 2h rolling window):
//   js_thread_freeze:      ≥10 total from ≥2 distinct users → warn; ≥50/≥3  → high
//   gps_flood:             ≥15 total from ≥2 distinct users → warn; ≥60/≥3  → high
//   memory_pressure:       ≥5 total from ≥2 distinct users → warn; ≥20/≥3  → high
//   native_module_missing: ≥3 total from ≥1 distinct user  → warn (rare, serious)
//   appstate_transition:   ≥200 total from ≥10 distinct users → warn; ≥500/≥20 → high
//                          (very noisy in normal use; high thresholds catch loop bugs only)
//
// Thresholds are configurable via AppSetting key "watchdog_signal_thresholds"
// (valueJson — partial overrides merged over the defaults above).
// Example: { "appstate_transition": { "warnCount": 300, "warnUsers": 15 } }
import { db } from "../../../db";
import { sql } from "drizzle-orm";
import { storage } from "../../../storage";
import type { Signal } from "../types";

interface SignalRow {
  signal_type: string;
  total: number;
  distinct_users: number;
  [key: string]: unknown;
}

interface SignalThreshold {
  warnCount: number;
  warnUsers: number;
  highCount: number;
  highUsers: number;
}

const DEFAULT_SIGNAL_CONFIG: Record<string, SignalThreshold & { label: string }> = {
  js_thread_freeze:      { warnCount: 10,  warnUsers: 2,  highCount: 50,  highUsers: 3,   label: "JS thread freeze" },
  gps_flood:             { warnCount: 15,  warnUsers: 2,  highCount: 60,  highUsers: 3,   label: "GPS flood" },
  memory_pressure:       { warnCount: 5,   warnUsers: 2,  highCount: 20,  highUsers: 3,   label: "pressione RAM" },
  native_module_missing: { warnCount: 3,   warnUsers: 1,  highCount: 999, highUsers: 999, label: "modulo nativo mancante" },
  // High thresholds: normal foreground/background cycling is expected. Only
  // fire when volume is extreme (hundreds of transitions from many devices)
  // which indicates a likely app-state loop bug.
  appstate_transition:   { warnCount: 200, warnUsers: 10, highCount: 500, highUsers: 20,  label: "loop transizioni app" },
};

async function resolveSignalConfig(): Promise<typeof DEFAULT_SIGNAL_CONFIG> {
  try {
    const setting = await storage.getAppSetting("watchdog_signal_thresholds");
    if (!setting?.valueJson) return DEFAULT_SIGNAL_CONFIG;
    const overrides = setting.valueJson as Record<string, Partial<SignalThreshold>>;
    const merged = { ...DEFAULT_SIGNAL_CONFIG };
    for (const [key, override] of Object.entries(overrides)) {
      if (merged[key] && override && typeof override === "object") {
        merged[key] = {
          ...merged[key],
          ...(typeof override.warnCount  === "number" ? { warnCount:  Math.max(1, override.warnCount)  } : {}),
          ...(typeof override.warnUsers  === "number" ? { warnUsers:  Math.max(1, override.warnUsers)  } : {}),
          ...(typeof override.highCount  === "number" ? { highCount:  Math.max(1, override.highCount)  } : {}),
          ...(typeof override.highUsers  === "number" ? { highUsers:  Math.max(1, override.highUsers)  } : {}),
        };
      }
    }
    return merged;
  } catch {
    return DEFAULT_SIGNAL_CONFIG;
  }
}

export async function collectCrashSignals(): Promise<Signal[]> {
  try {
    const [result, config] = await Promise.all([
      db.execute<SignalRow>(sql`
        SELECT
          CASE
            WHEN error_message LIKE '[resume:js_thread_freeze]%'      THEN 'js_thread_freeze'
            WHEN error_message LIKE '[resume:gps_flood]%'             THEN 'gps_flood'
            WHEN error_message LIKE '[resume:memory_pressure]%'       THEN 'memory_pressure'
            WHEN error_message LIKE '[resume:native_module_missing]%' THEN 'native_module_missing'
            WHEN error_message LIKE '[resume:appstate_transition]%'   THEN 'appstate_transition'
          END AS signal_type,
          COUNT(*)::int                AS total,
          COUNT(DISTINCT user_id)::int AS distinct_users
        FROM app_crash_logs
        WHERE error_message LIKE '[resume:%]%'
          AND reported_at >= NOW() - INTERVAL '2 hours'
        GROUP BY signal_type
        HAVING signal_type IS NOT NULL
      `),
      resolveSignalConfig(),
    ]);

    const signals: Signal[] = [];

    for (const row of result.rows) {
      const cfg = config[row.signal_type];
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
