-- Task #2537 — App Integrity tables (estensione del motore #2536).
-- Tabelle generalizzate parallele a db_integrity_* (preserva storico di #2536).
CREATE TABLE IF NOT EXISTS integrity_runs (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger VARCHAR(20) NOT NULL DEFAULT 'manual',
  family VARCHAR(20) NOT NULL DEFAULT 'all',
  run_at TIMESTAMP NOT NULL DEFAULT now(),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  checks_run INTEGER NOT NULL DEFAULT 0,
  violations_found INTEGER NOT NULL DEFAULT 0,
  auto_fixed INTEGER NOT NULL DEFAULT 0,
  manual_pending INTEGER NOT NULL DEFAULT 0,
  expensive BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS integrity_runs_run_at_idx ON integrity_runs(run_at);
CREATE INDEX IF NOT EXISTS integrity_runs_family_idx ON integrity_runs(family);

CREATE TABLE IF NOT EXISTS integrity_violations (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id VARCHAR(36) NOT NULL,
  family VARCHAR(20) NOT NULL,
  check_id VARCHAR(120) NOT NULL,
  check_name VARCHAR(200) NOT NULL,
  severity VARCHAR(10) NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  sample JSONB NOT NULL DEFAULT '[]'::jsonb,
  details JSONB,
  hash VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  auto_fix_applied BOOLEAN NOT NULL DEFAULT FALSE,
  auto_fix_summary TEXT,
  ai_explain JSONB,
  ai_explain_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS integrity_violations_run_idx ON integrity_violations(run_id);
CREATE INDEX IF NOT EXISTS integrity_violations_family_idx ON integrity_violations(family);
CREATE INDEX IF NOT EXISTS integrity_violations_check_idx ON integrity_violations(check_id);
CREATE INDEX IF NOT EXISTS integrity_violations_severity_idx ON integrity_violations(severity);
CREATE INDEX IF NOT EXISTS integrity_violations_status_idx ON integrity_violations(status);
CREATE INDEX IF NOT EXISTS integrity_violations_hash_idx ON integrity_violations(hash);

CREATE TABLE IF NOT EXISTS integrity_quarantine (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  violation_id VARCHAR(36),
  family VARCHAR(20) NOT NULL,
  source_path VARCHAR(500) NOT NULL,
  payload JSONB NOT NULL,
  reason TEXT,
  ttl_expires_at TIMESTAMP NOT NULL,
  restored_at TIMESTAMP,
  purged_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integrity_quarantine_family_idx ON integrity_quarantine(family);
CREATE INDEX IF NOT EXISTS integrity_quarantine_ttl_idx ON integrity_quarantine(ttl_expires_at);
