-- migrate:no-transaction
--
-- Migration 0095 — Ricrea indice HNSW pgvector sulla colonna embedding.
--
-- L'indice fu creato in 0039 e poi eliminato involontariamente in 0060 insieme
-- ad altri index in un'unica migration di refactor. Senza di esso findSimilar
-- esegue un full-scan sequenziale sull'intera tabella ad ogni chiamata, cosa
-- che diventa il collo di bottiglia principale oltre i 3k utenti.
--
-- HNSW è preferito a IVFFlat per dimensioni elevate (1536d):
--   - nessun bisogno di pre-training (niente VACUUM/ANALYZE obbligatorio prima)
--   - recall più alto a parità di ef_search
--   - build incrementale (nuove righe non richiedono REBUILD)
--
-- Parametri:
--   m = 16             — max connessioni per layer (default pgvector, buon recall)
--   ef_construction = 64 — qualità build; 64 è il minimo raccomandato per 1536d
--
-- Il pragma `migrate:no-transaction` è richiesto perché CREATE INDEX CONCURRENTLY
-- non può girare dentro un BEGIN/COMMIT esplicito (PostgreSQL restituisce errore).
-- Il migrate runner lo rileva e applica la migration in autocommit mode.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "embeddings_vec_hnsw_cosine_idx"
  ON "embeddings" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
