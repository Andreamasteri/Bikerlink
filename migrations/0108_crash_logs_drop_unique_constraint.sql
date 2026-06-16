-- Crea l'indice normale (non unique) su (session_id, crash_type) di app_crash_logs.
--
-- Motivo: la migration 0105 è stata trasformata in no-op e non aggiunge più il
-- vincolo UNIQUE, quindi i DROP CONSTRAINT / DROP INDEX precedenti erano sempre
-- no-op in ambienti freschi e non necessari in prod (il vincolo non era mai stato
-- applicato). Solo la creazione dell'indice ordinario ha valore effettivo.
--
-- Idempotente: IF NOT EXISTS garantisce la sicurezza su re-run.

CREATE INDEX IF NOT EXISTS "app_crash_logs_session_id_crash_type_idx"
  ON "app_crash_logs" ("session_id", "crash_type");
