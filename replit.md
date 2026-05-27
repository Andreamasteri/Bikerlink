# BikerLink

## ⛔ Regole OTA — Leggere Prima di Qualsiasi Lavoro

**I task NON devono mai includere la pubblicazione di una OTA.**

La pubblicazione OTA è un'operazione separata e dedicata, eseguita **solo su istruzione diretta e esplicita dell'utente** — mai come parte conclusiva di un task di sviluppo.

**Motivazione**: una OTA esportata a fine task può catturare commit incompleti, conflitti di merge, o codice provvisorio (es. OTA-20 esportata da stato incompleto). Il rischio di distribuire bundle rotti agli utenti Android è reale e difficile da rollbackare in produzione.

**Regola**: se un task include modifiche al codice e l'utente non ha esplicitamente detto "pubblica anche l'OTA" come istruzione separata, il task termina **senza** pubblicare alcuna OTA. L'agente deve proporre la pubblicazione OTA come follow-up distinto, non eseguirla autonomamente.

## Policy ESLint CI — Gate Obbligatorio (Ratchet)

La regola `react-hooks/exhaustive-deps` è impostata su **`"warn"`** in `eslint.config.js`. Il gate CI usa un meccanismo **ratchet**: fallisce se il conteggio delle violazioni **aumenta** rispetto alla baseline, impedendo regressioni pur non bloccando il lavoro sul debito tecnico esistente.

### File chiave
- `eslint.config.js` — configurazione ESLint (flat config ESLint v9)
- `scripts/eslint-hooks-check.sh` — script ratchet CI
- `.eslint-hooks-baseline` — numero corrente di violazioni accettate (baseline)

### Gate CI registrato
Validation command `eslint` (comando: `bash scripts/eslint-hooks-check.sh`) è registrato nella piattaforma Replit. Viene eseguito automaticamente alla chiusura del task.

### Regole operative
1. **Non aumentare le violazioni**: il gate blocca il task se il conteggio supera la baseline.
2. **Quando si riducono le violazioni**: eseguire `bash scripts/eslint-hooks-check.sh --update-baseline` per aggiornare `.eslint-hooks-baseline` al nuovo valore più basso (direzione: riduzione progressiva del debito).
3. **Per silenziare un caso legittimo**: usare `// eslint-disable-next-line react-hooks/exhaustive-deps` con commento che spiega il motivo tecnico.
4. **Violazioni `exhaustive-deps`** causano bug di stale closure in produzione — non aggiungerne di nuove.

---

## Anti-pattern dell'agente — leggere prima di lavorare

1. **Gerarchia delle fonti di verità per le dipendenze native**: per dichiarare che una libreria nativa Android non è nell'APK, NON basta verificare `package.json` o gli `import` nel codice JS. Le dipendenze transitive di Expo (es. `expo-camera` tira ML Kit Barcode, `expo-notifications` tira Firebase Cloud Messaging) finiscono nell'APK senza apparire in `package.json`. La sola fonte di verità è il `.apk` compilato (o il gradle dependency tree).

2. **Verifica con metodo diverso dall'esecuzione**: se ho fatto un cambiamento guardando il file X, NON devo verificarlo riguardando il file X. Il bias di conferma fa rileggere la stessa fonte e confermare l'errore originale. Verifica = altro metodo (binario, dependency tree, comando di build, log reali).

3. **"Fatto" ≠ "credo di aver fatto"**: per task di rimozione/pulizia, "fatto" significa che esiste una prova oggettiva nell'output finale (binario, log, response API). Se la prova non c'è, dichiarare esplicitamente "applicato ma non verificato sul binario" — non "fatto".

## Image Assets — Varianti Responsive

Ogni immagine WebP in `assets/images/` deve avere una variante `*-sm.webp` al 50% di larghezza, usata dai `srcset` del sito web (`server/site/pages.ts`).

**Aggiungere una nuova immagine:**
1. Aggiungi il file `*.webp` in `assets/images/`
2. Esegui: `bash scripts/gen-responsive-images.sh`
   - Genera automaticamente il `*-sm.webp` corrispondente se mancante
   - Usa `--force` per rigenerare tutti i file `-sm` esistenti

Il comando è idempotente: salta i file `-sm.webp` già presenti. Non richiede dipendenze extra — usa ImageMagick già disponibile nell'ambiente.

---

## Overview
BikerLink is a React Native (Expo SDK 55) mobile application designed to connect motorcyclists ("biker") and passengers ("zavorrine") across Italy, with a vision to expand Pan-European. The application aims to foster a community for motorcycle enthusiasts, enabling them to find riding partners, organize group rides, and share experiences. The tagline, "U'll never ride alone," encapsulates its core mission. Sponsored by Syneco Lubrificanti, BikerLink also integrates advertising and services relevant to its user base, such as Syneco workshops. The project seeks to create a dynamic platform for the motorcycle community, offering interactive maps, social features, and essential tools for riders.

## User Preferences
I prefer detailed explanations and iterative development. Ask before making major changes. Do not make changes to folder `node_modules`. Do not make changes to file `package-lock.json`.

**Debug errori strani — Prima azione obbligatoria**: svuotare la cache e riavviare (Metro cache, workflow, ecc.) PRIMA di qualsiasi altra analisi o modifica al codice. Se l'errore persiste, usare il runtime reale (Chrome V8 inspector / log browser) per trovare la riga esatta — NON analizzare il codice staticamente per primo.

## Protocollo Gestione Errori

Quando il Build agent incontra un errore (compilazione, runtime, typecheck, test, API, crash) o un warning bloccante o un fallimento silenzioso (es. migrazione saltata senza eccezione), deve fermarsi e produrre obbligatoriamente una **scheda strutturata**:

