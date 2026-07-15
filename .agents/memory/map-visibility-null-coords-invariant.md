---
name: map-visibility null-coords invariant
description: A profile must never be hide_from_map=false with NULL coords (silent "visible but never appears" trust gap); how it's enforced.
---

# Map-visibility invariant: never `hide_from_map=false` with NULL coordinates

**Rule:** a `user_profiles` row must never be advertised as visible on the map
(`hide_from_map=false`) while `latitude`/`longitude` are both NULL. The map and
discovery queries filter `latitude IS NOT NULL AND longitude IS NOT NULL`, so
such a rider believes they're visible but never renders — a silent trust gap
(not a crash), found in prod (docs/bikerlink-db-check-report.md §7.2.d).

**Why:** signup historically created the profile with the schema default
`hideFromMap=false` and no coords. If a coordinate never arrived (GPS denied, no
coordinate_history, no first_login_lat/lng, region not in
`ITALIAN_REGION_CENTROIDS` — e.g. foreign riders), the row stayed stuck forever.

**How it's enforced (Task #66):**
- New profiles are created **hidden** (`register.ts` passes `hideFromMap: true`).
- `revealOnFirstCoordinate()` (in `server/lib/map-visibility.ts`) flips it back to
  `false` the first time a real coordinate is stored — and **only** when the
  profile was never positioned (`coordinatesUpdatedAt == null`), so it never
  overrides a visibility choice a positioned rider later makes. Wired into every
  first-coordinate write path: `PUT /location` (misc.ts), profile dynamic +
  availability (profile.ts), and login-provided coords (login.ts).
- On login, if coordinate recovery exhausts all sources, the profile is flipped
  to `hideFromMap=true` (truthful) instead of left visible+null.
- Existing stuck rows corrected by boot-gated migration
  `0146_fix_visible_profiles_null_coords.sql`: backfill from
  `users.first_login_lat/lng` when present, else flip to hidden.

**Known edge (accepted, task-endorsed):** a rider who explicitly hides *before*
ever getting a coordinate gets auto-revealed on first coordinate. Rare; would
need a "user explicitly touched visibility" marker to fully avoid.

**Helper placement gotcha:** `revealOnFirstCoordinate` lives in
`server/lib/map-visibility.ts`, NOT `routes/users.ts` — importing it from the
users router aggregator would drag the whole users router tree into the auth
`login.ts` module.
