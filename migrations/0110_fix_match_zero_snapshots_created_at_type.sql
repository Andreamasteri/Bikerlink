-- Fix schema drift: match_zero_snapshots.created_at was declared as
-- "timestamp without time zone" in the Drizzle schema, but the DB column
-- has always been "timestamp with time zone" (TIMESTAMPTZ) since migration 0082.
-- No DB change is required — the Drizzle declaration was updated to use
-- { withTimezone: true } to match the existing column type.
-- This migration is a no-op and exists solely as a numbered record of the fix.
SELECT 1;
