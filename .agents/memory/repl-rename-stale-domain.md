---
name: Repl rename → stale EXPO_PUBLIC_DOMAIN breaks the app
description: "Server non disponibile. Riprova tra un momento." across all app screens traced to a dead .replit.app domain after a repl rename.
---

# Repl rename leaves the app pointing at a dead domain

**Symptom:** Many/all app screens (routing toggle, OTA sync, Hub AI test, etc.) fail with the same modal "Server non disponibile. Riprova tra un momento." The message looks like the server is down, but it isn't.

**What that string actually means:** `lib/query-client.ts` throws it ONLY when an API response is HTML instead of JSON (content-type `text/html`, or body starting with `<!DOCTYPE`/`<html`). It is a client-side fallback, never sent by the server. So the real cause is that API calls are hitting a host that returns an HTML error page — i.e. the WRONG host — not a broken backend.

**Root cause (July 2026):** the repl was renamed, so the Replit autoscale URL changed from `biker-link.replit.app` (now → 404 HTML) to `bikerlink.replit.app` (200 JSON). The app still targeted the old host.

**Why:** the API base host comes from `EXPO_PUBLIC_DOMAIN`, which is an `EXPO_PUBLIC_*` var → **inlined into the JS bundle by Metro at export time**. The env var VALUE overrides the code fallback. So a stale value silently ships in every OTA/native build.

**How to apply — when the repl is renamed or the deployment URL changes, update ALL of these (only `.replit.app`, NEVER touch `biker-link.net` = ThinkCentre CF tunnel):**
1. `EXPO_PUBLIC_DOMAIN` shared env var (persisted in `.replit [userenv.shared]`) — this is the one that wins.
2. `eas.json` — `EXPO_PUBLIC_DOMAIN` per build profile (native builds read this).
3. Hardcoded fallbacks `process.env.EXPO_PUBLIC_DOMAIN || "..."` in: `lib/query-client.ts`, `components/layout/AppStateHandler.tsx`, `lib/foreground-location-service.ts`, `lib/background-location-task.ts`, and the nested app `bowie-terminal/`.
4. **Native code is NOT env-var driven** — `android/app/src/main/java/com/bikerlink/app/MainApplication.kt` hardcodes the startup-beacon URL as a literal; grep for it in `.kt`/`.java`/`.swift` explicitly.
5. Server/scripts self-references (`server/site/render.ts`, `scripts/error-monitor.sh`) and user-facing PDF footers (`scripts/generate-*-pdf.mjs`, were `www.` prefixed → drop the non-resolving `www.`) — lower priority but still point users at a dead host.

**Grep caveat:** a repo-wide `grep -rn <domain> .` TIMES OUT on `android/*/build` + `node_modules`. Search targeted dirs only: `app components lib server scripts android/app/src ios eas.json app.json` and exclude `/build/` + `server_dist` (compiled output, regenerates).

**Verification that actually confirms the fix:** `curl -s -o /dev/null -w "%{http_code} %{content_type}" https://<host>/api/health` — the correct host returns `200 application/json`, the dead one `404 text/html`. After changing the env var, a FRESH shell/process must echo the new value before an OTA export will bake it in.

**Delivery:** existing installed APKs are fixed by publishing a new OTA (re-bakes the domain into the bundle) — no new native build needed.
