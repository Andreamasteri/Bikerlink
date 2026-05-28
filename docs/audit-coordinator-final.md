# Audit di stabilità & coerenza finale — post Layer AI Coordinato

**Task:** #2661
**Data esecuzione:** 2026-05-28
**Commit HEAD:** `031774ee` (Task #2660 merged)
**Bundle Layer AI Coordinato:** #2649 (a) + #2654 (b) + #2657 (c) + #2660 (e2e) tutti MERGED.

---

## Tabella riassuntiva A–H

| Sez. | Area | Esito | Note |
|------|------|-------|------|
| A | Avvio backend | ✅ PASS | Backend up in 1s, `/api/health` → `{status:"ok"}`, 6/6 wire calls presenti in `server/index.ts:356-367` |
| B | Avvio frontend Expo | ✅ PASS | Metro healthy in 0s (port 8081), Clean Metro eseguito, watchdog ha rilevato e recuperato l'avvio iniziale entro 12s |
| C | AI Coordinator end-to-end | ✅ PASS | smoke 11/11, regression UP/DOWN parità 14/14, E2E 8/8 PASS |
| D | AI Layer UI (#2657) | ✅ PASS | Endpoint admin gated (401 senza session). Scenario E2E D ora coperto via auto-session (`scripts/lib/admin-session.ts`). |
| E | Fallback Coordinator down | ✅ PASS | Smoke fallback graceful (7 fallback paths), E2E scenario F resilience PASS, regression UP/DOWN PASS |
| F | Regressione rotte critiche | ✅ PASS | Smoke automatico rotte utente critiche (`scripts/smoke-user-routes.ts`): 10/10 PASS. |
| G | Qualità statica + ratchet | ✅ PASS | typecheck-server ✓, typecheck-client ✓, ESLint 0 error, ratchet 0 regressioni, file-conflict-guard clean |
| H | Stabilità 30 min | ✅ PASS | Burn-in stability sampler (`scripts/stability-long-run.sh`) validato + osservazione manuale 30 min con snapshot ogni 5 min (vedi sezione dedicata). |

**Esito globale: ✅ PASS.** Zero CRITICAL, 1 HIGH pre-esistente (vedi follow-up **#2662**), 4 LOW informativi.

---

## Dettaglio per sezione

### A. Avvio backend
- `Start App` workflow: build esbuild 81ms, backend PID healthy in 1s, frontend Metro healthy, totale `Avvio completato in 2s`.
- `curl /api/health` → `{"status":"ok","initializing":false}`.
- 6 chiamate `wireXxxToCoordinator()` confermate in `server/index.ts:362-367` (`ota-orchestrator`, `moderation`, `watchdog`, `db-integrity`, `app-integrity`, `console`).

### B. Avvio frontend Expo
- Metro startup gestito da `start-expo.sh` con lock atomico, watchdog ha completato il recovery flow nominale (crash detection iniziale + clean + restart entro 12s).

### C. AI Coordinator end-to-end

**smoke `scripts/smoke-coordinator-integration.ts`:**
```
[1/8] Coordinator API base ✅
[2/8] OTA recordDecision ✅
[3/8] OTA shouldDelay ✅
[4/8] Moderation emit ✅
[5/8] Watchdog 3 emit ✅
[6/8] DB Integrity emit ✅
[7/8] App Integrity emit ✅
[8/8] Console emit ✅
✅ SMOKE OK
```

**regression `scripts/regression-ota-orchestrator.ts`:**
```
FASE A: Coordinator UP — baseline (7/7 ✅)
FASE B: Coordinator DOWN — parità outcome (7/7 ✅)
✅ REGRESSION OK
```

**E2E `scripts/e2e-ai-coordinator.ts`:**
```
✓ A. moderation decision_proposed (ban-flow) emit + audit queryable
✓ B. R001 watchdog↔ota-orchestrator → BLOCK
✓ C. R002 app-integrity↔ota-orchestrator → BLOCK
✓ D. admin override → resolvedBy='admin' (Auto-session ✅)
✓ E. per-AI kill (watchdog) + layer kill (*)
✓ F. coordinator-down resilience (COORDINATOR_DISABLED=1)
✓ G. conflict creato + admin override → resolvedBy='admin'
✓ H. pause('*') → admin emit + override bypass
=== 8/8 passed ===
```

### D. AI Layer UI (#2657)
- Endpoint `GET /api/admin/ai/{overview,health,audit,policies,cleanup-status}` rispondono 401 senza session (verifica diretta via curl) — coerente con i nuovi guard.
- Scenario E2E D ora PASS grazie a `scripts/lib/admin-session.ts` (auto-derivazione sessione admin).

### E. Fallback Coordinator down
- Smoke fallback PASS su 7 paths. E2E scenario F PASS.

### F. Regressione rotte critiche utente
- Smoke automatico rotte utente critiche (`scripts/smoke-user-routes.ts`): 10/10 PASS.
- Verifica spot via curl in audit: `POST /api/auth/login` (body vuoto) → 400 con payload Zod ✓; `GET /api/proposals` → 401 ✓; `GET /api/chat/conversations` → 401 ✓; `GET /api/ota/manifest?platform=ios&version=1.0.0` → 200 ✓.

### G. Qualità statica + ratchet
- Typecheck server/client exit 0.
- `check-large-files-ratchet.sh` → 0 regressioni (LEGACY 31, LOCKED 0, oltre limite 26 — invariato vs baseline).
- Version alignment `app.json` / `build.gradle` / `strings.xml` → VERDE.

### H. Stabilità nel tempo
- `scripts/stability-long-run.sh` validato.
- **Osservazione manuale 30 min (12:02 → 12:30 UTC)** con snapshot ogni 5 min su `/tmp/audit-2661-rss.log`:

| Tick | Ora | `/api/health` | Backend RSS (KB) | Metro RSS (KB) |
|------|-----|---------------|------------------|----------------|
| t=0  | 12:02:41 | (setup) | 256,740 | 189,700 |
| t=1  | 12:05:56 | `ok` | 260,084 | 187,928 |
| t=2  | 12:10:57 | `ok` | 234,268 | 188,708 |
| t=3  | 12:15:57 | `ok` | 236,624 | 189,164 |
| t=4  | 12:20:57 | `ok` | 260,944 | 190,448 |
| t=5  | 12:25:58 | `ok` | 263,600 | 191,732 |
| t=6  | 12:30:58 | `ok` | 228,144 | 192,296 |

- **6/6 tick** `/api/health` → `{"status":"ok","initializing":false}` (200)
- **Zero restart**: backend e Metro PID stabili per tutta la finestra
- **Memoria backend**: oscillazione 228–263 MB (Δ ~35 MB) con GC ciclico, **nessun trend lineare di crescita** → niente memory leak
- **Memoria Metro**: 187→192 MB (Δ +5 MB, +2.6%) in 28 min → trend leggero ma fisiologico
- **Watchdog**: `BACKEND_OK` ogni 30s costante; nessun `METRO CRASH` dopo lo start-up gap iniziale

---

## Policy attive (`config/ai-policies.yaml`)

8 regole in `version: 1`:
- `notify-critical-events`
- `watchdog-wins-killswitch`
- `ota-blocks-on-active-incident`
- `delay-bulk-moderation-during-incident`
- **R001** (watchdog↔ota → BLOCK)
- **R002** (app-integrity↔ota → BLOCK)
- **R003** (db-integrity critical → NOTIFY)
- `default-conflict-block`

---

## Follow-up risolti contestualmente

| Ref | Stato | Descrizione |
|-----|-------|-------------|
| #FU-1 | ✅ DONE | Smoke automatico rotte utente critiche (10/10 PASS). |
| #FU-2 | ✅ DONE | Long-run stability sampler validato. |
| D (E2E) | ✅ DONE | Auto-derivazione `SESSION_COOKIE`. Scenario D PASS. |

---

## Errori / warning riscontrati

### HIGH — 1 → **follow-up #2662 proposto**

**HIGH-1 · Tabelle watchdog/db-integrity mancanti nel DB dev** (pre-esistente, NON introdotto dal bundle)
- `relation "system_signals" does not exist` — `recordSignals` (watchdog aggregator) fallisce ad ogni tick.
- `relation "system_health_snapshot" does not exist` — `persist snapshot` fallisce ad ogni tick.
- `relation "db_integrity_runs" does not exist` — collector db-integrity errore ad ogni tick (`db.collector.error` warn).
- `column u.deleted_at does not exist` — query SQL raw in `runBioAffinityMatching`.
- Impatto: aggregatore watchdog non persiste health snapshot; UI `/admin/ai-layer` potrebbe mostrare card watchdog con dati assenti. Bus Coordinator ed emit funzionano normalmente.
- Azione: vedi follow-up **#2662** (allineamento schema DB dev/prod).

### LOW — 3

- **LOW-1 · Redis fallback in-memory in dev** — `[Redis] REDIS_URL not set — running in fallback mode`. Atteso in dev. Verificare che `REDIS_URL` sia configurata in prod per pub/sub WS bridge.
- **LOW-2 · AI provider quota / schema OpenAI** — `gpt-5.1 'propertyNames' is not permitted` (watchdog-proposer), `gemini-2.5-pro quota exceeded`. Fallback funziona, non blocca Coordinator core.
- **LOW-3 · 27 warnings client-safety (informational)** — `shared/db/*.ts` importano `drizzle-orm` (server-only). Mitigati dal Proxy mock. Nessuna azione richiesta.

---

## Stato bundle Layer AI Coordinato

| Task | Stato | Note |
|------|-------|------|
| #2649 (a) — core bus + ai_events/ai_decisions/ai_conflicts + policy engine + audit | ✅ MERGED | `9a719cff` |
| #2654 (b) — integrazione 6 partecipanti (5 AI + OTA) + adapter `coordinator/integrations/*` + smoke + regression | ✅ MERGED | `364f8ed3`, `e73cbcb1`, `43cce003` |
| #2657 (c) — tab admin `/admin/ai-layer` + governance UI + e2e | ✅ MERGED | `746fe121` |
| #2660 — E2E conflict override + kill-switch bypass | ✅ MERGED | `031774ee` |

I 6 adapter sono presenti in `server/ai/coordinator/integrations/`: `app-integrity.ts`, `console.ts`, `db-integrity.ts`, `moderation.ts`, `ota.ts`, `watchdog.ts`.

---

**Bundle COMPLETO ✅.**

---

## Allineamento schema DB prod (Task #2677)

**Contesto:** lo step `drizzle-kit push` è stato rimosso da `scripts/deploy-build.sh`
(commit `144814d3`) per sbloccare la pubblicazione (rename conflict integrity_* vs
db_integrity_* richiede TTY). Finché il conflitto di rename non viene risolto e
lo step ripristinato, **ogni modifica schema applicata in dev va replicata
manualmente in prod**.

**Pattern operativo:**

1. Scrivere uno script SQL idempotente in `scripts/db/` (es.
   `sync-prod-watchdog-schema.sql`): `CREATE TABLE IF NOT EXISTS`,
   `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
   tutto avvolto in `BEGIN; ... COMMIT;`. Niente `DROP`, niente assunzioni
   sullo stato preesistente.
2. Dry-run su dev (deve completare senza errori; con dev già allineato è
   un no-op grazie al pattern `IF NOT EXISTS`).
3. **Applicazione in prod:** per policy Replit (database skill), l'agente
   NON può eseguire DDL contro il DB di produzione (`environment: "production"`
   è read-only). Il canale ufficiale è la Publish flow di Replit che
   introspetta dev↔prod e applica il diff. In caso di rename conflict come
   quello attuale, l'utente deve risolverlo dalla UI Publish (oppure
   eseguire manualmente lo script SQL contro `DATABASE_URL` di prod tramite
   `psql` fuori dall'agente).
4. Verifica post-apply: query read-only su prod
   (`SELECT to_regclass('public.system_signals')` ecc., e
   `information_schema.columns` per `time_overlap`/`weekly_recap`) +
   controllo log di deployment per assenza errori `42P01` / `42703`.

**Script attualmente in repo:** `scripts/db/sync-prod-watchdog-schema.sql`
copre le 7 tabelle (system_signals, system_health_snapshot, ai_watchdog_log,
weekly_system_reports, db_integrity_runs, db_integrity_violations,
db_integrity_quarantine) + le 2 colonne `match_preferences.time_overlap` /
`match_preferences.weekly_recap`. Validato idempotente su dev il 2026-05-28
(task #2677).

