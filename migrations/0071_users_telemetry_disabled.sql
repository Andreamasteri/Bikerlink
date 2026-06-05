-- Aggiunge il flag di disabilitazione telemetria per singolo utente.
-- Usato dall'admin per disattivare la raccolta sensori per un utente specifico.
-- IF NOT EXISTS rende la migrazione idempotente (colonna già aggiunta via ALTER TABLE).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "telemetry_disabled" boolean NOT NULL DEFAULT false;
