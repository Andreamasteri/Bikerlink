-- Unique constraint on (session_id, crash_type) so that if the same session
-- is reported multiple times (client re-init race), only one row is kept.
-- The existing .onConflictDoNothing() in crash-logs.ts now becomes effective.
--
-- Safety: deduplicate any existing (session_id, crash_type) pairs first,
-- keeping the row with the latest reported_at (highest id on tie).
-- Uses ROW_NUMBER() CTE instead of NOT IN to be NULL-safe and performant.
WITH dupes AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY session_id, crash_type
           ORDER BY reported_at DESC, id DESC
         ) AS rn
  FROM app_crash_logs
)
DELETE FROM app_crash_logs
WHERE id IN (SELECT id FROM dupes WHERE rn > 1);

--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_crash_logs_session_id_crash_type_key'
      AND conrelid = 'app_crash_logs'::regclass
  ) THEN
    ALTER TABLE app_crash_logs
      ADD CONSTRAINT app_crash_logs_session_id_crash_type_key
      UNIQUE (session_id, crash_type);
  END IF;
END $$;
