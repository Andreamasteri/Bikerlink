CREATE TABLE "user_time_profile" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"histogram" jsonb NOT NULL,
	"total_rides" integer DEFAULT 0 NOT NULL,
	"label" varchar(50),
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_time_profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "proposal_zone_notifications" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"proposal_id" varchar(36) NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sprint_results" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"route_id" varchar(36),
	"sprint_0to100_ms" integer NOT NULL,
	"max_acceleration_g" double precision,
	"max_deceleration_g" double precision,
	"max_tilt_deg" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_crash_logs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"crash_type" varchar(20) NOT NULL,
	"app_version" varchar(32),
	"platform" varchar(16),
	"os_version" varchar(50),
	"device_model" varchar(100),
	"error_message" text,
	"stack_trace" text,
	"session_started_at" timestamp,
	"session_ended_at" timestamp,
	"reported_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(254) NOT NULL,
	"notify_rides" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_subscribers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "site_visits" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" varchar(64) NOT NULL,
	"user_id" varchar(36),
	"event" varchar(20) DEFAULT 'view' NOT NULL,
	"path" text NOT NULL,
	"referrer" text,
	"user_agent" text,
	"ip_hash" varchar(64),
	"ip_prefix" varchar(48),
	"lang" varchar(10),
	"country" varchar(2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_recaps" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"week_start" timestamp NOT NULL,
	"top_matches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"push_sent_at" timestamp,
	"opened_at" timestamp,
	"match_clicked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ride_telemetry" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"session_type" varchar(10) DEFAULT 'ride' NOT NULL,
	"ts" bigint NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"speed_kmh" real,
	"lean_angle" real,
	"gforce_x" real,
	"gforce_y" real,
	"gforce_z" real,
	"heading" real,
	"altitude_m" real,
	"matched" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segment_telemetry" (
	"osm_way_id" bigint PRIMARY KEY NOT NULL,
	"avg_lean_angle" double precision,
	"max_lean_angle" double precision,
	"avg_gforce" double precision,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"curvy_score" double precision
);
--> statement-breakpoint
CREATE TABLE "ai_watchdog_log" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(30) NOT NULL,
	"scope" varchar(60),
	"status" varchar(20) DEFAULT 'ok' NOT NULL,
	"summary" text,
	"details" jsonb,
	"proposal_id" varchar(36),
	"accepted_by_admin_id" varchar(36),
	"accepted_at" timestamp,
	"rejected_by_admin_id" varchar(36),
	"rejected_at" timestamp,
	"reject_reason" varchar(300),
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_health_snapshot" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(10) NOT NULL,
	"score" integer DEFAULT 100 NOT NULL,
	"problems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_signals" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(40) NOT NULL,
	"metric" varchar(80) NOT NULL,
	"value" double precision,
	"unit" varchar(20),
	"severity" varchar(10) DEFAULT 'info' NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_system_reports" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" varchar(10) NOT NULL,
	"payload" jsonb NOT NULL,
	"model_used" varchar(80),
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_system_reports_week_start_unique" UNIQUE("week_start")
);
--> statement-breakpoint
CREATE TABLE "db_integrity_quarantine" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"violation_id" varchar(36),
	"source_table" varchar(80) NOT NULL,
	"source_pk" varchar(80) NOT NULL,
	"payload" jsonb NOT NULL,
	"reason" text,
	"ttl_expires_at" timestamp NOT NULL,
	"restored_at" timestamp,
	"purged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "db_integrity_runs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" varchar(20) DEFAULT 'manual' NOT NULL,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"checks_run" integer DEFAULT 0 NOT NULL,
	"violations_found" integer DEFAULT 0 NOT NULL,
	"auto_fixed" integer DEFAULT 0 NOT NULL,
	"manual_pending" integer DEFAULT 0 NOT NULL,
	"expensive" boolean DEFAULT false NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "db_integrity_violations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" varchar(36) NOT NULL,
	"check_id" varchar(80) NOT NULL,
	"check_name" varchar(160) NOT NULL,
	"severity" varchar(10) NOT NULL,
	"category" varchar(40) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"sample" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"details" jsonb,
	"hash" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"auto_fix_applied" boolean DEFAULT false NOT NULL,
	"auto_fix_summary" text,
	"ai_explain" jsonb,
	"ai_explain_cost_usd" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" varchar(36) NOT NULL,
	"title" varchar(200),
	"scopes_hint" jsonb,
	"summary" text,
	"entities" jsonb,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_pinned_insights" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar(36) NOT NULL,
	"message_id" varchar(36) NOT NULL,
	"admin_user_id" varchar(36) NOT NULL,
	"title" varchar(200),
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_conflicts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id_a" varchar(36) NOT NULL,
	"event_id_b" varchar(36) NOT NULL,
	"conflict_type" varchar(80) NOT NULL,
	"resolved_by" varchar(16) DEFAULT 'none' NOT NULL,
	"policy_rule_id" varchar(80),
	"resolution_rationale" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_decisions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_name" varchar(80) NOT NULL,
	"decision_type" varchar(80) NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rationale" text,
	"confidence" numeric(5, 4),
	"took_ms" integer DEFAULT 0 NOT NULL,
	"correlation_id" varchar(80),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_events" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_name" varchar(80) NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"severity" varchar(16) DEFAULT 'info' NOT NULL,
	"correlation_id" varchar(80),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "biker_zavorrina_matches" DROP CONSTRAINT "biker_zavorrina_matches_biker_motorcycle_id_user_motorcycles_id_fk";
