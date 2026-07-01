---
name: Env vs Secret classification (service URLs)
description: Which shared config is an env var vs a Replit secret, and why — plus a viewEnvVars tooling gotcha.
---

# Env vs Secret classification

Full audit lives in `docs/env-secrets-audit.md`. Durable rules:

- **`EXPO_PUBLIC_*` MUST stay env vars, never secrets.** They are inlined into the
  Expo client bundle at build-time; a secret can't be read by client code.
  `EXPO_PUBLIC_DOMAIN` is the one shared env var kept for this reason.
- **Server-only service URLs are SECRETS, not env vars.** `GRAPHHOPPER_URL`,
  `VALHALLA_URL`, `NOMINATIM_URL`, `WHISPER_URL`, `TILES_URL`, `REDIS_PROBE_URL`,
  `TC_SSH_PORT`, `DIAG_OLLAMA_URL`, `DIAG_OLLAMA_MODEL` were migrated env→secret
  (same names). They're read only server-side (or via a lib imported only by the
  server, e.g. `lib/map-tiles.ts`), so nothing needs them inlined in the client.
  **Why:** keeps infra endpoints out of the client bundle and out of `shared` env.
  **How to apply:** when adding a self-hosted service URL, make it a secret unless
  a client screen genuinely reads it (then it must be `EXPO_PUBLIC_` env).

## Redis is DragonflyDB now (naming trap in docs)

The app's Redis-compatible store is **DragonflyDB self-hosted on the ThinkCentre**,
reached via secret **`TC_REDIS_URL`** over Cloudflare Tunnel. It is **NOT** Upstash
and **NOT** `REDIS_URL`. Old docs (`replit.md`, `docs/thinkcentre-server-setup.md`)
still claimed "Upstash / REDIS_URL / bikerlink.duckdns.org:6380" — all three stale;
corrected. `REDIS_PROBE_URL` path stays `/probe/redis` only for compatibility.

## viewEnvVars tooling gotcha

`viewEnvVars({type:"secret"})` **unfiltered** `.secrets` map can be STALE and omit
just-created secrets. The **keys-filtered** call
`viewEnvVars({type:"secret", keys:[...]})` is authoritative. Always verify secret
existence with the keys-filtered form before deleting an env twin.
