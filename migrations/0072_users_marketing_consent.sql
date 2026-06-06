-- Aggiunge il flag di consenso marketing per singolo utente.
-- Salvato al momento della registrazione dallo Step 4 (StepLegal).
-- IF NOT EXISTS rende la migrazione idempotente (colonna già aggiunta via ALTER TABLE manuale).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "marketing_consent" boolean NOT NULL DEFAULT false;
