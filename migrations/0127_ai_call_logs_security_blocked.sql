-- Task #5222 — Bowie Terminal: filtro di sicurezza output AI.
--
-- Aggiunge ai_call_logs.security_blocked: true quando il filtro server-side ha
-- intercettato un tentativo di leak di credenziali/token/env var nell'output di
-- una persona AI (Bowie/Horus/Ares). La risposta verso il client viene
-- sostituita con un messaggio di rifiuto; questa colonna tiene traccia
-- dell'attempt per audit/diagnostica.
--
-- NOT NULL DEFAULT false: le righe storiche e quelle normali restano false,
-- nessun backfill necessario. L'indice parziale serve a contare/isolare
-- velocemente i blocchi senza scansionare l'intera tabella.

ALTER TABLE "ai_call_logs" ADD COLUMN IF NOT EXISTS "security_blocked" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
DROP INDEX IF EXISTS "ai_call_logs_security_blocked_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_call_logs_security_blocked_idx" ON "ai_call_logs" ("security_blocked") WHERE security_blocked = true;
