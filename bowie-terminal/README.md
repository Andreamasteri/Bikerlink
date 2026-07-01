# Bowie Terminal

Mini-APK Android standalone — un terminale AI stile hacker che espone le persona
del backend BikerLink (**Bowie** = entry, **Horus** = routing, **Ares** = admin
diagnostics) via streaming SSE. Schermo intero, font monospaziato, palette
BikerLink, login una volta sola.

> Progetto **separato** dall'app BikerLink principale. Ha il proprio
> `package.json` / `node_modules` e bundle ID `com.bikerlink.bowieterminal`.
> Riusa il backend esistente (`biker-link.replit.app`) — non ha server proprio.

## Struttura

```
bowie-terminal/
  app/
    _layout.tsx     # Stack senza header/tab, notification handler
    index.tsx       # Terminale: stream benvenuto, FlatList invertita, input prompt
    login.tsx       # Login stile terminale (LOGIN: / PASSWORD:)
  lib/
    bowie-client.ts # login + SSE sendMessage + notification-reply + push-token
    session.ts      # SecureStore: token, ruolo, tema
    notifications.ts# notifica persistente + quick-reply (POC) + background task
  constants/
    theme.ts        # 4 temi BikerLink (attuale/asfalto/velocita/rotta)
  app.json eas.json tsconfig.json babel.config.js
  assets/images/icon.png
```

## Setup locale

```bash
cd bowie-terminal
npm install
npx eas init            # genera extra.eas.projectId in app.json (richiede login Expo)
npx expo start          # dev (Expo Go: notifiche push non funzionano in Go)
```

> ⚠️ Non lanciare `npx expo start` nella root del repo BikerLink — questa è
> un'app a sé. Lavora sempre dentro `bowie-terminal/`.

## Comandi nel terminale

- `logout` — cancella il token e torna al login
- `clear` — pulisce lo schermo
- `theme <attuale|asfalto|velocita|rotta>` — cambia palette (persistita)
- `help` — elenca i comandi

Qualsiasi altro testo viene inviato all'AI. L'handoff a Horus/Ares è deciso dal
backend e colora automaticamente il prefisso della risposta.

## Sessione & sicurezza

- Login: `POST /api/auth/login` con `{ identifier, password, platform: "android" }`.
  Il `sessionToken` è salvato in SecureStore; al riavvio si salta il login.
- Ogni chiamata usa `Authorization: Bearer <token>` (bridge Bearer→cookie del backend).
- **401/403** → la UI mostra `SESSION EXPIRED — reconnecting...`, cancella il token
  e torna al login.
- I guardrail anti-leak (system prompt + filtro output server-side + log
  `ai_call_logs.security_blocked`) sono **lato backend**: il terminale riceve già
  la risposta filtrata. Nessun segreto è hardcoded nel client.

## Notifica persistente Android — ⚠️ POC

Lo step "quick-reply ad app terminata" (Task #5222, step 6) è un **POC non
collaudato**:

- **Funziona** (app viva, foreground/background): la quick-reply arriva al
  listener, viene inoltrata a `POST /api/ai/assistant/notification-reply`, e la
  risposta torna come push.
- **Non garantito** (app completamente chiusa): l'headless text-reply dipende
  dall'OS/SDK. Se non si risveglia il task, il **fallback accettabile** è che la
  notifica apra l'app.
- Il push token viene registrato su `PUT /api/users/me/push-token`. ⚠️ Questo
  **condivide** il campo `users.expoPushToken` con l'app BikerLink principale:
  l'ultimo install che registra il token riceve le push. Convivenza dei due APK
  sullo stesso account = limite noto del POC.

Push reali richiedono credenziali FCM configurate via `eas credentials` (non
funzionano in Expo Go).

## Build APK

Stesso flusso dell'app principale (`scripts/eas.sh`), ma con root dir dedicata:

```bash
# dalla root del repo BikerLink
GIT_INDEX_FILE=/tmp/eas-build-index \
  bash scripts/eas.sh build --platform android --profile release-apk \
  --root-dir bowie-terminal
```

Se `scripts/eas.sh` non supporta `--root-dir`, esegui da dentro `bowie-terminal/`:

```bash
cd bowie-terminal
# dopo npm install, correggi il proxy Replit nel lockfile (vedi memoria del repo):
sed -i 's|http://package-firewall\.replit\.local/npm/|https://registry.npmjs.org/|g' package-lock.json
GIT_INDEX_FILE=/tmp/eas-build-index npx eas build --platform android --profile release-apk
```

Bundle ID `com.bikerlink.bowieterminal` — **nessuna collisione** con
`com.bikerlink.app` (BikerLink principale): i due APK si installano in parallelo.
