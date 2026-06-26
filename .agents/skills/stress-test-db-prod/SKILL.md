---
name: stress-test-db-prod
description: Stress test a lunga durata del database BikerLink (Postgres/Drizzle gestito Replit) con app spenta, per misurare latenze, saturazione pool, errori e contesa sotto carico, e rilevare automaticamente debolezze e incongruenze. Usa questa skill quando l'utente vuole "stressare il DB", "testare il database sotto carico", "stress test prod", "vedere quanto regge il DB", "trovare colli di bottiglia del database", o pianificare un test notturno/24h del DB. Lo strumento è riutilizzabile e aggiornabile — estendi scenari e soglie qui dentro.
---

# Stress Test DB — modello operativo

Strumento per generare **carico controllato e a lunga durata** sul database, ad
**app spenta**, e produrre un report con debolezze rilevate automaticamente.

- Script: `scripts/db-stress-test.ts` (entry CLI) + moduli in `scripts/lib/stress-test/`
- Workflow: `DB Stress Test` (default 24h) — vedi sezione "Workflow"
- Tutte le scritture vivono in tabelle sandbox `_stress_*` create e droppate dallo script: **zero impatto sui dati reali**.

## ⚠️ Prerequisiti — leggere PRIMA di lanciare

1. **App SPENTA (Power mode / nessun traffico utente).** Il DB managed di Replit
   ha un pool fisso (max 10 connessioni). Se l'app è viva, lo stress test e il
   traffico reale si contendono le stesse connessioni: i risultati sono inquinati
   e gli utenti veri subiscono timeout. Ferma i workflow `Start App`/`Start
   Backend` (e watchdog) prima di un run lungo, o esegui in una finestra di
   manutenzione. Per un run 24h serve che il Repl resti acceso (Power/Always-On).
2. **`DATABASE_URL` impostata** nell'environment (lo script esce subito se manca).
3. **Estensioni attive**: `pgvector` (similarity HNSW) e `postgis` (query
   spaziali). Sono già attive nel DB BikerLink; lo script crea gli indici sulle
   tabelle sandbox da solo.
4. **Spazio su disco DB**: lo scenario "write" inserisce milioni di righe in
   `_stress_writes` durante un run lungo. Lo script fa `TRUNCATE` all'avvio e
   `DROP` alla fine, ma durante il run lo spazio è occupato. Tienilo presente su
   DB con quota stretta.

## Uso rapido

```bash
# Smoke test ~10s: valida tutta la pipeline senza carico reale (FALLO SEMPRE prima di un run lungo)
npx tsx scripts/db-stress-test.ts --dry-run

# Run completo 24h, tutti gli scenari a rotazione (default)
npx tsx scripts/db-stress-test.ts --duration=86400 --workers=6 --scenario=all

# Solo saturazione pool, alta concorrenza
npx tsx scripts/db-stress-test.ts --scenario=saturation --workers=20 --duration=3600

# Run silenzioso (senza progress bar, per log non presidiato)
npx tsx scripts/db-stress-test.ts --duration=43200 --quiet
```

### Flag

| Flag | Default | Significato |
|------|---------|-------------|
| `--duration=<sec>` | `86400` (24h) | Durata totale del test in secondi |
| `--workers=<n>` | `6` | Worker concorrenti (loop indipendenti che martellano il DB) |
| `--scenario=<s>` | `all` | `all` \| `read` \| `write` \| `saturation` \| `mixed` |
| `--dry-run` | off | Smoke test rapido (~10s, seed ridotto, tick ogni 2s) |
| `--quiet` | off | Nessuna progress bar; restano tick e report |

## Scenari

| Scenario | Carico | Cosa stressa |
|----------|--------|--------------|
| `read` | Similarity HNSW (`embedding <=> $1::vector`) + PostGIS `ST_DWithin` | Letture pesanti indicizzate: uso indici, piano query, cache |
| `write` | INSERT batch in `_stress_writes` | Write throughput, WAL, autovacuum, integrità sotto concorrenza |
| `saturation` | Mix di op con **`testPool.max < workers`** | Saturazione pool: code di `connect()`, `POOL_TIMEOUT`, backpressure |
| `mixed` | 60% read / 30% write / 10% spatial | Profilo realistico misto |
| `all` | I quattro scenari **a rotazione** lungo la durata | Stress completo non presidiato |

In `saturation` lo script imposta di proposito il pool di test a metà dei worker
(`max = floor(workers/2)`) con `connectionTimeoutMillis = 5s`: i worker in eccesso
accodano la `connect()` e, se non ottengono una connessione in tempo, registrano
un errore `POOL_TIMEOUT` — il segnale diretto di saturazione sostenuta.

## Architettura (due pool isolati)

Lo script è **self-contained**: NON importa `server/db.ts` e crea due pool propri,
così non avvia il pool dell'app (max=10) né la logica di boot del server.

