# BikerLink — AI Knowledge Base (Parte 4/4)

> **Continuazione dalla Parte 3.** Copre: Regole Assolute (Sezione 10), Cose da Cambiare in una Riscrittura (Sezione 11), Le 50 Cose Più Importanti (Sezione 12).

---

## SEZIONE 10 — REGOLE ASSOLUTE

Queste non si violano mai, per nessuna ragione. Non hanno eccezioni. Non sono negoziabili.

---

### 10.1 Mai pubblicare OTA senza istruzione esplicita dell'utente

**Perché**: Una OTA cattura lo stato del codice al momento della pubblicazione. Un codice incompleto, con conflitti di merge, o provvisorio distribuito via OTA è difficile da rollbackare in produzione. Ci sono utenti Android live che lo ricevono automaticamente.

**La regola**: Il task finisce. Si propone la pubblicazione OTA come follow-up. L'utente la approva esplicitamente. Solo allora si esegue.

---

### 10.2 Mai splittare un file senza approvazione esplicita dell'utente

**Perché**: Il split è un'operazione che cambia la struttura del progetto permanentemente. Un file critico splittato male (es. `_layout.tsx`) ha causato crash loop OTA storicamente. Il gate che fallisce è il segnale di fermarsi e segnalare, non di procedere.

**La regola**: Gate fallisce → segnalare all'utente, attendere il via libera. Anche se è "ovvio". Anche se è "meccanico".

---

### 10.3 Mai chiamare process.exit() post-READY

**Perché**: Il server ha già servito traffico. Un exit causa crash loop — il watchdog restarta, il server torna in boot, crash, restart, loop.

**La regola**: Post-READY, usare sempre `markDegraded()`. Il server continua a girare in stato degradato piuttosto che morire.

---

### 10.4 Mai generateObject({ schema }) diretto fuori da provider.ts

**Perché**: Su Groq con llama-3.x, `json_schema` nativo non è supportato. Il crash è silenzioso — in dev può funzionare, in prod crasha.

**La regola**: Sempre `generateStructured(resolvedModel, { schema, prompt })` dove `resolvedModel` viene da `runWithFallback` in `server/ai/moderation/provider.ts`.

---

### 10.5 Mai oggetti/funzioni inline in prop di React Navigation

**Perché**: Ogni oggetto inline crea un nuovo riferimento ad ogni render. React Navigation legge questi riferimenti e chiama `setOptions` ad ogni differenza → cascade → loop "Maximum update depth exceeded".

**La regola**: `screenOptions` e `options` devono sempre essere costanti module-level o `useMemo` con deps primitive. Mai oggetti letterali inline `{{ title: 'foo' }}`.

---

### 10.6 Mai usare router in deps di useEffect che naviga

**Perché**: `router` cambia riferimento ad ogni navigate. L'effetto si ri-trigghera → naviga → loop.

**La regola**: `routerRef` + `didRedirectRef`. `router` NON va nelle deps di `useEffect` che chiama `router.replace/push`.

---

### 10.7 Mai rm -rf .cache/ nel deploy

**Perché**: `.cache/` è un layer gestito dalla piattaforma Replit. Contiene file read-only di altro utente. `set -e` fa crashare il build script.

**La regola**: Non toccare mai `.cache/`. Se il Repl layer cresce, pulire `.local/state/`, `exports/`, `.git/`.

---

### 10.8 Mai usare CodeExecution/fetch per chiamare Horus/Ollama

**Perché**: Cloudflare taglia le connessioni idle dopo ~100s. Una risposta Horus (qwen3:4b) può richiedere 45-60s solo per il "thinking". Senza streaming, la connessione viene chiusa prima che la risposta completa arrivi.

**La regola**: Sempre `ShellExec + curl` con `stream: true` per chiamate Ollama. Header obbligatori: `CF-Access-Client-Id`, `CF-Access-Client-Secret`, `Authorization: Bearer $HORUS_OLLAMA_TOKEN`.

