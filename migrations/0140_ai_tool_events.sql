-- Task #41 — Contatore admin-visibile per timeout/troncamenti dei tool AI
-- (guardTool in server/ai/assistant/tools.ts). Una riga per combinazione
-- (tool, roster, tipo evento), incrementata a ogni occorrenza — non un log
-- riga-per-evento, per restare piccola nel tempo.
CREATE TABLE IF NOT EXISTS "ai_tool_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tool_name" varchar(64) NOT NULL,
  "roster" varchar(16) NOT NULL,
  "event_type" varchar(16) NOT NULL,
  "occurrences" integer NOT NULL DEFAULT 1,
  "last_message" text,
  "last_occurred_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_tool_events_key" ON "ai_tool_events" ("tool_name", "roster", "event_type");
--> statement-breakpoint
DROP INDEX IF EXISTS "ai_tool_events_last_occurred_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_tool_events_last_occurred_idx" ON "ai_tool_events" ("last_occurred_at" DESC);
