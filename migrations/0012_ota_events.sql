-- OTA telemetry events: server-side persistence so device error reports
-- and admin/server diagnostics survive backend restarts (was in-memory only).

CREATE TABLE IF NOT EXISTS "ota_events" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "phase" varchar(32) NOT NULL,
  "source" varchar(32),
  "platform" varchar(16),
  "runtime_version" varchar(32) NOT NULL,
  "current_update_id" varchar(64),
  "release_id" varchar(64),
  "error" text,
  "fail_count" integer NOT NULL DEFAULT 0,
  "ip" varchar(64)
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ota_events_created_at_idx" ON "ota_events" ("created_at" DESC);