---

### 10.9 Mai Promise.all di query DB pesanti in job background

**Perché**: Consumano tutte le slot del pool (max 10) contemporaneamente. Le API utente vanno in timeout.

**La regola**: Job background: query sequenziali con `for...of`. Sempre `withBgDbSlot` (RE-ENTRANT). Mai `pool.connect()` diretto.

---

### 10.10 Mai connection string diretta a prod DB

**Perché**: Rischio di accesso non autorizzato, perdita di dati, operazioni non reversibili.

**La regola**: Sempre `executeSql({ environment: "production" })` per check produzione (SELECT-only). Mai connection string diretta.

---

### 10.11 Mai file helper in app/(tabs)/

**Perché**: Expo Router trasforma ogni file `.ts`/`.tsx` in quella directory in una route/tab. File di utility diventano tab vuote nella CustomTabBar.

**La regola**: Tutto ciò che non è una schermata principale va in `components/`.

---

### 10.12 Mai Google Maps — sempre Leaflet/MapLibre + OSM

**Perché**: Google Maps richiede billing, API key, e accetta solo licenza commerciale. OSM è libero e self-hostabile.

**La regola**: Qualsiasi integrazione mappa usa Leaflet via WebView con tile OSM. Zero integrazioni Google Maps.

---

### 10.13 Mai alzare il marker LARGE-FILE-LOCKED o rimuoverlo

**Perché**: Alzare il numero equivale a chiedere lo split (e il ratchet lo rileva come bypass). Rimuoverlo riapplica il default 800 → il file scatta sopra soglia → blocco.

**La regola**: Il numero nell'header LOCKED può solo restare uguale o calare. Mai alzarlo. Mai rimuoverlo senza task esplicito.

---

### 10.14 Mai routing_area_mode assente o disabled in produzione

**Perché**: Se mancante, il codice cade silenziosamente sul path legacy GraphHopper che ritorna 404 su tutte le richieste di routing.

**La regola**: `routing_area_mode` in `app_settings` DEVE essere `'enabled'`. Verificare dopo ogni restore del DB.

---

### 10.15 Mai npm install diretto via bash

**Perché**: È bloccato per design su Replit. E anche se passasse, genererebbe URL `package-firewall.replit.local` nel package-lock.json → EAS crash.

**La regola**: Sempre `installLanguagePackages` (packager tool Replit). Il workaround URL è automatizzato in `post-merge.sh`.

---

### 10.16 Mai modificare .replit direttamente

**Perché**: `.replit` controlla il comportamento del container di produzione. Modifiche manuali possono rompere il deploy senza messaggi chiari.

**La regola**: Usare `deployConfig()` per modificare la configurazione di deploy.

---

### 10.17 Mai ridurre il timeout Ares sotto 170s

**Perché**: devstral (14GB) richiede 55-170s per il cold-load. Un timeout più corto causa timeout sistematici su ogni chiamata.

**La regola**: Timeout Ares ≥ 170s. Non riabbassare senza misurare live sul ThinkCentre.

---

### 10.18 Sempre matchesSensitive prima di redactPII

**Perché**: Invertire l'ordine può spezzare un token segreto — la redazione PII trasforma il testo in un modo che il regex del secret non riconosce più il pattern completo.

**La regola**: La catena di sanitizzazione è sempre: `matchesSensitive(rawText)` → `redactPII(text)`. Mai invertire.

---

### 10.19 Sempre aggiornare TOTAL nei label [N/TOTAL] di deploy-build.sh

**Perché**: Il gate `check-deploy-build-step-numbers.sh` verifica che i label siano sequenziali e che il TOTAL corrisponda. Un TOTAL stantio blocca il deploy.

**La regola**: Aggiungere un step → aggiornare immediatamente sia il label dello step che tutti i TOTAL nei log iniziali.

---

### 10.20 Mai HNSW index nelle migration

