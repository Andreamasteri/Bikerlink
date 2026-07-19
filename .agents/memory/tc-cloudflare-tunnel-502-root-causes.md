---
name: TC monitors "permanent 502" — three independent root causes found
description: gh/valhalla/tc-probe-redis all 502'd for unrelated reasons; how each was diagnosed and fixed (14-15 lug 2026).
---

# ThinkCentre monitors stuck 502 — three unrelated root causes

When gh.biker-link.net / valhalla.biker-link.net / tc.biker-link.net/probe/redis all
return Cloudflare-level 502/refused, do NOT assume one shared cause. Diagnose each
hostname independently by SSHing to the TC and checking what's *actually* listening
(`ss -tlnp`, `docker ps --format`) vs. what the tunnel ingress points at
(`GET /accounts/{acct}/cfd_tunnel/{id}/configurations` via CF API — `CF_API_TOKEN`
already has this scope even though it can't list accounts).

## 1. Valhalla — stale ingress port
Ingress pointed at `127.0.0.1:8003`; the container only ever listened on `8002`.
Known/logged before — just needed the ingress PUT corrected via CF API (no
`warp-routing` key omission, must round-trip the existing config object).

## 2. GraphHopper — multi-area migration never got a reverse proxy
The app now runs 8 area-scoped GH containers, each on its own **host** port
(8990-8997, mapped from each container's internal 8989). But the tunnel ingress
and the nginx vhost still pointed at `127.0.0.1:8989` — a port nothing publishes
anymore. `gh.biker-link.net/areas/<code>/health` (the contract in
`shared/routing-areas.ts`) has no server-side implementation at all pre-fix.
**Fix:** ingress → `http://127.0.0.1:80`; nginx vhost gets an `map $area $gh_port {...}`
+ `location ~ ^/areas/(?<area>[a-z-]+)/(?<rest>.*)$` that strips the `/areas/<code>`
prefix and proxies to the matching per-area host port (containers serve `/health`,
`/info`, `/route` at their own root, not under `/areas/...`).
**Gotcha — config drift (FIXED Jul 2026):** `/etc/nginx/sites-enabled/graphhopper`
was a real standalone file, NOT a symlink. It is now a symlink to
`sites-available/graphhopper` (matching bikerlink/bikerlink-searxng). However,
`sites-enabled/openwebui` is still a real file — same trap (task #137). ALWAYS
check `ls -la /etc/nginx/sites-enabled/` before editing; `nginx -t` passing
proves syntax only, not that you edited the loaded file.
**Side-fix:** the `bikerlink` nginx file had `listen 192.168.1.35:443 ssl` (stale
IP, real IP is 192.168.0.100) in all 5 server blocks — fixed via sed at the same
time. The old graphhopper DuckDNS `listen 443` block was masking this bind failure.
**Gotcha — token drift:** the `X-GH-Token` hardcoded in that nginx file did NOT
match the current `GRAPHHOPPER_TOKEN` Replit secret (different length, clearly
rotated at some point without updating nginx). Verify with a SHA-256 prefix
comparison (never print either raw value) before assuming "403 = my rule is wrong."
**Now auto-detected:** the health-panel GH probe (`thinkcentre-health-gh-probes.ts`)
no longer treats a 401/403 on `/health` as green ("reachable"); it surfaces an
explicit "token non combaciante / token drift" message distinct from unreachable.
One-off/cron check: `npx tsx scripts/check-graphhopper-token.ts` classifies each
area as ok / token-mismatch / unreachable (exit 2 = drift, 3 = all unreachable).

## 3. tc.biker-link.net/probe/redis — the TC agent process wasn't running at all
`tc.biker-link.net` ingress → `127.0.0.1:9199` (nginx `tc_agent_backend` upstream)
was correct, but nothing was listening on 9199. There are TWO different scripts
that both claim port 9199:
- `scripts/thinkcentre/stats-server.js` (old, `/sys-metrics` only, meant to run
  under `screen`, not currently used)
- `thinkcentre-agent/server.js` (current, adds `/probe/nginx|redis|postgres|pgadmin|uptime-kuma`
  + `/self-update`) — this is the one nginx's `tc_agent_backend` actually expects.
Neither was running (`pm2 list` only had `ai-hub`+`horus-analysis`). Fix: start it
as `pm2 start thinkcentre-agent/server.js --name bikerlink-agent` with
`AGENT_TOKEN=$THINKCENTRE_AGENT_TOKEN`, then `pm2 save` (pm2-andrea systemd unit
is already `enabled`, so saved processes resurrect on reboot automatically).

## 4. cloudflared exits code=1 on startup — DNS resolver misbehaving (CONFIRMED Jul 2026)

**Sentry #126649029 / restart flood #157** — cloudflared exiting code=1 at restart was NOT:
- OOM kill (no kernel OOM events in dmesg/syslog on either date)
- CF Access token expiry (`bikerlink-tc-access` expires 2036-06-26, `bikerlink-backend` 2036-06-26, `Ares` 2031-06-29 — all years away)
- Tunnel credential failure (auth happens AFTER edge discovery)

**Confirmed root cause: TC's `systemd-resolved` (stub `127.0.0.53`) returning "server misbehaving" or "i/o timeout" for `argotunnel.com` SRV record lookups.**

Cloudflared sequence: startup → edge IP discovery via DNS SRV → if lookup fails → retry → exit(1). The code=1 flood recurred on two separate dates:
- **Jul 7 22:45 UTC**: `server misbehaving` on `_v2-origintunneld._tcp.argotunnel.com` and `cfd-features.argotunnel.com`; also `Unable to lookup protocol percentage`. Flood of code=1 exits at restart #157.
- **Jul 13 12:16-12:21 UTC**: `i/o timeout` on same SRV records; same pattern, resolved ~1h later.

After DNS recovered, cloudflared resumed normally without any config change. Current run stable since Jul 17 16:36 UTC (PID 1729). Current upstream DNS: 8.8.8.8/8.8.4.4 (Google) via systemd-resolved stub.

**Diagnosis pattern**: `journalctl -u cloudflared | grep 'server misbehaving\|i/o timeout\|edge discovery'` immediately shows DNS as cause. If this line appears on code=1, it's DNS — NOT auth.

**Mitigation to apply at next TC maintenance**: Add `Environment=TUNNEL_DNS_UPSTREAM=https://1.1.1.1/dns-query` to the cloudflared systemd unit so it bypasses the `127.0.0.53` stub and hits 1.1.1.1 DoH directly. See: https://developers.cloudflare.com/1.1.1.1/setup/

## Verification pattern
Test with the exact same headers the app probe code sends (`cfAccessHeaders()` +
the service-specific token header), against the public hostname, not just
localhost on the TC — a local 200 does NOT guarantee the CF Access layer or tunnel
ingress is also correct.
