# BikerLink — AI Knowledge Base (Parte 3/4)

> **Continuazione dalla Parte 2.** Copre: Debito Tecnico (Sezione 7), Conoscenza Implicita (Sezione 8), Errori del Nuovo Sviluppatore (Sezione 9).

---

## SEZIONE 7 — DEBITO TECNICO

Classificato in: urgente (blocca evoluzione), medio (rallenta lo sviluppo), basso (cosmetic).

---

### 7.1 Urgente

**7.1.1 TS 7 migration bloccata da linter**
- **Problema**: TypeScript 7 è compiler-clean per il progetto, ma l'upgrade è bloccato da qualsiasi linter che dipende da `typescript` internals. oxlint (attuale) NON dipende da `typescript` — il path è aperto.
- **Impatto**: Non si possono usare le ottimizzazioni TS7 (verbatimModuleSyntax default, performance di tsc).
- **Difficoltà**: Media — richiede audit di tutti i tool TS-dipendenti e un piano di migrazione.

**7.1.2 spatial_ref_sys — bug Replit non risolto**
- **Problema**: Ogni publish con copy-OFF genera `ALTER TABLE spatial_ref_sys ADD PRIMARY KEY`. Questo fallisce perché la tabella è owned da `cloud_admin`.
- **Impatto**: Il deploy con copy-OFF è bloccato su questo errore.
- **Difficoltà**: Impossibile lato nostro — richiede fix da Replit Support.

**7.1.3 Bowie Terminal — app Expo nested con build complessa**
- **Problema**: `bowie-terminal/` è un'app Expo nested nel monorepo. EAS richiede workaround speciali (`EAS_NO_VCS=1` + `EAS_PROJECT_ROOT` assoluto) per non scansionare l'intero monorepo.
- **Impatto**: Ogni aggiornamento Bowie Terminal richiede conoscenza del workaround, altrimenti EAS crasha.
- **Difficoltà**: Media — potrebbe essere risolto estraendo Bowie Terminal in repo separato.

**7.1.4 Pool connessioni max=10 invariante fragile**
- **Problema**: Il limite di 10 connessioni è hard-coded e qualsiasi job background che bypassa `withBgDbSlot` satura silenziosamente il pool.
- **Impatto**: API timeout in produzione quando un job background non segue il pattern corretto.
- **Difficoltà**: Alta — richiederebbe strumentazione automatica per rilevare pool.connect() diretti.

---

### 7.2 Medio

**7.2.1 ThinkCentre — single point of failure**
- **Problema**: Ollama, GraphHopper, Valhalla, Photon, Whisper girano tutti sullo stesso mini-PC di casa.
- **Impatto**: Se il TC si spegne (manutenzione, corrente, hardware), tutte le feature AI e routing sono giù.
- **Mitigazione attuale**: Fallback cloud per AI (se `ai_fallback_enabled` ON), fallback cloud GH per routing base.
- **Difficoltà**: Alta — richiederebbe un secondo server o migrazione cloud (costo significativo).

**7.2.2 File LOCKED — debito gestione dimensioni**
- **Problema**: 8 file nella fascia 650-950 righe sono "congelati" con header `LARGE-FILE-LOCKED`. Il codice nuovo va nei companion path, ma questo frammmenta la logica.
- **Impatto**: Difficoltà di navigazione del codice; potenziale duplicazione di logica tra file principale e companion.
- **Difficoltà**: Media — richiederebbe refactoring pianificato di ogni file locked.

**7.2.3 Nadir embedding pipeline — dipendenza OpenAI per embeddings cloud**
- **Problema**: Nadir usa `multilingual-e5-small` locale (384dim→1536 proiezione) ma ha un fallback OpenAI embeddings. La proiezione 4× concatenazione + L2-norm è un workaround per compatibilità dimensioni.
- **Impatto**: Se si cambia il modello locale, si deve aggiornare la proiezione, la whitelist db-integrity, e il tag nel DB.
- **Difficoltà**: Media.

**7.2.4 Package-lock Replit proxy — workaround manuale**
- **Problema**: Dopo ogni `npm install`, le URL `resolved` vanno riscritte manualmente (anche se automatizzato in post-merge.sh).
- **Impatto**: Ogni installazione pacchetti richiede un passo in più.
- **Difficoltà**: Non fixabile — è un comportamento di Replit.

**7.2.5 Duplicazione logica db.ts — due withDbRetry con firma diversa**
- **Problema**: `withDbRetry` esiste in due versioni: `server/db.ts` (fn + opts) e `server/lib/db-retry.ts` (label + fn). I consumer importano da sorgenti diverse.
- **Impatto**: Confusion per i nuovi sviluppatori; divergenza possibile nelle politiche di retry.
- **Difficoltà**: Media — richiederebbe migrazione a un'unica versione.

**7.2.6 react-native-keyboard-controller pinned version**
- **Problema**: Pinned a ≥1.21.9 per fix Kotlin `onConfigurationChanged`. È in `expo.install.exclude`.
- **Impatto**: Non si può scendere sotto 1.21.9 senza reintrodurre il crash.
- **Difficoltà**: Bassa — solo tracking della versione.

**7.2.7 BikerBlog repo — copia locale stantia**
- **Problema**: `.bikerblog-ref/` è una copia locale read-only del repo BikerBlog che può divergere.
- **Impatto**: Il TC (ThinkCentre) ha `~/bikerlink` che può essere centinaia di commit indietro rispetto a `origin/main`. Usare Modelfile stantii per `ollama create`.
- **Difficoltà**: Bassa — aggiornare prima di ogni operazione con `bash scripts/refresh-bikerblog.sh`.

---

### 7.3 Basso

