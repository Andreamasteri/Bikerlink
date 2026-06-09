-- Rimozione indici GIN trigram su app_crash_logs.
-- Gli indici device_brand_trgm e device_model_trgm (creati dalla migration 0087)
-- causano un errore nel publish flow Replit perché il diff DEV↔PROD genera SQL
-- senza gin_trgm_ops. La ricerca ILIKE nel pannello Admin funziona anche senza
-- questi indici GIN (sequenziale su tabella tipicamente piccola).
-- DROP IF EXISTS: idempotente — no-op su PROD dove gli indici non esistono.

DROP INDEX IF EXISTS app_crash_logs_device_brand_trgm;

--> statement-breakpoint

DROP INDEX IF EXISTS app_crash_logs_device_model_trgm;
