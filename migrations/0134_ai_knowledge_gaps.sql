-- Task #5322 — Lacune di conoscenza dell'AI (domande senza risposta pertinente).
--
-- Quando una domanda utente ottiene un punteggio RAG troppo basso la registriamo
-- qui: dà visibilità admin su cosa gli utenti chiedono e l'app non copre, e
-- alimenta lo scheduler di auto-apprendimento LOCALE (Ollama) che genera una
-- risposta e la ributta nel RAG. Dedup su `fingerprint` (UNIQUE): le occorrenze
-- successive incrementano `occurrences` invece di creare righe nuove.
CREATE TABLE IF NOT EXISTS "ai_knowledge_gaps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fingerprint" varchar(64) NOT NULL,
  "question" text NOT NULL,
  "persona" varchar(16),
  "source_app" varchar(32),
  "top_score" double precision,
  "occurrences" integer NOT NULL DEFAULT 1,
  "status" varchar(16) NOT NULL DEFAULT 'open',
  "resolution_note" text,
  "last_seen_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_knowledge_gaps_fingerprint_key" ON "ai_knowledge_gaps" ("fingerprint");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_knowledge_gaps_status_idx" ON "ai_knowledge_gaps" ("status", "last_seen_at" DESC);
