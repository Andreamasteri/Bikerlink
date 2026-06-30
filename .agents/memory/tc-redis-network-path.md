---
name: ThinkCentre Redis/DragonflyDB external network path
description: How (and how not) to reach the ThinkCentre's Redis/DragonflyDB port from outside the LAN — DuckDNS path is deprecated, Cloudflare tunnel intentionally excludes it.
---

The ThinkCentre's `infra/self-host/expose/generated/cloudflared-config.yml` explicitly states Postgres and Redis must NOT be put in the Cloudflare tunnel as public HTTP ingress hostnames — the documented sanctioned approach is `cloudflared access` (TCP) or a VPN, but as of 2026-06-30 neither has actually been set up; only GraphHopper/Valhalla HTTP hostnames exist in the tunnel ingress.

There is also a legacy `nginx` TLS stream proxy (`/etc/nginx/stream.conf.d/redis.conf`, port 6380 → 127.0.0.1:6379) using a Let's Encrypt cert for `bikerlink.duckdns.org`, which still functioned as of this writing — but the project has migrated off DuckDNS to Cloudflare, so this path must be treated as deprecated/about-to-disappear, not a basis for any new `TC_REDIS_URL` wiring.

**Why:** during DragonflyDB verification, `TC_REDIS_URL=rediss://...@bikerlink.duckdns.org:6380` was confirmed to work end-to-end (ioredis `rediss://`, valid CA cert, PING + INFO memory all succeeded from Replit Cloud) — but the user flagged DuckDNS as already-abandoned infrastructure before this could be wired into any real config.

**How to apply:** do not point `TC_REDIS_URL` (or any other TC service URL) at `*.duckdns.org`. Before wiring production Redis access, a Cloudflare TCP path (e.g. `cloudflared access tcp` sidecar, or Cloudflare's Private Network/WARP routing) must be built first — this is a real infra prerequisite, not just a config tweak.
