# BikerLink — Contesto per Agenti AI (CLAUDE.md)

> Questo file è la fonte di verità sintetica per qualsiasi agente AI (Cline, Claude, ecc.) che lavora su BikerLink.
> Contiene architettura, stack, invarianti critiche e puntatori ai file chiave.
> Aggiornalo quando cambiano decisioni architetturali rilevanti.

---

## 1. Cos'è BikerLink

App mobile + backend per connettere motociclisti ("biker") e passeggere ("zavorrine") in Italia (futuro: Europa/Nord Africa). Tagline: *"U'll never ride alone"*. Features principali: mappa interattiva riders, matching, percorsi moto curvy, chat AI (Bowie), community.

**BikerBlog** (`https://github.com/Andreamasteri/bikerblog`) è il repo gemello — sviluppo agenti AI e pipeline avvenuto lì durante downtime BikerLink. Copia locale read-only in `.bikerblog-ref/` (aggiornabile con `bash scripts/refresh-bikerblog.sh`).

---

## 2. Stack Tecnologico

| Layer | Tecnologia |
|-------|-----------|
| Mobile | Expo SDK 56, React Native, Expo Router (file-based), React Query |
| Backend | Express + TypeScript, Node.js (porta **5000** in prod) |
| Database | PostgreSQL + PGVector, Drizzle ORM |
| Migrazioni | Custom runner a boot (`server/migrate.ts`) — **NON** Replit schema-diff |
| Code Queue | BullMQ su DragonflyDB (Redis-compat) |
| AI — locale | Ollama su ThinkCentre (Bowie, Horus, Nadir, Ares, Quebracho) |
| AI — cloud | Groq → Gemini → OpenAI (chain; Anthropic rimosso) |
| Mappe | Leaflet/MapLibre via WebView + OSM tiles (**no Google Maps**) |
| Routing moto | GraphHopper (multi-area) + Valhalla su ThinkCentre |
| Geocoding | Photon self-hosted su ThinkCentre (ha sostituito Nominatim) |
| Storage oggetti | Object storage Replit (due bucket, migrazione completata) |
| Monitoring | Sentry EU, Pino, watchdog interno |
| Build mobile | EAS Build (`eas.json`) + OTA via Expo Updates |
| Lint | **oxlint** (no ESLint/typescript-eslint); gate `--max-warnings=0` |
| Typecheck | `npx tsc --noEmit` — gli snapshot `/tmp/logs` sono stantii |

---

## 3. Struttura Directory

```
app/                  # App mobile Expo (file-based routing)
  (tabs)/             # Tab principali (home, mappa, match, chat…)
  (auth)/             # Login / registrazione
  admin/              # Pannelli admin
  moderator/          # Pannelli moderatore
  giro/ routes/       # Gestione percorsi
  chat/               # Chat + AI Assistant
server/               # Backend Express
  ai/                 # Infrastruttura AI (coordinator, watchdog, agenti)
  routes/             # API REST
  services/           # Servizi (email, backup, telemetria…)
  jobs/               # Worker BullMQ schedulati
  routing/            # Integrazione GraphHopper/Valhalla
  db.ts               # Pool Postgres (max 10 conn FISSO)
  storage.ts          # Object storage
  migrate.ts          # Migration runner custom (boot-gated)
shared/               # Tipi e logica condivisi client↔server
  db/                 # Schema Drizzle
thinkcentre-agent/    # Agente Node.js sul ThinkCentre (monitoraggio servizi)
thinkcentre-scripts/  # Script installazione/build Valhalla + GH sul TC
migrations/           # File *.sql — runner custom al boot
scripts/              # Script CI, gate, build, OTA
components/           # Componenti React Native condivisi
bowie-terminal/       # App Expo separata (nested) — build EAS indipendente
.agents/              # Skills, memoria persistente agenti
  memory/             # MEMORY.md + topic files (invarianti non-derivabili)
  skills/             # Skill specializzate per task specifici
.local/               # Tasks panel Replit, stato agente locale
```

---

## 4. Agenti AI — Ecosistema

| Nome | Modello | Ruolo | Endpoint |
|------|---------|-------|---------|
| **Bowie** | qwen3:1.7b (TC) | Assistente utente (chat, supporto) | ThinkCentre Ollama |
| **Horus** | qwen3:4b (TC) | Watchdog, diagnostica, routing-correctness, proposte task | ThinkCentre Ollama |
| **Nadir** | embedding multilingual-e5-small | Indicizzazione manuale utente, semantic search | ThinkCentre + pgvector |
| **Ares** | devstral (PC fisico, LAN-only) | Analisi codice long-running, job pesanti | ProxyJump via TC |
| Coordinator | — (orchestratore) | Escalation, pause/resume, policy governance | In-process server |

