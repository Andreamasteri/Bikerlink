---
name: horus-app-analysis
description: Analisi profonda e multi-fase del codebase BikerLink via Horus (qwen3:4b). Legge file sorgente completi, esegue 9 scan automatici su route/auth/env/migration/test/scheduler/AI/schema/catch, confronta dev↔prod, e produce un report strutturato con anomalie, sicurezza, cross-link, drift e task proposti. A differenza di analisi-log-horus (triage reattivo su sintomi), questa skill analizza strutturalmente l'intero codebase in modo metodico e multi-fase. Usa quando l'utente dice "analisi codebase", "analisi profonda", "analisi strutturale", "audit codice", "horus analizza il codice", "scan completo", "analisi forense", "cosa c'è di rotto nel codice", "analisi multi-fase", o quando vuole un report approfondito prima di una sessione di design architetturale.
---

# Horus App Analysis — Analisi profonda codebase BikerLink

> **Skill sorella**: `analisi-log-horus` — triage reattivo su sintomi già manifesti (crash, log, errori).
> Questa skill analizza strutturalmente il codebase, indipendentemente dai sintomi visibili.

## Quando usarla

| Trigger utente | Azione |
|---|---|
| "analisi codebase", "analisi profonda", "analisi strutturale" | Questa skill |
| "audit codice", "horus analizza il codice" | Questa skill |
| "scan completo", "analisi forense" | Questa skill |
| "cosa c'è di rotto nel codice" | Questa skill |
| "analisi multi-fase", "analisi approfondita" | Questa skill |
| "analisi log", "triage sistema", "cosa non va" | Skill sorella: `analisi-log-horus` |

## Come lanciarla

```bash
# Analisi completa multi-fase (raccomandato)
npx tsx scripts/horus-app-analysis.ts

# Solo un'area specifica
npx tsx scripts/horus-app-analysis.ts --area auth
npx tsx scripts/horus-app-analysis.ts --area ai
npx tsx scripts/horus-app-analysis.ts --area routing

# Dry-run: mostra il bundle Phase 1 senza chiamare Horus
npx tsx scripts/horus-app-analysis.ts --dry-run

# Single-phase: una sola chiamata con bundle completo (più lento, meno preciso)
npx tsx scripts/horus-app-analysis.ts --single-phase

# Salta proposta task formale (solo report + revisione architect)
npx tsx scripts/horus-app-analysis.ts --no-propose

# Solo query DB (salta code scan e scan automatici)
npx tsx scripts/horus-app-analysis.ts --only-db

# Solo code scan (salta query DB)
npx tsx scripts/horus-app-analysis.ts --only-code

# Più righe di log AI nel pivot (default 500)
npx tsx scripts/horus-app-analysis.ts --tail 1000

# Shell planner (filesystem read-only) — redirige output su /tmp
HORUS_LOG_DIR=/tmp npx tsx scripts/horus-app-analysis.ts
```

## ⚠️ Shell planner: usa HORUS_LOG_DIR=/tmp

Come per la skill sorella, la shell del planner Replit è **read-only sull'intero workspace**.
Usa `HORUS_LOG_DIR=/tmp` per redirigere output e manifest su `/tmp`:

```bash
HORUS_LOG_DIR=/tmp npx tsx scripts/horus-app-analysis.ts
HORUS_LOG_DIR=/tmp npx tsx scripts/horus-propose-tasks.ts
```

## Flusso multi-fase

```
Phase 0 (pre-analisi)
  │
  ├─ 9 Scan automatici (rg + grep + find — no chiamata Horus)
  └─ Query DB dev + prod
  │
  ▼
Phase 1 — Pivot (~30s)
  Bundle compatto (AI logs, crash, signals, scan 1+6)
  → Horus risponde con le 3-5 aree più urgenti (AREA_1: auth, AREA_2: ai, ...)
  │
  ▼
Phase 2 — Deep Dive per area (~45-60s × 3 aree)
  Per ciascuna delle top-3 aree:
  └─ File sorgente completi + scan rilevanti + subset DB
  → Horus produce ## PROBLEMI_<AREA> con path:riga, tipo, descrizione
  → Salvato in horus-analysis-<ts>-area-<nome>.md
  │
  ▼
Phase 3 — Sintesi trasversale (~60s)
  Bundle: report aree Phase 2 + tutti 9 scan + DB completo
  → Report finale con 6 sezioni obbligatorie + tabella task
  → Salvato in horus-analysis-<ts>.md
  │
  ▼
Revisione architect
  → Filtra task proposti vs backlog esistente
  → Salvato in horus-analysis-<ts>-architect.md
  │
  ▼
horus-propose-tasks.ts
  → Deduplicazione, file plan .local/tasks/horus-*.md
  → Manifest logs/horus-tasks-pending.json
```

