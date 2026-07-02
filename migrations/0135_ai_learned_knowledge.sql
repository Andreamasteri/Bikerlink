-- Task #5322 — Conoscenza auto-appresa (auto-learning LOCALE, solo Ollama).
--
-- Lo scheduler server/ai/assistant/auto-learn.ts gira in Phase 5 usando SOLO il
-- modello Ollama locale di Bowie (nessun costo cloud). Esplora in sola lettura le
-- lacune (ai_knowledge_gaps) e i flussi noti dell'app, genera una risposta e la
-- persiste qui. Queste voci alimentano il RAG (via `extra`) SENZA toccare la
-- knowledge base statica. Dedup su `fingerprint` (UNIQUE): un secondo ciclo sulla
-- stessa domanda aggiorna la risposta invece di duplicare la riga.
CREATE TABLE IF NOT EXISTS "ai_learned_knowledge" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fingerprint" varchar(64) NOT NULL,
  "question" text NOT NULL,
  "answer" text NOT NULL,
  "persona" varchar(16),
  "source" varchar(24) NOT NULL DEFAULT 'auto-learn:gap',
  "model_id" varchar(100),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_learned_knowledge_fingerprint_key" ON "ai_learned_knowledge" ("fingerprint");
--> statement-breakpoint
DROP INDEX IF EXISTS "ai_learned_knowledge_updated_at_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_learned_knowledge_updated_at_idx" ON "ai_learned_knowledge" ("updated_at" DESC);
