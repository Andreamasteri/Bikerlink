-- 0142_unique_nickname_business_workshop_email.sql
--
-- Task #13 — report `docs/bikerlink-db-check-report.md` (sez. 4) rileva colonne
-- semanticamente unique senza vincolo DB: users.nickname, businesses.email,
-- workshops.email. Il DB dev quasi vuoto non fa emergere il problema, ma senza
-- il vincolo nulla impedisce due account con lo stesso nickname o due
-- business/officine con la stessa email — corruzione dati possibile in prod.
--
-- Verificata l'assenza di duplicati reali (dev DB, 8 utenti / 0 business /
-- 0 workshop con email — nessun conflitto). Vedi anche il task dedicato di
-- verifica dati prod.
--
-- Indici su LOWER(...) (non UNIQUE su colonna raw) perché l'app confronta già
-- case-insensitive (getUserByNickname/getUserByEmail usano LOWER()); un
-- vincolo case-sensitive lascerebbe passare "Mario"/"mario" come distinti.
-- Partial (email IS NOT NULL AND email <> '') perché business/workshop email
-- è opzionale: i NULL sono già distinti a livello Postgres, ma escludiamo
-- anche le stringhe vuote per evitare collisioni artificiali su "nessuna email".
CREATE UNIQUE INDEX IF NOT EXISTS "users_nickname_lower_uq" ON "users" (LOWER("nickname"));
--> statement-breakpoint
DROP INDEX IF EXISTS "businesses_email_lower_uq";
CREATE UNIQUE INDEX IF NOT EXISTS "businesses_email_lower_uq" ON "businesses" (LOWER("email")) WHERE "email" IS NOT NULL AND "email" <> '';
--> statement-breakpoint
DROP INDEX IF EXISTS "workshops_email_lower_uq";
CREATE UNIQUE INDEX IF NOT EXISTS "workshops_email_lower_uq" ON "workshops" (LOWER("email")) WHERE "email" IS NOT NULL AND "email" <> '';
