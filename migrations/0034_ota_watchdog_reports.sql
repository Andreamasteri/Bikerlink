-- Task #2535 — Snapshot persistente del watchdog post-publish (AI Orchestrator OTA)
CREATE TABLE IF NOT EXISTS ota_watchdog_reports (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at timestamp NOT NULL DEFAULT now(),
  triggered_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  candidate_count integer NOT NULL DEFAULT 0,
  payload text NOT NULL,
  threshold integer NOT NULL,
  min_downloads integer NOT NULL
);
CREATE INDEX IF NOT EXISTS ota_watchdog_reports_generated_at_idx
  ON ota_watchdog_reports (generated_at);
