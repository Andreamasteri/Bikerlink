-- Add buildProfile: tipo di build che ha generato il report (diagnostic/standard/expo-go).
-- NULL = report storico precedente all'introduzione del campo.
ALTER TABLE diagnostic_reports ADD COLUMN IF NOT EXISTS build_profile VARCHAR(20);
