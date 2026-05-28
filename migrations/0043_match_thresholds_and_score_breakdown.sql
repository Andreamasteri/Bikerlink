-- Task #2513 — Matching scoring per tag overlap.
-- 1) Tabella match_thresholds: soglia Jaccard configurabile per categoria.
-- 2) Colonna score_breakdown jsonb sulle tabelle match per persistere lo
--    score per categoria (musica/stile/tipo_moto) e abilitare il calcolo
--    "Supermatch" via N categorie sopra soglia.
-- 3) Setting globale match_supermatch_min_categories (default 3).

CREATE TABLE IF NOT EXISTS "match_thresholds" (
  "category" varchar(40) PRIMARY KEY,
  "jaccard_threshold" double precision NOT NULL DEFAULT 0.3,
  "min_common_tags" integer NOT NULL DEFAULT 1,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

INSERT INTO "match_thresholds" ("category", "jaccard_threshold", "min_common_tags") VALUES
  ('musica',      0.25, 1),
  ('stile_guida', 0.30, 1),
  ('tipo_moto',   0.30, 1)
ON CONFLICT ("category") DO NOTHING;
--> statement-breakpoint

ALTER TABLE "biker_biker_matches"
  ADD COLUMN IF NOT EXISTS "score_breakdown" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint

ALTER TABLE "biker_zavorrina_matches"
  ADD COLUMN IF NOT EXISTS "score_breakdown" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint

INSERT INTO "app_settings" ("key", "value", "value_json", "updated_at")
VALUES ('match_supermatch_min_categories', '3', NULL, now())
ON CONFLICT ("key") DO NOTHING;