**Perché**: Replit calcola il diff dev↔prod e tenta di creare l'indice direttamente in prod. `vector_cosine_ops` non è supportato dal diff tool → il deploy fallisce.

**La regola**: L'indice HNSW viene creato solo da `boot-sequence.ts` al primo boot. La tabella `embeddings` è nella exclusion list di `drizzle.config.ts`.

---

## SEZIONE 11 — COSE DA CAMBIARE IN UNA RISCRITTURA

Se BikerLink venisse riscritto da zero con le lezioni apprese, queste sarebbero le scelte diverse.

---

### 11.1 Sostituire Express con Hono o Fastify

**Motivazione**: Express è non-opinionato e lento nei middleware. Hono è 10x più veloce per request throughput, ha TypeScript first-class, e ha un'API simile. Fastify ha validazione schema integrata (Zod-compatible). Con il carico attuale non è urgente, ma in una riscrittura si partirebbe da Hono.

**Cosa mantenere**: Il pattern di routing con file separati per dominio. Il middleware di auth basato su session cookie.

---

### 11.2 Separare il ThinkCentre in un microservizio con SLA definito

**Motivazione**: Attualmente il ThinkCentre è un single point of failure. In una riscrittura, si separerebbe in un'interfaccia con SLA esplicito: se il TC è giù, il sistema entra in modalità degradata definita (no AI, no routing curvy) senza impatto sull'autenticazione e matching base.

**Cosa mantenere**: L'idea di AI self-hosted per privacy. Il pattern di proxy via Cloudflare Tunnel.

---

### 11.3 Migration management con un tool standard (es. Flyway)

**Motivazione**: Il custom runner in `server/migrate.ts` funziona ma ha edge case (prefissi duplicati bloccano tutto, idempotenza manuale, nessun rollback). Flyway o golang-migrate hanno queste feature built-in.

**Cosa mantenere**: La struttura di file `.sql` numerati è universalmente portabile e sarebbe compatibile con Flyway.

---

### 11.4 Database connection pooling separato (PgBouncer o Neon serverless)

**Motivazione**: Il pool max=10 è un limite architetturale che richiede `withBgDbSlot`, `pool.connect()` banned, e budget manuale delle connessioni. PgBouncer managed (già disponibile su Neon) permetterebbe centinaia di connessioni logiche con 10-20 connessioni fisiche verso Postgres.

**Cosa mantenere**: La logica di `withBgDbSlot` come pattern per i job background (indipendentemente dal limite fisico, è una buona pratica).

---

### 11.5 Monorepo più strutturato (Turborepo)

**Motivazione**: La struttura attuale (BikerLink app + Bowie Terminal nested + server + shared) è gestita con path alias e script manuali. Un monorepo Turborepo con workspace npm gestirebbe meglio le build parallele, le dipendenze condivise, e le build incrementali.

**Cosa mantenere**: La directory `shared/db/` come pacchetto condiviso client↔server.

---

### 11.6 Separare AI coordinator in un servizio dedicato

**Motivazione**: Il Layer AI Coordinato (coordinator, watchdog, Horus, Bowie) è accoppiato all'Express server. Un servizio separato con API propria permetterebbe scaling indipendente e restart senza impatto sull'API utente.

**Cosa mantenere**: Il pattern di event bus con Redis pub/sub. La governance con pause/resume per AI individuale.

---

### 11.7 Push notification pipeline con servizio dedicato

**Motivazione**: Le notifiche push sono attualmente gestite dall'Express server con dipendenza da Expo Notifications. Un servizio dedicato (es. notifiche via queue BullMQ separate) permetterebbe retry, prioritizzazione, e monitoring più granulare.

**Cosa mantenere**: Il sistema per-device push con token gestiti per utente. Il pattern di quick-reply iOS con category notification.

---

### 11.8 OTA management più robusto

**Motivazione**: Il processo OTA attuale dipende da EAS CLI con workaround complessi (git lock, package-lock URL rewrite, git worktree per EMCY). In una riscrittura si integrerebbe un processo OTA più automatizzato con CI/CD (GitHub Actions).

