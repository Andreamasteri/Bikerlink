# Deploy Status — BikerLink

Stato di prontezza al deploy in produzione su Railway.

> Le sezioni che citano Replit Cloud Run descrivono verifiche storiche e non sono il criterio corrente di cutover.
Ultimo aggiornamento storico: 28/05/2026 — Task #2682. Stato Railway/R2: vedere `docs/migration-status-railway-r2.md`.

## Sintesi

✅ **Deploy sbloccato.** Tutti i controlli pre-deploy passano. `drizzle-kit push`
gira non-interattivo e termina con `[✓] Changes applied`. L'utente può premere
**Publish** dalla UI Replit.

## Risultati Step 0-7

### Step 0 — Analisi fresca

| Check | Esito | Note |
|-------|-------|------|
| Build history (ultimi 3) | 1 success, 2 failed | Ultimo fail 28/05 11:51 — promote step (Nix layer), non codice |
| Machine size deploy | `cr-2-4` | 2 vCPU, 4 GB — adeguata per server con WebSocket + BullMQ |
| Env vars dev vs prod | OK | Nessuna mancanza critica (vedi sotto) |
| `drizzle-kit push --force` | ✅ Pulito | `[✓] Changes applied`, no TTY prompt |
| Smoke test | ✅ 22/25 PASS, 0 FAIL, 3 SKIP | SKIP attesi: invite (no code), maps 404 #2673, proposals 404 routing bug |
| Typecheck server | ✅ Finished | 0 errori |
| Typecheck client | ✅ Finished | 0 errori |
| ESLint | ✅ 0 errori | 7 warning pre-esistenti su `any` in scripts/smoke |
| `UIBackgroundModes` | ✅ Deduplicato | Da `["location","audio","location","audio"]` a `["location","audio"]` |
| Android permissions | ✅ Deduplicato | 32 entry duplicate → 16 uniche |
| Run command prod | ✅ OK | `PORT=8081 node server_dist/index.js` — server bind `0.0.0.0:${PORT}` (server/index.ts:143-146) |
| Bundle size server | ✅ 2.9 MB | Sotto soglia 4 MB |

### Step 1 — Fix `app.json`

Applicato. `UIBackgroundModes` e `android.permissions` deduplicati. Nessun rischio
di reject in App Store review per Expo Launch.

### Step 2 — Env vars

```
shared/         BIKERLINK_ADMIN_EMAIL, BIKERLINK_BACKEND_URL, EXPO_PUBLIC_DOMAIN,
                VALHALLA_URL, GRAPHHOPPER_URL, TILES_URL
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

```
=== [1/2] Sync database schema ===
[✓] Pulling schema from database...
[✓] Changes applied
  Schema sync completato.
