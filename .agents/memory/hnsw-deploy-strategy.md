---
name: HNSW index deploy strategy
description: Perché l'indice HNSW pgvector NON deve stare nelle migration e come gestirlo correttamente.
---

# HNSW index — strategia deploy

## Regola
L'indice HNSW su `embeddings` NON deve essere definito nelle migration SQL né nel schema Drizzle. Deve essere creato esclusivamente dalla boot-sequence al primo avvio.

**Why:** Replit Publish genera autonomamente un diff tra dev DB e prod DB. Se l'indice esiste nel dev DB ma non in prod, Replit genera `CREATE INDEX ... USING hnsw` nel suo migration automatico — che fallisce perché pgvector non è ancora installato in prod quando le migration girano (le migration precedono il boot del server, quindi la boot-sequence non ha ancora garantito l'extension).

**How to apply:**
- Migration 0095 è intenzionalmente un no-op (`SELECT 1;`) — non toccarla
- Il dev DB NON deve avere l'indice `embeddings_vec_hnsw_cosine_idx` (è stato droppato il 2026-06-11)
- La boot-sequence Phase 3 crea sia `CREATE EXTENSION IF NOT EXISTS vector` sia `CREATE INDEX CONCURRENTLY IF NOT EXISTS embeddings_vec_hnsw_cosine_idx` ad ogni avvio
- Se il deploy fallisce con "data type vector has no default operator class for access method hnsw": qualcuno ha ricreato l'indice nel dev DB → dropparlo con `DROP INDEX CONCURRENTLY IF EXISTS embeddings_vec_hnsw_cosine_idx;`
