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
