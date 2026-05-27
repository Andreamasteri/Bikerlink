-- Task #2530 — Segnalazioni Private + Moderazione (Biker / Zavorrine)
-- Estende la tabella `reports` con categoria/contesto/severity, snapshot del trust
-- score del reporter e flag di hook al feedback-loop matching (#2519/#2523).
-- Aggiunge soglie configurabili per role (biker/zavorrina) e shadow-ban morbido
-- sugli utenti.

-- 1) Estensione reports
ALTER TABLE "reports"
  ADD COLUMN IF NOT EXISTS "category" varchar(40),
  ADD COLUMN IF NOT EXISTS "context" varchar(20),
  ADD COLUMN IF NOT EXISTS "context_id" varchar(64),
  ADD COLUMN IF NOT EXISTS "reported_user_role" varchar(20),
  ADD COLUMN IF NOT EXISTS "severity" varchar(10) NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS "affected_feedback_loop" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reporter_trust_score" double precision NOT NULL DEFAULT 1.0;

CREATE INDEX IF NOT EXISTS "reports_category_idx" ON "reports" ("category");
CREATE INDEX IF NOT EXISTS "reports_reported_user_idx" ON "reports" ("reported_user_id");
CREATE INDEX IF NOT EXISTS "reports_severity_status_idx" ON "reports" ("severity", "status");
CREATE INDEX IF NOT EXISTS "reports_reporter_idx" ON "reports" ("reporter_id");

-- 2) Soglie configurabili per role (biker/zavorrina)
CREATE TABLE IF NOT EXISTS "moderation_thresholds" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "target_role" varchar(20) NOT NULL,
  "action" varchar(20) NOT NULL,
  "threshold" integer NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "moderation_thresholds_role_action_idx"
  ON "moderation_thresholds" ("target_role", "action");

-- Default asimmetrici: zavorrine = soglie più basse (più protette)
INSERT INTO "moderation_thresholds" ("target_role", "action", "threshold") VALUES
  ('zavorrina', 'notify', 2),
  ('zavorrina', 'shadow_ban', 4),
  ('biker',     'notify', 4),
  ('biker',     'shadow_ban', 8)
ON CONFLICT ("target_role", "action") DO NOTHING;

-- 3) Shadow-ban morbido (l'utente non si accorge ma non appare in match/listing)
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "shadow_banned_at" timestamp,
  ADD COLUMN IF NOT EXISTS "shadow_ban_reason" text,
  ADD COLUMN IF NOT EXISTS "shadow_banned_until" timestamp;

CREATE INDEX IF NOT EXISTS "users_shadow_banned_idx" ON "users" ("shadow_banned_at")
  WHERE "shadow_banned_at" IS NOT NULL;