**Chiamare Horus/Ollama**: sempre via `ShellExec + curl` con `stream:true`. **MAI** `CodeExecution/fetch` (Cloudflare taglia a 100s senza stream). Header obbligatori: `CF-Access-Client-Id`, `CF-Access-Client-Secret`, `Authorization: Bearer $HORUS_OLLAMA_TOKEN`.

**AI fallback master switch**: `ai_fallback_enabled` (default OFF = solo ThinkCentre). Ogni chiamata AI passa da `runWithFallback` in `server/ai/moderation/provider.ts`.

**Chain cloud**: Groq → Gemini → OpenAI → Ollama fallback. Ogni chiamata cloud deve passare dallo scheduler RPM (Bottleneck) — mai chiamare direttamente i provider.

---

## 5. ThinkCentre — Server di Casa

Mini-PC locale che ospita: GraphHopper multi-area, Valhalla, Ollama (Bowie/Horus/Nadir/Quebracho), Photon, Whisper, DragonflyDB.

**Accesso SSH**: credenziali in env — `TC_SSH_HOST` / `TC_SSH_USER` / `TC_SSH_PASSWORD` / `TC_SSH_PORT`. Il `TC_SSH_HOST` ha prefisso `https://` da strippare. Usare skill `thinkcentre-access` o `tc.py`.

**Esposizione reale**: via Cloudflare Tunnel (`tc.biker-link.net`). Nginx legacy/disabled. Ollama bind solo `127.0.0.1`. Valhalla ascolta porta 8002, ingress 8003 è rotto sul dashboard CF.

**GraphHopper**: multi-area ONLY — root `/info` + `/route` ritornano 404. Ogni area risponde su `/areas/<code>/info`. `routing_area_mode` in `app_settings` DEVE essere `'enabled'`.

**Build grafi ("grafa")**: eseguire come root, stoppare Ollama (~18GB), override `SWAP_FILE`/`BACKUP_DIR`, usare MMAP non RAM_STORE per PBF > 5GB.

---

## 6. Database

- Pool max **10 connessioni fisso** (DB managed Replit). Non si ingrandisce.
- Job background: max 3 slot via `withBgDbSlot` (RE-ENTRANT via ALS). Mai `Promise.all` di query DB in background.
- Migrazioni: `migrations/*.sql` girano al boot via `server/migrate.ts`. Un prefisso duplicato blocca l'intero batch. Gate: prefisso univoco obbligatorio.
- Schema HNSW index: **NON** nelle migration (Replit genererebbe diff errato in prod). Creato al primo boot.
- Check prod (read-only): `executeSql({ environment: "production" })` — mai connection string diretta.
- `pg_stat_user_tables` può essere stantio — verificare con `pg_catalog` o query dirette.

---

## 7. OTA e Deploy

### Porte — CRITICO
- Backend Express: **porta 5000** (localPort=5000, externalPort=80). NON cambiare.
- Metro/Expo probe: porta 8081.
- `.replit [deployment] run` DEVE avere `PORT=5000` — altrimenti l'healthcheck fallisce e il deploy abortisce.

### Regola OTA ferrea
**I task NON devono mai includere la pubblicazione di una OTA.** La pubblicazione OTA è operazione separata, solo su istruzione diretta e esplicita dell'utente. Scrivere `.ota-message` PRIMA di lanciare il workflow "OTA Publish". MAI lanciare via shell detached (`setsid`).

### Repl Layer Size
`.local/state/replit/` cresce nel tempo → supera 2GB → deploy Cloud Run fallisce silenziosamente. Il deploy-build.sh pulisce le dir pesanti. **MAI** toccare `.cache/` (file read-only di altro utente → `set -e` fa fallire la build).

### EAS / package-lock
Dopo ogni `npm install` in Replit, le URL `resolved` diventano `package-firewall.replit.local` → EAS crasha. Fix obbligatorio:
```bash
sed -i 's|http://package-firewall\.replit\.local/npm/|https://registry.npmjs.org/|g' package-lock.json
```

### OTA Emergency (EMCY)
Pipeline parallela via flag `ota_emergency_active`. Pubblica da git worktree isolato. `/tmp` e workspace sono FS separati (usare tar-pipe, non rsync). Comando: `eas update --environment production`.

---

## 8. Regole Gate e CI

### Limite 800 righe per file — BLOCCO TOTALE
**⛔ Nessun agente può splittare un file senza approvazione esplicita dell'utente.** Anche se il gate fallisce. Anche se è "ovvio". Il gate che fallisce = fermarsi e segnalare, NON procedere con lo split.

Quando un file supera 800 righe e l'utente approva lo split: file risultanti ≤ **750 righe** (headroom da 50 righe). Suffisso pattern: `foo.ts` → `foo-extra.ts`.

### File LOCKED (8 file, fascia 650–950 righe)
Congelati con header `LARGE-FILE-LOCKED`. Il codice nuovo va nel companion path dichiarato nell'header, non nel file locked.

