-- Task #2682 — Rinomina UNIQUE constraints legacy (naming default Postgres `_key`)
-- al naming canonico drizzle `_unique`. Senza questo rename, drizzle-kit push genera
-- un diff (drop + add) che richiede TTY per il prompt "do you want to truncate?".
-- Idempotente: skip se il nome target esiste già.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_experiments_key_key')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_experiments_key_unique') THEN
    ALTER TABLE ab_experiments RENAME CONSTRAINT ab_experiments_key_key TO ab_experiments_key_unique;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'newsletter_subscribers_email_key')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'newsletter_subscribers_email_unique') THEN
    ALTER TABLE newsletter_subscribers RENAME CONSTRAINT newsletter_subscribers_email_key TO newsletter_subscribers_email_unique;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_route_fingerprints_user_id_key')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_route_fingerprints_user_id_unique') THEN
    ALTER TABLE user_route_fingerprints RENAME CONSTRAINT user_route_fingerprints_user_id_key TO user_route_fingerprints_user_id_unique;
  END IF;

  -- Drop il legacy _key duplicato su ota_releases (creato pre-Task #2682).
  -- La 0046 ha già aggiunto _unique come canonico; conservare entrambi è inutile.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ota_releases_eas_update_id_key')
     AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ota_releases_eas_update_id_unique') THEN
    ALTER TABLE ota_releases DROP CONSTRAINT ota_releases_eas_update_id_key;
  END IF;
END $$;