```
🔴 TIPO DI ERRORE: <categoria leggibile — es. TypeScript type mismatch, DB migration failure, API 500, ESLint bloccante, crash runtime>
📍 LOCALIZZAZIONE: <file + numero di riga se disponibile, oppure stack trace sintetico>
💬 SPIEGAZIONE: <cosa significa l'errore in termini concreti, senza gergo inutile>
🔎 CAUSA PROBABILE: <la ragione più plausibile>
```

Dopo la scheda, l'agente chiede: **"Hai preferenze su come risolvere, o procedo in autonomia?"**

- Se l'utente risponde con una preferenza ("usa il metodo X", "non toccare il file Y") → applicarla
- Se l'utente dice "vai" o non risponde con vincoli → procedere in full-auto

**Eccezioni** (seguono protocolli separati già definiti in questo file):
- Errori di build EAS (APK) → vedi sezione "APK Build — Regola Obbligatoria"
- Errori OTA → vedi sezione OTA
- Warning non bloccanti (solo informativi) → non richiedono stop, riportare inline

**Sistema OTA — esecuzione sequenziale**: quando si lavora con il sistema OTA (publish-ota.sh, step export/publish, verifica bundle, rollback), eseguire sempre le operazioni in **sequenza**, un passo alla volta. Non parallelizzare tool call o script OTA. Aspettare il completamento e il log di ogni step prima di procedere con il successivo.

**"Pubblica l'OTA"** significa SOLO pubblicare una OTA (Over-the-Air update). NON avviare mai una build EAS (APK/AAB) in risposta a questo comando. La build EAS è un'operazione separata e richiede autorizzazione esplicita come da sezione "APK Build — Regola Obbligatoria".

## Framework A/B Testing Matching (Task #2525)

Permette di testare varianti dell'algoritmo di matching su sottogruppi di utenti
e misurare l'impatto su metriche reali (accept rate, chat aperte).

### Tabelle
- `ab_experiments` — `key`, `description`, `variants` (jsonb), `status` (`running|paused|ended`), `started_at`, `ended_at`.
- `ab_assignments` — assegnazione sticky `(experimentKey, userId) -> variant`.
- `ab_events` — eventi (`match_created`, `match_accepted`, `match_rejected`, `chat_opened`, …) con `experimentKey`+`variant`.

### Come creare un nuovo esperimento
1. Vai in **Admin → Matching → A/B Esperimenti**, clicca **Nuovo**.
2. Inserisci `key` (snake_case), descrizione e varianti JSON, es.:
   ```json
   [
     { "name": "control",  "weight": 0.5, "config": { "weight": 1.0 } },
     { "name": "stricter", "weight": 0.5, "config": { "weight": 1.4 } }
   ]
   ```
3. Nel matcher pertinente:
   ```ts
   import { getVariantConfig, trackAbEvent } from "@/server/matching/ab";
   const { config } = await getVariantConfig(userId, "mio_experiment_v1");
   const weight = typeof config.weight === "number" ? config.weight : 1.0;
   // ...usa weight nell'algoritmo...
   void trackAbEvent(userId, "mio_experiment_v1", "match_created", { matchId });
   ```
4. Aggancia `match_accepted`/`match_rejected` nelle route di azione del match.
5. Il pannello calcola accept rate / chat rate per variante e un z-test su due
   proporzioni (`simple-statistics`); p < 0.05 evidenziato in verde.

L'assegnazione è deterministica: `sha1(userId + experimentKey) % totalWeight`,
quindi lo stesso utente finisce sempre nella stessa variante per quell'esperimento.
Quando l'esperimento è `paused`/`ended` o non esiste, `getVariant` restituisce
`"control"` e il branching cade sui default — gli eventi non vengono registrati.

Esperimento seed: `bio_affinity_weight_v1` (soglia music affinity, control vs newScoring),
applicato in `server/matching/run-extra.ts`.

## Sistema OTA — Approvazione Admin (Task #2503)

Il sistema OTA di BikerLink usa un **flusso fisso a singolo binario, senza toggle e senza modalità alternative**:

1. **Publish** (`scripts/publish-ota-full.sh`): ordine atomico — prima `eas update --channel production`, parse `easUpdateId`/`easGroupId`, poi INSERT in `ota_releases` con `status='pending'` (sempre, senza condizioni), poi aggiorna `constants/buildInfo.ts` e push GitHub. Se EAS fallisce, `buildInfo.ts` NON viene modificato e niente git push.
2. **Gating server-side** (`GET /api/ota/manifest`): il client chiama questo endpoint PRIMA di parlare con EAS. Admin (`role='admin'`) riceve l'ultima release con status IN (`pending`, `approved`). Utenti normali e anonimi ricevono solo `approved`. Se l'updateId riportato da expo-updates non combacia con `allowedEasUpdateId`, il client annulla il download.
3. **Telemetria** (`POST /api/ota/event`): il client emette `downloaded` al fetch e `boot_success` dopo 8s di app stabile sul nuovo bundle. Dedup per `(release_id, device_id, event_type)` via UNIQUE INDEX.
4. **Approve/Reject** dal pannello `/admin/ota`. Il **Rollback** ri-esegue `eas update --republish --group=<groupId>` via `execFile` server-side e inserisce una nuova riga `approved`.
5. **Auto-rollback** è opt-in per singola release (OFF di default): se `auto_rollback_enabled=true` e `(boot_success_count/download_count)*100 < threshold` con `download_count >= min_downloads` e `age > window_minutes`, un worker (`server/jobs/ota-auto-rollback.ts`, schedule 5 min) marca automaticamente la release come `rejected`. Non interrompe download in corso.

