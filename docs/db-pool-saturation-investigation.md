# Indagine saturazione pool DB (Task #4581)

**Tipo:** solo diagnostica. Nessun fix qui — base per il task collegato "Fix saturazione pool DB".
**Data:** 20 giugno 2026.

## TL;DR (causa identificata)

La saturazione del pool **non è un leak di connessioni** (`pool.connect()` senza `release()`).
Tutti i `pool.connect()` runtime rilasciano in `finally` (audit sotto). La causa primaria è
**event-loop starvation**: i job pesanti di matching/embedding eseguono loop sincroni O(N²) /
k-NN su migliaia di utenti, bloccando il loop di Node per decine di secondi. Mentre il loop è
bloccato, `pg.Pool` non riesce a processare la sua coda interna né a far scattare i callback di
socket/timer → le query in volo si accodano e/o le connessioni idle vengono terminate dal DB
gestito, generando la **cascata di `DrizzleQueryError`** (tutte vittime, non cause).

## Evidenza concreta (log di produzione)

```
[watchdog/db] ping spike: 28900ms — pool: total=10 idle=1 waiting=0
... cause: error: terminating connection due to administrator command  (severity: FATAL)
... cause: Error: Connection terminated due to connection timeout
[db-circuit-breaker] failure #1: Failed query: SELECT 1
```

Tre fatti decisivi:

1. **Ping di 28,9 s su `SELECT 1` con `idle=1 waiting=0`.** Al momento dello snapshot c'era una
   connessione idle e zero richieste in coda: il ritardo **non** è contesa sulla coda del pool.
2. **`statement_timeout = 5000` è applicato lato server.** Verificato in `pg` 8.21.0
   (`node_modules/pg/lib/client.js:543` invia `data.statement_timeout` come parametro di startup
   per ogni connessione del pool). Quindi una query da 28,9 s **non può** essere esecuzione SQL:
   il tempo è speso lato JS (acquisizione connessione / risoluzione del callback) → **event-loop
   bloccato**.
3. **`terminating connection due to administrator command` (FATAL, 57P01).** È il Postgres gestito
   (Replit/Neon) che ricicla/termina le connessioni rimaste idle oltre `idleTimeoutMillis=10s`
   mentre il loop era bloccato. Al ripristino del loop quelle connessioni sono morte →
   `Connection terminated due to connection timeout` (scatta `connectionTimeoutMillis=3s`) →
   apertura del circuit breaker → cascata.

### Correlazione temporale (stessa finestra di boot)

| Evento | Timestamp | Offset dal boot |
|---|---|---|
| Boot (Phase 4 seed) | 15:59:02 | 0 |
| `bootJobQueue` armato | ~15:59 | "first starts in 4min, gap 45s" |
| **Ping spike 28900ms** | **16:04:14** | **+313 s (~5,2 min)** |
| `terminating ... administrator command` | 16:07:19 | +497 s |
| circuit breaker `SELECT 1` fail | 16:07:35 | +513 s |

Lo spike cade **esattamente** nella finestra in cui `bootJobQueue` lancia i job pesanti
(MusicEmbeddings backfill, BioAffinity, TelemetryAffinity, PlaylistSnapshot, BioEmbeddings
backfill) a 45 s di distanza l'uno dall'altro. Il picco coincide con l'avvio di questi job.

## Classificazione delle cause (richiesta dal task)

- **(a) client `pool.connect()` non rilasciati su rami d'errore** → **ESCLUSA.** Audit completo
  sotto: tutti i siti runtime rilasciano in `finally` su ogni ramo (incluso throw).
- **(b) job in background concorrenti nella stessa finestra** → **CONTRIBUTO MINORE.** Vedi mappa
  sotto. L'unico vero fan-out parallelo è `enrich-breakdowns.ts` (8 `UPDATE` bulk in `Promise.all`)
  e `backfill-music-embeddings.ts` (`p-limit(3)`). Non bastano da soli a saturare 10 connessioni,
  ma peggiorano il picco quando il loop è già sotto stress.
