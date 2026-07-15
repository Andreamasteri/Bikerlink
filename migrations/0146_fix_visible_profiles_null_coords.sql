-- Task #66 — Fix riders who should show on the map but don't.
--
-- Root cause: on signup a user_profiles row is created with the schema default
-- hide_from_map=false and NULL latitude/longitude. If a coordinate never gets
-- stored (GPS never granted, no coordinate_history, no first_login_lat/lng and a
-- region with no known centroid), the profile stays "visible on the map" with no
-- coordinates. The map queries require latitude/longitude IS NOT NULL, so these
-- riders never appear despite the visibility toggle saying they should — a silent
-- trust gap (confirmed on prod: 6 rows, docs/bikerlink-db-check-report.md §7.2.d).
--
-- Correction (idempotent):
--   1) Backfill coordinates from the rider's captured first-login position when
--      available (honours their intent to be visible).
--   2) Any remaining visible-but-coordless profile is flipped to hide_from_map=true
--      so the persisted visibility state is truthful until they provide a position.

-- 1) Backfill from users.first_login_lat / first_login_lng where present.
UPDATE "user_profiles" AS p
SET "latitude" = u."first_login_lat",
    "longitude" = u."first_login_lng",
    "coordinates_updated_at" = now(),
    "updated_at" = now()
FROM "users" AS u
WHERE p."user_id" = u."id"
  AND p."hide_from_map" = false
  AND p."latitude" IS NULL
  AND p."longitude" IS NULL
  AND u."first_login_lat" IS NOT NULL
  AND u."first_login_lng" IS NOT NULL;
--> statement-breakpoint
-- 2) Remaining visible-but-coordless profiles: make the state truthful.
UPDATE "user_profiles"
SET "hide_from_map" = true,
    "updated_at" = now()
WHERE "hide_from_map" = false
  AND "latitude" IS NULL
  AND "longitude" IS NULL;