## 9 Scan automatici

| # | Nome | Cosa cerca | Rischi rilevati |
|---|------|-----------|-----------------|
| 1 | Route Auth Audit | Ogni `router.get/post/put/delete/patch/use` in `server/routes/` | Route senza `requireAuth` / `_requireAdmin` / token guard |
| 2 | Env Var Audit | Ogni `process.env.NOME` in `server/` e `scripts/` | Variabili con `!` (crash se assente), senza fallback |
| 3 | Migration Risk Scan | Ultime 20 migration `.sql` | `DROP TABLE` senza `IF EXISTS`, `UPDATE` senza `WHERE`, prefix duplicati |
| 4 | Test Coverage Gap | File in `server/ai/`, `server/routes/`, `server/boot-*.ts` | File critici senza test `.test.ts` corrispondente |
| 5 | Scheduler Fragility | `server/boot-phase5-schedulers.ts` + `server/ai/watchdog/` | `setInterval`/`arm(` senza `try/catch`, `withBgDbSlot`, `withJobGate` |
| 6 | AI Provider Timeout | File con `generateObject`, `generateText`, `streamText` | Chiamate AI senza `abortSignal` o timeout esplicito |
| 7 | Schema vs Routes | Tabelle `FROM/INTO/UPDATE` in route vs `pgTable(` nello schema Drizzle | Tabelle usate nelle route ma non definite nello schema |
| 8 | Catch Silenzioso | `catch(e){}` vuoti, `.then()` senza `.catch()`, `JSON.parse()` | Promise non gestite, errori silenziati |
| 9 | Hardcoded Values | `localhost`, `http://`, `setTimeout` con ≥10s, literal `'secret'` | Valori hardcoded che dovrebbero essere configurabili |

## Aree analizzate in Phase 2

| Area | File letti completi |
|------|---------------------|
| `auth` | `server/routes/auth.ts`, tutti i file in `server/middleware/` |
| `routing` | `server/graphhopper-client.ts`, `server/ai/route-provider-config.ts`, `server/ai/route-provider-stats.ts` |
| `ai` | `server/ai/moderation/provider.ts`, `server/ai/fallback-switch.ts`, `server/ai/coordinator/` (tutti), `server/ai/watchdog/scheduler.ts` |
| `telemetry` | `shared/tracking-fusion.ts`, file route con `ride_telemetry/tracking` |
| `storage` | Tutti i file in `server/storage/` |
| `boot` | `server/boot-sequence.ts`, `server/boot-phase3-db-init.ts`, `server/boot-phase5-schedulers.ts` |
| `scheduler` | `server/boot-phase5-schedulers.ts`, tutti i file in `server/ai/watchdog/` |

## Query DB dev (16 query)

| Categoria | Query |
|-----------|-------|
| AI call logs | Distribuzione 7gg per provider/model/degraded + ultimi N record |
| AI watchdog | Ultimi 100 log (7gg) con kind/scope/status/summary |
| App settings | TUTTE le chiavi (rivela config anomale) |
| Users | Anomalie: hidden=false+no_coords, banned=true |
| Crash logs | Trend 7gg vs 30gg per crash_type e platform |
| System signals | High/critical degli ultimi 3 giorni |
| Telemetry | Sessioni con dist=0+dur>60s o dist<0 |
| Indici inutilizzati | `pg_stat_user_indexes` con `idx_scan = 0` |
| FK orfane | `pg_constraint` con `confrelid` non esistente |
| Pool connessioni | `pg_stat_activity` per `application_name` |
| Bloat stimato | `pg_stat_user_tables` con `n_dead_tup > 1000` |
| Migration log | Ultime 10 migration eseguite |

## Query DB produzione

Stessa serie (AI logs, app_settings, users anomalie, crash, signals) via `executeSql({environment:"production"})`.
Disponibile solo in CodeExecution Replit. Se assente: avviso chiaro, analisi continua con solo DB dev.

## Formato report Phase 3 (6 sezioni obbligatorie)

```markdown
## ANOMALIE TROVATE
- [path:riga] ANOMALIA — descrizione concreta

## SICUREZZA
- [path:riga] SICUREZZA — descrizione concreta
  (o "nessuna evidenza nei dati disponibili")

## CROSS-LINK ROTTI O MANCANTI
- connessioni tra moduli mancanti o rotte

## DRIFT DEV↔PROD
- differenze osservate tra DB dev e prod

## COPERTURA TEST MANCANTE
- file critici senza test, ordinati per criticità

## TASK PROPOSTI DA HORUS
| Titolo | Priorità | Area | Problema | Azione |
|--------|----------|------|---------|--------|
```

