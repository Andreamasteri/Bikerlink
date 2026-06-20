---
name: tracking-fusion-gate
description: Invariants for live-tracking km distance gating/fusion; the three decoupled GPS timestamps and why reject must not mutate the anchor.
---

# Tracking distance fusion gate

`shared/tracking-fusion.ts` (`evaluateSegment`) is the single source of truth for
the km quality gate, shared by the client live accumulation and the server
fallback recompute.

**Why one module:** km used to underestimate in curves and gain phantom km from
bad fixes, and the client total diverged from the server recompute. Two
implementations of the same gate inevitably drift.

**How to apply:** never inline a haversine-sum loop; change thresholds only in
`TRACKING_FUSION` constants. Both paths advance the "last accepted" reference
ONLY on an accepted segment (curves lose sub-floor moves otherwise). Server route
points don't persist accuracy → pass `accuracyM: null` (floor-only gate), and the
server must iterate a mutable last-accepted reference, not adjacent array indices.

## The three decoupled GPS timestamps (critical invariant)

A live tracking callback exposes three distinct "when did GPS last…" concepts.
Collapsing any two into one ref causes a self-locking distance bug:

1. **Raw-event time** — updated on EVERY callback, any quality. Drives only the
   blackout heartbeat ("are callbacks still arriving?").
2. **Usable-fix time** — updated only when a fix passes the accuracy gate. Drives
   fusion freshness (`gpsFresh`). If a stream of low-accuracy fixes refreshed
   freshness, `sensors_only` fallback would never engage.
3. **Last-accepted anchor** (`lastPosRef`: pos + time) — advanced only on an
   accepted segment. This is the origin `evaluateSegment` measures from.

**A rejected fix must NOT mutate the anchor (neither position nor time).** Earlier
it refreshed the anchor's timestamp "to keep the heartbeat alive" — that was
wrong twice over: (a) it caused a speed-jump self-lock (tiny dt vs the rejected
point made every subsequent fix implausible → permanent reject loop); (b) the
heartbeat now reads the raw-event time instead. Keeping the anchor frozen on
reject lets dt grow so the next good fix is plausible.

**First-fix gating:** only flip `gpsFixAcquired` / seed the anchor once a fix
passes the accuracy gate (null accuracy = unknown = accept). A noisy first fix
that seeds the anchor lets the next good fix produce a large plausible-speed
segment = phantom km, and prematurely drops the acquiring state.

**Telemetry mode:** GPS-tick telemetry must tag the LIVE fusion mode, never a
hardcoded value, or gps_only (sensor-divergence) rides get mislabeled.

**Telemetry sample classification also lives here.** `shared/tracking-fusion.ts`
owns the canonical `TelemetrySample` type plus the pure helpers
`classifyTelemetrySample({ts,lat,lon})` (→ drop|gps_valid|sensor_only),
`coerceFiniteNumber`, and `shouldRecordSensorSample(lastGpsTsMs, nowMs)` gated by
`TRACKING_FUSION.GPS_SILENCE_MS`. Server `/batch` ingestion and the client hooks
(`useTelemetry`, `lib/background-telemetry-task`) all consume these — never
re-implement sample classification or finite-number coercion in a route or hook.
sensor-only samples carry `lat/lon = null` (hence the shared type allows null).
Property-based invariants are pinned in
`server/__tests__/tracking-fusion-properties.test.ts` (fast-check).

## Fast start + fusion timer

- Fast start: last-known-position seeds the DISPLAY only (never the anchor — stale
  location → phantom km); the first real `getCurrentPositionAsync` fix seeds the
  anchor. **Why:** BestForNavigation's first fix can take minutes → km stuck at 0.
- A 1Hz fusion timer (independent of GPS fix rate) maintains the dead-reckoning
  speed + divergence count, publishes the observable `FusionMode`, and integrates
  DR distance into totalKm + a DR-gap accumulator ONLY while `sensors_only`.
- DR-gap recovery: onNativeLocation clears the gap + reseeds the anchor only on a
  USABLE fix (a poor recovery fix stays in DR), so the blackout span isn't
  double-counted and isn't reconciled from an untrustworthy point.
