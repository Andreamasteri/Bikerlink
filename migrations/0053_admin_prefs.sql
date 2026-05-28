-- Task #2645 — Preferenze admin (onboarding AI Console, hint dismissed, ecc.)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "admin_prefs" jsonb DEFAULT '{}'::jsonb;
