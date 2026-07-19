---
name: analisi-log-horus
description: Triage completo dello stato di salute BikerLink via Horus (qwen3:4b). Aggrega DB interno, log filesystem, GitHub Issues/Actions, Sentry EU e albero repo GitHub, li invia a Horus per un'analisi AI strutturata, fa revisionare i task proposti da Horus-architect, e li propone automaticamente nel pannello Replit. Usa quando l'utente dice "analisi log", "triage sistema", "cosa non va", "proponi task da Horus", o vuole un report sullo stato di salute senza leggere manualmente le sorgenti.
---

# Analisi Log con Horus — Triage AI completo BikerLink

> **Nomi delle istanze Ollama** (vedi `.agents/memory/ollama-naming.md`):
> - **Horus** / **Bowie** = `OLLAMA_*` — ThinkCentre: usati da QUESTA skill per l'analisi (Horus) e come assistente in-app (Bowie).
> - **Ares** = `ARES_OLLAMA_*` — PC fisso (GPU): usato da altre skill (es. ollama-diagnostics); NON da questa skill.

Skill che esegue un **triage automatico completo** del sistema BikerLink aggregando fonti di dati (26+ tabelle DB, 12 file di log, GitHub Issues/Actions con dettaglio job, Sentry con evento completo top-5, albero repo GitHub, git log ultimi 30 commit, risoluzione sorgenti dagli stack trace, report triage precedente) e inviandole a **Horus** (ThinkCentre, modello `qwen3:4b`) per un'analisi AI strutturata. Dopo il report principale, una **seconda chiamata a Horus** (ruolo architect) filtra i task proposti contro il backlog esistente. Infine i task validati vengono scritti come file plan in `.local/tasks/horus-*.md` e come manifest `logs/horus-tasks-pending.json` — pronti per essere proposti formalmente nel pannello Replit dall'agente.

