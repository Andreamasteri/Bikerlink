CREATE TYPE "public"."arcade_game" AS ENUM('endless_biker', 'traffic_racer', 'wheelie', 'tetris', 'space_invaders');--> statement-breakpoint
CREATE TABLE "ad_campaigns" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" varchar(200) NOT NULL,
        "sponsor" varchar(200) DEFAULT 'Syneco Lubrificanti' NOT NULL,
        "image_url" text,
        "link_url" text,
        "display_mode" varchar(30) DEFAULT 'banner' NOT NULL,
        "description" text,
        "is_active" boolean DEFAULT true NOT NULL,
        "impressions" integer DEFAULT 0 NOT NULL,
        "start_date" timestamp,
        "end_date" timestamp,
        "target_user_type" varchar(30) DEFAULT 'biker' NOT NULL,
        "rotation_duration" integer DEFAULT 10 NOT NULL,
        "rotation_mode" varchar(20) DEFAULT 'sequential' NOT NULL,
        "sort_order" integer DEFAULT 0 NOT NULL,
        "placement" varchar(30) DEFAULT 'all' NOT NULL,
        "image_version" integer DEFAULT 0 NOT NULL,
        "group_id" text,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_clicks" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "campaign_id" varchar(36) NOT NULL,
        "user_id" varchar(36),
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "key" varchar(100) NOT NULL,
        "value" text,
        "value_json" jsonb,
        "description" text,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "app_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "arcade_scores" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "game" "arcade_game" NOT NULL,
        "score" integer NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "biker_biker_matches" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "biker1_id" varchar(36) NOT NULL,
        "biker2_id" varchar(36) NOT NULL,
        "motorcycle_brand" varchar(100) NOT NULL,
        "motorcycle_model" varchar(100) NOT NULL,
        "status" varchar(20) DEFAULT 'new' NOT NULL,
        "is_supermatch" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "biker_zavorrina_matches" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "biker_id" varchar(36) NOT NULL,
        "zavorrina_id" varchar(36) NOT NULL,
        "biker_motorcycle_id" varchar(36) NOT NULL,
        "wishlist_moto_id" varchar(36) NOT NULL,
        "status" varchar(20) DEFAULT 'new' NOT NULL,
        "is_supermatch" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collected_easter_eggs" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "easter_egg_id" varchar(36) NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "collected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "conversation_id" varchar(36) NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "joined_at" timestamp DEFAULT now() NOT NULL,
        "last_read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "conversations" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "conversation_type" varchar(20) DEFAULT 'private' NOT NULL,
        "title" varchar(200),
        "proposal_id" varchar(36),
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coordinate_history" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "latitude" double precision NOT NULL,
        "longitude" double precision NOT NULL,
        "slot" integer DEFAULT 1 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_route_waypoints" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "route_id" varchar(36) NOT NULL,
        "order_index" integer DEFAULT 0 NOT NULL,
        "name" varchar(200) NOT NULL,
        "description" text,
        "latitude" double precision NOT NULL,
        "longitude" double precision NOT NULL,
        "waypoint_type" varchar(20) DEFAULT 'stop' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_routes" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" text,
        "total_distance_km" double precision DEFAULT 0,
        "is_public" boolean DEFAULT true NOT NULL,
        "visibility" varchar(20) DEFAULT 'public' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_vote_counts" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "vote_date" varchar(10) NOT NULL,
        "count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "easter_eggs" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" varchar(200) NOT NULL,
        "description" text,
        "latitude" double precision NOT NULL,
        "longitude" double precision NOT NULL,
        "radius" integer DEFAULT 100 NOT NULL,
        "icon_url" text,
        "points" integer DEFAULT 10 NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "token" varchar(64) NOT NULL,
        "expires_at" timestamp NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "email_verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "event_club_invites" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "event_id" varchar(36) NOT NULL,
        "club_id" varchar(36) NOT NULL,
        "invited_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_images" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "event_id" varchar(36) NOT NULL,
        "image_url" varchar(1000) NOT NULL,
        "sort_order" integer DEFAULT 0 NOT NULL,
        "uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_participants" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "event_id" varchar(36) NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "participation_status" varchar(20) DEFAULT 'going' NOT NULL,
        "joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" text,
        "event_type" varchar(30) DEFAULT 'raduno' NOT NULL,
        "creator_id" varchar(36) NOT NULL,
        "location_name" varchar(300),
        "latitude" double precision,
        "longitude" double precision,
        "event_date" timestamp NOT NULL,
        "event_time" varchar(5),
        "is_recurring" boolean DEFAULT false NOT NULL,
        "recurrence_info" text,
        "max_participants" integer,
        "website_url" varchar(500),
        "auto_invite_reason" text,
        "auto_invite_region" varchar(100),
        "auto_invite_brand" varchar(100),
        "status" varchar(20) DEFAULT 'pending' NOT NULL,
        "rejection_reason" text,
        "approved_by" varchar(36),
        "approved_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fake_user_interactions" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "fake_user_id" varchar(36) NOT NULL,
        "real_user_id" varchar(36) NOT NULL,
        "interaction_type" varchar(30) NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_tickets" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36),
        "ticket_type" varchar(30) DEFAULT 'feedback' NOT NULL,
        "subject" varchar(200) NOT NULL,
        "message" text NOT NULL,
        "status" varchar(20) DEFAULT 'open' NOT NULL,
        "internal_note" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gps_errors" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36),
        "route_id" varchar(36),
        "ota_number" integer,
        "platform" varchar(20),
        "os_version" varchar(50),
        "context" varchar(200),
        "error_message" text,
        "stack_trace" text,
        "speed_kmh" double precision,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation_codes" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "code" varchar(50) NOT NULL,
        "label" varchar(100),
        "gift_message" text,
        "created_by" varchar(36),
        "used_by" varchar(36),
        "max_uses" integer DEFAULT 1 NOT NULL,
        "current_uses" integer DEFAULT 0 NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "expires_at" timestamp,
        "image_url" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "invitation_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "messages" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "conversation_id" varchar(36) NOT NULL,
        "sender_id" varchar(36) NOT NULL,
        "message_type" varchar(20) DEFAULT 'text' NOT NULL,
        "content" text,
        "image_url" text,
        "latitude" double precision,
        "longitude" double precision,
        "is_filtered" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "playlist_id" integer
);
--> statement-breakpoint
CREATE TABLE "moderator_logs" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "moderator_id" varchar(36) NOT NULL,
        "action" varchar(100) NOT NULL,
        "target_type" varchar(50) NOT NULL,
        "target_id" varchar(36) NOT NULL,
        "details" text,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moto_club_invites" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "club_id" varchar(36) NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "invited_by" varchar(36),
        "status" varchar(20) DEFAULT 'pending' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moto_club_members" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "club_id" varchar(36) NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "role" varchar(20) DEFAULT 'member' NOT NULL,
        "status" varchar(20) DEFAULT 'active' NOT NULL,
        "joined_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moto_club_requests" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" varchar(200) NOT NULL,
        "club_type" varchar(20) NOT NULL,
        "brand_name" varchar(100),
        "model_name" varchar(100),
        "requested_by" varchar(36),
        "status" varchar(20) DEFAULT 'pending' NOT NULL,
        "reviewed_by" varchar(36),
        "review_note" text,
        "parent_club_id" varchar(36),
        "latitude" double precision,
        "longitude" double precision,
        "invite_radius_km" integer,
        "invite_user_ids" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moto_clubs" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" varchar(200) NOT NULL,
        "club_type" varchar(20) NOT NULL,
        "brand_name" varchar(100),
        "model_name" varchar(100),
        "region" varchar(100),
        "country" varchar(2),
        "description" text,
        "logo_url" text,
        "cover_url" text,
        "is_approved" boolean DEFAULT false NOT NULL,
        "is_featured" boolean DEFAULT false NOT NULL,
        "member_count" integer DEFAULT 0 NOT NULL,
        "activity_score" integer DEFAULT 0 NOT NULL,
        "conversation_id" varchar(36),
        "parent_club_id" varchar(36),
        "latitude" double precision,
        "longitude" double precision,
        "proposed_latitude" double precision,
        "proposed_longitude" double precision,
        "proposed_address" text,
        "proposed_by" varchar(36),
        "proposed_at" timestamp,
        "created_by" varchar(36),
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "motorcycle_photos" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "motorcycle_id" varchar(36) NOT NULL,
        "photo_url" text NOT NULL,
        "sort_order" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "title" varchar(200) NOT NULL,
        "body" text,
        "notification_type" varchar(50) NOT NULL,
        "reference_type" varchar(50),
        "reference_id" varchar(36),
        "is_read" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ota_events" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "phase" varchar(32) NOT NULL,
        "source" varchar(32),
        "platform" varchar(16),
        "runtime_version" varchar(32),
        "current_update_id" varchar(64),
        "release_id" varchar(64),
        "error" text,
        "fail_count" integer DEFAULT 0 NOT NULL,
        "ip" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "ota_releases" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "version" varchar(50) NOT NULL,
        "runtime_version" varchar(50),
        "bundle_path" text,
        "release_notes" text,
        "scheduled_at" timestamp,
        "published_at" timestamp,
        "status" varchar(20) DEFAULT 'draft' NOT NULL,
        "created_by" varchar(36),
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "token" varchar(64) NOT NULL,
        "expires_at" timestamp NOT NULL,
        "used" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "phone_sharing_tracker" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "conversation_id" varchar(36) NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "shared_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_contest_entries" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "photo_url" text,
        "caption" text,
        "performance_data" text,
        "week_number" integer NOT NULL,
        "year" integer NOT NULL,
        "votes_count" integer DEFAULT 0 NOT NULL,
        "is_approved" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_votes" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "entry_id" varchar(36) NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_winners" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "entry_id" varchar(36) NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "week_number" integer NOT NULL,
        "year" integer NOT NULL,
        "total_votes" integer NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_matches" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "proposal_id_1" varchar(36) NOT NULL,
        "proposal_id_2" varchar(36) NOT NULL,
        "user_id_1" varchar(36) NOT NULL,
        "user_id_2" varchar(36) NOT NULL,
        "status" varchar(20) DEFAULT 'pending' NOT NULL,
        "accepted_by_user_1" boolean DEFAULT false NOT NULL,
        "accepted_by_user_2" boolean DEFAULT false NOT NULL,
        "conversation_id" varchar(36),
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_participants" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "proposal_id" varchar(36) NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "proposal_type" varchar(30) NOT NULL,
        "search_type" varchar(30),
        "title" varchar(200) NOT NULL,
        "description" text,
        "search_radius" integer,
        "motorcycle_id" varchar(36),
        "wishlist_moto_id" varchar(36),
        "any_moto_ok" boolean DEFAULT false NOT NULL,
        "departure_latitude" double precision,
        "departure_longitude" double precision,
        "departure_address" text,
        "destination_address" text,
        "destination_latitude" double precision,
        "destination_longitude" double precision,
        "scheduled_at" timestamp,
        "departure_time_from" timestamp,
        "departure_time_to" timestamp,
        "return_deadline" timestamp,
        "stops" jsonb,
        "max_participants" integer,
        "expires_at" timestamp,
        "status" varchar(20) DEFAULT 'active' NOT NULL,
        "club_id" varchar(36),
        "extend_to_destination" boolean DEFAULT false NOT NULL,
        "destination_search_radius" integer,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "reporter_id" varchar(36) NOT NULL,
        "reported_user_id" varchar(36) NOT NULL,
        "reason" varchar(100) NOT NULL,
        "description" text,
        "status" varchar(20) DEFAULT 'pending' NOT NULL,
        "resolved_by" varchar(36),
        "resolved_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_points" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "route_id" varchar(36) NOT NULL,
        "latitude" double precision NOT NULL,
        "longitude" double precision NOT NULL,
        "altitude" double precision,
        "speed_kmh" double precision,
        "timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routes" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "title" varchar(200),
        "tracking_frequency" integer DEFAULT 5 NOT NULL,
        "status" varchar(20) DEFAULT 'active' NOT NULL,
        "total_distance_km" double precision DEFAULT 0,
        "max_speed_kmh" double precision DEFAULT 0,
        "avg_speed_kmh" double precision DEFAULT 0,
        "max_altitude" double precision DEFAULT 0,
        "duration_seconds" integer DEFAULT 0,
        "idle_time_seconds" integer DEFAULT 0,
        "max_tilt_deg" double precision DEFAULT 0,
        "max_acceleration_g" double precision DEFAULT 0,
        "max_deceleration_g" double precision DEFAULT 0,
        "is_sprint" boolean DEFAULT false NOT NULL,
        "sprint_0to100_ms" integer,
        "likes" integer DEFAULT 0 NOT NULL,
        "started_at" timestamp DEFAULT now() NOT NULL,
        "stopped_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_restarts" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "started_at" timestamp DEFAULT now() NOT NULL,
        "reason" varchar(50) DEFAULT 'restart' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_playlists" (
        "id" serial PRIMARY KEY NOT NULL,
        "from_user_id" varchar(36) NOT NULL,
        "to_user_id" varchar(36) NOT NULL,
        "conversation_id" varchar(36),
        "tracks_data" jsonb NOT NULL,
        "track_count" integer NOT NULL,
        "shared_at" timestamp DEFAULT now() NOT NULL,
        "merged_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sos_requests" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "requester_id" varchar(36) NOT NULL,
        "helper_id" varchar(36),
        "reason" text NOT NULL,
        "status" varchar(20) DEFAULT 'active' NOT NULL,
        "latitude" double precision NOT NULL,
        "longitude" double precision NOT NULL,
        "radius_km" integer DEFAULT 10 NOT NULL,
        "conversation_id" varchar(36),
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "blocker_id" varchar(36) NOT NULL,
        "blocked_id" varchar(36) NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_favorites" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "favorite_user_id" varchar(36) NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_lastfm_sessions" (
        "user_id" varchar(36) PRIMARY KEY NOT NULL,
        "lastfm_username" varchar(200) NOT NULL,
        "session_key" varchar(500) NOT NULL,
        "connected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_motorcycles" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "brand" varchar(100) NOT NULL,
        "model" varchar(100) NOT NULL,
        "year" integer,
        "displacement" integer,
        "motorcycle_type" varchar(50),
        "riding_style" varchar(50),
        "photo_url" text,
        "is_default" boolean DEFAULT false NOT NULL,
        "is_for_sale" boolean DEFAULT false NOT NULL,
        "sale_description" text,
        "moto_description" text,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_music_tokens" (
        "user_id" varchar(36) PRIMARY KEY NOT NULL,
        "spotify_user_id" varchar(200) NOT NULL,
        "display_name" varchar(200),
        "access_token" text NOT NULL,
        "refresh_token" text NOT NULL,
        "expires_at" timestamp NOT NULL,
        "connected_at" timestamp DEFAULT now() NOT NULL,
        "last_sync_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_music_tracks" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "lastfm_track_id" varchar(200) NOT NULL,
        "track_name" varchar(500) NOT NULL,
        "artist_id" varchar(200) NOT NULL,
        "artist_name" varchar(300) NOT NULL,
        "album_name" varchar(500),
        "image_url" varchar(500),
        "genres" text[] DEFAULT '{}',
        "popularity" integer DEFAULT 0,
        "provider" varchar(20) DEFAULT 'lastfm' NOT NULL,
        "added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_photos" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "photo_url" text NOT NULL,
        "sort_order" integer DEFAULT 0 NOT NULL,
        "is_approved" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_playlist_snapshots" (
        "user_id" varchar(36) PRIMARY KEY NOT NULL,
        "tracks_json" jsonb NOT NULL,
        "saved_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "is_available" boolean DEFAULT false NOT NULL,
        "latitude" double precision,
        "longitude" double precision,
        "max_pickup_distance" integer DEFAULT 50,
        "bio" text,
        "total_km" double precision DEFAULT 0 NOT NULL,
        "total_rides" integer DEFAULT 0 NOT NULL,
        "easter_eggs_collected" integer DEFAULT 0 NOT NULL,
        "search_preference" varchar(20) DEFAULT 'both' NOT NULL,
        "preferred_map_style" varchar(20),
        "email_chat_notifications" boolean DEFAULT false NOT NULL,
        "hide_from_map" boolean DEFAULT false NOT NULL,
        "position_fuzz" boolean DEFAULT false NOT NULL,
        "position_fuzz_km" integer DEFAULT 1 NOT NULL,
        "fake_home_enabled" boolean DEFAULT false NOT NULL,
        "home_latitude" double precision,
        "home_longitude" double precision,
        "fake_home_latitude" double precision,
        "fake_home_longitude" double precision,
        "fake_home_radius" integer DEFAULT 2 NOT NULL,
        "gps_precision" varchar(30) DEFAULT 'balanced' NOT NULL,
        "coordinates_updated_at" timestamp,
        "admin_override_until" timestamp,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "nickname" varchar(50) NOT NULL,
        "email" varchar(255) NOT NULL,
        "phone" varchar(30),
        "password" text NOT NULL,
        "user_type" varchar(20) DEFAULT 'biker' NOT NULL,
        "sex" varchar(5),
        "couple_sex_config" varchar(10),
        "role" varchar(20) DEFAULT 'user' NOT NULL,
        "status" varchar(20) DEFAULT 'active' NOT NULL,
        "birth_year" integer,
        "region" varchar(100),
        "avatar_url" text,
        "email_verified" boolean DEFAULT false NOT NULL,
        "eula_accepted" boolean DEFAULT false NOT NULL,
        "privacy_accepted" boolean DEFAULT false NOT NULL,
        "consent_accepted_at" timestamp,
        "deletion_requested_at" timestamp,
        "deletion_scheduled_for" timestamp,
        "invitation_code" varchar(50),
        "is_fake" boolean DEFAULT false NOT NULL,
        "is_primal" boolean DEFAULT false NOT NULL,
        "country" varchar(2),
        "spoken_languages" jsonb DEFAULT '[]'::jsonb,
        "auto_join_clubs" boolean DEFAULT true NOT NULL,
        "ghost_mode" boolean DEFAULT false NOT NULL,
        "floating_widget_enabled" boolean DEFAULT true NOT NULL,
        "last_login_at" timestamp,
        "last_logout_at" timestamp,
        "last_app_close_at" timestamp,
        "last_app_version" varchar(32),
        "last_platform" varchar(16),
        "first_login_at" timestamp,
        "first_login_lat" double precision,
        "first_login_lng" double precision,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_codes" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36),
        "code_type" varchar(30) NOT NULL,
        "code" varchar(10) NOT NULL,
        "target" varchar(255) NOT NULL,
        "is_used" boolean DEFAULT false NOT NULL,
        "expires_at" timestamp NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workshop_contacts" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "workshop_id" varchar(36) NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "contact_type" varchar(20) NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workshops" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" varchar(200) NOT NULL,
        "address" text,
        "latitude" double precision,
        "longitude" double precision,
        "phone" varchar(30),
        "whatsapp" varchar(30),
        "email" varchar(255),
        "website" text,
        "description" text,
        "opening_hours" jsonb,
        "logo_url" text,
        "qr_code" text,
        "is_syneco_partner" boolean DEFAULT false NOT NULL,
        "is_approved" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zavorrina_wishlist_motos" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "wishlist_id" varchar(36) NOT NULL,
        "brand" varchar(100),
        "model" varchar(100),
        "motorcycle_type" varchar(50),
        "riding_style" varchar(50),
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zavorrina_wishlist_photos" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "wishlist_id" varchar(36) NOT NULL,
        "photo_url" text NOT NULL,
        "sort_order" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zavorrina_wishlists" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "description" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "zavorrina_wishlists_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "ad_clicks" ADD CONSTRAINT "ad_clicks_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_clicks" ADD CONSTRAINT "ad_clicks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcade_scores" ADD CONSTRAINT "arcade_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biker_biker_matches" ADD CONSTRAINT "biker_biker_matches_biker1_id_users_id_fk" FOREIGN KEY ("biker1_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biker_biker_matches" ADD CONSTRAINT "biker_biker_matches_biker2_id_users_id_fk" FOREIGN KEY ("biker2_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biker_zavorrina_matches" ADD CONSTRAINT "biker_zavorrina_matches_biker_id_users_id_fk" FOREIGN KEY ("biker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biker_zavorrina_matches" ADD CONSTRAINT "biker_zavorrina_matches_zavorrina_id_users_id_fk" FOREIGN KEY ("zavorrina_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biker_zavorrina_matches" ADD CONSTRAINT "biker_zavorrina_matches_biker_motorcycle_id_user_motorcycles_id_fk" FOREIGN KEY ("biker_motorcycle_id") REFERENCES "public"."user_motorcycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biker_zavorrina_matches" ADD CONSTRAINT "biker_zavorrina_matches_wishlist_moto_id_zavorrina_wishlist_motos_id_fk" FOREIGN KEY ("wishlist_moto_id") REFERENCES "public"."zavorrina_wishlist_motos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collected_easter_eggs" ADD CONSTRAINT "collected_easter_eggs_easter_egg_id_easter_eggs_id_fk" FOREIGN KEY ("easter_egg_id") REFERENCES "public"."easter_eggs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collected_easter_eggs" ADD CONSTRAINT "collected_easter_eggs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordinate_history" ADD CONSTRAINT "coordinate_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_route_waypoints" ADD CONSTRAINT "custom_route_waypoints_route_id_custom_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."custom_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_routes" ADD CONSTRAINT "custom_routes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_vote_counts" ADD CONSTRAINT "daily_vote_counts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_club_invites" ADD CONSTRAINT "event_club_invites_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_club_invites" ADD CONSTRAINT "event_club_invites_club_id_moto_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."moto_clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_images" ADD CONSTRAINT "event_images_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fake_user_interactions" ADD CONSTRAINT "fake_user_interactions_fake_user_id_users_id_fk" FOREIGN KEY ("fake_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fake_user_interactions" ADD CONSTRAINT "fake_user_interactions_real_user_id_users_id_fk" FOREIGN KEY ("real_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_tickets" ADD CONSTRAINT "feedback_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_codes" ADD CONSTRAINT "invitation_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_codes" ADD CONSTRAINT "invitation_codes_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_playlist_id_shared_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."shared_playlists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderator_logs" ADD CONSTRAINT "moderator_logs_moderator_id_users_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moto_club_invites" ADD CONSTRAINT "moto_club_invites_club_id_moto_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."moto_clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moto_club_invites" ADD CONSTRAINT "moto_club_invites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moto_club_members" ADD CONSTRAINT "moto_club_members_club_id_moto_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."moto_clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moto_club_members" ADD CONSTRAINT "moto_club_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moto_club_requests" ADD CONSTRAINT "moto_club_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moto_club_requests" ADD CONSTRAINT "moto_club_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moto_clubs" ADD CONSTRAINT "moto_clubs_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moto_clubs" ADD CONSTRAINT "moto_clubs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motorcycle_photos" ADD CONSTRAINT "motorcycle_photos_motorcycle_id_user_motorcycles_id_fk" FOREIGN KEY ("motorcycle_id") REFERENCES "public"."user_motorcycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ota_releases" ADD CONSTRAINT "ota_releases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_contest_entries" ADD CONSTRAINT "photo_contest_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_votes" ADD CONSTRAINT "photo_votes_entry_id_photo_contest_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."photo_contest_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_votes" ADD CONSTRAINT "photo_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_winners" ADD CONSTRAINT "photo_winners_entry_id_photo_contest_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."photo_contest_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_winners" ADD CONSTRAINT "photo_winners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_matches" ADD CONSTRAINT "proposal_matches_proposal_id_1_proposals_id_fk" FOREIGN KEY ("proposal_id_1") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_matches" ADD CONSTRAINT "proposal_matches_proposal_id_2_proposals_id_fk" FOREIGN KEY ("proposal_id_2") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_matches" ADD CONSTRAINT "proposal_matches_user_id_1_users_id_fk" FOREIGN KEY ("user_id_1") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_matches" ADD CONSTRAINT "proposal_matches_user_id_2_users_id_fk" FOREIGN KEY ("user_id_2") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_participants" ADD CONSTRAINT "proposal_participants_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_participants" ADD CONSTRAINT "proposal_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_points" ADD CONSTRAINT "route_points_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_playlists" ADD CONSTRAINT "shared_playlists_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_playlists" ADD CONSTRAINT "shared_playlists_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_playlists" ADD CONSTRAINT "shared_playlists_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_requests" ADD CONSTRAINT "sos_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_requests" ADD CONSTRAINT "sos_requests_helper_id_users_id_fk" FOREIGN KEY ("helper_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_favorite_user_id_users_id_fk" FOREIGN KEY ("favorite_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_lastfm_sessions" ADD CONSTRAINT "user_lastfm_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_motorcycles" ADD CONSTRAINT "user_motorcycles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_music_tokens" ADD CONSTRAINT "user_music_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_music_tracks" ADD CONSTRAINT "user_music_tracks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_photos" ADD CONSTRAINT "user_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_playlist_snapshots" ADD CONSTRAINT "user_playlist_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_contacts" ADD CONSTRAINT "workshop_contacts_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_contacts" ADD CONSTRAINT "workshop_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zavorrina_wishlist_motos" ADD CONSTRAINT "zavorrina_wishlist_motos_wishlist_id_zavorrina_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."zavorrina_wishlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zavorrina_wishlist_photos" ADD CONSTRAINT "zavorrina_wishlist_photos_wishlist_id_zavorrina_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."zavorrina_wishlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zavorrina_wishlists" ADD CONSTRAINT "zavorrina_wishlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_clicks_campaign_id_idx" ON "ad_clicks" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "arcade_scores_user_game_idx" ON "arcade_scores" USING btree ("user_id","game");--> statement-breakpoint
CREATE INDEX "arcade_scores_game_score_idx" ON "arcade_scores" USING btree ("game","score");--> statement-breakpoint
CREATE INDEX "biker_biker_biker1_idx" ON "biker_biker_matches" USING btree ("biker1_id");--> statement-breakpoint
CREATE INDEX "biker_biker_biker2_idx" ON "biker_biker_matches" USING btree ("biker2_id");--> statement-breakpoint
CREATE UNIQUE INDEX "biker_biker_symmetric_idx" ON "biker_biker_matches" USING btree (LEAST("biker1_id", "biker2_id"),GREATEST("biker1_id", "biker2_id"),"motorcycle_brand","motorcycle_model");--> statement-breakpoint
CREATE INDEX "matches_biker_id_idx" ON "biker_zavorrina_matches" USING btree ("biker_id");--> statement-breakpoint
CREATE INDEX "matches_zavorrina_id_idx" ON "biker_zavorrina_matches" USING btree ("zavorrina_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_unique_combo_idx" ON "biker_zavorrina_matches" USING btree ("biker_id","zavorrina_id","biker_motorcycle_id","wishlist_moto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collected_easter_eggs_unique_idx" ON "collected_easter_eggs" USING btree ("easter_egg_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_participants_unique_idx" ON "conversation_participants" USING btree ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX "conversation_participants_user_id_idx" ON "conversation_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "coordinate_history_user_created_idx" ON "coordinate_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "custom_route_waypoints_route_id_idx" ON "custom_route_waypoints" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "custom_routes_user_id_idx" ON "custom_routes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_vote_counts_unique_idx" ON "daily_vote_counts" USING btree ("user_id","vote_date");--> statement-breakpoint
CREATE INDEX "easter_eggs_location_idx" ON "easter_eggs" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE UNIQUE INDEX "event_club_invites_unique_idx" ON "event_club_invites" USING btree ("event_id","club_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_participants_unique_idx" ON "event_participants" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "event_participants_event_idx" ON "event_participants" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_date_idx" ON "events" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "events_creator_idx" ON "events" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "fake_interactions_fake_user_idx" ON "fake_user_interactions" USING btree ("fake_user_id");--> statement-breakpoint
CREATE INDEX "fake_interactions_real_user_idx" ON "fake_user_interactions" USING btree ("real_user_id");--> statement-breakpoint
CREATE INDEX "gps_errors_created_at_idx" ON "gps_errors" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_sender_id_idx" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE UNIQUE INDEX "moto_club_invites_unique_idx" ON "moto_club_invites" USING btree ("club_id","user_id");--> statement-breakpoint
CREATE INDEX "moto_club_invites_user_idx" ON "moto_club_invites" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "moto_club_members_unique_idx" ON "moto_club_members" USING btree ("club_id","user_id");--> statement-breakpoint
CREATE INDEX "moto_club_members_club_idx" ON "moto_club_members" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "moto_club_members_user_idx" ON "moto_club_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "moto_clubs_type_idx" ON "moto_clubs" USING btree ("club_type");--> statement-breakpoint
CREATE INDEX "moto_clubs_brand_idx" ON "moto_clubs" USING btree ("brand_name");--> statement-breakpoint
CREATE INDEX "moto_clubs_region_idx" ON "moto_clubs" USING btree ("region");--> statement-breakpoint
CREATE INDEX "motorcycle_photos_motorcycle_id_idx" ON "motorcycle_photos" USING btree ("motorcycle_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ota_events_created_at_idx" ON "ota_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ota_releases_status_idx" ON "ota_releases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ota_releases_rv_status_idx" ON "ota_releases" USING btree ("runtime_version","status");--> statement-breakpoint
CREATE UNIQUE INDEX "phone_sharing_tracker_unique_idx" ON "phone_sharing_tracker" USING btree ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX "photo_contest_entries_user_id_idx" ON "photo_contest_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "photo_contest_entries_week_idx" ON "photo_contest_entries" USING btree ("week_number","year");--> statement-breakpoint
CREATE UNIQUE INDEX "photo_votes_unique_idx" ON "photo_votes" USING btree ("entry_id","user_id");--> statement-breakpoint
CREATE INDEX "proposal_matches_user1_idx" ON "proposal_matches" USING btree ("user_id_1");--> statement-breakpoint
CREATE INDEX "proposal_matches_user2_idx" ON "proposal_matches" USING btree ("user_id_2");--> statement-breakpoint
CREATE INDEX "proposal_matches_status_idx" ON "proposal_matches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_participants_unique_idx" ON "proposal_participants" USING btree ("proposal_id","user_id");--> statement-breakpoint
CREATE INDEX "proposals_user_id_idx" ON "proposals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "proposals_status_idx" ON "proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "proposals_expires_at_idx" ON "proposals" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "route_points_route_id_idx" ON "route_points" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "routes_user_id_idx" ON "routes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shared_playlists_to_user_idx" ON "shared_playlists" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX "shared_playlists_from_user_idx" ON "shared_playlists" USING btree ("from_user_id");--> statement-breakpoint
CREATE INDEX "sos_requests_requester_idx" ON "sos_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "sos_requests_status_idx" ON "sos_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_blocks_unique_idx" ON "user_blocks" USING btree ("blocker_id","blocked_id");--> statement-breakpoint
CREATE INDEX "user_blocks_blocker_idx" ON "user_blocks" USING btree ("blocker_id");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_idx" ON "user_blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_favorites_unique_idx" ON "user_favorites" USING btree ("user_id","favorite_user_id");--> statement-breakpoint
CREATE INDEX "user_favorites_user_id_idx" ON "user_favorites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_motorcycles_user_id_idx" ON "user_motorcycles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_track_uniq" ON "user_music_tracks" USING btree ("user_id","lastfm_track_id","provider");--> statement-breakpoint
CREATE INDEX "user_music_tracks_user_idx" ON "user_music_tracks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_photos_user_id_idx" ON "user_photos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_profiles_user_id_idx" ON "user_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_profiles_location_idx" ON "user_profiles" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "verification_codes_target_idx" ON "verification_codes" USING btree ("target");--> statement-breakpoint
CREATE INDEX "workshop_contacts_workshop_id_idx" ON "workshop_contacts" USING btree ("workshop_id");--> statement-breakpoint
CREATE INDEX "workshops_location_idx" ON "workshops" USING btree ("latitude","longitude");
--> statement-breakpoint
-- Migration-system tracking table.
-- Canonical definition lives here for schema history purposes.
-- The migration runner bootstraps this table before applying any migrations
-- because it cannot track its own creation (necessary infrastructure exception).
CREATE TABLE IF NOT EXISTS "schema_migrations" (
  "filename"   TEXT PRIMARY KEY,
  "applied_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);