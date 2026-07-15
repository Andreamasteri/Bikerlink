-- Task #103 — Preserve a rider's explicit "hide me from map" choice across their
-- first GPS fix.
--
-- Task #66 makes new profiles start hidden and auto-reveal (hide_from_map=false)
-- the first time a real coordinate is stored (revealOnFirstCoordinate). That
-- reveal only checks "never positioned" (coordinates_updated_at IS NULL), so it
-- cannot tell a signup-default hide apart from a deliberate "hide me" the rider
-- chose before ever getting a coordinate. Result: a rider who registers, turns
-- themselves off the map, then gets their first GPS fix would be silently
-- un-hidden — a privacy-intent regression.
--
-- This adds a marker set only when the rider explicitly touches the
-- map-visibility toggle in privacy settings; revealOnFirstCoordinate skips the
-- reveal when it is present.
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "hide_from_map_explicit" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- Backfill (idempotent): riders who provably made an explicit hide choice that is
-- still in effect get the marker. A rider has an explicit choice when their most
-- recent user_privacy_log entry for hide_from_map is `true` AND their profile is
-- currently hidden. Signup-default hides and the Task #66 login-flip leave no log
-- row, so those profiles stay unmarked and remain eligible for
-- reveal-on-first-coordinate.
UPDATE "user_profiles" AS p
SET "hide_from_map_explicit" = true,
    "updated_at" = now()
WHERE p."hide_from_map" = true
  AND (
    SELECT l."new_value"
    FROM "user_privacy_log" AS l
    WHERE l."user_id" = p."user_id"
      AND l."setting_key" = 'hide_from_map'
    ORDER BY l."changed_at" DESC
    LIMIT 1
  ) = true;
