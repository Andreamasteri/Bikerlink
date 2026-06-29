---
name: CF Access — every hostname request path needs cfAccessHeaders
description: When Cloudflare Access is enforced on a self-hosted hostname, ALL request paths to it (incl. secondary health probes) must send the service-token headers, not just the main client.
---

# CF Access service token must be on every request path

When a self-hosted service (Ollama/GraphHopper/Valhalla/Nominatim/Whisper on
biker-link.net) is put behind Cloudflare Access, the edge validates the
`CF-Access-Client-Id` / `CF-Access-Client-Secret` service-token headers on
**every** request — including lightweight health probes, not just the primary
client. Any path that omits `cfAccessHeaders()` (from `server/lib/cf-access.ts`)
gets a 403 from the edge once the Access policy is turned on.

**Why:** Ollama's main paths (`server/lib/ollama-client.ts`, `scripts/ollama-diagnose.ts`)
already sent the headers, but three *secondary* Ollama probe sites did not, so
once Access is enforced they would 403 and falsely report Ollama as DOWN —
triggering needless cloud fallback, watchdog "high" alerts, and admin dashboard
red. The probes used only `X-Ollama-Token` while their Whisper/Valhalla/GraphHopper
siblings in the same files already spread `cfAccessHeaders()`.

**How to apply:** When adding/auditing any probe or fetch to a self-hosted
hostname, spread `...cfAccessHeaders()` into the headers, exactly like the
sibling services in the same file. It is a no-op (returns `{}`) until the
`CF_ACCESS_CLIENT_ID`/`SECRET` secrets are set, so it is always safe to include.
Note the dev script `scripts/validate-credentials.ts` intentionally omits it for
ALL self-hosted checks (GH included) — keep it consistent there, don't add it to
just one service.

Operational gotcha: enforcing the Access policy in the Cloudflare dashboard
requires the service token to be added to BOTH Ollama Access applications
(`ollama-tc.biker-link.net` and `ollama.biker-link.net`) AND the
`CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` secrets set in prod — otherwise
even the correctly-wired paths 403.
