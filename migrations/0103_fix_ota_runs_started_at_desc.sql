-- Fix drift: ota_assistant_runs_started_at_idx deve avere ordinamento DESC.
--
-- Origine del drift: migration 0033 creava l'indice con DESC correttamente,
-- ma la migration autogenerata 0060 (riga 301+490) lo ha droppato e ricreato
-- senza DESC (ASC implicito). Lo schema Drizzle in shared/db/ota.ts definisce
-- ancora `.on(table.startedAt.desc())`, causando un potenziale DROP+CREATE a
-- ogni generazione di migration.
--
-- Questa migration allinea il DB live con lo schema TS ricreando l'indice
-- con l'ordinamento DESC corretto.

DROP INDEX IF EXISTS "ota_assistant_runs_started_at_idx";
CREATE INDEX IF NOT EXISTS "ota_assistant_runs_started_at_idx"
  ON "ota_assistant_runs" ("started_at" DESC);
