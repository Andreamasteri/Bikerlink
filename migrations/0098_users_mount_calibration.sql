-- Task #3946: Calibrazione supporto moto persistente su server
-- Aggiunge colonna JSONB nullable per salvare i dati di calibrazione assi
ALTER TABLE users ADD COLUMN IF NOT EXISTS mount_calibration JSONB;
