# BikerLink

App React Native (Expo SDK 54) per connettere motociclisti (biker) e passeggeri (zavorrine) in Italia.
Tagline: *"U'll never ride alone"*
Sponsor: Syneco Lubrificanti

## Stack Tecnologico

- **Frontend**: Expo SDK 54, Expo Router (file-based routing), React Native
- **Backend**: Express 5 + TypeScript (porta 5000)
- **Database**: PostgreSQL con Drizzle ORM
- **State Management**: React Query (@tanstack/react-query) + React Context
- **Object Storage**: Replit Object Storage per foto utenti
- **Lingua**: 5 lingue (IT/EN/DE/ES/FR) via `lib/i18n.ts` + `lib/language-context.tsx`
- **Pan-European**: Selezione paese europeo + regione (`lib/countries-regions.ts`), colonna `country` varchar(2) ISO 3166-1 in tabella `users`, retrocompatibilità con `findCountryByRegion()`

## Struttura Progetto

```
app/
  _layout.tsx           # Root layout con auth redirect
  (auth)/               # Login, registrazione, splash screen
  (tabs)/               # Tab (sx→dx): Mappa, Proposte, Ride!, Motoclub, Match, Pic!, Chat, Profilo
  admin/                # Pannello admin (gestione utenti, officine, ads, easter eggs, analytics)
  moderator/            # Pannello moderatore (approvazione foto)
  chat/[id].tsx         # Schermata chat singola
  proposals/            # Dettaglio e creazione proposte
  profile/              # Modifica profilo
  route/                # GPS tracking e dettaglio percorso
  feedback/             # Form feedback utente
  contest/              # Albo vincitori

components/
  InteractiveMap.tsx     # Mappa nativa (react-native-maps)
  InteractiveMap.web.tsx # Versione web (lista, no mappa nativa)
  RouteMap.tsx           # Mappa percorso (nativa)
  RouteMap.web.tsx       # Mappa percorso (web placeholder)
  TrackingMap.tsx        # Mappa tracking live (nativa)
  TrackingMap.web.tsx    # Mappa tracking (web placeholder)
  SynecoAd.tsx          # Banner/carousel/card pubblicitari Syneco
  ErrorBoundary.tsx      # Error boundary globale
  HelmetIcon.tsx         # Icona casco Shark Carbon SVG per SOS

server/
  routes/
    auth.ts             # Registrazione, login, logout, sessione, recupero password
    users.ts            # Profilo, foto, disponibilità, utenti vicini
    motorcycles.ts      # CRUD moto
    proposals.ts        # Proposte giri e richieste
    chat.ts             # Conversazioni e messaggi (filtro telefono)
    sos.ts              # Sistema SOS emergenza stradale
    tracking.ts         # GPS tracking, percorsi, statistiche
    contest.ts          # Contest fotografico, voti, vincitori
    workshops.ts        # Officine Syneco
    easter-eggs.ts      # Easter eggs collezionabili
    ads.ts              # Campagne pubblicitarie Syneco
    notifications.ts    # Notifiche utente
    reports.ts          # Segnalazioni utenti
    admin.ts            # Pannello admin completo (include gestione motoclub)
    moderator.ts        # Moderazione foto
    motoclubs.ts        # Motoclub: CRUD, join/leave, inviti, richieste, stats, seed 20 brand + 24 modelli
    feedback.ts         # Feedback e bug report (invia email a bikerlinkapp@gmail.com)
    invitations.ts      # Codici invito
  storage.ts            # Layer di accesso dati (Drizzle)
  backup-service.ts     # Sistema backup DB+media su Replit Object Storage (scheduler 24h, retention 90gg)
  objectStorage.ts      # Wrapper @replit/object-storage (upload, download, list, delete)
  db.ts                 # Connessione PostgreSQL
  public/
    bikerlink-manual.pdf  # Manuale utente PDF (5 lingue: IT/EN/DE/ES/FR)

scripts/
  generate-manual.ts    # Script pdfkit per rigenerare il manuale PDF

shared/
  schema.ts             # Schema database (~20 tabelle), validazione Zod, tipi TypeScript

lib/
  i18n.ts               # Internazionalizzazione (IT attivo, EN/DE predisposti)
  auth-context.tsx      # Context autenticazione globale
  query-client.ts       # Configurazione React Query + API client

constants/
  colors.ts             # Tema dark BikerLink (bg #0D0D0D, accent #FF6600)
```

