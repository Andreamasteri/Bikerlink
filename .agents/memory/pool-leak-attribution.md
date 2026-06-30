---
name: Pool connection-leak attribution (application_name + tracer)
description: How to diagnose "pool saturo ma 0 query attive" — attribute idle PIDs to us, in-process checkout tracer, server-side idle nets.
---

# "pool saturo ma 0 query attive" — root-cause toolkit

Symptom: pg.Pool (max=10) connections checked out but **idle on the DB side**
(`state='idle'`, no running query) for minutes → pool saturates, p99 spikes to the
client timeout, bg-db-limiter kill-switch trips, JS thread freeze → crash. A
checked-out-but-not-querying PoolClient survives BOTH `statement_timeout` (kills
only running queries) AND `idleTimeoutMillis` (evicts only in-pool idle, not
checked-out).

**Rule: a static `try/finally { client.release() }` audit is NOT enough.** All our
`pool.connect()` sites already had correct finally blocks; the leak is held
connections, not missing releases.

## The linchpin: application_name
Our pools historically set NO `application_name`, so in `pg_stat_activity` our
backends are INDISTINGUISHABLE from the Replit managed-Postgres connections. You
cannot tell if the anomalous idle PIDs are ours. Always set `application_name`
(main pool `bikerlink-app`, monitoringPool `bikerlink-monitor`) — every detector
filters on it.

## In-process checkout tracer (db.ts)
Monkey-patch `pool.connect` AFTER pool creation, BEFORE `drizzle(pool)`. Only the
**promise form** is tracked (explicit `await pool.connect()` + drizzle
transactions — the risky checkouts). The **callback form** is passed through
untracked — that is what `pool.query()` (drizzle autocommit) uses internally, so
overhead stays negligible. Capture `new Error().stack` at acquire, delete on
release, guard double-delete but STILL call origRelease so pg's native
`throwOnDoubleRelease` is preserved. Expose `getCheckedOutConnections(minAgeMs)`
→ the detector prints the JS stack of whoever didn't release.

## Server-side nets
- `idle_in_transaction_session_timeout` (e.g. 60s) on the pool: Postgres kills any
  session stuck in BEGIN-without-COMMIT. Autocommit drizzle queries never open a
  txn → unaffected. Defends the findSimilar BEGIN/COMMIT error-edge class.
- **Latent bug:** `rebuildHnswIndex` runs `CREATE INDEX CONCURRENTLY` but inherits
  the pool default `statement_timeout=5000` → PG kills the build at 5s leaving an
  INVALID index. Must `SET statement_timeout = 0` on that connection, restore in finally.

## Active detector (pool-collector)
Out-of-band `pg.Client` (not the saturated pool) queries idle/idle-in-transaction
of our `application_name` with `state_change < now()-30s`; logs PID/last-query/age
+ cross-references the in-process tracer stacks. Async probe deposits result in
module state; the NEXT synchronous `collectPool()` tick emits the `high` signal
(probe can't push into the sync return). Forced `pg_terminate_backend` is gated by
AppSetting `db_idle_conn_kill_enabled` (default OFF), kill threshold age 60s.

**Dev caveat:** the Replit dev DB has `track_activities` off → `state='disabled'`
in pg_stat_activity, so the detector can't be exercised in dev; it works in prod
(same dependency as the pre-existing snapshotBlockedQueries probe). Verify on real
prod logs ~10 min after publish.