**7.3.1 Valhalla ingress porta 8003 rotto**
- **Problema**: Nel dashboard Cloudflare, l'ingress verso Valhalla porta 8003 è configurato ma non funzionante. Valhalla ascolta sulla 8002.
- **Impatto**: Non influenza produzione (si usa il proxy via thinkcentre-agent), ma è confusivo.
- **Difficoltà**: Bassa — fix nel dashboard CF.

**7.3.2 Typecheck stale logs**
- **Problema**: I workflow `typecheck` e `typecheck-client` sono run-once. Gli snapshot in `/tmp/logs` non si aggiornano al restart — mostrano sempre lo stato del run precedente.
- **Impatto**: Si può confondere un risultato stantio "failed" con il risultato attuale.
- **Soluzione**: Verificare con `npx tsc --noEmit -p <proj>` diretto.

**7.3.3 deploy.stamp analisi post-deploy**
- **Problema**: L'analisi post-deploy (`scripts/post-deploy-analysis.sh`) è manuale e on-demand.
- **Impatto**: Se nessuno la esegue, i deploy lenti non vengono diagnosticati.
- **Difficoltà**: Bassa — automatizzare l'analisi come parte del workflow di deploy.

---

## SEZIONE 8 — CONOSCENZA IMPLICITA

Convenzioni non scritte, assunzioni silenziose, comportamenti attesi non documentati.

---

### 8.1 Convenzioni di naming che il codice dà per scontate

**Agenti AI**: Le env var seguono lo schema `<NOME>_OLLAMA_<CAMPO>`:
- `BOWIE_OLLAMA_MODEL`, `BOWIE_OLLAMA_URL`, `BOWIE_OLLAMA_TOKEN`
- `HORUS_OLLAMA_MODEL`, `HORUS_OLLAMA_URL`, `HORUS_OLLAMA_TOKEN`
- `ARES_OLLAMA_MODEL` = `DIAG_OLLAMA_MODEL` (Ares usa secret diversi: `DIAG_OLLAMA_*`)
- `NADIR` non ha URL separata — usa Ollama locale tramite la URL di Bowie/Horus

**Secret vs Env**: `EXPO_PUBLIC_*` sono env pubbliche (inlined nel client Expo). URL di servizi server-only sono secrets. `TC_REDIS_URL` è DragonflyDB (non Redis managed, non `REDIS_URL`).

**File companion pattern**: `foo.ts` → `foo-extra.ts` (mai `foo-part2.ts`, mai `foo2.ts`)

**Tab-route naming**: I file in `app/(tabs)/` che sono route reali usano nomi senza underscore prefix. I file con underscore (come `_layout.tsx`) sono speciali Expo Router.

---

### 8.2 Assunzioni silenziose sull'ambiente

**Replit è l'unico ambiente di sviluppo**: Non c'è supporto per sviluppo locale su laptop. Tutto è pensato per girare su Replit.

**Single-instance**: Replit gira una sola istanza del backend. La logica di lock distribuito (DragonflyDB) è presente ma il target è una sola istanza.

**Linux x86_64**: Il binario `cloudflared` è scaricato per linux-amd64. Nessun supporto ARM.

**Ubuntu 26.04 sul ThinkCentre**: Il TC gira Ubuntu 26.04. Java di sistema = OpenJDK 25 LTS. Non Temurin.

**Timezone IT per i log**: `new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })` nei log di boot. L'UTC è usato per i timestamp dei log di sistema.

---

### 8.3 Comportamenti attesi non documentati

**`/api/health` deve ritornare un JSON con `status`**: `cerbero.sh` fa grep sulla stringa per determinare lo stato. Il vocabolario DEVE essere `booting | ready | degraded`. Cambiare il vocabolario rompe il monitoring senza errori evidenti.

**503 durante il boot non è un errore**: Un 503 da `/api/health` significa che il server è ancora in boot (Phase 1 completata, Phase 4 non ancora). Il watchdog NON deve restartare il backend su un 503 — solo su timeout totale.

**`initState.initializing = false` è il segnale READY**: Dopo questo, il server è "in produzione" nel senso operativo. Qualsiasi crash post-READY viene loggato come `markDegraded`, non come `process.exit`.

**OTA message convention**: Il messaggio di OTA N descrive le novità DI N (non "rispetto a N-1"). MAI scrivere "vX.Y.N-1" nell'OTA message — è fuorviante.

**AppSetting chiavi stringa non tipate**: Le chiavi di `app_settings` sono stringhe libere. Non c'è un enum centralizzato. Le chiavi usate sono sparse nel codice e nei commenti. Consultare la documentazione nei commenti dei file che le usano.

---

### 8.4 Pattern architetturali impliciti

**Fire-and-forget con .catch()**: Qualsiasi operazione post-READY è `void fn().catch(e => markDegraded)`. Non è trascuratezza — è la policy deliberata.

**Thunk nel seed array**: `[name, makeFn]` dove `makeFn` è `() => Promise<>`, non `Promise<>`. La promise NON viene avviata fino al momento del `await`. Questo previene `unhandledRejection`.

**Timeout per fase**: Ogni fase del boot ha un timeout esplicito (`withPhaseTimeout`). La migration ha un timeout più lungo (600s). Questo previene boot infiniti su DB lento.

**Idempotenza come invariante**: Tutti i seed, tutte le migration, tutta la creazione di indici sono idempotenti. Un boot ripetuto non dovrebbe cambiare nulla se lo stato è già corretto.

**Graceful degradation**: Ogni servizio opzionale (TC, Redis, cloudflared) ha un fallback e degrada gracefully. Il server risponde anche se tutti i servizi opzionali sono giù.

---

### 8.5 Convenzioni di testing

