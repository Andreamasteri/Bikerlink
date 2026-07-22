# BikerLink — AI Knowledge Base (Parte 2/4)

> **Continuazione dalla Parte 1.** Copre: Database (Sezione 4), Flussi Applicativi Completi (Sezione 5), File più Delicati (Sezione 6).

---

## SEZIONE 4 — DATABASE

Non lo schema, ma il PERCHÉ delle scelte e i rischi.

---

### 4.1 Tabelle critiche — non toccare senza piano

**`users`** — La tabella centrale. Ha indici GIN expression su `normalize_text(col)` (migration 0042) che Drizzle non sa gestire. È nella `tablesFilter` exclusion list di `drizzle.config.ts` — MAI rimuoverla da lì o il publish genera `DROP INDEX + CREATE` errati. Qualsiasi modifica allo schema richiede un file SQL migration.

**`system_signals`** — Usata dal watchdog per tracciare lo stato di salute di tutti i servizi. Auto-cleanup a 7 giorni. Non aggiungere colonne senza aggiornare il tipo TypeScript corrispondente e il collector.

**`ride_telemetry`** — Dati GPS delle uscite moto. Auto-cleanup a 7 giorni. Ha `telemetry_session_stats` come tabella di summary — qualsiasi modifica a `ride_telemetry` DEVE mantenere `telemetry_session_stats` in sync o i totali derivano.

**`ai_call_logs`** — Log di ogni chiamata AI (provider, latenza, token, persona). Usata per budget tracking e debugging. Crescita illimitata — verificare che la retention policy sia attiva.

**`app_settings`** — Configurazione runtime del sistema. Letta da quasi tutto. Vedere sezione 3.6 per le dipendenze nascoste. La colonna `valueJson` (JSONB) è distinta da `value` (TEXT) — attenzione a quale si scrive.

**`embeddings`** — Vettori pgvector 1536 dimensioni. Ha indice HNSW (`vector_cosine_ops`) creato al boot, NON nelle migration. È nella exclusion list `drizzle.config.ts`. Non toccare la struttura senza aggiornare il modello di proiezione in `client.ts`.

**`schema_migrations`** — Tabella interna del custom migration runner. Non toccare mai manualmente. Traccia quali `.sql` sono stati applicati.

**`matching_locks`** / DragonflyDB distributed lock — Il matching engine usa un lock distribuito Redis per prevenire doppi cicli. Al boot, se il processo precedente è crashato, il lock può essere orfano. `boot-sequence.ts` lo pulisce se è scaduto o owned da un PID morto.

---

### 4.2 Tabelle legacy / temporanee

**`session`** — Tabella sessioni Express (`connect-pg-simple`). Non è nello schema Drizzle (è nella exclusion list). Non toccarla direttamente.

**`integrity_runs`, `integrity_violations`, `integrity_quarantine`** — Tabelle di db-integrity, nella exclusion list. Non parte dello schema Drizzle normale.

**`spatial_ref_sys`, `geography_columns`, `geometry_columns`** — Tabelle di sistema PostGIS. MAI toccarle. MAI fare migration su di esse. Owned da `cloud_admin`, non da noi.

---

### 4.3 Pool max=10 — architettura delle connessioni

Il pool PostgreSQL ha `max: 10` **fisso**. Non si ingrandisce mai. Questa è una decisione architetturale, non una limitazione temporanea.

**Budget delle connessioni**:
```
Pool totale: 10 connessioni
├── Job background: max 3 (via withBgDbSlot, RE-ENTRANT con ALS)
├── db-collector watchdog: 1 dedicata (pool.connect() + early-exit se !isPoolHealthy)
└── Traffico API utente: ≥ 6 riservate
```

**`withBgDbSlot` è RE-ENTRANT**: usa AsyncLocalStorage per permettere a un job background di fare query nested senza acquisire slot aggiuntivi. Non è un semplice semaforo.

**Errori frequenti**:
- `pool.connect()` diretto in job background → satura → API timeout
- `Promise.all([query1, query2, query3])` in background → consumano tutte le slot contemporaneamente
- "Saturo ma 0 query attive" → connessioni idle checked-out (non rilasciate) → usare `application_name` + tracer per attribuire

