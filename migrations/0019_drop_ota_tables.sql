DROP TABLE IF EXISTS "ota_events";
--> statement-breakpoint
DROP TABLE IF EXISTS "ota_releases";
--> statement-breakpoint
ALTER TABLE "gps_errors" DROP COLUMN IF EXISTS "ota_number";
--> statement-breakpoint
ALTER TABLE "gps_rejection_stats" DROP COLUMN IF EXISTS "last_ota_number";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "last_ota_number";