## Tipi Utente

- **Biker** (M/F): motociclista, può creare proposte di giro/raduno/con zavorrina
- **Zavorrina/Zavorrino** (M/F): passeggero, può creare richieste, fino a 3 foto personali
- **Coppia** (M+M/M+F/F+F): coppia di motociclisti

## Funzionalità Principali

1. **Mappa interattiva** con utenti disponibili, officine Syneco, easter eggs
2. **Proposte/Richieste** con partecipazione e chat di gruppo
3. **Chat** privata e di gruppo con filtro numeri di telefono
4. **GPS Tracking** con statistiche (distanza, velocità, altitudine, durata)
5. **Contest fotografico** settimanale con sistema di voti (max 10/giorno)
6. **Officine Syneco** con tracking contatti per analytics
7. **Easter eggs** collezionabili con geolocalizzazione
8. **Pubblicità Syneco** (banner, carousel, card)
9. **Admin panel** completo con analytics e export CSV
10. **Moderatore** per approvazione foto con log azioni

## Placeholder (predisposti ma disabilitati)

- Integrazione Foodtracker
- Google Drive backup

## Workflow

- `Start Backend` → `npm run server:dev` (porta 5000)
- `Start Frontend` → `npm run expo:dev` (porta 8081)

## Utenti Seed

| Nickname | Email | Ruolo | Password |
|----------|-------|-------|----------|
| admin | admin@bikerlink.it | admin | admin2025! |
| moderatore | mod@bikerlink.it | moderator | mod2025! |
| user1 | user1@bikerlink.it | user | test |

Seed script: `npx tsx server/seed.ts` (idempotente, salta utenti esistenti)

## Funzionalità Recenti

- **Garage (Biker/Coppia)**: form con Marca, Modello, Cilindrata, Tipo Moto, Stile Guida + max 3 foto per moto. API: `/api/motorcycles`
- **Wishlist (Zavorrine)**: descrizione personale, max 3 foto, max 5 moto desiderate (marca, modello, tipo moto, stile guida — marca/modello opzionali). API: `/api/wishlist`
- **Match automatico flessibile**: due percorsi OR: (1) marca ESATTA + modello FUZZY (LIKE) + stile guida ESATTO; (2) tipo moto ESATTO + stile guida ESATTO (senza marca/modello). Cilindrata esclusa. Notifica "Here Comes Your Chance!!" a entrambi.
- **Chat di contatto**: unica chat di gruppo dove tutti i contatti di un utente vedono i messaggi. Chat privata disponibile ma scoraggiata.
- **Verifica email**: attivabile/disattivabile dall'admin (default OFF). Token stampato in console. Schermata `verify-email.tsx`.
- **Selettore preferenza biker**: nel profilo, sceglie chi cercare (Solo Biker / Solo Zavorrine / Entrambi). Campo `searchPreference` in `user_profiles`.
- **Colori icona profilo**: azzurro maschi, rosa donne, giallo oro coppie. `Colors.coupleIcon: '#FFD700'`
- **Privacy Policy**: pagina separata con testo GDPR placeholder, caricabile dall'admin come file .txt. Link in welcome, registrazione e profilo. API: `GET /api/settings/privacy-policy`
- **Cancellazione account**: richiesta con 30 giorni di attesa, annullabile dal profilo. Endpoint: `POST /api/users/me/request-deletion`, `POST /api/users/me/cancel-deletion`. Colonne `deletionRequestedAt`, `deletionScheduledFor` in `users`.
- **Ready to Ride**: fix bug accesso dati (`.isAvailable` flat, non `.profile.isAvailable`). Colori pulsante: verde=attivo, rosso=disattivo.
- **Mappa**: bottone "Sono Disponibile" sostituito con indicatore non cliccabile (riflette stato Ready to Ride). Click su marker utente apre pannello dettagli (garage, proposte, link profilo). Easter eggs visibili sulla mappa e collezionabili con feedback.
- **Easter Eggs**: endpoint `GET /api/easter-eggs/nearby?lat=&lng=` (query params obbligatori), `POST /api/easter-eggs/:id/collect`. Admin CRUD completo con edit, toggle attivo/disattivo, statistiche raccolte (`GET /api/admin/easter-eggs-stats`).
- **Endpoint pubblico utente**: `GET /api/users/:id/public` — restituisce profilo, bio, moto.
- **Tab labels**: fontSize aumentato a 11
- **Performance Counter**: tab tracking riscritta come contatore di performance (km totali, tempo fermo, tempo totale, velocità max, quota max). Storico record visibile sotto il contatore. Admin: pagina `app/admin/performance.tsx` con tutti i record di tutti gli utenti + ricerca per nickname. Endpoint: `GET /api/admin/performance-records`.
- **Donazione PayPal**: sezione nel profilo utente con testo personalizzato e pulsante "Dona con PayPal". Email configurabile dall'admin (nessun fallback hardcoded — se non configurata, mostra messaggio). Endpoint: `GET /api/settings/paypal`. Admin settings: casella per modificare l'email PayPal (chiave `paypal_email`).
- **Ready to Ride**: rimosse scritte "Attiva"/"Disattiva" dal pulsante, solo icona.

