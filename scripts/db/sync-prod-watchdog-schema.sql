-- Task #2677 — Allinea schema DB produzione (watchdog + match_preferences)
--
-- Script SQL idempotente che ricrea su prod le 7 tabelle del cluster watchdog +
-- db-integrity e le 2 colonne aggiunte a match_preferences. Riferimento autoritativo:
-- commit 365efed4 (task #2662), che ha applicato le stesse DDL al DB di dev.
--
-- Idempotente: usa CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS. Può essere rieseguito senza danni.
--
-- Schema drizzle di riferimento:
--   shared/db/watchdog.ts      (system_signals, system_health_snapshot,
--                               ai_watchdog_log, ai_watchdog_event_state,
--                               weekly_system_reports)
--   shared/db/db-integrity.ts  (db_integrity_runs, db_integrity_violations,
--                               db_integrity_quarantine)
--   shared/db/matching.ts      (match_preferences.time_overlap, .weekly_recap)

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) system_signals (+ 3 indici)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_signals (
  id         VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  source     VARCHAR(40) NOT NULL,
  metric     VARCHAR(80) NOT NULL,
  value      DOUBLE PRECISION,
  unit       VARCHAR(20),
  severity   VARCHAR(10) NOT NULL DEFAULT 'info',
  details    JSONB,
  created_at TIMESTAMP   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS system_signals_source_metric_idx
  ON system_signals (source, metric);
CREATE INDEX IF NOT EXISTS system_signals_created_idx
  ON system_signals (created_at);
CREATE INDEX IF NOT EXISTS system_signals_severity_created_idx
  ON system_signals (severity, created_at);

-- ---------------------------------------------------------------------------
-- 2) system_health_snapshot (+ 2 indici)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_health_snapshot (
  id         VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  status     VARCHAR(10) NOT NULL,
  score      INTEGER     NOT NULL DEFAULT 100,
  problems   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  metrics    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS system_health_snapshot_created_idx
  ON system_health_snapshot (created_at);
CREATE INDEX IF NOT EXISTS system_health_snapshot_status_idx
  ON system_health_snapshot (status);

-- ---------------------------------------------------------------------------
-- 3) ai_watchdog_log (+ 3 indici)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_watchdog_log (
  id                   VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key            VARCHAR(180) NOT NULL,
  kind                 VARCHAR(30)  NOT NULL,
  scope                VARCHAR(60),
  status               VARCHAR(20)  NOT NULL DEFAULT 'ok',
  summary              TEXT,
  details              JSONB,
  proposal_id          VARCHAR(36),
  accepted_by_admin_id VARCHAR(36),
  accepted_at          TIMESTAMP,
  rejected_by_admin_id VARCHAR(36),
  rejected_at          TIMESTAMP,
  reject_reason        VARCHAR(300),
  cost_usd             DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at           TIMESTAMP    NOT NULL DEFAULT NOW()
);
ALTER TABLE ai_watchdog_log
  ADD COLUMN IF NOT EXISTS event_key VARCHAR(180);
UPDATE ai_watchdog_log
SET event_key = LEFT(kind || ':' || COALESCE(scope, 'global'), 180)
WHERE event_key IS NULL;
ALTER TABLE ai_watchdog_log
  ALTER COLUMN event_key SET NOT NULL;
CREATE INDEX IF NOT EXISTS ai_watchdog_log_event_created_idx
  ON ai_watchdog_log (event_key, created_at, id);
CREATE INDEX IF NOT EXISTS ai_watchdog_log_kind_idx    ON ai_watchdog_log (kind);
CREATE INDEX IF NOT EXISTS ai_watchdog_log_status_idx  ON ai_watchdog_log (status);
CREATE INDEX IF NOT EXISTS ai_watchdog_log_created_idx ON ai_watchdog_log (created_at);

