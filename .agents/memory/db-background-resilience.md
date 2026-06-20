---
name: DB background-cycle resilience
description: Retry helper + anti-blip watchdog so a single transient DB blip doesn't cascade into red alarms / log storms.
---

Background DB cycles must absorb a SINGLE transient DB blip (timeout/disconnect) without degrading or tripping the watchdog to `red`. A prolonged real outage must still degrade gracefully.

**Where the primitives live (server/db.ts):**
- `isTransientDbError(err)` — single source of truth for "transient" (DbTimeoutError/isDbTimeout flag, pg connection codes 57P0x/08xxx, socket ECONNRESET/ETIMEDOUT/EPIPE/ENOTFOUND, message regex). NEVER classifies app errors (23xxx constraint, 42xxx syntax) as transient.
- `withDbRetry(fn, {retries=2, baseDelayMs=120, maxDelayMs=1000})` — retries ONLY transient errors with exp backoff+jitter; propagates non-transient immediately; throws last error after exhaustion so callers keep their degrading fallback.

**Anti-blip rule (severity weights: info=0/warn=5/high=18/critical=40; status red <40):**
A single `db.ping_ms`>500 or one failed ping must NOT reach `high`/`critical` — that's what produced false red alarms. db-collector keeps module-level consecutive counters: slow ping → `warn`, escalates to `high` only after 3 consecutive slow samples; failed ping → `warn`, escalates to `critical` only after 3 consecutive failures. Counters reset on success. Circuit breaker (db-circuit-breaker.ts) independently opens at 3 consecutive failures.

**Log noise:** server/lib/dedup-logger.ts `dedupWarn(key, msg, detail?, windowMs=60s)` — logs first occurrence, suppresses rest in window, flushes `+N altri errori simili` summary. Use it (not console.warn + full stack) in background-cycle catch fallbacks.

**Why:** one transient blip used to fire collector.error=critical from multiple subsystems at once → score <40 → watchdog red + per-tick stack-trace storm. Retry absorbs the blip; consecutive-counter gating keeps isolated events out of red; dedup collapses the storm.

**Express route reads:** the same `withDbRetry` from server/db.ts also wraps idempotent SELECT reads inside GET handlers (route files with direct `db` imports) so a transient blip doesn't surface to mobile users as a 500. Convention: wrap reads only; leave ALL write paths (POST/PUT/PATCH/DELETE) explicit — including idempotent membership/dup pre-checks that gate a mutation (no silent write retry). User-facing fallback is unchanged: after retries exhaust, the handler's existing catch surfaces the same explicit 500. For drizzle builders reused across the same handler (e.g. a leaderboard query built in parts), assign the FINISHED builder to a const, then `await withDbRetry(() => finalQuery)` — never wrap a half-built builder whose `.orderBy()/.limit()` would re-append on retry. Routes that go through the storage layer (no direct `db` import) are not wrapped here — the storage layer itself is the higher-leverage place to add retry.
