-- Indici per ride_telemetry usati dalle query pesanti del pannello Admin.
-- created_at_idx: filtra le righe delle ultime 24h (telemetry-top-riders).
-- session_ts_idx: accelera LAG() OVER (PARTITION BY session_id ORDER BY ts).
-- session_type_idx: filtra session_type NOT IN ('ideal_lap').
-- Usare CREATE INDEX IF NOT EXISTS (non CONCURRENTLY) perché il runner gira in transazione.
CREATE INDEX IF NOT EXISTS ride_telemetry_created_at_idx ON ride_telemetry(created_at);
CREATE INDEX IF NOT EXISTS ride_telemetry_session_ts_idx ON ride_telemetry(session_id, ts);
CREATE INDEX IF NOT EXISTS ride_telemetry_session_type_idx ON ride_telemetry(session_type);
