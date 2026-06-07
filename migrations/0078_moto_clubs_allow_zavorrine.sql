-- Migration: add allow_zavorrine to moto_clubs
-- Aggiunge la colonna booleana allow_zavorrine (default true) alla tabella moto_clubs.
-- Quando false, le zavorrine non vedono il club nella discovery e non possono unirsi.

ALTER TABLE moto_clubs
  ADD COLUMN IF NOT EXISTS allow_zavorrine BOOLEAN NOT NULL DEFAULT true;
