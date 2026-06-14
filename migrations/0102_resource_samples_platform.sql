ALTER TABLE resource_samples
  ADD COLUMN IF NOT EXISTS avg_ios_ram_pct integer,
  ADD COLUMN IF NOT EXISTS avg_android_ram_pct integer;