**Test DB**: I test usano `server/__tests__/helpers/db-mock.ts` con mock condiviso (unico punto di aggiornamento per il shape del DB).

**AI stream tests**: I test del flusso AI DEVONO mockare `ollama-client` — `OLLAMA_URL` è impostato nell'env e i test lo vedono.

**Date.now() mock**: Mock fragili con `vi.resetModules()` — usa un clock controllabile invece di call-count parity.

**react-test-renderer**: Non c'è Playwright/device e2e possibile nell'ambiente Replit. Usare `react-test-renderer` con `QueryClientProvider` reale, `IS_REACT_ACT_ENVIRONMENT`, e `act()` separati per flush.

---

### 8.6 Gestione secret — regole operative

**Cambiare valore di secret esistente → cold boot**: Il nuovo valore non entra senza restart completo (non basta restart del workflow).

**Secret nuovo → entra subito**: Non richiede restart.

**Nessuna callback per cancellare secret**: Solo l'utente può rimuoverli dal pannello Replit. Non esiste `deleteSecrets` programmatico.

**`EXPO_PUBLIC_*` sono public**: Vengono inlinati nel bundle Expo e sono visibili a chiunque decompili l'APK.

---

### 8.7 Audit trail e sicurezza

**Admin actions**: Le operazioni admin (force unlock, override AI conflicts) sono auditate in `ai_decisions` con `aiName='admin'`.

**Reserved names**: Due blacklist coesistono: EXACT match per admin/mod, CONTAINS match per nomi agenti AI (Ares/Nadir/Bowie/Quebracho/Horus). Ogni percorso di creazione utente (signup, admin-create, profile-rename) deve chiamare l'helper condiviso.

**Sanitize order**: matchesSensitive PRIMA di redactPII — invariante di sicurezza non negoziabile.

**Session cookie**: Il cookie `connect.sid` è la session key. La struttura del payload è `{cookie, userId}` FLAT (non `passport.user`). Platform enum: `android/ios/web/admin` (mai "mobile").

---

## SEZIONE 9 — ERRORI CHE UN NUOVO SVILUPPATORE FAREBBE

Almeno 100 errori concreti, ognuno con: come nasce, come evitarlo, conseguenze.

---

### Errori di React Native / Expo

**1. Oggetto inline in screenOptions di React Navigation**
- Come nasce: `<Stack.Screen options={{ headerTitle: dynamicTitle }} />`
- Conseguenza: "Maximum update depth exceeded" crash loop
- Come evitare: Costante module-level o `useMemo` con deps primitive

**2. `router` nelle deps di useEffect che naviga**
- Come nasce: `useEffect(() => { router.replace('/home') }, [router])`
- Conseguenza: Loop infinito
- Come evitare: `routerRef + didRedirectRef`

**3. File helper in `app/(tabs)/`**
- Come nasce: `app/(tabs)/mapUtils.ts` creato per comodità
- Conseguenza: Diventa una tab vuota nella CustomTabBar
- Come evitare: Sempre in `components/`

**4. Splittare `app/(tabs)/_layout.tsx` autonomamente**
- Come nasce: Il ratchet segnala il file, l'agente splitta
- Conseguenza: Crash loop OTA (documentato storicamente)
- Come evitare: Non splittare MAI senza approvazione esplicita

**5. Sentry con integrations default**
- Come nasce: `Sentry.init({ dsn })` senza `integrations: []`
- Conseguenza: Loop React Navigation al boot su Android
- Come evitare: Sempre `integrations: []`

**6. Reanimated per widget con hitbox su Android**
- Come nasce: `useSharedValue + useAnimatedStyle` per widget che si sposta
- Conseguenza: I bottoni sotto il widget sono inaccessibili
- Come evitare: `RN Animated.Value` con `transform`

**7. Redirect ottimistico con user=null**
- Come nasce: `useEffect(() => { if(!user) router.replace('/login') }, [user])` senza check `isLoading`
- Conseguenza: Boot loop
- Come evitare: Aspettare che `isLoading === false` prima del redirect

**8. `refetchQueries` su query disabled**
- Come nasce: Chiamare `refetchQueries` su una query che ha `enabled: false`
- Conseguenza: No-op silenzioso — la query non si aggiorna
- Come evitare: Abilitare la query prima di fare refetch

**9. Dipendere da oggetti React Query interi nelle deps**
- Come nasce: `useCallback(() => {...}, [someQuery])` dove `someQuery` è l'intero oggetto RQ
- Conseguenza: Nuovo ref ad ogni render → loop
- Come evitare: Dipendere solo da `.data`, `.isPending`, etc.

**10. Navigate con typed pathname su route nuove**
- Come nasce: `router.push({ pathname: "/new-screen/[id]", params: { id } })`
- Conseguenza: TypeScript error "route not found" perché `.expo` types non rigenerate in CI
- Come evitare: `router.push(\`/new-screen/${id}\` as never)`

**11. Usare Google Maps**
- Come nasce: `import MapView from 'react-native-maps'` con Google provider
- Conseguenza: Mappa nera, crash su API key mancante
- Come evitare: Sempre Leaflet/MapLibre via WebView + OSM

**12. Aggiungere dipendenza nativa dopo la build APK**
- Come nasce: `npm install expo-barcode-scanner`, OTA pubblicata
- Conseguenza: "Cannot find native module" crash — OTA non include codice nativo
- Come evitare: Sempre nuova build EAS per moduli nativi; usare `requireOptionalNativeModule`

**13. `exhaustive-deps` disable nella posizione sbagliata**
- Come nasce: `// oxlint-disable-next-line` sulla riga dell'hook invece che sopra `}, [deps]);`
- Conseguenza: La soppressione fallisce silenziosamente, il gate blocca
- Come evitare: Il comment va immediatamente sopra `}, [deps]);`

