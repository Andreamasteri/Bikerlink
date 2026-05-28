-- Task #2682 — Add UNIQUE constraint to ota_releases.eas_update_id.
-- Lo schema TS (shared/db/ota.ts:18) la dichiara già con `.unique()`. In dev DB i 25
-- record esistenti hanno tutti eas_update_id distinti e non-null (verificato), quindi
-- la constraint si applica senza necessità di truncate. Idempotente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ota_releases_eas_update_id_unique'
  ) THEN
    ALTER TABLE ota_releases ADD CONSTRAINT ota_releases_eas_update_id_unique UNIQUE (eas_update_id);
  END IF;
END $$;
