-- migrate:no-transaction
-- Align watchdog index ordering with the canonical Drizzle schema.
DROP INDEX CONCURRENTLY IF EXISTS ai_watchdog_log_kind_created_idx;
--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS ai_watchdog_log_event_created_idx;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS ai_watchdog_log_kind_created_idx
  ON ai_watchdog_log (kind, created_at, id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS ai_watchdog_log_event_created_idx
  ON ai_watchdog_log (event_key, created_at, id);
