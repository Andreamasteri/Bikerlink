# BikerLink — Registro minuzioso implementazione audit

Data di avvio: 2026-08-16 19:55 (ambiente di lavoro)
Repository: `Andreamasteri/Bikerlink`
Branch di lavoro: `codex/bikerlink-audit-implementation-20260816`
Baseline Git: `3e381e35` (`main` / `origin/main` al momento della fotografia)

## Scopo

Applicare in modo incrementale e verificabile l’audit profondo e la revisione completa dei problemi BikerLink, mantenendo rollback, parità funzionale e tracciabilità delle regressioni.

Documenti di riferimento:

- `BikerLink — Audit profondo: errori e piano di risoluzione` — 67 problemi, checklist di risoluzione e decisioni di prodotto.
- `BikerLink — Revisione completa dei problemi rilevati` — revisione Terra Medio approvata con correzioni vincolanti, ordine di implementazione e criteri minimi di chiusura.

## Regole operative

1. Preservare le modifiche non committate già presenti nel worktree.
2. Non usare reset distruttivi e non cancellare il vecchio tracking prima della parità funzionale.
3. Ogni modifica deve avere una motivazione collegata all’audit e una verifica associata.
4. Ogni problema postumo deve essere registrato, riprodotto quando possibile, corretto o lasciato esplicitamente bloccato.
5. Il lavoro resta incompleto finché i test di lifecycle, GPS, background, navigazione, offline e regressione non sono stati eseguiti o documentati come bloccati.

## Registro azioni

### 2026-08-16 19:53 — Fotografia iniziale dell’ambiente

- La directory iniziale `/workspace/scratch/d2cb84b1d6fe` non conteneva il repository: solo metadati `.git`, `.agents` e `.codex`.
- È stato cercato un worktree Git sotto `/workspace/scratch` senza modificare file.
- È stato individuato il repository in `/workspace/scratch/d95f60f660ca/bikerlink-work`.
- Il remote `origin` punta a `https://github.com/Andreamasteri/Bikerlink.git`.
- Il repository era su `main`, allineato a `origin/main`, con modifiche non committate già presenti.

### 2026-08-16 19:54 — Preservazione del lavoro esistente

- Stato iniziale: modifiche su navigazione, tracking, GPS, telemetria, schema route e server; cancellazione locale di `app/route/tracking.tsx` e `lib/manual-tracking-flag.ts`; nuovi file per il central manager GPS e l’avvio automatico.
- Non è stato eseguito alcun reset, checkout distruttivo o sovrascrittura delle modifiche.
- È stato creato il branch locale `codex/bikerlink-audit-implementation-20260816` mantenendo intatto il worktree.

### 2026-08-16 19:55 — Baseline di verifica

- Il progetto dichiara test Vitest, lint Oxlint e build/typecheck tramite gli script del `package.json`.
- Il worktree non contiene `node_modules/.bin/vitest` né `node_modules/.bin/tsc`.
- L’esecuzione `npm test -- --run lib/__tests__/automatic-start-detector.test.ts` non ha potuto completare perché npm ha richiesto accesso di rete/approvazione.
- La verifica automatica completa è quindi inizialmente bloccata dalla dipendenza locale mancante; sarà riprovata se le dipendenze diventano disponibili senza alterare il codice.

### 2026-08-16 20:06 — Lifecycle server, navigazione e audit statico