**Regole obbligatorie:**
- **Bump runtimeVersion**: se aggiungi un modulo nativo (qualsiasi `expo-*` non puramente JS, o pacchetti con codice nativo Android/iOS), bumpa `runtimeVersion` in `app.json` E richiedi una nuova build nativa PRIMA di pubblicare OTA. Una OTA con runtimeVersion incompatibile crasha il device.
- **Nessun toggle bypass**: il flusso `pending → admin testa → approved` è sempre obbligatorio. Non esiste più il setting `ota_direct_apply` né gli endpoint `GET/POST /api/admin/ota/settings`. Non re-introdurli.
- **`checkAutomatically: "NEVER"`** in `app.json` — disabilita l'auto-check nativo di expo-updates. Ha effetto solo dalla prossima build nativa: utenti su build pre-`NEVER` potrebbero ancora ricevere il pending bundle nativamente (gating lato client mitiga ma non elimina del tutto).

## NOTA CRITICA — Dispositivo utente
**L'utente usa ANDROID** come dispositivo principale di test. Tutte le funzionalità devono essere verificate su Android prima di tutto. iOS è secondario. Non assumere mai che qualcosa funzioni "su iOS quindi funzionerà su Android" — testare sempre il contrario.

## System Architecture
BikerLink utilizes a modern full-stack architecture.