- **Sistema Proposte v2 con Matching Automatico**:
  - Tipi ricerca Biker/Coppia: FindAFriend, FindAGuest, Hitcher, HitchHiker
  - Tipi ricerca Zavorrine: FindABiker, HitchHiker (label "Vorrei...")
  - Ogni proposta ha: raggio ricerca (km), selezione moto dal garage (biker) o dai desideri (zavorrina), data GG/MM/AAAA, orario dalle/alle (tempo limite), tappe di ritrovo, descrizione
  - Zavorrine: opzione "Qualsiasi moto va bene", toggle tempo limite rientro
  - Coordinate GPS: il form usa le coordinate dal profilo utente come default + bottone "Usa la mia posizione" per GPS live. `/api/auth/me` restituisce `profileLatitude`/`profileLongitude`
  - Matching engine: gira ogni 60s, incrocia proposte compatibili per zona (cerchi sovrapposti), data e orario
  - Match: notifica → entrambi accettano → chat di gruppo automatica (con avviso deadline se presente)
  - Auto-cleanup: proposte scadute (expiresAt = departureTimeTo + 2h) → status "expired"
  - Cerchio raggio sulla mappa: visibile solo per l'utente quando disponibile con proposta attiva
  - `server/matching-engine.ts`: motore di matching + cleanup + protezione carico automatica (raddoppio intervallo se ciclo >85%, notifica admin, auto-ripristino sotto 30%)
- **3 Stat Card sulla mappa**: "Utenti Online", "Biker Disponibili", "Zavorrine Disponibili" — cliccabili, aprono modal con lista utenti (9 dettagli + distanza). Endpoint separati: `online-count`, `biker-available-count`, `zavorrine-available-count`, e relativi `-list`. L'utente corrente è incluso nelle liste.
- **Sistema Advertisement**: Banner pubblicitari sulla mappa, con targeting per tipo utente (biker/zavorrina/coppia). Rotazione automatica configurabile (durata, random/sequenziale). Pannello admin "Advertisement" con 3 sezioni separate. Upload immagini, link cliccabili, toggle attivo/disattivo, date inizio/fine opzionali. Endpoint: `GET /api/ads/my-ads`, `POST /api/ads/:id/click`, CRUD admin su `/api/admin/advertisements`. Colonne aggiunte a `ad_campaigns`: `target_user_type`, `rotation_duration`, `rotation_mode`, `sort_order`.
- **Filtri Proposte rinominati**: Tutti, Giro, Passaggio, Zavorrina, Richieste — filtrano per searchType. Stile più essenziale.
- **Fix tasto indietro Android**: Rimosso BackHandler che bloccava tutto.