**14. Animated.View fullscreen che mangia i tap**
- Come nasce: `<Animated.View style={[StyleSheet.absoluteFill, ...]}>`
- Conseguenza: I bottoni sotto sono inaccessibili su Android
- Come evitare: `pointerEvents="box-none"` + elevation > fratelli flottanti

**15. InteractionManager non usato per mount asincrono**
- Come nasce: Operazione pesante nel `useEffect` senza `InteractionManager.runAfterInteractions`
- Conseguenza: Janks al mount, animazioni bloccate
- Come evitare: `InteractionManager.runAfterInteractions` per operazioni non-critiche

**16. AppState listener senza try/catch**
- Come nasce: `AppState.addEventListener('change', async () => { const data = await api() })`
- Conseguenza: Rejection non gestita → crash (ErrorBoundary non copre AppState listener)
- Come evitare: Ogni body asincrono in AppState listener va in try/catch

---

### Errori di Backend / Node.js

**17. `pool.connect()` diretto in job background**
- Come nasce: `const client = await pool.connect()` in un job schedulato
- Conseguenza: Pool saturo → API timeout
- Come evitare: `withBgDbSlot(() => ...)` obbligatorio

**18. `Promise.all` di query DB in background**
- Come nasce: `await Promise.all([query1(), query2(), query3()])` in un job
- Conseguenza: Consuma tutte le slot contemporaneamente, pool saturo
- Come evitare: Query sequenziali con `for...of`

**19. `process.exit()` post-READY**
- Come nasce: `throw new Error()` non gestito in operazione post-boot
- Conseguenza: Crash loop — il server va in restart loop avendo già servito traffico
- Come evitare: `markDegraded()` invece di process.exit post-READY; `.catch()` obbligatorio su void calls

**20. `import.meta.dirname` nel server**
- Come nasce: `const dir = import.meta.dirname` (stile ESM moderno)
- Conseguenza: esbuild trasforma `import.meta` in `{}` → `dirname === undefined` → crash
- Come evitare: Sempre `__dirname`

**21. `generateObject({ schema })` diretto**
- Come nasce: `await generateObject({ model: groqModel, schema: myZodSchema, prompt })`
- Conseguenza: Crash silenzioso in produzione su llama-3.x (Groq non supporta json_schema)
- Come evitare: `generateStructured(resolvedModel, { schema, prompt })` sempre

**22. Schema Zod con `.optional()` per generateObject**
- Come nasce: `z.object({ name: z.string().optional() })` per strict mode AI
- Conseguenza: "Invalid schema" da OpenAI/Groq strict mode
- Come evitare: `.nullable()` invece di `.optional()`

**23. Schema Zod con record/catchall**
- Come nasce: `z.object({ data: z.record(z.string()) })` per dati flessibili
- Conseguenza: `additionalProperties` non è false → rifiutato da strict mode
- Come evitare: Specificare ogni campo esplicitamente

**24. Ollama via CodeExecution fetch**
- Come nasce: `await fetch(process.env.HORUS_OLLAMA_URL + '/api/chat', ...)`
- Conseguenza: Cloudflare taglia la connessione dopo ~100s senza streaming → risposta tronca
- Come evitare: Sempre `ShellExec + curl` con streaming per chiamate Ollama lunghe

**25. Modificare `app_settings` con `value` stringa invece di `valueJson`**
- Come nasce: `upsertAppSetting('routing_config', JSON.stringify(config))`
- Conseguenza: Il collector watchdog legge `valueJson` (null) → non vede la configurazione
- Come evitare: `upsertAppSetting('routing_config', undefined, config)` (terzo argomento)

**26. Migration con prefisso duplicato**
- Come nasce: Due file `0045_xxx.sql` e `0045_yyy.sql`
- Conseguenza: Il runner blocca l'intero batch → server non parte né in dev né in prod
- Come evitare: Gate `check-migration-prefix-duplicates.ts` + numerazione sequenziale

**27. uniqueIndex() in schema Drizzle**
- Come nasce: `uniqueIndex('idx_email').on(users.email)` in schema.ts
- Conseguenza: Replit diff bypassa il DELETE di deduplicazione → fail UNIQUE constraint su dati esistenti
- Come evitare: Creare l'indice UNIQUE nel file migration SQL dopo deduplicazione dati

**28. HNSW index nelle migration**
- Come nasce: `CREATE INDEX embeddings_hnsw ON embeddings USING hnsw ...` nel file .sql
- Conseguenza: Replit publish genera un diff errato e tenta di crearlo direttamente in prod → fail
- Come evitare: L'indice HNSW viene creato solo da boot-sequence.ts

**29. Aggiungere il check di schema drift a HNSW index**
- Come nasce: Aggiungere `embeddings` alla whitelist del registry drift checker
- Conseguenza: Il checker segnala falso positivo ad ogni boot
- Come evitare: L'indice HNSW non è in schema.ts — è creato al boot

**30. SET LOCAL fuori da una transazione**
- Come nasce: `await pool.query("SET LOCAL statement_timeout = '5s'")`
- Conseguenza: No-op silenzioso — `SET LOCAL` funziona solo dentro BEGIN...COMMIT
- Come evitare: `SET` (senza LOCAL) per configurazioni a livello connessione, o usare l'opzione nella query stessa

**31. withSchedulerRetry che avvolge il loop mutante**
- Come nasce: `await withSchedulerRetry(() => processAllMatches())`
- Conseguenza: In caso di retry, le modifiche ai dati vengono fatte due volte
- Come evitare: `withSchedulerRetry` avvolge SOLO discovery/acquisizione idempotente

