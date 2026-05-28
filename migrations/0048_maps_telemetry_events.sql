-- Task #2686 — Maps AI Watchdog: tabella eventi telemetria mappe client
CREATE TABLE IF NOT EXISTS "maps_telemetry_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36),
  "event" varchar(40) NOT NULL,
  "renderer" varchar(30),
  "component" varchar(60),
  "engine" varchar(30),
  "duration_ms" integer,
  "error_message" varchar(500),
  "platform" varchar(20),
  "app_version" varchar(30),
  "details" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "maps_telemetry_event_created_idx"
  ON "maps_telemetry_events" ("event", "created_at");
CREATE INDEX IF NOT EXISTS "maps_telemetry_renderer_created_idx"
  ON "maps_telemetry_events" ("renderer", "created_at");
CREATE INDEX IF NOT EXISTS "maps_telemetry_created_idx"
  ON "maps_telemetry_events" ("created_at");