- Reso `started_at` nullable nello schema `routes` e aggiunta la migrazione `0163_armed_tracking_started_at_nullable.sql`: una sessione `armed` non viene più falsificata come iniziata al momento della pressione del pulsante.
- Aggiunto il contratto server `POST /api/routes/:id/start`, idempotente: la prima chiamata attiva la misura e scrive il timestamp reale; le ripetizioni su una route già `active` restituiscono la stessa route senza riscrivere l'orologio.
- Bloccata la chiusura di sessioni `armed`/senza `startedAt`; resa idempotente la chiusura di route già `completed`, per evitare il doppio incremento delle statistiche profilo in caso di risposta HTTP persa e retry.
- Corretto il cleanup degli orfani: per le sessioni `armed` si usa `createdAt`; per le sessioni già attive si usa `startedAt`; le sessioni senza movimento vengono eliminate dopo 10 minuti, quelle con movimento vengono completate dopo 2 ore con durata zero solo se non avevano ancora un timestamp reale.
- Reso il salvataggio della navigazione conservativo: memorizza l'ID creato, non cancella alla cieca in caso di errore, verifica prima lo stato server e rimuove solo un placeholder non completato; se la verifica fallisce lascia la route al cleanup server per non cancellare dati potenzialmente salvati.
- Centralizzato il watcher foreground in `LocationSessionManager`, inclusa l'arbitration degli intervalli più restrittivi tra consumer e il lifecycle del task background canonico del tracking.
- Spostato nello stesso manager anche lo start/stop nativo dei tre task background distinti (tracking, telemetria, posizione sociale/servizio foreground), mantenendo separati i loro payload e le regole di coesistenza.
- Unificati i validator tracking tramite re-export dalla definizione schema condivisa; eliminata la copia duplicata che poteva divergere.
- Sostituito l'insieme hardcoded della tab Community con `lib/navigation-registry.ts` e aggiunte le chiavi i18n per Community e avvio automatico in tutte le lingue supportate.
- Verifiche statiche completate: `git diff --check` passa; nessun caller attivo di `/route/tracking`, `manual-tracking-flag` o `COMMUNITY_TABS`; nessuna chiamata foreground `watchPositionAsync` fuori dal manager. I task background aggiuntivi sono stati identificati come domini distinti e restano da verificare in test su dispositivo.

### 2026-08-16 20:08 — Hardening della cancellazione automatica e ownership background

- Durante la revisione del race condition è emerso che il detector automatico poteva riattivare una sessione mentre l'utente la stava cancellando. `handleStop` ora porta la fase a `idle` prima di attendere la DELETE server.
- L'endpoint di attivazione ora ripara anche una route legacy `active` con `startedAt` nullo, senza riscrivere il timestamp delle route già correttamente attive.
- I tre helper background usano ora le primitive del `LocationSessionManager`; rimangono distinti solo i nomi dei task e i payload operativi.
- Controllo i18n: tutte le 8 chiavi introdotte sono presenti in 7/7 file lingua.
- Controllo ownership: in codice di produzione le sole chiamate native `watchPositionAsync`, `startLocationUpdatesAsync` e `stopLocationUpdatesAsync` restano dentro `lib/location-session-manager.ts`.
- Controllo migration: `0163` è il nuovo prefisso consecutivo; l'unico duplicato rilevato è il gruppo storico `0157`, già documentato e allow-listato dal repository.

## Mappa dei file toccati

