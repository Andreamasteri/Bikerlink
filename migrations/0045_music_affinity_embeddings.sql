-- Task #2516 — Music affinity (embeddings su musica e interessi)

-- 1. Toggle preferenza dedicato.
ALTER TABLE "match_preferences"
  ADD COLUMN IF NOT EXISTS "music_affinity" boolean NOT NULL DEFAULT true;
--> statement-breakpoint

-- 2. Campo libero gusti musicali sul profilo utente.
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "music_taste_text" text;
--> statement-breakpoint

-- 3. Tabella match dedicati (combined = tagScore*w1 + embeddingScore*w2).
CREATE TABLE IF NOT EXISTS "music_affinity_matches" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_a_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "user_b_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tag_score" double precision NOT NULL DEFAULT 0,
  "embedding_score" double precision NOT NULL DEFAULT 0,
  "combined_score" double precision NOT NULL,
  "tag_common" integer NOT NULL DEFAULT 0,
  "status" varchar(20) NOT NULL DEFAULT 'new',
  "notification_priority" varchar(10) NOT NULL DEFAULT 'normal',
  "notified_at" timestamp,
  "archived_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "music_affinity_user_a_idx"
  ON "music_affinity_matches" ("user_a_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "music_affinity_user_b_idx"
  ON "music_affinity_matches" ("user_b_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "music_affinity_archived_at_idx"
  ON "music_affinity_matches" ("archived_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "music_affinity_symmetric_idx"
  ON "music_affinity_matches"
  (LEAST("user_a_id", "user_b_id"), GREATEST("user_a_id", "user_b_id"));
--> statement-breakpoint

-- 4. Soglie configurabili runtime (riusa match_thresholds di task #2513).
--    Combined score minimo richiesto perché venga creato un match.
INSERT INTO "match_thresholds" ("category", "jaccard_threshold", "min_common_tags")
VALUES ('music_taste_combined', 0.55, 0)
ON CONFLICT ("category") DO NOTHING;
--> statement-breakpoint

-- 5. Pesi w1 (tag) e w2 (embedding) per il combined score, configurabili
--    dall'admin senza deploy.
INSERT INTO "app_settings" ("key", "value", "updated_at")
VALUES ('match_music_combined_weight_tag', '0.5', now())
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "app_settings" ("key", "value", "updated_at")
VALUES ('match_music_combined_weight_embedding', '0.5', now())
ON CONFLICT ("key") DO NOTHING;
