---
name: Routing kill-switch (soft toggle + env override)
description: How the routing on/off state is resolved — env hard override vs DB soft toggle, and why the env semantics are inverted.
---

Routing enablement is resolved in `server/routing/routing-kill-switch.ts`:
precedence is (1) env `ROUTING_DISABLED="0"` → forced ON (HARD_ON), (2) env set to any
other non-empty value → forced OFF (HARD_OFF), (3) env unset → soft DB toggle
`routing_kill_switch` (app_settings, "true"=enabled, default disabled).

**Why:** The admin hub needs to flip routing without editing Secrets, but the
historical env var must keep working as an emergency hard kill. In production
`ROUTING_DISABLED` must be **unset**, so the soft DB toggle is what the admin UI
actually controls there.

**Toggle blocking rules (updated):**
- `HARD_OFF` → PUT /kill-switch returns 409 (env forces routing OFF, toggle is useless)
- `HARD_ON` → PUT /kill-switch is **allowed** (user can pre-set DB value; takes effect
  when env is removed). Only shows informational banner in UI, toggle NOT disabled.
- Both HARD_OFF and HARD_ON → `HAS_HARD_ENV_OVERRIDE` is true (for informational use)

**How to apply:** Never reintroduce a module-level boolean `ROUTING_DISABLED`
const — all gating must call `isRoutingEnabled()` (async) or
`isRoutingEnabledSync()` (uses cache, assumes disabled if never read). Use
`HARD_OFF` (exported from routing-kill-switch.ts) to block the toggle, not
`HAS_HARD_ENV_OVERRIDE` — blocking on HARD_ON prevents setting the DB value
for future use.

**Current state:** `ROUTING_DISABLED` secret has been deleted from all Replit
environments. The soft DB toggle `routing_kill_switch` controls routing fully.
If ever needed, restore the emergency kill by setting the secret to `"1"` (not `"0"`).
The `"0"` value (HARD_ON) allows the toggle to still be used; remove the secret to
restore full soft control.
