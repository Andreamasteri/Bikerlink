-- migrate:no-transaction
-- Remediation: garantisce che gli indici GIN trigram su app_crash_logs
-- esistano su TUTTI i DB (dev e prod).
--
-- Background: la migration 0087 poteva essere marcata "applied" su PROD
-- senza che gli indici fossero effettivamente creati. Questo accadeva perché
-- l'errore 42704 (operator class "gin_trgm_ops" non trovata, se pg_trgm non
-- era abilitata al momento) veniva silenziosamente ignorato. Il risultato:
-- PROD non aveva gli indici, il diff Replit publish generava un CREATE INDEX
-- senza gin_trgm_ops che falliva ogni volta.
--
-- Questa migration è completamente idempotente:
--   - CREATE EXTENSION IF NOT EXISTS → no-op se già esiste
--   - CREATE INDEX CONCURRENTLY IF NOT EXISTS → no-op se l'indice esiste già
-- CONCURRENTLY: nessun lock esclusivo sulla tabella — sicuro su DB in produzione.
-- Il pragma no-transaction permette l'esecuzione fuori da BEGIN/COMMIT.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS app_crash_logs_device_brand_trgm
  ON app_crash_logs USING gin (device_brand gin_trgm_ops);

--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS app_crash_logs_device_model_trgm
  ON app_crash_logs USING gin (device_model gin_trgm_ops);
