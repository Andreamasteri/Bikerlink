---
name: routing_area_mode must be "enabled" — legacy single-instance GraphHopper no longer exists
description: Root GraphHopper /info and /route now 404 on the ThinkCentre; the multi-area migration removed the old global instance entirely, but the routing_area_mode app_setting was never flipped, so both dev and prod silently fall back to the dead legacy path.
---

## What happened

`server/routing/routing-area-mode.ts` gates whether routing requests resolve a
per-area GraphHopper instance (`shared/routing-areas.ts`, e.g. `/areas/arco-alpino/route`)
or fall back to a single "global" instance at the root `GRAPHHOPPER_URL` (legacy
pre-multi-area behavior, `routing_area_mode` absent/"disabled" = default).

The ThinkCentre's GraphHopper deployment has since fully migrated to multi-area
only: root `/info` and root `/route` both return a plain nginx 404 — there is no
global instance left to fall back to. But the `routing_area_mode` app_setting
row was never created in **either dev or prod** `app_settings`, so
`isAreaRoutingActive()` kept returning `false` and every route request (and the
watchdog's own correctness probe) hit the now-dead root path, always failing.

This masqueraded as "GraphHopper is down" (watchdog reason: `HTTP 404: GraphHopper
/route`) even while the ThinkCentre was fully online and multi-area GraphHopper
was serving correctly on `/areas/<codice>/*`.

## Why

Infra (the GraphHopper multi-area rollout) moved ahead of the application
config toggle meant to track it — the toggle defaults conservatively to
"disabled" ("impatto zero" per its own doc comment) to avoid regressing routing
during a *gradual* rollout, but nobody flipped it to "enabled" once the legacy
instance was actually decommissioned. So the "safe default" became the broken
path once the fallback target stopped existing.

## How to apply

- If GraphHopper correctness probes/routing show 404 on `/route` or `/info`
  with a plain nginx 404 body (not a custom GH error), check root vs.
  per-area endpoints separately before assuming the ThinkCentre engine itself
  is down — `curl $GRAPHHOPPER_URL/info` vs `curl $GRAPHHOPPER_URL/areas/<codice>/info`
  (both need `X-GH-Token` + CF Access headers).
- Confirm `SELECT value FROM app_settings WHERE key='routing_area_mode'` in both
  dev and prod — if absent, area routing is effectively OFF and gets the dead
  legacy path if the TC has migrated to multi-area only.
- Fixing dev is a normal admin DB write (`UPSERT app_settings routing_area_mode
  = 'enabled'`) + restart the backend workflow to drop the stale in-memory
  cache (`modeCache`, lazy-read-once, no auto-refresh on external writes).
- Prod needs the same UPSERT but the agent cannot write prod DB directly —
  surface it as a required admin action alongside any other pending prod
  routing fix (e.g. kill-switch), since enabling the kill-switch alone will
  NOT fix routing if `routing_area_mode` is still unset — it just moves the
  failure from "kill-switch disabled" to "GraphHopper /route 404".
