-- Task #2311 — Sistema Mappe foundation.
-- Aggiunge la colonna `map_tester` alla tabella `users` per il rollout a 3 stati
-- (disabled / tester / all) configurabile dal pannello admin.
-- Idempotente: applica solo se la colonna non esiste già (in dev è stata creata
-- a mano via raw SQL ALTER TABLE prima dell'introduzione di questa migration).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "map_tester" BOOLEAN NOT NULL DEFAULT FALSE;
