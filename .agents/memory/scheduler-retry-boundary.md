---
name: Scheduler retry boundary (vacuum vs map-matching)
description: Where withSchedulerRetry may wrap a nightly job and where it must NOT, to keep idempotency.
---

# Nightly scheduler retry boundary

`withSchedulerRetry` (server/lib/scheduler-retry.ts) adds exp-backoff+jitter retry,
but it may ONLY wrap an operation that is safe to replay whole.

**Rule:** retry the *initial discovery/connection-acquisition* of a nightly job, never
its work loop.

- map-matching: wrap only the initial discovery query (read-only) — replaying it is harmless.
- vacuum (server/vacuum-service.ts): wrap only a dedicated connection-acquisition PROBE
  (`withSchedulerRetry(() => withBgDbConnection(c => c.query("SELECT 1")))`). The per-table
  VACUUM loop then runs exactly once in a SEPARATE, non-retried `withBgDbConnection`.

**Why:** the bg-db-limiter (server/lib/bg-db-limiter.ts) rejects at `acquire()` BEFORE the
callback runs (kill-switch DB-slow / queue full) — that rejection is the transient failure
worth retrying. If you instead wrap the whole `withBgDbConnection(... per-table loop ...)`,
a transient error mid-loop replays tables already vacuumed that run. A probe isolates the
retryable acquisition from the once-only work.

**How to apply:** any new nightly/background job using withSchedulerRetry — keep the retried
unit to a cheap idempotent acquisition/discovery; let the mutating loop fall through to the
outer catch (recorded via recordJobAttempt ok:false) on failure, not into a retry.

Both jobs also write a "last attempt" AppSetting (recordJobAttempt: ts, ok, retries, truncated
error) separate from "last success", surfaced in admin and as watchdog signals
(maps-collector `matching.last_attempt`, db-collector `vacuum.last_attempt`, both "high" on fail).