| File | Companion |
|------|-----------|
| `server/motion-simulator.ts` | `server/motion-simulator-extra.ts` |
| `components/admin/ota/OtaPanel.tsx` | `components/admin/ota/OtaPanelExtra.tsx` |
| `server/routes/admin/users.ts` | `server/routes/admin/users-extra.ts` |
| `app/admin/stregatti.tsx` | `app/admin/stregatti-extra.tsx` |
| `app/(tabs)/match.tsx` | `app/(tabs)/match-extra.tsx` |
| `server/routes/client-settings.ts` | `server/routes/client-settings-extra.ts` |
| `app/proposals/create.tsx` | `app/proposals/create-extra.tsx` |
| `shared/db/matching.ts` | `shared/db/matching-extra.ts` |

### Gate pre-commit (nell'ordine)
1. `detect-secrets` — blocca token/segreti non approvati
2. `check-large-files-ratchet.sh` — ratchet 800 righe
3. `lint-migration-indexes.ts` — indici DESC/WHERE a rischio
4. `check-ai-direct-generateobject.sh` — bypass `generateStructured` rilevato

Installa hook: `bash scripts/setup-hooks.sh`

### Lint
**oxlint** (no ESLint). Gate: `npm run lint -- --max-warnings=0`. Per silenziare `exhaustive-deps` legittimo: `// oxlint-disable-next-line react-hooks/exhaustive-deps` posizionato **direttamente sopra `}, [deps]);`** (non sopra la dichiarazione dell'hook).

### generateObject — VIETATO direttamente
Qualsiasi `generateObject({ schema: … })` fuori da `server/ai/moderation/provider.ts` crasha in produzione su llama-3.x (Groq). Usare sempre `generateStructured(resolvedModel, { schema, prompt })`.

---

## 9. React Native — Anti-pattern Critici

### Loop "Maximum update depth exceeded"
**Mai oggetti/funzioni inline** in `screenOptions`, `options`, o prop di navigazione di React Navigation. Ogni oggetto inline crea un nuovo ref a ogni render → loop infinito.
Fix: `useMemo` (se dipende da hook) o costante module-level (se statica).

### `router` in deps di `useEffect`
`router` in deps di `useEffect` che chiama `router.replace/push` → loop infinito. Fix: `routerRef` + `didRedirectRef`.

### Boot-loop hydration
Causa: redirect ottimistico a `/(tabs)` con `user=undefined`. Fix: seed cache auth PRIMA di abilitare la query, mai redirect in `authIsLoading`.

### Android touch con Animated
`useSharedValue + useAnimatedStyle` (Reanimated) NON aggiorna la hitbox touch su Android. Per widget touch che cambiano posizione: usare `RN Animated.Value`.

### Sentry integrations
`@sentry/react-native` 8.x: usare sempre `integrations: []` — le default causano loop React Navigation.

### app/(tabs)/ — niente file helper
File `*.styles.ts` o helper dentro `app/(tabs)/` diventano tab-route. Tenerli in `components/`.

---

## 10. Pattern AI e Generazione Testo

### Schema Zod per generateObject (OpenAI/Groq strict)
Usare `.nullable()` non `.optional()`. Niente object catchall/record (`additionalProperties` deve essere `false`).

### Lingua delle risposte AI visibili
Ogni turno AI visibile all'utente (chat 1:1, gruppo, quick-reply notifiche) deve applicare la lingua dell'utente al prompt (default IT). Comunicazioni interne tra agenti: non vincolate.

### Ollama think behavior
`qwen3:4b` non-streaming: `think: false` + strip orphan `</think>`. Streaming: `think: true` → fullStream. Latenza cold: 45–60s. Timeout Ares (devstral): ≥ 170s.

### sanitize — ordine obbligatorio
`matchesSensitive` (secret) sul testo GREZZO prima di `redactPII`. Invertirli può spezzare un token e far trapelare frammenti di secret.

---

## 11. Convenzioni Task e Plan File

Ogni plan file `.local/tasks/<slug>.md` DEVE iniziare con:

```
# Titolo Task (3-6 parole)

## ⚙️ Esecuzione Agente
- Modello: Light | Economy | Power
- App Testing: ON | OFF
- Motivo: <una frase>

## Modalità di esecuzione consigliata
**Main agent** | **Background (task agent isolato)**
Motivi: ...
```

**Modelli**: Light = 1 file isolato · Economy = 1–3 file · Power = multi-file, infrastruttura, ragionamento.
**App Testing ON** se tocca UI interattiva, navigazione, modali, admin panel, OTA.
**Main agent** se tocca DB prod, secret, deploy, richiede conferma utente o tool Replit interattivi.
**Background** se feature isolata multi-file, niente dipendenze da prod o log live.

---

## 12. Invarianti Operative Critiche

### Pool DB
- `withBgDbSlot` obbligatorio per tutti i job background (RE-ENTRANT via ALS)
- Mai `pool.connect()` diretto (satura → API timeout)
- `withSchedulerRetry` avvolge SOLO l'acquisizione iniziale, MAI il loop mutante

### Scheduler / Watchdog
- Ogni tick emette heartbeat (anche skip)
- `cycleInFlight` si resetta dopo >10min
- Proposer AI ha cooldown 30min — altrimenti brucia Groq quota
- Alert "all-clear" deve essere latchato a un alert reale precedente (non suppresso)

### Boot sequence
- Operazioni di boot: non-fatali, thunk (no promise eager), backoff `Atomics.wait` su crash-loop
- Boot bloccato da `spatial_ref_sys` ALTER TABLE: è bug Replit, non fixabile lato nostro
- Post-READY: mai `process.exit()` — causa crash-loop; usare `markDegraded()`

### Secret management
- Cambiare il VALORE di un secret esistente → richiede cold boot/deploy/merge
- Un secret NUOVO entra subito
- Nessuna callback per cancellare secret — solo l'utente dal pannello
- `EXPO_PUBLIC_*` restano env (inlined nel client); URL servizi server-only → secrets

### Merge / node_modules
- `scripts/post-merge.sh` esegue `npm install --no-audit --no-fund` come primo step
- Usare sempre `installLanguagePackages` (packager tool), mai `npm install` diretto via bash
- `package.json` + `package-lock.json` devono essere committati nel merge

### DragonflyDB (Redis-compat)
- Flag Redis-only crashano Dragonfly → usare `--snapshot_cron` + `--maxmemory ≥1gb`
- BullMQ richiede `cluster_mode=emulated` + `allow-undeclared-keys`
- `TC_REDIS_URL` è DragonflyDB via ThinkCentre (non Upstash/`REDIS_URL`)

---

## 13. File Chiave — Dove Trovare Cosa

| Cosa | File |
|------|------|
| Entry point server | `server/index.ts` |
| Routes API | `server/routes.ts` |
| Schema DB (Drizzle) | `shared/db/schema.ts` (e file companion) |
| Migration runner | `server/migrate.ts`, `migrations/*.sql` |
| Pool DB | `server/db.ts` |
| AI coordinator | `server/ai/coordinator.ts` |
| AI provider chain | `server/ai/moderation/provider.ts` |
| Watchdog | `server/ai/watchdog/` |
| Bowie (chat) | `server/ai/assistant/` |
| Horus (watchdog) | `server/ai/horus/` |
| Routing GH/Valhalla | `server/routing/` |
| OTA publish pipeline | `scripts/publish-ota.sh`, workflow "OTA Publish" |
| Boot sequence | `server/boot-sequence.ts` (e `boot-phase*.ts`) |
| Root layout mobile | `app/_layout.tsx` |
| Tab layout | `app/(tabs)/_layout.tsx` (marker @no-split) |
| Auth context | `contexts/AuthContext.tsx` |
| Lint config | `.oxlintrc.json` |
| Large files gate | `scripts/check-large-files-ratchet.sh` |
| Post-merge script | `scripts/post-merge.sh` |
| Deploy config | `.replit` sezione `[deployment]` |
| EAS config | `eas.json` |
| Memoria agente | `.agents/memory/MEMORY.md` (+ topic files) |
| Skills specializzate | `.agents/skills/<nome>/SKILL.md` |

---

## 14. Cosa NON fare (Red Lines)

- ❌ Mai splittare un file senza approvazione esplicita utente
- ❌ Mai pubblicare OTA alla fine di un task (operazione separata)
- ❌ Mai `generateObject({ schema })` diretto fuori da `provider.ts`
- ❌ Mai oggetti/funzioni inline in prop di React Navigation
- ❌ Mai `router` in deps di `useEffect` che fa navigate
- ❌ Mai `process.exit()` post-boot (dopo READY)
- ❌ Mai `rm -rf .cache/` nel deploy (file read-only di altro utente)
- ❌ Mai usare `CodeExecution/fetch` per chiamare Horus/Ollama (usare `ShellExec + curl`)
- ❌ Mai `Promise.all` di query DB pesanti in job background
- ❌ Mai connection string diretta a prod DB (usare `executeSql({ environment: "production" })`)
- ❌ Mai file helper in `app/(tabs)/` (diventano tab-route)
- ❌ Mai alzare o rimuovere l'header `LARGE-FILE-LOCKED` da un file locked
- ❌ Mai `npm install` diretto via bash (usare packager tool)
- ❌ Mai `routing_area_mode` assente o `'disabled'` (GraphHopper legacy = 404)
- ❌ Mai Google Maps — tutte le mappe usano Leaflet/MapLibre + OSM