- **testPool** (load generator): `max = workers` (o `floor(workers/2)` in
  saturation), `statement_timeout = 10s`, `connectionTimeoutMillis = 5s`.
- **monPool** (monitoraggio, `max=1`): isolato dal carico, legge
  `pg_stat_activity`/`pg_locks`, esegue `EXPLAIN` e inserisce in
  `resource_samples`. Tenerlo separato evita che il monitoraggio rubi connessioni
  al test o ne falsi le metriche.

> **Nota di deviazione dal piano originale**: il task chiedeva di riusare il
> `monitoringPool` di `server/db.ts`. Si è scelto un pool dedicato nello script
> per non istanziare il modulo DB dell'app (che fa side-effect di boot) durante
> un test che gira ad app spenta. Stesso ruolo, isolamento migliore.

## Output e logging

Tutti i file sono in `logs/` (gitignored):

| File | Contenuto |
|------|-----------|
| `logs/stress-test-YYYY-MM-DD.jsonl` | Stream append-only: una riga per tick (60s) + eventi `critical` immediati + riga finale `report` |
| `logs/stress-test-live.json` | Stato vivo riscritto a ogni tick: progresso %, query/errori totali, ultimo tick, findings interim. **Leggi questo per monitorare un run in corso senza fermarlo.** |
| `logs/stress-test-YYYY-MM-DD-report.json` | Report finale: istogramma latenze, fasi critiche, findings, raccomandazioni |
| tabella `resource_samples` (`source='stress_test'`) | Un campione per tick (db size, RSS) per correlare con la telemetria storica |

Gli eventi critici (deadlock `40P01`, timeout `57014`, `too_many_connections`
`53300`, `POOL_TIMEOUT`, lock wait) sono scritti nel `.jsonl` **all'istante**, con
throttling per codice (max 1 ogni 5s) per non inondare il file durante una
tempesta.

### Monitorare un run lungo senza fermarlo

```bash
# Stato sintetico corrente
cat logs/stress-test-live.json | npx tsx -e "const d=require('fs').readFileSync(0,'utf8');const j=JSON.parse(d);console.log(j.progressPct+'% q='+j.totalQueries+' err='+j.totalErrors)"

# Ultimi tick
tail -5 logs/stress-test-$(date +%F).jsonl

# Solo gli eventi critici
grep '"type":"critical"' logs/stress-test-$(date +%F).jsonl
```

## Rilevamento debolezze (findings)

Il motore (`scripts/lib/stress-test/findings.ts`) valuta queste regole e produce
findings con severità `info` / `warn` / `critical`, ognuno con evidenza numerica e
raccomandazione:

| Categoria | Trigger (soglia in `THRESHOLDS`) |
|-----------|----------------------------------|
| `latency` | p99 di tick ≥ 1000ms (warn) / ≥ 3000ms (critical) |
| `latency` (trend) | p99 dell'ultimo terzo +75% (warn) / +200% (critical) vs primo terzo → degrado nel tempo (bloat, cache fredda, lock crescenti) |
| `pool` | % tick con pool pieno ≥ 30% (warn) / ≥ 60% (critical) |
| `errors` | error rate ≥ 1% (warn) / ≥ 5% (critical) + cluster per codice noto |
| `lock` | PID bloccati / waiter su Lock da `pg_locks` |
| `index` | `Seq Scan` in `EXPLAIN` su tabella con ≥ 2000 righe stimate → indice mancante/non usato |
| `integrity` | `_stress_writes`: write perse (conteggio ≠ atteso), id duplicati, payload NULL sotto concorrenza |

Severità: **critical** = intervenire (collo di bottiglia o corruzione reale);
**warn** = tenere d'occhio / transitorio sotto stress; **info** = nessuna azione.

## Cleanup e interruzione

- Su `SIGTERM`/`SIGINT` (stop del workflow o Ctrl-C) lo script ferma i worker,
  genera il **report parziale**, verifica l'integrità e **droppa le tabelle
  sandbox** prima di uscire. Non lascia tabelle orfane.
- Le tabelle sandbox sono comunque idempotenti: al riavvio fa `CREATE IF NOT
  EXISTS` + `TRUNCATE`, quindi un crash precedente non sporca il run successivo.

## Workflow / come lanciarlo

Il limite di workflow del Repl (max 10) è già saturo, quindi **non c'è un
workflow dedicato registrato**: lo stress test si lancia col comando `npx tsx`
diretto, che è il modo canonico e pienamente equivalente.

```bash
# Run completo 24h, tutti gli scenari a rotazione
npx tsx scripts/db-stress-test.ts --duration=86400 --workers=6 --scenario=all
```

- Per un run lungo non presidiato aggiungi `--quiet` e lancialo in background
  (es. `nohup ... &`), poi monitora `logs/stress-test-live.json`.
