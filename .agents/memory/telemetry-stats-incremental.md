---
name: Telemetry stats incremental summary
description: GET /api/telemetry/stats reads a per-session summary table, not a Haversine scan — any ride_telemetry mutation must keep the summary in sync.
---

# Telemetry stats are precomputed per-session, not scanned per-request

`GET /api/telemetry/stats` no longer runs the Haversine window-function scan over
`ride_telemetry`. Totals (`km_collected` / `track_km` / `ideal_lap_km` + the
counts) are a plain SUM/COUNT over `telemetry_session_stats` (one row per
`user_id,session_id`), maintained incrementally.

- Distances are accumulated per batch in `server/lib/telemetry-session-stats.ts`
  (`updateTelemetrySessionStats`), called from `POST /batch`. It stores the
  last GPS point per session (`last_lat/last_lon/last_ts`) as the anchor for the
  next batch's first segment, replicating `LAG(...) OVER (ORDER BY ts)`.
- `dist_speed_filtered` = segments with speed NULL or ≥20 (feeds km_collected
  for ALL sessions incl. ideal_lap, and ideal_lap_km for ideal_lap sessions);
  `dist_all` = every segment (feeds track_km for ideal_lap sessions only).

**Why:** the old per-request scan was O(all samples) and degrades as ride
history accumulates (same DB-pressure risk as the map-matching backlog). Reads
are now cheap and always fresh, so no stop-gap request cache is needed.

**How to apply — the hard invariant:** `/stats` reads ONLY the summary, so every
`ride_telemetry` mutation MUST keep the summary in sync or totals silently drift.
- Inserts and the summary upsert MUST be in the SAME db transaction (atomic), so
  a summary failure rolls the samples back instead of leaving a divergence. There
  is more than one insert path — `POST /api/telemetry/batch` AND `PATCH
  /api/routes/:id` (route save with attached telemetry) — grep for every
  `insert(rideTelemetry)` when touching this.
- Deletes must remove the matching summary rows: `/reset` (non-ideal sessions),
  ideal-lap DELETE (one session), and any future retention/deleter job.
- The pure math lives in `computeSessionStatsDelta` (formula/filters:
  |Δlat|,|Δlon| < 0.5 to keep a segment; speed NULL or ≥20 for the filtered sum;
  anchor = last GPS point, advances even on sensor-only rows = LAG semantics).
  Key correctness property, unit-tested: splitting a session into batches with the
  anchor carried over == recomputing the whole session in one pass. If you change
  the formula, re-check that property and diff against the Haversine window query.
