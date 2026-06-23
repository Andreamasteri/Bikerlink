// Task #2533 — Collector scheduler matching. Legge stato lock + lastRun.
import { storage } from "../../../storage";
import type { Signal } from "../types";

interface LockSetting { lockedAt?: string | null; lastRunAt?: string | null; lastRunDurationMs?: number | null; lastTickAt?: string | null; lastTickResult?: string | null }

// Il loop dello scheduler gira a cadenza oraria (60 min). Consideriamo il loop
// "vivo" se ha emesso un heartbeat entro ~2 tick + margine. Oltre questa soglia
// il loop è effettivamente fermo (Task #4798).
const HEARTBEAT_ALIVE_MAX_MIN = 130;

export async function collectScheduler(): Promise<Signal[]> {
  const signals: Signal[] = [];
  try {
    const row = await storage.getAppSetting("matching_scheduler_state");
    const parsed = row?.valueJson as LockSetting | null;
    const now = Date.now();

    // ── Heartbeat del loop: distingue "scheduler vivo che salta" da "morto" ──
    const lastTickAt = parsed?.lastTickAt ? new Date(parsed.lastTickAt).getTime() : null;
    const heartbeatAgeMin = lastTickAt != null ? Math.floor((now - lastTickAt) / 60_000) : null;
    const schedulerAlive = heartbeatAgeMin != null && heartbeatAgeMin <= HEARTBEAT_ALIVE_MAX_MIN;
    if (heartbeatAgeMin != null) {
      signals.push({
        source: "scheduler", metric: "scheduler.heartbeat_age_min", value: heartbeatAgeMin, unit: "min",
        severity: !schedulerAlive ? "high" : heartbeatAgeMin > 70 ? "warn" : "info",
        details: { lastTickAt: parsed?.lastTickAt, lastTickResult: parsed?.lastTickResult },
      });
    }

    const lastRunAt = parsed?.lastRunAt ? new Date(parsed.lastRunAt).getTime() : null;
    if (lastRunAt) {
      const ageMs = now - lastRunAt;
      const ageMin = Math.floor(ageMs / 60_000);
      // Se il loop è vivo (heartbeat fresco) ma non completa un ciclo, sta
      // saltando legittimamente (pool saturo, ecc.): non è uno "scheduler morto",
      // quindi non escaliamo a "high" — il segnale di morte è heartbeat_age_min.
      let severity: Signal["severity"];
      if (schedulerAlive) {
        severity = ageMin > 180 ? "warn" : "info";
      } else {
        severity = ageMin > 180 ? "high" : ageMin > 90 ? "warn" : "info";
      }
      signals.push({
        source: "scheduler", metric: "scheduler.last_run_min_ago", value: ageMin, unit: "min",
        severity,
        details: { lastRunAt: parsed?.lastRunAt, schedulerAlive, lastTickResult: parsed?.lastTickResult },
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