**32. DragonflyDB con flag Redis-only**
- Come nasce: `redis-cli CONFIG SET cluster-enabled yes`
- Conseguenza: DragonflyDB crasha silenziosamente
- Come evitare: Usare solo flag DragonflyDB-compatibili

**33. BullMQ senza cluster_mode=emulated**
- Come nasce: BullMQ configurato con default Redis, connesso a DragonflyDB
- Conseguenza: Errori "undeclared keys" o comportamento imprevedibile
- Come evitare: `cluster_mode=emulated` + `allow-undeclared-keys` nella configurazione Dragonfly

**34. Boot: promise eager nell'array di seed**
- Come nasce: `for (const [name, fn] of [["seed1", seedFn1()], ...])` dove `seedFn1()` è già una promise
- Conseguenza: Tutte le seed partono in parallelo; una rejection diventa unhandledRejection
- Come evitare: `() => seedFn1()` (thunk) invece di `seedFn1()` (promise)

**35. Rimuovere tabella dalla exclusion list di drizzle.config.ts**
- Come nasce: Pensare di "allineare" lo schema dev↔prod rimuovendo un filtro
- Conseguenza: Replit genera DROP INDEX o ALTER TABLE che crashano in prod
- Come evitare: Aggiungere tabelle alla exclusion list, mai rimuovere

**36. Usare REDIS_URL invece di TC_REDIS_URL**
- Come nasce: Seguire la convenzione standard Redis
- Conseguenza: Connessione a Upstash (vecchio URL deprecato) invece di DragonflyDB
- Come evitare: Sempre `TC_REDIS_URL` per DragonflyDB

**37. Rimuovere il check routing_area_mode**
- Come nasce: "Semplificare" il selettore di routing
- Conseguenza: Fall-through al path legacy → 404 su tutte le richieste di routing
- Come evitare: Mantenere sempre il check `routing_area_mode === 'enabled'`

**38. Chiamare root /info o /route di GraphHopper**
- Come nasce: `fetch(TC_URL + '/info')`
- Conseguenza: 404 — il TC è in modalità multi-area, root non esiste
- Come evitare: Sempre `/areas/<code>/info` e `/areas/<code>/route`

**39. Interpretare PointNotFoundException come crash di GraphHopper**
- Come nasce: GH ritorna 400 con `PointNotFoundException`
- Conseguenza: Falso allarme — il motore è vivo, il punto è fuori dalla rete stradale
- Come evitare: Solo `5xx` / wrong profile = motore BROKEN

**40. Timeout Ares troppo corto**
- Come nasce: Impostare timeout 30s su chiamata ad Ares (devstral)
- Conseguenza: La chiamata va sempre in timeout (cold-load: 55-170s)
- Come evitare: Timeout ≥ 170s per Ares

---

### Errori di Deploy / OTA

**41. Publicare OTA a fine task autonomamente**
- Come nasce: "Il task è finito, pubblico l'OTA come ultimo step"
- Conseguenza: OTA con codice incompleto o provvisorio distribuita agli utenti
- Come evitare: MAI pubblicare OTA senza istruzione esplicita dell'utente

**42. `.ota-message` vuoto**
- Come nasce: Avviare il workflow OTA Publish senza scrivere `.ota-message`
- Conseguenza: Ripubblica il vecchio message dal DB (spesso sbagliato)
- Come evitare: Sempre scrivere `.ota-message` PRIMA di avviare il workflow

**43. PORT=8081 nel deploy**
- Come nasce: Confondere Metro port con Express port
- Conseguenza: Tutto il traffico va al probe → API rotte
- Come evitare: Sempre `PORT=5000` in `.replit [deployment] run`

**44. rm -rf .cache/ nel deploy-build.sh**
- Come nasce: "Puliamo anche la cache per sicurezza"
- Conseguenza: `set -e` fa crashare il build su file read-only di altro utente
- Come evitare: MAI toccare `.cache/` nel deploy script

**45. Non riscrivere package-lock.json dopo npm install**
- Come nasce: Installare un pacchetto e dimenticarsi del workaround
- Conseguenza: EAS crasha con "Exit handler never called!"
- Come evitare: Sempre eseguire il sed dopo npm install (automatizzato in post-merge.sh)

**46. Cambiare valore secret e aspettarsi effetto immediato**
- Come nasce: Aggiornare un secret e fare restart del workflow
- Conseguenza: Il nuovo valore non è propagato
- Come evitare: Cold boot (stop + start) o merge/deploy per propagare nuovi valori di secret

**47. Cancellare secret programmaticamente**
- Come nasce: Cercare una callback `deleteSecrets` che non esiste
- Conseguenza: Impossibile — solo l'utente può rimuovere secret dal pannello
- Come evitare: Accettare il limite della piattaforma

**48. Non aggiornare TOTAL nel label [N/TOTAL] di deploy-build.sh**
- Come nasce: Aggiungere un nuovo step senza aggiornare il totale
- Conseguenza: Il gate `check-deploy-build-step-numbers.sh` blocca il deploy
- Come evitare: Aggiornare sia il label dello step che tutti i riferimenti a TOTAL

**49. Splittare deploy-build.sh**
- Come nasce: Il file supera la soglia ratchet, l'agente splitta
- Conseguenza: Il gate conta i label in un singolo file — i sub-script non vengono contati
- Come evitare: NON splittare mai deploy-build.sh (marker NO-SPLIT nel file)

**50. Build grafi GraphHopper con RAM_STORE su PBF grandi**
- Come nasce: Default configurazione GraphHopper
- Conseguenza: OOM silenzioso durante flush/CH per PBF > 5GB → exit 0 ma properties mai scritto
- Come evitare: Rimuovere RAM_STORE, usare MMAP, heap 14g

