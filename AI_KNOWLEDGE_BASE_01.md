# BikerLink — AI Knowledge Base (Parte 1/4)

> **Questo documento cattura la conoscenza implicita del progetto BikerLink che un LLM non potrebbe ricostruire leggendo solo il codice.**
> È organizzato in 12 sezioni. Parti 1-3 coprono: decisioni architetturali, workaround storici, dipendenze nascoste.
> Aggiornato: Luglio 2026. Autore: agente AI con accesso completo a codebase + memoria persistente.

---

## SEZIONE 1 — DECISIONI ARCHITETTURALI

Ogni decisione qui ha una motivazione, le alternative scartate, e cosa NON cambiare.

---

### 1.1 Expo Router (file-based) vs React Navigation puro

**Decisione**: Expo Router per la navigazione mobile, con file-based routing (`app/` directory).

**Perché**: Expo Router allinea la navigazione alla struttura filesystem, riduce il boilerplate di Stack/Tab navigator dichiarativi, integra nativamente con i link profondi (deep links) e semplifica la gestione di route dinamiche (`[id].tsx`).

**Alternative scartate**: React Navigation puro (troppo verboso, nessun vantaggio di co-location), Solito (troppo giovane, ecosistema piccolo).

**Cosa NON cambiare**:
- I file helper NON devono mai entrare in `app/(tabs)/` — ogni file `.ts`/`.tsx` dentro quella cartella diventa automaticamente una route/tab. File di stile, utility locali, helper → sempre in `components/`.
- `app/(tabs)/_layout.tsx` ha un marker `@no-split` e NON va mai ri-splittato. La causa originale di un crash-loop OTA critico era la ricreazione di options objects in quel file.
- Le route nuove vanno navigate con `router.push(\`/path/${id}\` as never)`, NON con `pathname: "/path/[id]" as const` — il typecheck non rigenera i tipi `.expo/` per route nuove.

**Cosa è sostituibile**: In una riscrittura, Expo Router andrebbe mantenuto o sostituito solo con un sistema che abbia la stessa semantica di file-based routing. Non tornare a React Navigation puro.

---

### 1.2 Custom Migration Runner vs Drizzle-kit push / Replit schema-diff

**Decisione**: `server/migrate.ts` + file `migrations/*.sql` numerati. Ogni cambio schema richiede un file SQL numerato. Il runner gira a ogni boot del server, confronta con la tabella `schema_migrations`.

