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
- **Lingua**: Italiano (i18n predisposta per EN/DE via `lib/i18n.ts`)

## Struttura Progetto

```
app/
  _layout.tsx           # Root layout con auth redirect
  (auth)/               # Login, registrazione, splash screen
  (tabs)/               # Tab principali: Mappa, Proposte, Chat, Contest, Profilo
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

server/
  routes/
    auth.ts             # Registrazione, login, logout, sessione, recupero password
    users.ts            # Profilo, foto, disponibilità, utenti vicini
    motorcycles.ts      # CRUD moto
    proposals.ts        # Proposte giri e richieste
    chat.ts             # Conversazioni e messaggi (filtro telefono)
    tracking.ts         # GPS tracking, percorsi, statistiche
    contest.ts          # Contest fotografico, voti, vincitori
    workshops.ts        # Officine Syneco
    easter-eggs.ts      # Easter eggs collezionabili
    ads.ts              # Campagne pubblicitarie Syneco
    notifications.ts    # Notifiche utente
    reports.ts          # Segnalazioni utenti
    admin.ts            # Pannello admin completo
    moderator.ts        # Moderazione foto
    feedback.ts         # Feedback e bug report
    invitations.ts      # Codici invito
  storage.ts            # Layer di accesso dati (Drizzle)
  db.ts                 # Connessione PostgreSQL

shared/
  schema.ts             # Schema database (~20 tabelle), validazione Zod, tipi TypeScript

lib/
  i18n.ts               # Internazionalizzazione (IT attivo, EN/DE predisposti)
  auth-context.tsx      # Context autenticazione globale
  query-client.ts       # Configurazione React Query + API client

constants/
  colors.ts             # Tema dark BikerLink (bg #0D0D0D, accent #D4A017)
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
- **Donazione PayPal**: sezione nel profilo utente con testo personalizzato e pulsante "Dona con PayPal". Email configurabile dall'admin (default: `Andreamasteri81@gmail.com`). Endpoint: `GET /api/settings/paypal`. Admin settings: casella per modificare l'email PayPal (chiave `paypal_email`).
- **Ready to Ride**: rimosse scritte "Attiva"/"Disattiva" dal pulsante, solo icona.

- **Sistema Proposte v2 con Matching Automatico**:
  - Tipi ricerca Biker/Coppia: FindAFriend, FindAGuest, Hitcher, HitchHiker
  - Tipi ricerca Zavorrine: FindABiker, HitchHiker (label "Vorrei...")
  - Ogni proposta ha: raggio ricerca (km), selezione moto dal garage (biker) o dai desideri (zavorrina), data GG/MM/AAAA, orario dalle/alle (tempo limite), tappe di ritrovo, descrizione
  - Zavorrine: opzione "Qualsiasi moto va bene", toggle tempo limite rientro
  - Matching engine: gira ogni 60s, incrocia proposte compatibili per zona (cerchi sovrapposti), data e orario
  - Match: notifica → entrambi accettano → chat di gruppo automatica (con avviso deadline se presente)
  - Auto-cleanup: proposte scadute (expiresAt = departureTimeTo + 2h) → status "expired"
  - Cerchio raggio sulla mappa: visibile solo per l'utente quando disponibile con proposta attiva
  - `server/matching-engine.ts`: motore di matching + cleanup
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
- Se Metro non parte per port conflict (EADDRINUSE 8081): prima uccidere i processi zombie (`ps aux | grep expo` + `kill -9`), poi `restart_workflow`.
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
