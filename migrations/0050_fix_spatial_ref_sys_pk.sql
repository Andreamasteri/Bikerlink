-- Task #2702 — Fix deploy: spatial_ref_sys migration sicura.
-- Replit's deploy pipeline genera `ALTER TABLE spatial_ref_sys ADD PRIMARY KEY (srid)`
-- confrontando dev e prod. Questa istruzione fallisce in produzione perché spatial_ref_sys
-- è una tabella di sistema PostGIS, di proprietà del ruolo `postgres`.
-- Aggiungendo questa migration numerata, drizzle-kit la marca come "già applicata"
-- e smette di rigenerarla ad ogni deploy.
--
-- Idempotenza:
--   • Pre-check via pg_constraint: se il PK esiste già, ALTER TABLE non viene eseguito.
--   • EXCEPTION WHEN insufficient_privilege: gestisce il caso prod dove l'utente
--     applicativo non è owner della tabella (PostGIS system table).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint c
    JOIN   pg_class      t ON t.oid = c.conrelid
    WHERE  t.relname = 'spatial_ref_sys'
    AND    c.contype = 'p'
  ) THEN
    ALTER TABLE spatial_ref_sys ADD PRIMARY KEY (srid);
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
END $$;
