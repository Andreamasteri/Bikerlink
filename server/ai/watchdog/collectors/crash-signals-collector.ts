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
import { db, withDbRetry } from "../../../db";
import { sql } from "drizzle-orm";
import { storage } from "../../../storage";
import { dedupWarn } from "../../../lib/dedup-logger";
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

// Task #154 — Reset dello stato del collector. Questo collector è stateless:
// deriva i segnali direttamente da una query a finestra scorrevole (2h) su
// app_crash_logs, senza contatori/latch in memoria di processo. La finestra si
// svuota da sé quando i crash escono dalle 2h. La funzione esiste per conformità
// all'interfaccia ICollectorReset ed è un no-op idempotente.
export function resetState(): void {
  /* nessuno stato in-process da azzerare */
}

export async function collectCrashSignals(): Promise<Signal[]> {
  try {
    const [result, config] = await Promise.all([
      withDbRetry(() => db.execute<SignalRow>(sql`
        WITH recent_resume_signals AS (
          SELECT
            CASE
              WHEN error_message LIKE '[resume:js_thread_freeze]%'      THEN 'js_thread_freeze'
              WHEN error_message LIKE '[resume:gps_flood]%'             THEN 'gps_flood'
              WHEN error_message LIKE '[resume:memory_pressure]%'       THEN 'memory_pressure'
              WHEN error_message LIKE '[resume:native_module_missing]%' THEN 'native_module_missing'
              WHEN error_message LIKE '[resume:appstate_transition]%'   THEN 'appstate_transition'
            END AS signal_type,
            user_id
          FROM app_crash_logs
          WHERE error_message LIKE '[resume:%]%'
            AND reported_at >= NOW() - INTERVAL '2 hours'
        )
        SELECT
          signal_type,
          COUNT(*)::int                AS total,
          COUNT(DISTINCT user_id)::int AS distinct_users
        FROM recent_resume_signals
        WHERE signal_type IS NOT NULL
        GROUP BY signal_type
      `)),
      resolveSignalConfig(),
    ]);

    const signals: Signal[] = [];

    // Task #155 — metrica separata "segnali resume": totale eventi [resume:%]
    // nelle 2h, SEMPRE emessa come info (mai un Problem). Serve a mantenere
    // visibili i resume ora che sono esclusi dal conteggio crash/crash-free-rate
    // dell'error-collector.
    const resumeTotal = result.rows.reduce((acc, r) => acc + Number(r.total ?? 0), 0);
    signals.push({
      source: "app",
      metric: "resume.signals_2h",
      value: resumeTotal,
      unit: "events/2h",
      severity: "info",
      details: {
        windowH: 2,
        byType: Object.fromEntries(result.rows.map((r) => [r.signal_type, Number(r.total ?? 0)])),
      },
    });

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
    // Task #155 — fallimento query = warning deduplicato, NON un segnale: il
    // collector.error veniva contato come "errore DB" e latch-ava il problema
    // "Database sovraccarico sostenuto" anche con ping/pool sani. Ritorno neutro.
    dedupWarn("watchdog/crash-signals", "query fallita, skip segnale", (err instanceof Error ? err.message : String(err)));
    return [];
  }
}