**Cosa mantenere**: Il concetto di "high-water mark" anti-regressione. Il canale `diagnostic` separato.

---

### 11.9 Routing engine selection più flessibile

**Motivazione**: La logica di selezione dell'engine (GH vs Valhalla, multi-area vs singolo) è distribuita in più file. In una riscrittura si centralizzerebbe in un config-driven router factory.

**Cosa mantenere**: La distinzione tra profili (car, foot, bike, auto_panoramica). Il kill-switch a livello env. Il fallback graceful.

---

### 11.10 Rimuovere i file "LOCKED" tramite refactoring pianificato

**Motivazione**: 8 file nella fascia 650-950 righe sono congelati con companion path. Questo frammenta la logica. In una riscrittura si spezzerebbero in moduli coesi più piccoli (50-200 righe ciascuno) seguendo il principio di singola responsabilità.

---

### 11.11 Test coverage con e2e reali

**Motivazione**: Attualmente non c'è Playwright o e2e su device reale. I test si limitano a react-test-renderer e unit test. In una riscrittura si includerebbe Detox per e2e mobile e Playwright per admin web.

---

## SEZIONE 12 — LE 50 COSE PIÙ IMPORTANTI DA SAPERE

Se il repository sparisse domani, questa sezione dovrebbe permettere di ricrearlo con le scelte corrette.

---

**1. BikerLink è un'app mobile (Expo SDK 56) + backend Express** per connettere motociclisti italiani (biker) e passeggere (zavorrine). Tagline: "U'll never ride alone". Target: Italia + futuro Europa/Nord Africa.

**2. Il ThinkCentre è il cuore dell'infrastruttura** — un mini-PC di casa che ospita Ollama (AI), GraphHopper (routing), Valhalla (routing scenic), Photon (geocoding), Whisper (trascrizione), DragonflyDB. Esposto via Cloudflare Tunnel a `tc.biker-link.net`.

**3. La porta 5000 è sacra** — il backend Express gira su 5000. La porta 8081 è Metro/probe. Invertirle rompe tutto. `.replit [deployment] run` deve sempre avere `PORT=5000`.

**4. Il pool DB ha max=10 connessioni fisso** — non si ingrandisce mai. Job background: massimo 3 slot via `withBgDbSlot` (RE-ENTRANT con ALS). Mai `pool.connect()` diretto. Mai `Promise.all` di query pesanti.

**5. Le migration girano al boot, non al deploy** — `server/migrate.ts` applica i file `migrations/*.sql` numerati. Un prefisso duplicato blocca TUTTO (dev + prod) fino a risoluzione.

**6. L'indice HNSW non va nelle migration** — Replit genererebbe un diff errato. L'indice viene creato da `boot-sequence.ts` al primo boot. La tabella `embeddings` è nella exclusion list di `drizzle.config.ts`.

**7. `routing_area_mode` DEVE essere 'enabled'** — se mancante, il codice cade sul path legacy GraphHopper che ritorna 404 su tutto.

**8. GraphHopper è multi-area** — root `/info` e `/route` ritornano 404. Ogni area risponde su `/areas/<code>/info`. `PointNotFoundException` = motore vivo, non crash.

**9. L'AI fallback è OFF di default** — `ai_fallback_enabled = false` significa solo ThinkCentre. Se TC è giù, le feature AI degradano visibilmente (503). Non cambiare il default senza consenso.

**10. Ollama DEVE essere chiamato via ShellExec+curl con streaming** — CodeExecution/fetch viene tagliato da Cloudflare dopo 100s. Horus (qwen3:4b) può richiedere 45-60s solo per il thinking.

**11. Il roster.ts vince sempre sui tool** — se una frase trigghera sia il roster (handoff persona) che un tool, vince il roster. Tenere le regex del roster e gli esempi dei tool sempre distinti.

