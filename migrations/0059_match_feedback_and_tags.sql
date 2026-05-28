-- Migration: match_feedback, user_match_profile, tag_categories, tags, entity_tags
-- These tables were defined in shared/db/matching.ts and shared/db/tags.ts
-- but were never applied via a proper migration.

CREATE TABLE IF NOT EXISTS "tag_categories" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" varchar(50) NOT NULL UNIQUE,
  "label" varchar(100) NOT NULL,
  "description" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "tags" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "category_id" varchar(36) NOT NULL REFERENCES "tag_categories"("id") ON DELETE CASCADE,
  "slug" varchar(80) NOT NULL,
  "label" varchar(120) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "tags_category_slug_uq" ON "tags" ("category_id", "slug");
CREATE INDEX IF NOT EXISTS "tags_category_idx" ON "tags" ("category_id");

CREATE TABLE IF NOT EXISTS "entity_tags" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "entity_type" varchar(30) NOT NULL,
  "entity_id" varchar(36) NOT NULL,
  "tag_id" varchar(36) NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "entity_tags_unique_idx" ON "entity_tags" ("entity_type", "entity_id", "tag_id");
CREATE INDEX IF NOT EXISTS "entity_tags_entity_idx" ON "entity_tags" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "entity_tags_tag_idx" ON "entity_tags" ("tag_id");

CREATE TABLE IF NOT EXISTS "match_feedback" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "other_user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "match_kind" varchar(40) NOT NULL,
  "feature_key" varchar(80) NOT NULL,
  "action" varchar(20) NOT NULL,
  "reason_tag" varchar(60),
  "match_ref_id" varchar(36),
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "match_feedback_user_created_idx" ON "match_feedback" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "match_feedback_feature_idx" ON "match_feedback" ("feature_key", "action");
CREATE INDEX IF NOT EXISTS "match_feedback_match_ref_idx" ON "match_feedback" ("match_ref_id");

CREATE TABLE IF NOT EXISTS "user_match_profile" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "feature_weights" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "feature_stats" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "feedback_count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
