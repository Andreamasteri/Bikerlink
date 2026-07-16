// Task #2533 — Collector scheduler matching. Legge stato lock + lastRun.
import { storage } from "../../../storage";
import type { Signal } from "../types";

interface LockSetting { lockedAt?: string | null; lastRunAt?: string | null; lastRunDurationMs?: number | null; lastTickAt?: string | null; lastTickResult?: string | null; lastZombieRecoveredAt?: string | null }

// Task #157 — Soglia "scheduler morto": il loop scheduler emette un heartbeat
// di liveness ogni 60s (scheduler.engine.ts); se lastTickAt è più vecchio di
// questa soglia il loop/processo è effettivamente fermo. Configurabile via
// AppSetting `scheduler_dead_threshold_ms` (default 5 min).
const DEAD_THRESHOLD_DEFAULT_MS = 5 * 60_000;

async function getDeadThresholdMs(): Promise<number> {
  try {
    const row = await storage.getAppSetting("scheduler_dead_threshold_ms");
    const n = row?.value ? parseInt(row.value, 10) : NaN;
    if (Number.isFinite(n) && n >= 60_000) return n;
  } catch { /* fallback al default */ }
  return DEAD_THRESHOLD_DEFAULT_MS;
}

export async function collectScheduler(): Promise<Signal[]> {
  const signals: Signal[] = [];
  try {
    const row = await storage.getAppSetting("matching_scheduler_state");
    const parsed = row?.valueJson as LockSetting | null;
    const now = Date.now();
    const deadThresholdMs = await getDeadThresholdMs();

    // ── Heartbeat del loop: distingue "scheduler vivo che salta" da "morto" ──
    const lastTickAt = parsed?.lastTickAt ? new Date(parsed.lastTickAt).getTime() : null;
    const heartbeatAgeMin = lastTickAt != null ? Math.floor((now - lastTickAt) / 60_000) : null;
    const schedulerAlive = lastTickAt != null && now - lastTickAt <= deadThresholdMs;
    if (heartbeatAgeMin != null) {
      signals.push({
        source: "scheduler", metric: "scheduler.heartbeat_age_min", value: heartbeatAgeMin, unit: "min",
        severity: heartbeatAgeMin > 70 ? "warn" : "info",
        details: { lastTickAt: parsed?.lastTickAt, lastTickResult: parsed?.lastTickResult },
      });
    }

    // Task #157 — Segnale HIGH esplicito per heartbeat morto: il loop emette un
    // heartbeat ogni 60s, quindi un silenzio oltre soglia = processo/timer fermi
    // (non "scheduler che salta legittimamente"). deriveProblems lo promuove a
    // problema high `scheduler.scheduler_heartbeat_dead`.
    if (lastTickAt != null && !schedulerAlive) {
      const silentMin = Math.floor((now - lastTickAt) / 60_000);
      signals.push({
        source: "scheduler", metric: "scheduler_heartbeat_dead", value: silentMin, unit: "min",
        severity: "high",
        details: {
          lastTickAt: parsed?.lastTickAt,
          lastTickResult: parsed?.lastTickResult,
          thresholdMs: deadThresholdMs,
          message: `Scheduler matching silenzioso da ${silentMin}min`,
        },
      });
    }

    // Task #157 — Evento di recovery zombie: registrato in un campo dedicato
    // (lastZombieRecoveredAt) perché lastTickResult viene sovrascritto dal
    // heartbeat successivo. Segnale informativo per le ultime 24h.
    if (parsed?.lastZombieRecoveredAt) {
      const recoveredAgoMin = Math.floor((now - new Date(parsed.lastZombieRecoveredAt).getTime()) / 60_000);
      if (recoveredAgoMin >= 0 && recoveredAgoMin <= 24 * 60) {
        signals.push({
          source: "scheduler", metric: "scheduler.zombie_recovered", value: recoveredAgoMin, unit: "min",
          severity: "info",
          details: { lastZombieRecoveredAt: parsed.lastZombieRecoveredAt },
        });
      }
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