- Per fermarlo: `Ctrl-C` o `kill <pid>` (manda `SIGTERM`) → cleanup + report
  parziale automatici.
- Per cambiare durata/scenario, cambia i flag — nessun file da editare.

> Se in futuro si libera uno slot workflow, si può registrare un workflow
> `DB Stress Test` (output type `console`, **senza** autostart e **fuori** dalla
> validazione run-all) con lo stesso comando qui sopra.

## Calibrazione soglie (ritaratura post primo run reale)

Le soglie iniziali erano stime ragionevoli ma non calibrate sul comportamento del
DB managed Replit. Dopo il primo run reale sono state ritarate per eliminare i
falsi positivi (Task #4975). Le motivazioni, da rileggere prima di toccarle:

- **`p99WarnMs` 500 → 1000, `p99CriticalMs` 2000 → 3000.** Il DB managed Replit
  ha jitter sub-secondo costante anche a basso carico: nel run reale gli endpoint
  DB-bound stavano a p50≈19ms / p90≈344ms / p95≈777ms, con blip isolati a 5-11s
  (cold cache, autovacuum, jitter di piattaforma). Un warn a 500ms scattava su
  quasi ogni tick. 1s separa la pressione reale dal rumore; 3s sta vicino allo
  `statement_timeout` (8s mon / 10s test), cioè la zona di pericolo vera.
- **`poolFullPctWarn` 20 → 30, `poolFullPctCritical` 50 → 60.** In `all` la fase
  `saturation` gira ~1/4 del run con `testPool.max = floor(workers/2)`: il pool è
  pieno PER DESIGN in quella finestra, quindi ~25% dei tick risultano "pieni"
  anche quando va tutto bene. Un warn a 20% scattava a ogni run. 30/60 tollerano
  il quarto di saturazione intenzionale e segnalano solo l'eccesso patologico.
- **`latencyTrendWarnPct` 50 → 75, `latencyTrendCriticalPct` 150 → 200.** Il
  confronto primo-terzo vs ultimo-terzo è sensibile al cold-cache iniziale e ai
  blip di piattaforma: pochi spike in un terzo spostano la media >50% senza un
  degrado reale. 75/200 filtrano il jitter mantenendo il segnale di degrado vero
  (bloat, dead tuple, lock crescenti) sui run lunghi.
- **`seqScanRowsThreshold` 5000 → 2000.** I seed sandbox sono `embeddings=1000` e
  `spatial=5000` (`scripts/db-stress-test.ts`). A 5000 la regola non scattava mai
  (la spatial, dopo il filtro `ST_DWithin`, stima meno righe; la embeddings ha
  solo 1000 righe). 2000 sta sopra la embeddings — dove su 1000 righe il planner
  sceglie legittimamente il seq scan, quindi niente falso positivo — e sotto la
  spatial, così un indice GIST non usato produce un seq scan ~5000 che ora viene
  finalmente segnalato. Se aumenti i seed, rivedi anche questa soglia.
- **`errorRateWarn`/`errorRateCritical` invariate (1%/5%).** Il run reale non ha
  prodotto una distribuzione di errori *DB* pulita (i 502 osservati erano dello
  strato app/AI, non query DB), quindi non c'era una base solida per ritararle.
  1%/5% restano standard difendibili; la sfumatura "errore atteso sotto stress"
  (es. `POOL_TIMEOUT` durante `saturation`) è già gestita dai cluster per-codice.

> Quando ritari di nuovo: confronta sempre le soglie con la distribuzione reale
> dei tick (`logs/stress-test-*.jsonl` del run più recente — istogramma latenze,
> `poolFullPct` per fase, `errorCodes`) prima di cambiare i numeri, e aggiorna in
> lockstep sia `THRESHOLDS` (con i commenti inline) sia la tabella più sopra.

## Come estendere (skill aggiornabile)

- **Nuova soglia / ritaratura**: modifica `THRESHOLDS` in
  `scripts/lib/stress-test/findings.ts`.
- **Nuovo scenario**: aggiungi il caso in `pickOp`/`executeOp`
  (`scripts/lib/stress-test/scenarios.ts`) e, se serve, una tabella sandbox in
  `scripts/lib/stress-test/sandbox.ts`.
- **Nuova query da analizzare con EXPLAIN**: aggiungila a `EXPLAIN_SAMPLES` in
  `findings.ts`.
- **Nuova regola di finding**: aggiungi una funzione e richiamala in
  `buildFindings`.
- Rispetta il gate "600 righe / file" (split a ≤450): i moduli sono già divisi
  per responsabilità (types, sandbox, scenarios, metrics, findings, report).

## Cosa NON fa

- Non testa l'API HTTP né la logica applicativa: stressa **solo il DB**.
- Non tocca le tabelle reali: scrive esclusivamente in `_stress_*`.
- Non va lanciato con l'app viva in produzione con utenti attivi (vedi
  Prerequisiti).
