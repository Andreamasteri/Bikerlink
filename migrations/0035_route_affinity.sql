ALTER TABLE "match_preferences" ADD COLUMN IF NOT EXISTS "route_affinity" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_route_fingerprints" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(36) NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "cells" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "cell_count" integer NOT NULL DEFAULT 0,
  "center_lat" double precision,
  "center_lon" double precision,
  "last_route_at" timestamp,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_route_fingerprints_user_id_idx" ON "user_route_fingerprints" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_route_fingerprints_cell_count_idx" ON "user_route_fingerprints" ("cell_count");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "geo_cell_labels" (
  "geohash" varchar(12) PRIMARY KEY NOT NULL,
  "label" varchar(200) NOT NULL,
  "center_lat" double precision,
  "center_lon" double precision,
  "visit_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "route_affinity_matches" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_a_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "user_b_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "common_cells" integer NOT NULL,
  "score" double precision NOT NULL,
  "top_places" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" varchar(20) NOT NULL DEFAULT 'new',
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "route_affinity_user_a_idx" ON "route_affinity_matches" ("user_a_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "route_affinity_user_b_idx" ON "route_affinity_matches" ("user_b_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "route_affinity_symmetric_idx" ON "route_affinity_matches" (
  LEAST("user_a_id", "user_b_id"),
  GREATEST("user_a_id", "user_b_id")
);
