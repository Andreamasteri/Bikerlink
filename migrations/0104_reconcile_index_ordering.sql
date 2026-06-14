-- Riconciliazione ordinamento indici DESC (fix loop deploy).
--
-- Causa del loop: il diff drizzle-kit tra lo schema TS (DESC) e il DB prod (ASC)
-- genera sempre gli stessi DROP+CREATE per questi 4 indici a ogni deploy.
-- Il DB prod ha gli indici in ASC perché:
--   - migration 0060 ha ricreato ota_assistant_runs_started_at_idx senza DESC
--   - ai_call_logs_* e ai_conversation_turns_* potrebbero essere ASC in prod
--     a seconda di quando le migration sono state applicate.
--
-- Questa migration porta il DB prod allo stato atteso dallo schema TS
-- (tutti DESC), eliminando il drift permanente.
--
-- Idempotente: DROP IF EXISTS + CREATE IF NOT EXISTS; sicura da eseguire
-- anche se gli indici sono già DESC.

-- ai_call_logs_created_at_idx
DROP INDEX IF EXISTS "ai_call_logs_created_at_idx";
CREATE INDEX IF NOT EXISTS "ai_call_logs_created_at_idx"
  ON "ai_call_logs" ("created_at" DESC);

-- ai_call_logs_provider_idx
DROP INDEX IF EXISTS "ai_call_logs_provider_idx";
CREATE INDEX IF NOT EXISTS "ai_call_logs_provider_idx"
  ON "ai_call_logs" ("provider", "created_at" DESC);

-- ai_conversation_turns_user_id_idx
DROP INDEX IF EXISTS "ai_conversation_turns_user_id_idx";
CREATE INDEX IF NOT EXISTS "ai_conversation_turns_user_id_idx"
  ON "ai_conversation_turns" ("user_id", "created_at" DESC);

-- ota_assistant_runs_started_at_idx (già fixato da 0103, ma ricreato
-- qui per garanzia nel caso 0103 non fosse mai girato su un dato env)
DROP INDEX IF EXISTS "ota_assistant_runs_started_at_idx";
CREATE INDEX IF NOT EXISTS "ota_assistant_runs_started_at_idx"
  ON "ota_assistant_runs" ("started_at" DESC);
