---
name: CF Access service-token 403 troubleshooting
description: How to diagnose a Cloudflare Access 403 on a self-hosted hostname when the service-token client_id is correct but requests still fail.
---

# Cloudflare Access service-token 403 — diagnosis playbook

When a backend uses a Cloudflare Access service token (CF-Access-Client-Id /
CF-Access-Client-Secret headers) and gets **403** on a protected hostname:

1. Confirm the app **policy** is `decision=non_identity` and its `include`
   has `{service_token:{token_id:...}}`, with no `require`/`exclude` that
   would add identity checks. (API: GET /accounts/{acct}/access/apps/{id}/policies)
2. Confirm `CF_ACCESS_CLIENT_ID` equals that token's `client_id`
   (GET /accounts/{acct}/access/service_tokens). Token also must not be expired.
3. If policy + client_id are correct, the only remaining variable is the
   **secret value**. A valid CF service-token Client Secret is **64 hex chars**
   (0-9a-f), with **no** `.access` suffix. Inspect the stored secret's *format*
   (length, hex-only, whitespace) WITHOUT printing it.

**Common paste mistakes seen:** pasting the Client ID (39 chars, ends `.access`)
into the secret field; manual text-selection capturing extra characters
(e.g. 71 chars with non-hex letters). Fix: use the **Copy button** next to
"Client Secret" in the dashboard, not manual selection.

**Why it matters here:** the BikerLink backend reaches every self-hosted TC
service (gh/valhalla/nominatim/whisper/ollama) via the public *.biker-link.net
hostnames, so a wrong CF_ACCESS_CLIENT_SECRET 403s **all of them at once**
(silent — masked by cloud fallback / errors), not just one.

**Constraint:** the agent CANNOT store a secret programmatically (setEnvVars is
env-only; secret values are never readable). The user must paste the value via
the secure `requestEnvVar` prompt; rotating via API only yields a value the
agent can't store. So: user rotates in dashboard → pastes via prompt → agent
verifies by re-probing an existing protected app (expect origin/2xx/5xx, not the
Access 403 HTML page).

**Ollama Access apps (created):** ollama-tc.biker-link.net and
ollama.biker-link.net are self_hosted apps, session 24h, app_launcher_visible
false, single non_identity policy → service token bikerlink-tc-access
(d976f94d-...). PC hostname enforcement propagated slower than TC (~tens of sec).
