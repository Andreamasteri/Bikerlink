CREATE TABLE IF NOT EXISTS "ab_experiments" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(100) NOT NULL UNIQUE,
  "description" text,
  "variants" jsonb NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'running',
  "started_at" timestamp NOT NULL DEFAULT now(),
  "ended_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ab_experiments_status_idx" ON "ab_experiments" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ab_assignments" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "experiment_key" varchar(100) NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "variant" varchar(60) NOT NULL,
  "assigned_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ab_assignments_exp_user_idx" ON "ab_assignments" ("experiment_key", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ab_assignments_exp_variant_idx" ON "ab_assignments" ("experiment_key", "variant");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ab_assignments_exp_user_unique" ON "ab_assignments" ("experiment_key", "user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ab_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "experiment_key" varchar(100) NOT NULL,
  "variant" varchar(60) NOT NULL,
  "user_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "event_name" varchar(60) NOT NULL,
  "payload" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ab_events_exp_variant_event_idx" ON "ab_events" ("experiment_key", "variant", "event_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ab_events_created_at_idx" ON "ab_events" ("created_at");
--> statement-breakpoint
INSERT INTO "ab_experiments" ("key", "description", "variants", "status")
VALUES (
  'bio_affinity_weight_v1',
  'Tuning soglia music affinity: control=base (0.65), newScoring=stricter (0.65 * 1.4 ≈ 0.91)',
  '[{"name":"control","weight":0.5,"config":{"weight":1.0}},{"name":"newScoring","weight":0.5,"config":{"weight":1.4}}]'::jsonb,
  'running'
)
ON CONFLICT ("key") DO NOTHING;
