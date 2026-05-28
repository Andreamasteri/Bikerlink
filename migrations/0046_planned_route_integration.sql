-- Task #2528 — Integrazione Matching ↔ Pianificazione/Routing.
ALTER TABLE "planned_routes" ADD COLUMN IF NOT EXISTS "geohash_cells" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "planned_routes" ADD COLUMN IF NOT EXISTS "curvy_score_avg" double precision;
--> statement-breakpoint
ALTER TABLE "planned_routes" ADD COLUMN IF NOT EXISTS "estimated_departure_window" jsonb;
--> statement-breakpoint
ALTER TABLE "planned_routes" ADD COLUMN IF NOT EXISTS "derived_tags" text[] NOT NULL DEFAULT ARRAY[]::text[];
--> statement-breakpoint
ALTER TABLE "planned_routes" ADD COLUMN IF NOT EXISTS "analyzed_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planned_routes_analyzed_at_idx" ON "planned_routes" ("analyzed_at");
--> statement-breakpoint
ALTER TABLE "match_preferences" ADD COLUMN IF NOT EXISTS "planned_route_invite" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_curvy_profile" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "avg_curvy" double precision NOT NULL DEFAULT 0,
  "sample_count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_curvy_profile_avg_idx" ON "user_curvy_profile" ("avg_curvy");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "planned_route_invites" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "route_id" varchar(36) NOT NULL REFERENCES "planned_routes"("id") ON DELETE CASCADE,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "suggested_user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "score" double precision NOT NULL,
  "reasons" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "priority" varchar(10) NOT NULL DEFAULT 'normal',
  "status" varchar(20) NOT NULL DEFAULT 'suggested',
  "notified_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planned_route_invites_route_idx" ON "planned_route_invites" ("route_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planned_route_invites_suggested_idx" ON "planned_route_invites" ("suggested_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "planned_route_invites_unique_idx" ON "planned_route_invites" ("route_id", "suggested_user_id");
