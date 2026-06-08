ALTER TABLE proposal_profile_matches
  ADD COLUMN IF NOT EXISTS reset_count integer NOT NULL DEFAULT 0;
