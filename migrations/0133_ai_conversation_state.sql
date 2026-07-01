-- Task #5322 — Stato "persona attiva" della conversazione (multi-persona).
--
-- Rende l'handoff Bowie ⇄ Horus ⇄ Ares PERSISTENTE tra un turno e l'altro. Senza
-- questa tabella ogni messaggio ripartirebbe da Bowie, perdendo la stickiness
-- (l'utente resta con Horus finché non torna esplicitamente indietro o scade il
-- TTL). Chiave naturale (user_id, source_app): un solo stato attivo per
-- utente/client, aggiornato via upsert. expires_at è il TTL: le righe scadute
-- vengono ignorate in lettura e ripulite dal job di manutenzione.
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
CREATE UNIQUE INDEX IF NOT EXISTS "ai_conversation_state_user_source_key" ON "ai_conversation_state" ("user_id", "source_app");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_conversation_state_expires_at_idx" ON "ai_conversation_state" ("expires_at");
