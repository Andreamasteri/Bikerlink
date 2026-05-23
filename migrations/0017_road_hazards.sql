CREATE TABLE IF NOT EXISTS road_hazards (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  description VARCHAR(140),
  confirm_count INTEGER NOT NULL DEFAULT 0,
  is_approved BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS road_hazard_confirms (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  hazard_id VARCHAR(36) NOT NULL REFERENCES road_hazards(id) ON DELETE CASCADE,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS road_hazards_lat_lng_idx ON road_hazards(lat, lng);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS road_hazards_expires_at_idx ON road_hazards(expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS road_hazards_user_id_idx ON road_hazards(user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS road_hazard_confirms_hazard_idx ON road_hazard_confirms(hazard_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS road_hazard_confirms_unique_idx ON road_hazard_confirms(hazard_id, user_id);
