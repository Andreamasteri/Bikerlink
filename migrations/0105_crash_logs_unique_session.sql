-- NO-OP migration (constraint removed — see 0108_crash_logs_drop_unique_constraint.sql)
--
-- Original intent: add a UNIQUE constraint on (session_id, crash_type) so that
-- onConflictDoNothing() in crash-logs.ts would be DB-enforced.
--
-- Why this is now a no-op:
--   Migration 0108 drops the very same constraint immediately after because
--   prod rows contain duplicates and PostgreSQL refuses to build the UNIQUE index.
--   App-level deduplication via onConflictDoNothing() is sufficient.
--
-- The dedup CTE below is kept: it is safe, idempotent, and cleans up any stale
-- duplicates in dev environments without the risk of a constraint failure.
-- Reference for the safe ROW_NUMBER() dedup pattern (see check-migration-unsafe-dedup.ts).

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
