# BikerLink

> ⛔ SPLIT VIETATO SENZA AUTORIZZAZIONE UTENTE ESPLICITA
> Prima di splittare qualsiasi file — per qualsiasi ragione, a qualsiasi dimensione —
> l'agente DEVE chiedere esplicita autorizzazione all'utente e attendere il via libera.
> Nessuna eccezione. Nemmeno se il gate ratchet fallisce. Nemmeno se è "meccanico".

## User preferences

- **Non splittare mai un file senza permesso esplicito.** Anche se il ratchet 800 righe segnala un file oltre soglia, NON eseguire lo split autonomamente: chiedere prima il permesso all'utente. Se l'utente vuole tenere il file intero, marcarlo con `LARGE-FILE-ALLOW` in `.large-files-allow.txt` invece di splittarlo.

## BikerBlog — repo gemello di riferimento

**BikerBlog** (`https://github.com/Andreamasteri/bikerblog`) è il progetto "costola" di
BikerLink: mentre BikerLink era down, lo sviluppo dell'ecosistema (agenti AI
Horus/Bowie/Nadir/Ares, AI-Hub, pipeline) è avvenuto lì. BikerLink deve poter
consultare **sempre** lo stato corrente di quel repo come riferimento per il lavoro di
allineamento/porting.

**Come rinfrescare la copia locale (read-only):**

```bash
bash scripts/refresh-bikerblog.sh          # clona (prima volta) o aggiorna alla HEAD
bash scripts/refresh-bikerblog.sh --status # stampa solo il commit corrente
```

- La copia vive in `.bikerblog-ref/` — **ignorata da git** (`.gitignore`), non finisce nel
  repo né gonfia il Repl layer del deploy.
- Lo script è idempotente: clone alla prima esecuzione, `fetch + reset --hard` le
  successive. Stampa sempre l'hash del commit aggiornato.
- **Auth**: usa il secret `BIKERBLOG_GITHUB_TOKEN` se presente (fallback robusto per repo
  privato / rate limit GitHub); altrimenti clone pubblico HTTPS (il repo è pubblico oggi).
  Il token non viene mai stampato in chat né nei log.
- Canale complementare di sincronizzazione continua: l'endpoint `/_internal/agent-briefing`
  di BikerBlog (`BIKERBLOG_BRIEFING_URL` + `BIKERBLOG_INTERNAL_TOKEN`) — vedi
  `docs/tc-access-secret-discovery.md`.

---

## ⛔ Regole OTA — Leggere Prima di Qualsiasi Lavoro

**I task NON devono mai includere la pubblicazione di una OTA.**

La pubblicazione OTA è un'operazione separata e dedicata, eseguita **solo su istruzione diretta e esplicita dell'utente** — mai come parte conclusiva di un task di sviluppo.

**Motivazione**: una OTA esportata a fine task può catturare commit incompleti, conflitti di merge, o codice provvisorio (es. OTA-20 esportata da stato incompleto). Il rischio di distribuire bundle rotti agli utenti Android è reale e difficile da rollbackare in produzione.

**Regola**: se un task include modifiche al codice e l'utente non ha esplicitamente detto "pubblica anche l'OTA" come istruzione separata, il task termina **senza** pubblicare alcuna OTA. L'agente deve proporre la pubblicazione OTA come follow-up distinto, non eseguirla autonomamente.

## Gate pre-commit — generateObject con schema diretto

Il check `scripts/check-ai-direct-generateobject.sh` rileva chiamate `generateObject({ schema: … })` fuori dal gateway approvato (`server/ai/moderation/provider.ts`). Queste chiamate crashano silenziosamente in produzione quando il modello risolve a llama-3.x su Groq (che non supporta `json_schema` nativo).

Il check è eseguito come gate **pre-commit** (e in `post-merge.sh`): il commit è bloccato se viene trovata una violazione.

### Installazione hook locale

```bash
bash scripts/setup-hooks.sh
```

Il pre-commit installa in `.git/hooks/pre-commit` e include questi gate nell'ordine:
1. `detect-secrets` — blocca token/segreti non approvati
2. `check-large-files-ratchet.sh` — ratchet 800 righe per file
3. `lint-migration-indexes.ts` — indici DESC/WHERE a rischio nelle migration
4. `check-ai-direct-generateobject.sh` — bypass `generateStructured` rilevato

### Soppressione (solo se il modello è verificato non-llama)

```ts
// check-ai-direct-generateobject: safe
const result = await generateObject({ schema, … });
```

### Fix standard

Sostituire `generateObject({ model, schema, prompt })` con `generateStructured(resolvedModel, { schema, prompt })` dove `resolvedModel` viene da `runWithFallback` in `server/ai/moderation/provider.ts`.

---

## Policy Lint CI — oxlint, Gate Obbligatorio a Zero Warning

