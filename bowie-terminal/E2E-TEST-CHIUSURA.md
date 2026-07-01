# Test E2E — auto-chiusura Bowie Terminal su device reale

Task #5305. La logica (macchina baseline/ack + endpoint) è già coperta da unit
test e contract test (vedi sotto), ma il comportamento nativo —
`BackHandler.exitApp()` su Android e la lock screen su iOS — richiede un APK
installato su un device fisico: non è simulabile in questo ambiente.

## Verifica statica già eseguita (via codice/test, non richiede device)

- `bowie-terminal/lib/__tests__/main-app-watch.test.ts` — 8 casi sulla macchina
  baseline/ack (prima lettura = baseline senza azione, nessun falso positivo se
  il valore non cambia, trigger solo su cambiamento, idempotenza). **PASS**.
- `server/__tests__/main-app-foreground.test.ts` — contratto degli endpoint
  `POST`/`GET /api/users/me/main-app-foreground` (auth richiesta, scrittura
  solo per l'utente in sessione, formato ISO/null). **PASS**.
- Tracciato a mano il percorso `app/index.tsx` → `evaluateSignal`:
  - Ogni riavvio del terminale crea un `WatchState` nuovo (`createWatchState()`
    nel `useRef`) → la prima lettura dopo boot/login registra SEMPRE la
    baseline senza mai scattare, qualunque sia il valore letto (anche se
    BikerLink era già stato aperto prima). Questo copre "nessun falso positivo
    al login" e "nessun falso positivo al riavvio".
  - Il trigger scatta solo quando una lettura successiva differisce dalla
    baseline E non è null — cioè solo se BikerLink viene aperto DOPO che il
    terminale è già in esecuzione.
  - `Platform.OS === "android"` → `BackHandler.exitApp()`; altrimenti (iOS) →
    `setLocked(true)` mostra l'overlay a schermo intero.

Questa parte è verificata e non ha richiesto modifiche al codice.

## Cosa NON è verificabile senza device fisico

Il comportamento nativo dopo il trigger (il processo Android che termina
davvero, la lock screen iOS che compare) dipende dal runtime nativo e da un
APK installato — non esiste un emulatore o device nell'ambiente Replit
disponibile per questo agente. Questa parte richiede l'esecuzione manuale
descritta sotto.

## Checklist manuale da eseguire su device reale

Serve un APK del terminale installato (vedi `README.md` → "Build APK") e
l'app principale BikerLink installata sullo stesso account.

1. **Nessun falso positivo al login**
   - Apri il terminale Bowie, fai login.
   - Aspetta almeno 60 secondi senza toccare BikerLink.
   - Atteso: il terminale resta aperto e utilizzabile (nessuna chiusura,
     nessuna lock screen).

2. **Chiusura su Android quando si apre BikerLink**
   - Con il terminale Bowie aperto e in foreground (o in background, non
     killato), apri l'app principale BikerLink sullo stesso device/account.
   - Torna al terminale Bowie (o aspetta fino a ~50s se resta in background).
   - Atteso: il terminale si chiude da solo (processo terminato/tornato alla
     home) entro ~50 secondi dal momento in cui BikerLink va in foreground.

3. **Lock screen su iOS quando si apre BikerLink** (se disponibile un device
   iOS con build TestFlight/dev — attualmente il progetto builda solo
   Android via EAS, vedi `app.json`; da eseguire quando/se esiste un build iOS)
   - Stessa sequenza del punto 2.
   - Atteso: il terminale non si chiude da solo (iOS non permette
     l'auto-terminazione) ma mostra la schermata "BikerLink è aperto" a
     schermo intero, con invito a chiudere manualmente.

4. **Nessun falso positivo al riavvio del terminale**
   - Dopo aver eventualmente già triggerato il caso 2 in passato (quindi
     `lastMainAppForegroundAt` sul server non è null), forza la chiusura del
     terminale (kill dell'app) e riaprilo SENZA riaprire BikerLink nel
     frattempo.
   - Atteso: il terminale si apre normalmente e resta aperto (la nuova
     baseline viene registrata sul valore già esistente, nessun trigger).

## Esito

Static/code review + unit/contract test: **PASS, nessun problema rilevato**.
Verifica su device fisico: **da eseguire dall'utente** seguendo la checklist
sopra — non eseguibile da questo agente (nessun accesso a device Android/iOS
reale in questo ambiente).