---

### Errori di AI / Agenti

**51. Chiamare Horus con persona senza model esplicito**
- Come nasce: `callOllamaChat({ persona: 'horus', messages })`
- Conseguenza: Usa il modello default Ollama (spesso non il corretto)
- Come evitare: Sempre `model: AGENT_MODEL_DEFAULTS.horus` esplicito

**52. Hardcodare nomi modelli Ollama**
- Come nasce: `model: 'qwen3:4b'` direttamente nel codice
- Conseguenza: Il gate `check-hardcoded-agent-models.sh` blocca il deploy
- Come evitare: Importare da `server/lib/agent-constants.ts` `AGENT_MODEL_DEFAULTS`

**53. Far partire Ares con Horus/Bowie in VRAM**
- Come nasce: Chiamare `/_internal/ares/analyze` senza evict
- Conseguenza: OOM — devstral (14GB) non entra insieme a Horus+Bowie (4GB) in 8GB GPU
- Come evitare: L'API Ares gestisce automaticamente evict+restore nel `finally`

**54. Usare quebracho-bridge o quebracho-question (rimossi)**
- Come nasce: Import stale da moduli eliminati
- Conseguenza: "module not found" al boot
- Come evitare: I gate `check-quebracho-bridge-import.sh` e `check-quebracho-question-import.sh` bloccano il deploy

**55. Aggiungere AI al coordinator senza aggiornare l'UI**
- Come nasce: Aggiungere una settima AI al coordinator
- Conseguenza: La griglia è fissa a 6 card — la settima AI non appare
- Come evitare: Aggiornare sia il backend che l'UI admin `/admin/ai-layer`

**56. Non rispettare la lingua utente nelle risposte AI visibili**
- Come nasce: Risposta AI sempre in italiano indipendentemente dalla lingua utente
- Conseguenza: Esperienza degradata per utenti non-italiani
- Come evitare: Sempre passare la lingua utente al prompt (default IT)

**57. Schema Zod annidato per Ollama**
- Come nasce: `z.object({ items: z.array(z.object({ name: z.string() })) })` passato a Ollama
- Conseguenza: Ollama 0.32+ genera GBNF grammar complessa → 400 error
- Come evitare: No-schema mode per Ollama in `generateStructured`

**58. AI fallback enabled per default**
- Come nasce: `ai_fallback_enabled = true` per "sicurezza"
- Conseguenza: Dati utenti escono verso cloud provider; quota Groq bruciata silenziosamente
- Come evitare: Il default è OFF — abilitare esplicitamente con consapevolezza del costo

**59. Cooldown proposer watchdog ridotto**
- Come nasce: "Più proposte = più utilità"
- Conseguenza: Brucia 200k TPD in poche ore su Groq
- Come evitare: Cooldown minimo 30 minuti in `scheduler.ts`

**60. Alert all-clear senza alert start reale**
- Come nasce: Il codice legge lo snap.metrics direttamente senza verificare lo start
- Conseguenza: Admin ricevono "rientrato" per un problema che non avevano mai visto allertato
- Come evitare: L'all-clear DEVE essere latchato a un alert reale precedente non soppresso

---

### Errori di Schema / Migrazioni

**61. `CREATE INDEX IF NOT EXISTS ... DESC` senza DROP precedente**
- Come nasce: "IF NOT EXISTS è più sicuro"
- Conseguenza: Se l'indice esiste senza DESC (da auto-push), IF NOT EXISTS lo salta silenziosamente → drift permanente
- Come evitare: Pattern idempotente: `DROP INDEX IF EXISTS ... ; CREATE INDEX ...`

**62. DELETE FROM t WHERE id NOT IN (SELECT id FROM t) per deduplicazione**
- Come nasce: Query comune per deduplicazione
- Conseguenza: Se un valore nella subquery è NULL, l'intera NOT IN ritorna UNKNOWN → nessuna riga cancellata
- Come evitare: CTE con ROW_NUMBER() (vedi gate `check-migration-unsafe-dedup.ts`)

**63. Migration DML senza idempotenza**
- Come nasce: `INSERT INTO app_settings (key, value) VALUES ('key', 'val')`
- Conseguenza: Fail su "duplicate key" se la migration viene rieseguita
- Come evitare: `INSERT ... ON CONFLICT DO NOTHING` o `UPDATE ... WHERE NOT EXISTS`

**64. Rimuovere colonna in schema senza file migration DROP COLUMN**
- Come nasce: Rimuovere il campo dallo schema Drizzle e aspettarsi che sparisca dal DB
- Conseguenza: Il drift-guard al boot rileva la discrepanza e blocca (process.exit)
- Come evitare: Sempre creare `migrations/NNNN_drop_column_xxx.sql`

**65. `drizzle-kit push` in produzione**
- Come nasce: "Più veloce che scrivere un file SQL"
- Conseguenza: Modifica lo schema prod senza tracciabilità, bypassa il custom runner
- Come evitare: MAI drizzle-kit push in produzione; sempre file migration .sql

---

### Errori di Pattern / Architettura

**66. Splittare un file senza approvazione**
- Come nasce: Il ratchet 800 righe segnala un file
- Conseguenza: Blocco immediato all'utente; possibili crash (se il file è critico come _layout.tsx)
- Come evitare: MAI splittare senza approvazione esplicita utente

**67. Splittare un file LOCKED oltre il limite dichiarato**
- Come nasce: Trovare un file LARGE-FILE-LOCKED e aggiungere codice nel file principale invece del companion
- Conseguenza: Il ratchet blocca; il limite è fisso e dichiarato nell'header
- Come evitare: Leggere l'header LOCKED, scrivere nel companion path indicato

