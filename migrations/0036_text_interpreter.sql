-- Task #2518 — Interprete testo tollerante a errori di battitura.
-- Abilita pg_trgm + unaccent, funzione normalize(), indici GIN trigram
-- sui campi cercati spesso, tabella text_aliases con seed iniziale.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint

-- normalize(): lowercase + unaccent + collassa spazi + rimuove punteggiatura.
-- IMMUTABLE su unaccent() richiede schema-qualified (pg_catalog.unaccent
-- non è IMMUTABLE: usiamo l'estensione 'unaccent' di default).
-- Definita come IMMUTABLE per permettere l'uso negli indici/EXPRESSION GIN.
CREATE OR REPLACE FUNCTION normalize_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT trim(
           regexp_replace(
             regexp_replace(
               lower(public.unaccent('public.unaccent'::regdictionary, coalesce(input, ''))),
               '[^a-z0-9 ]+', ' ', 'g'
             ),
             '\s+', ' ', 'g'
           )
         );
$$;
--> statement-breakpoint

-- Indici GIN trigram sui campi più cercati. Definiti su `normalize_text(col)`
-- perché le query fuzzy (similarity()/%%) usano esattamente quella stessa
-- expression — è l'unico modo per cui Postgres può applicarli.
CREATE INDEX IF NOT EXISTS tags_label_norm_trgm_idx
  ON tags USING gin (normalize_text(label) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tags_slug_norm_trgm_idx
  ON tags USING gin (normalize_text(slug) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS users_nickname_norm_trgm_idx
  ON users USING gin (normalize_text(nickname) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS users_region_norm_trgm_idx
  ON users USING gin (normalize_text(region) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS user_motorcycles_brand_norm_trgm_idx
  ON user_motorcycles USING gin (normalize_text(brand) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS user_motorcycles_model_norm_trgm_idx
  ON user_motorcycles USING gin (normalize_text(model) gin_trgm_ops);
--> statement-breakpoint
-- Drop dei vecchi indici lower()-based se presenti da una versione iniziale
-- della migration: erano inutilizzabili perché le query usano normalize_text().
DROP INDEX IF EXISTS tags_label_trgm_idx;
--> statement-breakpoint
DROP INDEX IF EXISTS tags_slug_trgm_idx;
--> statement-breakpoint
DROP INDEX IF EXISTS users_nickname_trgm_idx;
--> statement-breakpoint
DROP INDEX IF EXISTS users_region_trgm_idx;
--> statement-breakpoint
DROP INDEX IF EXISTS user_motorcycles_brand_trgm_idx;
--> statement-breakpoint
DROP INDEX IF EXISTS user_motorcycles_model_trgm_idx;
--> statement-breakpoint

-- Tabella alias: input_normalized → target (tag id / stringa libera per
-- categorie senza tabella dedicata es. città, marche). target_id punta a
-- tags.id quando applicabile, altrimenti target_value contiene il valore
-- canonico (es. "Harley-Davidson" come marca moto canonical).
CREATE TABLE IF NOT EXISTS text_aliases (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  category varchar(50) NOT NULL,
  input_normalized varchar(200) NOT NULL,
  target_id varchar(36) REFERENCES tags(id) ON DELETE CASCADE,
  target_value varchar(200),
  confidence real NOT NULL DEFAULT 1.0,
  source varchar(20) NOT NULL DEFAULT 'seed',
  created_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS text_aliases_cat_input_uq
  ON text_aliases (category, input_normalized);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS text_aliases_category_idx
  ON text_aliases (category);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS text_aliases_target_idx
  ON text_aliases (target_id);
--> statement-breakpoint

-- Seed iniziale: alias comuni per tag musica (categoria 'music_tag').
-- Lookup tag_id via slug nella categoria 'musica'.
INSERT INTO text_aliases (category, input_normalized, target_id, target_value, confidence, source)
SELECT 'music_tag', a.input, t.id, t.slug, 1.0, 'seed'
FROM (VALUES
  ('acdc',            'hard-rock'),
  ('ac dc',           'hard-rock'),
  ('ac/dc',           'hard-rock'),
  ('zztop',           'hard-rock'),
  ('zz top',          'hard-rock'),
  ('metallika',       'heavy-metal'),
  ('metalica',        'heavy-metal'),
  ('hevy metal',      'heavy-metal'),
  ('hardrock',        'hard-rock'),
  ('classicrock',     'classic-rock'),
  ('puk',             'punk'),
  ('pop rock',        'rock'),
  ('rock and roll',   'rock'),
  ('rock n roll',     'rock'),
  ('elettronica',     'elettronica'),
  ('electro',         'elettronica'),
  ('edm',             'elettronica')
) AS a(input, tag_slug)
JOIN tag_categories c ON c.slug = 'musica'
JOIN tags t ON t.category_id = c.id AND t.slug = a.tag_slug
ON CONFLICT (category, input_normalized) DO NOTHING;
--> statement-breakpoint

-- Seed alias per marche moto comuni (target_value = brand canonico).
INSERT INTO text_aliases (category, input_normalized, target_id, target_value, confidence, source)
VALUES
  ('bike_brand', 'harley',          NULL, 'Harley-Davidson', 1.0, 'seed'),
  ('bike_brand', 'harley davidson', NULL, 'Harley-Davidson', 1.0, 'seed'),
  ('bike_brand', 'harleydavidson',  NULL, 'Harley-Davidson', 1.0, 'seed'),
  ('bike_brand', 'ducti',           NULL, 'Ducati',          0.9, 'seed'),
  ('bike_brand', 'ducatti',         NULL, 'Ducati',          0.9, 'seed'),
  ('bike_brand', 'kavasaki',        NULL, 'Kawasaki',        0.9, 'seed'),
  ('bike_brand', 'kawasaky',        NULL, 'Kawasaki',        0.9, 'seed'),
  ('bike_brand', 'yamha',           NULL, 'Yamaha',          0.9, 'seed'),
  ('bike_brand', 'yhamaha',         NULL, 'Yamaha',          0.9, 'seed'),
  ('bike_brand', 'suzuky',          NULL, 'Suzuki',          0.9, 'seed'),
  ('bike_brand', 'honda cb',        NULL, 'Honda',           0.95, 'seed'),
  ('bike_brand', 'ktm duke',        NULL, 'KTM',             0.95, 'seed'),
  ('bike_brand', 'bm w',            NULL, 'BMW',             0.9, 'seed'),
  ('bike_brand', 'bmw motorrad',    NULL, 'BMW',             1.0, 'seed'),
  ('bike_brand', 'mvagusta',        NULL, 'MV Agusta',       1.0, 'seed'),
  ('bike_brand', 'mv agusta',       NULL, 'MV Agusta',       1.0, 'seed'),
  ('bike_brand', 'triumf',          NULL, 'Triumph',         0.9, 'seed'),
  ('bike_brand', 'triumht',         NULL, 'Triumph',         0.9, 'seed'),
  ('bike_brand', 'aprila',          NULL, 'Aprilia',         0.9, 'seed'),
  ('bike_brand', 'piagio',          NULL, 'Piaggio',         0.9, 'seed')
ON CONFLICT (category, input_normalized) DO NOTHING;
--> statement-breakpoint

-- Seed alias per città italiane comunemente sbagliate.
INSERT INTO text_aliases (category, input_normalized, target_id, target_value, confidence, source)
VALUES
  ('city', 'milnao',     NULL, 'Milano',   0.9,  'seed'),
  ('city', 'milnao',     NULL, 'Milano',   0.9,  'seed'),
  ('city', 'roam',       NULL, 'Roma',     0.85, 'seed'),
  ('city', 'firenza',    NULL, 'Firenze',  0.9,  'seed'),
  ('city', 'napoly',     NULL, 'Napoli',   0.9,  'seed'),
  ('city', 'tornino',    NULL, 'Torino',   0.9,  'seed'),
  ('city', 'venesia',    NULL, 'Venezia',  0.9,  'seed'),
  ('city', 'palrmo',     NULL, 'Palermo',  0.9,  'seed'),
  ('city', 'bolgna',     NULL, 'Bologna',  0.9,  'seed')
ON CONFLICT (category, input_normalized) DO NOTHING;
