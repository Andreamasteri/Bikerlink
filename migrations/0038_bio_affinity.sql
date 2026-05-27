-- Task #2515 — Bio affinity (embeddings su bio utente)
-- Aggiunge:
--  1. Toggle preferenza `bio_affinity` su match_preferences (default true)
--  2. Tabella `bio_affinity_matches` con unique simmetrico su (userA,userB)

ALTER TABLE "match_preferences"
  ADD COLUMN IF NOT EXISTS "bio_affinity" boolean NOT NULL DEFAULT true;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bio_affinity_matches" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_a_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "user_b_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "similarity" double precision NOT NULL,
  "model" varchar(80),
  "status" varchar(20) NOT NULL DEFAULT 'new',
  "archived_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "bio_affinity_user_a_idx"
  ON "bio_affinity_matches" ("user_a_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bio_affinity_user_b_idx"
  ON "bio_affinity_matches" ("user_b_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bio_affinity_symmetric_idx"
  ON "bio_affinity_matches" (LEAST("user_a_id", "user_b_id"), GREATEST("user_a_id", "user_b_id"));
