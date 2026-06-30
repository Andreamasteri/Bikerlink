---
name: ThinkCentre Redis/DragonflyDB external network path
description: How to reach the ThinkCentre's Redis/DragonflyDB port from outside the LAN — DuckDNS deprecated, public HTTP hostname forbidden, the sanctioned path is a Cloudflare Access TCP bridge.
---

The ThinkCentre's `infra/self-host/expose/cloudflared-config.yml` states Postgres and Redis must NOT be exposed as public HTTP ingress hostnames. The sanctioned path is a **Cloudflare Access TCP bridge** (`cloudflared access tcp`) — this is a free-tier feature; the earlier "TCP unsupported on free tier" assumption was wrong.

**The path now exists in code (built, not yet activated in prod):**
- TC side: tunnel ingress rule `service: tcp://127.0.0.1:6379` on a dedicated hostname (`redis-tc.biker-link.net`), protected by a Cloudflare Access app with a `non_identity` policy that admits only the existing `bikerlink-tc-access` service token. Automated setup: `scripts/setup-cloudflared-redis-tunnel.sh` (idempotent CF API; discovers the service token by name; supports `DRY_RUN=1`).
- Replit side: `server/cache/redis-tunnel.ts` supervises `cloudflared access tcp --hostname <REDIS_TUNNEL_HOSTNAME> --url 127.0.0.1:16379`, authenticating to the edge with `CF_ACCESS_CLIENT_ID/SECRET` (mapped to cloudflared's native `TUNNEL_SERVICE_TOKEN_ID/SECRET` at spawn — same service token the rest of the app already uses via `server/lib/cf-access.ts`). Hooked into `server/boot-sequence.ts` (after `startMetroMonitor`, non-fatal) and stopped in `gracefulShutdown` (`server/index.ts`). The `cloudflared` binary is baked into `./bin/cloudflared` by `scripts/deploy-build.sh` (gitignored).
- With the bridge, the port is plaintext on localhost: `TC_REDIS_URL=redis://:<password>@127.0.0.1:16379` (NO `rediss://`/tls — `redis.ts` only adds tls for `rediss://`), `REDIS_PROBE_HOST=127.0.0.1`, `REDIS_PROBE_PORT=16379`.

**Why:** DuckDNS+nginx (`rediss://...@bikerlink.duckdns.org:6380`) worked end-to-end but DuckDNS is abandoned infra; a public HTTP tunnel hostname for Redis is explicitly forbidden. The Access-gated TCP bridge keeps the port private (only a valid service token can open it) while still working from autoscale Replit Cloud.

**How to apply:** do not point `TC_REDIS_URL` at `*.duckdns.org` or at any public HTTP hostname. Activation has two manual steps that the agent cannot perform from an isolated env: (1) run `setup-cloudflared-redis-tunnel.sh` against the live CF account (mutates tunnel/DNS/Access), (2) set the Replit secrets above and Publish — only then does the admin dashboard show live Redis ping/RAM via the private path.
