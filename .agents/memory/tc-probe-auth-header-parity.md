---
name: TC health-probe auth must mirror the real client
description: Why ThinkCentre service probes 401 falsely — probe auth header/CF-Access must match the production client, not a guessed scheme
---

# ThinkCentre probe auth parity

A health probe for a TC self-hosted service must authenticate with the **exact
same header** the production client uses, or it returns a false-negative 401
even though the service is healthy.

**Concrete case:** the Whisper health probe historically sent
`Authorization: Bearer <token>`, but the real STT client authenticates with
`X-Whisper-Token` (that is what the nginx in front of Whisper on the TC checks).
Result: probe got 401 → panel showed Whisper red while STT worked fine. Fix =
make the probe send the same custom token header as the client.

**Why:** each TC service sits behind an nginx that validates a *custom* token
header (`X-GH-Token` / `X-Valhalla-Key` / `X-Photon-Token` / `X-Whisper-Token` /
`X-Ollama-Token`), not a generic Bearer. Guessing the scheme silently breaks the
probe only.

**How to apply:** when adding/reviewing a TC probe, grep the real client path
for the service and copy its auth header verbatim; don't invent `Authorization:
Bearer`.

## CF Access on tc.biker-link.net agent endpoints
The ThinkCentre **agent** (`THINKCENTRE_METRICS_URL` → tc.biker-link.net) is
behind Cloudflare Access *in addition to* its own `X-Agent-Token`. Any fetch to
the agent (sys-metrics, repo-drift, repo-drift-fix, whisper-health) must include
`cfAccessHeaders()` or CF Access blocks it at the edge (401/403) and the TC shows
falsely offline. CF headers are harmless if the Access policy isn't active (the
origin ignores them).

**Distinguishing the two 401s in a probe:** a CF-Access block carries a
`cf-access-error` response header or an "Access denied"/"Cloudflare Access" body;
an application 401 does not. Flag the former as `cfAccessBlocked` so the panel can
tell a CF-Access misconfig from a wrong service token.

All TC service secrets already point at `*.biker-link.net` (CF tunnel), not the
old DuckDNS hosts — verify hostnames via the boot log `[TC probes] endpoints:`
before suspecting a stale URL.