**68. Alzare il limite N in un header LARGE-FILE-LOCKED**
- Come nasce: "Così il gate non blocca"
- Conseguenza: Il ratchet rileva il tentativo di bypass e blocca
- Come evitare: MAI alzare il numero nel header LOCKED

**69. LARGE-FILE-ALLOW su file non in `.large-files-allow.txt`**
- Come nasce: Aggiungere il marker per silenziare il gate
- Conseguenza: Il gate blocca — auto-discovery proibita
- Come evitare: Solo file nella lista possono avere il marker ALLOW

**70. Modificare `.replit` direttamente**
- Come nasce: Modificare configurazione deployment
- Conseguenza: Può rompere la configurazione in modo non tracciabile
- Come evitare: Usare `deployConfig()`

**71. Aggiungere `router` come dep di useEffect con navigate**
- Come nasce: ESLint exhaustive-deps warn su `router`
- Conseguenza: Loop infinito
- Come evitare: `routerRef` pattern; `router` NON va mai nelle deps

**72. storage↔embeddings import diretto**
- Come nasce: `import { EmbeddingsStorage } from '../storage'` in `embeddings/store.ts`
- Conseguenza: "Class extends undefined" — ciclo di import non risolto
- Come evitare: Lazy `await import` nella back-edge

**73. callOllamaChat senza model esplicito per persona non-default**
- Come nasce: Assumere che `persona: 'ares'` selezioni anche il modello corretto
- Conseguenza: Usa il modello default Ollama che probabilmente non è devstral
- Come evitare: Sempre `model:` esplicito, soprattutto per Ares

**74. Aggiungere file migration senza aggiornare il registry drift check**
- Come nasce: Aggiungere colonne in migration SQL ma non aggiornare `KNOWN_UNMIGRATED`
- Conseguenza: Il drift checker segnala un falso positivo al boot
- Come evitare: Aggiornare sempre `KNOWN_UNMIGRATED` in `check-schema-migration-drift.ts`

**75. Aggiungere endpoint senza gate di autenticazione**
- Come nasce: Route CRUD veloce per testing
- Conseguenza: Endpoint pubblicamente accessibile in produzione
- Come evitare: Sempre verificare che il middleware auth sia applicato

**76. Tool-calling con cloud fallback che richiede tool**
- Come nasce: Usare `streamText` con tool definitions su cloud (Groq/Gemini/OpenAI)
- Conseguenza: Il cloud non ha i tool → risposta incompleta senza errore
- Come evitare: Guard: se il turno richiede tool, il cloud non può soddisfarlo

**77. Rimuovere il keep_alive:-1 da Horus/Bowie**
- Come nasce: "Libera VRAM quando non in uso"
- Conseguenza: Il modello viene evicted e al prossimo tick il cold-load di 45-60s degrada i tempi
- Come evitare: `keep_alive:-1` è intenzionale — i modelli DEVONO rimanere in VRAM

