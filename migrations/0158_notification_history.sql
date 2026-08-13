-- Task #4436 — Persistenza dello storico delle notifiche push.
-- La tabella esisteva già in produzione per bootstrap runtime; questa migration
-- la rende parte della storia schema ufficiale senza perdere i dati esistenti.
CREATE TABLE IF NOT EXISTS notification_history (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(36),
  notification_type VARCHAR(60) NOT NULL DEFAULT 'unknown',
  token TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'sent',
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_history_created_at_idx
  ON notification_history (created_at);

CREATE INDEX IF NOT EXISTS notification_history_status_created_idx
  ON notification_history (status, created_at);

CREATE INDEX IF NOT EXISTS notification_history_user_id_idx
  ON notification_history (user_id);
