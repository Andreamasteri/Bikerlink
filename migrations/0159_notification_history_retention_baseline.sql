-- Task #4436: establish the retention baseline before the application accepts pushes.
-- Existing notification_history rows are legacy data and remain untouched.
-- The atomic insert makes repeated deploys and concurrent boot paths idempotent.
INSERT INTO "app_settings" ("key", "value", "description")
VALUES (
  'notification_history_retention_started_at',
  NOW()::text,
  'Retention baseline for notification_history; excludes legacy rows'
)
ON CONFLICT ("key") DO NOTHING;
