-- Task #2698 — AI Assistant per utenti normali.
-- Aggiunge la colonna opt-out per utente e la tabella telemetria assistente.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "assistant_prefs" jsonb DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "ai_assistant_telemetry" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_type" varchar(40) NOT NULL,
  "platform" varchar(16) NOT NULL,
  "user_role" varchar(20),
  "user_id" varchar(36),
  "payload" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ai_assistant_telemetry_created_at_idx"
  ON "ai_assistant_telemetry" ("created_at");
CREATE INDEX IF NOT EXISTS "ai_assistant_telemetry_event_platform_idx"
  ON "ai_assistant_telemetry" ("event_type", "platform");
