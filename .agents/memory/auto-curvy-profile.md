---
name: auto_curvy routing profile
description: Why the scenic CAR routing profile is Valhalla-only with no GraphHopper fallback, and how it is wired through the stack.
---

# auto_curvy (Auto panoramica) routing profile

A fifth routing profile that routes a **car** (not moto) over scenic roads,
penalizing highways/tolls/ferries/living-streets, served exclusively by the
self-hosted **Valhalla** engine (costing `auto` + panoramic costing options).

**Rule:** auto_curvy has **NO GraphHopper fallback**. In `router-selector.ts`
it hard-routes to `valhallaCalculateRoute` right after the kill-switch check,
bypassing rollout/AI engine selection. If Valhalla is down the request returns
a dedicated **503** ("Server panoramico non disponibile"), it must NOT degrade.

**Why:** GraphHopper cloud can only produce a *direct* car route, not a
panoramic one. Falling back to GH would silently give the user a boring
highway car route instead of the scenic experience they asked for — a wrong
result is worse than an explicit "unavailable".

**How to apply:**
- Costing options live in `valhalla/request-builder.ts`
  (`AUTO_CURVY_COSTING_OPTIONS`, applied only for auto_curvy via
  `resolveCostingOptions`; every other profile keeps the motorcycle options).
- The client gates the "Auto panoramica" UI option on
  `GET /api/settings/valhalla-available` (30s cached health). When auto_curvy
  is selected the moto `DrivingProfileSection` is hidden.
- Valhalla ignores GraphHopper custom_model, so the moto avoid-toggles do not
  apply to this profile by design (acceptable).
- The task spec's "Moto/Moto Fast/Auto/Auto Fast" UI was fictional; shipped as
  a Veicolo selector (Moto / Auto panoramica).
