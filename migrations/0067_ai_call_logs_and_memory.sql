-- Ollama Enhancement Suite — Task #3017
-- Tabella ai_call_logs: logging completo di ogni chiamata AI (provider, latenza, token, costo, degraded, repair).
-- Tabella ai_conversation_turns: memoria conversazionale persistente per user per l'AI Assistant.

CREATE TABLE IF NOT EXISTS "ai_call_logs" (
  "id"           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "provider"     varchar(40) NOT NULL,
  "model_id"     varchar(100) NOT NULL,
  "tokens_in"    integer     NOT NULL DEFAULT 0,
  "tokens_out"   integer     NOT NULL DEFAULT 0,
  "latency_ms"   integer,
  "cost_usd"     double precision NOT NULL DEFAULT 0,
  "degraded"     boolean     NOT NULL DEFAULT false,
  "error"        text,
  "created_at"   timestamp   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ai_call_logs_created_at_idx"
  ON "ai_call_logs" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_call_logs_provider_idx"
  ON "ai_call_logs" ("provider", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_call_logs_user_id_idx"
  ON "ai_call_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "ai_call_logs_degraded_idx"
  ON "ai_call_logs" ("degraded") WHERE degraded = true;

CREATE TABLE IF NOT EXISTS "ai_conversation_turns" (
  "id"           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role"         varchar(20) NOT NULL,
  "content"      text        NOT NULL,
  "summary_of"   uuid,
  "created_at"   timestamp   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ai_conversation_turns_user_id_idx"
  ON "ai_conversation_turns" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_conversation_turns_summary_of_idx"
  ON "ai_conversation_turns" ("summary_of") WHERE summary_of IS NOT NULL;