**Timeout**: `withDbTimeout` default 4500ms. `rebuildHnswIndex` ha `statement_timeout=0` (può durare minuti).

---

### 4.4 HNSW index — strategia di deploy

**Cosa**: Indice HNSW (Hierarchical Navigable Small World) su `embeddings.embedding` per ricerca vettoriale veloce con `vector_cosine_ops`.

**Perché NON nelle migration**:
- Replit calcola il diff schema dev↔prod autonomamente
- Se l'indice è in dev, Replit genera `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)` nel diff
- Ma `vector_cosine_ops` non è un operatore standard — la `CREATE INDEX` fallisce in produzione
- Replit Publish abortisce

**Quando viene creato**: Al primo boot dalla `boot-sequence.ts`, in modo asincrono (post-READY, non fatale). Se il DB è già pronto, è idempotente.

**`statement_timeout=0`** per `rebuildHnswIndex` — non aggiungere timeout qui o la rebuild fallisce su dataset grandi.

---

### 4.5 Vacuum smart — logica e configurazione

**Vacuum notturno**: Gira come job schedulato. Per default fa solo `ANALYZE`. `VACUUM FULL` è costoso (lock esclusivo) e gira solo se il bloat supera la soglia configurata in `AppSetting vacuum_full_bloat_threshold` (key: `db_vacuum_smart_v1`).

**`SET LOCAL`** è no-op fuori da una transazione — non usarlo per impostare configurazioni a livello di connessione.

**db-collector usa 1 connessione pool.connect()** con early-exit se `!isPoolHealthy()` — non aggiungere altre query a questa connessione o si rischia la saturazione.

---

### 4.6 Migrazioni — regole critiche

