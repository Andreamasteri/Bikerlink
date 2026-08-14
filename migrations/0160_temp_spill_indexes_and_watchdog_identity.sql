-- migrate:no-transaction
-- Query-path indexes and durable watchdog identity.
-- Safe on populated tables: each index is built concurrently.
ALTER TABLE ai_watchdog_log ADD COLUMN IF NOT EXISTS event_key varchar(180);
--> statement-breakpoint
UPDATE ai_watchdog_log
SET event_key = 'legacy:' || id
WHERE event_key IS NULL;
--> statement-breakpoint
ALTER TABLE ai_watchdog_log ALTER COLUMN event_key SET NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS site_visits_event_created_id_idx
  ON site_visits (event, created_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS site_visits_view_visitor_created_idx
  ON site_visits (visitor_id, created_at DESC)
  WHERE event = 'view';
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS ride_telemetry_user_session_ts_idx
  ON ride_telemetry (user_id, session_id, ts)
  INCLUDE (session_type, lap_name);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS ride_telemetry_pending_session_ts_idx
  ON ride_telemetry (session_id, ts)
  INCLUDE (match_attempts, last_match_attempt_at, user_id)
  WHERE match_status IN ('pending', 'retry');
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS ai_watchdog_log_kind_created_idx
  ON ai_watchdog_log (kind, created_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS ai_watchdog_log_event_created_idx
  ON ai_watchdog_log (event_key, created_at DESC, id DESC);
