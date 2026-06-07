-- Migration: align match_negative_preferences
-- Crea la tabella se non esiste già (safe per prod che la possiede già via
-- drizzle-kit push storico). Rimuove il drift registry↔migration rilevato da
-- check-schema-migration-drift.ts e svuota KNOWN_UNMIGRATED.

CREATE TABLE IF NOT EXISTS match_negative_preferences (
  id          VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        VARCHAR(40)  NOT NULL,
  value       JSONB        NOT NULL,
  source      VARCHAR(20)  NOT NULL DEFAULT 'manual',
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS match_neg_prefs_user_idx
  ON match_negative_preferences (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS match_neg_prefs_unique_idx
  ON match_negative_preferences (user_id, kind, (value::text));
