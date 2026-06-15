-- Diagnostic reports: stores results of client-side self-test suites.
-- triggeredBy: 'auto' | 'admin' | 'user'
CREATE TABLE IF NOT EXISTS diagnostic_reports (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
  triggered_by VARCHAR(20) NOT NULL DEFAULT 'auto',
  app_version VARCHAR(50),
  platform VARCHAR(20),
  device_model VARCHAR(100),
  run_at TIMESTAMP NOT NULL DEFAULT now(),
  sentry_event_id VARCHAR(100),
  summary JSONB,
  results JSONB
);

CREATE INDEX IF NOT EXISTS diagnostic_reports_user_id_idx ON diagnostic_reports(user_id);
CREATE INDEX IF NOT EXISTS diagnostic_reports_run_at_idx ON diagnostic_reports(run_at);

-- Diagnostic queue: pending remote diagnostics for offline users (expire after 24h).
CREATE TABLE IF NOT EXISTS diagnostic_queue (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  commanded_by VARCHAR(36),
  show_banner BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at TIMESTAMP NOT NULL,
  executed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS diagnostic_queue_user_id_idx ON diagnostic_queue(user_id);