**12. `generateObject({ schema })` diretto crasha in produzione** — su Groq con llama-3.x. Sempre `generateStructured(resolvedModel, { schema, prompt })` dal gateway `provider.ts`.

**13. MAI splittare un file senza approvazione esplicita** — il gate ratchet che fallisce è il segnale di fermarsi e segnalare, non di procedere con lo split.

**14. MAI publicare OTA a fine task** — è un'operazione separata che richiede istruzione esplicita. Un'OTA con codice incompleto è difficile da rollbackare.

**15. Il boot ha 5 fasi ordinate** — 1: HTTP Listen, 2: Migrations (FATAL), 3: DB Init (FATAL), 4: Seed+Engine (FATAL), 5: Schedulers (post-READY, non fatale). L'ordine NON è modificabile.

**16. Post-READY: mai process.exit()** — `markDegraded()` invece. Il server sta servendo traffico — un exit causa crash loop.

**17. `app/(tabs)/_layout.tsx` non si splitta mai** — ha marker `@no-split`. Lo split storico ha causato il crash loop OTA "Maximum update depth exceeded".

**18. Oggetti inline in React Navigation causano loop** — ogni oggetto creato inline (`{{ title: 'foo' }}`) crea nuovo ref ad ogni render → cascade setOptions → crash. Sempre costanti module-level.

**19. `router` non va nelle deps di useEffect che naviga** — `routerRef + didRedirectRef` è il pattern corretto.

**20. Sentry con `integrations: []`** — `@sentry/react-native` 8.x con default integrations causa loop React Navigation al boot su Android.