**Frontend:**
- Developed with Expo SDK 55 (React Native 0.83.4) for cross-platform compatibility.
- Navigation is handled by Expo Router, leveraging file-based routing.
- State management relies on `@tanstack/react-query` for data fetching and caching, complemented by React Context for global state.
- Internationalization supports 5 languages (IT/EN/DE/ES/FR) via `lib/i18n.ts` and `lib/language-context.tsx`.
- The UI/UX features a dark theme by default (background `#0D0D0D`, accent `#FF6600`) and includes custom icons like a Shark Carbon helmet for SOS.
- **Brand Theme Switcher**: Admin panel includes a 4-theme selector ("Attuale", "Asfalto Caldo", "Velocità Pura", "Rotta Libera"). Themes are defined in `constants/colors.ts` (`THEMES`), managed via `ThemeProvider` in `lib/theme-context.tsx`, persisted in AsyncStorage. Components use `useColors()` from `hooks/useColors.ts` to receive dynamic colors.
- Interactive maps are implemented esclusivamente con Leaflet in WebView (componenti `Leaflet*Map.tsx`). Solo native (Android/iOS): la piattaforma web è stata rimossa completamente (Task #1150).
- **⚠️ ARCHITETTURA MAPPE — Due sistemi distinti e separati**:
  - **Mappe utente (visualizzazione)**: Leaflet in WebView (componenti `Leaflet*Map.tsx`), tile server OSM o equivalente. Usato per mostrare a schermo utenti, percorsi, easter egg, workshop Syneco e qualunque overlay visivo.
<<<<<<< HEAD
  - **GraphHopper (routing)**: server di routing dedicato, usato **esclusivamente** per il calcolo dei percorsi moto (curvy roads, waypoint, ottimizzazione tracciato). Non viene mai usato per la visualizzazione diretta. Self-hosted su `https://routing.bikerlink.app`. Variabili d'ambiente: `GRAPHHOPPER_URL` (URL base server), `GRAPHHOPPER_TOKEN` (header X-GH-Token), `ROUTING_DISABLED=0` (abilita routing; default disabilitato). Tile server self-hosted: `TILES_URL=https://tiles.bikerlink.app` (letto da `lib/map-tiles.ts` via `SELF_HOSTED_TILES_URL`/`isTilesSelfHosted`; su client Expo usare `EXPO_PUBLIC_TILES_URL`). Endpoint test admin: `GET /api/admin/maps/test-routing` (in `server/routes/admin/maps/test-handler.ts`) — esegue percorso Milano→Como sull'engine configurato e ritorna `graphhopper_url` mascherato, `latency_ms`, `source`, `is_self_hosted`, `distanceKm`, `durationMinutes`.
  - **Valhalla (routing secondario)**: secondo routing engine self-hosted (Task #2360), affiancato a GraphHopper. Client: `server/routing/valhalla-client.ts`. Request builder: `server/routing/valhalla/request-builder.ts`. Response mapper: `server/routing/valhalla/response-mapper.ts`. Polyline converter: `server/routing/valhalla/polyline-convert.ts`. Selector: `server/routing/router-selector.ts`. Attivabile dall'admin tramite pannello Admin → Mappe → Routing Engine. Gated: visibile solo a utenti con `mapTester=true` quando rollout=tester, oppure a tutti quando rollout=all. Fallback automatico a GraphHopper su 5xx/timeout (header `X-Routing-Fallback: graphhopper`). Profilo motorcycle: `use_highways:0.3, use_trails:0.0, use_ferry:0.5`. Setup infrastruttura Docker in `infra/valhalla/README.md`. Variabili d'ambiente: `VALHALLA_URL`, `VALHALLA_API_KEY`.
  - **Mapbox Directions (cloud emergency, Routing #3)**: terzo engine (Task #2361) — failover cloud per emergenze quando entrambi i self-hosted sono down. Client: `server/routing/mapbox-directions-client.ts`. Request builder: `server/routing/mapbox/request-builder.ts`. Response mapper: `server/routing/mapbox/response-mapper.ts`. Quota guard: `server/routing/mapbox/quota-guard.ts`. Integrato nel selector `server/routing/router-selector.ts`. Profilo `driving` (Mapbox non ha motorcycle nativo; exclude motorway+ferry per approssimare moto-friendly). Gate quota: contatore `mapbox_request_count_month` in `app_settings`; soglia warning `mapbox_quota_warning_threshold` (default 80k); reset automatico il 1° del mese (cron in `server/index.ts`). Quota esaurita (≥100k): fallback preventivo a GraphHopper senza chiamare Mapbox. Errori 4xx/5xx/timeout: fallback automatico con header `X-Routing-Fallback: graphhopper`. Il payload `GET /api/admin/maps/config` include `mapbox_quota: { used, limit, percent, warning_threshold, resets_at }` quando Mapbox è attivo. Variabile d'ambiente: `MAPBOX_ACCESS_TOKEN` (token secret `sk.*`, da aggiungere nei Secrets quando si sottoscrive Mapbox). **REMINDER UTENTE**: aggiungere `MAPBOX_ACCESS_TOKEN` nei Secrets Replit quando si attiva l'abbonamento Mapbox (free tier: 100k req/mese, richiede carta di credito per verifica).
  - **MapLibre tile quality (Task #2370)**: `MAPLIBRE_API_KEY` (secret Replit) — API key MapTiler per tile vettoriali di qualità produzione. Quando presente, `lib/maplibre/tile-config.ts::getMapLibreStyleExpr()` usa `https://api.maptiler.com/maps/outdoor-v2/style.json?key={KEY}` (profilo outdoor ottimizzato moto). Senza key: fallback silenzioso a CartoCDN dark raster. Il pannello Admin → Mappe → Renderer mostra il badge "● MapTiler" (verde) o "● Demo" (giallo) in base alla presenza della key. `GET /api/admin/maps/config` include `tile_source_status: "maptiler" | "demo"`. **REMINDER UTENTE**: aggiungere `MAPLIBRE_API_KEY` nei Secrets Replit (piano gratuito MapTiler: 100k tile/mese, nessuna carta di credito richiesta — https://cloud.maptiler.com/account/keys).
  - **Regola operativa**: i due sistemi non vanno mescolati. Modifiche ai tile/stile della mappa utente non impattano GraphHopper e viceversa; modifiche al routing GraphHopper non toccano i componenti Leaflet. Ogni task che lavora su "mappe" deve dichiarare esplicitamente su quale dei due sistemi opera, per evitare confusione o regressioni incrociate.
- **Legacy app_settings keys**: la chiave `maps_engine` (Task #720) è stata rimossa completamente: il toggle Google Maps vs Leaflet non esiste più, l'endpoint `PUT /api/admin/settings/maps_engine` è stato eliminato e la risposta di `GET /api/settings/maps` non include più il campo `engine`.
- Features include user profiles (Biker, Zavorrina/Zavorrino, Coppia), interactive maps displaying users, Syneco workshops, and collectible easter eggs.
- **Onboarding images** (Task #991): le 30 PNG dell'onboarding sono archiviate in Object Storage (`public/onboarding/*.png`) e servite via `GET /api/assets/onboarding/:filename` (Cache-Control immutable 1 anno). `components/OnboardingCarousel.tsx` usa `{ uri: getApiUrl() + "/api/assets/onboarding/..." }`. La cartella `assets/images/onboarding/` è stata rimossa dal repository.
- Users can create and respond to ride proposals, engage in private and group chats, and track GPS routes with performance statistics.
- A photo contest system allows users to upload and vote on photos.
- User-specific features include a "Garage" for bikers to list motorcycles and a "Wishlist" for passengers to specify desired rides.
- Automatic matching connects compatible bikers and passengers based on preferences and location.
- "Ready to Ride" functionality indicates user availability.
- Custom routes can be created with multiple waypoints.
- Advertisement banners are integrated with targeting capabilities.
- GDPR compliance is addressed with data export, consent tracking, and account deletion requests.
- Over-the-air (OTA) updates are supported for seamless app versioning.

**Backend:**
- Built with Express 5 and TypeScript, running on port 5000.
- **Home page source of truth**: `server/site/pages.ts :: buildHome()` (registered via `server/site/routes.ts`). The old `server/templates/landing-page.html` has been deleted (Task #1537).
- PostgreSQL is used as the database, managed with Drizzle ORM.
- Replit Object Storage is utilized for user photos and backup services.
- The API provides endpoints for authentication, user management, motorcycle CRUD, ride proposals, chat, emergency SOS, GPS tracking, photo contests, Syneco workshops, advertising, notifications, reports, and administrative functions.
- A robust admin panel offers user management, content moderation, analytics, and system settings.
- A moderation panel handles photo approvals.
- A matching engine runs periodically to connect users based on defined criteria.
- Fake user generation is implemented for testing and initial user base simulation, with admin controls for management.
- Email services are handled via Nodemailer with Gmail SMTP.
- **OnlineTracker** (`server/online-tracker.ts`): In-memory singleton that tracks active sessions in real-time. Counter endpoints (`online-count`, `biker-available-count`, `zavorrine-available-count`) read directly from this tracker (zero DB queries). Updated on login, logout, availability toggle, ghost-mode toggle, heartbeat, and every authenticated API request (middleware in `server/routes.ts`). Stale sessions auto-expire after 15 minutes via a cleanup interval. On server restart, sessions are re-registered transparently from the first API call.
- **Backend startup phases** (server/index.ts): Phase 1–3 migrations/seed → Phase 4 motoclub → Phase 5 fake users → Phase 6 club conversations → Phase 7 playlist snapshot (6h) → Phase 8 ad cleanup (24h) → Phase 9 semaphore metrics (60s) → Phase 10 VACUUM FULL alle 03:00 Europe/Rome → **Phase 11 workspace cache cleanup (5min delay poi ogni 24h via child_process.exec su scripts/cleanup-cache.sh)**. La Phase 11 usa Opzione B (cron interno Express) invece di Replit Scheduled Deployment — coerente con Phase 7–10, nessuna infrastruttura extra. Prima pulizia manuale eseguita al merge (Task #994): liberati 919MB (.cache/ 719M + .metro-cache/ 200M).

**Core Features:**
- **Interactive Maps**: Display users, workshops, and easter eggs.
- **Proposals & Requests**: Facilitate ride organization with group chat.
- **Chat System**: Private and group messaging with phone number filtering.
- **GPS Tracking**: `app/(tabs)/tracking.tsx` — rebuilt v2 (no TaskManager, foreground-only). GPS profile (Passeggio/Standard/Race), Countdown semaforo colorato, Hands Off Modal app-wide, sprint 0-100 con Accelerometer G values (calibrazione 1-tap baseline), mappa Leaflet, Stats grid (tempo totale/netto/fermo, km, vel. max/media, quota max, G max, Incl. max°), Pubblica su Pic!, salvataggio locale. Tutti i calcoli sul client. Backend: `maxAccelerationG`, `maxTiltDeg`, `sprint0to100Ms` già in schema. **Tilt tracking** (Task #675): inclination laterale calcolata con `atan2(|x|, |z|)` dall'Accelerometer — `maxTiltDeg` tracciato live, salvato nel PUT stop, mostrato in summary modal e nel dettaglio giro `app/route/[id].tsx`. NOTA CRITICA: MAI aggiungere TaskManager.defineTask a module-level (crash Android).
- **Photo Contest**: Weekly contest with voting.
- **Syneco Integration**: Workshop locator and advertising.
- **Collectible Easter Eggs**: Geolocation-based hidden items.
- **Admin & Moderation Panels**: Comprehensive tools for platform management. Translations export uses **OAuth2 Google Drive** (account bikerlinkapp@gmail.com) — token stored in `app_settings.google_drive_refresh_token`. OAuth client: `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` (project `project-0a755da1-5c43-4c1b-897`). Callback: `https://biker-link.replit.app/api/admin/drive/oauth-callback`. Admin must connect via "Connetti Google Drive" button in Traduzioni panel before exporting. Service Account (`GOOGLE_SERVICE_ACCOUNT_JSON`) still used for browsing/reading Drive.
- **Automatic Matching**: Connects users based on profiles and preferences.
- **User Favorites**: Users can mark other users as favorites via a star icon next to nicknames. Favorites are persisted in `user_favorites` table. FavoriteStar component (`components/FavoriteStar.tsx`) shown in all user lists. Primal star is red (#FF3B30), favorite star is yellow (#FFD700) when active, white outline when inactive.
- **Custom Routes**: Allows users to create and share personalized routes.
- **Advertisement System**: Targeted ad delivery.
- **User Types**: Biker, Zavorrina/Zavorrino, Coppia with distinct functionalities.
- **Multilingual Support**: IT, EN, DE, ES, FR.
- **Player Musicale in-app** (SDK 55 cycle): `lib/player-context.tsx` (PlayerProvider con **expo-audio** createAudioPlayer, sleep timer, preferiti AsyncStorage). `components/MiniPlayer.tsx` (barra persistente + modal fullscreen con griglia generi radio). Backend: `server/routes/radio.ts` — `/api/music/genres`, `/stations/:genre` (Radio Browser API), `/preview` + `/preview-playlist` (iTunes Search API), `/suggested-genres`. Pulsante anteprima 30s nelle SharedPlaylistCard in music.tsx. **expo-audio@55.0.14** + `expo-media-library`. UIBackgroundModes["audio"] e permessi READ_MEDIA_AUDIO/FOREGROUND_SERVICE in app.json. NOTA: expo-av rimosso (Task #1052, R8 KeepAwakeManager error). NOTA: RNTP rimosso (incompatibile New Arch RN 0.83.4).
- **Music Integration — Last.fm only** (Task #440/#441, cleanup Task #777/#778): Last.fm is the sole music provider. Syncs user's top tracks and recently played songs from Last.fm. Music Match feature finds bikers with common music taste. Playlist sharing via chat messages. Backend: `server/routes/music-match.ts` (handleMusicMatch), `server/routes/auth.ts` (Last.fm connect/disconnect/sync/status/my-tracks/share-playlist/shared-playlists/merge-playlist). DB tables: `user_music_tokens` (renamed from `user_spotify_tokens` via Task #778), `user_music_tracks` with column `lastfm_track_id` (renamed from `spotify_track_id` via Task #778, provider defaults to "lastfm"), `shared_playlists`. messages table has `playlist_id` column. Requires Secrets: `LASTFM_API_KEY`, `LASTFM_SHARED_SECRET`.

**Deployment & Operations:**
- Development workflow includes separate commands for frontend and backend, with watchdog scripts for automatic restarts and error monitoring.
- EAS Build is used for cloud-based Android APK and AAB generation, supporting `preview` and `production` profiles.
- **react-native-reanimated@~4.2.1** (versione corretta SDK 55, bundledNativeModules.json) configurato per compatibilità EAS. NOTA: reanimated 3.x causava CMake build failure con NDK r27b (immagine EAS ubuntu-24.04-jdk-17-ndk-r27b-sdk-55). Android/ rimosso da git — EAS usa managed workflow (expo prebuild automatico). `react-native-maps` rimosso (Task #717): tutte le mappe usano Leaflet in WebView.
- OTA updates are managed via custom scripts for seamless deployment of new features.
- **OTA delivery — solo backend custom** (Task #980 + #2316): l'handler `GET /api/expo-updates` vive in `server/routes/expo-updates.ts`. Il publish OTA continua via `scripts/publish-ota.sh` (`eas update --channel staging`); gli asset restano su CDN EAS. `syncStagingUpdates` (admin/ota.ts) interroga EAS GraphQL per popolare DB `ota_releases` con `status='pending'` (oppure direttamente `approved` se il setting `ota_direct_apply` è ON). **L'approve / rollback NON chiama EAS GraphQL**: è solo `UPDATE ota_releases SET status='approved'` + invalidazione cache manifest (via `req.app.locals.invalidateExpoUpdateHash`). Il device interroga il backend; il backend prende l'ultima release approvata per la `expo-runtime-version` richiesta, chiama EAS GraphQL `updatesByGroup($group)` per costruire il manifest (launchAsset/assets puntano direttamente al CDN EAS) e lo serve in multipart/mixed Protocol v1. iOS riceve sempre `directive: noUpdateAvailable`. Cache manifest in memoria TTL 5 min per ridurre hit a EAS GraphQL. **Anti-pattern**: prima di modificare `server/routes/admin/ota.ts` rileggere questa sezione — l'architettura è custom, non EAS Updates standard. Mai aggiungere mutation EAS GraphQL per "promuovere" update (mutation `republishUpdateGroup` non esiste nello schema EAS e causa HTTP 400). Note storiche Task #980: l'endpoint `expo.updates.url` in `app.json` punta a `https://biker-link.replit.app/api/expo-updates`, servito da `server/routes.ts:417` (handler `/api/expo-updates`). **Task #1150 — Protocol v1 (multipart/mixed)**: switch da `expo-protocol-version: 0` con body JSON (configurazione invalida che SDK 55.0.21 rigettava sistematicamente con `ExpoUpdates.checkForUpdateAsync rejected → Failed to check for update`, bloccando 19+ device su OTA-19) al protocollo v1 corretto. Helper `writeMultipartResponse(parts)` costruisce risposta multipart/mixed con boundary random, body inviato come Buffer (impedisce a Express di appiccicare `; charset=utf-8` vietato da RFC 2046 e di generare ETag debole). Tre casi: (1) `200` con parte `manifest` (JSON con launchAsset/assets/extra.expoClient) quando esiste una release più nuova; (2) `200` con parte `directive: noUpdateAvailable` quando il device è già al pari, runtimeVersion ignoto, o piattaforma iOS; (3) `500` JSON in caso di errore. Niente più 204/304/If-None-Match (non previsti dal protocollo v1). ⚠️ La fix è efficace solo dopo redeploy del backend in produzione. EAS Updates è dismesso: `eas update` / canali EAS Updates non vengono più usati. `eas build` resta attivo per generare APK/AAB e `extra.eas.projectId` deve restare in app.json (serve a `eas build`). La guard `scripts/validate-ota.sh` blocca la pubblicazione se trova `u.expo.dev` in `app.json` o `android/app/src/main/AndroidManifest.xml`. ⚠️ Le APK installate prima del fix di app.json possono avere ancora l'URL EAS bakato nel manifest nativo: il fix è effettivo solo dalla prossima APK ricostruita.
- **Web platform completamente rimossa** (Task #1150): BikerLink è esclusivamente una mobile app (Android primary, iOS secondary). Tutto il supporto web è stato eliminato per ridurre la superficie di manutenzione e azzerare i conflitti con il classifier autoscale di Replit. Cosa è stato tolto:
  - **`scripts/deploy-build.sh`**: rimosso lo step `npx expo export --platform web` (4.8 MB in `static-build/web/` che faceva fallire la promozione del container autoscale) e poi anche il marker `static-build/index.html`. Restano solo 2 step: `db:push` ed `esbuild server`.
  - **`server/index.ts`**: rimossi i blocchi `app.use("/web", express.static(webBuildDir))`, `app.use(express.static("static-build"))`, l'SPA fallback su `static-build/index.html`, il dev proxy a Metro :8081 (`createProxyMiddleware` da `http-proxy-middleware`) e il catch-all per servire `static-build/web/index.html`. Semplificato il manifest handler su `/`: ora serve sempre la landing page quando manca l'header `expo-platform`. Conseguenza: la rotta `/web` ora risponde 404.
  - **9 componenti `*.web.tsx`** eliminati (`InteractiveMap`, `Leaflet{MiniMap,PickerMap,RouteMap,TrackingMap}`, `MapPickerModal`, `RouteDetailMap`, `RouteMap`, `TrackingMap`). Le controparti `.tsx` / `.native.tsx` restano. `MapPickerModal.native.tsx` rinominato in `MapPickerModal.tsx` (suffisso `.native` ridondante senza web, e TS LSP non risolveva `.native.tsx`).
  - **Dipendenze npm**: rimosse `react-native-web` e `react-dom` (utilizzate esclusivamente per il bundle web).
  - **`app.json`**: rimosso il blocco `expo.web.favicon`.
  - **Manutenuto intatto**: landing page, pagine HTML statiche (`/privacy`, `/terms`, `/delete-account`, `/apple-review`), endpoint OTA (`/api/expo-updates`), tutte le rotte API, l'endpoint `/healthz`.
  - **`Platform.OS === 'web'` dead branches rimossi** (Task #1622): tutte le occorrenze di `Platform.OS === 'web'` in app/, components/, lib/ sono state eliminate — `handleImportGpxWeb`, `TrackingWebFallback`, rami ternari nei padding insets, guard nei context di posizione e in ota-hardening.
- **Notification tap navigation** (Task #1170): `app/notifications.tsx` ha `getNotifRoute()` che mappa ogni tipo di notifica (`match`, `motoclub_invite/join`, `event_*`, `proposal/sos`, `chat`) alla route di destinazione usando `referenceId`. Toccando una notifica si segna come letta e si naviga al contenuto.
- **OTA adoption trends** (Task #1167): `GET /api/admin/ota-adoption` restituisce breakdown per `release_id`/`phase`/`platform` e tendenze giornaliere 30 giorni. `app/admin/ota-history.tsx` mostra badge "device unici" accanto a ogni OTA se il dato è disponibile.
- **ota_events auto-cleanup** (Task #1168): Phase 12.5 in `server/index.ts` — rimuove record `ota_events` oltre 1000 righe o più vecchi di 30 giorni, schedulato 20min dopo boot poi ogni 24h.
- **OTA guard SKIP_LIVE_CHECK fix** (Task #1166): `scripts/validate-ota.sh` — se `SKIP_LIVE_CHECK=1` e il server risponde HTTP 200 senza release ID (risposta no-update), ora è `warn` invece di `fail`.
- **Error monitor OTA mismatch** (Task #1172): `scripts/error-monitor.sh` aggiunge `check_ota_mismatch()` ogni 20 cicli (~10 min) — confronta il `releaseId` atteso (da `ota-updates.json`) con quello servito in produzione.
- **Ads GroupHeader status badge** (Task #916): `app/admin/ads.tsx` `GroupHeader` mostra badge testuale "Attivo"/"Parziale"/"In pausa" accanto al dot colorato.
- **AlwaysPermissionNotice denied feedback** (Task #1174): `components/AlwaysPermissionNotice.tsx` — se `requestBackgroundPermission()` restituisce false, mostra banner rosso con istruzioni Impostazioni → Posizione → Sempre.
- **Stale ad images cleanup on delete** (Task #1175): `server/routes/admin.ts` — `DELETE /advertisements/:id` e bulk-delete recuperano l'imageUrl prima di cancellare dal DB, poi chiamano `fs.unlink()` sul file locale in `uploads/ads/`.
- **Sensor permission canAskAgain** (Task #1178): `app/admin/sensors/_sensor-screen.tsx` — `requestSensorPermission()` espone `canAskAgain` da `Pedometer.requestPermissionsAsync()`; se false, il messaggio di errore nel log indica "già negato in precedenza" e suggerisce Impostazioni → Privacy → Movimento e fitness.
- **Sprint 0-100 history with personal best** (Task #676): `GET /api/sprints` in `server/routes/sprints.ts` — queries `routes` table where `is_sprint=true AND status='completed' AND sprint_0to100_ms IS NOT NULL`, ordered by time ASC (fastest first). `app/sprint-history.tsx` — screen showing trophy-ranked sprint list, gold personal best banner, G/tilt chips, pull-to-refresh. Navigation: trophy button in sprint container (`"Storico"` → `router.push("/sprint-history")`). Animated "Nuovo Record!" badge (gold) in tracking.tsx when a new sprint beats the personal best (fetched via `useQuery` when 0-100 mode is enabled). `app/_layout.tsx` updated with `sprint-history` stack screen.
- **Sensor stats in ride summary** (Task #675): Tilt laterale (`maxTiltDeg`) tracciato via Accelerometer `atan2(|x|, |z|)`. Live card "Incl. max" nel stats grid (con `compass-outline`). Summary modal mostra G max accel + Incl. max quando `sensorsEnabled`. `app/route/[id].tsx` mostra `maxAccelerationG`, `maxTiltDeg`, `sprint0to100Ms` nel dettaglio storico (condizionalmente, solo se > 0). Backend PUT /:id/stop già gestisce `maxTiltDeg`; schema `routes` già ha colonna `max_tilt_deg`.

## Utenti Seed

| Nickname | Email | Ruolo | Password |
|----------|-------|-------|----------|
| admin | admin@bikerlink.it | admin | admin2025! |
| moderatore | mod@bikerlink.it | moderator | mod2025! |
| user1 | user1@bikerlink.it | user | test |

Seed script: `npx tsx server/seed.ts` (idempotente, salta utenti esistenti).
Il seed imposta `emailVerified: true` per tutti gli utenti creati.

## External Dependencies
- **Expo SDK 55** (React Native 0.83.4): Core framework for React Native development.
- **expo-audio@55.0.14**: Audio playback (radio streaming, MP3, preview 30s) con background playback. Sostituisce expo-av (rimosso in Task #1052: R8 errore KeepAwakeManager in EAS build). Sostituisce RNTP (incompatibile New Architecture RN 0.83.4).
- **react-native-reanimated@~4.2.1**: Versione corretta per SDK 55 (bundledNativeModules.json). Versioni 3.x causano CMake build failure con NDK r27b su EAS.
- **expo-media-library**: Accesso alla libreria musicale del dispositivo.
- **React Native**: Frontend UI framework.
- **Express 5**: Backend web application framework.
- **TypeScript**: Superset of JavaScript for type safety.
- **PostgreSQL**: Relational database.
- **Drizzle ORM**: Object-Relational Mapper for database interaction.
- **@tanstack/react-query**: Data fetching and caching library for React.
- **Replit Object Storage**: Cloud storage for media files and backups.
- **pdfkit**: Library for PDF generation (used in scripts).
- **Zod**: Schema validation library.
- **express-rate-limit**: Middleware for rate limiting API requests.
- **Nodemailer**: Module for sending emails.
- **Gmail SMTP**: Email sending service.
- **eas-cli**: Command-line interface for Expo Application Services builds.
## APK Build — Regola Obbligatoria

**Nessuna build APK può essere avviata senza autorizzazione esplicita dell'utente.**

Usare SEMPRE `scripts/build-apk.sh` — mai `npx eas-cli build` direttamente.

Procedura:
1. Ottenere approvazione esplicita dall'utente ("sì, avvia la build APK")
2. `touch .local/apk-build-authorized`  ← token monouso, viene eliminato dopo l'uso
3. `bash scripts/build-apk.sh` → default `release-apk` (APK arm64 dimagrita ~50MB)
   - oppure `bash scripts/build-apk.sh production` per AAB Play Store

Lo script blocca l'esecuzione se `.local/apk-build-authorized` non esiste, logga ogni build in `logs/apk-build-history.log`, e richiede un nuovo token per ogni build successiva.

### Profilo APK standard — `release-apk` (Task #1017)

Da Task #1017 in poi il default permanente è il profilo **dimagrito**:

| Caratteristica | Valore |
|---|---|
| ABI | **solo `arm64-v8a`** (telefoni Android dal 2017 in poi) |
| New Architecture | **abilitata** (`newArchEnabled=true`) |
| ProGuard / R8 | **abilitato** |
| Shrink Resources | **abilitato** |
| Hermes | **abilitato** |
| Dimensione attesa | **~45-55 MB** (vs 135 MB delle APK universali pre-#1017) |

Configurazione applicata in:
- `android/gradle.properties` → `reactNativeArchitectures=arm64-v8a`
- `android/app/build.gradle` → `ndk { abiFilters "arm64-v8a" }`
- `app.json` plugins → `expo-build-properties` (newArchEnabled + ProGuard + ShrinkResources)
- `eas.json` → solo profili `release-apk` e `production`. Il vecchio `preview` (APK universali 4 ABI ~135MB) è stato **rimosso**: `bash scripts/build-apk.sh preview` viene bloccato con messaggio esplicito.

**Nota sul profilo `production` (AAB Play Store):** poiché il restringimento ABI è applicato nei file Android committati (`android/gradle.properties` + `android/app/build.gradle`), anche l'AAB generato dal profilo `production` sarà arm64-only. Questa è una conseguenza intenzionale e accettabile: Google Play Store richiede 64-bit dal 2019 e Android 14 (ottobre 2023) deprecate il supporto 32-bit. Inoltre il formato AAB di Play Store gestisce automaticamente la consegna per ABI. Se in futuro servisse riabilitare armeabi-v7a SOLO per l'AAB Play Store, occorrerà rendere `abiFilters` parametrizzabile via gradle property (es. `-PandroidAbiFilters=...`) e impostarlo nel `gradleCommand` del profilo production in `eas.json`.

**Guardia config-based in `scripts/build-apk.sh`:** prima di ogni build EAS lo script verifica che `gradle.properties`, `build.gradle` e il plugin `expo-build-properties` in `app.json` siano tutti coerenti con arm64-only. Se qualcuno regredisce uno qualsiasi di questi tre file la build viene bloccata con messaggio chiaro — la guardia non dipende dal nome del profilo.

## Legacy app_settings keys (non più utilizzate)
- **`maps_engine`** (Task #649 → dismessa Task #718/#719): toggle motore mappa Google Maps vs Leaflet. Le mappe sono ora esclusivamente Leaflet (vedi sezione Frontend). La riga in `app_settings` con key='maps_engine' è stata rimossa dal DB di produzione (verificato: assente sia in dev che prod). L'endpoint `GET /api/settings/maps` continua a rispondere correttamente: in mancanza della riga il campo `engine` viene restituito col fallback `"leaflet"` (compatibilità retro). Il PUT admin `/api/admin/settings/maps_engine` resta presente come stub legacy e potrà essere rimosso del tutto in un task successivo.

## Dev vs Production JS Engine (Android)
- **SDK 55**: Il campo `jsEngine` è stato rimosso da `app.json` (la configurazione è ora automatica).
- **Build EAS** (preview/production): `eas.json` → `android.jsEngine: "hermes"` — le APK/AAB usano Hermes.
- **Expo Go**: Metro gestisce automaticamente il bundling senza bisogno di configurazione esplicita jsEngine.

## Ciclo APK corrente — v44 (rv 8.0.0)

| Campo | Valore |
|---|---|
| versionCode | 44 |
| version | 3.3.0 |
| runtimeVersion | 8.0.0 |
| EAS Build ID | `b148edc3-de25-4f55-b5c4-c4466b4ccc0b` |
| EAS Dashboard | https://expo.dev/accounts/andreamasteri/projects/bikerlink/builds/b148edc3-de25-4f55-b5c4-c4466b4ccc0b |
| apkUrl | https://expo.dev/artifacts/eas/nTJjWowt3HRSs7BqRvdCRi.apk |
| Avviata il | 2026-04-30 |
| Profilo | release-apk (APK arm64-v8a only, ProGuard, NewArch, ~50MB) |
| Cache | --clear-cache (Gradle remota) |
| Motivo rebuild | Almeno un device Android (utente) ancora piantato su OTA-19 anche dopo il deploy del fix backend OTA Protocol v1 (Task #1150). Serve APK baseline pulita da installare manualmente. |

**Note ciclo 8.x — APK v44:**
- L'APK contiene baked il bundle JS aggiornato (post Task #1150) — il client al primo avvio chiamerà `/api/expo-updates` col Protocol v1 corretto e uscirà dallo stato piantato
- runtimeVersion 8.0.0 invariato — APK v44 resta compatibile con OTA-22 già pubblicata (e con qualsiasi OTA futura sullo stesso runtime 8.0.0)
- Bump versionCode 43→44 obbligato dal vincolo monotonico crescente di Google Play (anche se l'APK 43 reale non è mai stato distribuito su store)
- L'APK arm64 dimagrita (~50MB) è installabile direttamente dall'utente per side-load sui device piantati su OTA-19

**Ciclo precedente:** APK v43 / rv 8.0.0 / 3.2.0 — apkBuildId `38cb1b32-4316-4f63-9799-1b9ab36888e8`, APK https://expo.dev/artifacts/eas/81L2RgW8kFuzUiRzACfAEm.apk (STABILE)

---

## 📌 Promemoria utente

> Quando l'utente dice **"ricordami di..."** o **"ricordiamoci di..."**, aggiungo una voce qui sotto con la data.
> Quando dice **"cosa dovevi ricordarmi?"**, rileggo questa sezione e gliene faccio un elenco.

<!-- PROMEMORIA_INIZIO -->
- **2026-05-24** — Controllare stato e operatività delle chat dei club. C'era qualcosa che non andava all'avvio (problema da indagare).
<!-- PROMEMORIA_FINE -->
