-- Task #2531 — Pannello Admin Report (Hub di Moderazione)
-- Aggiunge campi di "claim" sui report per evitare doppio lavoro tra moderatori.

ALTER TABLE "reports"
  ADD COLUMN IF NOT EXISTS "assigned_moderator_id" varchar(36),
  ADD COLUMN IF NOT EXISTS "assigned_at" timestamp;

CREATE INDEX IF NOT EXISTS "reports_assigned_moderator_idx"
  ON "reports" ("assigned_moderator_id")
  WHERE "assigned_moderator_id" IS NOT NULL;
