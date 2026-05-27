-- Task #2510 — PostGIS (Indici Geografici Nativi).
-- Abilita PostGIS, aggiunge colonne `geom` generate (geography Point WGS84)
-- mantenute in sync automaticamente dalle colonne lat/lon esistenti, e crea
-- indici GIST per query di prossimità (ST_DWithin / ST_Distance) in O(log n).
-- Idempotente: ogni step usa IF NOT EXISTS / DO blocks.

CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint

-- user_profiles.geom ← (longitude, latitude)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'geom'
  ) THEN
    EXECUTE 'ALTER TABLE user_profiles ADD COLUMN geom geography(Point, 4326)
             GENERATED ALWAYS AS (
               CASE WHEN longitude IS NOT NULL AND latitude IS NOT NULL
                    THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
                    ELSE NULL END
             ) STORED';
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS user_profiles_geom_gist ON user_profiles USING GIST (geom);
--> statement-breakpoint

-- proposals.departure_geom ← (departure_longitude, departure_latitude)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'departure_geom'
  ) THEN
    EXECUTE 'ALTER TABLE proposals ADD COLUMN departure_geom geography(Point, 4326)
             GENERATED ALWAYS AS (
               CASE WHEN departure_longitude IS NOT NULL AND departure_latitude IS NOT NULL
                    THEN ST_SetSRID(ST_MakePoint(departure_longitude, departure_latitude), 4326)::geography
                    ELSE NULL END
             ) STORED';
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS proposals_departure_geom_gist ON proposals USING GIST (departure_geom);
--> statement-breakpoint

-- proposals.destination_geom ← (destination_longitude, destination_latitude)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'destination_geom'
  ) THEN
    EXECUTE 'ALTER TABLE proposals ADD COLUMN destination_geom geography(Point, 4326)
             GENERATED ALWAYS AS (
               CASE WHEN destination_longitude IS NOT NULL AND destination_latitude IS NOT NULL
                    THEN ST_SetSRID(ST_MakePoint(destination_longitude, destination_latitude), 4326)::geography
                    ELSE NULL END
             ) STORED';
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS proposals_destination_geom_gist ON proposals USING GIST (destination_geom);
--> statement-breakpoint

-- events.geom ← (longitude, latitude)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'geom'
  ) THEN
    EXECUTE 'ALTER TABLE events ADD COLUMN geom geography(Point, 4326)
             GENERATED ALWAYS AS (
               CASE WHEN longitude IS NOT NULL AND latitude IS NOT NULL
                    THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
                    ELSE NULL END
             ) STORED';
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS events_geom_gist ON events USING GIST (geom);
