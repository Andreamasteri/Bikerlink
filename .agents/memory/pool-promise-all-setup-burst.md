---
name: Pool burst da Promise.all di setup in job bg
description: Perché job bg con Promise.all di letture di setup saturano il pool DB e come si evita
---

# Pool saturation intermittente = burst Promise.all non budgettati

**Sintomo:** log "Pool DB sotto forte pressione: N client in attesa", N sale a
10-12 poi si azzera in 1-2 tick, servizio mai in crash, pool idle a riposo.

**Root cause (NON i loop, NON findSimilar):** findSimilar è già budgettato con
`withBgDbConnection`. Il vero colpevole è un `Promise.all([...])` di **letture o
scritture di setup a inizio di un job bg**: apre N connessioni del pool
*simultaneamente*. Con pool max=10 un singolo job che apre ~9 conn insieme affama
il traffico utente → picco di "waiting" che poi si azzera quando le read tornano.

**Fix a due livelli (servono ENTRAMBI):**
1. **Sequenzializza il setup:** un job bg che fa più letture/scritture di setup usa
   `await` sequenziali (1 conn alla volta), MAI un `Promise.all` non budgettato.
2. **Budgetta l'INTERA durata del job:** avvolgi tutto il corpo del job in
   `withBgDbSlot(() => ...Inner())` (pattern: rinomina il corpo in `*Inner` + thin
   wrapper). Così al massimo `BG_DB_MAX_CONCURRENCY` (=3) job bg competono per il
   pool per tutta la loro vita, non solo durante il setup.

**Perché serve la re-entrancy (AsyncLocalStorage):** withBgDbSlot/withBgDbConnection
sono ora **rientranti** (contesto async in bg-db-limiter.ts). Un job avvolto in
`withBgDbSlot` chiama `findSimilar` (che usa `withBgDbConnection`) nel loop: il
livello annidato NON riacquisisce lo slot (riusa quello esterno) → niente deadlock,
un solo slot per job. L'annidato prende comunque la sua PoolClient, ma non un
secondo slot del budget. **Questo rende obsoleta la vecchia regola "non annidare
withBgDbSlot".** La sequenzializzazione del setup resta comunque necessaria:
withBgDbSlot limita il # di job concorrenti, NON il # di conn per singolo job.

**How to apply:** vale per music/bio/telemetry affinity, archive stale, enrich
breakdowns e ogni nuovo job schedulato. Nei call site il drop del limiter va gestito
con `isBgDbLimiterDropError` (WARN + recordCycleDrop, riparte al tick dopo), non come
errore generico. Eccezioni OK: fan-out già `pLimit`-bounded (es. backfill
embeddings); burst 2-wide su path user-facing (run-biker, time-profile) NON sono la
causa dei picchi 10-12 e wrapparli/sequenzializzarli aggiungerebbe latenza al path
utente — lasciarli.

**Gate CI:** `scripts/check-bg-promise-all-burst.sh` (in post-merge.sh) scansiona
SOLO `server/matching/**` e `server/jobs/**` e blocca `Promise.all([...])` con >2
elementi letterali o `.map()` fan-out senza `pLimit` visibile nelle righe precedenti.
Burst 2-wide sono tollerati (vedi sopra); soppressione puntuale con commento
`// check-bg-promise-all-burst: safe — <motivo>`. Nessuna baseline: qualsiasi nuova
violazione va sequenzializzata/pLimit-bounded, non congelata.
