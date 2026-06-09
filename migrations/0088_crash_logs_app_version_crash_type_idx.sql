-- migrate:no-transaction
-- Indici B-tree su app_version e crash_type in app_crash_logs.
-- Velocizzano i filtri di uguaglianza (eq / WHERE col = $1) usati nel pannello
-- Admin crash log. crash_type copre anche il predicato fisso
-- crash_type IN ('crash_system','crash_js') presente in tutte le query.
-- CONCURRENTLY: nessun lock esclusivo sulla tabella — sicuro su DB in produzione.
-- Il pragma no-transaction permette l'esecuzione fuori da BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS app_crash_logs_app_version_idx
  ON app_crash_logs (app_version);

--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS app_crash_logs_crash_type_idx
  ON app_crash_logs (crash_type);
