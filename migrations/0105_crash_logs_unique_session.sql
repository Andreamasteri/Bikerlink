-- Unique constraint on (session_id, crash_type) so that if the same session
-- is reported multiple times (client re-init race), only one row is kept.
-- The existing .onConflictDoNothing() in crash-logs.ts now becomes effective.
--
-- Safety: deduplicate any existing (session_id, crash_type) pairs first,
-- keeping the row with the latest reported_at (highest id on tie).
-- Without this step, ALTER TABLE fails with 23505 if duplicates exist in prod.
DELETE FROM app_crash_logs
WHERE id NOT IN (
  SELECT DISTINCT ON (session_id, crash_type) id
  FROM app_crash_logs
  ORDER BY session_id, crash_type, reported_at DESC, id DESC
);

ALTER TABLE app_crash_logs
  ADD CONSTRAINT app_crash_logs_session_id_crash_type_key
  UNIQUE (session_id, crash_type);
