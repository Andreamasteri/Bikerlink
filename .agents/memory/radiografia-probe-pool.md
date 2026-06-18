---
name: Radiografia pipeline probe — pool saturation & surface gotchas
description: Why the pipeline-monitor probes must batch + use statement_timeout, and the non-obvious traps in the notification/road-hazards/OTA diagnostic surfaces.
---

# Radiografia (pipeline-monitor) probe rules

The DB pool is 10 connections. Running all diagnostic checks at once via
`Promise.all` saturates it: the slow probes hold connections long enough that the
others time out, producing a *cascade* of fake "Failed query" results across
unrelated pipelines (AI Assistant, Session Crash, GPS).

**Rule:** in `server/ai/pipeline-monitor/runner.ts` probes run in small batches
(≤3 at a time), and every diagnostic query in
`server/ai/pipeline-monitor/checks/misc.ts` goes through the `dbq()` helper, which
wraps the query in a transaction with `SET LOCAL statement_timeout = 5000`.

**Why:** a single hung probe must not occupy a pool connection indefinitely; the
5s statement_timeout + batching keeps total concurrent diagnostic connections low,
so one slow query can't make the whole Radiografia look broken.

**How to apply:** never reintroduce `Promise.all` over the full check set, and
never call `db.execute` directly inside a check — always use `dbq()`.

## Diagnostic-surface traps (durable, easy to regress)

- **notification_history looks like a ghost table unless writes actually fire.**
  The probe just counts rows; the table exists, but it stays empty if
  `recordNotificationHistory` is not called. It must be invoked on *every* outcome:
  per-ticket sent/failed, HTTP non-200, AND network-exception catch blocks — in
  both the shared Expo send path and any custom push path (e.g. planned-route
  invites). Skipping the failure branches is the usual reason it reads 0.

- **Probe vs route query-param mismatch silently disables filtering.** The
  road-hazards probe sends `lon=`, but the route reads `lng`. Geo filters that
  require *both* lat and lng then never activate, so the SQL bounding-box +
  partial index never get exercised and the query falls back to a slow scan.
  Route param parsing should accept both `lng` and the `lon` alias.

- **An external sync on a diagnostic endpoint must be non-blocking.** OTA
  `/releases` calls the EAS GraphQL sync, which can exceed the 5s probe budget.
  Serve the DB immediately and trigger the sync fire-and-forget in the background
  (TTL-gated + in-flight dedup), never `await` it on the request path. Awaiting
  even a TTL-cached sync still blocks on cold cache / TTL expiry.