> **Nota tecnica**: la proposta formale (`bulkCreateProjectTasks`) richiede il contesto dell'agente Replit e non può essere invocata direttamente da un processo TypeScript. Lo script prepara tutti i file necessari; l'agente li legge e crea i task PROPOSED (task #311 traccia l'automazione completa di questo step).

## Quando usarla

- L'utente scrive "analisi log", "triage sistema", "cosa non va".
- Vuoi un report sullo stato di salute prima di pianificare nuovi task.
- Vuoi che Horus proponga task basandosi sullo stato reale del sistema.
- Prima di una sessione di pianificazione (Horus propone → architect revisiona → agente crea → utente approva).

## Come lanciarla — metodo rapido (1 click)

Il triage è disponibile come **workflow Replit**. Nel pannello Workflows del progetto:

- **"Triage Horus"** — esegue il triage completo su tutte le fonti, salva il report in `logs/`, fa la revisione architect e prepara i task da proporre.
- **"Planning Session"** — esegue il triage completo e poi stampa il percorso del report più recente, pronto per la sessione di pianificazione.

## ⚠️ Shell planner: usa HORUS_LOG_DIR=/tmp

La **shell del planner** (agente Replit in modalità task) è **read-only sull'intero workspace**. Quando lo script tenta di scrivere in `logs/`, la piattaforma intercetta la syscall **prima** che Node.js possa catturarla nel try/catch, causando **exit 254** e l'interruzione del triage prima che il report venga stampato su stdout.

**Soluzione**: imposta `HORUS_LOG_DIR=/tmp` e `HORUS_BACKLOG_DIR=/tmp` per redirigere output, manifest e backlog su `/tmp`, che è sempre scrivibile:

```bash
HORUS_LOG_DIR=/tmp HORUS_BACKLOG_DIR=/tmp npx tsx scripts/log-analysis-horus.ts
HORUS_LOG_DIR=/tmp npx tsx scripts/horus-propose-tasks.ts
```

**Distinguere gli errori:**
- **Exit 254** (filesystem read-only) → usa `HORUS_LOG_DIR=/tmp`
- **Exit 1** (ThinkCentre spento / Cloudflare Tunnel giù) → verifica che il TC sia online e Ollama in esecuzione

**Nota**: i file plan `.local/tasks/horus-*.md` vengono scritti come prima — `.local/` è sempre scrivibile anche nella shell planner.

**Tre modalità di esecuzione:**
| Modalità | Comando | Note |
|---|---|---|
| **Workflow** (raccomandato) | Pannello Workflows → "Triage Horus" | Scrive in `logs/`, nessun flag extra |
| **Shell build** | `npx tsx scripts/log-analysis-horus.ts` | Workspace scrivibile, usa `logs/` |
| **Shell planner** | `HORUS_LOG_DIR=/tmp HORUS_BACKLOG_DIR=/tmp npx tsx scripts/log-analysis-horus.ts` | `/tmp` sempre scrivibile |

> **Nota `HORUS_BACKLOG_DIR`**: controlla dove viene scritto `horus-backlog.json` (default: `.local/`). Senza questo flag, anche con `HORUS_LOG_DIR=/tmp` lo script tenta di scrivere il backlog in `.local/` — causando exit 254 nella shell planner.

## Come lanciarla — da terminale

```bash
# Triage completo (tutte le fonti) + revisione architect + proposta task
npx tsx scripts/log-analysis-horus.ts

# Solo fonti interne (no GitHub, no Sentry, no repo tree)
npx tsx scripts/log-analysis-horus.ts --only-internal

# Più righe di log dal filesystem
npx tsx scripts/log-analysis-horus.ts --tail 500

# Dry-run: mostra il bundle che verrebbe inviato a Horus, non chiama niente
npx tsx scripts/log-analysis-horus.ts --dry-run

# Salta la fase di proposta formale (solo report + revisione architect)
npx tsx scripts/log-analysis-horus.ts --no-propose

# Combinabile
npx tsx scripts/log-analysis-horus.ts --only-internal --tail 100 --dry-run

# Script companion (proposta task da un report già esistente)
npx tsx scripts/horus-propose-tasks.ts
npx tsx scripts/horus-propose-tasks.ts --report logs/horus-log-analysis-<ts>.md

# Sessione di pianificazione (triage + path report)
bash scripts/start-planning-session.sh
```

## Dove trovare i report

I report vengono stampati su stdout e salvati in:

```
logs/horus-log-analysis-<timestamp>.md         # report principale
logs/horus-log-analysis-<timestamp>-architect.md  # revisione architect
logs/horus-tasks-pending.json                  # manifest task pronti da proporre
```

Per trovare il più recente:

```bash
ls -t logs/horus-log-analysis-*.md | head -1
```

## Flusso completo (6 passi)

```
1. Dump log       → 26+ tabelle DB, 12 file filesystem, GitHub Issues/Actions (con job detail),
                    Sentry (lista + evento completo top-5), git log ultimi 30 commit,
                    risoluzione sorgenti stack trace, report triage precedente
2. Repo tree      → GET /repos/Andreamasteri/Bikerlink/git/trees/HEAD?recursive=1
3. Horus analizza → report con ## PROBLEMI TROVATI / ## ANALISI CAUSE /
                                ## CORRELAZIONI TROVATE / ## TASK PROPOSTI
4. Architect revisiona → seconda chiamata Horus (ruolo architect): de-duplicazione vs backlog,
                          scarto task vaghi/senza evidenza letterale → ## TASK VALIDATI / ## TASK SCARTATI
5. Preparazione   → horus-propose-tasks.ts scrive .local/tasks/horus-<slug>.md per ogni
                    task valido + manifest logs/horus-tasks-pending.json
6. Proposta formale → l'agente Replit legge il manifest e chiama bulkCreateProjectTasks;
                      i task appaiono nel pannello con stato PROPOSED, pronti da approvare
```

> L'utente lancia `npx tsx scripts/log-analysis-horus.ts`, attende ~1-2 minuti (due chiamate Horus),
> e trova i file plan e il manifest pronti. Per completare la proposta nel pannello, chiede all'agente:
> **"Proponi i task Horus pendenti"** — l'agente legge `logs/horus-tasks-pending.json` e li crea.
> (Task #311 traccia l'automazione completa senza questo passaggio manuale.)

## Flusso: sessione di pianificazione

Prima di ogni sessione di pianificazione ("cosa facciamo adesso?", "proponi task", "revisione piano"):

1. **Lancia il workflow "Planning Session"** (o `bash scripts/start-planning-session.sh`).
2. **Horus analizza** — aggrega le fonti e produce il report con `## TASK PROPOSTI DA HORUS`.
3. **Horus-architect revisiona** — filtra duplicati, task vaghi e task senza evidenza letterale.
4. **I file plan vengono preparati** in `.local/tasks/horus-*.md` + manifest `logs/horus-tasks-pending.json`.
5. **Chiedi all'agente** "Proponi i task Horus pendenti" — l'agente legge il manifest e li crea nel pannello.
6. **L'utente approva** — decide quali task accettare e mettere in lavorazione.

## Fonti raccolte

| Fonte | Disponibilità | Secret richiesto | Fallback |
|---|---|---|---|
| **DB — app_crash_logs** (60 righe, con stack_trace/session_id/device_model completi) | sempre | `DATABASE_URL` | skip graceful |
| **DB — app_crash_logs distribuzione** (COUNT per crash_type/platform) | sempre | `DATABASE_URL` | skip graceful |
| **DB — ai_watchdog_log** (80 righe, con details JSONB) | sempre | `DATABASE_URL` | skip graceful |
| **DB — system_signals** (80 high/critical, con details JSONB) | sempre | `DATABASE_URL` | skip graceful |
| **DB — system_signals distribuzione** (24h, GROUP BY source/metric/severity) | sempre | `DATABASE_URL` | skip graceful |
| **DB — diagnostic_reports** (ultimi 15, completi) | sempre | `DATABASE_URL` | skip graceful |
| **DB — ai_call_logs** (50 degraded/errore, con campo error) | sempre | `DATABASE_URL` | skip graceful |
| **DB — ai_call_logs security_blocked** (ultimi 20) | sempre | `DATABASE_URL` | skip graceful |
| **DB — ai_call_logs distribuzione** (48h, GROUP BY provider/model) | sempre | `DATABASE_URL` | skip graceful |
| **DB — ota_watchdog_reports** | se tabella esiste | `DATABASE_URL` | skip graceful |
| **DB — app_settings** (tutte le chiavi, ordinato per key) | sempre | `DATABASE_URL` | skip graceful |
| **DB — system_health_snapshot** (ultimi 3, con problems/metrics JSONB) | sempre | `DATABASE_URL` | skip graceful |
| **DB — db_monitor_history** (carico orario ultime 24h aggregato) | sempre | `DATABASE_URL` | skip graceful |
| **DB — feedback_tickets aperti** (ultimi 20, con message completo) | sempre | `DATABASE_URL` | skip graceful |
| **DB — db_integrity_runs** (ultimi 5) | sempre | `DATABASE_URL` | skip graceful |
| **DB — db_integrity_violations** non risolte (ultime 30) | sempre | `DATABASE_URL` | skip graceful |
| **DB — ai_analysis_runs** (ultimi 10) | sempre | `DATABASE_URL` | skip graceful |
| **DB — ai_knowledge_gaps open** (top 20 per occorrenze) | sempre | `DATABASE_URL` | skip graceful |
| **DB — ai_vps_jobs** (ultimi 10) | sempre | `DATABASE_URL` | skip graceful |
| **DB — maps_telemetry_events errori** (ultimi 50) | sempre | `DATABASE_URL` | skip graceful |
| **DB — pipeline_probe_history** (ultimi 10) | se tabella esiste | `DATABASE_URL` | skip graceful |
| **DB — ota_releases** (ultimi 5, completi) | sempre | `DATABASE_URL` | skip graceful |
| **DB — ota_boot_events fallimenti** (ultimi 30) | sempre | `DATABASE_URL` | skip graceful |
| **DB — weekly_system_reports** (ultimo 1, payload JSONB) | sempre | `DATABASE_URL` | skip graceful |
| **DB — pg_stat_user_tables** (top 20 per n_dead_tup) | sempre | `DATABASE_URL` | skip graceful |
| **DB — pg_stat_activity** (connessioni active/idle-in-transaction) | sempre | `DATABASE_URL` | skip graceful |
| **Log filesystem** (12 file: `/tmp/server-crash.log`, `/tmp/backend.log`, `logs/backend-crashes.log`, `logs/error-monitor.log`, `logs/cerbero.log`, `logs/watchdog.log`, `logs/uptime-resets.log`, `logs/ota-timing.log`, `logs/apk-build-current.log`, `logs/cleanup-cache.log`, `/tmp/metro.log`, `/tmp/metro-session.log`) | se file presente | — | file mancanti saltati con nota |
| **Git log** (ultimi 30 commit con file toccati, via `git log --oneline --name-only -30`) | se git disponibile | — | skip graceful con nota |
| **Stack trace file resolution** (estrae path sorgente dagli stack trace, legge ±10 righe attorno) | se crash log presenti | — | skip graceful per file assenti |
| **Report triage precedente** (sezioni PROBLEMI/TASK dall'ultimo `logs/horus-log-analysis-*.md`) | se file presente | — | skip graceful |
| **GitHub Issues** (label bug, aperti, 20 — corpo 1000 char) | opzionale | `GITHUB_TOKEN` o `DIAG_GITHUB_TOKEN` | skip con avviso se token assente |
| **GitHub Issues** (label enhancement + performance, separata) | opzionale | `GITHUB_TOKEN` o `DIAG_GITHUB_TOKEN` | skip con avviso |
| **GitHub Actions** (run falliti, dettaglio job e step falliti per top-5) | opzionale | `GITHUB_TOKEN` o `DIAG_GITHUB_TOKEN` | skip con avviso |
| **GitHub repo tree** (albero ricorsivo HEAD) | opzionale | `GITHUB_TOKEN` o `DIAG_GITHUB_TOKEN` | skip con avviso |
| **Sentry EU** (25 issue non risolti + evento completo per top-5 con stacktrace frames) | opzionale | `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` | skip con avviso |

## Secret / variabili d'ambiente

| Variabile | Tipo | Stato | Note |
|---|---|---|---|
| `OLLAMA_URL` | Secret | **necessario** | URL Horus (ThinkCentre) via Cloudflare Tunnel, es. `https://tc.biker-link.net` |
| `OLLAMA_MODEL` | Env/Secret | opzionale | Default `qwen3:4b` |
| `OLLAMA_TOKEN` | Secret | opzionale | Bearer token se endpoint protetto |
| `GITHUB_TOKEN` | Secret | ✅ presente | Fetch issue, workflow runs e repo tree (fallback: `DIAG_GITHUB_TOKEN`) |
| `SENTRY_AUTH_TOKEN` | Secret | ✅ presente | User Auth Token Sentry, scope `project:read` |
| `SENTRY_ORG` | Secret/Env | ✅ presente | Organization slug Sentry (es. `my-org`) |
| `SENTRY_PROJECT` | Secret/Env | ✅ presente | Project slug Sentry (es. `bikerlink`) |
| `SENTRY_BASE_URL` | Secret | ✅ presente | Default `https://de.sentry.io/api/0` (istanza EU) |
| `HORUS_LOG_DIR` | Variabile d'ambiente | opzionale | Override directory output report e manifest (es. `/tmp` nella shell planner); default `logs/` |
| `HORUS_BACKLOG_DIR` | Variabile d'ambiente | opzionale | Override directory per `horus-backlog.json` (es. `/tmp` nella shell planner); default `.local/`. **Obbligatorio insieme a `HORUS_LOG_DIR`** nella shell planner |

Per impostare i secret: usa la skill `environment-secrets` (mai scriverli nei file).

## Formato output

### Report principale
Salvato in `logs/horus-log-analysis-<timestamp>.md`. Struttura fissa (quattro sezioni):

```markdown
## PROBLEMI TROVATI
- [problema con path file coinvolto, valore letterale estratto dai dati, prime 3 righe stack se disponibile]

## ANALISI CAUSE
[spiegazione cause radice]

## CORRELAZIONI TROVATE
- [connessione cross-source: crash timestamp ↔ commit, Sentry ↔ AppSetting, violazione DB ↔ migration, ecc.]

## TASK PROPOSTI DA HORUS
| Titolo | Priorità | Problema | Azione |
|--------|----------|---------|--------|
| [titolo con valore letterale] | alta/media/bassa | [evidenza specifica dai dati] | [azione] |
```

### Revisione architect
Salvata in `logs/horus-log-analysis-<timestamp>-architect.md`. Struttura:

```markdown
## TASK VALIDATI (pronti per proposta formale)
| Titolo | Priorità | Motivazione |

## TASK SCARTATI
- [titolo]: [duplicato di "X" / troppo vago / nessuna evidenza letterale / già risolto]
```

### Manifest task
`logs/horus-tasks-pending.json` — lista dei task pronti con path del file plan.

## Flag CLI

| Flag | Comportamento |
|---|---|
| *(nessuno)* | Triage completo + revisione architect + proposta task |
| `--only-internal` | Solo DB + filesystem + git log (no GitHub, no Sentry, no repo tree) |
| `--tail N` | Legge le ultime N righe per ogni file di log (default: 500) |
| `--dry-run` | Mostra il bundle ma non chiama Horus |
| `--no-propose` | Esegue triage + revisione architect, ma salta la proposta formale |

## Backlog dei task attivi (deduplicazione)

Gli script **non** interrogano `project_tasks` (tabella interna di Replit, non accessibile dal DB Postgres del progetto). Invece leggono il file `.local/horus-backlog.json`, che deve essere scritto dall'agente **prima** di ogni triage.

### Formato del file

Il file può essere un array JSON di stringhe o un oggetto con campo `titles`:

```json
["Titolo task 1", "Titolo task 2", "..."]
```

oppure:

```json
{ "titles": ["Titolo task 1", "Titolo task 2", "..."] }
```

### Come scrivere il backlog (dall'agente)

Prima di lanciare il triage, l'agente deve scrivere il file con i titoli dei task attivi:

```typescript
// Leggi i task attivi con getProjectTasks() o dalla lista dei task correnti
const titles = activeTasks.map(t => t.title);
fs.writeFileSync(".local/horus-backlog.json", JSON.stringify(titles, null, 2));
```

### Argomento CLI alternativo

È possibile passare un path alternativo con `--backlog-file`:

```bash
npx tsx scripts/log-analysis-horus.ts --backlog-file /tmp/my-backlog.json
```

### Se il file non esiste

Se `.local/horus-backlog.json` non esiste, lo script stampa un avviso chiaro e procede senza deduplicazione:

```
⚠️  Backlog non disponibile — deduplicazione saltata.
     File atteso: .local/horus-backlog.json
     Per attivare la deduplicazione, chiedi all'agente di scrivere
     i titoli dei task attivi in quel file prima del triage,
     oppure passa --backlog-file <path>.
```

Questo è uno stato atteso (non un errore fatale): il manifest `horus-tasks-pending.json` viene comunque generato, ma potrebbe contenere duplicati rispetto al backlog esistente.

## Troubleshooting architect

La seconda chiamata Horus (revisione architect) può fallire per questi motivi — ora loggati con il tipo specifico:

| Tipo errore | Log mostrato | Causa | Soluzione |
|---|---|---|---|
| `TIMEOUT` | `Tipo errore: TIMEOUT — il modello ha impiegato più di 300s` | qwen3:4b troppo lento, host sotto carico, o bundle troppo grande | Riduci il bundle con `--tail 200` o `--only-internal`; verifica che il ThinkCentre non sia sotto carico |
| `RETE (ECONNREFUSED)` | `Tipo errore: RETE (ECONNREFUSED) — host irraggiungibile` | ThinkCentre spento o Cloudflare Tunnel giù | Verifica che il TC sia acceso e il tunnel attivo |
| `RETE (ENOTFOUND)` | `Tipo errore: RETE (ENOTFOUND) — host irraggiungibile` | DNS non risolve l'hostname in `HORUS_OLLAMA_URL` | Verifica il secret `HORUS_OLLAMA_URL` |
| `HTTP` | `Tipo errore: HTTP — risposta non-200 dal server Ollama` | Ollama ha restituito un errore (es. 503, modello non caricato) | Verifica che Ollama sia in esecuzione e il modello `qwen3:4b` sia disponibile |
| `RISPOSTA VUOTA` | `Tipo errore: RISPOSTA VUOTA — il modello ha restituito contenuto vuoto` | `num_predict` insufficiente o modello scaricato durante la chiamata | Problema transitorio; riprova il triage |

In tutti i casi, il log mostra anche `Messaggio` (errore completo) e `Codice rete` (se disponibile). Il triage continua usando il report principale senza filtro architect — `hasArchitectReview: false` nel manifest.

## Piani arricchiti con il contesto del report

`horus-propose-tasks.ts` estrae automaticamente il contesto rilevante dalle sezioni `## PROBLEMI TROVATI` e `## ANALISI CAUSE` del report principale e lo include nella sezione `## What & Why` di ogni file plan. L'estrazione usa un match fuzzy per keyword dal titolo del task.

- Se il contesto viene trovato: `What & Why` contiene l'evidenza letterale e l'analisi causa, e `Relevant files` include i path di file citati.
- Se non viene trovato (nessuna keyword match): fallback al template generico con i campi `Problema` e `Azione` dalla tabella di Horus.

Questo garantisce che i file plan siano utilizzabili dall'executor agent senza riscrittura manuale, anche quando la tabella `## TASK PROPOSTI DA HORUS` contiene valori generici.

## Se l'endpoint non risponde

Se il ThinkCentre è spento o il Cloudflare Tunnel è giù, lo script stampa un messaggio chiaro ed esce con codice 1. Verifica che il ThinkCentre sia acceso, Ollama in esecuzione e l'hostname in `HORUS_OLLAMA_URL` raggiungibile.

## Note sul timeout

- Horus usa `qwen3:4b` (modello 4B parametri su CPU/iGPU del ThinkCentre): risposta tipica in **20–60 secondi** per chiamata.
- Il triage completo esegue **due chiamate** (analisi + revisione architect): attesa totale tipica **40–120 secondi**.
- Il timeout è impostato a 300s per chiamata come margine di sicurezza.

## Manutenzione

- `SYSTEM_PROMPT` — costante in fondo a `scripts/log-analysis-horus.ts` (analisi principale).
- `ARCHITECT_PROMPT` — costante in fondo a `scripts/log-analysis-horus.ts` (revisione architect).
- Per aggiungere/togliere tabelle DB, modifica le query in `collectDb()` nello stesso script.
- Per aggiungere/togliere file di log, modifica `LOG_FILES`.
- Per aggiungere sorgenti GitHub/Sentry, modifica `scripts/lib/horus-sources.ts`.

## File coinvolti

- `scripts/log-analysis-horus.ts` — script principale (triage + chiamate Horus + git log + stack trace resolution + report precedente)
- `scripts/horus-propose-tasks.ts` — script companion (parsing task, dedup, file plan, manifest)
- `scripts/lib/horus-sources.ts` — raccolta sorgenti GitHub (Issues, Actions con job detail, repo tree) e Sentry (con eventi completi top-5)
- `scripts/start-planning-session.sh` — wrapper per sessioni di pianificazione
- `server/lib/cf-access.ts` — helper `cfAccessHeaders()` per Cloudflare Access
- `server/db.ts` — import pool DB
- `.agents/skills/ollama-diagnostics/SKILL.md` — skill correlata (diagnosi crash boot, usa Ares)
