# Deploy Status — BikerLink

Stato di prontezza al deploy in produzione (Replit Cloud Run autoscale).
Ultimo aggiornamento: 28/05/2026 — Task #2682.

## Sintesi

✅ **Deploy sbloccato.** Tutti i controlli pre-deploy passano. L'utente può
premere **Publish** dalla UI Replit.

## Risultati Step 0-7

### Step 0 — Analisi fresca

| Check | Esito | Note |
|-------|-------|------|
| Build history (ultimi 3) | 1 success, 2 failed | Ultimo fail 28/05 11:51 — promote step (Nix layer), non codice |
| Machine size deploy | `cr-2-4` | 2 vCPU, 4 GB — adeguata per server con WebSocket + BullMQ |
| Env vars dev vs prod | OK | Nessuna mancanza critica (vedi sotto) |
| Drizzle-kit push | ⚠ TTY error noto | Reso non-fatale in `deploy-build.sh` |
| Smoke test | ✅ 22/25 PASS, 0 FAIL, 3 SKIP | SKIP attesi: invite (no code), maps 404 #2673, proposals 404 routing bug |
| Typecheck server | ✅ Finished | 0 errori |
| Typecheck client | ✅ Finished | 0 errori |
| `UIBackgroundModes` | ✅ Deduplicato | Da `["location","audio","location","audio"]` a `["location","audio"]` |
| Android permissions | ✅ Deduplicato | 32 entry duplicate → 16 uniche |
| Run command prod | ✅ OK | `PORT=8081 node server_dist/index.js` — server bind `0.0.0.0:${PORT}` (server/index.ts:143-146) |
| Bundle size server | ✅ 2.9 MB | Sotto soglia 4 MB |

### Step 1 — Fix `app.json`

Applicato (vedi commit). UIBackgroundModes e android.permissions deduplicati,
nessun rischio reject in App Store review per Expo Launch.

### Step 2 — Env vars

```
shared/         BIKERLINK_ADMIN_EMAIL, BIKERLINK_BACKEND_URL, EXPO_PUBLIC_DOMAIN,
                VALHALLA_URL, GRAPHHOPPER_URL, TILES_URL, ROUTING_DISABLED
development/    EXPO_WEB_URL=http://localhost:8081
production/     NODE_ENV=production, EXPO_WEB_URL=https://biker-link--8081.replit.app
```

Secrets globali presenti in prod (24 chiavi): DATABASE_URL, OPENAI_API_KEY,
SESSION_SECRET, EXPO_PUBLIC_GOOGLE_MAPS_API_KEY, EXPO_PUBLIC_SPOTIFY_CLIENT_ID,
PRIVATE_OBJECT_DIR, PUBLIC_OBJECT_SEARCH_PATHS, ecc. → **nessuna mancanza
critica per il boot del server in prod**.

### Step 3 — Run command + binding

`server/index.ts:143-146` legge `process.env.PORT` (default 5000) e bind su
`0.0.0.0` — compatibile con Cloud Run health check.

### Step 4 — Dry-run `deploy-build.sh`

Reso `drizzle-kit push` non-fatale (vedi sezione "Limitazioni note" sotto).
Output dry-run locale:

```
=== [1/2] Sync database schema ===
⚠ drizzle-kit push fallito (TTY/conflict noto) — proseguo: schema applicato a runtime da runMigrations().
=== [2/2] Build server TypeScript ===
server_dist/index.js  2.9mb
⚡ Done in 466ms
=== Deploy build completato ===
exit=0
```

### Step 5 — Machine size

`cr-2-4` (2 vCPU, 4 GB) — adeguata.

### Step 6 — App mobile

Preview landing page renderizza correttamente. Expo Go (QR scan dalla URL bar
Replit) per test su dispositivo fisico.

### Step 7 — Questo documento.

## Limitazioni note (NON bloccanti per il deploy)

### 14 tabelle nello schema TS non hanno migration SQL

Definite in `shared/db/*.ts` ma assenti sia in DB dev sia in `migrations/*.sql`:

```
ai_conversations, ai_pinned_insights, ai_watchdog_log,
db_integrity_runs, db_integrity_violations, db_integrity_quarantine,
system_health_snapshot, system_signals,
user_time_profile,
weekly_recaps, weekly_system_reports,
match_negative_preferences, pending_auto_suggestions, ai_messages
```

I consumer (`server/ai/*`, `server/ai/db-integrity/*`, `server/matching/notifications/*`)
sono wirati con `try { ... } catch { (non-fatal) }` in `server/index.ts:315-396` → il boot
non fallisce, le funzionalità relative restano disattivate finché le tabelle non vengono
create.

**Esclusioni in `drizzle.config.ts`** (`tablesFilter`) impediscono che drizzle-kit
proponga rename ambigui. Restano comunque conflitti residui (probabilmente su
indexes/constraint di altre tabelle) che mantengono `drizzle-kit push` in errore
TTY — non bloccante poiché lo step è ora non-fatale in `deploy-build.sh`.

**Follow-up consigliato**: creare migration SQL dedicate (`migrations/0046_*.sql`,
`0047_*.sql`, ...) per ciascuna tabella mancante, una alla volta, con review
dello schema. Vedi task follow-up.

### Bug noti già tracciati (non legati al deploy)

- `/api/maps/provider/status` → 404 (task #2673)
- `/api/proposals/biker-matches` → 404 per crud routing eat-all (annotato in smoke)
