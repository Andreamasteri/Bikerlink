-- Indici mancanti sulle tabelle usate dalle query del pannello Admin.
-- Audit completo: colonne usate in WHERE/ORDER BY senza copertura indice.
-- Usare CREATE INDEX IF NOT EXISTS (non CONCURRENTLY) perché il runner gira in transazione.

-- moderator_logs: zero indici → admin user profile (audit trail moderazione)
CREATE INDEX IF NOT EXISTS moderator_logs_target_id_idx ON moderator_logs(target_id);
CREATE INDEX IF NOT EXISTS moderator_logs_moderator_id_idx ON moderator_logs(moderator_id);
CREATE INDEX IF NOT EXISTS moderator_logs_created_at_idx ON moderator_logs(created_at);

-- ad_clicks: storico click ads per utente (admin user profile)
CREATE INDEX IF NOT EXISTS ad_clicks_user_id_idx ON ad_clicks(user_id);

-- ota_boot_events: audit boot OTA per utente (admin user audit)
CREATE INDEX IF NOT EXISTS ota_boot_events_user_id_idx ON ota_boot_events(user_id);

-- users: filtro per ruolo nella lista admin
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

-- user_devices: sort per ultimo accesso (admin user profile)
CREATE INDEX IF NOT EXISTS user_devices_last_seen_at_idx ON user_devices(last_seen_at);
