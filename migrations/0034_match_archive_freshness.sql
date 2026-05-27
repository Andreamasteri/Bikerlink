-- Task 2524: Decay e Freshness dei Match
-- Aggiunge campo archived_at per archiviazione soft dei match vecchi.

ALTER TABLE biker_zavorrina_matches
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS bz_matches_archived_at_idx
  ON biker_zavorrina_matches (archived_at);

ALTER TABLE biker_biker_matches
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS bb_matches_archived_at_idx
  ON biker_biker_matches (archived_at);

ALTER TABLE proposal_profile_matches
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS ppm_archived_at_idx
  ON proposal_profile_matches (archived_at);

ALTER TABLE proposal_matches
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS proposal_matches_archived_at_idx
  ON proposal_matches (archived_at);

-- Default settings per freshness/decay (in giorni).
INSERT INTO app_settings (key, value, updated_at) VALUES
  ('match_freshness_halflife_generic_days', '7', NOW()),
  ('match_freshness_halflife_proposal_days', '2', NOW()),
  ('match_archive_after_days', '30', NOW())
ON CONFLICT (key) DO NOTHING;
