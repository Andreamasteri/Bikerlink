-- Migration: Sistema Tag generico (Task #2512)
-- Crea: tag_categories, tags, entity_tags
-- Seed: 3 categorie (musica, stile_guida, tipo_moto) + tag iniziali.
-- Mapping: best-effort dei dati esistenti (motorcycle_type, riding_style,
--          user_music_tracks.genres) verso entity_tags.

CREATE TABLE IF NOT EXISTS "tag_categories" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "slug" varchar(50) NOT NULL,
        "label" varchar(100) NOT NULL,
        "description" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "tag_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tags" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "category_id" varchar(36) NOT NULL REFERENCES "tag_categories"("id") ON DELETE CASCADE,
        "slug" varchar(80) NOT NULL,
        "label" varchar(120) NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "tags_category_slug_uq" ON "tags" ("category_id", "slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tags_category_idx" ON "tags" ("category_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "entity_tags" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "entity_type" varchar(30) NOT NULL,
        "entity_id" varchar(36) NOT NULL,
        "tag_id" varchar(36) NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "entity_tags_unique_idx" ON "entity_tags" ("entity_type", "entity_id", "tag_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_tags_entity_idx" ON "entity_tags" ("entity_type", "entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_tags_tag_idx" ON "entity_tags" ("tag_id");
--> statement-breakpoint

-- ===========================================================================
-- SEED CATEGORIE
-- ===========================================================================
INSERT INTO "tag_categories" ("slug", "label", "description") VALUES
  ('musica',       'Musica',         'Generi e gusti musicali del biker'),
  ('stile_guida',  'Stile di guida', 'Come piace guidare la moto'),
  ('tipo_moto',    'Tipo di moto',   'Categoria/tipologia della moto')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

-- ===========================================================================
-- SEED TAGS — MUSICA
-- ===========================================================================
INSERT INTO "tags" ("category_id", "slug", "label")
SELECT c.id, v.slug, v.label
FROM "tag_categories" c
CROSS JOIN (VALUES
  ('rock',          'Rock'),
  ('hard-rock',     'Hard Rock'),
  ('heavy-metal',   'Heavy Metal'),
  ('classic-rock',  'Classic Rock'),
  ('punk',          'Punk'),
  ('blues',         'Blues'),
  ('pop',           'Pop'),
  ('hip-hop',       'Hip-Hop'),
  ('rap',           'Rap'),
  ('elettronica',   'Elettronica'),
  ('reggae',        'Reggae'),
  ('jazz',          'Jazz'),
  ('classica',      'Classica'),
  ('italiana',      'Musica Italiana'),
  ('cantautori',    'Cantautori'),
  ('country',       'Country'),
  ('indie',         'Indie'),
  ('anni-60',       'Anni 60'),
  ('anni-70',       'Anni 70'),
  ('anni-80',       'Anni 80'),
  ('anni-90',       'Anni 90'),
  ('anni-2000',     'Anni 2000')
) AS v(slug, label)
WHERE c.slug = 'musica'
ON CONFLICT ("category_id", "slug") DO NOTHING;
--> statement-breakpoint

-- ===========================================================================
-- SEED TAGS — STILE DI GUIDA
-- ===========================================================================
INSERT INTO "tags" ("category_id", "slug", "label")
SELECT c.id, v.slug, v.label
FROM "tag_categories" c
CROSS JOIN (VALUES
  ('curve',           'Curve'),
  ('lunghe-distanze', 'Lunghe distanze'),
  ('off-road',        'Off-road'),
  ('citta',           'Città'),
  ('pista',           'Pista'),
  ('turismo',         'Turismo'),
  ('sportivo',        'Sportivo'),
  ('tranquillo',      'Tranquillo'),
  ('moderato',        'Moderato'),
  ('gruppo',          'In gruppo'),
  ('solitario',       'Solitario')
) AS v(slug, label)
WHERE c.slug = 'stile_guida'
ON CONFLICT ("category_id", "slug") DO NOTHING;
--> statement-breakpoint

-- ===========================================================================
-- SEED TAGS — TIPO MOTO
-- ===========================================================================
INSERT INTO "tags" ("category_id", "slug", "label")
SELECT c.id, v.slug, v.label
FROM "tag_categories" c
CROSS JOIN (VALUES
  ('naked',       'Naked'),
  ('sportiva',    'Sportiva'),
  ('touring',     'Touring'),
  ('adventure',   'Adventure'),
  ('enduro',      'Enduro'),
  ('cruiser',     'Cruiser'),
  ('custom',      'Custom'),
  ('scrambler',   'Scrambler'),
  ('supermoto',   'Supermoto'),
  ('scooter',     'Scooter'),
  ('cafe-racer',  'Café Racer'),
  ('chopper',     'Chopper')
) AS v(slug, label)
WHERE c.slug = 'tipo_moto'
ON CONFLICT ("category_id", "slug") DO NOTHING;
--> statement-breakpoint

-- ===========================================================================
-- MAPPING: tipo_moto da user_motorcycles.motorcycle_type
-- Best-effort: lowercased + alias noti.
-- ===========================================================================
INSERT INTO "entity_tags" ("entity_type", "entity_id", "tag_id")
SELECT 'motorcycle', m.id, t.id
FROM "user_motorcycles" m
JOIN "tag_categories" c ON c.slug = 'tipo_moto'
JOIN "tags" t ON t.category_id = c.id AND t.slug = CASE
  WHEN LOWER(TRIM(m.motorcycle_type)) IN ('naked')                          THEN 'naked'
  WHEN LOWER(TRIM(m.motorcycle_type)) IN ('sport', 'sportiva', 'sportbike') THEN 'sportiva'
  WHEN LOWER(TRIM(m.motorcycle_type)) IN ('touring')                        THEN 'touring'
  WHEN LOWER(TRIM(m.motorcycle_type)) IN ('adventure', 'gs', 'gt')          THEN 'adventure'
  WHEN LOWER(TRIM(m.motorcycle_type)) IN ('enduro')                         THEN 'enduro'
  WHEN LOWER(TRIM(m.motorcycle_type)) IN ('cruiser')                        THEN 'cruiser'
  WHEN LOWER(TRIM(m.motorcycle_type)) IN ('custom')                         THEN 'custom'
  WHEN LOWER(TRIM(m.motorcycle_type)) IN ('scrambler')                      THEN 'scrambler'
  WHEN LOWER(TRIM(m.motorcycle_type)) IN ('supermoto', 'supermotard')       THEN 'supermoto'
  WHEN LOWER(TRIM(m.motorcycle_type)) IN ('scooter')                        THEN 'scooter'
  WHEN LOWER(TRIM(m.motorcycle_type)) IN ('cafe racer', 'café racer', 'cafe-racer', 'caferacer') THEN 'cafe-racer'
  WHEN LOWER(TRIM(m.motorcycle_type)) IN ('chopper')                        THEN 'chopper'
  ELSE NULL
END
WHERE m.motorcycle_type IS NOT NULL AND TRIM(m.motorcycle_type) <> ''
ON CONFLICT ("entity_type", "entity_id", "tag_id") DO NOTHING;
--> statement-breakpoint

-- ===========================================================================
-- MAPPING: stile_guida da user_motorcycles.riding_style
-- ===========================================================================
INSERT INTO "entity_tags" ("entity_type", "entity_id", "tag_id")
SELECT 'motorcycle', m.id, t.id
FROM "user_motorcycles" m
JOIN "tag_categories" c ON c.slug = 'stile_guida'
JOIN "tags" t ON t.category_id = c.id AND t.slug = CASE
  WHEN LOWER(TRIM(m.riding_style)) IN ('tranquillo', 'calmo', 'rilassato')           THEN 'tranquillo'
  WHEN LOWER(TRIM(m.riding_style)) IN ('moderato', 'medio')                          THEN 'moderato'
  WHEN LOWER(TRIM(m.riding_style)) IN ('sportivo', 'sport', 'aggressivo')            THEN 'sportivo'
  WHEN LOWER(TRIM(m.riding_style)) IN ('turistico', 'turismo', 'touring')            THEN 'turismo'
  WHEN LOWER(TRIM(m.riding_style)) IN ('off-road', 'offroad', 'off road', 'fuoristrada') THEN 'off-road'
  WHEN LOWER(TRIM(m.riding_style)) IN ('curve', 'curvy')                              THEN 'curve'
  WHEN LOWER(TRIM(m.riding_style)) IN ('lunghe distanze', 'lunghe-distanze', 'lunghi viaggi') THEN 'lunghe-distanze'
  WHEN LOWER(TRIM(m.riding_style)) IN ('citta', 'città', 'urbano')                    THEN 'citta'
  WHEN LOWER(TRIM(m.riding_style)) IN ('pista', 'track')                              THEN 'pista'
  WHEN LOWER(TRIM(m.riding_style)) IN ('gruppo', 'in gruppo')                         THEN 'gruppo'
  WHEN LOWER(TRIM(m.riding_style)) IN ('solitario', 'solo')                           THEN 'solitario'
  ELSE NULL
END
WHERE m.riding_style IS NOT NULL AND TRIM(m.riding_style) <> ''
ON CONFLICT ("entity_type", "entity_id", "tag_id") DO NOTHING;
--> statement-breakpoint

-- ===========================================================================
-- MAPPING: musica da user_music_tracks.genres (array text)
-- Aggregato per user_id, match esatto + alias noti.
-- Per ogni utente associa tag 'musica' alla entity 'user'.
-- ===========================================================================
INSERT INTO "entity_tags" ("entity_type", "entity_id", "tag_id")
SELECT DISTINCT 'user', umt.user_id, t.id
FROM "user_music_tracks" umt
CROSS JOIN LATERAL UNNEST(COALESCE(umt.genres, ARRAY[]::text[])) AS g(genre)
JOIN "tag_categories" c ON c.slug = 'musica'
JOIN "tags" t ON t.category_id = c.id AND t.slug = CASE
  WHEN LOWER(TRIM(g.genre)) IN ('rock')                                     THEN 'rock'
  WHEN LOWER(TRIM(g.genre)) IN ('hard rock', 'hard-rock', 'acdc', 'ac/dc')  THEN 'hard-rock'
  WHEN LOWER(TRIM(g.genre)) IN ('heavy metal', 'metal', 'heavy-metal')      THEN 'heavy-metal'
  WHEN LOWER(TRIM(g.genre)) IN ('classic rock', 'classic-rock')             THEN 'classic-rock'
  WHEN LOWER(TRIM(g.genre)) IN ('punk', 'punk rock')                        THEN 'punk'
  WHEN LOWER(TRIM(g.genre)) IN ('blues')                                    THEN 'blues'
  WHEN LOWER(TRIM(g.genre)) IN ('pop')                                      THEN 'pop'
  WHEN LOWER(TRIM(g.genre)) IN ('hip-hop', 'hip hop', 'hiphop')             THEN 'hip-hop'
  WHEN LOWER(TRIM(g.genre)) IN ('rap')                                      THEN 'rap'
  WHEN LOWER(TRIM(g.genre)) IN ('electronic', 'elettronica', 'edm', 'techno', 'house') THEN 'elettronica'
  WHEN LOWER(TRIM(g.genre)) IN ('reggae')                                   THEN 'reggae'
  WHEN LOWER(TRIM(g.genre)) IN ('jazz')                                     THEN 'jazz'
  WHEN LOWER(TRIM(g.genre)) IN ('classica', 'classical')                    THEN 'classica'
  WHEN LOWER(TRIM(g.genre)) IN ('italiana', 'italian', 'italia')            THEN 'italiana'
  WHEN LOWER(TRIM(g.genre)) IN ('cantautori', 'cantautore', 'singer-songwriter') THEN 'cantautori'
  WHEN LOWER(TRIM(g.genre)) IN ('country')                                  THEN 'country'
  WHEN LOWER(TRIM(g.genre)) IN ('indie')                                    THEN 'indie'
  WHEN LOWER(TRIM(g.genre)) IN ('60s', 'anni 60', 'anni-60')                THEN 'anni-60'
  WHEN LOWER(TRIM(g.genre)) IN ('70s', 'anni 70', 'anni-70')                THEN 'anni-70'
  WHEN LOWER(TRIM(g.genre)) IN ('80s', 'anni 80', 'anni-80')                THEN 'anni-80'
  WHEN LOWER(TRIM(g.genre)) IN ('90s', 'anni 90', 'anni-90')                THEN 'anni-90'
  WHEN LOWER(TRIM(g.genre)) IN ('2000s', 'anni 2000', 'anni-2000')          THEN 'anni-2000'
  ELSE NULL
END
WHERE g.genre IS NOT NULL AND TRIM(g.genre) <> ''
ON CONFLICT ("entity_type", "entity_id", "tag_id") DO NOTHING;
