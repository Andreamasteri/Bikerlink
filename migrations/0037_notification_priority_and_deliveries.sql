-- Task #2522 — Matching: Ranking Intelligente delle Notifiche
-- Adds priority + per-recipient delivery tracking + daily push budget +
-- "topMatchesOnly" user preference.

ALTER TABLE biker_zavorrina_matches
  ADD COLUMN IF NOT EXISTS notification_priority VARCHAR(10) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP;

ALTER TABLE biker_biker_matches
  ADD COLUMN IF NOT EXISTS notification_priority VARCHAR(10) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP;

ALTER TABLE proposal_matches
  ADD COLUMN IF NOT EXISTS notification_priority VARCHAR(10) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP;

ALTER TABLE proposal_profile_matches
  ADD COLUMN IF NOT EXISTS notification_priority VARCHAR(10) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS matches_bz_notif_pending_idx
  ON biker_zavorrina_matches (notification_priority, notified_at);
CREATE INDEX IF NOT EXISTS biker_biker_notif_pending_idx
  ON biker_biker_matches (notification_priority, notified_at);

ALTER TABLE match_preferences
  ADD COLUMN IF NOT EXISTS top_matches_only BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS daily_push_counts (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day VARCHAR(10) NOT NULL,
  individual_count INTEGER NOT NULL DEFAULT 0,
  digest_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_push_counts_user_day_idx
  ON daily_push_counts (user_id, day);

CREATE TABLE IF NOT EXISTS match_notification_deliveries (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  match_table VARCHAR(40) NOT NULL,
  match_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL DEFAULT 'push',
  delivered_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS match_notif_deliveries_unique_idx
  ON match_notification_deliveries (match_table, match_id, user_id);
CREATE INDEX IF NOT EXISTS match_notif_deliveries_user_idx
  ON match_notification_deliveries (user_id, delivered_at);
