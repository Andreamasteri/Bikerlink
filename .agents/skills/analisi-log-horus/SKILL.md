---
name: analisi-log-horus
description: Triage completo dello stato di salute BikerLink via Horus (qwen3:4b). Aggrega DB interno, log filesystem, GitHub Issues/Actions, Sentry EU e albero repo GitHub, li invia a Horus per un'analisi AI strutturata, fa revisionare i task proposti da Horus-architect, e li propone automaticamente nel pannello Replit. Usa quando l'utente dice "analisi log", "triage sistema", "cosa non va", "proponi task da Horus", o vuole un report sullo stato di salute senza leggere manualmente le sorgenti.
---

# Analisi Log con Horus — Triage AI completo BikerLink

> **Nomi delle istanze Ollama** (vedi `.agents/memory/ollama-naming.md`):
> - **Horus** / **Bowie** = `OLLAMA_*` — ThinkCentre: usati da QUESTA skill per l'analisi (Horus) e come assistente in-app (Bowie).
> - **Ares** = `ARES_OLLAMA_*` — PC fisso (GPU): usato da altre skill (es. ollama-diagnostics); NON da questa skill.

Skill che esegue un **triage automatico completo** del sistema BikerLink aggregando sette fonti di dati (DB interno, log filesystem, GitHub Issues, GitHub Actions, Sentry, albero repo GitHub) e inviandole a **Horus** (ThinkCentre, modello `qwen3:4b`) per un'analisi AI strutturata. Dopo il report principale, una **seconda chiamata a Horus** (ruolo architect) filtra i task proposti contro il backlog esistente. Infine i task validati vengono scritti come file plan in `.local/tasks/horus-*.md` e come manifest `logs/horus-tasks-pending.json` — pronti per essere proposti formalmente nel pannello Replit dall'agente.

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

**Soluzione**: imposta `HORUS_LOG_DIR=/tmp` per redirigere output e manifest su `/tmp`, che è sempre scrivibile:

```bash
HORUS_LOG_DIR=/tmp npx tsx scripts/log-analysis-horus.ts
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
| **Shell planner** | `HORUS_LOG_DIR=/tmp npx tsx scripts/log-analysis-horus.ts` | `/tmp` sempre scrivibile |

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
1. Dump log       → DB interno, log filesystem, GitHub Issues/Actions, Sentry
2. Repo tree      → GET /repos/Andreamasteri/Bikerlink/git/trees/HEAD?recursive=1
3. Horus analizza → report con ## PROBLEMI TROVATI / ## ANALISI CAUSE / ## TASK PROPOSTI
4. Architect revisiona → seconda chiamata Horus (ruolo architect): de-duplicazione vs backlog,
                         scarto task vaghi/già risolti → ## TASK VALIDATI / ## TASK SCARTATI
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
3. **Horus-architect revisiona** — filtra duplicati e task vaghi contro il backlog.
4. **I file plan vengono preparati** in `.local/tasks/horus-*.md` + manifest `logs/horus-tasks-pending.json`.
5. **Chiedi all'agente** "Proponi i task Horus pendenti" — l'agente legge il manifest e li crea nel pannello.
6. **L'utente approva** — decide quali task accettare e mettere in lavorazione.

## Fonti raccolte

| Fonte | Disponibilità | Secret richiesto | Fallback |
|---|---|---|---|
| **DB — app_crash_logs** | sempre | `DATABASE_URL` (già configurato) | skip graceful se tabella assente |
| **DB — ai_watchdog_log** | sempre | `DATABASE_URL` | skip graceful |
| **DB — system_signals** (solo high/critical) | sempre | `DATABASE_URL` | skip graceful |
| **DB — diagnostic_reports** (ultimi 5) | sempre | `DATABASE_URL` | skip graceful |
| **DB — ai_call_logs** (solo degraded/errore) | sempre | `DATABASE_URL` | skip graceful |
| **DB — ota_watchdog_reports** | se tabella esiste | `DATABASE_URL` | skip graceful |
| **Log filesystem** (`/tmp/server-crash.log`, `/tmp/backend.log`, `logs/backend-crashes.log`, `logs/error-monitor.log`, `logs/cerbero.log`) | se file presente | — | file mancanti saltati con nota |
| **GitHub Issues** (label bug, aperti) | opzionale | `GITHUB_TOKEN` o `DIAG_GITHUB_TOKEN` | skip con avviso se token assente |
| **GitHub Actions** (run falliti) | opzionale | `GITHUB_TOKEN` o `DIAG_GITHUB_TOKEN` | skip con avviso se token assente |
| **GitHub repo tree** (albero ricorsivo HEAD) | opzionale | `GITHUB_TOKEN` o `DIAG_GITHUB_TOKEN` | skip con avviso se token assente |
| **Sentry EU** (issue non risolti) | opzionale | `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` | skip con avviso se uno dei tre manca |

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

Per impostare i secret: usa la skill `environment-secrets` (mai scriverli nei file).

## Formato output

### Report principale
Salvato in `logs/horus-log-analysis-<timestamp>.md`. Struttura fissa (tre sezioni):

```markdown
## PROBLEMI TROVATI
- [problema con path file coinvolto se identificabile]

## ANALISI CAUSE
[spiegazione cause radice]

## TASK PROPOSTI DA HORUS
| Titolo | Priorità | Problema | Azione |
|--------|----------|---------|--------|
```

### Revisione architect
Salvata in `logs/horus-log-analysis-<timestamp>-architect.md`. Struttura:

```markdown
## TASK VALIDATI (pronti per proposta formale)
| Titolo | Priorità | Motivazione |

## TASK SCARTATI
- [titolo]: [duplicato di "X" / troppo vago / già risolto]
```

### Manifest task
`logs/horus-tasks-pending.json` — lista dei task pronti con path del file plan.

## Flag CLI

| Flag | Comportamento |
|---|---|
| *(nessuno)* | Triage completo + revisione architect + proposta task |
| `--only-internal` | Solo DB + filesystem (no GitHub, no Sentry, no repo tree) |
| `--tail N` | Legge le ultime N righe per ogni file di log (default: 300) |
| `--dry-run` | Mostra il bundle ma non chiama Horus |
| `--no-propose` | Esegue triage + revisione architect, ma salta la proposta formale |

## Se l'endpoint non risponde

Se il ThinkCentre è spento o il Cloudflare Tunnel è giù, lo script stampa un messaggio chiaro ed esce con codice 1. Verifica che il ThinkCentre sia acceso, Ollama in esecuzione e l'hostname in `OLLAMA_URL` raggiungibile.

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

- `scripts/log-analysis-horus.ts` — script principale (triage + chiamate Horus)
- `scripts/horus-propose-tasks.ts` — script companion (parsing task, dedup, file plan, manifest)
- `scripts/lib/horus-sources.ts` — raccolta sorgenti GitHub (Issues, Actions, repo tree) e Sentry
- `scripts/start-planning-session.sh` — wrapper per sessioni di pianificazione
- `server/lib/cf-access.ts` — helper `cfAccessHeaders()` per Cloudflare Access
- `server/db.ts` — import pool DB
- `.agents/skills/ollama-diagnostics/SKILL.md` — skill correlata (diagnosi crash boot, usa Ares)
