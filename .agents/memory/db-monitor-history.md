---
name: Database Monitor history (DB + backend load)
description: Retention/architecture decisions behind the admin DB+backend load history, and the watchdog metric-key gotcha it depends on.
---

# Database Monitor history

The admin Database Monitor tracks **DB load AND backend Node load** together over 24h/48h/7d/30d with separate overload banners and a CSV download.

## Retention is deliberately separate
The history lives in its own table with **35-day** retention, kept apart from the 7-day watchdog signals and the 24-hour resource-graph samples.

**Why:** the feature promises ≥30 days; the existing signal/resource tables purge far sooner, so folding into them (or reusing their cleanups) would silently drop the long history.

## One row per aggregator tick, fire-and-forget, always background-slotted
Rows are written from the watchdog aggregator cycle (~60s), reusing the pool/ping/error/restart the collectors already computed — no extra DB queries. The write, the retention cleanup, and the range/CSV reads **all go through `withBgDbSlot`** (managed pool is fixed at max=10). The write is `.catch()`-swallowed so it can never break the watchdog cycle.

## Backend-load signal is independent of the DB pool
The backend probe uses `perf_hooks.monitorEventLoopDelay()` + a `process.cpuUsage()` delta + RSS on a cheap timer, read synchronously (zero-I/O). This is what lets an admin tell "backend overloaded" apart from "DB overloaded".

## GOTCHA — the watchdog metric map double-prefixes the source
The aggregator builds keys as `` `${source}.${metric}` ``. Because the DB collector's metric is already named `db.ping_ms` under source `db`, the real key is **`db.db.ping_ms`** (double `db`); restart is `app.server.restart_alert`. When reading these out of a snapshot, look up the double-prefixed key with a fallback to the bare name.

## PATTERN — surfacing "good news" (recovery) without polluting the score
An overload *recovery* must NOT become a `Problem` (a Problem lowers the score/status and shows in the arbiter reasons — semantically backwards for an all-clear). The channel used instead: emit an **`info`-severity signal that carries a numeric `value`**. `deriveProblems` skips `info` (so no Problem, no score hit) and `recordSignals` filters `info` (so it isn't persisted), BUT the aggregator's metrics map includes *every* signal with a numeric value — so an `info` signal still lands in `snap.metrics` under `` `${source}.${metric}` ``. `alerts.ts` reads that metric key to fire the recovery push. **Why:** this is the only clean way to route a positive event through the same snapshot→alerts pipeline the negative events use.
**How to apply:** recovery is edge-triggered in `db-monitor-history.ts` — a `wasSustained` latch arms when a side becomes sustained, and `recovered` fires once (clearing the latch) after a full symmetric window of healthy ticks; alerts uses a *separate* throttle key from the start alert so an all-clear isn't blocked by a preceding alarm.
