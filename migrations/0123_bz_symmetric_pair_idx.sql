-- migrate:no-transaction
-- Task #4942 — Parte C: indice funzionale (LEAST/GREATEST) su biker_zavorrina_matches.
--
-- enrichBikerMatchBreakdowns esegue join su
--   LEAST(biker_id, zavorrina_id) / GREATEST(biker_id, zavorrina_id)
-- contro music_affinity_matches e telemetry_affinity_matches. Senza indice
-- funzionale ogni run faceva una sequential scan completa della tabella bz,
-- aggravando la pressione sul pool durante il ciclo di matching.
--
-- CONCURRENTLY: nessun lock esclusivo sulla tabella — sicuro in produzione.
-- Il pragma no-transaction permette l'esecuzione fuori da BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "matches_bz_symmetric_pair_idx"
  ON "biker_zavorrina_matches" (
    (LEAST("biker_id", "zavorrina_id")),
    (GREATEST("biker_id", "zavorrina_id"))
  );
