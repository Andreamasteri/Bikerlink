-- Task #51 — Conversazione osservabile a più agenti (Horus/Bowie/Quebracho).
--
-- 1) Estende ai_call_logs con l'informazione di "superficie" (chat diretta vs
--    conversazione di gruppo) + un riferimento alla conversazione di gruppo, così
--    il monitoraggio admin (ai/metrics) può filtrare i turni di gruppo da quelli
--    di chat diretta. surface NULL = legacy, trattato come "direct".
ALTER TABLE "ai_call_logs" ADD COLUMN IF NOT EXISTS "surface" varchar(16);
--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD COLUMN IF NOT EXISTS "group_conversation_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_call_logs_surface_idx" ON "ai_call_logs" ("surface");
--> statement-breakpoint
-- 2) Conversazione di gruppo: argomento proposto, partecipanti (ordine di turno),
--    numero massimo di turni, conteggio dei turni completati, stato del ciclo.
CREATE TABLE IF NOT EXISTS "ai_group_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "topic" text NOT NULL,
  "participants" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "max_turns" integer NOT NULL DEFAULT 6,
  "turn_count" integer NOT NULL DEFAULT 0,
  "status" varchar(16) NOT NULL DEFAULT 'running',
  "created_by" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "ended_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_group_conversations_created_at_idx" ON "ai_group_conversations" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_group_conversations_status_idx" ON "ai_group_conversations" ("status", "created_at" DESC);
--> statement-breakpoint
-- 3) Turni completati (persistiti a fine turno). (conversation_id, turn_index)
--    UNIQUE così la ripresa non può duplicare un turno già scritto.
CREATE TABLE IF NOT EXISTS "ai_group_conversation_turns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "ai_group_conversations"("id") ON DELETE CASCADE,
  "turn_index" integer NOT NULL,
  "persona" varchar(16) NOT NULL,
  "content" text NOT NULL,
  "provider" varchar(40),
  "model_id" varchar(100),
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_group_conversation_turns_conv_turn_key" ON "ai_group_conversation_turns" ("conversation_id", "turn_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_group_conversation_turns_conv_idx" ON "ai_group_conversation_turns" ("conversation_id", "turn_index");