- **Sistema Utenti Finti (Fake Users)**:
  - 52 utenti finti: 20 biker (18M+2F), 30 zavorrine (29F+1M), 2 coppie (M+F)
  - Tutti con `is_fake=true`, online, bio con dialetti regionali autentici
  - Biker e coppie sempre disponibili. Zavorrine con disponibilità randomica (job ogni 5 min)
  - Admin override: se admin imposta manualmente stato, il job non lo sovrascrive per 1 ora (`admin_override_until`)
  - Tracking interazioni: `fake_user_interactions` traccia profile_view, chat_request, chat_message
  - API admin: CRUD su `/api/admin/fake-users`, toggle disponibilità/online, chat viewer
  - Pannello admin: `app/admin/fake-users.tsx` — filtri per tipo, contatori, toggle, chat, form creazione
  - Seed: `npx tsx server/seed-fake-users.ts` (idempotente, salta se >10 fake users esistono)
  - Toggle "Mostra anche offline" nelle 3 stat card modals (auto-disattivazione dopo 30s con countdown)
  - Utenti offline mostrati con opacità 0.5 e dot grigio

- **Percorsi Personalizzati**: creazione di percorsi con waypoint (Partenza, Sosta, Punto di Interesse, Arrivo) su mappa. Percorsi pubblici/privati, riordinamento tappe. Toggle admin in sezione "A Pagamento" (default attivo). Tabelle: `custom_routes`, `custom_route_waypoints`. API: `/api/custom-routes` (ritorna `{ myRoutes, publicRoutes }`), `/api/custom-routes/:id/waypoints`. Schermate: `app/routes/index.tsx` (lista), `app/routes/create.tsx` (editor con avviso beta), `app/routes/[id].tsx` (dettaglio con pulsante "Apri in Google Maps"). Mappa si centra su ultimo waypoint. Pulsante "I Miei Percorsi" nel tab Ride!
- **Auto-eliminazione proposte scadute**: le proposte con status "expired" vengono eliminate automaticamente dal database ogni 60s dal matching engine (insieme ai match e partecipanti associati)
- **Sezione Admin "A Pagamento"**: sezione nel pannello admin che raggruppa le funzioni premium future. Attualmente contiene: Match Automatico e Percorsi Personalizzati. Setting keys: `auto_matching_enabled`, `custom_routes_enabled`.
- **Schema colori**: cambiato da oro Grindr a KTM arancione `#FF6600`. Icone proposte: blu (biker) + rosa (zavorrina) per proposte "Con Zavorrina"; badge rosa. "Giro" rinominato "Giro tra Biker".
- **Ottimizzazioni startup**: endpoint batch `/api/settings/all` (6 query DB in parallelo → 1 chiamata), hook `useSetting()` in `lib/settings-context.ts`, timer countdown offline attivo solo quando necessario, logging backend ottimizzato (no JSON body su 304, troncamento a 200 chars).
- **Pubblica Performance su Pic!**: pulsante share su ogni record di performance nel tab Tracking. Apre modale con campo testo, poi pubblica come entry nel contest. Le entry con `performanceData` vengono renderizzate come card stilizzata (sfondo scuro, dati performance) nel feed Pic! invece di un'immagine. Campo `performance_data` (text JSON) aggiunto a `photo_contest_entries`.

## Tabelle DB Aggiuntive

- `motorcycle_photos`: foto moto (max 3 per moto)
- `zavorrina_wishlists`: wishlist zavorrina (1 per utente) — nome tabella DB con "zavorrina"
- `zavorrina_wishlist_photos`: foto personali wishlist (max 3)
- `zavorrina_wishlist_motos`: moto desiderate wishlist (max 5), include `motorcycle_type` (varchar nullable)
- `biker_zavorrina_matches`: match tra biker e zavorrine, colonna `zavorrina_id`
- `proposal_matches`: match automatici tra proposte (proposalId1, proposalId2, userId1, userId2, status, acceptedByUser1/2, conversationId)
- `email_verification_tokens`: token verifica email
- `fake_user_interactions`: tracking interazioni utenti reali con utenti finti (profile_view, chat_request, chat_message)
- Colonna `isFake` in `users`, `adminOverrideUntil` in `user_profiles`
- Colonna `emailVerified` in `users`, `searchPreference` in `user_profiles`

