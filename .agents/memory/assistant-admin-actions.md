---
name: AI Assistant admin actions
description: How the admin chat proposes/executes confirmable admin actions, separate from user actions.
---
# AI Assistant — admin actions

The admin chat (platform "admin") and the user chat share ONE proposal channel:
`extractActions(text)` parses `ACTION: {...}` lines regardless of mode. The mode
split happens at FILTER time in the assistant message route:
- admin mode → filter against the admin whitelist, emit SSE "action" with a
  `confirmLabel` + `scope:"admin"`; execute server-side via a dedicated
  admin-action endpoint (role==="admin" gate + audit).
- user mode → filter against the user whitelist + per-platform allowedActions,
  execute via the user action endpoint.

**Why two whitelists:** admin actions are always server-side and reuse the admin
business endpoints' storage methods; user actions are mostly client-side and
gated by per-platform config. Keeping them separate prevents leaking admin ops
to users (and vice-versa).

**How to apply:** to add an admin op, add a whitelist entry (zod param schema +
Italian confirmLabel) and an executor branch reusing existing endpoint logic;
the system prompt auto-lists it. The assistant only knows real business IDs
because the admin snapshot injects up to 10 actionable businesses (pending or
hidden) into context.

**UI gotcha:** after a successful admin action the chat widget must invalidate
the admin business query keys (`/api/admin/business`, `.../report`, `.../config`)
or the marketing page stays stale until manual refresh.

Audit: telemetry events action_proposed / action_executed / action_rejected,
platform "admin".
