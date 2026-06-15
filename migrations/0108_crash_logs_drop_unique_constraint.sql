-- Rimuove il vincolo UNIQUE su (session_id, crash_type) di app_crash_logs.
--
-- Motivo: Postgres rifiuta di costruire l'indice UNIQUE in prod perché
-- esistono righe duplicate. L'unicità a livello applicativo è già garantita
-- da onConflictDoNothing() nel route handler, quindi il vincolo DB non è
-- necessario per la correttezza.
--
-- Idempotente: tutte le operazioni usano IF EXISTS / IF NOT EXISTS.
-- Ordine obbligatorio: DROP CONSTRAINT prima di DROP INDEX, perché in
-- PostgreSQL un indice che supporta un UNIQUE constraint non può essere
-- rimosso direttamente (errore "cannot drop index because constraint requires it").

-- 1. Rimuove il constraint se esiste (rimuove anche l'indice di supporto)
ALTER TABLE "app_crash_logs" DROP CONSTRAINT IF EXISTS "app_crash_logs_session_id_crash_type_key";

--> statement-breakpoint

-- 2. Rimuove l'indice unico se esiste come indice autonomo (senza constraint)
DROP INDEX IF EXISTS "app_crash_logs_session_id_crash_type_key";

--> statement-breakpoint

-- 3. Crea l'indice normale (non unique) se non esiste già
CREATE INDEX IF NOT EXISTS "app_crash_logs_session_id_crash_type_idx"
  ON "app_crash_logs" ("session_id", "crash_type");
