-- Task #2338 — Revert sistema mappe.
-- Rimuove la colonna `map_tester` aggiunta dai task #2312-#2315.
-- Idempotente: usa DROP COLUMN IF EXISTS.

ALTER TABLE "users" DROP COLUMN IF EXISTS "map_tester";
