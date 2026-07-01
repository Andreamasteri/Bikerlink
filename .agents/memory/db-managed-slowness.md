---
name: DB managed-Postgres slowness vs pool leak
description: How to tell Replit managed-Postgres slowness apart from our pool saturation/leak, and why downstream-outage alarms are suppressed when ThinkCentre is off.
---

# DB ping lento ≠ pool saturo

Un ping DB lento (>8s) con `waiting=0` NON è una saturazione del nostro pool né una
connection leak: il pool ha connessioni libere e nessuna richiesta in coda. È
lentezza del **Postgres managed di Replit** (compute autoscaling/cold start,
manutenzione lato piattaforma).

Distinzione operativa:
- `waiting > 0` → contesa REALE sul nostro pool → indaga job/leak, riduci la contesa
  (mai alzare pool max oltre 10: il DB è managed).
- `waiting = 0` + ping alto → lentezza managed lato server → NON agire sul pool.
- `waiting = 1` persistente per molti tick (10-30+) IN CONCOMITANZA con "DB ping
  lento"/kill-switch bg-limiter → quasi sempre l'ECO di UNA query reale bloccata
  dalla lentezza managed, non un leak: il pool-collector idle-leak detector (che
  guarda SOLO le connessioni della nostra application_name idle >30s) non trova
  nulla di anomalo in questi episodi, mentre la probe generica "0 query attive"
  logga comunque un warn (falso allarme di leak). Prima di aprire un task di fix,
  controlla SEMPRE l'idle-leak detector: se è pulito, il colpevole è la latenza
  managed, non il codice applicativo. Il fix "sequenzializza Promise.all di setup"
  (vedi pool-promise-all-setup-burst.md) risolve SOLO il burst a 10-12, non
  elimina l'eco a waiting=1 durante gli episodi di ping lento prolungato.

**Why:** durante outage del ThinkCentre (GraphHopper/Valhalla/Redis self-hosted
spenti) il watchdog generava una tempesta di allarmi critici + push (pool.waiting,
ping_saturated, redis unreachable, matching.pending, routing engine_down) che
erano effetti a valle dell'outage, non problemi del nostro DB/pool.

**How to apply:**
- Il ping-spike log in `db-collector.ts` annota esplicitamente `waiting=0 → lentezza
  managed-Postgres, non leak`.
- `aggregator.suppressDownstreamWhenPoweredOff()` declassa (no critical, no push) gli
  allarmi downstream quando `isThinkCentrePoweredOff()` è true. Restano VISIBILI in
  dashboard (severità declassata, non rimossi).
- La lista downstream DEVE essere ESPLICITA, mai per prefisso. Includere SOLO ciò che
  dipende dal ThinkCentre: redis.unreachable, maps.matching.pending, db.pool.waiting,
  db.ping_saturated, db.bg_limiter.queued e routing.engine_down dei SOLI engine
  self-hosted (graphhopper, valhalla).
- NON sopprimere mai per prefisso `maps.health.*` né `routing.engine_down.*`: a
  ThinkCentre spento gli health-check self-hosted sono già saltati a monte, quindi un
  `maps.health.*` residuo è cloud/CDN (mapbox/tomtom/tile) e va lasciato azionabile;
  idem per gli engine_down cloud.
- ESCLUSI dalla soppressione (sempre attivi): `db.circuit_breaker` e `db.ping_ms` —
  segnalano problemi reali del nostro lato anche durante un outage downstream.
- Il push dedicato `maps.health.network_instability` in `alerts.ts` bypassa il loop
  critical-only: va sempre gated sulla severity (solo high/critical notificano) o un
  declassamento futuro lo aggirerebbe.

# Backlog map-matching "fantasma"

Le sessioni `retry` che raggiungono il cap tentativi ora passano allo stato
TERMINALE `exhausted` (prima restavano `retry` a vita → la discovery le escludeva
via `match_attempts < cap` ma il collector le contava → allarme `matching.pending`
sempre alto). `drainStuckRetryBacklog()` (endpoint admin `POST
/map-matching/drain-backlog`) bonifica le righe legacy pre-`exhausted`. I raw non
vengono toccati: restano ri-accodabili via `requeueUnmatchable()` quando l'engine
torna online (che però è no-op con `skipped:true` se il ThinkCentre è spento).

Il collector usa `getMatchingBacklogEstimate()` (conteggio cheap, `withBgDbSlot` +
`statement_timeout 3s`, `backlog:-1 degraded:true` su errore) invece dello stats
completo, per non aggiungere carico al pool durante la saturazione.
