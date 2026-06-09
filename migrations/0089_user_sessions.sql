CREATE TABLE IF NOT EXISTS user_sessions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_heartbeat_at TIMESTAMP,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  exit_type VARCHAR(20) CHECK (exit_type IN ('background', 'logout', 'crash')),
  device_model VARCHAR(100),
  platform VARCHAR(16),
  app_version VARCHAR(32)
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS user_sessions_started_at_idx ON user_sessions(started_at);
CREATE INDEX IF NOT EXISTS user_sessions_ended_at_idx ON user_sessions(ended_at) WHERE ended_at IS NULL;
