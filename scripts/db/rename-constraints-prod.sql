-- Task #2679 — Allinea constraint rename in produzione
--
-- Script SQL idempotente che rinomina su prod i 4 UNIQUE constraint
-- rinominati in dev dal task #2678 (da nome auto-generato PostgreSQL
-- *_key al nome drizzle *_unique).
--
-- Rinomina effettuate:
--   ota_releases_eas_update_id_key         → ota_releases_eas_update_id_unique
--   ab_experiments_key_key                 → ab_experiments_key_unique
--   newsletter_subscribers_email_key       → newsletter_subscribers_email_unique
--   user_route_fingerprints_user_id_key    → user_route_fingerprints_user_id_unique
--
-- Idempotente: ogni DO block rinomina solo se il vecchio nome esiste
-- e il nuovo nome non esiste ancora. Può essere rieseguito senza danni.
--
-- Errori che questo script previene al prossimo deploy:
--   42P01 / 42703 nei log di drizzle-kit push --force

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) ota_releases_eas_update_id_key → ota_releases_eas_update_id_unique
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ota_releases_eas_update_id_key'
      AND conrelid = 'ota_releases'::regclass
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ota_releases_eas_update_id_unique'
      AND conrelid = 'ota_releases'::regclass
  ) THEN
    ALTER TABLE ota_releases
      RENAME CONSTRAINT ota_releases_eas_update_id_key
                     TO ota_releases_eas_update_id_unique;
    RAISE NOTICE 'Renamed: ota_releases_eas_update_id_key → ota_releases_eas_update_id_unique';
  ELSE
    RAISE NOTICE 'Skip ota_releases_eas_update_id: already renamed or old name absent';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) ab_experiments_key_key → ab_experiments_key_unique
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ab_experiments_key_key'
      AND conrelid = 'ab_experiments'::regclass
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ab_experiments_key_unique'
      AND conrelid = 'ab_experiments'::regclass
  ) THEN
    ALTER TABLE ab_experiments
      RENAME CONSTRAINT ab_experiments_key_key
                     TO ab_experiments_key_unique;
    RAISE NOTICE 'Renamed: ab_experiments_key_key → ab_experiments_key_unique';
  ELSE
    RAISE NOTICE 'Skip ab_experiments_key: already renamed or old name absent';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) newsletter_subscribers_email_key → newsletter_subscribers_email_unique
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'newsletter_subscribers_email_key'
      AND conrelid = 'newsletter_subscribers'::regclass
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'newsletter_subscribers_email_unique'
      AND conrelid = 'newsletter_subscribers'::regclass
  ) THEN
    ALTER TABLE newsletter_subscribers
      RENAME CONSTRAINT newsletter_subscribers_email_key
                     TO newsletter_subscribers_email_unique;
    RAISE NOTICE 'Renamed: newsletter_subscribers_email_key → newsletter_subscribers_email_unique';
  ELSE
    RAISE NOTICE 'Skip newsletter_subscribers_email: already renamed or old name absent';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) user_route_fingerprints_user_id_key → user_route_fingerprints_user_id_unique
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_route_fingerprints_user_id_key'
      AND conrelid = 'user_route_fingerprints'::regclass
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_route_fingerprints_user_id_unique'
      AND conrelid = 'user_route_fingerprints'::regclass
  ) THEN
    ALTER TABLE user_route_fingerprints
      RENAME CONSTRAINT user_route_fingerprints_user_id_key
                     TO user_route_fingerprints_user_id_unique;
    RAISE NOTICE 'Renamed: user_route_fingerprints_user_id_key → user_route_fingerprints_user_id_unique';
  ELSE
    RAISE NOTICE 'Skip user_route_fingerprints_user_id: already renamed or old name absent';
  END IF;
END;
$$;

COMMIT;
