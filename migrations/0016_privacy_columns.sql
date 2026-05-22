ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS hide_online_status BOOLEAN NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS hide_last_seen BOOLEAN NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS hide_distance BOOLEAN NOT NULL DEFAULT false;
