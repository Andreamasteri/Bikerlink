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

- PayPal donations
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

## Note Importanti

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
