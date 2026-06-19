-- Sensor-only telemetry: allow lat/lon to be NULL when no GPS fix is available
-- (tunnel, lost signal, permission denied). Accelerometer samples are still
-- recorded. The km Haversine calc already excludes NULL coords (WHERE prev_lat IS NOT NULL).
ALTER TABLE ride_telemetry ALTER COLUMN lat DROP NOT NULL;
ALTER TABLE ride_telemetry ALTER COLUMN lon DROP NOT NULL;
