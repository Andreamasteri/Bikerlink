CREATE TABLE IF NOT EXISTS resource_samples (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  sampled_at TIMESTAMP NOT NULL DEFAULT NOW(),
  avg_ram_pct INTEGER,
  avg_battery_pct INTEGER,
  online_users INTEGER,
  db_size_mb INTEGER,
  backend_rss_mb INTEGER
);

CREATE INDEX IF NOT EXISTS resource_samples_sampled_at_idx ON resource_samples(sampled_at);
