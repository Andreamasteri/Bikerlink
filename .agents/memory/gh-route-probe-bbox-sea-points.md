---
name: GraphHopper route-probe bbox points land in the sea
description: Why a /route probe over areaProbePoints must treat PointNotFoundException as engine-alive, not broken
---

# GraphHopper route-probe: bbox-center points fall off the road network

`areaProbePoints(area)` derives its two probe points from the **center of the
area bbox ±10%**. Several routing areas have bboxes that are mostly water or
islands (Grecia, Balcani, Est, Arco-Alpino, Ecuador), so the computed point
lands in the sea / off the road network. A real `/route` POST there returns
`HTTP 400` with `PointNotFoundException` ("Cannot find point ...").

**Key insight:** a `PointNotFoundException` is NOT a broken engine. It proves the
graph is loaded and the nearest-edge snapping actually ran — i.e. the engine
routes for real, far more than an nginx heartbeat. So a health-2xx + `/route`
PointNotFound must be classified as **OK (engine alive)**, not route-broken.

**How to tell a genuinely broken route apart** (verified live against
gh.biker-link.net):
- Wrong/absent profile → `400 "The requested profile 'X' does not exist. Available profiles: [motorcycle, motorcycle_fast, car]"` (no PointNotFoundException) → route-broken.
- Engine KO / missing graph → 5xx or connection error → route-broken (also: a
  missing graph usually stops GH from starting, so /health won't be 2xx).
- Off-network probe point → `PointNotFoundException` / "Cannot find point" → engine alive, OK.

Available profiles are `motorcycle`, `motorcycle_fast`, `car` — NOT `bike`/`curvy`.
Self-hosted `ACTIVE_PROFILE` is `motorcycle`.

**Why this was masked before:** the admin panel probe
(`thinkcentre-health-gh-probes.ts`) only calls the `/route` probe as a *fallback
when /health fails*; when health is green it never route-probes, so the sea-point
PointNotFound never surfaced there. The standalone scheduled guard
(`scripts/check-graphhopper-token.ts`) route-probes *every* health-2xx area, so
it must handle the off-network case explicitly or every sea-bbox area falsely
reports as broken.
