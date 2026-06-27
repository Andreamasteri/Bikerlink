-- Task #5087 — OTA Canale Emergenza (EMCY)
-- Pipeline OTA parallela che builda da un commit specifico (base di recupero
-- OTA-131 = 408f82d1, runtimeVersion 10.0.0) e pubblica su canale EAS `emergency`.
-- Un flag server-side (ota_emergency_active) fa sì che /api/ota/manifest serva
-- l'ultima release `emergency` invece di `production` a TUTTI i device.
--
-- NOTA: la colonna ota_releases.channel esiste già (vedi shared/db/ota.ts) e
-- distingue le release per canale. La ADD COLUMN qui sotto è idempotente e serve
-- solo come rete di sicurezza su DB legacy che non l'avessero ancora.

ALTER TABLE ota_releases
  ADD COLUMN IF NOT EXISTS channel varchar(50) NOT NULL DEFAULT 'production';

-- Flag globale del redirect di emergenza. false = comportamento normale
-- (manifest serve `production`). true = manifest serve `emergency`.
INSERT INTO app_settings (key, value, description)
VALUES (
  'ota_emergency_active',
  'false',
  'Task #5087 — quando true, /api/ota/manifest serve l''ultima release del canale emergency invece di production (a tutti i device).'
)
ON CONFLICT (key) DO NOTHING;
