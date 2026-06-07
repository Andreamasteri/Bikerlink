---
name: auto_curvy routing profile
description: Why the scenic CAR routing profile is Valhalla-only with no GraphHopper fallback.
---

# auto_curvy (Auto panoramica) routing profile

A fifth routing profile that routes a **car** (not moto) over scenic roads
(penalizing highways/tolls/ferries), served exclusively by the self-hosted
**Valhalla** engine.

**Rule:** auto_curvy has **NO GraphHopper fallback**. If Valhalla is down the
request must return an explicit **503**, never degrade to GH.

**Why:** GraphHopper cloud can only produce a *direct* car route, not a
panoramic one. Falling back to GH would silently hand the user a boring
highway route instead of the scenic experience they asked for — a wrong
result is worse than an explicit "unavailable". Valhalla also ignores
GraphHopper custom_model, so the moto avoid-toggles intentionally do not
apply to this profile.

**How to apply:** the client gates the "Auto panoramica" UI option on the
Valhalla health endpoint; never offer/honor auto_curvy when Valhalla is
unreachable.