--> statement-breakpoint
ALTER TABLE "biker_zavorrina_matches" DROP CONSTRAINT "biker_zavorrina_matches_wishlist_moto_id_zavorrina_wishlist_motos_id_fk";
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_approved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "proposal_profile_matches" DROP CONSTRAINT "proposal_profile_matches_proposal_id_proposals_id_fk";
--> statement-breakpoint
ALTER TABLE "proposal_profile_matches" DROP CONSTRAINT "proposal_profile_matches_biker_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "proposal_profile_matches" DROP CONSTRAINT "proposal_profile_matches_zavorrina_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ota_releases" DROP CONSTRAINT "ota_releases_approved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ota_releases" DROP CONSTRAINT "ota_releases_rejected_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ota_boot_events" DROP CONSTRAINT "ota_boot_events_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ota_assistant_runs" DROP CONSTRAINT "ota_assistant_runs_admin_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ota_watchdog_reports" DROP CONSTRAINT "ota_watchdog_reports_triggered_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ab_events" DROP CONSTRAINT "ab_events_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "planned_route_invites" DROP CONSTRAINT "planned_route_invites_route_id_planned_routes_id_fk";
--> statement-breakpoint
DROP INDEX "arcade_scores_game_score_idx";--> statement-breakpoint
DROP INDEX "coordinate_history_user_created_idx";--> statement-breakpoint
DROP INDEX "events_date_idx";--> statement-breakpoint
DROP INDEX "events_geom_gist";--> statement-breakpoint
DROP INDEX "proposals_departure_geom_gist";--> statement-breakpoint
DROP INDEX "proposals_destination_geom_gist";--> statement-breakpoint
DROP INDEX "user_motorcycles_brand_norm_trgm_idx";--> statement-breakpoint
DROP INDEX "user_motorcycles_model_norm_trgm_idx";--> statement-breakpoint
DROP INDEX "user_profiles_geom_gist";--> statement-breakpoint
DROP INDEX "users_nickname_norm_trgm_idx";--> statement-breakpoint
DROP INDEX "users_region_norm_trgm_idx";--> statement-breakpoint
DROP INDEX "users_shadow_banned_idx";--> statement-breakpoint
DROP INDEX "users_suspended_until_idx";--> statement-breakpoint
DROP INDEX "ab_assignments_exp_user_unique";--> statement-breakpoint
DROP INDEX "embeddings_vec_hnsw_cosine_idx";--> statement-breakpoint
DROP INDEX "ota_assistant_runs_started_at_idx";--> statement-breakpoint
ALTER TABLE "biker_zavorrina_matches" ALTER COLUMN "notification_priority" SET DEFAULT 'normal';--> statement-breakpoint
ALTER TABLE "proposal_matches" ALTER COLUMN "notification_priority" SET DEFAULT 'normal';--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "category" SET DATA TYPE varchar(40);--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "category" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "category" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "assigned_moderator_id" SET DATA TYPE varchar(36);--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "ai_analysis" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "ai_analysis" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "ai_analysis" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ALTER COLUMN "max_tilt_deg" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "routes" ALTER COLUMN "max_acceleration_g" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "routes" ALTER COLUMN "max_deceleration_g" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "shadow_banned_at" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "media_library" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "proposal_profile_matches" ALTER COLUMN "notification_priority" SET DEFAULT 'normal';--> statement-breakpoint
ALTER TABLE "road_hazards" ALTER COLUMN "expires_at" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "road_hazards" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "road_hazards" ALTER COLUMN "created_at" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "road_hazards" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "road_hazard_confirms" ALTER COLUMN "created_at" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "road_hazard_confirms" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "road_hazard_comments" ALTER COLUMN "created_at" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "road_hazard_comments" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "road_hazard_comments" ALTER COLUMN "updated_at" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "road_hazard_comments" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "maps_quota" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ota_assistant_runs" ALTER COLUMN "tool_calls" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "daily_push_counts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "daily_push_counts" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "match_notification_deliveries" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "match_notification_deliveries" ALTER COLUMN "delivered_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ai_suggestions_log" ALTER COLUMN "cost_usd" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "ai_suggestions_log" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ai_suggestions_log" ALTER COLUMN "rejected_by_admin_id" SET DATA TYPE varchar(36);--> statement-breakpoint
ALTER TABLE "ai_usage_budget" ALTER COLUMN "total_cost_usd" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "ai_usage_budget" ALTER COLUMN "limit_usd" SET DEFAULT '55';--> statement-breakpoint
ALTER TABLE "ai_usage_budget" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "moderator_digests" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "anomaly_events" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "gps_rejection_stats" ADD CONSTRAINT "gps_rejection_stats_pk" PRIMARY KEY("user_id","device_id");--> statement-breakpoint
ALTER TABLE "biker_zavorrina_matches" ADD COLUMN "notified_at" timestamp;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "geom" "geography" GENERATED ALWAYS AS (CASE WHEN ((longitude IS NOT NULL) AND (latitude IS NOT NULL)) THEN (st_setsrid(st_makepoint(longitude, latitude), 4326))::geography ELSE NULL::geography END) STORED;--> statement-breakpoint
ALTER TABLE "proposal_matches" ADD COLUMN "notified_at" timestamp;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "departure_geom" "geography" GENERATED ALWAYS AS (CASE WHEN ((departure_longitude IS NOT NULL) AND (departure_latitude IS NOT NULL)) THEN (st_setsrid(st_makepoint(departure_longitude, departure_latitude), 4326))::geography ELSE NULL::geography END) STORED;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "destination_geom" "geography" GENERATED ALWAYS AS (CASE WHEN ((destination_longitude IS NOT NULL) AND (destination_latitude IS NOT NULL)) THEN (st_setsrid(st_makepoint(destination_longitude, destination_latitude), 4326))::geography ELSE NULL::geography END) STORED;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "search_types" jsonb;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "context" varchar(20);--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "context_id" varchar(64);--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "reported_user_role" varchar(20);--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "severity" varchar(10) DEFAULT 'low' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "affected_feedback_loop" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "reporter_trust_score" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "assigned_at" timestamp;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "ai_analyzed_at" timestamp;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "ai_model" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "disable_ai_analysis" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "route_points" ADD COLUMN "accel_g" double precision;--> statement-breakpoint
ALTER TABLE "route_points" ADD COLUMN "tilt_deg" double precision;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "max_lateral_g" double precision;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "gps_blackout_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "gps_blackout_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "geom" "geography" GENERATED ALWAYS AS (CASE WHEN ((longitude IS NOT NULL) AND (latitude IS NOT NULL)) THEN (st_setsrid(st_makepoint(longitude, latitude), 4326))::geography ELSE NULL::geography END) STORED;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "shadow_ban_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "shadow_banned_until" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_seen_match_at" timestamp;--> statement-breakpoint
ALTER TABLE "planned_routes" ADD COLUMN "real_curvature_score" double precision;--> statement-breakpoint
ALTER TABLE "match_preferences" ADD COLUMN "time_overlap" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "match_preferences" ADD COLUMN "weekly_recap" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "proposal_profile_matches" ADD COLUMN "notified_at" timestamp;--> statement-breakpoint
ALTER TABLE "ai_suggestions_log" ADD COLUMN "rejected_at" timestamp;--> statement-breakpoint
ALTER TABLE "ai_suggestions_log" ADD COLUMN "reject_reason" varchar(300);--> statement-breakpoint
ALTER TABLE "user_time_profile" ADD CONSTRAINT "user_time_profile_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_zone_notifications" ADD CONSTRAINT "proposal_zone_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_zone_notifications" ADD CONSTRAINT "proposal_zone_notifications_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_results" ADD CONSTRAINT "sprint_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_results" ADD CONSTRAINT "sprint_results_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_crash_logs" ADD CONSTRAINT "app_crash_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_recaps" ADD CONSTRAINT "weekly_recaps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_telemetry" ADD CONSTRAINT "ride_telemetry_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_time_profile_user_id_idx" ON "user_time_profile" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_time_profile_label_idx" ON "user_time_profile" USING btree ("label");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_zone_notif_unique_idx" ON "proposal_zone_notifications" USING btree ("user_id","proposal_id");--> statement-breakpoint
CREATE INDEX "proposal_zone_notif_proposal_idx" ON "proposal_zone_notifications" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "sprint_results_user_id_idx" ON "sprint_results" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "app_crash_logs_user_id_idx" ON "app_crash_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "app_crash_logs_crash_type_idx" ON "app_crash_logs" USING btree ("crash_type");--> statement-breakpoint
CREATE INDEX "app_crash_logs_reported_at_idx" ON "app_crash_logs" USING btree ("reported_at");--> statement-breakpoint
CREATE INDEX "site_visits_created_at_idx" ON "site_visits" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "site_visits_visitor_id_idx" ON "site_visits" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "site_visits_event_idx" ON "site_visits" USING btree ("event");--> statement-breakpoint
CREATE INDEX "site_visits_user_id_idx" ON "site_visits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "weekly_recaps_user_idx" ON "weekly_recaps" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_recaps_user_week_idx" ON "weekly_recaps" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE INDEX "ride_telemetry_user_id_idx" ON "ride_telemetry" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ride_telemetry_session_id_idx" ON "ride_telemetry" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ride_telemetry_ts_idx" ON "ride_telemetry" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "segment_telemetry_curvy_score_idx" ON "segment_telemetry" USING btree ("curvy_score");--> statement-breakpoint
CREATE INDEX "ai_watchdog_log_kind_idx" ON "ai_watchdog_log" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "ai_watchdog_log_status_idx" ON "ai_watchdog_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_watchdog_log_created_idx" ON "ai_watchdog_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "system_health_snapshot_created_idx" ON "system_health_snapshot" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "system_health_snapshot_status_idx" ON "system_health_snapshot" USING btree ("status");--> statement-breakpoint
CREATE INDEX "system_signals_source_metric_idx" ON "system_signals" USING btree ("source","metric");--> statement-breakpoint
CREATE INDEX "system_signals_created_idx" ON "system_signals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "system_signals_severity_created_idx" ON "system_signals" USING btree ("severity","created_at");--> statement-breakpoint
CREATE INDEX "weekly_system_reports_created_idx" ON "weekly_system_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "db_integrity_quarantine_table_idx" ON "db_integrity_quarantine" USING btree ("source_table");--> statement-breakpoint
CREATE INDEX "db_integrity_quarantine_ttl_idx" ON "db_integrity_quarantine" USING btree ("ttl_expires_at");--> statement-breakpoint
CREATE INDEX "db_integrity_runs_run_at_idx" ON "db_integrity_runs" USING btree ("run_at");--> statement-breakpoint
CREATE INDEX "db_integrity_violations_run_idx" ON "db_integrity_violations" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "db_integrity_violations_check_idx" ON "db_integrity_violations" USING btree ("check_id");--> statement-breakpoint
CREATE INDEX "db_integrity_violations_severity_idx" ON "db_integrity_violations" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "db_integrity_violations_status_idx" ON "db_integrity_violations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "db_integrity_violations_hash_idx" ON "db_integrity_violations" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "ai_conversations_admin_idx" ON "ai_conversations" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "ai_conversations_last_msg_idx" ON "ai_conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "ai_conversations_archived_idx" ON "ai_conversations" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "ai_pinned_insights_admin_idx" ON "ai_pinned_insights" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "ai_pinned_insights_conv_idx" ON "ai_pinned_insights" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_conflicts_resolved_idx" ON "ai_conflicts" USING btree ("resolved_at");--> statement-breakpoint
CREATE INDEX "ai_conflicts_type_idx" ON "ai_conflicts" USING btree ("conflict_type");--> statement-breakpoint
CREATE INDEX "ai_conflicts_created_idx" ON "ai_conflicts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_decisions_ainame_type_created_idx" ON "ai_decisions" USING btree ("ai_name","decision_type","created_at");--> statement-breakpoint
CREATE INDEX "ai_decisions_correlation_idx" ON "ai_decisions" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "ai_events_ainame_created_idx" ON "ai_events" USING btree ("ai_name","created_at");--> statement-breakpoint
CREATE INDEX "ai_events_type_created_idx" ON "ai_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "ai_events_correlation_idx" ON "ai_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "ai_events_severity_created_idx" ON "ai_events" USING btree ("severity","created_at");--> statement-breakpoint
ALTER TABLE "biker_zavorrina_matches" ADD CONSTRAINT "biker_zavorrina_matches_biker_motorcycle_id_user_motorcycles_id" FOREIGN KEY ("biker_motorcycle_id") REFERENCES "public"."user_motorcycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biker_zavorrina_matches" ADD CONSTRAINT "biker_zavorrina_matches_wishlist_moto_id_zavorrina_wishlist_mot" FOREIGN KEY ("wishlist_moto_id") REFERENCES "public"."zavorrina_wishlist_motos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_errors" ADD CONSTRAINT "gps_errors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_match_requests" ADD CONSTRAINT "direct_match_requests_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_match_requests" ADD CONSTRAINT "direct_match_requests_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_routes" ADD CONSTRAINT "planned_routes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_preferences" ADD CONSTRAINT "match_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_rejection_stats" ADD CONSTRAINT "gps_rejection_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_profile_matches" ADD CONSTRAINT "proposal_profile_matches_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_profile_matches" ADD CONSTRAINT "proposal_profile_matches_biker_id_users_id_fk" FOREIGN KEY ("biker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_profile_matches" ADD CONSTRAINT "proposal_profile_matches_zavorrina_id_users_id_fk" FOREIGN KEY ("zavorrina_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ota_releases" ADD CONSTRAINT "ota_releases_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ota_releases" ADD CONSTRAINT "ota_releases_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ota_boot_events" ADD CONSTRAINT "ota_boot_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ota_assistant_runs" ADD CONSTRAINT "ota_assistant_runs_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ota_watchdog_reports" ADD CONSTRAINT "ota_watchdog_reports_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ab_events" ADD CONSTRAINT "ab_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coordinate_history_user_id_idx" ON "coordinate_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "coordinate_history_created_at_idx" ON "coordinate_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "event_images_event_idx" ON "event_images" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_participants_user_idx" ON "event_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "events_start_date_idx" ON "events" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "gps_errors_user_id_idx" ON "gps_errors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "proposal_matches_notif_pending_idx" ON "proposal_matches" USING btree ("notification_priority","notified_at");--> statement-breakpoint
CREATE INDEX "proposals_scheduled_at_idx" ON "proposals" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "proposals_search_type_idx" ON "proposals" USING btree ("search_type");--> statement-breakpoint
CREATE INDEX "proposals_club_id_idx" ON "proposals" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "proposals_status_scheduled_idx" ON "proposals" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "proposals_departure_lat_idx" ON "proposals" USING btree ("departure_latitude");--> statement-breakpoint
CREATE INDEX "proposals_departure_lng_idx" ON "proposals" USING btree ("departure_longitude");--> statement-breakpoint
CREATE INDEX "user_motorcycles_brand_idx" ON "user_motorcycles" USING btree ("brand");--> statement-breakpoint
CREATE INDEX "user_motorcycles_brand_model_idx" ON "user_motorcycles" USING btree ("brand","model");--> statement-breakpoint
CREATE INDEX "user_motorcycles_type_idx" ON "user_motorcycles" USING btree ("motorcycle_type");--> statement-breakpoint
CREATE INDEX "user_profiles_latitude_idx" ON "user_profiles" USING btree ("latitude");--> statement-breakpoint
CREATE INDEX "user_profiles_longitude_idx" ON "user_profiles" USING btree ("longitude");--> statement-breakpoint
CREATE INDEX "user_profiles_coords_updated_idx" ON "user_profiles" USING btree ("coordinates_updated_at");--> statement-breakpoint
CREATE INDEX "user_profiles_is_available_idx" ON "user_profiles" USING btree ("is_available");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_is_fake_idx" ON "users" USING btree ("is_fake");--> statement-breakpoint
CREATE INDEX "users_ghost_mode_idx" ON "users" USING btree ("ghost_mode");--> statement-breakpoint
CREATE INDEX "users_country_idx" ON "users" USING btree ("country");--> statement-breakpoint
CREATE INDEX "users_user_type_idx" ON "users" USING btree ("user_type");--> statement-breakpoint
CREATE INDEX "users_active_pool_idx" ON "users" USING btree ("status","is_fake","ghost_mode");--> statement-breakpoint
CREATE INDEX "wishlist_motos_wishlist_idx" ON "zavorrina_wishlist_motos" USING btree ("wishlist_id");--> statement-breakpoint
CREATE INDEX "wishlist_motos_brand_idx" ON "zavorrina_wishlist_motos" USING btree ("brand");--> statement-breakpoint
CREATE INDEX "wishlist_motos_brand_model_idx" ON "zavorrina_wishlist_motos" USING btree ("brand","model");--> statement-breakpoint
CREATE INDEX "wishlist_motos_type_idx" ON "zavorrina_wishlist_motos" USING btree ("motorcycle_type");--> statement-breakpoint
CREATE INDEX "ppm_notif_pending_idx" ON "proposal_profile_matches" USING btree ("notification_priority","notified_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ppm_biker_zavorrina_active_idx" ON "proposal_profile_matches" USING btree ("biker_id","zavorrina_id") WHERE "proposal_profile_matches"."status" = 'new';--> statement-breakpoint
CREATE INDEX "road_hazards_lat_lng_idx" ON "road_hazards" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "road_hazards_expires_at_idx" ON "road_hazards" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "road_hazards_user_id_idx" ON "road_hazards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "road_hazard_confirms_hazard_idx" ON "road_hazard_confirms" USING btree ("hazard_id");--> statement-breakpoint
CREATE INDEX "road_hazard_confirms_unique_idx" ON "road_hazard_confirms" USING btree ("hazard_id","user_id");--> statement-breakpoint
CREATE INDEX "road_hazard_comments_hazard_idx" ON "road_hazard_comments" USING btree ("hazard_id");--> statement-breakpoint
CREATE UNIQUE INDEX "road_hazard_comments_unique_idx" ON "road_hazard_comments" USING btree ("hazard_id","user_id");--> statement-breakpoint
CREATE INDEX "ota_boot_events_release_id_idx" ON "ota_boot_events" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "ota_boot_events_event_type_idx" ON "ota_boot_events" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ota_boot_events_unique_per_device" ON "ota_boot_events" USING btree ("release_id","device_id","event_type");--> statement-breakpoint
CREATE INDEX "ota_assistant_runs_started_at_idx" ON "ota_assistant_runs" USING btree ("started_at");