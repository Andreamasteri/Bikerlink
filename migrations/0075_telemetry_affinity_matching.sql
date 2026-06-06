-- Migration 0075: Telemetry Affinity Matching (Task #3393)
-- Crea il profilo aggregato di telemetria per-utente, la tabella dei match
-- telemetry-affinity e il toggle dedicato in match_preferences.
-- File numerato 0075 perché 0074 è riservato al task "admin panel missing indexes".

-- 1. user_telemetry_profile: statistiche aggregate per-utente da ride_telemetry
CREATE TABLE IF NOT EXISTS user_telemetry_profile (
  user_id varchar(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_sessions integer NOT NULL DEFAULT 0,
  total_km double precision NOT NULL DEFAULT 0,
  avg_speed_kmh double precision NOT NULL DEFAULT 0,
  p75_speed_kmh double precision NOT NULL DEFAULT 0,
  avg_lean_angle double precision NOT NULL DEFAULT 0,
  max_lean_avg double precision NOT NULL DEFAULT 0,
  avg_duration_min double precision NOT NULL DEFAULT 0,
  fraction_morning double precision NOT NULL DEFAULT 0,
  fraction_evening double precision NOT NULL DEFAULT 0,
  speed_bucket varchar(10) NOT NULL DEFAULT 'medium',
  lean_bucket varchar(10) NOT NULL DEFAULT 'touring',
  duration_bucket varchar(10) NOT NULL DEFAULT 'medium',
  data_quality integer NOT NULL DEFAULT 0,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_telemetry_profile_data_quality_idx
  ON user_telemetry_profile (data_quality);
CREATE INDEX IF NOT EXISTS user_telemetry_profile_buckets_idx
  ON user_telemetry_profile (speed_bucket, lean_bucket);

-- 2. telemetry_affinity_matches: match per coppia di utenti
CREATE TABLE IF NOT EXISTS telemetry_affinity_matches (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  algorithmic_score double precision NOT NULL DEFAULT 0,
  embedding_score double precision NOT NULL DEFAULT 0,
  combined_score double precision NOT NULL,
  style_labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'new',
  notification_priority varchar(10) NOT NULL DEFAULT 'normal',
  notified_at timestamp NULL,
  archived_at timestamp NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telemetry_affinity_user_a_idx
  ON telemetry_affinity_matches (user_a_id);
CREATE INDEX IF NOT EXISTS telemetry_affinity_user_b_idx
  ON telemetry_affinity_matches (user_b_id);
CREATE INDEX IF NOT EXISTS telemetry_affinity_combined_score_idx
  ON telemetry_affinity_matches (combined_score);
CREATE INDEX IF NOT EXISTS telemetry_affinity_archived_at_idx
  ON telemetry_affinity_matches (archived_at);
CREATE UNIQUE INDEX IF NOT EXISTS telemetry_affinity_symmetric_idx
  ON telemetry_affinity_matches (
    LEAST(user_a_id, user_b_id),
    GREATEST(user_a_id, user_b_id)
  );

-- 3. toggle dedicato in match_preferences
ALTER TABLE match_preferences
  ADD COLUMN IF NOT EXISTS telemetry_affinity boolean NOT NULL DEFAULT true;
