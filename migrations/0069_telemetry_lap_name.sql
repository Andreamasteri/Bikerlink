-- Task #3115 — Giri secondari nominabili.
-- Aggiunge la colonna lap_name a ride_telemetry: nome custom scelto dall'utente
-- per i log secondari (session_type = 'ideal_lap'). NULL per tutte le altre righe.
ALTER TABLE ride_telemetry ADD COLUMN IF NOT EXISTS lap_name VARCHAR(60);
