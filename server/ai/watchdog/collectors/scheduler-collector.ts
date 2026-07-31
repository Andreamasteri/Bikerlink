// Task #2533 — Collector scheduler matching. Legge stato lock + lastRun.
import { storage } from "../../../storage";
import { getMatchingLockStatus } from "../../../cache/matching-lock";
import type { Signal } from "../types";

interface LockSetting {
  lockedAt?: string | null;
  lastRunAt?: string | null;
  lastRunDurationMs?: number | null;
  lastTickAt?: string | null;
  lastTickResult?: string | null;
  lastZombieRecoveredAt?: string | null;
  // Task #705: heartbeat gap recovery
  lastGapRecoveredAt?: string | null;
  lastGapDurationMin?: number | null;
  // Task #705: skip diagnostics
  lastSkipReason?: string | null;
  lastSkipAt?: string | null;
}

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

    // Task #705 — Segnale di recovery dopo gap: se il loop è tornato vivo dopo
    // un'assenza >30 min, viene scritto lastGapRecoveredAt+lastGapDurationMin in
    // matching_scheduler_state da startMatchingEngine(). Emettilo come segnale
    // INFO per le ultime 2 ore, così l'admin vede l'evento nella dashboard.
    if (parsed?.lastGapRecoveredAt && parsed.lastGapDurationMin != null) {
      const recoveredAgoMs = now - new Date(parsed.lastGapRecoveredAt).getTime();
      const recoveredAgoMin = Math.floor(recoveredAgoMs / 60_000);
      if (recoveredAgoMin >= 0 && recoveredAgoMin <= 120) {
        signals.push({
          source: "scheduler", metric: "scheduler.resumed_after_gap", value: parsed.lastGapDurationMin, unit: "min",
          severity: "warn",
          details: {
            lastGapRecoveredAt: parsed.lastGapRecoveredAt,
            gapDurationMin: parsed.lastGapDurationMin,
            recoveredAgoMin,
            message: `Loop ripreso ${recoveredAgoMin}min fa dopo ${parsed.lastGapDurationMin}min di silenzio`,
          },
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
        details: {
          lastRunAt: parsed?.lastRunAt,
          schedulerAlive,
          lastTickResult: parsed?.lastTickResult,
          lastSkipReason: parsed?.lastSkipReason ?? null,
          lastSkipAt: parsed?.lastSkipAt ?? null,
        },
      });

      // Task #939 — run_gap_no_lock: scheduler vivo ma nessun ciclo da >=60min e
      // nessun lock attivo → escalation a HIGH per notifica admin tempestiva.
      // Threshold separato dal zombie-gate (4h) così il segnale scatta a 60min
      // indipendentemente dalla durata del gap.
      // Task #705 — zombie lock detection: dal gate 4h in poi, controlla se il
      // lock è tenuto da un PID diverso (istanza morta, non rilasciato).
      // Entrambi i check condividono una singola chiamata a DragonflyDB.
      const RUN_GAP_NO_LOCK_THRESHOLD_MS = 60 * 60 * 1000; // 1 ora — soglia notifica
      const RUN_GAP_ZOMBIE_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 ore — zombie-lock
      // Il primo tick automatico è programmato un'ora dopo l'avvio. Durante
      // questa sola finestra lastRunAt può appartenere alla replica precedente:
      // non è un gap operativo, ma una transizione di deploy/restart.
      const RUN_GAP_STARTUP_GRACE_MS = RUN_GAP_NO_LOCK_THRESHOLD_MS + 5 * 60 * 1000;
      const startupGraceActive = process.uptime() * 1000 < RUN_GAP_STARTUP_GRACE_MS;
      if (schedulerAlive && ageMs > RUN_GAP_NO_LOCK_THRESHOLD_MS && !startupGraceActive) {
        try {
          const ls = await getMatchingLockStatus();
          const remoteHolder = ls.redis.remoteHolder as { pid?: number } | null;
          const isZombieLock = ls.redis.exists
            && remoteHolder?.pid != null
            && remoteHolder.pid !== process.pid;
          if (ageMs > RUN_GAP_ZOMBIE_THRESHOLD_MS && isZombieLock) {
            // Lock tenuto da un PID diverso dopo >4h: possibile zombie da crash.
            signals.push({
              source: "scheduler", metric: "scheduler.lock_zombie_suspected", value: ageMin, unit: "min",
              severity: "high",
              details: {
                lastRunMinAgo: ageMin,
                lockHolder: ls.redis.remoteHolder,
                currentPid: process.pid,
                holderPid: remoteHolder?.pid,
                message: `Lock tenuto da PID ${remoteHolder?.pid} (processo corrente: ${process.pid}) — possibile zombie`,
              },
            });
          } else if (ageMs > RUN_GAP_ZOMBIE_THRESHOLD_MS && ls.active) {
            // Lock attivo ma stesso PID dopo >4h: ciclo in corso (normale),
            // già gestito da CYCLE_STALE_MS. Aggiungi solo come diagnostico.
            signals.push({
              source: "scheduler", metric: "scheduler.lock_active_long_gap", value: ageMin, unit: "min",
              severity: "warn",
              details: {
                lastRunMinAgo: ageMin,
                lockHolder: ls.holder,
                lockRedis: ls.redis,
                message: `Lock attivo ma lastRunAt è ${ageMin}min fa — ciclo potenzialmente bloccato`,
              },
            });
          } else if (!ls.active) {
            // Nessun lock attivo: il loop salta per coordinator/pool saturo.
            // Sempre HIGH a questo punto (già >= 60min senza ciclo — Task #939).
            signals.push({
              source: "scheduler", metric: "scheduler.run_gap_no_lock", value: ageMin, unit: "min",
              severity: "high",
              details: {
                lastRunMinAgo: ageMin,
                lastSkipReason: parsed?.lastSkipReason ?? null,
                lastSkipAt: parsed?.lastSkipAt ?? null,
                message: `Nessun ciclo completato da ${ageMin}min — nessun lock attivo (coordinator/pool saturo?)`,
              },
            });
          }
        } catch {
          /* best-effort — non bloccare il collector se DragonflyDB è offline */
        }
      }
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