**21. Agenti AI — gerarchia e modelli**:
- Bowie: qwen3:1.7b (assistente utente, chat)
- Horus: qwen3:4b (watchdog, routing-correctness, proposte task)
- Nadir: all-minilm (embedding, ricerca semantica — NON genera testo)
- Ares: devstral (analisi codice pesante, 14GB, cold-load 55-170s, on-demand)
- Quebracho: RIMOSSO (assorbito in Horus, Task #591)

**22. DragonflyDB non è Redis** — flag Redis-only crashano. BullMQ richiede `cluster_mode=emulated` + `allow-undeclared-keys`. `TC_REDIS_URL` (non `REDIS_URL`).

**23. package-lock.json dopo npm install** — Replit riscrive le URL con `package-firewall.replit.local`. EAS crasha. Fix obbligatorio: `sed -i 's|http://package-firewall...` (automatizzato in post-merge.sh).

**24. `drizzle.config.ts` exclusion list è critica** — rimuovere tabelle dalla lista può causare DROP errati in prod durante il publish. Le tabelle PostGIS, HNSW, GIN expression index sono escluse per ragioni precise.

**25. `AppSetting valueJson` vs `value`** — `upsertAppSetting(key, value?)` scrive TEXT. Il watchdog legge `valueJson` (JSONB). Per JSON strutturato: sempre terzo argomento `upsertAppSetting(key, undefined, jsonObj)`.

**26. La boot sequence è thunk-based** — `[name, () => seed()]` non `[name, seed()]`. Le promise eager causano unhandledRejection se una rejecta mentre il loop è ancora su un'altra.

**27. Il Repl layer ha un limite ~2GB** — `.git/` (3.4GB), `.local/state/replit/` (transcript agente), `exports/`, `attached_assets/` gonfiano il layer. `deploy-build.sh` li pulisce. MAI toccare `.cache/`.

**28. Secret vs env** — `EXPO_PUBLIC_*` sono env pubbliche (inlined nel bundle). URL servizi server-only sono secrets. Cambiare un secret esistente richiede cold boot. Un secret nuovo entra subito. Non si possono cancellare programmaticamente.

**29. oxlint a --max-warnings=0** — zero warning ammessi. `// oxlint-disable-next-line react-hooks/exhaustive-deps` va sulla riga immediatamente sopra `}, [deps]);`, mai altrove.

**30. Sanitize order invariante** — `matchesSensitive(rawText)` PRIMA di `redactPII(text)`. Invertire può far trapelare frammenti di secret.

**31. Mappe Leaflet, mai Google Maps** — Google Maps richiederebbe billing e licenza commerciale. "Mappa nera" = residuo codice con API key Google finta.

**32. Telemetria per distanza, non a timer** — upload ogni 5km. Marker avanza solo su flush ok. `useTelemetry` è una macchina pura con source unica.

**33. Expo SDK 56 — niente moduli nativi via OTA** — una dipendenza nativa aggiunta dopo la build APK non arriva via OTA. `requireOptionalNativeModule` e degrada gracefully.

**34. `withSchedulerRetry` avvolge solo discovery, mai il loop mutante** — un retry del loop mutante farebbe doppio-write.

**35. Alert all-clear latchato a alert reale** — se un problema era soppresso (ThinkCentre spento), l'all-clear non deve essere inviato.

**36. Ollama su Horus: `think: false` + strip `</think>`** — qwen3:4b in non-streaming lascia content vuoto senza `think: false`. Strippa i tag orfani.

**37. Valhalla porta 8002, ingress 8003 rotto** — Il dashboard CF mostra 8003 ma Valhalla ascolta 8002. Si usa il proxy via thinkcentre-agent, non l'ingress diretto.

**38. La catena cloud è Groq → Gemini → OpenAI** — Anthropic rimosso (costo). Ogni chiamata cloud passa per lo scheduler RPM (Bottleneck).

**39. Nadir produce 384 dimensioni, proiettate a 1536** — 4× concatenazione + L2-norm. Il tag nel DB è `'local:Xenova/multilingual-e5-small'`. Aggiornare la whitelist db-integrity se si cambia modello.

**40. `storage↔embeddings` è un ciclo di import** — risolto con lazy `await import`. Non ripristinare import diretto.

**41. Build grafi GraphHopper: root, stop Ollama, MMAP** — sempre come root, stoppa Ollama (~18GB), usa MMAP non RAM_STORE per PBF > 5GB.

**42. TC SSH host ha prefisso https://** — strippare sempre prima di usarlo come hostname.

**43. BikerBlog è il repo gemello** — sviluppo agenti AI è avvenuto lì durante downtime BikerLink. Copia locale read-only in `.bikerblog-ref/`. Il TC può avere `~/bikerlink` centinaia di commit indietro.

**44. Il migration runner fa parte del boot (Phase 2), non del deploy** — in Phase 2 vengono applicate TUTTE le migration pending. Phase 2 è FATAL: se fallisce, process.exit(1).

**45. EAS CLI ≥ 21.0.0** — `^20.x` usa tar@7.5.7 bloccato da CVE policy Replit Security. Sempre `^21.0.0`.

**46. Cerbero non restarta su 503** — 503 da `/api/health` = server in boot (vivo). Cerbero restarta solo su timeout totale. `booting | ready | degraded` sono gli unici status accettati.

**47. Il coordinator Layer AI ha 6 AI fisse** — moderation, watchdog, ota-orchestrator, db-integrity, app-integrity, console. La griglia è fissa. Aggiungere una settima AI richiede update dell'UI.

**48. `information_schema.columns` è lento** — con 148+ tabelle, N query sequenziali → timeout 30s. Usare `pg_catalog` in 1 query + cache 10 minuti.

**49. Il matching engine usa lock distribuito DragonflyDB** — lock orfani al boot vengono puliti se scaduti o owned da PID morto. `withSchedulerRetry` avvolge solo l'acquisizione.

**50. La conoscenza implicita è in `.agents/memory/`** — il file `MEMORY.md` è l'indice. I topic file contengono i dettagli. Questa è la fonte più densa di conoscenza non-deducibile dal codice. Leggere SEMPRE prima di lavorare su aree critiche.

---

## APPENDICE — Quick Reference

### Comandi di verifica più usati

```bash
# Typecheck (NON dai log workflow — sono stantii)
npx tsc --noEmit -p tsconfig.client.json
npx tsc --noEmit -p server/tsconfig.json

# Lint (zero warning)
npm run lint -- --max-warnings=0

# Migration drift
npx tsx server/scripts/check-schema-migration-drift.ts

# Migration prefix duplicati
npx tsx server/scripts/check-migration-prefix-duplicates.ts

# File grandi (diagnostica)
npx tsx scripts/check-large-files.ts

# Gate deploy
bash scripts/check-deploy-build-step-numbers.sh
npx tsx scripts/check-index-drift.ts --static-only
npx tsx scripts/lint-migration-indexes.ts --all

# Package audit (dopo npm install)
npx tsx scripts/audit-package-updates.ts

# Fix package-lock URL (dopo npm install)
sed -i 's|http://package-firewall\.replit\.local/npm/|https://registry.npmjs.org/|g' package-lock.json

# Secrets scan
bash scripts/ci-secrets-scan.sh

# Check AI generateObject diretto
bash scripts/check-ai-direct-generateobject.sh
```

### Porte

| Servizio | Porta locale | Porta esterna |
|---------|-------------|--------------|
| Express (API) | 5000 | 80 |
| Metro/probe | 8081 | 8081 |
| Valhalla TC | 8002 | — (via agent) |
| DragonflyDB TC | 6380 | — (TCP bridge) |
| Ollama TC | 11434 | — (via CF tunnel) |
| Photon TC | 2322 | — (via agent) |

### Agenti AI — endpoint e modelli

| Agente | Env URL | Env Model | Modello |
|--------|---------|-----------|---------|
| Bowie | `BOWIE_OLLAMA_URL` | `BOWIE_OLLAMA_MODEL` | qwen3:1.7b |
| Horus | `HORUS_OLLAMA_URL` | `HORUS_OLLAMA_MODEL` | qwen3:4b |
| Ares | `ARES_OLLAMA_URL` | `ARES_OLLAMA_MODEL` | devstral:latest |
| Nadir | (usa Bowie/Horus URL) | — | all-minilm |
| Groq | `GROQ_API_KEY` | — | llama-3.x (attenzione: json_schema non supportato) |
| Gemini | `GEMINI_API_KEY` | — | gemini-pro |
| OpenAI | `OPENAI_API_KEY` | — | gpt-4o |

### File di configurazione critici

| File | Scopo |
|------|-------|
| `drizzle.config.ts` | Config schema Drizzle + exclusion list |
| `eas.json` | Config build EAS + OTA channels |
| `app.json` | Version code, runtime version, SDK |
| `.replit` | Port mapping, deployment run command |
| `.oxlintrc.json` | Config lint rules |
| `.large-files-baseline` | Baseline ratchet file grandi |
| `.large-files-allow.txt` | File autorizzati a LARGE-FILE-ALLOW |
| `scripts/deploy-build.sh` | Build script deploy (NON splittare) |
| `scripts/post-merge.sh` | Post-merge automation |

### ThinkCentre — servizi e stato

```
tc.biker-link.net/         → thinkcentre-agent (Node.js)
tc.biker-link.net/areas/   → GraphHopper multi-area
tc.biker-link.net/valhalla → Valhalla (profili speciali)
tc.biker-link.net/photon   → Geocoding Photon
tc.biker-link.net/whisper  → Trascrizione Whisper
tc.biker-link.net/ai-hub   → AI Hub (VRAM routes, model map)

Ollama: localhost:11434 (bind 127.0.0.1 — NON esposto direttamente)
DragonflyDB: localhost:6380 (accesso via TC_REDIS_URL o cloudflared TCP bridge)
```

---

*Fine della AI Knowledge Base di BikerLink. Documento generato in Luglio 2026.*
*Per aggiornamenti: modificare il file corrispondente alla sezione rilevante.*
*Per la conoscenza emergente da task futuri: aggiornare `.agents/memory/MEMORY.md` e topic files.*
