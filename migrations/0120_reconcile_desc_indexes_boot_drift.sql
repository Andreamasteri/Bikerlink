-- Riconciliazione drift indici DESC rilevato al boot (Index Drift).
--
-- Origine del drift: gli indici qui sotto esistono nel DB live SENZA il
-- modificatore DESC atteso. Lo schema Drizzle TS e le migration originali
-- (0109, 0113) li dichiarano correttamente con DESC, ma poiché quelle migration
-- usano `CREATE INDEX IF NOT EXISTS`, la definizione corretta non viene mai
-- applicata sopra l'indice già esistente senza DESC. Il gate db-integrity
-- (index-drift-core) segnala quindi "🔴 Index Drift rilevato" ad ogni boot.
--
-- Stessa strategia già usata per ota_assistant_runs (0103/0104/0112):
-- DROP IF EXISTS + CREATE con l'ordinamento DESC corretto, forzando il DB live
-- a convergere allo stato atteso dallo schema TS.
--
-- Idempotente: sicura da ri-eseguire anche se gli indici sono già DESC.

-- pipeline_probe_history_pipeline_run_at_idx → (pipeline, run_at DESC)
DROP INDEX IF EXISTS "pipeline_probe_history_pipeline_run_at_idx";
CREATE INDEX IF NOT EXISTS "pipeline_probe_history_pipeline_run_at_idx"
  ON "pipeline_probe_history" ("pipeline", "run_at" DESC);

-- user_privacy_log_user_id_changed_at_idx → (user_id, changed_at DESC)
DROP INDEX IF EXISTS "user_privacy_log_user_id_changed_at_idx";
CREATE INDEX IF NOT EXISTS "user_privacy_log_user_id_changed_at_idx"
  ON "user_privacy_log" ("user_id", "changed_at" DESC);
