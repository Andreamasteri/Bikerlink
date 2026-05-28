-- Task #2532 — Co-Pilot AI Moderazione
-- Aggiunge colonne AI sui report + tabelle di supporto (log, budget, digest, anomalie).

ALTER TABLE "reports"
  ADD COLUMN IF NOT EXISTS "ai_analysis" jsonb,
  ADD COLUMN IF NOT EXISTS "ai_analyzed_at" timestamp,
  ADD COLUMN IF NOT EXISTS "ai_model" text,
  ADD COLUMN IF NOT EXISTS "disable_ai_analysis" boolean NOT NULL DEFAULT false;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "suspended_until" timestamp;
CREATE INDEX IF NOT EXISTS "users_suspended_until_idx"
  ON "users" ("suspended_until") WHERE "suspended_until" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "reports_ai_analyzed_at_idx"
  ON "reports" ("ai_analyzed_at");

CREATE TABLE IF NOT EXISTS "ai_suggestions_log" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "report_id" varchar(36),
  "user_id" varchar(36),
  "scope" varchar(30) NOT NULL,
  "prompt" text,
  "response" text,
  "model" varchar(80),
  "provider" varchar(30),
  "tokens_in" integer NOT NULL DEFAULT 0,
  "tokens_out" integer NOT NULL DEFAULT 0,
  "cost_usd" numeric(12, 6) NOT NULL DEFAULT 0,
  "suggestion" jsonb,
  "accepted_by_admin_id" varchar(36),
  "accepted_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ai_suggestions_scope_idx" ON "ai_suggestions_log" ("scope");
CREATE INDEX IF NOT EXISTS "ai_suggestions_report_idx" ON "ai_suggestions_log" ("report_id");
CREATE INDEX IF NOT EXISTS "ai_suggestions_created_idx" ON "ai_suggestions_log" ("created_at");

CREATE TABLE IF NOT EXISTS "ai_usage_budget" (
  "month" varchar(7) PRIMARY KEY,
  "total_cost_usd" numeric(12, 6) NOT NULL DEFAULT 0,
  "limit_usd" numeric(12, 2) NOT NULL DEFAULT 55,
  "alert_sent_80" boolean NOT NULL DEFAULT false,
  "alert_sent_100" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "moderator_digests" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "moderator_id" varchar(36) NOT NULL,
  "date" varchar(10) NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "moderator_digests_mod_date_idx"
  ON "moderator_digests" ("moderator_id", "date");

CREATE TABLE IF NOT EXISTS "anomaly_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" varchar(40) NOT NULL,
  "category" varchar(40),
  "window_minutes" integer NOT NULL DEFAULT 60,
  "observed" integer NOT NULL DEFAULT 0,
  "threshold" double precision NOT NULL DEFAULT 0,
  "details" jsonb,
  "notified_admins" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "anomaly_events_created_idx" ON "anomaly_events" ("created_at");
CREATE INDEX IF NOT EXISTS "anomaly_events_type_idx" ON "anomaly_events" ("type");

-- Reject tracking per ai_suggestions_log (audit completo accepted+rejected).
ALTER TABLE "ai_suggestions_log"
  ADD COLUMN IF NOT EXISTS "rejected_by_admin_id" varchar(36),
  ADD COLUMN IF NOT EXISTS "rejected_at" timestamp,
  ADD COLUMN IF NOT EXISTS "reject_reason" varchar(300);