| Area | File | Intervento |
|---|---|---|
| GPS ownership | `lib/location-session-manager.ts`, `lib/location-context.tsx`, `components/tracking/useTrackingState.ts`, `hooks/navigate/useNavigateState.ts`, `hooks/tracking/useTrackingEffects.ts`, `hooks/tracking/useTrackingHandlers.ts`, `hooks/useIdealLapRecorder.ts`, `hooks/useMotorcycleDetector.ts`, `hooks/useTelemetry.ts` | watcher condiviso, arbitration opzioni, refresh permessi, stop/start centralizzati |
| Background | `lib/background-location-task.ts`, `lib/background-telemetry-task.ts`, `lib/foreground-location-service.ts` | delega delle primitive native al manager, task separati invariati nei payload |
| Auto-start | `lib/automatic-start-detector.ts`, `lib/__tests__/automatic-start-detector.test.ts`, `hooks/tracking/useTrackingSettings.ts`, `components/tracking/IdleConfigScreen.tsx`, `app/(tabs)/tracking.tsx`, `lib/i18n/*.ts` | gate 5 km/h/5 s, qualità GPS, displacement, straightness, UI e traduzioni |
| Session API/schema | `shared/db/tracking.ts`, `shared/validators/tracking.ts`, `server/routes/tracking/sessions.ts`, `server/routes/tracking/stats.ts`, `migrations/0163_armed_tracking_started_at_nullable.sql` | schema unico, stato armed, timestamp reale, idempotenza, cleanup |
| Navigazione | `hooks/navigate/useNavigateState.ts`, `app/navigate/[id].tsx` | raccolta punti reali, metriche, persistenza e cleanup conservativo |
| Domini/UI | `app/(tabs)/proposals.tsx`, `app/route/_layout.tsx`, `app/route/tracking.tsx`, `lib/auto-telemetry-context.tsx`, `lib/manual-tracking-flag.ts`, `lib/navigation-registry.ts`, `components/CustomTabBar.tsx`, `app/(tabs)/_layout.tsx` | Proposte social-only, rimozione caller legacy, registry tab e lease tracking canonico |

Le modifiche già presenti nel worktree prima dell'intervento sono state mantenute; il registro non attribuisce automaticamente ogni riga dei file misti all'ultima sessione.

## Verifiche non eseguibili in questo ambiente

- `npm test`/Vitest: dipendenze non installate (`node_modules` assente) e il tentativo iniziale di esecuzione ha richiesto accesso npm di rete non autorizzato.
- TypeScript/Expo build/lint Oxlint: non eseguibili per la stessa assenza di dipendenze locali.
- Database migration/drift check: non eseguibile senza runtime Node del progetto e connessione DB configurata; la migration è stata comunque numerata, controllata per duplicati e passata a `git diff --check`.
- Test dispositivo: non eseguito; restano da provare background/permessi revocati, kill del processo, resume, GPS rumoroso/tunnel, doppio stop, salvataggio navigazione con rete intermittente e transizione lingua/tema.

## Rischi residui espliciti

1. Il cleanup server degli orfani viene attivato dal flusso di creazione route; se il processo server non viene raggiunto nuovamente, una riga orfana può restare nel database pur non comparendo nella lista utente.
2. Il salvataggio navigazione è ancora una sequenza create → points → stop, non una transazione server unica. È protetto da idempotenza e cleanup conservativo, ma una rete interrotta durante l'ispezione può lasciare una route da bonificare.
3. I titoli statici del navigator restano congelati per il fix anti-loop React Navigation; la tab bar usa il registry e le label i18n, ma la verifica live del cambio lingua sui titoli header è ancora da fare.
4. La classe `TrackingStorage` conserva l'ereditarietà storica da `ProposalsStorage`: la separazione dei domini lato UI/validator è stata fatta, la composizione storage resta un refactor distinto da non fare senza test di parità.
5. Il vecchio tracking è stato rimosso dal tree locale dal lavoro già presente, ma la parità completa con l'implementazione precedente non è certificabile finché Vitest/Expo e test dispositivo non sono disponibili.

### 2026-08-16 20:12 — Chiusura del ciclo statico

- `git diff --check`: PASS.
- Riferimenti legacy attivi (`route/tracking`, `manual-tracking-flag`, `COMMUNITY_TABS`): 0.
- Invocazioni native effettive `watchPositionAsync`, `startLocationUpdatesAsync`, `stopLocationUpdatesAsync` fuori da `lib/location-session-manager.ts`: 0.
- Chiavi i18n introdotte: 8 chiavi × 7 lingue = 56 presenze verificate.
- Migration più recente: `0163_armed_tracking_started_at_nullable.sql`; nessun nuovo duplicato di prefisso.
- Stato Git finale: branch locale dedicato con modifiche non committate; nessun push, PR, deploy o modifica remota effettuata.

### 2026-08-16 22:01 — Validazione con dipendenze installate

