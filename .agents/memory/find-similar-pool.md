---
name: findSimilar HNSW pool saturation
description: findSimilar() in embeddings/store.ts deve tenere lo slot withBgDbSlot per TUTTA la vita della connessione, non solo per pool.connect()
---

## La regola
`findSimilar()` in `server/embeddings/store.ts` apre una connessione dal pool per la query HNSW pgvector. Lo slot `withBgDbSlot()` DEVE avvolgere l'INTERA operazione — `pool.connect()` + query HNSW + `client.release()` — perché la connessione resta estratta dal pool per tutta la durata della query.

**Pattern CORRETTO**:
```ts
return await withBgDbSlot(async () => {
  const client = await pool.connect();
  try { /* BEGIN + SET LOCAL hnsw.ef_search + SELECT + COMMIT */ }
  finally { client.release(); }
});
```

**Pattern SBAGLIATO (ex-fix, regressione)**: `const client = await withBgDbSlot(() => pool.connect())`. Rilascia lo slot SUBITO dopo il connect → la query gira tenendo una connessione FUORI dal budget. Inutile: il budget non limita più nulla.

## Perché
- I matcher di affinità (Bio/Music/Telemetry) chiamano `findSimilar()` in loop, uno per utente
- La query pgvector può essere lenta (sequential scan se l'indice HNSW manca)
- Con lo slot rilasciato dopo il connect, N chiamate concorrenti tengono N connessioni reali senza budget → saturano le 10 conn del pool → API in connection timeout → freeze
- Sintomo prod: **"pool saturo ma 0 query attive"** — connessioni estratte e tenute mentre il thread elabora i risultati / tra BEGIN e query

## Annidamento — ora sicuro (re-entrant, Task #5323)
withBgDbSlot/withBgDbConnection sono RIENTRANTI via AsyncLocalStorage in
bg-db-limiter.ts: un chiamante avvolto in withBgDbSlot che poi chiama findSimilar
(withBgDbConnection) NON riacquisisce lo slot (riusa quello esterno) → niente
deadlock, un solo slot per job. I matcher di affinità (run-*-affinity.ts) sono ora
avvolti interamente in withBgDbSlot per budgettare l'intera durata del job, e
findSimilar nel loop resta corretto grazie alla re-entrancy. **Obsoleta la vecchia
regola "non avvolgere i chiamanti di findSimilar".** L'annidato prende comunque la
sua PoolClient, ma non un secondo slot del budget.

## Come rilevare la prossima volta
- `pool-collector.ts` lancia `probePgStatActivity()` via `pg.Client` diretta al tick 5+ con `waiting > 0` → log `[pool-collector/activity]`. Esclude `state='idle'` → 0 righe = connessioni estratte ma idle (tenute senza query attiva), non un DB lento
- Endpoint admin `GET /api/admin/db/activity` per query on-demand di `pg_stat_activity`
