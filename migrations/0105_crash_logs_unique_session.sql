-- Unique constraint on (session_id, crash_type) so that if the same session
-- is reported multiple times (client re-init race), only one row is kept.
-- The existing .onConflictDoNothing() in crash-logs.ts now becomes effective.
ALTER TABLE app_crash_logs
  ADD CONSTRAINT app_crash_logs_session_id_crash_type_key
  UNIQUE (session_id, crash_type);
