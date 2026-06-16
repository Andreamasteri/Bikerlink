-- Migrazione correttiva: ricrea ota_assistant_runs_started_at_idx con ordinamento DESC
-- L'indice esistente nel DB live manca del modificatore DESC su started_at,
-- causando una regressione di performance sulle query ORDER BY started_at DESC.

DROP INDEX IF EXISTS ota_assistant_runs_started_at_idx;
CREATE INDEX ota_assistant_runs_started_at_idx ON ota_assistant_runs (started_at DESC);
