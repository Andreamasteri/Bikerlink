---
name: bg-db-limiter drop vs real error classification
description: How to distinguish an intentional bg-db-limiter kill-switch drop from a real application error in background job catch blocks (matching scheduler and similar cyclic jobs).
---

`isBgDbLimiterDropError(err)` (server/lib/bg-db-limiter.ts) identifies the three
"expected valve" error classes the limiter throws on purpose when the managed
Postgres pool is under pressure: `BgDbSlowKillSwitchError`,
`BgDbQueueOverflowError`, `BgDbQueueTimeoutError`.

**Why:** these drops are a deliberate backpressure mechanism, not application
bugs. Logging them as ERROR and counting them in the same bucket as real
errors caused false high/critical watchdog alerts and made it look like the
ThinkCentre (self-hosted infra) was the culprit when it was actually managed
DB connection instability.

**How to apply:** in any catch block around a `withBgDbSlot(...)` call, branch
on `isBgDbLimiterDropError(err)` before falling through to the generic error
path:
- classify as WARN, not ERROR (log message should explicitly say "DB managed
  sotto pressione ... NON il ThinkCentre" so on-call doesn't chase the wrong
  system)
- record via a separate metric/counter (e.g. `recordCycleDrop`) instead of the
  error counter (`recordCycleError`) that feeds alerting/`getRecentErrorCount`
- for jobs with long natural cycles (e.g. hourly cleanup), consider scheduling
  a short-delay one-shot retry instead of waiting for the next full cycle
- an outcome enum tracking cycle status should have a third state (e.g.
  `"skipped"`) distinct from `"ok"`/`"error"` so downstream consumers
  (pipeline-monitor, admin dashboards) don't misreport a backpressure drop as
  a failure.
