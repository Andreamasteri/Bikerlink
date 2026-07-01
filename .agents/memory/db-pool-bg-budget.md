---
name: DB pool background budget (anti-saturazione)
description: Come evitare la saturazione del pool Postgres (max=10) senza ingrandirlo — budget cooperativo per i job background, statement_timeout 12s, kill-switch adattivo.
---

# Saturazione pool Postgres → budget cooperativo, non pool più grande

Quando il pool Postgres satura (waiting>0, ping spike, cascate di
DrizzleQueryError a valle: matching, CoordinateHistory, ai-unban, push), la
soluzione adottata NON è alzare `max`.

**Regola:** `max` resta 10 — è coerente con i limiti del DB managed di Replit;
alzarlo sposta solo la contesa lato server DB. Si riduce invece la **contesa**:
i job in background pesanti passano da un semaforo cooperativo
in `server/lib/bg-db-limiter.ts` che li tiene a ≤3 connessioni concorrenti
(BG_DB_MAX_CONCURRENCY), riservando ≥7 connessioni al traffico utente.

## API corrente (giugno 2026)

Esistono DUE entry point nel limiter:

1. **`withBgDbSlot(fn, opts?)`** — semaforo puro; la connessione è aperta da `fn`.
   Usare per job che fanno query via Drizzle/`db.execute()` (timeout già 5s dal pool).

2. **`withBgDbConnection(fn: (client) => Promise<T>, opts?)`** — Fix 1: combina
   slot bg + `pool.connect()` + `SET statement_timeout = 12s` + release nel
   `finally`. Usare quando `fn` fa query dirette via PoolClient.
   - NON fare `client.release()` dentro `fn` — gestito dal wrapper.
   - Annidare withBgDbConnection/withBgDbSlot dentro `fn` è SICURO: i wrapper sono
     rientranti (AsyncLocalStorage) — i livelli annidati riusano lo slot esterno
     invece di riacquisirlo (nessun deadlock). L'annidato prende comunque la sua
     PoolClient, ma non un secondo slot del budget. (era: "NON annidare — deadlock").
   - VACUUM non è interrotto da statement_timeout in Postgres → safe.

3. **`setDbSlowPingsConsecutive(n)`** — Fix 2: chiamato da db-collector dopo ogni
   modifica a `consecutiveSlowPings`. Se n ≥ 2 (BG_DB_SLOW_THRESHOLD),
   `acquire()` rifiuta i nuovi job con `BgDbSlowKillSwitchError`.
   I job critici (`opts.critical=true`) bypassano il kill-switch.

**`getBgDbLimiterStats()`** include: `active`, `queued`, `max`, `maxQueue`,
`droppedOverflowTotal`, `droppedTimeoutTotal`, `droppedSlowKillSwitchTotal`,
`dbSlowPingsConsecutive`.

## Consumer migrati a withBgDbConnection

- `server/vacuum-service.ts` — VACUUM FULL + ANALYZE sulle tabelle principali
- `server/embeddings/store.ts` — query HNSW (transazione BEGIN/COMMIT/ROLLBACK)
- `server/embeddings/backfill-bio.ts` — discovery utenti da embedare

**Why:** con `withBgDbSlot` + `pool.connect()` manuale, la connessione non aveva
statement_timeout esplicito — le query bg potevano tenerla a lungo. Ora il timeout
a 12s garantisce che Postgres uccida la query e rilasci il socket.

## Fix 3 — connessione di monitoraggio riservata

`server/db.ts` esporta `monitoringPool` (max=1) + `snapshotBlockedQueries()`.
`db-collector.ts` la usa per il SELECT 1 di ping senza competere col pool main.
Già implementato, non toccare.

**Why:** un audit ha escluso i connection leak (i `pool.connect()` rilasciano
già in `finally`). Il vero colpevole erano i **burst di concorrenza**: una
singola richiesta poteva aprire molti client in parallelo (Promise.all) e fare
`COUNT(*)` esatti su tabelle log enormi, afferrando la maggior parte delle
connessioni e tenendole a lungo → starvazione delle API utente.

**How to apply:**
- Job background con PoolClient esplicito → `withBgDbConnection(async (client) => { ... })`.
- Job background con Drizzle/db.execute() → `withBgDbSlot(() => ...)`.
- Route che fanno tanto SQL → 1 client sequenziale; per conteggi grandi preferire
  `pg_class.reltuples` ai `COUNT(*)` full-scan; fondere conteggi multipli in 1
  query con `FILTER`.
- NON mettere nel budget i job che DEVONO osservare la salute del pool
  (watchdog db-collector ha già un circuit breaker e usa monitoringPool).
- **Trappola aggregator (incidente 20 giu 2026):** `runAggregatorCycle`
  lancia ~12 collector in `Promise.allSettled` ogni 60s; quelli con query DB
  bypassavano TOTALMENTE il budget. I collector DB-only vanno avvolti in
  `withBgDbSlot`; per quelli misti (es. maps-collector) NON avvolgere l'intero
  collector ma le singole chiamate DB. Lasciare FUORI dal budget: `collectDb`
  (il SELECT 1 DEVE osservare il pool reale), `collectPool` (zero-IO).
- **Breaker vs shedding sotto saturazione:** db-collector distingue "pool saturo"
  da "DB irraggiungibile" via `!isPoolHealthy()` nel catch del ping. Shedding
  esplicito in `server/index.ts` via `isPoolSaturatedSustained()` → 503.
- `withDbRetry` esiste in DUE posti: `server/db.ts` (transient-only, backoff —
  per i job background) e `server/lib/db-retry.ts` (signature label-based, diversa).
  Non confonderli. I job su `withBgDbConnection` NON hanno bisogno di `withDbRetry`
  interno: se la connessione fallisce, il job fallisce e riparte al tick successivo.
- **Matching cycle pool gate:** `triggerMatchingRun()` in
  `server/matching/scheduler.cycle.ts` ha pre-check `isPoolHealthy()` all'ingresso;
  le chiamate DB esplicite nel corpo usano `withBgDbSlot(() => withDbRetry(...))`.
