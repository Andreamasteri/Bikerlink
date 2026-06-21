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
- **Trappola aggregator (incidente 20 giu 2026):** `runAggregatorCycle`
  (`server/ai/watchdog/aggregator.ts`) lancia ~12 collector in
  `Promise.allSettled` ogni 60s; quelli con query DB bypassavano TOTALMENTE il
  budget → un singolo tick poteva afferrare quasi tutte le 10 conn (amplificato
  dal lag dell'event-loop con Redis/ThinkCentre giù: le query tengono le conn
  più a lungo). Lezione: il budget va applicato anche dentro l'aggregator. I
  collector solo-DB vanno avvolti in `withBgDbSlot`; per quelli misti
  (es. maps-collector fa health-check di rete lenti) NON avvolgere l'intero
  collector ma le singole chiamate DB. Lasciare FUORI dal budget: `collectDb`
  (il SELECT 1 DEVE osservare il pool reale), `collectPool` (zero-IO) e i
  collector senza DB (redis/bullmq/latency).
- **Breaker vs shedding sotto saturazione:** il db-collector distingue "pool
  saturo" da "DB irraggiungibile" via `!isPoolHealthy()` nel catch del ping: se
  saturo emette `db.ping_saturated` (warn) e NON chiama `cbRecordFailure` (era la
  causa del flapping OPEN↔HALF_OPEN). Rimuovendo il breaker come load-shedder di
  fatto, lo shedding lo fa il gate `/api` in `server/index.ts` via
  `isPoolSaturatedSustained()` (in `server/db.ts`, grace 500ms continui) → 503 +
  `Retry-After`. **I due fix DEVONO viaggiare insieme:** il fix al breaker toglie
  lo shedding implicito, il gate lo rimpiazza esplicitamente.
- `withDbRetry` esiste in DUE posti: `server/db.ts` (transient-only, backoff —
  questo per i job background) e `server/lib/db-retry.ts` (signature
  label-based, diversa). Non confonderli.
- **Matching cycle pool gate (incidente 20 giu 2026):** `triggerMatchingRun()` in
  `server/matching/scheduler.cycle.ts` andava in timeout su
  `getAppSetting("auto_matching_enabled")` quando il pool era saturo. Fix in tre
  punti: (a) pre-check `isPoolHealthy()` all'ingresso di `triggerMatchingRun()`
  — se saturo, `dedupWarn` + return `{ started:false, reason:"pool_saturated" }`
  senza acquisire il lock né fare DB call; (b) le chiamate DB esplicite nel corpo
  del ciclo (`deleteExpiredProposals`, `getAppSetting "auto_matching_enabled"`)
  ora usano `withBgDbSlot(() => withDbRetry(...))`. Poiché il gate è dentro
  `triggerMatchingRun()`, tutti i caller (scheduler periodico e route admin)
  ereditano automaticamente la protezione senza modifiche aggiuntive.
- Statistiche per le sonde: `getBgDbLimiterStats()` (limiter) e
  `getPoolStats()`/`isPoolHealthy()` (pool) in `server/db.ts`.