## Note Importanti

- **MAI usare `configureWorkflow()`** per riavviare workflow — riscrive la sezione `[[ports]]` nel `.replit` e rompe il mapping delle porte. Usare SOLO `restart_workflow`.
- **Configurazione porte nel `.replit` NON va mai toccata.** Mapping corretto: `5000→5000`, `8081→80`, `8082→3000`.
- Metro zombie risolto: lo script `scripts/start-expo.sh` massacra automaticamente i processi sulla porta 8081 prima di avviare Metro. Il workflow "Start Frontend" usa questo script.
- react-native-maps: usare componenti con pattern `.web.tsx` per compatibilità web
- KeyboardProvider: escluso su web (causa errore hooks)
- react-native-maps pinnato a 1.18.0 per compatibilità Expo Go
- Schema DB: non modificare tipi colonne ID (varchar UUID)
- Filtro telefono chat: persistente su DB (tabella `phone_sharing_tracker`)
- EULA: caricabile come file .txt dall'admin panel (sezione Impostazioni)
- expo-document-picker: usato per upload EULA nell'admin
- Registrazione: conferma password, prefisso telefonico internazionale (default +39), regione e anno di nascita opzionali (aggiungibili dal profilo)
- Recupero password: endpoint simulato (token stampato in console backend), schermata `forgot-password.tsx`
- Tabella DB: `password_reset_tokens` per token di reset password

## Sessione Sicurezza & Funzionalità (Marzo 2026)

### Sicurezza
- **T004**: Profili pubblici espongono solo campi sicuri (id, nickname, userType, sex, birthYear, region, avatarUrl, bio, motorcycles, photos). Email/ruolo/status rimossi da `/nearby`, `/search`, `/:id/public`.
- **T011**: Verifica età 18+ alla registrazione (server + client, messaggio italiano)
- **T012**: Cookie sessione `secure: true` in produzione
- **T013**: Rate limiting: login (5/15min), registrazione (3/h), recupero password (3/h) con `express-rate-limit`

### Fix & Miglioramenti
- **T001**: Web blank page fix (serve web export files from root with `{ index: false }` so absolute asset paths like `/_expo/...` resolve correctly)
- **T002**: Heartbeat middleware (aggiorna `lastLoginAt` ogni 5 min per utenti autenticati)
- **T003**: Server build format `--format=cjs` (fix warning Node.js ESM)
- **T006**: Suono notifica nuovi messaggi (migrato da `expo-av` deprecato a `expo-audio`)
- **T007**: Auto-unavailable quando l'app va in background (AppState), ripristino al ritorno
- **T008**: "FindAGuest" → "Trova Zavorrina"
- **T009**: Fix KeyboardAwareScrollViewCompat per iOS (KeyboardAvoidingView + ScrollView)
- **T010**: app.json aggiornato con metadati BikerLink reali + permessi iOS in italiano
- **T024**: "Cerco" → "Ricerca Match con ..."

### Chat
- **T005**: Badge arancione non-letto sul tab Chat (polling 30s, endpoint `/api/chat/unread-total`)

### Admin Panel
- **T014**: Toggle "Chatbot Utenti Fittizi" spostato da Settings a Fake Users
- **T015**: Toggle master "Abilita utenti fake" (abilita/disabilita tutti)
- **T016**: Label "FAKE" in fucsia sopra nickname fake users nel pannello utenti
- **T017**: Filtro "Nascondi fake" nel pannello utenti admin
- **T018**: "Cambia ruolo" sostituito con "Rendi Moderatore" + "Elimina profilo" con doppia conferma
- **T019**: "Campagne Syneco" → "Advertisement", label analytics rinominate
- **T020**: "Utenti totali" esclude fake, card cliccabile con lista utenti + badge "Nuovo 24h/48h"
- **T021**: "Utenti Attivi (30gg/7gg)" cliccabili con lista e lastLoginAt
- **T022**: "Advertisement" cliccabile con statistiche click dettagliate
- **T023**: "Segnalazioni pendenti" cliccabile con lista report pendenti