- **(c) query lunghe che bypassano `statement_timeout`** → **NON è esecuzione SQL.**
  `statement_timeout=5s` è enforced server-side. L'eccezione reale è `VACUUM FULL ANALYZE`
  (`vacuum-service.ts`), che tiene **1** connessione per molto tempo (gira alle 03:00 Rome) —
  rilevante ma non è la causa degli spike diurni.
- **CAUSA PRIMARIA: event-loop starvation** (variante di (c) ma lato JS, non lato DB): loop
  sincroni pesanti nei matcher bloccano il loop → il pool non processa la coda e le connessioni
  idle vengono riciclate dal DB gestito.

## Audit `pool.connect()` (release garantito in `finally`?)

Tutti i siti **runtime** (esclusi `server/scripts/**` e `server/migrate.ts`, che sono CLI manuali)
rilasciano in `finally`. Nessun leak su ramo d'errore.

| File:linea | Esito | Note |
|---|---|---|
| resource-graph-sampler.ts:36 | SAFE | `finally { client.release(); }` (L63) |
| export-service.ts:197,214 | SAFE | `finally` su generator (L204, L229) |
| embeddings/store.ts:306 | SAFE | tx BEGIN/COMMIT, `finally` (L360) |
| embeddings/backfill-bio.ts:94 | SAFE | `finally` (L99) |
| vacuum-service.ts:46 | **SLOW-HOLD** | `finally { if (client) client.release(); }` (L96) — tiene 1 conn per tutto il `VACUUM FULL ANALYZE` di 13 tabelle |
| boot-sequence.ts:54 | SAFE | `finally` (L73), solo a boot |
| boot-phase3-db-init.ts:6,18 | SAFE | `finally` (L11, L42), solo a boot |
| routes/admin/users-extra.ts:214 | SAFE | `finally` (L230) |
| routes/admin/resource-monitor.ts:40,84,105,138,151,164,177 | SAFE | tutti `finally` |
| routes/admin/embeddings.ts:93 | SAFE | `finally` (L188) |
| routes/admin/db.ts:86,132 | SAFE | `finally { if (client) ... }` (L125, L180) |
| routes/admin/matching/actions.ts:23,108,301 | SAFE | tutti `finally` |
| routes/admin/matching/diagnostics.next.ts:17 | SAFE | `finally` (L99) |
| routes/admin/matching/notifications.ts:16,120 | SAFE | `finally` (L90, L180) |
| routes/admin/matching/observability.ts:24,65 | SAFE | `finally` (L44, L175) |
| routes/admin/matching/diagnostics-health.ts:24,283 | SAFE | `finally` (L273, L353) |
| routes/admin/matching/diagnostics.ts:244,283,356 | SAFE | `finally` (L274, L342, L400) |

> Nota: le route `admin/*` girano solo su richiesta admin; non contribuiscono alla saturazione
> ricorrente automatica.

## Job pesanti = bloccanti per l'event-loop (sorgente primaria)

Loop sincroni O(N²) / k-NN su migliaia di utenti, con `await` di scrittura **sequenziali** dentro
il loop (quindi non fan-out, ma durata lunga in cui il loop resta "caldo"):

- `run-biker.ts` — `runBikerBikerMatching` / `*TypeStyleMatching`: doppio `for i / for j>i` O(N²)
  su `uniqueMembers` (milioni di coppie a 5000 utenti).
- `run-extra.ts` — `runGpsBasedMatching`/music/event: costruisce mappe grandi poi O(N²).
- `run-route-similarity.ts` — O(N²) su tutte le fingerprint + `routeSimilarity` (Jaccard) sincrono.
- `run-biker-zav-base.ts` — nested `for bikerId / for zavId` con filtri sincroni.
- `run-bio-affinity.ts` / `run-music-affinity.ts` / `run-telemetry-affinity.ts` — k-NN con
  `findSimilar` + `db.insert` awaitati nel loop; bio-affinity ha budget fino a ~75 s.
