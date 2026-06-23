---
name: Scheduler heartbeat & zombie recovery
description: Perché il matching scheduler sembrava "bloccato per ore" e le tre valvole che lo auto-recuperano
---

# Matching scheduler self-recovery (last_run_min_ago / bg backlog)

`matching_scheduler_state.lastRunAt` veniva scritto SOLO a fine ciclo riuscito.
Quindi skip (pool saturo) o errori facevano crescere `last_run_min_ago` senza
limite e il watchdog non distingueva "scheduler vivo che salta" da "morto".

**Rule:** ogni tick (anche skip) DEVE emettere un heartbeat
(`recordSchedulerHeartbeat` in scheduler.cycle.ts: scrive lastTickAt +
lastTickResult, throttle 30s, best-effort via withBgDbSlot). Il collector
(scheduler-collector.ts) usa `scheduler.heartbeat_age_min`: se l'heartbeat è
fresco declassa `last_run_min_ago` da "high" a "warn".
**Why:** evita falsi "high" persistenti che bruciano il proposer Groq
(vedi watchdog-proposer-cooldown).

**Zombie cycleInFlight:** la guardia in-process non aveva TTL. Se l'IIFE del
ciclo non si risolveva, restava true per sempre → tutti i tick = skip
"already_running". Fix: se bloccato da >CYCLE_STALE_MS (10min, sopra il lock TTL
di 5min in matching-lock.ts) → reset forzato + forceUnlockMatchingLock.

**bg-db-limiter backlog:** la coda di withBgDbSlot era FIFO illimitata → sotto
DB lento `db.bg_limiter.queued` esplodeva (100+). Ora due valvole:
BG_DB_MAX_QUEUE (default 64, overflow → BgDbQueueOverflowError) e
BG_DB_QUEUE_TIMEOUT_MS (default 30s, attesa stantia → BgDbQueueTimeoutError).
Counter dropped* esposti in getBgDbLimiterStats().
**How to apply:** i job bg devono tollerare il rigetto (ritentati al tick
dopo) — è una valvola voluta, non un bug.
