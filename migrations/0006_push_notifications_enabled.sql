ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "push_notifications_enabled" boolean NOT NULL DEFAULT true;
