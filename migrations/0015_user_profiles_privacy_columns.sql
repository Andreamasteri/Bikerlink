ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "hide_online_status" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "hide_last_seen" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "hide_distance" boolean NOT NULL DEFAULT false;
