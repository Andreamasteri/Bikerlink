---
name: /api/health status contract
description: The /api/health status string is parsed by shell monitors — change it in lockstep.
---

# /api/health status contract

`GET /api/health` returns a `status` string with three values:
- `booting` → HTTP 503 (critical boot phases not done; `initializing:true`)
- `degraded` → HTTP 200 (READY but a non-critical subsystem failed; carries `degradedReasons[]`)
- `ready` → HTTP 200

It must NEVER return 500 in transient states (the probe would consider the server dead).

**Why:** `scripts/cerbero-lib.sh` (`cerbero_health_backend`) greps the raw JSON
`"status":"<value>"` to decide alive (0) / initializing (2) / down (1). It treats
`ready|degraded|ok` as alive. A previous rename of `ok`→`ready` without updating the
grep made cerbero see a ready server as "initializing" forever.

**How to apply:** any change to the health `status` vocabulary must update
`scripts/cerbero-lib.sh` (the grep) and `scripts/__tests__/backend-startup-race.test.sh`
in the same change. The degraded flag is driven by `markDegraded()/clearDegraded()` in
`server/init-state.ts`; the deploy probe uses a separate port-8081 text/plain endpoint,
so /api/health 503 during booting does not affect deploy health.
