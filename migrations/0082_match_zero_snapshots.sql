CREATE TABLE IF NOT EXISTS match_zero_snapshots (
  id          VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE        NOT NULL,
  total_users   INTEGER     NOT NULL DEFAULT 0,
  zero_match_count INTEGER  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS match_zero_snapshots_date_idx ON match_zero_snapshots (snapshot_date);
