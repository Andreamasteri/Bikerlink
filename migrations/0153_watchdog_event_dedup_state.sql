-- Persistent state prevents repeated watchdog alerts/proposals when only
-- summary/details/counters change. Existing audit rows are preserved.
CREATE TABLE IF NOT EXISTS ai_watchdog_event_state (
  event_key VARCHAR(180) PRIMARY KEY,
  last_status VARCHAR(20) NOT NULL,
  last_log_id VARCHAR(36),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_watchdog_event_state_updated_idx
  ON ai_watchdog_event_state (updated_at);
--> statement-breakpoint
-- This migration predates ai_watchdog_log.event_key (added in 0155), so
-- derive the same stable identity from the columns that already exist.
INSERT INTO ai_watchdog_event_state (event_key, last_status, last_log_id, updated_at)
SELECT event_key, status, id, created_at
FROM (
  SELECT
    LEFT(kind || ':' || COALESCE(scope, 'global'), 180) AS event_key,
    status,
    id,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY kind, COALESCE(scope, 'global')
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM ai_watchdog_log
) latest
WHERE rn = 1
ON CONFLICT (event_key) DO UPDATE SET
  last_status = EXCLUDED.last_status,
  last_log_id = EXCLUDED.last_log_id,
  updated_at = EXCLUDED.updated_at;
