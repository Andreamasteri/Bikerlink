-- Task #2535 — AI Orchestrator OTA
-- Tabella per audit/log delle interazioni con l'assistente OTA.

CREATE TABLE IF NOT EXISTS "ota_assistant_runs" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "admin_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "prompt" text NOT NULL,
  "response" text,
  "tool_calls" jsonb,
  "status" varchar(20) NOT NULL DEFAULT 'completed',
  "error" text,
  "log_path" text,
  "started_at" timestamp NOT NULL DEFAULT now(),
  "finished_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ota_assistant_runs_started_at_idx" ON "ota_assistant_runs" ("started_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ota_assistant_runs_admin_id_idx" ON "ota_assistant_runs" ("admin_id");
