-- Repeated mobile batches must not duplicate the same logical sample.
-- Existing rows stay untouched: the key is populated only for new ingestion.
ALTER TABLE ride_telemetry
  ADD COLUMN IF NOT EXISTS ingest_key VARCHAR(64);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ride_telemetry_ingest_key_uidx
  ON ride_telemetry (ingest_key)
  WHERE ingest_key IS NOT NULL;
