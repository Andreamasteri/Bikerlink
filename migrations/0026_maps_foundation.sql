-- Task #2342 — Sistema Mappe foundation (re-introduzione).
-- Ripristina la colonna `map_tester` su `users` rimossa dal revert #2338.
-- Inserisce i valori di default per le chiavi app_settings del sistema mappe.
-- Idempotente su ogni step.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "map_tester" BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO app_settings (key, value)
VALUES
  ('maps_rollout',        'disabled'),
  ('maps_renderer',       'leaflet'),
  ('maps_tile',           'carto_light'),
  ('maps_routing_engine', 'graphhopper'),
  ('maps_routing_profile','motorcycle')
ON CONFLICT (key) DO NOTHING;

UPDATE app_settings SET value = 'motorcycle' WHERE key = 'maps_routing_profile' AND value = 'moto';
