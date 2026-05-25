CREATE TABLE IF NOT EXISTS maps_quota (
  provider_id VARCHAR(100) NOT NULL,
  year_month  VARCHAR(7)   NOT NULL,
  count       INTEGER      NOT NULL DEFAULT 0,
  updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider_id, year_month)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS maps_quota_provider_idx ON maps_quota (provider_id);
