---
name: Telemetry routing layer (curvy_score → osm_way_id)
description: How the optional per-segment telemetry boost is layered on the geometric routing base, and the retry-to-geometric safety net.
---

# Telemetry routing layer

Route weights for the planner are built in two strata (see `server/routing/route-weights.ts`):

1. **Geometric** — `road_class` priority rules keyed off the 5 styles. Stable base, always available, no telemetry needed. This is the universal fallback.
2. **Telemetry (optional)** — additive `custom_model.priority` rules of the form `osm_way_id == <id>` boosted by the segment's real `curvy_score`. Applied ONLY for profiles `real`/`my_style` when the **requested route** has valid telemetry coverage.

**Validity is route-specific, not global (critical).** Telemetry must be evaluated against the segments the route actually traverses, NOT the global top-N curvy segments in the DB — otherwise `real`/`my_style` produce a route identical to geometric with no warning. The `/calculate` handler therefore: (a) runs a **baseline geometric route first**, requesting `details: ["osm_way_id"]`; (b) extracts the route's `osm_way_id`s (`extractRouteWayIds`); (c) queries `segment_telemetry` filtered to those way IDs; (d) applies the boost only if coverage passes, else returns the baseline geometric path + `warning="insufficient_data"`. Geometric profile returns the baseline directly (1 route call); telemetry profiles cost up to 2 route calls.

**Coverage threshold:** qualifying segments on the route must be `>= max(TELEMETRY_ROUTING_MIN_ROUTE_SEGMENTS, ceil(routeWayIds * TELEMETRY_ROUTING_MIN_COVERAGE))` (defaults 2 and 0.05). Each qualifying segment needs `curvy_score >= TELEMETRY_ROUTING_MIN_SCORE` and `sample_count >= curvy-score job minSamples`. `my_style` additionally requires the user to have reached the `telemetry_target_km` app-setting and have a valid `avgLeanAngle`; otherwise → `insufficient_data` fallback. In dev there is usually zero telemetry data, so real/my_style correctly fall back to geometric.

**Why a retry-to-geometric safety net:** GraphHopper custom models reference the `osm_way_id` encoded value. If the active engine rejects those rules (engine swap, missing encoded value, older build), the boosted request throws — the handler keeps the already-computed baseline geometric path and sets `warning="insufficient_data"` (no extra call needed). This guarantees geometric stays the stable default regardless of engine support. `getActiveRouter` only sets headers (guarded by `!res.headersSent`) and throws on failure, so the retry is safe.

**How to apply:** Keep the geometric layer self-sufficient (never depend on telemetry). Any new optional encoded-value rule must be gated on route coverage (compute baseline first) and follow the same try-telemetry → catch → keep-baseline pattern. The server `warning` string (`"insufficient_data"`) must stay in lockstep with the check in `RouteResultCard.tsx`, or the badge silently never shows.
