-- migrate:no-transaction
-- Indici GIN trigram su device_brand e device_model in app_crash_logs.
-- Velocizzano i filtri ILIKE usati nel pannello Admin crash log.
-- pg_trgm è già abilitato (migration 0042).
-- CONCURRENTLY: nessun lock esclusivo sulla tabella — sicuro su DB in produzione.
-- Il pragma no-transaction permette l'esecuzione fuori da BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS app_crash_logs_device_brand_trgm
  ON app_crash_logs USING gin (device_brand gin_trgm_ops);

--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS app_crash_logs_device_model_trgm
  ON app_crash_logs USING gin (device_model gin_trgm_ops);
