CREATE TABLE IF NOT EXISTS "user_devices" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "model" varchar(100) NOT NULL,
  "platform" varchar(16),
  "os_version" varchar(50),
  "first_seen_at" timestamp NOT NULL DEFAULT now(),
  "last_seen_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "user_devices_user_id_idx" ON "user_devices" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "user_devices_user_model_uq" ON "user_devices" ("user_id", "model");

ALTER TABLE "feedback_tickets" ADD COLUMN IF NOT EXISTS "device_info" jsonb;
