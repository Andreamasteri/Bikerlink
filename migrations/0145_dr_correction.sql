-- Task #47 — DR Correction Engine (deterministic dead-reckoning/GPS correction).
-- Deviation samples per session/user, per-user correction model, and a global
-- cross-user aggregate. NOT an AI/LLM module — unrelated to the routing-health
-- "Horus" agents. `is_test` isolates test/synthetic data from global aggregates.

CREATE TABLE IF NOT EXISTS "dr_deviation_samples" (
  "id" serial PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "session_id" varchar(64) NOT NULL,
  "recorded_at" timestamp NOT NULL DEFAULT now(),
  "blackout_ms" bigint NOT NULL DEFAULT 0,
  "dr_distance_km" double precision NOT NULL DEFAULT 0,
  "gps_distance_km" double precision NOT NULL DEFAULT 0,
  "pos_error_m" double precision NOT NULL DEFAULT 0,
  "est_speed_kmh" double precision NOT NULL DEFAULT 0,
  "obs_speed_kmh" double precision NOT NULL DEFAULT 0,
  "speed_error_kmh" double precision NOT NULL DEFAULT 0,
  "heading_error_deg" double precision,
  "recovery_accuracy_m" double precision NOT NULL DEFAULT 0,
  "recovery_fix_count" integer NOT NULL DEFAULT 0,
  "is_test" boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dr_deviation_samples_user_idx" ON "dr_deviation_samples" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dr_deviation_samples_recorded_idx" ON "dr_deviation_samples" ("recorded_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dr_deviation_samples_user_recorded_idx" ON "dr_deviation_samples" ("user_id", "recorded_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dr_correction_model" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "distance_scale" double precision NOT NULL DEFAULT 1,
  "speed_scale" double precision NOT NULL DEFAULT 1,
  "speed_bias_kmh" double precision NOT NULL DEFAULT 0,
  "heading_bias_deg" double precision NOT NULL DEFAULT 0,
  "sample_count" integer NOT NULL DEFAULT 0,
  "mean_pos_error_m" double precision NOT NULL DEFAULT 0,
  "mean_speed_error_kmh" double precision NOT NULL DEFAULT 0,
  "data_quality" integer NOT NULL DEFAULT 0,
  "is_test" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dr_correction_model_data_quality_idx" ON "dr_correction_model" ("data_quality");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dr_correction_model_updated_idx" ON "dr_correction_model" ("updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dr_correction_global" (
  "id" varchar(16) PRIMARY KEY DEFAULT 'global',
  "distance_scale" double precision NOT NULL DEFAULT 1,
  "speed_scale" double precision NOT NULL DEFAULT 1,
  "speed_bias_kmh" double precision NOT NULL DEFAULT 0,
  "heading_bias_deg" double precision NOT NULL DEFAULT 0,
  "sample_count" integer NOT NULL DEFAULT 0,
  "contributing_users" integer NOT NULL DEFAULT 0,
  "mean_pos_error_m" double precision NOT NULL DEFAULT 0,
  "mean_speed_error_kmh" double precision NOT NULL DEFAULT 0,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