**78. Aggiungere Quebracho come agente attivo**
- Come nasce: Trovare riferimenti a Quebracho nel codice
- Conseguenza: Quebracho è stato rimosso (Task #591) e assorbito in Horus
- Come evitare: Non ricreare Quebracho. Usare Horus direttamente.

**79. Modificare il roster senza testare i conflitti con i tool**
- Come nasce: Aggiungere nuovi trigger al roster per Horus
- Conseguenza: Il nuovo trigger potrebbe colpire anche frasi di esempio nei tool → il tool non viene mai chiamato
- Come evitare: Verificare che le regex del roster non confliggano con gli esempi dei tool

**80. DragonflyDB via tunnel Cloudflare HTTP**
- Come nasce: "Tutti i servizi TC passano per il tunnel"
- Conseguenza: DragonflyDB usa protocollo TCP Redis, non HTTP — il tunnel non lo supporta
- Come evitare: DragonflyDB usa path TCP diretto o cloudflared TCP bridge

---

### Errori di Monitoring / Alerting

**81. Alert high senza blocco per-id**
- Come nasce: Loop generico che pushes solo critical
- Conseguenza: Alert "high" non vengono mai inviati agli admin
- Come evitare: `alerts.ts` richiede un blocco dedicato per-id + throttle `shouldSend` per "high"

**82. All-clear per problema soppresso**
- Come nasce: Il codice legge il segnale grezzo senza verificare se fu effettivamente alertato
- Conseguenza: Admin ricevono "rientrato" per problemi mai segnalati
- Come evitare: Latch all-clear → alert reale precedente non soppresso

**83. Monitor TC con probe che non invia il token corretto**
- Come nasce: Probe con `Authorization: Bearer X` invece del token specifico del servizio
- Conseguenza: 401 falsamente positivo (es. Whisper vuole `X-Whisper-Token`)
- Come evitare: Il probe deve inviare lo stesso header del client reale

**84. Log watchdog senza dedupWarn**
- Come nasce: Molti campioni dello stesso errore → storm di log
- Conseguenza: Log illeggibili, difficoltà nel trovare il problema reale
- Come evitare: `dedupWarn` per messaggi di log ripetitivi

**85. BootGate flag remote latchato nel manuale**
- Come nasce: "Sincronizzazione" tra flag locale e remoto
- Conseguenza: Il toggle admin remoto (off) non si propaga perché è stato latchato nel flag locale (sticky)
- Come evitare: Flag "local" e "remote" su CHIAVI SEPARATE

---

### Errori di Performance / Scalabilità

**86. Query su `information_schema.columns` in produzione**
- Come nasce: Introspezione schema a runtime
- Conseguenza: Timeout 30s con 148+ tabelle
- Come evitare: `pg_catalog` + cache 10 minuti

**87. GPS buffer client write-only**
- Come nasce: Aggiungere buffer GPS per offline resilience
- Conseguenza: AsyncStorage si riempie → `SQLITE_FULL` → mappa rotta
- Come evitare: NON reintrodurre buffer GPS senza recovery

**88. Telemetria a timer invece che per distanza**
- Come nasce: "Ogni 30s upload"
- Conseguenza: Upload inutili quando il rider è fermo, marker avanza prima del flush
- Come evitare: Upload per distanza (5km), marker avanza solo su flush ok

**89. DB managed-Postgres slow = leak (bias)**
- Come nasce: Ping > 8s → "c'è un leak"
- Conseguenza: Ore di debug su un problema inesistente
- Come evitare: Ping > 8s con waiting=0 = lentezza managed Replit, non leak

**90. bcrypt con rounds alti in test**
- Come nasce: Usare bcrypt.hash di default (10-12 rounds) nei test
- Conseguenza: Test lentissimi (decine di secondi)
- Come evitare: `bcrypt.hash(password, 1)` nei test

---

### Errori di Sicurezza

**91. Sanitize: PII prima di secret**
- Come nasce: `redactPII(text)` e poi `matchesSensitive(text)`
- Conseguenza: PII redaction può spezzare un token segreto → frammento trapela
- Come evitare: `matchesSensitive` PRIMA di `redactPII`

**92. Reserved name bypass**
- Come nasce: Aggiungere un nuovo percorso di creazione utente senza chiamare il shared helper
- Conseguenza: Nomi come "Ares" o "Admin" disponibili agli utenti normali
- Come evitare: Ogni percorso di creazione utente DEVE chiamare l'helper condiviso

**93. Admin action senza audit**
- Come nasce: Aggiungere operazione admin senza loggare in `ai_decisions`
- Conseguenza: Nessuna tracciabilità dell'override
- Come evitare: Sempre `aiName='admin'` + audit

**94. Credenziali in codice o log**
- Come nasce: `console.log('Connected to Ollama at', OLLAMA_URL, 'with token', OLLAMA_TOKEN)`
- Conseguenza: Token esposto nei log
- Come evitare: MAI loggare token, URL con credenziali, o valori di secret

**95. Sessione: userType='mobile' invece di 'android'/'ios'**
- Come nasce: "Mobile è più generico"
- Conseguenza: Il gate di sessione non riconosce il userType → accesso negato
- Come evitare: Platform enum: `android/ios/web/admin` (mai "mobile")

---

### Errori Operativi

**96. `npm install` diretto via bash**
- Come nasce: "È più veloce che usare il packager tool"
- Conseguenza: È bloccato per design su Replit; o genera package-lock con URL firewall
- Come evitare: Sempre `installLanguagePackages` (packager tool)

**97. Aggiornare package senza audit changelog**
- Come nasce: "patch release = sicuro"
- Conseguenza: Breaking changes silenzioso (es. react-native-webview 14.0 = minSdk 24)
- Come evitare: `npx tsx scripts/audit-package-updates.ts` dopo ogni aggiornamento

**98. EAS CLI ^20.x**
- Come nasce: Usare una versione precedente per "stabilità"
- Conseguenza: tar@7.5.7 bloccato da CVE policy Replit Security → build fallisce
- Come evitare: `^21.0.0` minimo in `eas.json cli.version` e `eas.sh`

**99. TC SSH senza strippare https://**
- Come nasce: `ssh ${TC_SSH_HOST}` direttamente
- Conseguenza: SSH fallisce — l'host contiene `https://` come prefisso
- Come evitare: `TC_SSH_HOST.replace(/^https?:\/\//, '')`

**100. GraphHopper build come utente non-root**
- Come nasce: "Build senza sudo per sicurezza"
- Conseguenza: Il build script muore immediatamente — richiede root per gestire SWAP e permissions
- Come evitare: Sempre eseguire come root, con `SWAP_FILE`/`BACKUP_DIR` override

**101. Non stoppare Ollama prima del build GraphHopper**
- Come nasce: "Ollama gira in background, non disturba"
- Conseguenza: OOM — Ollama occupa ~18GB, non c'è RAM per il build GH
- Come evitare: Sempre stoppare Ollama prima del build grafi

**102. Large-files-ratchet che scansiona .bikerblog-ref**
- Come nasce: Clonare `.bikerblog-ref/` e non aggiungerlo a `EXCLUDED_DIRS`
- Conseguenza: Il gate segnala violazioni nel repo di riferimento esterno
- Come evitare: Aggiungere proattivamente a `EXCLUDED_DIRS` nel ratchet script

**103. Typecheck dai log snapshot (stantii)**
- Come nasce: Leggere i log del workflow `typecheck` invece di eseguire direttamente
- Conseguenza: Il risultato è stantio — i log non si aggiornano al restart
- Come evitare: Sempre `npx tsc --noEmit -p <proj>` diretto

**104. Modificare appsettings senza il gate check-appsettings-raw-writes**
- Come nasce: `db.execute(sql\`INSERT INTO app_settings ...\`)` direttamente
- Conseguenza: Il gate `check-appsettings-raw-writes.sh` blocca il deploy
- Come evitare: Sempre usare `upsertAppSetting()` ORM-level

**105. Credenziali Cloudflare Access errate**
- Come nasce: Copiare `CF_ACCESS_CLIENT_ID` dal "Client ID" invece del "Copy" button
- Conseguenza: 403 — il secret deve essere 64-hex senza il suffisso `.access`
- Come evitare: Usare il pulsante "Copy" nel dashboard CF Access

---

*Continua nella Parte 4/4 (Sezioni 10-12: Regole Assolute, Cose da Cambiare in una Riscrittura, Le 50 Cose Più Importanti)*
