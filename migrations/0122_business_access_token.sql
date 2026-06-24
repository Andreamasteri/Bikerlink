-- Task #4917 — Vista self-service business reach.
--
-- Aggiunge un token di accesso per-business: il titolare può consultare i PROPRI
-- numeri aggregati (passaggi qualificati + click per azione) senza un account
-- app. Il token è generato/revocato dall'admin dal pannello Business Reach.
-- Strettamente aggregato: nessuna traccia individuale di rider viene mai esposta.
--
-- access_token nullable: NULL = nessun accesso self-service attivo. L'indice
-- UNIQUE permette più NULL (semantica Postgres) ma garantisce token univoci.

ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "access_token" varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS "businesses_access_token_idx"
  ON "businesses" ("access_token");