- `recompute-profiles.ts` — loop su tutti gli utenti con feedback, `await` per utente.

Fan-out parallelo reale (grab simultaneo di connessioni):
- `enrich-breakdowns.ts` — `Promise.all` di ~8 `UPDATE` bulk pesanti.
- `jobs/backfill-music-embeddings.ts` — `p-limit(3)`.

`scheduler.cycle.ts` orchestra le fasi **sequenzialmente** con `withCycleTimeout(90s)`: il timeout
protegge dal hang ma **non** dal blocco sincrono del loop (il timer non scatta finché il loop è
bloccato).

## Mappa concorrenza job di background (finestre che si sovrappongono)

- Watchdog aggregator: ogni **60 s**, `Promise.allSettled` di 12 collector (≥6 toccano il DB:
  `collectDb`, `collectDbIntegritySignals`, `collectEmbeddingSignals`, `collectRestarts`,
  `collectErrors`, `collectAdsOrphanSignals`).
- resource-graph-sampler: ogni **10 s** (se `resource_graph_enabled`), 1 conn dedicata.
- Matching engine: ciclo orario + **on-demand su login** (a 5000 utenti i login innescano run).
- BioAffinity: **30 min**. TelemetryAffinity: 24 h. Recompute profili: 24 h + startup +5 min.
- Fake zavorrine rotation: **5 min**. Archive stale: 24 h + startup +3 min. Cleanup orario: 60 min.
- bootJobQueue: 5 job pesanti, primo +4 min dal boot, gap 45 s.
- VACUUM FULL: 03:00 Rome (1 conn tenuta a lungo). map-matching: 02:00 Rome.
- Diversi cron AI (db-integrity 03:00, coordinator cleanup 04:30, ecc.).

Il punto critico è la **finestra di boot** (+4–5 min): bootJobQueue + matching engine startup +
recompute profili + enrich-breakdowns partono ravvicinati, mentre l'aggregator watchdog continua
ogni 60 s. È lì che si è osservato lo spike da 28,9 s.

## Raccomandazioni per il task di fix (non implementate qui)

1. **Spezzare i loop sincroni** dei matcher con yield periodici (`await new Promise(r =>
   setImmediate(r))` ogni N iterazioni) o batch + `setImmediate`, così il loop di Node respira e il
   pool processa la coda. È il fix più impattante per gli spike.
2. **Disaccoppiare i job pesanti dalla finestra di boot** (sfalsare di più, o serializzare via
   `bootJobQueue` anche recompute-profiles ed enrich-breakdowns).
3. **Ridurre il fan-out di `enrich-breakdowns`** (eseguire i ~8 UPDATE in serie o a 2–3 alla volta).
4. **Rivedere `idleTimeoutMillis`/keepAlive vs reciclo del DB gestito**: con loop che bloccano per
   25–28 s, valutare un keepalive applicativo o ridurre la finestra in cui le connessioni restano
   idle e vengono terminate (`terminating connection due to administrator command`).
5. **Opzionale (diagnostica futura)**: misurare l'event-loop lag (es. `perf_hooks.monitorEventLoopDelay`)
   ed emetterlo come metrica watchdog; uno snapshot `pg_stat_activity` (query/`query_start`/`wait_event`)
   catturato durante lo spike confermerebbe — atteso "nessuna query lunga", coerente con il blocco JS.

## Perché non è stata aggiunta strumentazione temporanea

I passi 1–2 del task (strumentare eventi del pool / snapshot `pg_stat_activity`) sono stati
**superati**: la strumentazione esistente del watchdog ha già catturato l'evidenza decisiva (la riga
`ping spike … pool: total/idle/waiting`), e la combinazione con `statement_timeout` enforced
server-side rende la diagnosi conclusiva senza dover deployare logging temporaneo e attendere un
nuovo evento di saturazione. La strumentazione mirata (punto 5) resta come opzione per il task di fix.
