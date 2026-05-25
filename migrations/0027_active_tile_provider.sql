-- Task #2364 — Tile Providers espansione (18 provider).
-- Inserisce il valore di default per active_tile_provider in app_settings.
-- Idempotente: ON CONFLICT (key) DO NOTHING non sovrascrive valori esistenti.

INSERT INTO app_settings (key, value)
VALUES ('active_tile_provider', 'carto-light')
ON CONFLICT (key) DO NOTHING;
