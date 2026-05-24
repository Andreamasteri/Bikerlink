DELETE FROM "app_crash_logs"
WHERE "id" NOT IN (
  SELECT DISTINCT ON ("user_id", "session_id", "crash_type") "id"
  FROM "app_crash_logs"
  ORDER BY "user_id", "session_id", "crash_type", "reported_at" DESC
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "app_crash_logs_uniq_session_crash"
  ON "app_crash_logs" USING btree ("user_id", "session_id", "crash_type");
