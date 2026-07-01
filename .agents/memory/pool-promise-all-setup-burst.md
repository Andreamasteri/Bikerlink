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

**Regola:** un job bg che fa più letture/scritture di setup deve usare `await`
sequenziali (1 conn alla volta), MAI un `Promise.all` non budgettato.

**Why sequenziale e non `withBgDbSlot`:** withBgDbSlot NON va annidato (deadlock,
vedi memoria dedicata) e findSimilar già acquisisce uno slot nel loop; wrappare il
setup rischierebbe nesting. Sono letture one-shot per-run → la latenza extra è
irrilevante.

**How to apply:** vale per music/bio/telemetry affinity, archive stale, enrich
breakdowns e ogni nuovo job schedulato. Eccezioni OK: fan-out già `pLimit`-bounded
(es. backfill embeddings); burst 2-wide su path user-facing (run-biker,
time-profile) NON sono la causa dei picchi 10-12 e sequenzializzarli aggiungerebbe
latenza al path utente — lasciarli.
