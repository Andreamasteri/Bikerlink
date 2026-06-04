---
name: Routing kill-switch (soft toggle + env override)
description: How the routing on/off state is resolved — env hard override vs DB soft toggle, and why the env semantics are inverted.
---

Routing enablement is resolved in `server/routing/routing-kill-switch.ts`:
precedence is (1) env `ROUTING_DISABLED="0"` → forced ON, (2) env set to any
other non-empty value → forced OFF, (3) env unset → soft DB toggle
`routing_kill_switch` (app_settings, "true"=enabled, default disabled).

**Why:** The admin hub needs to flip routing without editing Secrets, but the
historical env var must keep working as an emergency hard kill. In production
`ROUTING_DISABLED` is *unset*, so the soft DB toggle is what the admin UI
actually controls there. An earlier literal reading ("env !== '0' → always
disabled") was rejected because, with env unset in prod, it would have made the
admin toggle a no-op.

**How to apply:** Never reintroduce a module-level boolean `ROUTING_DISABLED`
const — all gating must call `isRoutingEnabled()` (async) or
`isRoutingEnabledSync()` (uses cache, assumes disabled if never read). When env
override is active, the admin PUT /kill-switch returns 409 because the soft
toggle has no effect until the env is removed.

**Current state (post-fix):** `ROUTING_DISABLED` env var was deleted from all
environments and the admin UI's "override env attivo" warning was removed from
`app/admin/routing-control.tsx`. The DB row `routing_kill_switch` was inserted
with `value='true'` so routing stays ON. The soft toggle is now the sole control
in every environment. The backend 409/hard-override code path is kept as dormant
safety — do not delete it, but the UI no longer surfaces it.
