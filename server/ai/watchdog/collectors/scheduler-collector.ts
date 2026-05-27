// Task #2533 — Collector scheduler matching. Legge stato lock + lastRun.
import { storage } from "../../../storage";
import type { Signal } from "../types";

interface LockSetting { lockedAt?: string | null; lastRunAt?: string | null; lastRunDurationMs?: number | null }

export async function collectScheduler(): Promise<Signal[]> {
  const signals: Signal[] = [];
  try {
    const row = await storage.getAppSetting("matching_scheduler_state");
    const parsed = row?.valueJson as LockSetting | null;
    const now = Date.now();
    const lastRunAt = parsed?.lastRunAt ? new Date(parsed.lastRunAt).getTime() : null;
    if (lastRunAt) {
      const ageMs = now - lastRunAt;
      const ageMin = Math.floor(ageMs / 60_000);
      signals.push({
        source: "scheduler", metric: "scheduler.last_run_min_ago", value: ageMin, unit: "min",
        severity: ageMin > 60 ? "high" : ageMin > 20 ? "warn" : "info",
        details: { lastRunAt: parsed?.lastRunAt },
      });
    } else {
      signals.push({
        source: "scheduler", metric: "scheduler.last_run_min_ago", value: null, severity: "warn",
        details: { reason: "never_run_or_setting_missing" },
      });
    }
    if (parsed?.lockedAt) {
      const lockAgeMs = now - new Date(parsed.lockedAt).getTime();
      const lockAgeMin = Math.floor(lockAgeMs / 60_000);
      signals.push({
        source: "scheduler", metric: "scheduler.lock_age_min", value: lockAgeMin, unit: "min",
        severity: lockAgeMin > 30 ? "critical" : lockAgeMin > 10 ? "high" : "info",
        details: { lockedAt: parsed.lockedAt },
      });
    }
    if (parsed?.lastRunDurationMs != null) {
      signals.push({
        source: "scheduler", metric: "scheduler.last_run_duration_ms",
        value: parsed.lastRunDurationMs, unit: "ms",
        severity: parsed.lastRunDurationMs > 300_000 ? "warn" : "info",
      });
    }
  } catch (err) {
    signals.push({
      source: "scheduler", metric: "collector.error", severity: "warn",
      details: { error: (err as Error).message },
    });
  }
  return signals;
}
