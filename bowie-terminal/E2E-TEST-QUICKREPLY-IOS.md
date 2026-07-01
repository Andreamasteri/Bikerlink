# Test E2E — quick-reply Bowie dalla lock screen iOS

Task #5313. Segue lo stesso schema di `E2E-TEST-CHIUSURA.md` (Task #5305/#5312):
il comportamento nativo di iOS (prompt permessi, testo dalla lock screen,
riavvio dell'app dopo il tap sull'azione di una notifica) dipende dal runtime
nativo e da un build installato su un iPhone fisico — non è simulabile in
questo ambiente (nessun device/simulatore iOS disponibile per questo agente).

## Verifica statica già eseguita (via codice, non richiede device)

- `bowie-terminal/lib/notifications.ts` — `setupNotifications()` registra la
  categoria `bowie_reply` con l'azione `REPLY` (text input, `opensAppToForeground:
  true`) su **entrambe** le piattaforme, poi chiama
  `Notifications.requestPermissionsAsync()`. Su iOS questo produce una
  `UNTextInputNotificationAction`, l'equivalente nativo di una quick-reply
  Android — appare sia da lock screen sia da Notification Center quando il
  permesso "alert" è concesso.
- `showPersistentNotification()` pianifica la notifica "in ascolto" con
  `categoryIdentifier: bowie_reply` su entrambe le piattaforme. `sticky`/
  `autoDismiss` sono no-op su iOS (nessun equivalente del foreground service
  Android) ma non impediscono la comparsa della notifica con l'azione REPLY.
- `extractReplyText()` — filtra la response per `actionIdentifier === "REPLY"`
  e `categoryIdentifier === "bowie_reply"`, quindi ignora tap generici o altre
  notifiche (es. la push data-only di auto-chiusura, che non ha `userText`).
- Percorso app-viva: `addReplyListener` → `submitNotificationReply` → `POST
  /notification-reply` con `deviceId` → risposta come push mirata
  (`addBowieReplyPushListener`, filtro su `data.type === "bowie_reply"`).
- Percorso cold-start: `consumePendingReply()` legge
  `Notifications.getLastNotificationResponse()` al bootstrap di
  `app/index.tsx` (dopo login, prima azione utile) ed esegue
  `clearLastNotificationResponse()` per evitare che la stessa reply venga
  reinviata alle aperture successive. Chiamato incondizionatamente su
  Android/iOS.
- `app.json` — `ios.infoPlist.UIBackgroundModes: ["remote-notification"]`
  presente (richiesto per la push data-only di auto-chiusura, non per la
  quick-reply in sé, ma verificato come effetto collaterale). Plugin
  `expo-notifications` configurato in `mode: "production"`.
- Server: `POST /ai/assistant/notification-reply` (in
  `server/routes/ai-assistant-actions.ts`) accetta `platform: "ios"`,
  applica lo stesso cooldown/in-flight guard di Android, e risponde con
  `sendBowieReplyPush(userId, { deviceId, ... })` — consegna mirata al solo
  device che ha originato la richiesta (verificato anche da
  `server/__tests__/bowie-per-device-push.test.ts`).

Questa parte è verificata via lettura del codice e non ha richiesto modifiche.

## Cosa NON è verificabile senza device fisico

- Se il prompt di permesso compare correttamente e con la formulazione attesa
  su iOS reale (differisce da Android: iOS mostra un solo prompt di sistema
  "Consenti notifiche", non un permesso runtime Android 13+).
- Se l'azione "Scrivi a Bowie" compare davvero nella UI della lock screen e in
  Notification Center (dipende dalla resa nativa di
  `UNTextInputNotificationAction`, non ispezionabile da codice).
- Tempistiche reali di `getLastNotificationResponse()` al cold-start: iOS può
  ritardare la consegna della response che ha lanciato l'app rispetto ad
  Android (comportamento noto ma non riproducibile senza device).
- Consegna end-to-end reale via APNs (permessi, rete, Focus/Low Power Mode) da
  foreground, background e app killata.

## Checklist manuale da eseguire su iPhone fisico

Serve un build iOS reale (TestFlight o dev client) di Bowie Terminal
installato su un iPhone, con l'app principale BikerLink collegata allo stesso
account.

1. **Permesso notifiche**
   - Primo avvio dopo login: deve comparire il prompt di sistema iOS per le
     notifiche. Concedere il permesso.
   - Atteso: nessun crash/blocco se l'utente nega (l'app deve continuare a
     funzionare, solo senza notifica persistente/quick-reply).

2. **Notifica persistente con azione REPLY**
   - Con l'app in background (Home/App Switcher, non killata), aprire il
     Centro Notifiche o bloccare lo schermo.
   - Atteso: la notifica "Bowie Terminal — In ascolto" è visibile con
     l'azione "Scrivi a Bowie" (tenere premuto o scorrere per rivelarla,
     comportamento standard iOS).

3. **Reply da foreground**
   - Con l'app aperta in primo piano, dal Centro Notifiche o dalla tendina
     inviare una reply tramite "Scrivi a Bowie".
   - Atteso: il testo appare come riga utente nel terminale, poi arriva la
     risposta di Bowie (via push mirata) entro ~20s (timeout di cortesia
     lato client se la push non arriva).

4. **Reply da background (non killata)**
   - Mandare l'app in background (Home, senza chiuderla dall'App Switcher).
   - Bloccare lo schermo, inviare una reply dalla lock screen.
   - Atteso: l'azione riapre l'app (foreground, per
     `opensAppToForeground: true`), il testo passa da `addReplyListener` e
     segue lo stesso percorso del punto 3.

5. **Reply da app killata (cold-start)**
   - Rimuovere l'app dall'App Switcher (force-quit).
   - Bloccare lo schermo, inviare una reply dalla lock screen sulla notifica
     persistente residua (se ancora presente) o attendere una nuova notifica
     e rispondere da lì.
   - Atteso: iOS rilancia l'app (per `opensAppToForeground: true`),
     `consumePendingReply()` recupera il testo al bootstrap e lo invia come
     se fosse stato digitato da foreground. **Nota:** iOS può impiegare più
     tempo di Android a consegnare la response che ha lanciato l'app — un
     ritardo di qualche secondo nel comparire la riga utente non è un bug.
   - Verificare anche che la stessa reply non venga rimandata una seconda
     volta se l'app viene chiusa/riaperta di nuovo senza nuove notifiche
     (verifica che `clearLastNotificationResponse()` abbia funzionato).

6. **Risposta persona corretta**
   - Verificare che una domanda generica riceva risposta come "Bowie" e una
     domanda di routing/percorso venga instradata a "Horus" (colore/etichetta
     del persona nella riga di risposta).

## Esito

Static/code review: **PASS, nessun problema rilevato** — la stessa categoria
di notifica, lo stesso filtro azione/categoria e lo stesso percorso
server-side sono già usati e testati per Android; il codice non introduce
logica specifica per iOS che diverga in modo rischioso.

Verifica su iPhone fisico: **da eseguire dall'utente** seguendo la checklist
sopra, quando avrà un device disponibile — non eseguibile da questo agente
(nessun accesso a hardware/simulatore iOS in questo ambiente).
