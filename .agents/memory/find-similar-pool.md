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

## Anti-deadlock
NON avvolgere i chiamanti di `findSimilar` in `withBgDbSlot`. Annidare withBgDbSlot (caller + interno) può andare in deadlock: se 3 slot esterni sono presi, l'acquire interno resta in coda all'infinito (limiter max=3). I matcher attuali chiamano findSimilar DIRETTAMENTE (verificato in scheduler.cycle.ts safePhases + run-*-affinity.ts) → sicuro tenere il wrap dentro findSimilar.

## Come rilevare la prossima volta
- `pool-collector.ts` lancia `probePgStatActivity()` via `pg.Client` diretta al tick 5+ con `waiting > 0` → log `[pool-collector/activity]`. Esclude `state='idle'` → 0 righe = connessioni estratte ma idle (tenute senza query attiva), non un DB lento
- Endpoint admin `GET /api/admin/db/activity` per query on-demand di `pg_stat_activity`
