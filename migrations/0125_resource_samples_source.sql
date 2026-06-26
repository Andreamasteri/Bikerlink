-- Task #4970 — Stress Test DB: distingue le righe campionate dallo stress test
-- da quelle del resource-graph-sampler runtime.
--
-- Il sampler dell'app inserisce righe con source = NULL (default, come prima).
-- Lo script scripts/db-stress-test.ts inserisce righe con source = 'stress_test'
-- così il report finale e le query di analisi possono isolare il carico di test
-- senza mischiarlo con la telemetria reale.
--
-- nullable: NULL = campione runtime normale (default). Nessun backfill necessario.

ALTER TABLE "resource_samples" ADD COLUMN IF NOT EXISTS "source" varchar(40);
