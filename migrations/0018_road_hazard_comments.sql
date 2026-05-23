CREATE TABLE IF NOT EXISTS road_hazard_comments (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  hazard_id VARCHAR(36) NOT NULL REFERENCES road_hazards(id) ON DELETE CASCADE,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text VARCHAR(140) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS road_hazard_comments_unique_idx ON road_hazard_comments(hazard_id, user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS road_hazard_comments_hazard_idx ON road_hazard_comments(hazard_id);
