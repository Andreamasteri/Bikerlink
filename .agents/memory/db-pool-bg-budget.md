---
name: DB pool background budget (anti-saturazione)
description: Come evitare la saturazione del pool Postgres (max=10) senza ingrandirlo — budget cooperativo per i job background.
---

# Saturazione pool Postgres → budget cooperativo, non pool più grande

Quando il pool Postgres satura (waiting>0, ping spike, cascate di
DrizzleQueryError a valle: matching, CoordinateHistory, ai-unban, push), la
soluzione adottata NON è alzare `max`.

**Regola:** `max` resta 10 — è coerente con i limiti del DB managed di Replit;
alzarlo sposta solo la contesa lato server DB. Si riduce invece la **contesa**:
i job in background pesanti passano da un semaforo cooperativo
`withBgDbSlot(fn)` in `server/lib/bg-db-limiter.ts` che li tiene a ≤3
connessioni concorrenti (BG_DB_MAX_CONCURRENCY), riservando ≥7 connessioni al
traffico utente. Pattern d'uso: `withBgDbSlot(() => withDbRetry(...))`.

**Why:** un audit ha escluso i connection leak (i `pool.connect()` rilasciano
già in `finally`). Il vero colpevole erano i **burst di concorrenza**: una
singola richiesta poteva aprire molti client in parallelo (Promise.all) e fare
`COUNT(*)` esatti su tabelle log enormi, afferrando la maggior parte delle
connessioni e tenendole a lungo → starvazione delle API utente. La lezione
durevole: cercare i burst di apertura concorrente, non i leak.

**How to apply:**
- Job background periodici/pesanti → avvolgere in `withBgDbSlot(() => withDbRetry(...))`.
- Route che fanno tanto SQL → 1 client sequenziale (non Promise.all di N
  connect); per i conteggi grandi preferire stima `pg_class.reltuples`
  (`GREATEST(reltuples,0)`) ai `COUNT(*)` full-scan; fondere conteggi multipli
  in 1 query con `FILTER`.
- NON mettere nel budget i job che DEVONO osservare la salute del pool
  (watchdog db-collector ha già un circuit breaker). Vacuum nightly (1 conn,
  lock-bound) non serve avvolgerlo.
- `withDbRetry` esiste in DUE posti: `server/db.ts` (transient-only, backoff —
  questo per i job background) e `server/lib/db-retry.ts` (signature
  label-based, diversa). Non confonderli.
- Statistiche per le sonde: `getBgDbLimiterStats()` (limiter) e
  `getPoolStats()`/`isPoolHealthy()` (pool) in `server/db.ts`.
