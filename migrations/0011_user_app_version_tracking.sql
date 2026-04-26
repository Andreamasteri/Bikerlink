-- Add columns to track the last installed app version + platform per user.
-- Populated by POST /api/auth/heartbeat and read by
-- GET /api/admin/settings/version-distribution. Both columns are nullable;
-- legacy users without recent heartbeats remain NULL and are excluded from
-- the distribution stats.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_app_version" varchar(32);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_platform" varchar(16);
