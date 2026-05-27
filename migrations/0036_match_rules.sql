CREATE TABLE IF NOT EXISTS "match_rules" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "search_type_a" varchar(60) NOT NULL,
  "search_type_b" varchar(60) NOT NULL,
  "compatible" boolean NOT NULL DEFAULT true,
  "weight" double precision NOT NULL DEFAULT 1,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "match_rules_pair_unique_idx" ON "match_rules" ("search_type_a", "search_type_b");
--> statement-breakpoint
INSERT INTO "match_rules" ("search_type_a", "search_type_b", "compatible", "weight", "notes") VALUES
  ('find_a_friend', 'find_a_friend', true, 1, 'Seed iniziale (migrazione da MATCH_RULES hardcoded)'),
  ('find_a_guest',  'find_a_biker',  true, 1, 'Seed iniziale (migrazione da MATCH_RULES hardcoded)'),
  ('hitcher',       'hitchhiker',    true, 1, 'Seed iniziale (migrazione da MATCH_RULES hardcoded)'),
  ('find_a_guest',  'hitchhiker',    true, 1, 'Seed iniziale (migrazione da MATCH_RULES hardcoded)'),
  ('hitcher',       'find_a_biker',  true, 1, 'Seed iniziale (migrazione da MATCH_RULES hardcoded)')
ON CONFLICT ("search_type_a", "search_type_b") DO NOTHING;
