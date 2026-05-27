-- Task #2503 — Sistema OTA con approvazione admin
-- 1) Estende ota_releases con contatori telemetria e opzioni auto-rollback
-- 2) Crea ota_boot_events per tracking per-device (downloaded / boot_success / boot_failure)
-- 3) Elimina il setting ota_direct_apply (toggle rimosso dal pannello)

ALTER TABLE "ota_releases" ADD COLUMN IF NOT EXISTS "boot_success_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "ota_releases" ADD COLUMN IF NOT EXISTS "boot_failure_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "ota_releases" ADD COLUMN IF NOT EXISTS "download_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "ota_releases" ADD COLUMN IF NOT EXISTS "auto_rollback_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "ota_releases" ADD COLUMN IF NOT EXISTS "auto_rollback_threshold" integer NOT NULL DEFAULT 70;
--> statement-breakpoint
ALTER TABLE "ota_releases" ADD COLUMN IF NOT EXISTS "auto_rollback_min_downloads" integer NOT NULL DEFAULT 10;
--> statement-breakpoint
ALTER TABLE "ota_releases" ADD COLUMN IF NOT EXISTS "auto_rollback_window_minutes" integer NOT NULL DEFAULT 30;
--> statement-breakpoint
ALTER TABLE "ota_releases" ADD COLUMN IF NOT EXISTS "auto_rolled_back_at" timestamp;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ota_boot_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "release_id" varchar(36) NOT NULL REFERENCES "ota_releases"("id") ON DELETE CASCADE,
  "user_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "device_id" varchar(80) NOT NULL,
  "event_type" varchar(20) NOT NULL,
  "platform" varchar(16),
  "app_version" varchar(32),
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ota_boot_events_release_id_idx" ON "ota_boot_events"("release_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ota_boot_events_event_type_idx" ON "ota_boot_events"("event_type");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ota_boot_events_unique_per_device" ON "ota_boot_events"("release_id", "device_id", "event_type");
--> statement-breakpoint

DELETE FROM "app_settings" WHERE "key" = 'ota_direct_apply';
