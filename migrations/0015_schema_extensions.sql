ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_home_enabled BOOLEAN NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS home_latitude DOUBLE PRECISION;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS home_longitude DOUBLE PRECISION;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_home_latitude DOUBLE PRECISION;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_home_longitude DOUBLE PRECISION;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_home_radius INTEGER NOT NULL DEFAULT 2;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS gps_precision INTEGER NOT NULL DEFAULT 100;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS offline_position_randomize BOOLEAN NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_work_enabled BOOLEAN NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS work_latitude DOUBLE PRECISION;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS work_longitude DOUBLE PRECISION;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_work_latitude DOUBLE PRECISION;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_work_longitude DOUBLE PRECISION;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_work_radius INTEGER NOT NULL DEFAULT 2;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_whatever_enabled BOOLEAN NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS whatever_latitude DOUBLE PRECISION;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS whatever_longitude DOUBLE PRECISION;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_whatever_latitude DOUBLE PRECISION;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_whatever_longitude DOUBLE PRECISION;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS fake_whatever_radius INTEGER NOT NULL DEFAULT 2;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_offline_lat DOUBLE PRECISION;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_offline_lng DOUBLE PRECISION;
--> statement-breakpoint
ALTER TABLE user_music_tracks ADD COLUMN IF NOT EXISTS image_url TEXT;
--> statement-breakpoint
ALTER TABLE user_music_tracks ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'spotify';
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS floating_widget_enabled BOOLEAN NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_logout_at TIMESTAMP;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_app_close_at TIMESTAMP;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token TEXT;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS units_preference JSONB;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{"matches":true,"zoneProposals":true,"chat":true,"motoclub":true,"eventi":true}'::jsonb;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS map_filters JSONB;
--> statement-breakpoint
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS push_notifications_enabled BOOLEAN NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS slot VARCHAR(32);
--> statement-breakpoint
ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMP;
--> statement-breakpoint
ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS promoted_by VARCHAR(100);
--> statement-breakpoint
ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS success_count INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
--> statement-breakpoint
ALTER TABLE ota_releases ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100);
--> statement-breakpoint
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS target_user_types jsonb;
