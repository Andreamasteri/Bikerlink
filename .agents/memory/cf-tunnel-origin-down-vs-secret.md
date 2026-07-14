---
name: Distinguish CF tunnel/origin down from a bad secret
description: How to tell "ThinkCentre/cloudflared is offline" apart from "CF Access secret is wrong" when every self-hosted probe fails at once.
---

# 502 everywhere + SSH timeout = origin/tunnel down, not a secret problem

When checking TC reachability before relying on it (e.g. before wiring a new
self-hosted service like Photon), probe multiple independent paths and read
the pattern:

- **403** on a CF Access-protected hostname (with a proper HTML Access page)
  → `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` are wrong. See
  `cf-access-secret-troubleshooting.md`.
- **502** from Cloudflare (plain "error code: 502" text, not the Access HTML
  page) on *every* self-hosted hostname at once (GraphHopper, Valhalla,
  THINKCENTRE_METRICS_URL, etc.) **combined with** the `tc.py` SSH helper
  timing out (`TimeoutError timed out`) → the ThinkCentre box itself or its
  `cloudflared` tunnel is down/unreachable. Cloudflare's edge answered (that's
  why it's a fast 502, not a DNS failure or `000`), but there's no live
  connector behind it. This is an infrastructure/power state issue on the
  user's side, not something fixable by rotating secrets.
- **000** / DNS failure on a URL from a *secret* usually just means the secret
  itself is empty in the current shell (see the cold-boot note below), not
  that the service is down — verify the secret's length/presence before
  concluding anything about reachability.

**Why it matters:** don't burn time re-checking `CF_ACCESS_CLIENT_ID/SECRET`
formatting when the failure signature is uniform 502 + SSH timeout across
every unrelated service — that pattern points at the origin, not the
credentials.

**Newly-added secrets need a workflow restart to appear in ShellExec/CodeExecution env**, even though they are supposedly available immediately once configured — `env | grep NAME` returns empty right after the "Configured secrets changed" notice until a workflow (e.g. `Start Backend`) is restarted.
