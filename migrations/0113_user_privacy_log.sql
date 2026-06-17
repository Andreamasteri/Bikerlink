CREATE TABLE IF NOT EXISTS "user_privacy_log" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "setting_key" varchar(64) NOT NULL,
  "new_value" boolean NOT NULL,
  "changed_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_privacy_log_user_id_changed_at_idx" ON "user_privacy_log" ("user_id", "changed_at" DESC);