### Primal User
- Colonna `is_primal` aggiunta a `users` (boolean, default false)
- Toggle admin "Primal User" in Impostazioni: quando attivo, i nuovi utenti registrati ricevono `isPrimal = true`
- Tutti gli utenti reali esistenti marcati come Primal
- Badge "PRIMAL" dorato (#FFD700) visibile nel pannello admin utenti e nel profilo utente
- Endpoint: `GET /api/settings/primal-user`, setting key: `primal_user_enabled`
- Gli utenti Primal saltano la verifica email (login/registrazione senza blocco)

### GDPR (Marzo 2026)
- **Task #109**: Tracciabilità consensi — colonne `eula_accepted`, `eula_accepted_at`, `privacy_accepted`, `privacy_accepted_at` in `users`. Migration: `migrations/0002_gdpr_consent_fields.sql`
- **Task #110**: Export dati completo art. 20 — `GET /api/user/export-data` include foto, percorsi GPS, messaggi inviati, contest
- **Task #111**: Revoca consenso — voce "Revoca consenso" nel profilo (Modal, chiama `POST /api/users/me/request-deletion`). Privacy policy aggiornata in 5 lingue con tutti i dati raccolti (anno nascita, paese, regione, tipo utente)

### Email SMTP (Gmail)
- Servizio email: `server/email.ts` con nodemailer + Gmail SMTP
- Credenziali: lette da DB (`gmail_user`, `gmail_app_password` in app_settings), fallback su env vars `GMAIL_USER` / `GMAIL_APP_PASSWORD`
- Card "Email SMTP (Gmail)" in admin settings con stato configurazione (pallino verde/rosso)
- Modifica protetta con lock: richiede la password admin per cambiare le credenziali Gmail
- Modal con campi: password admin, indirizzo Gmail, password per le app Google
- Icona ⓘ con istruzioni per creare la password per le app
- Endpoints: `GET /api/admin/settings/email-config`, `PUT /api/admin/settings/email-config`
- `sendVerificationEmail()` invia email HTML brandizzata con codice 6 cifre
- `sendEmail()` funzione generica per usi futuri
- Se email fallisce, notifica admin come backup (non crasha)

## Generazione APK Android (EAS Build)

### Prerequisiti
1. Account Expo su [expo.dev](https://expo.dev) (gratuito)
2. EAS CLI installata: `npm install -g eas-cli`
3. Login: `eas login`
4. Collegare il progetto: `eas init --id <APP_ID>` (solo prima volta, crea il progetto su expo.dev)

### Build APK per test interni (profilo `preview`)
```bash
eas build --platform android --profile preview
```
- Produce un file `.apk` installabile direttamente su qualsiasi Android
- Non richiede Play Store
- Il link per il download appare al termine del build su expo.dev

### Build AAB per Play Store (profilo `production`)
```bash
eas build --platform android --profile production
```
- Produce un `.aab` ottimizzato per la distribuzione su Google Play

### Configurazione (già pronta)
- `eas.json`: profili `preview` (APK) e `production` (AAB) configurati
- `app.json`: package `com.bikerlink.app`, version `1.0.0`, versionCode `1`
- Icone adaptive Android presenti in `assets/images/`
- Immagini Play Store presenti: `playstore-icon.png`, `playstore-feature-graphic.png`

### Note
- Il keystore Android viene generato automaticamente da EAS al primo build
- `google-services.json` NON necessario (nessun modulo Firebase)
- Per aumentare la versione: incrementare `versionCode` in `app.json` e `version` prima di ogni nuovo build