**Perché**: Replit usa il suo schema-diff-on-publish internamente (confronta dev↔prod schema Drizzle e genera un ALTER automatico). Questo meccanismo:
- Ignora le exclusions di `drizzle.config.ts` in alcuni casi (in particolare per l'indice HNSW pgvector)
- Genera `ALTER TABLE spatial_ref_sys ADD PRIMARY KEY` su tabelle di sistema PostGIS di proprietà di `cloud_admin` → fail deploy
- Non può gestire migration DML complesse (deduplicazione dati prima di aggiungere vincolo UNIQUE)

Il custom runner risolve tutto: controlla solo i file `.sql`, li applica nell'ordine, traccia in `schema_migrations`, è idempotente.

**Alternative scartate**: `drizzle-kit push` (non adatto a produzione, non tracciabile), Flyway/Liquibase (troppo pesanti per lo stack Node.js), Prisma migrate (Prisma non è nel progetto).

**Cosa NON cambiare**:
- Un file migration con prefisso duplicato blocca l'intero batch, sia in dev che in prod, fino a risoluzione. Non aggiungere mai due file con lo stesso prefisso numerico.
- Il runner gira PRIMA che il server risponda a qualsiasi richiesta (Phase 2 del boot) — è fatale se fallisce.
- L'indice HNSW pgvector (per `embeddings`) NON va mai messo in un file migration. Replit genererebbe un diff errato e tenterà di crearlo direttamente in prod causando fail. L'indice viene creato al boot dalla `boot-sequence.ts`.

**Cosa è sostituibile**: Il runner custom in `server/migrate.ts` potrebbe essere sostituito con Flyway se il progetto migrasse a Java, o con un runner npm dedicato. La struttura dei file `.sql` numerati è universalmente portabile.

---

### 1.3 Pool PostgreSQL max=10 fisso

**Decisione**: Il pool `pg.Pool` ha `max: 10` fisso e non si tocca mai.

**Perché**: Replit gestisce Postgres come servizio managed con un limite di connessioni concorrenti per piano. Superare il limite causa errori "too many connections" lato Postgres che sono indistinguibili da errori transitori — il retry aggrava il problema. Il numero 10 è il risultato di test empirici: lascia margine per connessioni da Replit stesso (admin, monitoring) e dalle migration al boot.

**Struttura di budget delle connessioni**:
- Job background: massimo 3 connessioni via `withBgDbSlot` (RE-ENTRANT tramite AsyncLocalStorage)
- Almeno 7 riservate al traffico utente API
- Il `db-collector` watchdog usa 1 sola connessione dedicata

**Cosa NON fare**:
- MAI `pool.connect()` diretto in un job background — satura il pool e l'API va in timeout
- MAI `Promise.all` di query DB pesanti in job background — consumano tutte le slot contemporaneamente
- MAI alzare `max` senza aver verificato il limite del piano Replit corrente

**Cosa è sostituibile**: Con Neon serverless (già in uso), si potrebbe usare il connection pooler Neon (PgBouncer managed) che permette centinaia di connessioni logiche. Ma richiederebbe riscrivere tutta la gestione delle connessioni.

---

### 1.4 Drizzle ORM vs Prisma vs query raw

**Decisione**: Drizzle ORM per l'accesso al DB, con schema centralizzato in `shared/db/schema.ts`.

**Perché**: Drizzle è type-safe, leggero, usa SQL nativo per casi complessi, non richiede un processo separato per il schema (no Prisma Studio/migrate), ed è compatibile con pg.Pool diretto. Lo schema condiviso in `shared/db/` è accessibile sia dal server che dal client (per i tipi).

**Problema noto con Drizzle**: `uniqueIndex()` in schema.ts genera un diff in Replit publish che bypassa il DELETE di deduplicazione precedente → fail UNIQUE constraint su dati duplicati. **Pattern**: mai usare `uniqueIndex()` in schema se la creazione richiede pre-processing dei dati.

**Cosa NON cambiare**:
- `shared/db/` è condiviso client↔server — non importare da lì cose che dipendono da Node.js
- Il `sql` tag di Drizzle usato a module-scope (fuori da funzioni) causa problemi nei test — importarlo lazy

**Cosa è sostituibile**: Prisma potrebbe essere usato al posto di Drizzle in una riscrittura, ma richiederebbe migrare le query SQL custom. Kysely è un'alternativa type-safe più vicina a Drizzle.

---

### 1.5 Ollama self-hosted sul ThinkCentre vs cloud-only

**Decisione**: Gli agenti AI (Bowie, Horus, Nadir) girano su Ollama sul ThinkCentre (mini-PC di casa). Cloud (Groq/Gemini/OpenAI) è il **fallback**, non il primario, con un master switch `ai_fallback_enabled` che è OFF di default.

**Perché**:
1. **Privacy**: i dati utenti non escono verso cloud provider
2. **Costo**: Groq/Gemini hanno rate limit RPM e costo per token
3. **Latenza chat**: Bowie (qwen3:1.7b) risponde in 2-5s a caldo; cloud ha latenza variabile
4. **Control**: modelli custom Modelfile con personalità BikerLink

**Perché è OFF di default**: La direzione sicura è "solo ThinkCentre". Se il TC è spento, il sistema degrada visibilmente (503 AI) piuttosto che scaricare segretamente su cloud e bruciare quota. Gli admin vedono esplicitamente che la AI è giù.

**Cosa NON cambiare**:
- `ai_fallback_enabled` OFF = solo ThinkCentre. Non cambiare il default senza consenso esplicito.
- Ogni chiamata AI (anche streaming) DEVE passare dallo scheduler RPM (Bottleneck) per il cloud, mai chiamare Groq/Gemini direttamente.
- Horus/Ollama: chiamare SEMPRE via `ShellExec + curl` con streaming. MAI `CodeExecution/fetch` (Cloudflare taglia a 100s senza streaming SSE).

**Alternative storiche**: Anthropic era in catena cloud ma è stato rimosso (costo). La chain attuale è Groq → Gemini → OpenAI.

---

### 1.6 DragonflyDB vs Redis managed vs memoria

**Decisione**: DragonflyDB sul ThinkCentre come backend BullMQ (job queue) e cache distribuita. Accesso via `TC_REDIS_URL` (non `REDIS_URL`).

**Perché**: Redis managed su Replit non era disponibile al costo corretto; DragonflyDB è compatibile Redis-protocol ma usa flag diversi da Redis puro. BullMQ richiede `cluster_mode=emulated` e `allow-undeclared-keys`.

**Cosa NON fare**:
- MAI usare flag Redis-only con DragonflyDB — crashano silenziosamente
- MAI configurare `TC_DRAGONFLY_URL` come hostname HTTP nel tunnel Cloudflare — il path TCP Cloudflare non è costruito; il path corretto è via nginx/DuckDNS o TCP diretto
- MAI usare `REDIS_URL` (Upstash) — è il vecchio URL deprecato

**Accesso in produzione**: Il bridge TCP usa cloudflared (`bin/cloudflared`) baked nel Repl layer durante il deploy. Se il binario manca, il bridge degrada a no-op (fallback in-memory per la cache).

---

### 1.7 GraphHopper multi-area vs singolo vs Valhalla

**Decisione**: GraphHopper in modalità multi-area sul ThinkCentre. Ogni area geografica (italia, grecia, ecuador, ecc.) risponde su `/areas/<code>/info` e `/areas/<code>/route`. Valhalla è il motore secondario per profili speciali (auto panoramica).

**Perché multi-area**:
- Un singolo grafo per tutta Europa sarebbe troppo grande per la RAM del TC
- Le aree si buildano indipendentemente (PBF per regione)
- Si può aggiornare un'area senza ricostruire tutto

**Cosa critica da sapere**:
- `routing_area_mode` in `app_settings` DEVE essere `'enabled'`. Se mancante o `'disabled'`, il codice ricade silenziosamente sul path legacy che ora ritorna 404 (endpoint root `/info` e `/route` non esistono più).
- La root `/info` e `/route` del TC ritornano 404. Non è un errore — è by design (multi-area).
- `PointNotFoundException` da GraphHopper = motore VIVO ma punto fuori dalla rete stradale. Non è crash.
- I bbox center di aree come Grecia, Balcani, Ecuador cadono in mare → probe erroneamente segnala il motore come rotto.

**Valhalla**: Profilo "Auto panoramica" usa SOLO Valhalla, senza fallback GH. Fail → 503 esplicito.

---

### 1.8 Leaflet/MapLibre via WebView vs React Native Maps vs Google Maps

**Decisione**: Le mappe usano Leaflet (in produzione) o MapLibre via WebView, con tile OSM. Google Maps non è mai stato integrato.

**Perché**:
- Google Maps richiede API key con billing abilitato
- OSM + Leaflet sono gratuiti e self-hostabili
- La "mappa nera" vista storicamente era un residuo di codice che cercava Google Maps con una API key placeholder finta

**Cosa NON fare**:
- MAI integrare Google Maps (`expo-maps`, `react-native-maps` con provider Google)
- MAI inserire chiavi Google Maps false — causano crash silenzioso della mappa

---

### 1.9 Expo SDK 56 + React Native vs React Native bare

**Decisione**: Expo managed workflow (SDK 56). Non bare workflow.

**Perché**: Il managed workflow gestisce automaticamente i moduli nativi, le build EAS, gli aggiornamenti OTA. Il bare workflow richiederebbe gestire Xcode/Gradle manualmente.

**Cosa critica**: Una dipendenza nativa aggiunta dopo la build del binario APK non è disponibile via OTA (OTA è solo JS). Se si aggiunge `expo-camera` o qualsiasi modulo nativo, serve una nuova build EAS. Usare `requireOptionalNativeModule` e degradare gracefully.

---

### 1.10 Backend Express + TypeScript vs framework alternativo

**Decisione**: Express puro con TypeScript. Nessun framework opinionated (NestJS, Fastify, Hono).

**Perché**: Il progetto era già Express. La migrazione a Fastify/Hono porterebbe benefici di performance trascurabili per il carico attuale. NestJS avrebbe aggiunto complessità di decorators.

**Porta 5000 è SACRA**: Il backend deve sempre girare su porta 5000. Il `.replit [deployment] run` deve avere `PORT=5000`. Porto 8081 è Metro/Expo probe. Invertirli → tutto il traffico va al probe → API rotte.

---

### 1.11 OTA updates vs app store updates

**Decisione**: Expo Updates (OTA) per aggiornamenti JS-only, EAS Build per aggiornamenti che toccano codice nativo.

**Cosa critica da sapere**:
- Un APK nuovo da HEAD esegue il bundle embedded e NON può auto-applicare una OTA approved più vecchia (EAS offre solo la più recente del canale + gating server per-approval)
- `.ota-message` DEVE essere scritto prima di lanciare il workflow "OTA Publish"
- Se `.ota-message` è vuoto, ripubblica lo stale message dal DB — spesso sbagliato
- NON pubblicare OTA a fine task senza istruzione esplicita dell'utente. È un'operazione separata.
- `logs/ota-hwm.txt` è il "high-water mark" anti-regressione. Tracked in git.

---

### 1.12 oxlint vs ESLint

**Decisione**: oxlint (Rust-based) sostituisce ESLint/typescript-eslint. Gate CI a `--max-warnings=0`.

**Perché**: `@typescript-eslint` dipende dal pacchetto `typescript` internamente. Questo blocca l'upgrade a TypeScript 7 (che è compiler-clean). oxlint non dipende da `typescript`, sblocca il path a TS7.

**Cosa NON fare**:
- `// oxlint-disable-next-line react-hooks/exhaustive-deps` DEVE stare sulla riga immediatamente sopra `}, [deps]);` — non sopra la dichiarazione dell'hook. Altrimenti la soppressione fallisce silenziosamente.

---

### 1.13 AI Provider Chain: Groq → Gemini → OpenAI (Anthropic rimosso)

**Decisione**: Fallback cloud ordinato: Groq (primario per velocità + costo) → Gemini (secondario) → OpenAI (terziario, più costoso).

**Perché Anthropic è stato rimosso**: Costo eccessivo per il piano corrente.

**Cosa critica**:
- `generateObject({ schema })` diretto fuori da `server/ai/moderation/provider.ts` crasha su llama-3.x (Groq) perché `json_schema` nativo non è supportato. SEMPRE usare `generateStructured(resolvedModel, { schema, prompt })`.
- Schema Zod per generateObject: usare `.nullable()` non `.optional()`. Niente `record()`/catchall (additionalProperties deve essere false per strict mode).
- Ollama 0.32+ esplode su JSON Schema annidati → usare no-schema mode per Ollama in `generateStructured`.

---

## SEZIONE 2 — WORKAROUND E BUG STORICI

Ogni workaround qui: problema originale, causa, soluzione, cosa succede se rimosso.

---

### 2.1 Sentry RN integrations loop (ATTIVO — workaround permanente)

**Problema**: `@sentry/react-native` 8.x causava un "Maximum update depth exceeded" crash loop al boot su Android.

**Causa**: Le default integrations di Sentry chiamavano `setState` dentro `commitLayoutEffects` di React Navigation, violando la regola che le setState non devono avvenire durante la fase di commit del layout.

**Soluzione**: Sempre inizializzare Sentry con `integrations: []` — lista esplicitamente vuota.

**Cosa succede se rimosso**: L'app va in crash loop al boot su dispositivi Android con React Navigation attivo.

**È ancora rilevante**: Sì. Ogni aggiornamento di `@sentry/react-native` va testato con questo comportamento.

---

### 2.2 FloatingWidget Android hitbox con Reanimated (RISOLTO — non reintrodurre pattern sbagliato)

**Problema**: Il widget flottante sull'AI Assistant spariva visivamente ma continuava a intercettare i tocchi su Android.

**Causa**: `useSharedValue` + `useAnimatedStyle` (Reanimated) non aggiorna la hitbox touch su Android quando il componente si sposta. L'area di tocco rimane dove era prima dell'animazione.

**Soluzione**: `RN Animated.Value` con `transform` — questa API aggiorna correttamente l'hitbox nativa.

**Cosa succede se reintrodotto**: I bottoni sotto il widget sono inaccessibili su Android.

---

### 2.3 package-lock.json → Replit proxy → EAS crash (WORKAROUND OBBLIGATORIO)

**Problema**: Dopo ogni `npm install` in Replit, EAS crasha con "Exit handler never called!".

**Causa**: Replit riscrive le URL `resolved` nel `package-lock.json` con `http://package-firewall.replit.local/npm/`. EAS, girando su server EAS remoti, non può raggiungere questo host interno.

**Soluzione obbligatoria** (deve girare dopo ogni npm install):
```bash
sed -i 's|http://package-firewall\.replit\.local/npm/|https://registry.npmjs.org/|g' package-lock.json
```

**Questo è automatizzato in**: `scripts/post-merge.sh`

---

### 2.4 DragonflyDB flags incompatibili (WORKAROUND PERMANENTE)

**Problema**: Comandi Redis standard crashano DragonflyDB.

**Causa**: DragonflyDB non supporta tutti i flag Redis puri (es. `CONFIG SET cluster-enabled`).

**Soluzione**: Usare solo `--snapshot_cron` (al posto di `--save`), `--maxmemory ≥1gb`. BullMQ richiede `cluster_mode=emulated` + `allow-undeclared-keys` nella configurazione DragonflyDB.

---

### 2.5 Drizzle uniqueIndex vs Replit publish (WORKAROUND PERMANENTE)

**Problema**: Aggiungere `uniqueIndex()` in `shared/db/schema.ts` genera fail durante il deploy.

**Causa**: Il diff Replit bypassa il `DELETE` di deduplicazione che andrebbe fatto prima di creare l'indice UNIQUE. Risultato: fail UNIQUE constraint su dati duplicati preesistenti.

**Soluzione**: Mai usare `uniqueIndex()` in schema.ts per vincoli che richiedono pre-processing dati. Creare l'indice UNIQUE nel file migration SQL dopo aver deduplato i dati.

**Pattern corretto (deduplicazione)**:
```sql
WITH dupes AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY col ORDER BY id) AS rn FROM table
)
DELETE FROM table WHERE id IN (SELECT id FROM dupes WHERE rn > 1);
CREATE UNIQUE INDEX ...
```

---

### 2.6 spatial_ref_sys deploy failure (BUG REPLIT — non fixabile lato nostro)

**Problema**: Il publish Replit fallisce con `ALTER TABLE spatial_ref_sys ADD PRIMARY KEY` se copy-ON è disabilitato.

**Causa**: È una migrazione interna di Replit su una tabella di sistema PostGIS di proprietà di `cloud_admin`. Non è fixabile da noi.

**Workaround attuale**: `drizzle.config.ts` filtra esplicitamente `spatial_ref_sys`, `geography_columns`, `geometry_columns` dalle tabelle monitorate. Funziona nella maggior parte dei casi ma non sempre.

**Cosa NON fare**: Abilitare copy-ON per workaroundare il problema — cancella i dati prod.

---

### 2.7 HNSW index fuori dalle migration (WORKAROUND PERMANENTE)

**Problema**: Se l'indice HNSW pgvector è in un file migration, Replit genera un `CREATE INDEX` spurio nel diff dev↔prod che fallisce in produzione.

**Causa**: Replit calcola il diff schema e tenta di ricrearlo autonomamente, ma non sa gestire `vector_cosine_ops`.

**Soluzione**: L'indice HNSW è creato al primo boot da `boot-sequence.ts`, mai nelle migration. La tabella `embeddings` è nella exclusion list di `drizzle.config.ts`.

---

### 2.8 boot-loop cached-user hydration (RISOLTO — non reintrodurre il pattern sbagliato)

**Problema**: L'app andava in crash loop al boot su alcuni dispositivi dopo il login.

**Causa**: Redirect ottimistico a `/(tabs)` con `user=undefined` — React Navigation provava a renderizzare il tab layout senza utente autenticato.

**Soluzione**: Fare il seed della cache auth PRIMA di abilitare la query utente; mai fare redirect quando `authIsLoading=true`.

**Gotcha importante**: `refetchQueries` è no-op su query con `enabled: false`.

---

### 2.9 Metro cache race condition al boot (WORKAROUND IN PRODUZIONE)

**Problema**: Metro a volte non parte correttamente causando timeout nel watchdog.

**Causa**: Race condition se il processo Metro viene killato mentre è in fase di startup (lock `/tmp/start-metro.lock`).

**Soluzione**: Il watchdog (`cerbero.sh`) è lock-aware — verifica `pgrep start-expo` prima di killare porta 8081. Il restart del backend avviene SOLO se `/api/health` è irraggiungibile (503 durante init = server vivo ma non pronto, non killare).

---

### 2.10 ioredis ETIMEDOUT flooding (RISOLTO — 3 livelli di fix)

**Problema**: Migliaia di log `[ioredis] ETIMEDOUT` al secondo quando DragonflyDB non è raggiungibile.

**Causa**: ioredis di default fa retry automatici a ogni errore TCP.

**Soluzione a 3 livelli**:
1. `retryStrategy: () => null` — zero retry
2. `client.disconnect()` nel catch del coordinator
3. Filtro `console.error` in `server/index.ts` per i messaggi `[ioredis]` residui

---

### 2.11 Repl Layer Size Limit (WORKAROUND IN DEPLOY)

**Problema**: Il deploy fallisce silenziosamente con "Creating Autoscale service" senza log di errore.

**Causa**: `.local/state/replit/` (transcript agente AI) + `.git/` (3.4GB storia) + `exports/` superano il limite Cloud Run di ~2GB per il Repl layer.

**Soluzione**: `scripts/deploy-build.sh` rimuove sistematicamente:
- `attached_assets/` (screenshot workspace)
- `.local/state/replit/`, `.local/state/scribe/`, `.local/state/workflow-logs/`
- `.local/backups/`, `dist/`, `dist-ota-env/`, `logs/`
- `exports/`, `.git/`

**Cosa NON fare**: `rm -rf .cache/` — è un layer gestito dalla piattaforma con file read-only di altro utente. `set -e` fa fallire la build.

---

### 2.12 router in deps di useEffect → loop (REGOLA PERMANENTE)

**Problema**: "Maximum update depth exceeded" in schermate specifiche.

**Causa**: `router` (da `useRouter()`) in deps di `useEffect` che chiama `router.replace/push`. Ogni chiamata di navigate ricrea il riferimento `router`, ri-triggera l'effect, che ri-naviga, loop infinito.

**Soluzione**: `routerRef` + `didRedirectRef`:
```ts
const routerRef = useRef(router);
routerRef.current = router;
const didRedirectRef = useRef(false);
useEffect(() => {
  if (!didRedirectRef.current && condizione) {
    didRedirectRef.current = true;
    routerRef.current.replace("/(auth)/login" as Href);
  }
}, [condizione]); // router NON è nelle deps
```

**File colpiti storicamente**: `BackgroundNotificationHandler`, `feedback/index`, `moderator/logs`, `app/(tabs)/_layout.tsx`.

---

### 2.13 esbuild CJS crash con import.meta.dirname (RISOLTO — non reintrodurre)

**Problema**: Il server crashava al boot con `TypeError: path.resolve cannot be called with undefined`.

**Causa**: esbuild trasforma `import.meta` in `{}` (oggetto vuoto) in CJS. Quindi `import.meta.dirname` diventa `undefined`. `path.resolve(undefined, ...)` crasha.

**Soluzione**: Usare sempre `__dirname` al posto di `import.meta.dirname` nel codice server.

---

### 2.14 Watchdog proposer cooldown burn Groq quota (RISOLTO)

**Problema**: Il proposer AI del watchdog bruciava 200k TPD in poche ore su Groq.

**Causa**: Il proposer chiamava Groq ogni 60s ogni volta che c'era un problema high/critical persistente (es. Valhalla down per manutenzione).

**Soluzione**: Cooldown 30min in `scheduler.ts`. Un problema persistente genera una sola proposta ogni 30 minuti.

---

### 2.15 AppSetting valueJson vs value (BUG SILENZIOSO)

**Problema**: Il watchdog collector non leggeva i valori JSON che avrebbe dovuto leggere.

**Causa**: `upsertAppSetting(key, value?, valueJson?)` — il collector legge `row.valueJson` (JSONB), non `row.value` (stringa). Passare JSON come secondo argomento (stringa) lascia `valueJson=null`.

**Soluzione**: Usare sempre il terzo argomento per dati JSON strutturati.

---

### 2.16 react-native-webview TypeScript regression (WORKAROUND AUTOMATICO)

**Problema**: `WebView<P=undefined>` in `index.d.ts` diventa `never` in TypeScript 6 strict mode.

**Causa**: Bug nel typing del pacchetto react-native-webview.

**Soluzione**: Patch `P={}` baked in `scripts/post-merge.sh`. Sopravvive all'upgrade 13→14 (breaking change di 14.0 era solo minSdk 24, già soddisfatto).

---

### 2.17 GPS offline buffer rimosso (NON REINTRODURRE)

**Problema**: L'app crashava con `SQLITE_FULL` e la mappa rotta.

**Causa**: Un buffer GPS write-only in AsyncStorage non veniva mai riletto ma cresceva indefinitamente fino a saturare AsyncStorage.

**Soluzione**: Il buffer è stato rimosso. Non reintrodurre senza un meccanismo di recovery.

---

### 2.18 Bowie/nested-Expo EAS archive pollution (WORKAROUND OBBLIGATORIO)

**Problema**: EAS per l'app Bowie Terminal scansionava l'intero monorepo invece di solo `bowie-terminal/`.

**Causa**: `EAS_NO_VCS=1` da solo non basta — `noVcs` fa comunque `git rev-parse`. Serve anche `EAS_PROJECT_ROOT` assoluto.

**Soluzione**: Impostare entrambi `EAS_NO_VCS=1` e `EAS_PROJECT_ROOT=/path/assoluto/bowie-terminal`.

---

### 2.19 DB managed-Postgres slowness (BIAS COGNITIVO DA EVITARE)

**Situazione ricorrente**: ping > 8s con `waiting=0` nel pool stats.

**Causa reale**: Lentezza del DB managed Replit, non leak di connessioni. Il managed Postgres ha picchi di latenza non prevedibili.

**Come distinguere**: Pool saturo con query active = leak. Pool saturo con 0 query attive = conn idle checked-out (usa `application_name` + tracer in-process per attribuire). Ping alto con pool ok = lentezza managed.

---

### 2.20 TC SSH host con prefisso https:// (BUG PERMANENTE DA RICORDARE)

**Problema**: `TC_SSH_HOST` contiene il prefisso `https://` che va strippato prima di usarlo con SSH.

**Causa**: Il secret è stato configurato con prefisso URL per compatibilità con altri tool.

**Soluzione**: Fare sempre `TC_SSH_HOST.replace(/^https?:\/\//, '')` prima di usarlo come hostname SSH.

---

### 2.21 Deep schema parity check (APPROCCIO NON OVVIO)

**Problema**: Verificare che dev e prod abbiano lo stesso schema DB senza connettersi a prod con connection string.

**Soluzione**: Snapshot produzione in `server/data/deep-schema-parity.prod.json` (catturata offline). Confronto delle DEFINIZIONI (non solo nomi) su 7 categorie via hash. `spatial_ref_sys_pkey`, PostGIS objects, `user_sessions_chk` sono allow-listati (differenze attese).

---

### 2.22 Nadir OpenAI quota circuit breaker (ATTIVO)

**Problema**: Quando la quota OpenAI esauriva, il reindexer chiamava OpenAI 3x per ogni chunk prima di fallire.

**Soluzione**: Un circuit breaker process-wide si apre a una 429 (10 minuti di cooldown) e i successivi chunk saltano direttamente al fallback locale invece di ritentare OpenAI ripetutamente.

---

## SEZIONE 3 — DIPENDENZE NASCOSTE

Queste non sono evidenti leggendo il codice — richiedono conoscenza del contesto.

---

### 3.1 storage↔embeddings circular dependency

**La dipendenza**: `server/storage.ts` (o chi lo importa) → `embeddings/store.ts` → `../storage` (ciclo).

**Sintomo**: "Class extends undefined" quando si importa una classe di storage da sola.

**Causa**: L'import aggregato `../storage` tira dentro `embeddings/store.ts` che a sua volta importa `../storage` — ciclo che fa valutare il modulo prima che sia completamente inizializzato.

**Soluzione**: Lazy `await import` nella back-edge (`embeddings/store.ts` importa `../storage` lazy).

**Regola**: Non risolvere con mock nei test — il problema è strutturale, la soluzione è il lazy import. Qualsiasi futuro refactoring che tocca storage o embeddings deve verificare che il ciclo non si ripresenti.

---

### 3.2 Roster.ts vince sempre su tool-calling.ts

**La dipendenza**: `server/ai/assistant/roster.ts` definisce le regex di handoff persona (Bowie→Horus, Bowie→Ares). `server/ai/assistant/tools.ts` definisce i tool `call_horus`, `call_ares`, `call_quebracho`.

**Conflitto**: Le regex di `roster.ts` per il handoff VINCE su qualsiasi tool call. Se la frase di trigger del tool corrisponde anche alla regex del roster, l'handoff avviene e il tool non viene mai chiamato.

**Esempio**: Se il sistema prompt di Bowie contiene "chiedi a Horus" come esempio di uso del tool `call_horus`, ma quella stessa frase trigghera la regex del roster per il handoff a Horus, il tool non viene mai eseguito.

**Regola**: Tenere le regex del roster e gli esempi dei tool sempre distinti. Il roster vince.

---

### 3.3 callOllamaChat vs AI SDK — chi usa cosa

**Non è evidente**: Il progetto usa due sistemi di chiamata AI distinti:
1. `callOllamaChat()` — chiamata diretta all'API Ollama HTTP, usata per gli agenti (Bowie chat, Horus chat, streaming SSE)
2. AI SDK Vercel (`generateText`, `streamText`, `generateObject`) — usato per operazioni strutturate (moderazione, proposte task, generateStructured)

**Differenza critica**: `callOllamaChat()` con `persona: "horus"` seleziona solo l'endpoint (URL + token), NON il modello. Il modello va specificato esplicitamente con `model:` ad ogni callsite. Altrimenti usa il default Ollama che potrebbe non esistere.

**Regola**: Audit ogni `persona: "horus"` nel codice e verificare che abbia `model:` esplicito.

---

### 3.4 React Query e TabBar loop — 3 livelli

**La dipendenza non ovvia**: Il `CustomTabBar` in `app/(tabs)/_layout.tsx` usa `useCallback` con `deps: []`. Questo è intenzionale — cambiare questa scelta causa il loop.

**3 livelli che causano il loop (tutti e tre risolti)**:
1. `renderCustomTabBar` con deps non-vuote → tabBar prop cambia → setOptions cascade su 15 Tabs.Screen
2. Oggetti `screenOptions` ricreati nel `useMemo` → React Navigation forEachs → loop
3. `InteractionManager.runAfterInteractions` per il `setVisible` del Tour — senza questo, React 18 batching raggruppa il mount del Modal con il re-render da query → cascade

**Regola**: Mai dipendere da oggetti React Query interi nelle deps di useCallback/useMemo per componenti che interagiscono con React Navigation. Dipendere solo da slice primitive (`.data`, `.isPending`, etc.).

---

### 3.5 Boot sequence phase ordering — dipendenze obbligatorie

**Phase 1** (HTTP Listen) DEVE essere prima di tutto il resto — altrimenti healthcheck fallisce prima che il server sia pronto.

**Phase 2** (Migrations) è FATAL e produce `initState.dbReady = true`. Nulla può usare il DB prima di questo flag.

**Phase 3** (DB Init) dipende da Phase 2.

**Phase 4** (Seed + Engine) dipende da Phase 3. È FATAL.

**Phase 5** (Schedulers) è post-READY, NON fatale, asincrona.

**Regola assoluta**: Mai chiamare `process.exit()` dopo il READY (dopo `initState.initializing = false`). Il server sta già servendo traffico — un exit causa crash-loop. Usare `markDegraded()` per segnalare problemi post-READY.

---

### 3.6 AppSetting come fonte di verità di runtime — side effect nascosti

**La dipendenza**: Molte feature del sistema leggono la loro configurazione da `app_settings` (DB) a runtime. Cambiare un valore in app_settings ha effetto immediato, senza restart.

**Dipendenze nascoste notevoli**:
- `routing_area_mode`: se mancante → GraphHopper legacy path (404)
- `ai_fallback_enabled`: controlla se il cloud AI è attivo
- `ota_emergency_active`: attiva la pipeline OTA di emergenza
- `vacuum_full_bloat_threshold`: controlla quando fare VACUUM FULL
- `routing_function_engines`: override per-funzione del motore di routing

**Attenzione**: `upsertAppSetting(key, value)` scrive `row.value` (stringa), NON `row.valueJson` (JSONB). Il watchdog legge `row.valueJson`. Passare dati JSON come secondo argomento li rende invisibili al watchdog.

---

### 3.7 Matching coordinator — controllo plane Horus/Bowie

**La dipendenza**: Il matching coordinator ha un "gate unico" — solo Horus può scrivere (pause/resume/force_cycle). Bowie può solo leggere e relayare. Se Horus è irraggiungibile, il gate fail-open (il matching continua).

**Implicazione**: Non aggiungere logica di controllo del matching in Bowie. Non aggiungere bypass al gate senza audit.

---

### 3.8 Sanitize order — secret prima di PII

**La dipendenza non ovvia**: `matchesSensitive(text)` DEVE girare sul testo grezzo PRIMA di `redactPII(text)`. Invertire l'ordine può spezzare un token segreto in modo che il regex di secret non lo riconosca ma il frammento trapeli.

---

### 3.9 Inter-agent consult model mismatch

**La dipendenza**: `callOllamaChat` con `persona: "horus"` usa solo l'endpoint, non il modello. Se si chiama il tool `call_horus` dall'interno di Bowie, il modello DEVE essere specificato esplicitamente o colpisce l'endpoint sbagliato con il modello di default.

---

### 3.10 Drizzle sql array → IN vs ALL/ANY

**La dipendenza**: `${jsArray}` in un template `sql\`\`` diventa `$1,$2,$3` (lista valori). Funziona per `IN`, ma è ROTTO per `ALL(?)` e `ANY(?)` che si aspettano un array Postgres. Usare `inArray()`/`notInArray()` del query builder per questi casi.

---

### 3.11 Nadir embedding dimension projection

**La dipendenza nascosta**: Il modello `multilingual-e5-small` produce vettori a 384 dimensioni. `client.ts` proietta a 1536 via 4× concatenazione + normalizzazione L2. Il tag nel DB è `'local:Xenova/multilingual-e5-small'`. La whitelist di `db-integrity` deve includere questo tag altrimenti segnala una violazione falsa.

---

### 3.12 AI Coordinator kill-switch Redis TTL

**La dipendenza**: Il kill switch AI (pause per AI) è memorizzato in Redis con TTL. Se Redis (DragonflyDB) è giù, il kill switch fallback è in-memory. Questo significa che un restart del server cancella il kill switch in-memory. Redis è la fonte di verità duratura.

---

### 3.13 Expo typed-routes stale in typecheck

**La dipendenza**: I tipi `.expo/types/router.d.ts` sono generati automaticamente ma sono in `.gitignore`. Il typecheck CI non li rigenera. Le route nuove non appaiono nei tipi durante la validazione.

**Soluzione**: Navigare su route nuove con `router.push(\`/x/${id}\` as never)` — non con typed `pathname`.

---

### 3.14 Telemetry collector machine — source singola

**La dipendenza**: `useTelemetry` è una macchina a stati con una sola sorgente di eventi serializzati. `AppState` steer solo la macchina, non è una sorgente. Upload per distanza (5km), non a timer. Il marker avanza solo dopo flush riuscito. Non aggiungere sorgenti di eventi parallele — rompe le transizioni serializzate.

---

### 3.15 Local embedding model projection: db-integrity whitelist

**La dipendenza**: `db-integrity` verifica che i modelli di embedding usati nel DB siano nella whitelist. `'local:Xenova/multilingual-e5-small'` DEVE essere in questa whitelist. Se si cambia modello locale, aggiornare la whitelist o db-integrity segnala violazione ad ogni boot.

---

### 3.16 BGDbLimiter — drop vs errore reale

**La dipendenza**: `isBgDbLimiterDropError` distingue tre tipi di "drop": kill-switch attivo, coda piena, coda scaduta. Questi sono WARN (contatore separato), non errori reali. Il watchdog NON deve alertare su questi drop — sarebbero falsi positivi.

---

### 3.17 Scheduler retry boundary — solo acquisizione, mai loop mutante

**La dipendenza**: `withSchedulerRetry` avvolge SOLO la fase di discovery/acquisizione (idempotente). MAI avvolgere il loop mutante (che fa write/modifca dati). Un retry del loop mutante porta a doppio-write.

---

### 3.18 Dual-read env gate — alias secret rinominati

**La dipendenza**: Quando un secret viene rinominato (es. `OLD_URL` → `NEW_URL`), il codice aggiunge `process.env.NEW_URL ?? process.env.OLD_URL`. Ma tutti i `if (process.env.OLD_URL)` diretti nel codice (gate, feature flag) restano sul vecchio nome e falliscono silenziosamente. Audit OGNI uso del vecchio nome, non solo il wrapper URL.

---

*Continua nella Parte 2/4 (Sezioni 4-6: Database, Flussi Applicativi, File Delicati)*
