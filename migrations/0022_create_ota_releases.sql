CREATE TABLE IF NOT EXISTS "ota_releases" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "eas_update_id" varchar(200) NOT NULL UNIQUE,
  "channel" varchar(50) NOT NULL DEFAULT 'staging',
  "runtime_version" varchar(50),
  "message" text,
  "ota_version" varchar(50),
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "published_at" timestamp NOT NULL DEFAULT now(),
  "approved_at" timestamp,
  "approved_by" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "rejected_at" timestamp,
  "rejected_by" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