1. **Prefisso numerico univoco**: `NNNN_nome.sql`. Un duplicato blocca l'intero batch (dev E prod) fino a risoluzione.
2. **Idempotenza**: Ogni migration deve essere rieseguibile senza errore (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE ... IF NOT EXISTS colonna`).
3. **Pattern deduplicazione corretto**: CTE con `ROW_NUMBER()` (mai `DELETE FROM t WHERE id NOT IN (SELECT id FROM t)` — NULL-unsafe).
4. **Indici DESC/WHERE**: Usare sempre `DROP INDEX IF EXISTS` + `CREATE INDEX` (mai solo `CREATE INDEX IF NOT EXISTS` che salta silenziosamente se l'indice esiste già senza le opzioni speciali).
5. **Schema drift guard**: Al boot Phase 2b, un checker confronta lo schema Drizzle con le migration. Un drift blocca il boot (process.exit). Se il checker stesso fallisce → `markDegraded` (non process.exit).

---

### 4.7 Backup e recovery

**Backup DB**: `scripts/backup-db.sh` produce dump JSONL in `.local/backups/`. Questi file vengono puliti durante il deploy (non servono a runtime).

**Check prod (read-only)**: Usare `executeSql({ environment: "production" })` con SELECT-only. Mai connection string diretta. `pg_stat_user_tables` può essere stantio — preferire `pg_catalog` o query dirette.

**Production data removal**: Un agente NON può cancellare righe live in produzione. Solo un boot cleanup su publish può mutare dati prod.

---

### 4.8 db-integrity — il sistema di integrità

**`server/ai/db-integrity/`** è un sistema autonomo che verifica periodicamente:
- Orfani (foreign key violation nei dati, non nello schema)
- Cross-table consistency
- Drift schema vs migration

**`information_schema.columns`** è lento in prod (148+ tabelle, N query sequenziali → timeout 30s). Fix: `getAllColumnsMap()` via `pg_catalog` in 1 query + cache 10 minuti.

---

## SEZIONE 5 — FLUSSI APPLICATIVI COMPLETI

Ognuno descrive tutti i componenti coinvolti passo per passo.

---

### 5.1 Autenticazione / Login

**Client** (`app/(auth)/login.tsx`):
1. Utente inserisce email/password
2. `apiRequest('/api/auth/login', 'POST', {email, password})`
3. Server crea sessione `connect-pg-simple` (tabella `session`)
4. Client riceve cookie di sessione (`connect.sid`)
5. `AuthContext` (`contexts/AuthContext.tsx`) rileva la sessione → `useQuery('/api/users/me')`
6. `useAuth()` ritorna `user` non-null → redirect a `/(tabs)`

**Server** (`server/routes/auth.ts`):
- Rate limiting su `/api/auth/login`
- Bcrypt per verifica password
- `express-session` + `connect-pg-simple` per sessione persistente nel DB
- Brute-force lockout su TC auth (separato dal login utente)

**Anti-pattern**: `router` nelle deps di `useEffect` che fa redirect → loop. Fix: `routerRef + didRedirectRef`.

**Seed account**: Apple Reviewer e Google Play Reviewer vengono seeded al boot (Phase 4). Credenziali in `APPLE_REVIEWER_PASSWORD` e `GOOGLE_PLAY_REVIEWER_PASSWORD`.

---

### 5.2 Registrazione

**Flusso** (`app/(auth)/register.tsx`):
1. Scelta ruolo: `biker` / `zavorrina` / `coppia`
2. Compilazione form con foto profilo
3. Upload foto → Object storage Replit (bucket configurato)
4. `POST /api/auth/register`
5. Auto-login dopo registrazione
6. Seed iniziale preferenze, wishlist o moto (secondo il ruolo)

**Nota**: Il seed auto-seed di utenti fake gira post-READY se il DB ha < 100 utenti. In produzione con 100+ utenti il seed è skippato.

---

### 5.3 Matching Engine

**Entry point**: `server/matching-engine.ts` avviato in Phase 4 del boot.

**Ciclo di matching** (scheduler con lock distribuito Redis):
1. Acquisisce il lock distribuito (`matching_lock` in DragonflyDB)
2. Recupera bikers disponibili e zavorrine in cerca
3. Calcola affinità (algoritmo in `shared/db/matching.ts`)
4. Produce `biker_biker_matches` o `biker_zavorrina_matches`
5. Rilascia il lock

**Governance** (`server/ai/coordinator/`):
- Solo Horus può pausare/riprendere il matching
- Bowie legge e relaya lo stato ma non scrive

**Zombie recovery**: Al boot post-READY, se il lock è orfano (processo precedente crashato), viene pulito se è scaduto o owned da PID morto.

**Anti-pattern**: `withSchedulerRetry` avvolge SOLO l'acquisizione, MAI il loop mutante. Un retry del loop farebbe doppio-write.

---

### 5.4 Chat (utente ↔ AI Bowie)

**Client** (`app/(tabs)/bowie.tsx` + `app/(tabs)/chat.tsx`):
1. `POST /api/assistant/chat` con messaggio utente
2. Server identifica la persona routing (roster.ts: Bowie, Horus, Ares, Nadir)
3. Se Bowie: `callOllamaChat` con `think:false`, `stream:true`, modello `bikerlink:latest`
4. SSE stream al client

**Handoff personas** (`server/ai/assistant/roster.ts`):
- Bowie → Horus: trigger su parole chiave routing/percorsi
- Bowie → Ares: trigger su richieste diagnostica (admin only)
- Bowie → Nadir: trigger su ricerca nel manuale

**Tool calling**: AI SDK `streamText` con tool definitions. Cloud fallback (Groq/Gemini/OpenAI) gira SENZA tool — se il turno richiede tool, il cloud non può soddisfarlo.

**Lingua**: Ogni turno visibile DEVE applicare la lingua dell'utente (default IT) al prompt.

---

### 5.5 Notifiche Push

**Stack**: Expo Notifications + Firebase Cloud Messaging (Android) + APNs (iOS).

**Bowie Terminal** (app separata in `bowie-terminal/`):
- Riceve notifiche push come "alert" visibili
- iOS: richiede `requestPermissionsAsync` + `setNotificationCategoryAsync` per la quick-reply UI
- Android: i data-only push (`main_app_foreground_close`) velocizzano il fallback poll da 50s

**Reply da notifica**:
- App in foreground: SSE
- App in background: `opensAppToForeground:true` + `getLastNotificationResponse` per cold-start recovery + deduplica

**Per-device push**: `sendBowieReplyPush(deviceId)` invia a un singolo device. `revoke` purga i `pushTokens`.

---

### 5.6 AI — Agenti + Fallback Chain

**Decisione routing** (`server/ai/moderation/provider.ts`):
1. `runWithFallback(persona, fn)` controlla `ai_fallback_enabled`
2. Se OFF: solo ThinkCentre Ollama
3. Se ON: Groq → Gemini → OpenAI → Ollama fallback
4. `resolveModel(persona)` sceglie il modello corretto
5. Ogni chiamata cloud passa per scheduler RPM (Bottleneck) per non bruciare rate limit

**Ollama non-streaming** (Horus via `ShellExec + curl`):
- `think: false` obbligatorio (qwen3:4b lascia content vuoto senza)
- Strip dei tag `</think>` orfani
- `num_predict ≤ 600/700`, prompt < 300 parole (Cloudflare taglia a 100s)

**Ollama streaming** (Bowie chat SSE):
- `think: true` + `fullStream`
- Buffer e valida prima di emettere (no output corrotto)
- Fallback Gemini pulito se Ollama giù

**Circuit breaker**: `nadir-openai-quota-circuit-breaker.md` — 429 da OpenAI apre un breaker 10min per i chunk di Nadir.

---

### 5.7 Routing Moto (Percorsi)

**Engine disponibili**:
1. GraphHopper multi-area (TC) — profili: car, foot, bike (moto curvy)
2. Valhalla (TC) — profilo extra: auto_panoramica (scenic)
3. Cloud GH (fallback se TC giù) — solo profili base

**Flusso** (`server/routing/router-selector.ts`):
1. Legge `routing_function_engines` da `app_settings` per override per-funzione
2. Seleziona engine (`ai-engine-decider.ts` usa telemetria per routing AI)
3. Chiama GH multi-area via `/areas/<code>/route` (MAI root `/route`)
4. Per auto panoramica: Valhalla-only, fail → 503 esplicito

**Kill-switch**: `ROUTING_DISABLED` env vince su soft toggle DB. Nel watchdog: `isRoutingExplicitlyDisabled()` → SKIP (non KO→BROKEN).

**Probe GH**: `PointNotFoundException` = motore ALIVE, punto fuori rete. `5xx` / wrong profile = motore BROKEN.

---

### 5.8 OTA Publish Pipeline

**Workflow normale**:
1. Scrivere `.ota-message` con il testo dell'aggiornamento
2. Lanciare workflow "OTA Publish" (`scripts/publish-ota-full.sh`)
3. Script legge `versionCode` e `runtimeVersion` da `app.json`
4. `eas update --environment production --channel production`
5. Aggiorna `logs/ota-hwm.txt` (high-water mark anti-regressione)
6. OTA disponibile agli utenti con l'app che fa polling

**Pipeline Emergency (EMCY)**:
- Flag `ota_emergency_active` in `app_settings`
- Pubblica da git worktree isolato (`/tmp/...`)
- `/tmp` e workspace sono FS separati — usare tar-pipe, non rsync
- `eas update --environment production` obbligatorio (non staging)

**Approvazione**: Le OTA pubblicate devono essere approved server-side. Un APK nuovo non può applicare una OTA approved più vecchia.

**Canale diagnostic**: OTA separate per APK diagnostici (`Updates.channel === 'diagnostic'`).

---

### 5.9 Scheduler + Watchdog

**Scheduler** (`server/matching/scheduler.ts`):
- Emette heartbeat ad ogni tick (anche skip)
- `cycleInFlight` si resetta dopo > 10 minuti (zombie recovery)
- `bg-db-limiter` coda con tetto + timeout; dropped* appaiono nelle stats

**Watchdog** (`server/ai/watchdog/`):
- Raccoglie segnali da `system_signals`
- Escalation da `warning` a `high` solo dopo 3 campioni consecutivi
- Proposer AI ha cooldown 30min
- Alert "all-clear" DEVE essere latchato a un alert reale precedente (non a uno soppresso)
- Alert "high" richiedono un blocco dedicato per-id + throttle `shouldSend`

**Cerbero** (`scripts/cerbero.sh`):
- Restart backend SOLO se `/api/health` è irraggiungibile (503 = init = vivo, non killare)
- Counter crash backend e Metro separati
- Clean Metro: fast-clean default, `FORCE_RESET=1` per deep clean

---

### 5.10 Moderazione

**Stack**: `server/ai/moderation/` — triage, redact, provider.

**Flusso**:
1. Contenuto utente → `triage.ts` (classifica severità)
2. `redact.ts` rimuove PII
3. `provider.ts` decide il provider (locale o cloud)
4. Decisione → `ai_decisions` table con `aiName`

**Admin override**: Può chiudere `ai_conflicts` con `aiName='admin'` + audit.

**Sanitize order**: `matchesSensitive` (secret) PRIMA di `redactPII`. Invertire spezza token e trapela frammenti.

---

### 5.11 ThinkCentre — Gestione Servizi

**Servizi sul TC**:
- Ollama (Bowie qwen3:1.7b + Horus qwen3:4b + Nadir all-minilm) — GPU 8GB
- GraphHopper multi-area — Docker compose
- Valhalla — Docker custom
- Photon (geocoding) — self-hosted
- Whisper (trascrizione) — self-hosted
- DragonflyDB — Redis-compat

**Accesso SSH**: `TC_SSH_HOST` (strippare `https://`), `TC_SSH_USER`, `TC_SSH_PASSWORD`. Skill `thinkcentre-access`.

**Esposizione**: Cloudflare Tunnel (`tc.biker-link.net`). Nginx legacy/disabled. Ollama bind solo `127.0.0.1`.

**Build grafi** ("grafa"): Eseguire come root. Stoppare Ollama (~18GB). Override `SWAP_FILE`/`BACKUP_DIR`. MMAP non RAM_STORE per PBF > 5GB.

---

### 5.12 AI Coordinator Layer

**UI admin**: `/admin/ai-layer` — grid 6 card fissa (moderation, watchdog, ota-orchestrator, db-integrity, app-integrity, console).

**Backend** (`server/routes/admin/ai-coordinator-governance.ts`):
- `pause/resume/paused/conflicts/override/policies`
- Auth: admin/superadmin via sessione

**Kill switch**: `Coordinator.emit()` controlla `isAiPaused(aiName)` prima di persistere. In pausa → `id=""` (Redis TTL + fallback in-memory).

**Timeline stream WS**: `ai_event`, `ai_conflict_new` push. Auto-invalidazione cache React Query < 2s end-to-end.

---

## SEZIONE 6 — FILE PIÙ DELICATI

Classificati per motivo, rischio, criticità 1-10, e cosa non fare mai.

---

### 6.1 `app/(tabs)/_layout.tsx`
**Criticità**: 10/10

**Motivo**: È il layout principale dell'app — controlla 15+ tab, il tab bar personalizzato, gli overlay globali (SafetyOverlay, GarageReminder, FakeHomeIntro), e il redirect di auth.

**Rischi**:
- Qualsiasi oggetto inline in `screenOptions` → "Maximum update depth exceeded" crash loop
- `router` nelle deps di `useEffect` con redirect → loop
- Split del file → crash loop OTA (storicamente documentato)
- Aggiungere file helper nella directory `app/(tabs)/` → diventano tab-route

**Cosa NON fare mai**:
- Splittare il file (marker `@no-split` è documentale ma il rischio è reale)
- Usare `useMemo` con deps per `tabsScreenOptions` — deve essere costante module-level
- Aggiungere deps a `renderCustomTabBar` — deve avere `deps: []`
- Rimuovere `frozenTabScreensRef` — è il fix definitivo al loop OTA #190
- Mettere file helper `.ts` nella directory `app/(tabs)/`

---

### 6.2 `server/boot-sequence.ts`
**Criticità**: 10/10

**Motivo**: Controlla l'intera sequenza di avvio del server. Un bug qui può causare: crash loop, DB non disponibile, seed dati mancanti, scheduler non avviati.

**Ordine fasi** (non modificabile):
1. HTTP Listen (server accessibile prima di tutto il resto)
2. Migrations (FATAL — process.exit se fallisce)
3. DB Init (FATAL)
4. Seed + Engine (FATAL)
5. Schedulers (post-READY, non fatale)

**Cosa NON fare mai**:
- Aggiungere `process.exit()` dopo Phase 4 (dopo `initState.initializing = false`)
- Creare promise eager (senza thunk) nell'array di seed — causa `unhandledRejection`
- Rendere qualsiasi operazione post-READY fatale
- Omettere `.catch()` su `void runPostReady()`
- Fare query DB prima che `initState.dbReady` sia `true`

---

### 6.3 `server/ai/assistant/roster.ts`
**Criticità**: 9/10

**Motivo**: Definisce il routing tra le personas AI. Le regex qui decidono chi risponde a ogni messaggio.

**Cosa NON fare mai**:
- Modificare le regex senza testare che non confliggano con gli esempi dei tool in `tools.ts`
- Il roster VINCE sempre su tool-calling. Se una frase trigghera sia il roster che un tool, vince il roster.
- Aggiungere una nuova persona senza aggiornare tutte le route correlate (handoff, tri-persona handoff)

---

### 6.4 `server/ai/moderation/provider.ts`
**Criticità**: 9/10

**Motivo**: Gateway unico per tutte le chiamate AI cloud. Gestisce fallback chain, circuit breaker, budget RPM.

**Cosa NON fare mai**:
- Chiamare Groq/Gemini/OpenAI direttamente senza passare da `runWithFallback`
- Usare `generateObject({ schema })` al di fuori di questo file
- Alzare il timeout senza misurare l'impatto sul RPM budget
- Modificare la priority del fallback chain senza ragione documentata

---

### 6.5 `scripts/deploy-build.sh`
**Criticità**: 9/10

**Motivo**: Script di build eseguito durante ogni deploy. Un errore qui blocca tutti i deploy.

**Regole strutturali**:
- I label `[N/TOTAL]` DEVONO essere sequenziali — il gate `check-deploy-build-step-numbers.sh` li verifica
- Il file NON può essere splittato (marker `NO-SPLIT` nel file)
- La sequenza di cleanup è ordinata per sicurezza: gate statici PRIMA della pulizia `.git/`

**Cosa NON fare mai**:
- `rm -rf .cache/` — file read-only di altro utente, `set -e` fa crashare il build
- Rimuovere `rm -rf .git/` — è la pulizia critica per rispettare il limite 2GB del Repl layer
- Aggiungere query DB live — siamo in Phase 2, le migration non sono ancora applicate
- Aggiungere step senza aggiornare il `TOTAL` nel label `[N/TOTAL]`

---

### 6.6 `server/db.ts`
**Criticità**: 9/10

**Motivo**: Facade per accesso al DB. Esportato da `pool.ts` (configurazione), `pool-governor.ts` (budget bg), `pool-config.ts` (costanti).

**Cosa NON fare mai**:
- Alzare `max` nel pool senza verifica del limite Replit
- Rimuovere `assertPoolConfigInvariants()` — è il fast-check sincorno che fallisce early se misconfigured
- Aggiungere retry su errori non-transitori — `isTransientDbError()` è la fonte di verità
- Confondere `withDbRetry` di `db.ts` (firma `fn + opts`) con quella di `lib/db-retry.ts` (firma `label + fn`)

---

### 6.7 `drizzle.config.ts`
**Criticità**: 8/10

**Motivo**: Configura il diff schema che Replit usa durante il publish. Una tabella rimossa da `tablesFilter` può causare DROP errati in produzione.

**Cosa NON fare mai**:
- Rimuovere tabelle dalla `tablesFilter` exclusion list senza verificare che Drizzle sappia gestire i loro indici
- Rimuovere `extensionsFilters: ["postgis"]` — causa il fail `spatial_ref_sys`
- Aggiungere `embeddings` ai filtri (è già esclusa — l'indice HNSW causerebbe DROP spurio)
- Usare `DATABASE_URL` diretto senza il fallback `DATABASE_URL_DEV` — in dev colpirebbe prod

---

### 6.8 `app.json` / `eas.json`
**Criticità**: 8/10

**Motivo**: Configurazione build EAS e OTA. Errori qui producono APK rotti o OTA incompatibili.

**Cosa critica**:
- `runtimeVersion` in `app.json` deve essere bumped per ogni aggiornamento SDK major
- `versionCode` viene letto da `publish-ota.sh` — non cambiarlo manualmente fuori dal processo OTA
- `eas.json cli.version` deve essere `^21.0.0` minimo (tar@7.5.7 in ^20.x è bloccato da CVE policy Replit)
- Dopo ogni `npm install`, le URL `resolved` nel `package-lock.json` vanno riscritte (vedere 2.3)

---

### 6.9 `server/migrate.ts`
**Criticità**: 8/10

**Motivo**: Il custom migration runner. Un bug qui blocca tutti i boot.

**Cosa NON fare mai**:
- Modificare la logica di prefisso senza aggiornare il gate `check-migration-prefix-duplicates.ts`
- Aggiungere un file migration con prefisso duplicato — blocca TUTTO (dev e prod)
- Fare migration che fanno assumere che il DB sia già in stato X — devono essere idempotenti

---

### 6.10 `server/boot-phase3-db-init.ts`
**Criticità**: 8/10

**Motivo**: Phase 3 del boot, estratta per rispettare il ratchet 800 righe. Crea strutture DB post-migration (es. HNSW index).

**Cosa NON fare mai**:
- Aggiungere operazioni FATAL qui (process.exit) — Phase 3 ha timeout
- Aggiungere query che dipendono da dati seed non ancora esistenti (il seed è in Phase 4)

---

### 6.11 `shared/db/schema.ts` (e file companion)
**Criticità**: 8/10

**Motivo**: Schema Drizzle condiviso client↔server. Ogni modifica genera potenziale drift.

**Cosa NON fare mai**:
- Importare da Node.js (fs, path, crypto) — questo file è caricato anche dal client Expo
- Aggiungere `uniqueIndex()` senza il corrispondente file migration che deduplicza prima
- Modificare un tipo senza verificare che le migration esistenti siano coerenti
- Aggiungere tabelle senza file migration corrispondente (il drift-guard blocca al boot)

---

### 6.12 `contexts/AuthContext.tsx`
**Criticità**: 8/10

**Motivo**: Provider di auth per tutta l'app. Un bug qui causa crash loop o logout forzato.

**Cosa NON fare mai**:
- Aggiungere oggetti React Query interi alle deps di useCallback/useMemo
- Fare redirect in `authIsLoading === true`
- Dimenticare di fare il seed della cache auth prima di abilitare la query utente

---

### 6.13 `server/ai/watchdog/scheduler.ts`
**Criticità**: 7/10

**Motivo**: Controlla il timing del watchdog. Bug qui = burn quota Groq o alert mancanti.

**Cosa NON fare mai**:
- Ridurre il cooldown del proposer sotto 30 minuti
- Rimuovere il heartbeat — il sistema dipende da questo per rilevare zombie
- Modificare `cycleInFlight` senza capire la race condition che previene

---

### 6.14 `server/cache/matching-lock.ts`
**Criticità**: 7/10

**Motivo**: Lock distribuito DragonflyDB per il matching engine. Bug = doppi matching cycles.

**Cosa NON fare mai**:
- Rimuovere la logica di cleanup del lock orfano al boot
- Permettere la pulizia del lock se `holderPid === process.pid` (stato incoerente)
- Abbreviare il TTL del lock senza considerare i cicli lenti

---

### 6.15 `.replit` (sezione `[deployment]`)
**Criticità**: 9/10

**Motivo**: Configura come Replit avvia il container di produzione.

**Regola assoluta**: `run` deve avere `PORT=5000`. Se è `PORT=8081`, tutto il traffico va al probe Metro → API rotte.

**Cosa NON fare mai**:
- Editare `.replit` direttamente — usare `deployConfig()`
- Cambiare la porta senza aggiornare il guard in `post-merge.sh`

---

### 6.16 `scripts/post-merge.sh`
**Criticità**: 8/10

**Motivo**: Gira automaticamente dopo ogni merge. Sincronizza `node_modules`, applica patch, verifica invarianti.

**Operazioni critiche che fa**:
1. `npm install` (sincronizza node_modules dal package-lock.json)
2. Patch `react-native-webview` (P={} per TypeScript)
3. Riscrittura URL `package-firewall.replit.local` nel package-lock.json
4. Guard porta 5000
5. Gate ratchet file grandi

**Cosa NON fare mai**:
- Rimuovere `npm install` dall'inizio dello script
- Aggiungere operazioni distruttive senza `|| true` (il set -e è attivo)

---

### 6.17 `server/routing/router-selector.ts`
**Criticità**: 7/10

**Motivo**: Seleziona quale engine di routing usare. Bug = percorsi sempre errati o 404.

**Cosa NON fare mai**:
- Rimuovere il check `routing_area_mode === 'enabled'` — senza di esso cade sul path legacy 404
- Bypassare `isRoutingExplicitlyDisabled()` — il kill-switch env ha priorità assoluta

---

### 6.18 `server/ai/coordinator/index.ts`
**Criticità**: 7/10

**Motivo**: Event bus del Layer AI Coordinato. Gestisce pause/resume per le 6 AI.

**Cosa NON fare mai**:
- Emettere eventi senza verificare `isAiPaused(aiName)` — sarebbe un bypass del kill switch
- Aggiungere AI al coordinator senza aggiornare la griglia fissa a 6 card nell'UI admin

---

### 6.19 `server/ai/assistant/horus-scanner.ts`
**Criticità**: 7/10

**Motivo**: Scanner on-demand del manuale utente. Lungo, costoso, interrompibile.

**Cosa NON fare mai**:
- Schedulare automaticamente — è strettamente on-demand
- Fare girare in parallelo con Ares (stesso slot GPU)
- Dimenticare il fingerprint per-file in AppSettings (previene duplicati)

---

### 6.20 `thinkcentre-agent/` (agente Node.js sul TC)
**Criticità**: 7/10

**Motivo**: L'agente sul ThinkCentre espone i servizi interni (GraphHopper, Valhalla, Ollama, metrics) tramite Cloudflare Tunnel.

**Cosa NON fare mai**:
- Creare ingress Cloudflare aggiuntivi — il TC non può creare ingress CF (solo proxy via agent)
- Confondere `X-Agent-Token` (per le rotte TC agent) con `X-Hub-Gate-Token` (per ai-hub)
- Aggiungere servizi senza il pattern localhost + reverse-proxy `/<nome>/*`

---

### 6.21 `migrations/` (directory completa)
**Criticità**: 8/10

**Motivo**: La storia del DB. Un file sbagliato blocca tutti i boot.

**Regole**:
- Prefisso `NNNN_` univoco e incrementale (gate `check-migration-prefix-duplicates.ts`)
- Ogni file DEVE essere idempotente
- Pattern deduplicazione: CTE ROW_NUMBER() (mai `NOT IN` self-referenziale)
- Indici DESC/WHERE: `DROP IF EXISTS` + `CREATE` (mai `CREATE IF NOT EXISTS` senza DROP)

---

### 6.22 `server/lib/pool.ts`
**Criticità**: 8/10

**Motivo**: Istanza pg.Pool con tracer, stats, backpressure. Fonte di verità per le connessioni DB.

**Cosa NON fare mai**:
- Alzare `max` senza test empirici sul limite Replit
- Aggiungere connessioni dirette (`pool.connect()`) senza passare per `withBgDbSlot`
- Rimuovere `assertPoolConfigInvariants()` dal boot

---

*Continua nella Parte 3/4 (Sezioni 7-9: Debito Tecnico, Conoscenza Implicita, Errori del Nuovo Sviluppatore)*
