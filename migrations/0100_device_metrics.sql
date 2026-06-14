CREATE TABLE IF NOT EXISTS device_metrics (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(64) NOT NULL,
  platform VARCHAR(16),
  memory_used_mb INTEGER,
  memory_total_mb INTEGER,
  battery_level INTEGER,
  battery_state VARCHAR(20),
  app_uptime_seconds INTEGER,
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS device_metrics_user_id_idx ON device_metrics(user_id);
CREATE INDEX IF NOT EXISTS device_metrics_recorded_at_idx ON device_metrics(recorded_at);