- Installate le dipendenze in `node_modules` con `npm install --ignore-scripts --engine-strict=false --no-package-lock`; `package-lock.json` non è stato modificato.
- Eseguito manualmente `scripts/patch-package-safe.cjs` tramite il binario locale: patch `react-native-webview@14.0.1` applicata.
- Eseguito `scripts/patch-metro-image-size.cjs`: parser ICNS, HEIF e JXL disabilitati come previsto dalla mitigation già presente nel repository.
- Suite completa Vitest: 332 file verdi, 3368 test verdi.
- TypeScript completo `tsc --noEmit --pretty false`: PASS.
- Oxlint: exit code 0; restano solo warning preesistenti in moduli non coinvolti e una funzione legacy inutilizzata in `hooks/navigate/useNavigateState.ts`.
- Build server eseguita con esbuild: `server_dist/index.js` generato correttamente (5.3 MB).
- Export Expo Android diretto riuscito: bundle Hermes Android generato in `/tmp/bikerlink-expo-export-android`, 17 MB, 5234 moduli e 70 asset.
- Export Expo web non eseguito perché il progetto non dichiara `react-dom`/`react-native-web`; la build statica custom è ostacolata dall'ambiente root che tenta di avviare Electron/React Native DevTools senza `--no-sandbox`.

### 2026-08-16 22:04 — Commit e stato pubblicazione

- Dopo le verifiche, tutte le modifiche del perimetro audit sono state messe in stage esplicitamente con `git add -A`.
- `git diff --cached --check`: PASS.
- Creato commit locale `ab811686` — `feat: complete bikerlink audit tracking migration`.
- Il worktree è pulito sul branch `codex/bikerlink-audit-implementation-20260816`.
- Push e apertura PR non eseguiti: il flusso di pubblicazione GitHub richiede il binario autenticato `gh`, assente nell'ambiente (`gh: command not found`). Nessun tentativo alternativo è stato usato per non bypassare il controllo di autenticazione.

## Stato iniziale rispetto alla revisione

La migrazione esistente copre parzialmente:

- centralizzazione dei watcher foreground tramite `lib/location-session-manager.ts`;
- modalità manuale/automatica e gate iniziale 5 km/h per 5 secondi;
- stato server `armed` e endpoint di attivazione;
- rimozione della route `/route/tracking` dal navigator;
- separazione iniziale di Proposte;
- raccolta dei punti durante la navigazione e salvataggio al termine.

Restano da verificare o completare almeno:

- correttezza del lifecycle del manager e dei consumer;
- ownership e gestione dei task background;
- parità funzionale tra tracking vecchio e avanzato;
- cleanup, flush, stop e crash recovery idempotenti;
- contratto di handoff della navigazione;
- consistenza dei dati server e sessioni `armed` orfane;
- registry delle route e titoli/i18n;
- test automatici e verifica di compilazione.

## Registro problemi postumi

| ID | Problema | Riproduzione | Stato | Azione |
|---|---|---|---|---|
| P-001 | Dipendenze locali mancanti per Vitest/TypeScript | `node_modules/.bin/*` assenti | aperto | riprovare installazione/verifica in ambiente autorizzato |

## Criteri di chiusura

- [ ] Nessun watcher foreground fisico fuori dal manager.
- [ ] Ownership dei task background documentata e coerente.
- [ ] Nessun caller residuo di `/route/tracking`.
- [ ] Vecchio tracking rimosso solo dopo matrice di parità e rollback verificati.
- [ ] Una sessione non resta `active`/`armed` dopo stop, unmount o crash gestito.
- [ ] La navigazione salva il percorso reale e lo rende consultabile/condivisibile.
- [ ] L’avvio automatico esclude il tempo di preparazione e usa qualità GPS, progressione e isteresi.
- [ ] Test verdi o blocchi ambientali documentati senza dichiarare falsamente la verifica.
