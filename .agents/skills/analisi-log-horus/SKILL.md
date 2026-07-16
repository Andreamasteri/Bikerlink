---
name: analisi-log-horus
description: Triage completo dello stato di salute BikerLink via Horus (qwen3:4b). Aggrega DB interno, log filesystem, GitHub Issues/Actions e Sentry EU, li invia a Horus per un'analisi AI strutturata. Usa quando l'utente dice "analisi log", "triage sistema", "cosa non va", "proponi task da Horus", o vuole un report sullo stato di salute senza leggere manualmente le sorgenti.
---

# Analisi Log con Horus — Triage AI completo BikerLink

> **Nomi delle istanze Ollama** (vedi `.agents/memory/ollama-naming.md`):
> - **Horus** / **Bowie** = `OLLAMA_*` — ThinkCentre: usati da QUESTA skill per l'analisi (Horus) e come assistente in-app (Bowie).
> - **Ares** = `ARES_OLLAMA_*` — PC fisso (GPU): usato da altre skill (es. ollama-diagnostics); NON da questa skill.

Skill che esegue un **triage automatico completo** del sistema BikerLink aggregando sei fonti di dati (DB interno, log filesystem, GitHub Issues, GitHub Actions, Sentry) e inviandole a **Horus** (ThinkCentre, modello `qwen3:4b`) per un'analisi AI strutturata con proposte di task.

## Quando usarla

- L'utente scrive "analisi log", "triage sistema", "cosa non va".
- Vuoi un report sullo stato di salute prima di pianificare nuovi task.
- Vuoi che Horus proponga task basandosi sullo stato reale del sistema.
- Prima di una sessione di pianificazione (Horus propone → planner revisiona → utente approva).

## Come lanciarla — metodo rapido (1 click)

Il triage è disponibile come **workflow Replit**. Nel pannello Workflows del progetto:

- **"Triage Horus"** — esegue il triage completo su tutte le fonti e salva il report in `logs/`.
- **"Planning Session"** — esegue il triage completo e poi stampa il percorso del report più recente, pronto per la sessione di pianificazione.

## Come lanciarla — da terminale

```bash
# Triage completo (tutte le fonti)
npx tsx scripts/log-analysis-horus.ts

# Solo fonti interne (no GitHub, no Sentry)
npx tsx scripts/log-analysis-horus.ts --only-internal

# Più righe di log dal filesystem
npx tsx scripts/log-analysis-horus.ts --tail 500

# Dry-run: mostra il bundle che verrebbe inviato a Horus, non chiama niente
npx tsx scripts/log-analysis-horus.ts --dry-run

# Combinabile
npx tsx scripts/log-analysis-horus.ts --only-internal --tail 100 --dry-run

# Sessione di pianificazione (triage + path report)
bash scripts/start-planning-session.sh
```

## Dove trovare il report

Il report viene stampato su stdout e salvato in:

```
logs/horus-log-analysis-<timestamp>.md
```

Per trovare il più recente:

```bash
ls -t logs/horus-log-analysis-*.md | head -1
```

## Flusso: sessione di pianificazione

Prima di ogni sessione di pianificazione ("cosa facciamo adesso?", "proponi task", "revisione piano"):

1. **Lancia il workflow "Planning Session"** (o `bash scripts/start-planning-session.sh`) — esegue il triage e mostra il path del report.
2. **Horus analizza** — aggrega le fonti e produce il report con `## TASK PROPOSTI DA HORUS`.
3. **Il planner legge il report** — cerca `logs/horus-log-analysis-*.md` (il più recente) e valuta quali task proposti da Horus sono pertinenti e non duplicati rispetto al backlog esistente.
4. **L'utente approva** — decide quali task aggiungere al backlog.
5. **Solo allora** i task vengono creati formalmente nel sistema di project tracking.

> ⚠️ Le proposte di Horus **non vengono create automaticamente**. Il planner le legge, le revisiona e le propone all'utente.

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
| **Sentry EU** (issue non risolti) | opzionale | `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` | skip con avviso se uno dei tre manca |

## Secret / variabili d'ambiente

| Variabile | Tipo | Stato | Note |
|---|---|---|---|
| `OLLAMA_URL` | Secret | **necessario** | URL Horus (ThinkCentre) via Cloudflare Tunnel, es. `https://tc.biker-link.net` |
| `OLLAMA_MODEL` | Env/Secret | opzionale | Default `qwen3:4b` |
| `OLLAMA_TOKEN` | Secret | opzionale | Bearer token se endpoint protetto |
| `GITHUB_TOKEN` | Secret | ✅ presente | Fetch issue e workflow runs (fallback: `DIAG_GITHUB_TOKEN`) |
| `SENTRY_AUTH_TOKEN` | Secret | ✅ presente | User Auth Token Sentry, scope `project:read` |
| `SENTRY_ORG` | Secret/Env | ✅ presente | Organization slug Sentry (es. `my-org`) |
| `SENTRY_PROJECT` | Secret/Env | ✅ presente | Project slug Sentry (es. `bikerlink`) |
| `SENTRY_BASE_URL` | Secret | ✅ presente | Default `https://de.sentry.io/api/0` (istanza EU) |

Per impostare i secret: usa la skill `environment-secrets` (mai scriverli nei file).

## Formato output

Il report viene stampato su stdout in real-time e salvato in `logs/horus-log-analysis-<timestamp>.md`.

Struttura fissa (tre sezioni):

```markdown
## PROBLEMI TROVATI
- [descrizione problema 1]
- [descrizione problema 2]

## ANALISI CAUSE
[spiegazione delle cause radice per ciascun problema]

## TASK PROPOSTI DA HORUS
| Titolo | Priorità | Problema | Azione |
|--------|----------|---------|--------|
| ... | alta/media/bassa | ... | ... |
```

## Se l'endpoint non risponde

Se il ThinkCentre è spento o il Cloudflare Tunnel è giù, lo script stampa un messaggio chiaro ed esce con codice 1. Verifica che il ThinkCentre sia acceso, Ollama in esecuzione e l'hostname in `OLLAMA_URL` raggiungibile.

## Note sul timeout

- Horus usa `qwen3:4b` (modello 4B parametri su CPU/iGPU del ThinkCentre): risposta tipica in **20–60 secondi**, molto più veloce del 35b GPU di Ares.
- Il timeout è impostato a 300s come margine di sicurezza.

## Manutenzione

- Il system prompt è la costante `SYSTEM_PROMPT` in fondo a `scripts/log-analysis-horus.ts`.
- Per aggiungere/togliere tabelle DB, modifica l'array `DB_QUERIES` nello script.
- Per aggiungere/togliere file di log, modifica `LOG_FILES`.

## File coinvolti

- `scripts/log-analysis-horus.ts` — lo script principale
- `scripts/start-planning-session.sh` — wrapper per sessioni di pianificazione
- `server/lib/cf-access.ts` — helper `cfAccessHeaders()` per Cloudflare Access
- `server/db.ts` — import pool DB
- `.agents/skills/ollama-diagnostics/SKILL.md` — skill correlata (diagnosi crash boot, usa Ares)
