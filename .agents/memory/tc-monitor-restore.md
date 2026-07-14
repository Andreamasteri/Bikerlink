---
name: TC admin monitor restore after infra migration
description: Restoring the admin ThinkCentre/self-hosted health monitors after a TC network migration is usually a secrets-provisioning problem, not code; plus the false-green auth rule and GPU/VRAM source.
---

# Restoring the ThinkCentre admin monitors

## Rule 1 — "monitors broken after migration" is almost always missing secret VALUES, not code
After a TC network migration (Tailscale/DuckDNS+nginx → Cloudflare Tunnel), the probe
code (`server/routes/admin/thinkcentre-health-*.ts`) already reads the correct env
names (`GRAPHHOPPER_URL`, `VALHALLA_URL`, `NOMINATIM_URL`, `WHISPER_URL`,
`BOWIE_OLLAMA_URL`, `THINKCENTRE_METRICS_URL` + `THINKCENTRE_AGENT_TOKEN`) and already
sends `cfAccessHeaders()`. When a service shows grey "non configurato", check
`viewEnvVars({type:"secret"})` FIRST — the service-URL secret is just absent.
**Why:** wasted effort re-wiring code that was already migrated; the fix is
provisioning current Cloudflare endpoint values (`*.biker-link.net`), which only the
user has and which shift as tunnels are rebuilt.
**How to apply:** the agent cannot set secrets → use `requestSecrets` for the blocking
URLs/tokens; provisioned secrets take effect on a plain restart only if read
per-request (see Rule 3).

## Rule 2 — TC agent HTTP probes: 401/403 = auth-missing, only 2xx = up
The Dragonfly/Postgres infra HTTP probes go through the TC agent with header
`X-Agent-Token: THINKCENTRE_AGENT_TOKEN`. A predicate of `status < 500` counted a
401/403 (wrong/absent token) as **green** — a false-green. Healthy = 2xx only;
401/403 must be surfaced as "Token ThinkCentre mancante/errato".
**Why:** the task's core requirement is "no false green from token/URL errors";
`s < 500` silently hid auth failures.
**How to apply:** any new TC-agent-fronted probe uses `(s)=>s>=200&&s<300` + an
auth-error classifier for 401/403.

## Rule 3 — read TC secrets per-request, not at module-load
`thinkcentre-metrics.ts` originally captured `THINKCENTRE_METRICS_URL` /
`THINKCENTRE_AGENT_TOKEN` in module-level consts, so a newly provisioned secret
needed a code redeploy, not just a restart. Read them inside the handler.

## Rule 4 — GPU/VRAM source
The TC now has an NVIDIA GPU (Ollama). GPU util % + VRAM come from
`scripts/thinkcentre/stats-server.js` (port 9199) via `nvidia-smi
--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,name`, degrading
to null fields if nvidia-smi is absent. Backend `/api/admin/thinkcentre-metrics` is a
pass-through, so new fields flow through automatically; the frontend
(`ThinkCentreSystemMonitor.tsx`) renders the GPU chart + VRAM bar only when the fields
are present. **The stats-server.js change must be deployed to the TC** for the fields
to actually appear.
