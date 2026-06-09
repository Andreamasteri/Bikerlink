ALTER TABLE app_crash_logs ADD COLUMN IF NOT EXISTS device_brand VARCHAR(100);
ALTER TABLE app_crash_logs ADD COLUMN IF NOT EXISTS total_memory_mb INTEGER;