## Dove trovare i report

```
logs/horus-analysis-<timestamp>.md                    # report finale (Phase 3)
logs/horus-analysis-<timestamp>-area-<nome>.md        # report per area (Phase 2)
logs/horus-analysis-<timestamp>-architect.md          # revisione architect
logs/horus-tasks-pending.json                         # manifest task pronti
```

## Differenze dalla skill sorella `analisi-log-horus`

| Aspetto | `analisi-log-horus` | `horus-app-analysis` |
|---------|--------------------|-----------------------|
| **Trigger** | Sintomi manifesti (crash, log, errori) | Analisi strutturale preventiva |
| **Fonti** | DB crash/watchdog, filesystem log, GitHub, Sentry | File sorgente completi, 9 scan automatici, DB profondo |
| **Flusso** | 2 chiamate (analisi + architect) | 4-5 chiamate (pivot + 3 aree + sintesi + architect) |
| **Output** | Triage con cause e fix immediati | Report strutturale con anomalie/sicurezza/cross-link/drift/test |
| **Tabella task** | 4 colonne (Titolo, Priorità, Problema, Azione) | 5 colonne (Titolo, Priorità, **Area**, Problema, Azione) |
| **Durata** | 40-120s | 5-10 min (multi-fase) |
| **Workflow Replit** | Sì ("Triage Horus") | No (solo terminale) |

## Secret / env richiesti

| Variabile | Tipo | Stato | Note |
|---|---|---|---|
| `HORUS_OLLAMA_URL` | Secret | **necessario** | URL Horus (ThinkCentre) via Cloudflare Tunnel |
| `HORUS_OLLAMA_MODEL` | Env/Secret | opzionale | Default `qwen3:4b` |
| `HORUS_OLLAMA_TOKEN` | Secret | opzionale | Bearer token se endpoint protetto |
| `HORUS_LOG_DIR` | Variabile d'ambiente | opzionale | Override directory output (es. `/tmp` in shell planner) |
| `CF_ACCESS_CLIENT_ID` | Secret | ✅ presente | Cloudflare Access per tc.biker-link.net |
| `CF_ACCESS_CLIENT_SECRET` | Secret | ✅ presente | Cloudflare Access |

## Note sul timeout

- Horus `qwen3:4b` sul ThinkCentre: risposta tipica 20-60s per chiamata.
- Multi-fase: 4-5 chiamate → attesa totale tipica **5-10 minuti**.
- Timeout per chiamata: 300s (margine di sicurezza per modelli lenti).
- Se un'area Phase 2 fallisce per timeout, l'analisi continua con le altre aree.

## Manutenzione

| Cosa modificare | Dove |
|---|---|
| Prompt Phase 1 (pivot) | `SYSTEM_PROMPT_PIVOT` in `scripts/horus-app-analysis.ts` |
| Prompt Phase 2 (area) | `SYSTEM_PROMPT_AREA` in `scripts/horus-app-analysis.ts` |
| Prompt Phase 3 (sintesi) | `SYSTEM_PROMPT_APP_SYNTHESIS` in `scripts/horus-app-analysis.ts` |
| Prompt revisione architect | `ARCHITECT_PROMPT` in `scripts/horus-app-analysis.ts` |
| Aggiungere un'area | `KNOWN_AREAS` + `AREA_FILES` + `AREA_SCANS` in `scripts/horus-app-analysis.ts` |
| Aggiungere scan automatici | Nuova funzione `scanN*()` + aggiungere a `ScanResults` e al bundle |
| Aggiungere query DB dev | `collectDbDev()` in `scripts/horus-app-analysis.ts` |
| Aggiungere query DB prod | `collectDbProd()` in `scripts/horus-app-analysis.ts` |

## File coinvolti

- `scripts/horus-app-analysis.ts` — script principale (scan + multi-fase + chiamate Horus)
- `scripts/horus-propose-tasks.ts` — script companion (parsing, dedup, file plan, manifest)
- `scripts/log-analysis-horus.ts` — skill sorella (triage reattivo)
- `server/lib/cf-access.ts` — helper `cfAccessHeaders()` per Cloudflare Access
- `server/db.ts` — pool DB dev
- `.agents/skills/analisi-log-horus/SKILL.md` — skill sorella documentazione
