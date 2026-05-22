-- Add privacy columns to user_profiles that were in the schema but had no migration
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS hide_online_status BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_last_seen     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_distance      BOOLEAN NOT NULL DEFAULT false;
