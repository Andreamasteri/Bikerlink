-- Task #5331 — Traccia PERSISTENTE delle intro poetiche già mostrate (Horus/Ares)
-- per la conversazione corrente, disaccoppiata dalla persona "attiva" (sticky).
--
-- Perché serve una colonna a parte: commitPersonaAfterTurn CANCELLAVA l'intera
-- riga quando l'utente tornava a Bowie o riceveva un congedo, quindi un flusso
-- Bowie → Horus → Bowie → Horus rifaceva ripartire l'intro di Horus alla seconda
-- entrata (bug rilevato in code review). intro_shown_personas sopravvive al
-- ritorno a Bowie: la riga non viene più cancellata, solo il campo
-- active_persona torna a "bowie" (mantenendo comunque il TTL della sessione).
CREATE TABLE IF NOT EXISTS "ai_conversation_state" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source_app" varchar(32) NOT NULL DEFAULT 'main_app',
  "active_persona" varchar(16) NOT NULL,
  "handoff_reason" varchar(32),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_conversation_state" ADD COLUMN IF NOT EXISTS "intro_shown_personas" jsonb NOT NULL DEFAULT '[]';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_conversation_state_user_source_key" ON "ai_conversation_state" ("user_id", "source_app");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_conversation_state_expires_at_idx" ON "ai_conversation_state" ("expires_at");
