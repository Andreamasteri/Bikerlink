-- Task #telemetry-scope — Indici compositi per le query scoped per utente/sessione.
-- Le query di telemetria devono usare user_id + session_id come identità composta.
-- Idempotente; non modifica né cancella i campioni esistenti.
CREATE INDEX IF NOT EXISTS ride_telemetry_user_session_ts_idx
  ON ride_telemetry (user_id, session_id, ts, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ride_telemetry_user_session_status_ts_idx
  ON ride_telemetry (user_id, session_id, match_status, ts);
