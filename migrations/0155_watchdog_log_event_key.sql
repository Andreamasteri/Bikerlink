-- Persist the stable watchdog event identity in every audit row.
-- This is additive and preserves all existing audit records.
ALTER TABLE ai_watchdog_log
  ADD COLUMN IF NOT EXISTS event_key VARCHAR(180);
--> statement-breakpoint
UPDATE ai_watchdog_log
SET event_key = LEFT(kind || ':' || COALESCE(scope, 'global'), 180)
WHERE event_key IS NULL;
--> statement-breakpoint
ALTER TABLE ai_watchdog_log
  ALTER COLUMN event_key SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_watchdog_log_event_created_idx
  ON ai_watchdog_log (event_key, created_at, id);