Il progetto lint con **oxlint** (Rust-based), non più ESLint/`@typescript-eslint` (rimossi: oxlint non dipende dal pacchetto `typescript`, il che sblocca l'upgrade a TypeScript 7). La regola `react-hooks/exhaustive-deps` è impostata su **`"warn"`**, ma il gate CI gira a **`--max-warnings=0`**: qualunque nuovo warning (incluso `exhaustive-deps`) blocca il task, niente ratchet a soglia crescente.

### File chiave
- `.oxlintrc.json` — configurazione oxlint (porta le regole dell'ex `eslint.config.js`: typescript/react/unicorn/oxc plugin, `react-hooks/rules-of-hooks` error, `react-hooks/exhaustive-deps` warn, unused-vars, ecc.)
- `scripts/check-part-nav.mjs` — sostituisce la vecchia regola ESLint custom `no-part-nav.js` (oxlint non ha plugin custom JS maturi); chiude il gap dei template-literal multi-riga che il grep gate in `scripts/post-merge.sh` non vede.

### Gate CI registrato
Validation command `lint` (comando: `npm run lint -- --max-warnings=0`, che esegue `npx oxlint -c .oxlintrc.json .`) è registrato nella piattaforma Replit.

### Regole operative
1. **Zero warning al gate**: qualsiasi nuovo finding (anche `exhaustive-deps`) blocca il task — niente soglia di tolleranza.
2. **Per silenziare un caso legittimo e intenzionale**: usare `// oxlint-disable-next-line react-hooks/exhaustive-deps` con commento che spiega il motivo tecnico. Va posizionato sulla riga **immediatamente sopra l'array delle dipendenze** (`}, [deps]);`), non sopra la dichiarazione dell'hook né sopra la riga d'uso interna — oxlint attribuisce il warning lì.
3. **Violazioni `exhaustive-deps`** causano bug di stale closure e loop "Maximum update depth exceeded" in produzione — non aggiungerne di nuove senza verificare caso per caso se il dep mancante sia sicuro da aggiungere (vedi memoria `auth-context-react-query-deps.md`: dipendere da slice primitive, mai da oggetti React Query interi).

---

## ⛔ REGOLA FERREA — File LOCKED priorità media (Task "Lock dimensione file priorità media")

Otto file TS/TSX nella fascia 650–950 righe sono **congelati alla dimensione attuale** tramite header `LARGE-FILE-LOCKED` in cima al file. Sono grossi ma coesi: splittarli ora introdurrebbe rischio senza beneficio. Per evitarne la crescita, ogni file dichiara un **companion path** dedicato dove va il codice nuovo.

### Tabella file LOCKED

| File | Limite locked | Companion path |
|---|---:|---|
| `server/motion-simulator.ts` | 936 | `server/motion-simulator-extra.ts` |
| `components/admin/ota/OtaPanel.tsx` | 767 | `components/admin/ota/OtaPanelExtra.tsx` |
| `server/routes/admin/users.ts` | 728 | `server/routes/admin/users-extra.ts` |
| `app/admin/stregatti.tsx` | 726 | `app/admin/stregatti-extra.tsx` |
| `app/(tabs)/match.tsx` | 719 | `app/(tabs)/match-extra.tsx` |
| `server/routes/client-settings.ts` | 669 | `server/routes/client-settings-extra.ts` |
| `app/proposals/create.tsx` | 658 | `app/proposals/create-extra.tsx` |
| `shared/db/matching.ts` | 630 | `shared/db/matching-extra.ts` |

### Regola d'uso (non negoziabile)

**Quando aggiungi codice a uno di questi file, mettilo nel companion path indicato nell'header. Non crescere il file esistente.**

Quando il gate ratchet (Task #2584) è attivo e blocca un file LOCKED cresciuto, il messaggio d'errore è del tipo:

```
❌ server/motion-simulator.ts cresciuto a 937 righe (limite locked: 936).
   Sposta il codice nuovo in: server/motion-simulator-extra.ts
```

### Regole anti-bypass (vincolanti per ogni task futuro)

1. **Mai alzare il numero `<N>` dell'header LOCKED.** La baseline `<N>` può solo restare uguale o calare. Il ratchet rifiuta un `<N>` aumentato.
2. **Mai rimuovere l'header LOCKED.** Rimuoverlo riapplica il default 800 → il file scatta sopra soglia → blocco. Equivale a chiedere lo split, va fatto solo con task esplicito utente.
3. **Quando aggiungi codice a un file LOCKED, va nel companion path indicato nell'header.** Non in un altro file, non "appena 3 righe nel file esistente perché è più comodo".
4. **Il companion file, quando creato, eredita il limite default corrente (800, post-ratchet).** Non può nascere già LOCKED a una dimensione alta — deve crescere naturalmente. ⚠️ Nota: i companion già esistenti creati sotto la vecchia soglia 650 possono avere un limite inferiore a 800 — rispettare il limite dichiarato nell'header del file, non assumere sempre 800.
5. **Vietato creare companion "fake"** (file vuoto con `export {}` per silenziare warning). Il companion nasce solo quando ha contenuto reale da ospitare.
6. **Vietato cambiare il path companion suggerito** senza task esplicito utente. Il path è una convenzione vincolante.
7. **Vietato spostare gli 8 file LOCKED in `.large-files-allow.txt`** per silenziarli definitivamente. ALLOW è riservato a categorie strutturali (i18n, dataset, asset, test); i file LOCKED sono debito tecnico temporaneo.

---

## ⛔ REGOLA FERREA — Split di file: verifica prima e dopo (sempre)

Lo split è sempre un'operazione **meccanica**: nessuna logica alterata, solo spostata. Qualsiasi refactoring opportunistico (rinominazione simboli, riorganizzazione logica, semplificazione) durante uno split è vietato — va pianificato come task separato.

### Prima dello split — obbligatorio

1. **Leggere integralmente ogni file coinvolto** (sorgente e destinazione se già esiste). Non fare affidamento su letture precedenti o su ricordi della sessione.
2. **Verificare il conteggio righe reale** di ogni file con `wc -l` o lo strumento di lettura — non stimarlo.

### Esecuzione dello split — meccanica pura

- Spostare il codice **esattamente com'è**: nessuna modifica di logica, nessuna rinominazione di simboli, nessun refactoring inline.
- Aggiornare gli import/export strettamente necessari a far compilare i file separati — nulla di più.

### Dopo lo split — checklist obbligatoria (ogni file prodotto)

Rileggere ogni file risultante e verificare **tutti** i punti:

- [ ] Il contenuto corrisponde esattamente all'originale (nulla inventato, nulla perso).
- [ ] File sorgente ≤ 750 righe (split target; il gate blocca a 800).
- [ ] File destinazione ≤ 750 righe (split target; il gate blocca a 800).
- [ ] Import/export coerenti tra i file (nessun simbolo importato ma non esportato, nessun export orfano).

> **La regola vale sempre, anche per split "ovvi".** La verifica non è facoltativa e non può essere saltata per split "piccoli" o "semplici".

---

## Anti-pattern dell'agente — leggere prima di lavorare

1. **Gerarchia delle fonti di verità per le dipendenze native**: per dichiarare che una libreria nativa Android non è nell'APK, NON basta verificare `package.json` o gli `import` nel codice JS. Le dipendenze transitive di Expo (es. `expo-camera` tira ML Kit Barcode, `expo-notifications` tira Firebase Cloud Messaging) finiscono nell'APK senza apparire in `package.json`. La sola fonte di verità è il `.apk` compilato (o il gradle dependency tree).

2. **Verifica con metodo diverso dall'esecuzione**: se ho fatto un cambiamento guardando il file X, NON devo verificarlo riguardando il file X. Il bias di conferma fa rileggere la stessa fonte e confermare l'errore originale. Verifica = altro metodo (binario, dependency tree, comando di build, log reali).

3. **"Fatto" ≠ "credo di aver fatto"**: per task di rimozione/pulizia, "fatto" significa che esiste una prova oggettiva nell'output finale (binario, log, response API). Se la prova non c'è, dichiarare esplicitamente "applicato ma non verificato sul binario" — non "fatto".

## Convenzione plan file dei task — sezione "Modalità di esecuzione consigliata"

**Regola obbligatoria per ogni nuovo project task**: il plan file in `.local/tasks/<slug>.md` deve includere in fondo una sezione **`## Modalità di esecuzione consigliata`** con:

1. **Scelta esplicita**: `Main agent` oppure `Background (task agent isolato)`.
2. **Motivi**: 2-5 bullet che giustifichino la scelta in base ai criteri qui sotto.

**Terminologia:**
- **Main agent** = eseguito nella chat corrente, in foreground, con accesso a tutti i tool Replit (`viewEnvVars`, `listDeploymentBuilds`, `suggestDeploy`, `screenshot`, database prod, ecc.) e possibilità di interazione con l'utente a metà task.
- **Background (task agent isolato)** = eseguito in un ambiente separato e isolato, senza accesso ai tool Replit interattivi, senza DB di produzione, senza `suggestDeploy`. Il codice prodotto viene mergeato nel main al termine.

**Criteri di scelta:**

| Caso | Modalità consigliata |
|------|----------------------|
| Tocca DB di **produzione**, secret, deploy, OTA publish, o richiede conferma utente interattiva | **Main agent** |
| Richiede tool Replit interattivi (`listDeploymentBuilds`, `viewEnvVars`, `suggestDeploy`, `screenshot`) | **Main agent** |
| Richiede di osservare log/runtime dell'ambiente principale **subito dopo** la modifica | **Main agent** |
| Modifiche piccole (<200 righe, 1-2 file), debug puntuale, hotfix | **Main agent** |
| Feature isolata, multi-file (>5), niente dipendenze da prod o da log live | **Background** |
| Refactor ampi con boundary chiari, scritti per essere mergiati indipendentemente | **Background** |
| Più task indipendenti che possono girare in parallelo | **Background** (uno per task) |

**Razionale**: l'utente sceglie chi esegue il task (main agent o background) dopo che il task è proposto. Senza il suggerimento il rischio è scegliere il canale sbagliato — es. mandare in background un fix che richiede l'apply su DB prod (impossibile nella bolla isolata) o tenere sul main agent un refactor lungo che bloccherebbe la chat per ore.

**Esempio minimo — main agent:**
```markdown
## Modalità di esecuzione consigliata
**Main agent**.

Motivi:
- Tocca il DB di produzione (write via database skill con environment="production"), richiede conferma utente.
- Volume ridotto (1 script SQL + 1 nota docs).
- Necessita osservazione log deployment post-apply.
```

**Esempio minimo — background:**
```markdown
## Modalità di esecuzione consigliata
**Background (task agent isolato)**.

Motivi:
- Feature puramente frontend, 8 file nuovi, nessuna dipendenza da prod o log live.
- Può girare in parallelo ad altri task senza interferire.
- Nessun tool Replit interattivo richiesto.
```

## Regola task — blocco "Esecuzione Agente"

**Ogni plan file in `.local/tasks/*.md` deve avere come PRIMA sezione (subito dopo il titolo `#`) il blocco `## ⚙️ Esecuzione Agente`** che dichiara a monte modello agente e necessità di smoke test. Fonte di verità: skill `.agents/skills/task-execution-mode/SKILL.md` (auto-carica su trigger "crea task", "nuovo task", "pianifica", "project task", ecc.).

Formato compatto:
```markdown
## ⚙️ Esecuzione Agente
- Modello: Light | Economy | Power
- App Testing: ON | OFF
- Motivo: <una frase che giustifica entrambe le scelte>
```

Semantica sintetica: **Light** = modifica isolata in 1 file, niente logica · **Economy** = feature contenuta 1–3 file · **Power** = refactor multi-file, debug infrastruttura, ragionamento. **App Testing ON** se il task tocca anche solo un elemento di `auto-smoke-on-ui-change` (UI interattiva, navigazione, modali, publish OTA, admin panel); **OFF** se puro backend, script, doc, seed, stile puro senza handler. In dubbio: ON. Complementare a `auto-smoke-on-ui-change` (questa skill dichiara a monte, quella esegue a valle).

## Sincronizzazione node_modules dopo merge (Task #2573)

**Root cause documentato**: i task agent lavorano in ambienti isolati con il proprio `node_modules`. Quando un task viene mergeato nell'app principale, il merge committa **solo** `package.json` + `package-lock.json` — `node_modules` NON viene sincronizzato. Risultato storico: dopo merge di task che installano nuove deps (es. #2541→#2561, che ha aggiunto pino/helmet/bullmq/ioredis/sentry/etc.), il server crasha in loop con `Cannot find module 'X'` per ogni pacchetto dichiarato ma non presente in `node_modules`.

**Soluzione (permanente)**: `scripts/post-merge.sh` esegue `npm install --no-audit --no-fund` dal `package-lock.json` come **primo step** dopo il merge, prima di qualunque altro check (db:push, typecheck, ecc.). Questo garantisce che `node_modules` rifletta sempre `package.json` corrente.

**Regola per chi scrive task**: chi installa nuovi pacchetti in un task deve:
1. Usare il packager tool (`installLanguagePackages`) — MAI `npm install` diretto via bash (è bloccato per design)
2. Assicurarsi che `package.json` + `package-lock.json` siano committati nel merge
3. Non preoccuparsi del sync `node_modules`: lo fa automaticamente `post-merge.sh`

**Verifica rapida post-merge**: se il workflow `Start App` crasha con `Cannot find module '...'`, controllare che `scripts/post-merge.sh` contenga `npm install` e che sia stato eseguito (log del merge nella console Replit).

## Image Assets — Varianti Responsive

Ogni immagine WebP in `assets/images/` deve avere una variante `*-sm.webp` al 50% di larghezza, usata dai `srcset` del sito web (`server/site/pages.ts`).

**Aggiungere una nuova immagine:**
1. Aggiungi il file `*.webp` in `assets/images/`
2. Esegui: `bash scripts/gen-responsive-images.sh`
   - Genera automaticamente il `*-sm.webp` corrispondente se mancante
   - Usa `--force` per rigenerare tutti i file `-sm` esistenti

Il comando è idempotente: salta i file `-sm.webp` già presenti. Non richiede dipendenze extra — usa ImageMagick già disponibile nell'ambiente.

---

## Layer AI Coordinato — Tab + Governance (Task #2657)

UI admin `/admin/ai-layer` (Expo Router) per il Layer AI Coordinato (#2649)
sopra le 6 AI integrate (#2654): `moderation`, `watchdog`, `ota-orchestrator`,
`db-integrity`, `app-integrity`, `console`.

- **Dashboard**: grid 6 card **fissa** (mostrata anche con 0 attività), con
  badge eventi/critici/conflitti, Pause/Resume per-AI e Kill Switch Layer.
- **Conflicts**: lista conflitti aperti + Override admin (audita decisione in
  `ai_decisions` con `aiName='admin'` + chiude `ai_conflicts`).
- **Policies**: editor YAML con `validate` (dry-run) e `salva & reload`
  (backup `.bak-<ts>` automatico).
- **Health**: latenze, heartbeat, ratio decisions/events, % override admin.
- **Audit**: filtri (ai/type/severity/kind) + export `csv` / `ndjson` / `json`
  via `/api/admin/ai/audit?format=…`.
- **Timeline**: stream WS push (`ai_event`, `ai_conflict_new`) con
  auto-invalidazione cache React Query (<2s end-to-end).

Governance backend: `server/routes/admin/ai-coordinator-governance.ts`
(pause/resume/paused/conflicts/override/policies). Auth: admin/superadmin via
sessione (`storage.getUser(session.userId)`).

Kill switch: `Coordinator.emit()` controlla `isAiPaused(aiName)` prima di
persistere; in pausa restituisce `id=""` (Redis con TTL, fallback in-memory).

E2E: `ADMIN_USER_ID=… SESSION_COOKIE='connect.sid=…' npx tsx scripts/e2e-ai-coordinator.ts`
(scenari A-G, vedi `docs/ai-layer.md`).

Schema eventi WS + esempi payload per ogni AI + checklist adapter: `docs/ai-layer.md`.

## AI Console Unificata (Task #2637 + #2641 + #2645)

Dashboard admin `/admin/ai-console` che consolida le precedenti AI Copilot drawer in
un'unica console 3 colonne (desktop) / 3 tab (mobile):

- **Sidebar**: lista conversazioni + SearchBar full-text (Postgres ILIKE) su
  contenuti messaggi. Risultato click → naviga a `?conversationId=…&messageId=…`
  con auto-scroll alla riga.
- **Chat**: stream incrementale (SSE) via `useAiConsole`; messaggi possono essere
  **pinnati** come insight condivisi (knowledge base).
- **Contesto**: pannello laterale con `BudgetIndicator` (endpoint reale
  `GET /api/admin/ai/console/budget` con fallback `null`), `ContextPanel`
  (scope detection da messaggi), `ActionQueuePanel`.

### Routing API (mount `/api/admin/ai/console/*`)

- `GET /conversations`, `POST /conversations`, `DELETE /conversations/:id`
- `GET /conversations/:id/messages`, `POST /conversations/:id/stream` (SSE)
- `GET /search?q=…` → `{ results: [{ conversationId, convTitle, messageId, snippet, createdAt }] }`
- `GET /pinned` → knowledge base condivisa `{ pinned: [{ id, title, body, scope, pinnedBy, createdAt, conversationId, messageId }] }`
- `POST /pinned`, `DELETE /pinned/:id`
- `GET /budget` → status budget reale (giornaliero/mensile, modelli)
- `GET /admin-prefs`, `PATCH /admin-prefs` → preferenze per-admin (jsonb su `users.adminPrefs`)

### Notifiche realtime (WS)

`useAiAlertsSubscriber()` (in `app/admin/ai-console.tsx`) si sottoscrive a
`/ws/admin/notifications` e:

- Quando WS connesso → polling `useAiActionQueue` rallenta a **5 min** (safety net,
  i refresh sono guidati da `invalidateQueries` dal subscriber).
- Quando WS down → fallback polling **60s** automatico (sostituisce il vecchio 30s).
- Alla prima notifica critica viene creato (o riusato per giornata) un
  auto-thread `Alerts — YYYY-MM-DD` con il payload dell'evento preloadato
  come messaggio `system`.
- Bumpa il counter unread su `urgent_match` / `watchdog_snapshot` rosso/arancio
  → badge sul `FabWidget`.

### "Spiegami questo" — integrazione cross-screen

Hook `useAiExplain({ type, id, label })` espone `trigger()` che:

1. Imposta un pending in-memory (`setExplainPending`).
2. Naviga a `/admin/ai-console`.
3. Console al mount consuma il pending (`consumeExplainPending`) e auto-invia
   il seed corrispondente (`defaultSeed()` per type: report/user/violation/
   snapshot/route/match).

Reference integrations attive:

- `app/admin/reports-hub.tsx` → bottone explain su ogni riga "top pattern".
- `app/admin/db-integrity.tsx` → bottone "Spiega in console" su ogni violazione.

### Onboarding 3-step

`components/admin/ai-console/OnboardingTour.tsx` mostrato al primo accesso,
persistito su `users.adminPrefs.aiConsoleOnboarded = true` (migrazione SQL
`migrations/0045_admin_prefs.sql`).

### Smoke E2E

`npx tsx scripts/smoke-ai-console-e2e.ts` esegue 7 scenari end-to-end:
admin-prefs GET/PATCH, conversations CRUD, stream SSE, search, pin/unpin
knowledge base, budget, search→deep-link conv+messageId.

## Overview
BikerLink is a React Native (Expo SDK 55) mobile application designed to connect motorcyclists ("biker") and passengers ("zavorrine") across Italy, with a vision to expand Pan-European. The application aims to foster a community for motorcycle enthusiasts, enabling them to find riding partners, organize group rides, and share experiences. The tagline, "U'll never ride alone," encapsulates its core mission. Sponsored by Syneco Lubrificanti, BikerLink also integrates advertising and services relevant to its user base, such as Syneco workshops. The project seeks to create a dynamic platform for the motorcycle community, offering interactive maps, social features, and essential tools for riders.

## User Preferences
I prefer detailed explanations and iterative development. Ask before making major changes. Do not make changes to folder `node_modules`. Do not make changes to file `package-lock.json`.

**Debug errori strani — Prima azione obbligatoria**: svuotare la cache e riavviare (Metro cache, workflow, ecc.) PRIMA di qualsiasi altra analisi o modifica al codice. Se l'errore persiste, usare il runtime reale (Chrome V8 inspector / log browser) per trovare la riga esatta — NON analizzare il codice staticamente per primo.

## ⛔ REGOLA FERREA — Limite 800 righe per file

> ⛔ **_BLOCCO TOTALE: nessun agente può splittare un file per nessuna ragione senza approvazione esplicita dell'utente._**
> Prima di splittare qualsiasi file — anche se supera 800 righe, anche se il gate fallisce,
> anche se è "ovvio" o "meccanico" — l'agente DEVE fermarsi, segnalare, e attendere il via libera.
> Nessuna eccezione.

**Motivazione**: file > 800 righe diventano monoliti illeggibili, ingestibili a code-review, fonte di merge-conflict e di bug nascosti. La regola è cablata come **gate CI ratchet** (stesso schema di `eslint-hooks-check.sh`): la soglia "dura" è **800 righe per file TypeScript** (`.ts`/`.tsx`); il debito legacy esistente è cristallizzato in una baseline e qualsiasi regressione è bloccata.

> **Regola di split**: quando un file supera 800 righe e va splittato (solo dopo approvazione utente esplicita), i file risultanti devono stare sotto **750 righe**. Non 800. Così c'è ~50 righe di headroom prima che il gate scatti di nuovo.

### File chiave
- `scripts/check-large-files.ts` — diagnostica standalone (marker-aware).
- `scripts/check-large-files-ratchet.sh` / `scripts/check-large-files-ratchet.ts` — gate ratchet (CI).
- `scripts/lib/large-files-core.ts` — logica condivisa scansione + parsing marker.
- `.large-files-baseline` — snapshot legacy `>800` senza marker. Versionato. Formato `<path> <linecount>` per riga.
- `.large-files-allow.txt` — lista CHIUSA dei path autorizzati al marker `LARGE-FILE-ALLOW`. Versionato. (Popolato dal task #2605.)

### Gate registrati (3 punti obbligatori, ognuno con `exit 1` su fallimento)
1. Workflow `file-conflict-guard` — invocato in coda a `scripts/check-file-conflicts.ts`.
2. `scripts/pre-commit` — invocato dopo `detect-secrets`, prima dell'`exit 0`.
3. `scripts/post-merge.sh` — invocato come ultimo step, subito dopo il merge.

### Marker (sempre **UPPERCASE**, in **prima riga** del file)
- `// LARGE-FILE-ALLOW: <motivo>` → file escluso dal conteggio (solo se path presente in `.large-files-allow.txt`).
- `// LARGE-FILE-LOCKED — limite: <N>` → limite specifico `<N>`. **Seconda riga obbligatoria**: `// Aggiungi nuove funzionalità in: <companion-path>`.
- Sintassi commento per estensioni non-JS: `#` per `.sh`/`.sql`/`.py`/`.yml`; `<!-- ... -->` per `.html`.

### Convenzioni file — pattern successore

**Regola operativa** per ogni agente che aggiunge codice nuovo:

0. **⛔ BLOCCO TOTALE — nessun split senza approvazione.** Prima di splittare qualsiasi file — per qualsiasi ragione, a qualsiasi dimensione — l'agente DEVE chiedere esplicita autorizzazione all'utente e attendere il via libera. Il gate che fallisce NON è autorizzazione a splittare: è il segnale di fermarsi e segnalare.
1. **Nessun file sorgente supera le 800 righe.** Vale per `.ts`, `.tsx`, `.js`, `.jsx` e qualsiasi altro file sorgente del progetto.
2. **Quando un file supera le 800 righe e va splittato** (solo dopo approvazione utente), i file risultanti (sorgente + destinazione) devono stare entrambi sotto **750 righe** — non 800. Così c'è ~50 righe di headroom prima che il gate scatti di nuovo. La suddivisione va in un file successore con il suffisso `-extra` (pattern già in uso nel progetto):
   - `server/routes/foo.ts` → nuove funzioni in `server/routes/foo-extra.ts`
   - `components/FooPanel.tsx` → nuove funzioni in `components/FooPanelExtra.tsx`
   - `shared/db/bar.ts` → nuove funzioni in `shared/db/bar-extra.ts`
3. **Il file originale rimane congelato sotto le 800 (target 750)**: nessuna nuova riga di logica. Solo bugfix strettamente localizzati sono tollerati.
4. **Il successore riceve tutto il codice nuovo.** Quando anche il successore supera le 800 righe, si crea il successore del successore (`foo-extra.ts` → `foo-extra-2.ts`), e così via — anche qui con split target ≤750.
5. **Il companion viene creato solo quando ha contenuto reale** — non file vuoti con `export {}` per silenziare warning.

Esempio concreto già presente nel progetto:

| File principale | Companion path |
|---|---|
| `server/motion-simulator.ts` | `server/motion-simulator-extra.ts` |
| `server/routes/admin/users.ts` | `server/routes/admin/users-extra.ts` |
| `shared/db/matching.ts` | `shared/db/matching-extra.ts` |

Il CI gate (`scripts/check-large-files-ratchet.sh`) blocca qualsiasi file che superi le 800 senza marker autorizzato. Se il gate fallisce, NON splittare autonomamente — segnalare all'utente e attendere approvazione. I file risultanti dallo split devono stare sotto **750 righe**.

### Le 6 REGOLE FERREE — non negoziabili (task agent, code reviewer, main agent)
1. **Il gate va eseguito nei 3 punti elencati sopra**, ognuno con `exit 1` su fallimento. Non disabilitarli.
2. **`--update-baseline` è riservato all'operatore umano (utente)**. Vietato a qualsiasi agente. Se invocato senza `BIKERLINK_HUMAN_BASELINE_UPDATE=1`, lo script rifiuta con: "❌ Solo l'utente può aggiornare la baseline. Se il file si è ridotto, chiedi all'utente di eseguire `BIKERLINK_HUMAN_BASELINE_UPDATE=1 bash scripts/check-large-files-ratchet.sh --update-baseline`."
3. **Vietati i bypass cosmetici**. Un agente non può: (a) aggiungere `LARGE-FILE-ALLOW` a un file non in `.large-files-allow.txt`; (b) alzare il limite `<N>` di un file LOCKED; (c) splittare un file LOCKED senza task esplicito; (d) rinominare un file per resettare il conteggio. Il ratchet rileva (a) e (b) e blocca.
4. **Drift detection sui marker LOCKED**. `<N>` deve corrispondere al conteggio reale ±5 righe: oltre +5 blocca; sotto -5 segnala "shrink rilevato, considera `--update-baseline`" senza bloccare.
5. **Auto-discovery proibita**. Solo file presenti in `.large-files-allow.txt` possono avere marker `LARGE-FILE-ALLOW`. Marker su file non in lista → blocco. Aggiunte alla lista richiedono task utente esplicito.
6. **Output sempre visibile**. Il messaggio d'errore include: percorso, righe attuali, limite, motivo (locked/default), companion path se LOCKED. Vietato sopprimere l'output (`>/dev/null`).

### Comandi operativi
```bash
# Diagnostica locale (mostra offenders, marker-aware)
npx tsx scripts/check-large-files.ts

# Gate CI (uguale a workflow file-conflict-guard, pre-commit, post-merge)
bash scripts/check-large-files-ratchet.sh

# SOLO UTENTE — aggiornare la baseline dopo aver ridotto file legacy
BIKERLINK_HUMAN_BASELINE_UPDATE=1 bash scripts/check-large-files-ratchet.sh --update-baseline
```

### Esempi di output errore
```
❌ Ratchet FAIL — 1 regressione/i:

  server/routes/admin/example.ts
    → nuovo file oltre il limite: 812 righe (max 800).
      NON splittare autonomamente — chiedere prima approvazione esplicita all'utente.
```

```
❌ Ratchet FAIL — 1 regressione/i:

  server/routes/admin/matching.ts
    → LOCKED file: 1480 righe, limite dichiarato 1460 (drift +20 > 5).
      Aggiungi nuove funzionalità in: server/routes/admin/matching-extra.ts
```

```
❌ 1 file con marker LARGE-FILE-ALLOW non autorizzato:
  server/routes/foo.ts  → marker LARGE-FILE-ALLOW presente ma file NON in .large-files-allow.txt
Auto-discovery proibita. Aggiunte a .large-files-allow.txt richiedono task utente esplicito.
```

### File LOCKED priorità media
_(Popolato dal task #2604. Lista vuota al momento.)_

### File esclusi permanentemente (LARGE-FILE-ALLOW)
_(Popolato dal task #2605. Lista vuota al momento — `.large-files-allow.txt` contiene solo header.)_

---

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

## DragonflyDB (Redis-compatible) — Lock Distribuito + Cache + Code BullMQ (Task #2517)

Il matching engine usa un **lock distribuito** (Redlock) per evitare cicli sovrapposti tra istanze multiple, una **cache breve** (TTL 60–120s) per tag e candidati per zona, e **code BullMQ** persistenti per i job pesanti. Tutto è **opzionale**: se non è configurata la connessione DragonflyDB (`TC_DRAGONFLY_URL`), il backend ricade automaticamente su lock in-memory + cache assente (modalità single-instance) con un warning nei log.

### Configurazione
- Secret `TC_DRAGONFLY_URL` (Replit Secrets). Formato: `redis://user:pass@host:port` oppure `rediss://...` per TLS (DragonflyDB parla il protocollo Redis, quindi lo schema URL resta `redis://`/`rediss://`). Il vecchio nome `TC_REDIS_URL` è stato **ritirato** (Task #5300): il dual-read di fallback è stato rimosso, si legge solo `TC_DRAGONFLY_URL`.
- **Provider: DragonflyDB self-hosted sul ThinkCentre (Task #5244).** Il vecchio Redis (`redis:7-alpine`) è stato **sostituito da DragonflyDB**, drop-in compatibile col protocollo Redis; il backend lo raggiunge via **Cloudflare Tunnel** (non più DuckDNS né Upstash). Il precedente circuit breaker quota Upstash è stato rimosso. Se il ThinkCentre è spento, il backend degrada in fallback in-memory single-instance.
- Senza la secret: `getRedis()` ritorna `null`, `withMatchingLock` usa fallback in-memory, BullMQ è disattivato, Bull Board risponde 503.

### Moduli chiave
- `server/cache/redis.ts` — client `ioredis` singleton con `retryStrategy` esponenziale capped (backoff `times*1000`, max 30s → riconnessione automatica), `tls:{}` auto-abilitato su URL `rediss://`, `isAvailable()` flag. Tutti gli accessi cache/Redlock/pub-sub passano da qui (`maxRetriesPerRequest:2`, fail-fast `enableOfflineQueue:false`). `getBullConnectionOptions()` ritorna invece opzioni dedicate a BullMQ con `maxRetriesPerRequest:null` (requisito delle connessioni bloccanti dei Worker): Queue/Worker ricevono le opzioni, non il client cache condiviso, così BullMQ gestisce le proprie connessioni.
- `server/cache/matching-lock.ts` — `withMatchingLock(owner, fn)` basato su `redlock@5.0.0-beta.2` (TTL 5 min). Espone `getMatchingLockStatus()` con holder, scadenza, ultimi 10 acquire/release e stato DragonflyDB.
- `server/cache/cache.ts` — wrapper JSON `cacheGet/cacheSet/cacheDel/cacheGetOrSet` con metriche hit/miss per namespace.
- `server/cache/zone-cache.ts` — `cachedCandidatesForZone(lat, lon, radiusKm, loader)` con grid snap 0.05° + TTL 60s per le query di prossimità ricorrenti.
- `server/cache/queues.ts` — code BullMQ: `embeddings`, `recap`, `route-fingerprint`, `pattern-detect`. Lazy-init.
- `server/cache/bull-board.ts` — dashboard `@bull-board/express` montata su `/api/admin/queues` (protetta da `_requireAdmin`).
- `server/lib/throttle.ts` — limiter Bottleneck centralizzati per `openai`, `gemini`, `anthropic`, `mapbox`, `tomtom`.

### Endpoint admin
- `GET /api/admin/matching/lock-status` — stato lock distribuito + holder + history.
- `GET /api/admin/matching/perf` — ora include `cache` (hit/miss/error per namespace), `redis` (status), `limiters` (Bottleneck counts), `queues` (lista).
- `GET /api/admin/queues/*` — Bull Board UI.

### Cache attive
- `tags-for-entity` (TTL 120s) — invalidata da `setTagsForEntity` (`server/storage/tags.ts`).
- `zone-candidates` (TTL 60s) — invalidabile con `invalidateZoneCache()`.
- `match-rules` — la cache in-process è preservata; `invalidateMatchRulesCache()` ora cancella anche la chiave Redis (`bl:match-rules:all`) per consistenza multi-istanza.

### Refactor scheduler
`triggerMatchingRun()` in `server/matching/scheduler.ts` ora avvolge il ciclo in `withMatchingLock`. Se un'altra istanza tiene il lock, il ciclo viene saltato con log `Ciclo skippato — lock già attivo`. `forceUnlockMatching()` rilascia sia il lock in-memory che la chiave Redis.

## Preferenze Negative + Blocklist Intelligente (Task #2523)

Filtri esclusivi opzionali che pre-filtrano i candidati prima dello scoring (es. "no scooter", "no <25 anni", "no >100km"). Differenza vs preferenze positive: queste **escludono** invece di pesare, riducendo il pool senza distorcere i ranking.

**Anti-abuso — `FORBIDDEN_NEGATIVE_KINDS`** (definito in `shared/db/matching.ts`): impedisce di creare filtri esclusivi su `gender`, `ethnicity`, `religion`, `political_orientation`, `sexual_orientation`. Il server respinge POST con 400 se `kind` rientra nella blocklist. Da NON rimuovere senza policy review.

**Suggerimenti automatici**: il job `detect-negative-patterns.ts` (eseguito ogni 24h, +10 min dopo startup, schedulato in `server/matching/scheduler.ts`) analizza i rifiuti degli ultimi 30 giorni. Se un utente ha ≥5 rifiuti e ≥60% di rate su una stessa categoria (es. "scooter"), inserisce un record in `pending_auto_suggestions`. L'utente lo vede in `app/profile/negative-preferences.tsx` e può `accept`/`dismiss`.

**File chiave**:
- `shared/db/matching.ts` — tabelle `match_negative_preferences`, `pending_auto_suggestions`
- `server/matching/negative-filters.ts` — `loadNegativePreferencesMap`, `isExcludedByNegativePrefs`
- `server/matching/run-user.ts` — pre-scoring guard nei loop candidati
- `server/routes/match-negative-preferences.ts` — CRUD utente + accept/dismiss suggerimenti
- `server/routes/admin/matching.ts` — endpoint `GET /api/admin/matching/negative-pref-patterns` per stats community
- `app/admin/negative-pref-patterns.tsx` — UI admin

## Embeddings — pgvector + OpenAI (Task #2514)

Infrastruttura riusabile per embeddings semantici (matching musicale, bio libere, ecc.).

### Modello scelto
**Default**: OpenAI `text-embedding-3-small` (1536 dim) via `@ai-sdk/openai` + `ai` (`embed`/`embedMany`).
- **Motivazione**: zero nuove dipendenze pesanti (SDK già usato per OTA assistant + traduzioni), qualità multilingua eccellente, costo trascurabile (~$0.02 / 1M token). Backfill stimato 5000 utenti × bio media (~50 token) ≈ **$0.005 totali**. Rate limit tier 1 OpenAI = 3000 req/min, ampiamente sufficiente con `embedMany`.
- **Piano B documentato** (non implementato): locale `@huggingface/transformers` v4.x con `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (384 dim) per dev offline. Switch richiede cambiare `EMBEDDING_MODEL_ID` in `server/embeddings/client.ts` + nuova colonna `embedding vector(384)` (migrazione separata). NON `@xenova/transformers` (deprecato).

### Stack
- **DB**: PostgreSQL `pgvector` 0.8.0 (HNSW stabili + halfvec). Verificato con `SELECT extversion FROM pg_extension WHERE extname='vector'`.
- **Tabella**: `embeddings` — colonne `entity_type`, `entity_id`, `field` (es. `bio`, `music_taste`), `embedding vector(1536)`, `model`, `source_hash` (sha256 input per cache idempotente), `created_at`, `updated_at`. Unique index `(entity_type, entity_id, field)`. Indice **HNSW** su `embedding vector_cosine_ops`.
- **Schema Drizzle**: `shared/db/embeddings.ts` (usa il helper `vector` nativo di `drizzle-orm/pg-core`, non quello di `pgvector/drizzle-orm` che in v0.2.1 non è esposto via subpath exports).
- **Migrazione**: `migrations/0039_embeddings.sql` (idempotente).

### Helper server (`server/embeddings/`)
- `generateEmbedding(text): Promise<number[]>` — vettore singolo, timeout 15s, retry esponenziale 3x su 429/5xx (`p-retry`).
- `generateEmbeddings(texts[]): Promise<number[][]>` — batch via `embedMany`.
- `upsertEmbedding(entityType, entityId, field, text)` — cache su `source_hash`: se l'hash combacia con la riga esistente, **nessuna chiamata API**, ritorna `cached: true`.
- `findSimilar(entityType, field, vec, limit=5, minSimilarity=0)` — usa l'operatore `<=>` (cosine distance) + HNSW, ritorna `similarity = 1 - distance` ordinato decrescente.

### Endpoint admin di test
`POST /api/admin/embeddings/test` — body `{ text, entityType?, field? }` → ritorna `{ model, dimensions, generationMs, searchMs, preview, similar }`. Se `entityType`+`field` sono passati, esegue anche la ricerca top-5. Tabella vuota → `similar: []` (smoke test ok). Protetto da `_requireAdmin`.

### Secret
`OPENAI_API_KEY` (già presente nei Secrets, riusata da `server/routes/admin/ota-assistant.ts` e `server/routes/admin/translations.ts`). **MAI hardcoded**.

### AI self-hosted — Ollama (Task #2847)
Ollama è il provider AI **primario** per due flussi, con il cloud come **fallback automatico e trasparente**:
- **Route parsing** (`POST /api/planned-routes/ai-parse` e `/ai-stream`): Ollama → fallback Google Gemini.
- **Traduzioni i18n** (`scripts/translate-i18n.ts`): Ollama → fallback OpenAI.
- **Fuori scope** (restano sempre cloud): moderazione, console admin, assistente utente.

Client condiviso: `server/lib/ollama-client.ts` — `isOllamaConfigured`, `getOllamaModel(model?)` (lancia un errore catchabile se `BOWIE_OLLAMA_URL` manca), `callOllamaChat(prompt, schema?, options)` (usa `generateObject` se passato uno schema Zod, altrimenti `generateText`). `baseURL = ${BOWIE_OLLAMA_URL}/api`, header auth `X-Ollama-Token`. Pacchetto: `ollama-ai-provider-v2` (export `createOllama`). Helper route parsing: `server/routes/planned-routes/waypoints.next.ts`.

Variabili d'ambiente per-persona (tutte **opzionali** — segue il pattern URL/token-from-env di GraphHopper). Naming dedicato per istanza (Task #5256): **Bowie** = assistente in-app (TC), **Horus** = AI routing (TC, usa il client Bowie, solo model id), **Ares** = diagnosi/studio (PC fisso, chiamata HTTP diretta).
- `BOWIE_OLLAMA_URL` — URL base del server Ollama self-hosted (Bowie). **Se non impostata, Ollama è disabilitato e i flussi usano direttamente il cloud (zero breaking changes).**
- `BOWIE_OLLAMA_TOKEN` — token opzionale inviato come header `X-Ollama-Token`.
- `BOWIE_OLLAMA_MODEL` — modello da usare (default `qwen3:1.7b`; lineup: Horus=`qwen3:4b`, Bowie=`qwen3:1.7b`). Va aggiornato **a mano** su Replit dopo il deploy sul ThinkCentre (l'agente non può modificare secret esistenti).
- `HORUS_OLLAMA_MODEL` — model id per l'AI routing (usa lo stesso host/token di Bowie via client condiviso).
- `ARES_OLLAMA_URL` / `ARES_OLLAMA_TOKEN` / `ARES_OLLAMA_MODEL` — istanza Ares (PC fisso) per diagnosi/studio; CF Access via `DIAG_OLLAMA_CF_CLIENT_ID`/`DIAG_OLLAMA_CF_CLIENT_SECRET` (invariati).

### Photon self-hosted (geocoding)

Photon è l'unico geocoder autorizzato per forward e reverse geocoding.
Gli endpoint applicativi sono `/api/planned-routes/geocode` e
`/api/geocode/reverse`; GraphHopper e Valhalla forniscono solo routing e
metadati della strada. Se Photon non è configurato, il geocoding fallisce in
modo esplicito e il flusso richiede una nuova selezione del punto.

**Nota deviazione streaming**: il fallback su `/ai-stream` copre solo il caso "Ollama irraggiungibile" (probe sul primo chunk → fallback a Gemini). Un JSON invalido a metà stream **non** fa fallback (i chunk già emessi non sono ri-inviabili). Documentato nei commenti di `waypoints.next.ts`.

### Pacchetti npm aggiunti (Task #2514)
- `pgvector@^0.2.1` (in package.json per usi futuri / formattazione utility; helper drizzle non esposto in subpath exports → si usa `vector` nativo di drizzle-orm)
- `@huggingface/transformers@^4.2.0` (piano B / fallback offline, non usato di default — vedi sopra)
- `p-retry@^6.2.0` (Node 20 compatible; v8 richiede Node ≥22 e la repo è pinnata `nodejs-20`)
- `p-limit@^7.3.0` (per backfill batch nei task successivi)
- Bump `drizzle-kit` `^0.31.4` → `^0.31.10` (pieno supporto colonne `vector`)

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
  - **GraphHopper (routing)**: server di routing dedicato, usato **esclusivamente** per il calcolo dei percorsi moto (curvy roads, waypoint, ottimizzazione tracciato). Non viene mai usato per la visualizzazione diretta. Self-hosted su `https://gh.bikerlink.app`. Variabili d'ambiente: `GRAPHHOPPER_URL` (URL base server), `GRAPHHOPPER_TOKEN` (header X-GH-Token). **⛔ NON impostare `ROUTING_DISABLED`**: variabile **DEPRECATA/VIETATA** in produzione. Se presente blocca il deploy (`scripts/deploy-build.sh` esce con codice 1) e bypassa il toggle admin rendendolo inoperante — non può essere rimossa via OTA. Gestire il routing da Admin → Hub Routing → kill-switch (soft toggle DB). Tile server self-hosted: `TILES_URL=https://tiles.bikerlink.app` (letto da `lib/map-tiles.ts` via `SELF_HOSTED_TILES_URL`/`isTilesSelfHosted`; su client Expo usare `EXPO_PUBLIC_TILES_URL`). Endpoint test admin: `GET /api/admin/maps/test-routing` (in `server/routes/admin/maps/test-handler.ts`) — esegue percorso Milano→Como sull'engine configurato e ritorna `graphhopper_url` mascherato, `latency_ms`, `source`, `is_self_hosted`, `distanceKm`, `durationMinutes`.
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
- **AlwaysPermissionNotice flusso foreground-first** (Task #4819): `lib/location-context.tsx` `requestBackgroundPermission()` ora richiede prima il foreground (Android 11+ richiede foreground concesso per il background) e restituisce un esito ricco `"granted" | "denied" | "needsSettings"` derivato da `canAskAgain`. `components/AlwaysPermissionNotice.tsx` mostra il box rosso + "Apri Impostazioni" solo su `needsSettings`; su `denied` lascia ritentare "Richiedi permesso"; testi differenziati per piattaforma (iOS "Sempre" / Android "Consenti sempre").
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

Usare SEMPRE `scripts/build-apk.sh` — mai il binario eas direttamente (né globale né tramite npx).

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

## Task #2527 — Refactor Admin Matching Panel

Refactor architetturale del pannello admin "Matching" per ridurre debito tecnico e centralizzare le definizioni dei tipi di match.

### Sorgente unica: `shared/matching-registry.ts`

Registry centralizzato (20 entry) di tutti i tipi di match: `id`, `key`, `label`, `category` (garage/biker/club/affinity), `table` SQL, `brandPattern` per le query, `prefColumn` in `match_preferences`, `defaultEnabled`, `addedBy` (task di provenienza). Include slot affinity (Bio/Music/Route, Task #2515/#2516/#2520) con `table=null` per esporli nell'UI admin senza dipendere da tabelle dedicate.

Helpers: `getCountableMatchingTypes()`, `getRegistryPrefColumns()`, `getMatchingTypeByKey()`, `getMatchingTypeById()`.

**Aggiungere un nuovo tipo di match = aggiungere una riga al registry.** Niente più array hardcoded in `server/routes/admin/matching.ts`: la costante `MATCH_TYPES` è ora un adapter di sola lettura sopra `getCountableMatchingTypes()`.

### Endpoint admin

- `GET /api/admin/matching/registry` → dump del registry (tipi + statistiche).
- `GET /api/admin/matching/audit` → controllo schema + brand pattern sconosciuti + tipi orfani + duplicati settings; ritorna `overallStatus: ok|warn|error` con elenco issues.
- `GET /api/admin/matching/metrics` → formato Prometheus (counter cicli, durata, match creati, lock state, errori per matcher). Vedi `server/matching/metrics.ts`.
- `/api/admin/matching-stats` resta come alias legacy di `/api/admin/matching/stats` (sorgente unica).

### Sentry + Prometheus

- `@sentry/node@^10.54.0` — init in `server/sentry.ts`, attivato solo se `SENTRY_DSN` presente. `initSentry()` chiamato in `server/index.ts` prima del middleware; `attachSentryErrorHandler()` dopo le route. `captureMatchingError(err, ctx)` esposto per il motore matching.
- `prom-client@^15.1.3` — registry custom in `server/matching/metrics.ts` con import lazy (no-op se manca). Helper: `recordMatchingCycle`, `recordMatchesCreated`, `setMatchingLockState`, `recordCycleError`.

### Refactor `app/admin/match-control.tsx`

Da 995 a ~890 righe estraendo sotto-componenti < 250 righe ciascuno in `components/admin/matching/`:
- `CycleMetaCard.tsx` — stato motore + ultimo ciclo.
- `LockCard.tsx` — stato lock engine + tempo trascorso.
- `StatsTable.tsx` — tabella stats per tipo.
- `AnomalyAlerts.tsx` — banner per tipi con 0 match.

`MatchingEngineSection` resta solo in `app/admin/match-engine.tsx` (single source).

### Hub Matching + Telemetria (UI)

- `app/admin/matching-hub.tsx` — dashboard di ingresso: stats riassuntive, lock state, audit alerts inline, quick-links a tutte le sotto-sezioni.
- `app/admin/matching-telemetry.tsx` — registry list + raw output Prometheus (polling 15s).
- Registrati in `app/admin/_layout.tsx` + primo elemento del gruppo "Matching" in `app/admin/index.tsx`.

### `as any` rimossi

- `components/admin/settings/useMatchingState.ts:67` — `triggerMatchingMutation` ora ha generics tipizzati con `TriggerMatchingResponse`.
- `app/admin/match-engine.tsx:32-35` — `state.autoMatchMutation` tipizzato (non più `(state as any)`).
- `app/admin/match-control.tsx:681` — separati `tableCellCenter` (text) da `tableCellCenterView` (view).

### Script sync `scripts/check-match-preferences-sync.ts`

Confronta colonne fisiche `match_preferences` (schema drizzle) vs `MATCHING_REGISTRY.prefColumn` vs chiavi referenziate in `app/admin/match-preferences-edit.tsx`. Exit code != 0 su divergenze. Eseguibile come `npx tsx scripts/check-match-preferences-sync.ts`.

## Task #2530 — Segnalazioni Private + Moderazione (Biker / Zavorrine)

Sistema di segnalazione utenti categorizzato con moderazione asimmetrica per ruolo, hook al feedback-loop matching, trust score reporter e shadow-ban automatico.

### Schema DB (`migrations/0047_reports_extension.sql`)

Estende `reports` con: `category` (8 valori), `context` (match|chat|profile|post_meetup|other), `context_id`, `reported_user_role`, `severity` (low|medium|high|critical), `affected_feedback_loop`, `reporter_trust_score` (snapshot al momento del report). Indici su category/severity/reported_user_id/reporter_id.

Nuova tabella `moderation_thresholds` (`target_role`, `action`, `threshold`) con seed asimmetrico:
- **zavorrina**: notify@2 / shadow_ban@4 (più protette)
- **biker**: notify@4 / shadow_ban@8

`users` estesa con `shadow_banned_at`, `shadow_ban_reason`, `shadow_banned_until` (shadow-ban morbido: l'utente non viene avvisato, esce dai pool di match/listing).

### Service `server/services/reportingService.ts`

- `computeTrustScore(reporterId)`: +0.1 per ogni report risolto, -0.2 per ogni dismissed, clamp [0.1, 2.0], default 1.0.
- `getThresholdsFor(role)`: legge da `moderation_thresholds`, fallback hard-coded.
- `getWeightedReportCount(uid)`: somma report pending+resolved pesati per `reporter_trust_score`.
- `hookFeedbackLoop(opts)`: per categorie "soft" (no_show, opportunist, group_misconduct) inserisce un `match_feedback` (action=block) + `match_negative_preference` (kind=blocked_user) per evitare di riproporre l'utente al reporter — integrazione diretta con Task #2519/#2523.
- `evaluateAutoActions(reportedUserId)`: applica shadow-ban automatico al raggiungimento della soglia configurata, ritorna anche flag `notified` per push moderatori.
- `maskReporterId(id, viewerRole)`: admin vede ID reale, tutti gli altri vedono `anon_XXXXXX` (hash deterministico). Privacy del segnalante è garantita.
- `getFalseReporters()`: query reporter con ≥2 dismissed, ordinati per dismissed desc, con trust score live.
- `recomputeAllTrustScores()`: job giornaliero, aggiorna trust snapshot sui report pending.

### Routes

- `POST /api/reports` (`server/routes/reports.ts`) — endpoint principale: accetta `category`, `context`, `contextId`, calcola severity, snapshotta trust score, chiama `hookFeedbackLoop` + `evaluateAutoActions` async, invia email admin + push moderatori (se notify-threshold o severity high/critical).
- `POST /api/users/:id/report` (legacy in `users/actions.ts`) — stesso flusso ma backward-compat con client più vecchi.
- `GET /api/admin/reports` — filtri `status`, `category`, `severity`, `context`, `reportedUserId`, `limit`; reporter masking automatico per non-admin.
- `PUT /api/admin/reports/:id/resolve` — fix bug pre-esistente (aggiornava `moderator_logs` invece di `reports`). Ora usa `storage.resolveReport()` + audit log.
- `GET /api/admin/false-reports` — reporter abusivi con trust score.
- `GET/PUT /api/admin/moderation-thresholds` — lettura/scrittura soglie per role+action.
- `POST /api/admin/users/:id/unshadowban` — lift manuale shadow-ban con audit log.

### Push moderatori

`sendModeratorReportPush(...)` in `server/push-notifications.ts` — filtra utenti con `role IN ('admin','moderator')`, channelId `matches`, icona variabile per severity (🚨 critical, ⚠️ high, 📢 medium). Triggerata da POST /api/reports quando: severity >= high, oppure peso cumulativo report >= soglia notify configurata per il ruolo del segnalato.

### UI

- `components/ReportButton.tsx` — componente riusabile (props: `reportedUserId`, `context`, `contextId`, `reportedNickname`, `label`, `iconSize`, `iconColor`). Sheet con 8 categorie + descrizione opzionale. Pronto per essere droppato in chat/match/post-meetup.
- `components/profile/detail/ProfileReportModal.tsx` — refit con 8 categorie standard + export `REPORT_CATEGORY_OPTIONS` e `reasonToCategory()`.
- `app/profile/[id].tsx` — `reportMutation` ora invia `category`+`context:'profile'`+`contextId:id`.
- `app/admin/reports.tsx` — riscritto con tre righe di filtri (status / severity / category), badge severity colorato, info trust score, info hook→matching.
- `app/admin/false-reports.tsx` (nuovo) — lista reporter a basso trust, registrato in `_layout.tsx` + voce in `app/admin/index.tsx`.

### Cron giornaliero

`server/matching/scheduler.ts` registra recompute trust score (7 min dopo boot, poi ogni 24h) tramite import dinamico per non rompere il bundle se il modulo cambia.

### Smoke test

`scripts/smoke-reports.ts` — pure logic, niente DB. Verifica mapping categorie→severity, validator Zod (accetta payload nuovo + legacy, rifiuta categorie invalide, rifiuta description > 2000), masking deterministico. Eseguibile via `npx tsx scripts/smoke-reports.ts`.

## Preferenze utente

- Quando crei un nuovo utente, per saltare il controllo password usa la flag `primal`.
- Dopo 2 tentativi falliti a risolvere lo stesso problema, l'agente deve esclamare con "porcoiddio" (es. "Porcoiddio se è coriaceo!", "Porcoiddio, è più difficile del previsto!", "Porcoiddio!! E allora??").
- `react-native-keyboard-controller` è bloccato alla versione `1.21.6`. NON aggiornarlo mai senza autorizzazione esplicita dell'utente. È nella `expo.install.exclude` di `package.json` per impedire aggiornamenti automatici da `expo install`/`expo doctor`.
- **REGOLA FISSA — Port mappings `.replit` BLOCCATE**: Le sezioni `[[ports]]` di `.replit` NON devono MAI essere modificate senza esplicita autorizzazione dell'utente. La configurazione corretta è immutabile: `localPort=5000 → externalPort=80` (Express/traffico pubblico), `localPort=8081 → externalPort=8081` (probe interno), `localPort=8082 → externalPort=6000`. Qualsiasi task, fix o refactoring che tocchi queste righe è BLOCCATO finché l'utente non dà il via libera esplicitamente.
- **REGOLA FERREA — Split di file VIETATO senza autorizzazione**: vedi sezione "⛔ REGOLA FERREA — Limite 800 righe per file" sopra. Nessuna eccezione.