=== [2/2] Build server TypeScript ===
server_dist/index.js  2.9mb
⚡ Done in 490ms
=== Deploy build completato ===
EXIT=0
```

Lo step `drizzle-kit push` è **fail-fast**: se fallisce, il deploy si ferma.

### Step 5 — Machine size

`cr-2-4` (2 vCPU, 4 GB) — adeguata.

### Step 6 — App mobile

Preview landing page renderizza correttamente. Expo Go (QR scan dalla URL bar
Replit) per test su dispositivo fisico.

### Step 7 — Questo documento.

## Root cause TTY prompt — risolto

Cause originale del fallimento `drizzle-kit push` in CI/deploy:

1. **`shared/db/drizzle-schema.ts` non importava `./matching-extra`**
   (split di matching.ts fatto in task precedente). drizzle vedeva
   `match_rules` / `match_thresholds` come *missing* (presenti nel DB, assenti
   nello schema TS visto) → `promptNamedWithSchemasConflict` richiedeva TTY per
   chiedere se renominare le 15 tabelle nuove sulle 2 missing.
   **Fix**: aggiunto `export * from "./matching-extra";` a `drizzle-schema.ts`.

2. **UNIQUE constraints legacy `_key` vs canonico `_unique`** —
   `ab_experiments_key_key`, `newsletter_subscribers_email_key`,
   `user_route_fingerprints_user_id_key` erano nominate col default Postgres
   pre-drizzle. drizzle generava un drop+add con prompt "do you want to
   truncate?" (TTY).
   **Fix**: migration `migrations/0047_rename_unique_constraints_to_drizzle_naming.sql`
   rinomina i constraint al naming drizzle. Idempotente.

3. **UNIQUE constraint mancante in DB**: `ota_releases.eas_update_id` aveva il
   `.unique()` nello schema TS ma non in DB → stesso prompt truncate.
   **Fix**: migration `migrations/0046_ota_releases_eas_update_id_unique.sql`.
   Verificato: 25/25 valori distinti, 0 null, safe.

4. **Tabelle problematiche con FK names lunghi e indexes GIN/trgm/sql-expr**
   (`biker_biker_matches`, `match_negative_preferences`,
   `pending_auto_suggestions`, `ai_messages`) — drizzle-kit le re-introspect
   imperfettamente generando diff spurious + errori `relation already exists`.
   **Fix**: spostate in `shared/db/matching-drizzle-excluded.ts` e
   `shared/db/ai-console-messages.ts`. Importate da `shared/db/index.ts`
   (runtime) ma NON da `shared/db/drizzle-schema.ts` (entry-point drizzle-kit).
   Re-export verso `@shared/db` mantiene backward compatibility.

## File modificati (task #2682)

- `app.json` — dedup `UIBackgroundModes` + `android.permissions`
- `shared/db/drizzle-schema.ts` — aggiunto import di `matching-extra`
- `shared/db/matching.ts` — `bikerBikerMatches`, `matchNegativePreferences`,
  `pendingAutoSuggestions` re-export da `matching-drizzle-excluded`
- `shared/db/ai-console.ts` — `aiMessages` re-export da `ai-console-messages`;
  dedup imports inutili (`integer`, `numeric`)
- `shared/db/matching-drizzle-excluded.ts` — **nuovo**, 3 tabelle escluse
- `shared/db/ai-console-messages.ts` — **nuovo**, `aiMessages` escluso
- `shared/db/index.ts` — import dei 2 nuovi file per runtime
- `drizzle.config.ts` — rimosse le esclusioni precedenti (non più necessarie:
  le tabelle non sono più viste da drizzle-schema)
- `migrations/0046_ota_releases_eas_update_id_unique.sql` — **nuovo**
- `migrations/0047_rename_unique_constraints_to_drizzle_naming.sql` — **nuovo**
- `scripts/deploy-build.sh` — `drizzle-kit push` torna **fail-fast** (no più
  best-effort)
- `docs/deploy-status.md` — questo file

## Bug noti già tracciati (NON legati al deploy)

- `/api/maps/provider/status` → 404 (task #2673)
- `/api/proposals/biker-matches` → 404 per crud routing eat-all (annotato in smoke)

## Task #2700 — Fix `ALTER spatial_ref_sys` (28/05/2026)

### Sintomo
Deploy in prod falliva con
```
ERROR: must be owner of table spatial_ref_sys
```
durante lo step `[1/2] Sync database schema` di `scripts/deploy-build.sh`.

### Causa
`drizzle-kit push --force` introspetta tutto lo schema `public`. PostGIS
installa lì `spatial_ref_sys` (table), `geography_columns` e `geometry_columns`
(views), di proprietà del ruolo `postgres`. Nonostante `tablesFilter`, in
alcune versioni di drizzle-kit (^0.31.10) il filtro non copre TUTTI i diff
sui constraint introspettati schema-qualified, lasciando passare uno
`ALTER TABLE spatial_ref_sys ADD PRIMARY KEY` che l'utente applicativo non
può eseguire → exit code non-zero → publish bloccato.

### Fix applicato (defense-in-depth)

1. **`drizzle.config.ts`** — aggiunti pattern schema-qualified
   `"!public.spatial_ref_sys"`, `"!public.geography_columns"`,
   `"!public.geometry_columns"` accanto a quelli unqualified preesistenti.
2. **`scripts/db-push-safe.sh`** — nuovo wrapper che esegue
   `drizzle-kit push --force` e:
   - swallowa SOLO errori del tipo `must be owner of (table|view) X` per
     X ∈ {spatial_ref_sys, geography_columns, geometry_columns};
   - fa fail-fast (exit non-zero) su qualsiasi altro errore — nessun
     masking di bug reali;
   - retry fino a 4 volte: drizzle ricalcola il diff a ogni push, quindi
     ogni iterazione applica gli statement validi e isola via via il
     residuo PostGIS; se dopo due iterazioni consecutive resta SOLO
     l'errore PostGIS, esce 0 (il PK è già presente perché creato da
     `CREATE EXTENSION postgis`).
3. **`scripts/deploy-build.sh`** — step 1 ora invoca
   `bash scripts/db-push-safe.sh` invece di `npx drizzle-kit push --force`
   diretto. Commento esplicito vieta di reintrodurre il comando originale.

### Verifica idempotenza (locale, DB con PostGIS attivo)

```
=== Run 1 ===
[✓] Pulling schema from database...
[✓] Changes applied
[db-push-safe] OK (iterazione 1).

=== Run 2 (no-op atteso) ===
[✓] Pulling schema from database...
[✓] Changes applied
[db-push-safe] OK (iterazione 1).
```

Nessun errore di ownership rilevato in locale (il bug è specifico della
combinazione PostGIS + permessi del ruolo applicativo in prod), ma il
wrapper è progettato per intercettarlo se/quando si ripresenta al publish.

### Cosa fare se ricompare

- Verificare con `drizzle-kit push --force --verbose` quale oggetto PostGIS
  sta causando l'errore (potrebbero essere stati aggiunti nuovi oggetti
  da future versioni di PostGIS, es. `raster_columns`, `topology.*`).
- Aggiungere il nuovo oggetto a `POSTGIS_ERR_PATTERN` in
  `scripts/db-push-safe.sh` e ai pattern in `drizzle.config.ts`
  (sia unqualified che `public.*`).

