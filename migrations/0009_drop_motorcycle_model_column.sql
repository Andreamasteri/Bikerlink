-- Migration: drop the unused motorcycle_model column from biker_biker_matches
-- The column was already removed from the unique index (migration 0008) and is set to ''
-- for all rows. It is no longer used as a matching dimension.

ALTER TABLE biker_biker_matches DROP COLUMN IF EXISTS motorcycle_model;