-- ---------------------------------------------------------------------------
-- 3b) ai_watchdog_event_state (dedup persistente)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_watchdog_event_state (
  event_key    VARCHAR(180) PRIMARY KEY,
  last_status  VARCHAR(20) NOT NULL,
  last_log_id  VARCHAR(36),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_watchdog_event_state_updated_idx
  ON ai_watchdog_event_state (updated_at);
INSERT INTO ai_watchdog_event_state (event_key, last_status, last_log_id, updated_at)
SELECT event_key, status, id, created_at
FROM (
  SELECT
    event_key,
    status,
    id,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY event_key
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM ai_watchdog_log
) latest
WHERE rn = 1
ON CONFLICT (event_key) DO UPDATE SET
  last_status = EXCLUDED.last_status,
  last_log_id = EXCLUDED.last_log_id,
  updated_at = EXCLUDED.updated_at;

-- ---------------------------------------------------------------------------
-- 4) weekly_system_reports (+ 1 indice, unique su week_start)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_system_reports (
  id         VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start VARCHAR(10) NOT NULL UNIQUE,
  payload    JSONB       NOT NULL,
  model_used VARCHAR(80),
  cost_usd   DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMP   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS weekly_system_reports_created_idx
  ON weekly_system_reports (created_at);

-- ---------------------------------------------------------------------------
-- 5) db_integrity_runs (+ 1 indice)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS db_integrity_runs (
  id               VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger          VARCHAR(20) NOT NULL DEFAULT 'manual',
  run_at           TIMESTAMP   NOT NULL DEFAULT NOW(),
  duration_ms      INTEGER     NOT NULL DEFAULT 0,
  checks_run       INTEGER     NOT NULL DEFAULT 0,
  violations_found INTEGER     NOT NULL DEFAULT 0,
  auto_fixed       INTEGER     NOT NULL DEFAULT 0,
  manual_pending   INTEGER     NOT NULL DEFAULT 0,
  expensive        BOOLEAN     NOT NULL DEFAULT FALSE,
  notes            TEXT
);
CREATE INDEX IF NOT EXISTS db_integrity_runs_run_at_idx
  ON db_integrity_runs (run_at);

-- ---------------------------------------------------------------------------
-- 6) db_integrity_violations (+ 5 indici)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS db_integrity_violations (
  id                   VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id               VARCHAR(36) NOT NULL,
  check_id             VARCHAR(80) NOT NULL,
  check_name           VARCHAR(160) NOT NULL,
  severity             VARCHAR(10) NOT NULL,
  category             VARCHAR(40) NOT NULL,
  count                INTEGER     NOT NULL DEFAULT 0,
  sample               JSONB       NOT NULL DEFAULT '[]'::jsonb,
  details              JSONB,
  hash                 VARCHAR(64) NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'open',
  auto_fix_applied     BOOLEAN     NOT NULL DEFAULT FALSE,
  auto_fix_summary     TEXT,
  ai_explain           JSONB,
  ai_explain_cost_usd  DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at           TIMESTAMP   NOT NULL DEFAULT NOW(),
  resolved_at          TIMESTAMP
);
CREATE INDEX IF NOT EXISTS db_integrity_violations_run_idx       ON db_integrity_violations (run_id);
CREATE INDEX IF NOT EXISTS db_integrity_violations_check_idx     ON db_integrity_violations (check_id);
CREATE INDEX IF NOT EXISTS db_integrity_violations_severity_idx  ON db_integrity_violations (severity);
CREATE INDEX IF NOT EXISTS db_integrity_violations_status_idx    ON db_integrity_violations (status);
CREATE INDEX IF NOT EXISTS db_integrity_violations_hash_idx      ON db_integrity_violations (hash);

-- ---------------------------------------------------------------------------
-- 7) db_integrity_quarantine (+ 2 indici)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS db_integrity_quarantine (
  id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  violation_id    VARCHAR(36),
  source_table    VARCHAR(80) NOT NULL,
  source_pk       VARCHAR(80) NOT NULL,
  payload         JSONB       NOT NULL,
  reason          TEXT,
  ttl_expires_at  TIMESTAMP   NOT NULL,
  restored_at     TIMESTAMP,
  purged_at       TIMESTAMP,
  created_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS db_integrity_quarantine_table_idx
  ON db_integrity_quarantine (source_table);
CREATE INDEX IF NOT EXISTS db_integrity_quarantine_ttl_idx
  ON db_integrity_quarantine (ttl_expires_at);

-- ---------------------------------------------------------------------------
-- 8) match_preferences — colonne mancanti
-- ---------------------------------------------------------------------------
ALTER TABLE match_preferences
  ADD COLUMN IF NOT EXISTS time_overlap BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE match_preferences
  ADD COLUMN IF NOT EXISTS weekly_recap BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;
