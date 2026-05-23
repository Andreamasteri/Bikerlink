# BikerLink — Storia dei Task

> **299 task** esportati
> Generato il: 2026-05-23T22:13:53.815Z

---
## #1 — Sistema SOS Biker - Emergenza stradale

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-12 01:34:52 UTC |
| **Aggiornato** | 2026-04-08 20:40:56 UTC |

### Richiesta

# SOS Biker Emergency System

  ## What & Why
  Add an emergency/distress system that allows any user (biker, zavorrina, coppia) to request roadside help from nearby bikers. Two helmet-shaped buttons (Shark Carbon style, signal orange) appear on the available users screen below the routes section. The left helmet has the label "SOS" underneath, the right helmet has the label "ACCOGLI SOS" underneath. The left helmet activates a distress request (with a reason input), the right helmet accepts another user's request. Accepting opens a private chat between the two users. Admin can globally enable/disable this feature.

  ## Done looks like
  - Two helmet-shaped buttons visible on the main screen (below routes), styled as Shark Carbon integral helmets in signal orange
  - Left helmet has "SOS" label underneath; right helmet has "ACCOGLI SOS" label underneath
  - Pressing the left helmet opens a modal to type the emergency reason, with placeholder suggestions (foratura, batteria, sequestro mezzo)
  - The request includes the user's GPS position
  - Other nearby users see active SOS requests and can accept them via the right "ACCOGLI SOS" helmet
  - Accepting a request opens a private chat between helper and requester
  - The left helmet can be pressed again to manually cancel the request
  - The request is auto-deactivated when someone accepts it
  - Admin can enable/disable the SOS feature globally from settings; when disabled, both helmet buttons are hidden
  - SOS requests are stored in the database with status tracking

  ## Out of scope
  - Push notifications for SOS requests (future work)
  - Automatic timeout/expiry of SOS requests
  - Multiple simultaneous SOS requests from the same user

  ## Tasks
  1. **Database schema** — Add `sos_requests` table with fields: id, requester user id, helper user id, reason, status (active/accepted/cancelled), GPS latitude/longitude, conversation id (linked when accepted), timestamps.

  2. **Admin setting** — Add `sos_enabled` 

_(troncato)_

### Risultato

## Relevant files
- `app/(tabs)/index.tsx`
- `shared/schema.ts`
- `server/routes/chat.ts`

---
## #2 — Raggio SOS visibile in rosso sulla mappa

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-12 01:44:07 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# SOS Radius on Map

## What & Why
When a user sends an SOS request, they should set a radius of action. This radius must be displayed as a highly visible RED circle on the interactive map, so other users can see the SOS area clearly.

## Done looks like
- SOS creation modal includes a radius selector (e.g. 5, 10, 20, 50 km)
- The SOS radius is stored in the database alongside the request
- Active SOS requests appear on the InteractiveMap as bright RED circles centered on the requester's GPS position
- The circles are clearly visible (red fill with transparency, solid red border)
- SOS markers also appear at the center of each circle with a helmet or warning icon

## Out of scope
- SOS notifications/push alerts
- Filtering SOS by distance

## Tasks
1. **Database migration** — Add `radius_km` integer column (default 10) to the `sos_requests` table.
2. **Backend update** — Accept `radiusKm` in the SOS creation endpoint and return it in active SOS queries.
3. **SOS modal radius picker** — Add a radius selector (5/10/20/50 km) to the SOS creation modal in `index.tsx`, send it with the API call.
4. **Map integration** — Pass active SOS data to `InteractiveMap`, render red Circle overlays and SOS marker pins for each active request.

## Relevant files
- `shared/schema.ts:719-738`
- `server/routes/sos.ts`
- `server/storage.ts:1458-1484`
- `app/(tabs)/index.tsx`
- `components/InteractiveMap.tsx`

### Risultato

- SOS creation modal includes a radius selector (e.g. 5, 10, 20, 50 km)
- The SOS radius is stored in the database alongside the request
- Active SOS requests appear on the InteractiveMap as bright RED circles centered on the requester's GPS position
- The circles are clearly visible (red fill with transparency, solid red border)

---
## #3 — Sposta tasti SOS nella tab Ride! con immagini personalizzate

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-12 02:14:46 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Move SOS buttons to Ride! tab with custom images

  ## What & Why
  The two SOS buttons (launch SOS + accept SOS) are currently on the main map screen (index.tsx). The user wants them moved to the "Ride!" tab (ready.tsx), placed below the existing options ("Registra Giro" and "I Miei Percorsi"). The SVG helmet icons must be replaced with provided/generated images (no white background).

  ## Done looks like
  - SOS buttons removed from app/(tabs)/index.tsx
  - SOS buttons added to app/(tabs)/ready.tsx, below the two existing route buttons
  - Left button (SOS): uses attached_assets/Safe-Wheels_loc-472x1024(1)_1773281607433.jpg — motorcycle crash silhouette icon. Must remove white background.
  - Right button (ACCOGLI SOS): uses assets/images/sos-accept-icon.png — two people helping each other near fallen motorcycle, silhouette style, already has transparent background.
  - All SOS state, queries, mutations, and modals moved to ready.tsx
  - The SOS data (activeSosRequests) still passed to InteractiveMap on index.tsx for red circle rendering on map
  - RED CIRCLE on map must be very visible: use a strong red fill (e.g. rgba(255, 0, 0, 0.30) or higher opacity) and bold red stroke so it stands out clearly on the dark map
  - The HelmetIcon SVG component usage in modals also replaced with the new images
  - Radius picker (5/10/20/50 km) preserved in the SOS creation modal

  ## Images
  - SOS launch: attached_assets/Safe-Wheels_loc-472x1024(1)_1773281607433.jpg (needs bg removal, copy to assets/)
  - SOS accept: assets/images/sos-accept-icon.png (already generated with transparent bg)

  ## Relevant files
  - app/(tabs)/index.tsx — remove SOS buttons/modals/state, keep activeSosQuery for map circles
  - app/(tabs)/ready.tsx — add SOS buttons, queries, mutations, modals
  - components/InteractiveMap.tsx — increase red circle visibility (stronger fill/stroke)
  - components/HelmetIcon.tsx — can be removed after migration
  - assets/images/ — SOS images

  ## Tab order r

_(troncato)_

### Risultato

## Tab order reminder (left to right)
Mappa, Proposte, Ride!, Match, Pic!, Chat, Profilo

---
## #4 — Stile tasti SOS: rinomina, dimensioni, colori, spaziatura

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-12 02:29:04 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Stile tasti SOS: rinomina, dimensioni, colori, spaziatura

## Cosa fare
4 modifiche ai due tasti SOS in app/(tabs)/ready.tsx:

1. **Rinomina tasto sinistro**: da "SOS" a "Lancia SOS"
2. **Raddoppia le dimensioni**: icone da 72x56 a ~144x112, label proporzionate
3. **Cambia colori**:
   - Tasto sinistro (Lancia SOS): rosso (tintColor, label, stile attivo tutto rosso)
   - Tasto destro (Accogli SOS): blu carico (tintColor, label tutto blu)
4. **Maggiore distanza** tra i due tasti: aumentare il gap nella sosRow

## File coinvolto
- app/(tabs)/ready.tsx — solo modifiche agli stili e al testo del tasto sinistro

### Risultato

## File coinvolto
- app/(tabs)/ready.tsx — solo modifiche agli stili e al testo del tasto sinistro

---
## #5 — Fix raggio SOS: rimuovi 5km, aggiungi campo personalizzato, fix Invia SOS

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-12 02:39:07 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix raggio SOS e bottone Invia

## Cosa fare

### 1. Rimuovere la casella 5 km
- Nel modal SOS in ready.tsx, cambiare `[5, 10, 20, 50]` in `[10, 20, 50]`
- Il default iniziale è già 10 km, quindi nessun altro cambio necessario

### 2. Aggiungere casella raggio personalizzato
- Dopo i chip 10/20/50, aggiungere un TextInput numerico per inserire km a mano
- Quando l'utente scrive un valore custom, i chip preimpostati si deselezionano
- Quando l'utente seleziona un chip, il campo custom si svuota
- Il valore custom viene usato in sosRadiusKm

### 3. Fix bottone "Invia SOS"
- Il problema: nella preview web il GPS spesso non viene concesso, location resta null, e il bottone mostra solo l'alert senza inviare
- Soluzione: se location è null, usare coordinate di fallback (centro Italia ~42.5, 12.5) e avvisare l'utente che la posizione è approssimata
- Anche verificare che la mutation API funzioni correttamente

## File
- app/(tabs)/ready.tsx

### Risultato

## File
- app/(tabs)/ready.tsx

---
## #6 — Rettifiche layout schermata iniziale: counter, header casco, ad space, SOS overlay

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-12 03:06:00 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Rettifiche layout schermata iniziale (index.tsx)

## Elenco elementi schermata (dall'alto in basso) — RIFERIMENTO
1. Scritta "BikerLink" con chat icon
2. Barra di ricerca utenti
3. Versione compatta della mappa
4. Counter utenti online/attivi (3 card)
5. Spazio campagne advertisement
6. Tab bar per le varie funzioni

## Modifiche richieste

### A. Counter (punto 4) — layout su due righe con icona a sinistra
Attualmente i 3 counter hanno: icona in alto → numero → label sotto.
Cambiare a: icona a sinistra del numero (in riga), label su una seconda riga sotto.
Layout verticale: [icona + numero in riga] / [label sotto].
Le label "Utenti Online", "Biker Disponibili", "Zavorrine Disponibili" vanno messe su due righe ciascuna:
- "Utenti\nOnline"
- "Biker\nDisponibili"
- "Zavorrine\nDisponibili"

File: `app/(tabs)/index.tsx` — linee ~623-638 (JSX) e ~1116-1126 (stili)

### B. Counter — ridurre bordo/padding
Ridurre il padding delle statCard dal valore attuale (`padding: 16`) a qualcosa di più compatto (es. `paddingVertical: 8, paddingHorizontal: 10`), e ridurre il gap nella statsRow. Obiettivo: card più strette, più spazio disponibile.

File: `app/(tabs)/index.tsx` — stili `statCard`, `statsRow`

### C. Header — aggiungere immagine casco stilizzato accanto a "BikerLink"
Generare un'immagine di casco da moto stilizzato (PNG trasparente, stile minimal/silhouette).
Salvarla in `assets/images/helmet-logo.png`.
Aggiungerla a destra della scritta "BikerLink" nel header (linea ~475).
Niente sfondo bianco — tintColor arancione come il tema dell'app.

File: `app/(tabs)/index.tsx` — header JSX (~475), nuovo file `assets/images/helmet-logo.png`

### D. Advertisement — massimizzare lo spazio
Attualmente `adImage` ha `height: 100` — troppo piccolo.
Aumentare significativamente l'altezza dell'ad banner, portandolo fino quasi ai tab (punto 6).
Usare `flex: 1` o un'altezza molto maggiore (es. 250-300px) e ridurre i margini.
Rimuovere `marginTop` eccessivo o paddings che limitano lo spazi

_(troncato)_

### Risultato

File: `app/(tabs)/index.tsx` — aggiungere overlay condizionale nel JSX dell'adBanner, nuovi stili
L'`activeSosQuery` è già disponibile nel componente (linea ~279).

---
## #7 — Rimuovi Accogli SOS, centra Lancia SOS, dettaglio SOS dal triangolo

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-12 03:26:48 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Rimuovi tasto Accogli SOS, centra Lancia SOS, dettaglio SOS da triangolo

## Modifiche

### 1. Rimuovi tasto blu "Accogli SOS" da ready.tsx
- Rimuovere il Pressable del tasto destro (linee ~250-265) con sosAcceptIcon e badge
- Rimuovere il modal showSosListModal e tutto il suo contenuto
- Rimuovere gli stili: sosIconRight, sosLabelRight, sosBadge, sosBadgeText, listSheet*, sosListCard, etc.
- Rimuovere lo state showSosListModal
- NON rimuovere: sosAcceptIcon import (serve nel punto 3 su index.tsx), acceptSosMutation, activeSosQuery

### 2. Ingrandisci e centra tasto "Lancia SOS" in ready.tsx
- sosIconLeft: width da 144 a ~187 (30% in più), height da 112 a ~146
- sosLabelLeft: fontSize da 16 a ~21
- sosRow: rimuovere gap (c'è un solo tasto), assicurare justifyContent center

### 3. Triangolo SOS in index.tsx apre dettaglio richiesta
- Rendere il sosOverlay cliccabile (Pressable) — onPress apre un modal
- Nuovo modal "SOS Detail" con:
  - Immagine blu sos-accept-icon.png come intestazione (tintColor #003399)
  - Dettagli della prima richiesta SOS attiva (nome, motivo, ora, raggio)
  - Tasto "Accetta richiesta di soccorso" — chiama accept SOS API, poi naviga alla chat
  - Tasto chiudi (X in alto a destra) per chiudere senza accettare
- Serve: acceptSosMutation in index.tsx (aggiungere), import sosAcceptIcon, import router

## File
- app/(tabs)/ready.tsx — punti 1 e 2
- app/(tabs)/index.tsx — punto 3

### Risultato

## File
- app/(tabs)/ready.tsx — punti 1 e 2
- app/(tabs)/index.tsx — punto 3

---
## #8 — Genera manuale d'uso BikerLink per utenti

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-12 03:36:54 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Manuale d'uso BikerLink

  ## Obiettivo
  Generare un manuale d'uso completo in italiano per gli utenti dell'app BikerLink.
  Deve coprire tutte le funzionalità accessibili dall'utente normale.
  NON includere: pannello admin, pannello moderatore, gestione advertisement, branding Syneco.

  ## Contenuti da documentare
  - Registrazione e login (3 tipi utente, 4 step)
  - Schermata principale (mappa, ricerca, counter, SOS)
  - Tab Proposte (creazione, categorie, filtri)
  - Tab Ride! (disponibilità, SOS, registrazione percorsi)
  - Tab Match (matching automatico, garage matching, accetta/rifiuta)
  - Tab Pic! (contest settimanale, votazione, hall of fame)
  - Tab Chat (messaggi privati/gruppo, condivisione posizione)
  - Tab Profilo (modifica profilo, garage/wishlist, foto, statistiche)
  - Funzioni speciali (Easter Eggs, performance tracking, feedback)

  ## SEZIONE ESTENSIVA: Match Automatico

  Il manuale DEVE contenere una sezione dedicata al Match Automatico, descritta in modo esteso e chiaro per l'utente. Deve coprire i seguenti punti:

  ### A. Matching per Proposte di viaggio
  - Il sistema esegue un controllo automatico periodico (ogni 60 secondi circa) per trovare compatibilità tra le proposte create dagli utenti.
  - Spiegare i criteri di compatibilità:
    - **Tipo di ricerca**: le proposte vengono abbinate in base al tipo. Ad esempio "Cerca un amico" si abbina con "Cerca un amico", "Cerca un passeggero" si abbina con "Cerca un biker", "Autostoppista" si abbina con "Chi offre passaggio".
    - **Compatibilità geografica**: il sistema calcola la distanza tra i punti di partenza delle due proposte. Il match avviene solo se la distanza è entro il raggio di ricerca impostato da entrambi gli utenti (default 50 km).
    - **Compatibilità temporale**: le proposte devono essere nello stesso giorno e gli orari di partenza devono sovrapporsi almeno parzialmente.
  - Descrivere cosa succede quando viene trovato un match:
    - L'utente riceve una notifica nella Ta

_(troncato)_

### Risultato

## Output
File: manuale-utente-bikerlink.md nella root del progetto

---
## #9 — Sicurezza pre-APK: chiave sessione, token nei log, PayPal hardcoded

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-13 13:21:06 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Sicurezza pre-APK

## What & Why
Risolvere tre problemi di sicurezza prima della build APK di produzione:
1. La chiave di sessione usa un valore di fallback leggibile nel codice sorgente
2. I token di reset password e verifica email vengono stampati nei log del server
3. L'email PayPal è hardcoded in più punti del codice

## Done looks like
- La chiave di sessione è una stringa casuale lunga, salvata come variabile d'ambiente segreta (non più nel codice)
- I log del server non mostrano più token sensibili (verifica email, reset password)
- L'email PayPal non è più hardcoded: viene letta solo dalle impostazioni del database, senza fallback hardcoded

## Out of scope
- Configurazione CORS per produzione (task separato)
- Setup servizio email reale (task separato)
- Disabilitazione seeding utenti finti (task separato)

## Tasks
1. **Generare e impostare SESSION_SECRET** — Creare una chiave casuale sicura e salvarla come secret dell'ambiente. Rimuovere il fallback hardcoded dal codice, lasciando solo la lettura dalla variabile d'ambiente.
2. **Rimuovere log dei token sensibili** — Eliminare i console.log che stampano token di verifica email e reset password in server/routes/auth.ts (linee 108, 247-251, 344).
3. **Rimuovere email PayPal hardcoded** — Sostituire tutte le occorrenze di "Andreamasteri81@gmail.com" nel codice server e client con la lettura dalle impostazioni del database, senza fallback hardcoded. Se l'impostazione non è configurata, mostrare un messaggio appropriato.

## Relevant files
- `server/routes.ts:37`
- `server/routes/auth.ts:108,247-251,344`
- `server/routes.ts:177,180,201,211`
- `app/(tabs)/profile.tsx:554-555`

### Risultato

- La chiave di sessione è una stringa casuale lunga, salvata come variabile d'ambiente segreta (non più nel codice)
- I log del server non mostrano più token sensibili (verifica email, reset password)
- L'email PayPal non è più hardcoded: viene letta solo dalle impostazioni del database, senza fallback hardcoded

---
## #10 — Creare e collegare email di reset password

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-13 13:53:25 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Email reset password

## What & Why
L'endpoint /forgot-password genera il token di reset e lo salva nel database, ma non invia nessuna email all'utente. Serve creare la funzione di invio email e collegarla all'endpoint.

## Done looks like
- Quando un utente richiede il reset password, riceve un'email con il codice/link per resettare la password
- L'email ha lo stesso stile grafico della email di verifica (template BikerLink arancione)
- Se le credenziali Gmail non sono configurate, il comportamento di fallback rimane invariato (log di warning)

## Out of scope
- Configurazione credenziali Gmail (già gestibile dal pannello admin)
- Modifiche all'endpoint reset-password (già funzionante)
- Modifiche al flusso frontend di reset password

## Tasks
1. **Creare sendPasswordResetEmail** — Aggiungere la funzione in server/email.ts, con template HTML in stile BikerLink (simile a sendVerificationEmail). Il token di reset è lungo 64 caratteri (hex), quindi il template deve gestirlo come link o codice formattato appropriatamente.
2. **Collegare all'endpoint forgot-password** — Chiamare sendPasswordResetEmail nell'endpoint POST /forgot-password in server/routes/auth.ts, dopo la creazione del token nel database.

## Relevant files
- `server/email.ts`
- `server/routes/auth.ts:228-252`

### Risultato

- Quando un utente richiede il reset password, riceve un'email con il codice/link per resettare la password
- L'email ha lo stesso stile grafico della email di verifica (template BikerLink arancione)
- Se le credenziali Gmail non sono configurate, il comportamento di fallback rimane invariato (log di warning)

---
## #11 — Permessi Android mancanti + fotocamera iOS/Android

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-13 14:17:42 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Permessi Android e fotocamera iOS

  ## What & Why
  I permessi Android in app.json sono incompleti: manca GPS in primo piano e accesso foto/media. Inoltre la fotocamera è dichiarata su iOS ma mai usata nel codice — serve implementare l'opzione "scatta foto" ovunque si usa il picker immagini (profilo, contest, annunci admin).

  ## Done looks like
  - app.json Android: dichiarati ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION, READ_MEDIA_IMAGES, CAMERA
  - Ovunque l'app usa il picker per scegliere una foto dalla galleria, ora offre anche l'opzione "Scatta una foto" con la fotocamera (usando launchCameraAsync di expo-image-picker)
  - I permessi fotocamera vengono richiesti correttamente su entrambe le piattaforme
  - I permessi vengono richiesti UNA SOLA VOLTA: al primo utilizzo si chiede il permesso, dopodiché il sistema ricorda la scelta e non ripropone la richiesta
  - Funziona su iOS, Android e web (su web la fotocamera si disabilita se non supportata)

  ## Out of scope
  - expo-camera come modulo separato (si usa expo-image-picker che include launchCameraAsync)
  - Notifiche push (non implementate nell'app)

  ## Tasks
  1. **Aggiungere permessi Android mancanti** — In app.json, aggiungere ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION, READ_MEDIA_IMAGES e CAMERA alla lista permissions Android.
  2. **Implementare opzione fotocamera nel picker immagini** — In tutti e tre i file che usano launchImageLibraryAsync (profile.tsx, contest.tsx, ads.tsx admin), aggiungere un menu di scelta "Galleria" / "Fotocamera" con richiesta permessi camera e launchCameraAsync. I permessi devono essere richiesti una sola volta (controllare lo stato del permesso prima di chiedere, e chiedere solo se non ancora concesso). Su web, mostrare solo l'opzione galleria.

  ## Relevant files
  - `app.json:25-29`
  - `app/(tabs)/profile.tsx:195`
  - `app/(tabs)/contest.tsx:218`
  - `app/admin/ads.tsx:185`

### Risultato

## Relevant files
- `app.json:25-29`
- `app/(tabs)/profile.tsx:195`
- `app/(tabs)/contest.tsx:218`

---
## #12 — Motoclub — Backend (Schema, API, Auto-Join, Chat)

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-13 21:36:07 UTC |
| **Aggiornato** | 2026-04-08 20:40:56 UTC |

### Richiesta

# Motoclub — Backend (Schema, API, Auto-Join, Engagement)

## What & Why
Aggiungere il sistema Motoclub al backend di BikerLink. I motoclub raggruppano gli utenti in base alla marca o al modello della propria moto, creando una community pan-europea. Il backend gestisce: schema DB, lista marche/modelli pre-popolata, API CRUD, logica di auto-adesione, chat integrata, e funzionalità di engagement (statistiche club, messaggio di benvenuto, club del mese, proposte riservate ai club). Include anche l'aggiunta di `country` e `spokenLanguages` al profilo utente, necessari per i filtri geografici e linguistici dei club su scala europea.

## Done looks like
- Tabelle DB per motoclub (`moto_clubs`, `moto_club_members`, `moto_club_invites`, `moto_club_requests`) create e funzionanti
- Lista pre-popolata di marche principali (Ducati, BMW, Harley-Davidson, Honda, Yamaha, Kawasaki, Suzuki, KTM, Triumph, Aprilia, Moto Guzzi, MV Agusta, Benelli, Indian, Royal Enfield, ecc.) con `logoUrl` e modelli iconici (BMW R 1250 GS, Ducati Panigale, Harley Sportster, ecc.), tutti con isApproved = true
- Tabella `users` estesa con `country` (codice ISO 3166-1 alpha-2, es. "IT", "DE", "FR") e `spokenLanguages` (array di codici BCP-47, es. ["it", "en", "de"])
- API endpoints: GET clubs (filtri per type, search, **country**, **region**, distanza, **lingua**), GET club detail con membri, POST richiesta nuovo club, POST join/leave club
- Quando un utente aggiunge una moto al garage o alla wishlist, il sistema controlla i club corrispondenti e crea un invito automatico (una sola volta per club)
- Ogni club ha una conversazione di gruppo automatica nel sistema chat esistente
- Quando un nuovo utente entra in un club, i 3 membri più attivi ricevono una notifica
- Endpoint statistiche club: km totali e ride count dei membri
- Endpoint GET /api/motoclubs/featured per il "club del mese" basato su activityScore
- Tabella `proposals` estesa con campo opzionale `clubId` per proposte riservate
- Endpoint admin

_(troncato)_

### Risultato

## Constraints
- NON modificare né aggiungere configurazioni di porte. Backend: 5000, Frontend: 8081. Invariabili.
- Non cambiare i tipi delle colonne ID esistenti (serial resta serial, varchar resta varchar). Usare db:push per sincronizzare lo schema.

---
## #13 — Motoclub — Tab Frontend (UI, Inviti, Profilo)

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-13 21:36:07 UTC |
| **Aggiornato** | 2026-04-08 20:40:56 UTC |

### Richiesta

# Motoclub — Tab Frontend (UI, Engagement, Proposte)

## What & Why
Creare il tab "Motoclub" nell'app BikerLink, posizionato tra "Ride!" e "Match", con icona scudo. Il tab permette a biker, zavorrine e coppie di esplorare i club per marca o modello su scala pan-europea, vedere i membri, entrare/uscire, e accedere alla chat di gruppo del club. Include funzionalità di engagement (badge profilo, statistiche, club del mese, proposte riservate) e filtri geografici e linguistici adatti a tutta Europa, non solo all'Italia.

## Done looks like
- Nuovo tab "Motoclub" visibile tra "Ride!" e "Match" con icona scudo (Ionicons `shield`)
- Schermata principale con segmented control "Per Marca" / "Per Modello"
- Nella sezione "Per Marca": stemma/logo brand a sinistra di ogni riga; fallback con lettera iniziale su cerchio colorato
- Banner "Club del Mese" in cima alla lista Per Marca
- Filtri disponibili: **Paese** (picker con paesi europei, codici ISO), **Regione** (campo testo libero relativo al paese selezionato, non lista prefissata di regioni italiane), **Raggio di distanza** (km), **Lingua** (picker con le principali lingue europee: italiano, inglese, tedesco, francese, spagnolo, portoghese, olandese, polacco, ecc.)
- Pagina dettaglio club: logo brand, statistiche (km totali, ride count), lista membri con "Membro dal" e bandierina paese, pulsante Entra/Esci, accesso chat
- Modal invito automatico mostrato una sola volta per club
- Notifica in-app ai 3 membri attivi quando entra un nuovo membro
- Pulsante "Proponi un club" con form e conferma attesa approvazione
- Nel tab Profilo: sezione badge club, switch "Aggregati ai gruppi", campo **Paese di residenza** (picker paesi europei), campo **Lingue parlate** (multi-select: almeno italiano, inglese, tedesco, francese, spagnolo, ecc.)
- Nel tab Proposte (creazione): selettore opzionale "Riservata al club"; badge "Solo club [nome]" sulle card delle proposte riservate
- Funzionante su iOS, Android e Web

## Out of scope
- Pannello a

_(troncato)_

### Risultato

## Constraints
- NON modificare né aggiungere configurazioni di porte. Backend: 5000, Frontend: 8081. Invariabili.
- I filtri geografici NON devono essere vincolati alle regioni italiane: il campo Regione è sempre testo libero, il campo Paese copre tutta Europa.

---
## #14 — Motoclub — Pannello Admin (Approvazioni, Gestione)

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-13 21:36:07 UTC |
| **Aggiornato** | 2026-04-08 20:40:56 UTC |

### Richiesta

# Motoclub — Pannello Admin

## What & Why
Aggiungere al pannello admin di BikerLink la gestione dei motoclub: approvazione/rifiuto delle richieste di nuovi club, visualizzazione e gestione dei club esistenti (modifica, rimozione), e overview dei membri.

## Done looks like
- Nuova sezione "Motoclub" nel pannello admin (accessibile da admin e moderatori)
- Lista richieste pendenti di nuovi club con pulsanti Approva / Rifiuta
- Lista club esistenti con conteggio membri, possibilità di modificare nome/descrizione o rimuovere un club
- Dettaglio club con lista membri e possibilità di rimuovere singoli membri
- Log delle azioni di moderazione (approvazione/rifiuto) nel sistema di moderator_logs esistente

## Out of scope
- Creazione diretta di club da admin (usa il seed o il flusso "Proponi un club")
- Gestione chat dei club (usa il sistema chat monitoring esistente)

## Tasks
1. **Pagina admin motoclub** — Creare `app/admin/motoclubs.tsx` con due sezioni: "Richieste Pendenti" (lista richieste con pulsanti approva/rifiuta) e "Club Attivi" (lista club con conteggio membri).
2. **Dettaglio admin club** — Creare `app/admin/motoclub/[id].tsx` con: info club, lista membri con opzione rimozione, pulsante elimina club.
3. **Navigazione admin** — Aggiungere link "Motoclub" nel menu admin esistente (admin/index.tsx).
4. **Logging** — Registrare ogni azione di approvazione/rifiuto/rimozione nel sistema `moderator_logs` esistente.

## Relevant files
- `app/admin/index.tsx`
- `app/admin/workshops.tsx`
- `server/routes/admin.ts`
- `server/routes/moderator.ts`
- `shared/schema.ts`

## Constraints
- NON modificare né aggiungere configurazioni di porte. Backend: 5000, Frontend: 8081. Invariabili.

### Risultato

- Nuova sezione "Motoclub" nel pannello admin (accessibile da admin e moderatori)
- Lista richieste pendenti di nuovi club con pulsanti Approva / Rifiuta
- Lista club esistenti con conteggio membri, possibilità di modificare nome/descrizione o rimuovere un club
- Dettaglio club con lista membri e possibilità di rimuovere singoli membri

---
## #15 — Motoclub Admin Panel UI

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-13 22:47:55 UTC |
| **Aggiornato** | 2026-04-08 20:40:57 UTC |

### Richiesta

# Motoclub — Pannello Admin UI

## What & Why
Costruire la UI del pannello admin per la gestione dei motoclub. Gli endpoint API backend sono già pronti (approvazione/rifiuto richieste, lista club, eliminazione). Manca solo la schermata admin che li usa.

## Done looks like
- Voce "Motoclub" aggiunta al menu del pannello admin (admin/index.tsx)
- Sezione "Richieste Pendenti": lista richieste nuovi club con pulsanti Approva / Rifiuta
- Sezione "Club Attivi": lista di tutti i club approvati con conteggio membri e pulsante Elimina
- Ogni azione (approva/rifiuta/elimina) mostra una conferma e aggiorna la lista in tempo reale
- Compatibile web (pannello admin è sempre usato da browser)

## Out of scope
- Dettaglio membri per club (la chat dei club si monitora già dal sistema chat esistente)
- Creazione diretta club da admin (esiste il flusso "Proponi un club" per gli utenti)
- Modifica nome/descrizione club (non richiesta ora)

## Tasks
1. **Schermata admin motoclub** — Creare `app/admin/motoclubs.tsx` con due sezioni: richieste pendenti (con pulsanti approva/rifiuta) e club attivi (con pulsante elimina). Usare i pattern già esistenti in `app/admin/workshops.tsx` come riferimento stilistico.
2. **Link nel menu admin** — Aggiungere voce "Motoclub" in `app/admin/index.tsx` seguendo il pattern delle altre voci esistenti.

## Relevant files
- `app/admin/index.tsx`
- `app/admin/workshops.tsx`
- `server/routes/admin.ts:1384-1493`

### Risultato

- Voce "Motoclub" aggiunta al menu del pannello admin (admin/index.tsx)
- Sezione "Richieste Pendenti": lista richieste nuovi club con pulsanti Approva / Rifiuta
- Sezione "Club Attivi": lista di tutti i club approvati con conteggio membri e pulsante Elimina
- Ogni azione (approva/rifiuta/elimina) mostra una conferma e aggiorna la lista in tempo reale

---
## #16 — Pulizia codice pre-produzione

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-13 22:47:55 UTC |
| **Aggiornato** | 2026-04-08 20:40:57 UTC |

### Richiesta

# Pulizia Codice Pre-Produzione

## What & Why
Rimuovere o isolare il codice di sviluppo che non deve andare in produzione: il seeding automatico di utenti finti (attualmente sempre attivo) e il servizio email che stampa i link solo in console (reset password, verifica email non arriva agli utenti reali).

## Done looks like
- Il seeding di utenti finti NON viene eseguito quando `NODE_ENV=production`; in sviluppo rimane invariato
- Le email di reset password e verifica email vengono inviate tramite un servizio reale (es. Resend o Nodemailer con SMTP) oppure viene mostrato un messaggio chiaro all'utente che il servizio email non è configurato, senza silenziare l'errore
- Il pannello admin mantiene la funzione "Gestisci Utenti Finti" per poterli disabilitare manualmente in produzione se necessario
- Nessuna regressione sulle funzionalità esistenti

## Out of scope
- Rimozione degli utenti finti già creati nel database (operazione manuale da admin)
- Cambio del sistema di autenticazione
- Internazionalizzazione dei messaggi email

## Tasks
1. **Seed utenti finti condizionale** — Modificare il codice di avvio del server per eseguire il seeding di utenti finti solo se `NODE_ENV !== 'production'`. Trovare il punto di avvio in `server/index.ts` o file collegati.
2. **Servizio email reale** — Integrare un servizio di invio email (Resend è preferito per semplicità — verificare se disponibile come integrazione Replit). Se non disponibile, usare Nodemailer con SMTP configurabile via variabili d'ambiente. Aggiornare `server/routes/auth.ts` per usare il servizio reale invece di `console.log`.

## Relevant files
- `server/index.ts`
- `server/routes/auth.ts`
- `app/admin/fake-users.tsx`

### Risultato

- Il seeding di utenti finti NON viene eseguito quando `NODE_ENV=production`; in sviluppo rimane invariato
- Le email di reset password e verifica email vengono inviate tramite un servizio reale (es. Resend o Nodemailer con SMTP) oppure viene mostrato un messaggio chiaro all'utente che il servizio email non è configurato, senza silenziare l'errore
- Il pannello admin mantiene la funzione "Gestisci Utenti Finti" per poterli disabilitare manualmente in produzione se necessario
- Nessuna regressione sulle funzionalità esistenti

---
## #17 — Configurazione Build APK

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-03-13 22:47:55 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Configurazione Build APK (eas.json + versionCode)

  ## What & Why
  Configurare tutto il necessario per generare la prima APK Android con EAS Build. L'analisi del 20/03/2026 ha confermato: `eas.json` mancante (blocco principale), `versionCode` non dichiarato in `app.json`, tutte le icone Android presenti (adaptive icon, monochrome, splash), `google-services.json` NON necessario (nessun modulo Firebase), Package ID: `com.bikerlink.app`.

  ## Done looks like
  - File `eas.json` presente nella root con profilo `preview` (APK diretta, per test interni su dispositivo) e `production` (AAB per Play Store)
  - `app.json` ha `android.versionCode` impostato a `1`
  - Istruzioni chiare su come eseguire `eas build --platform android --profile preview` per ottenere l'APK

  ## Out of scope
  - Build iOS (solo Android per ora)
  - Upload automatico su Play Store
  - Push notification con Firebase

  ## Tasks
  1. **eas.json** — Creare il file con profilo `preview` (buildType: apk, distribution: internal) e `production` (buildType: app-bundle, distribution: store). Impostare `cli.appVersionSource: remote` per gestire versionCode via EAS.
  2. **versionCode in app.json** — Aggiungere `android.versionCode: 1` nella sezione android di `app.json`.
  3. **Istruzioni build** — Aggiornare `replit.md` con il comando preciso per generare l'APK e i prerequisiti (account Expo, `eas login`).

  ## Relevant files
  - `app.json`
  - `replit.md`

### Risultato

## Relevant files
- `app.json`
- `replit.md`

---
## #18 — Donazione toggle + sicurezza nickname riservati

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-13 23:04:58 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Donazione Toggle + Sicurezza Nickname Riservati

## What & Why
Aggiungere al pannello admin la possibilità di mostrare/nascondere il blocco "Supporta BikerLink" (con tasto PayPal) nel profilo utente, con testo personalizzabile e protezione da password admin. Contestualmente: blindare gli utenti admin/moderator dalla cancellazione e bloccare la registrazione di nickname riservati.

## Done looks like

### Donazione (Supporta BikerLink)
- Nuova sezione "Donazione PayPal" in `app/admin/settings.tsx` con:
  - Toggle ON/OFF protetto da password admin (usa il pattern `protectedToggle` già esistente)
  - Campo testo modificabile per il messaggio della donazione (testo corrente come default)
  - Il toggle è abilitato di default (primo avvio: `donation_enabled = "true"`)
- In `app/(tabs)/profile.tsx`: la sezione donazione legge `GET /api/settings/donation` — se `enabled = false`, il blocco è nascosto; il testo mostrato è quello configurato dall'admin (se presente)
- Backend: nuovo endpoint `GET /api/settings/donation` che restituisce `{ enabled: boolean, text: string, paypalEmail: string }`; aggiungere `donation_enabled` e `donation_text` alla whitelist del `toggle-protected`

### Protezione cancellazione utenti di sistema
- In `server/routes/admin.ts` → `DELETE /users/:id`: se l'utente ha `role === "admin"` o `role === "moderator"`, bloccare con 403 `"Impossibile eliminare un utente di sistema"`

### Blocco nickname riservati in registrazione
- In `server/routes/auth.ts` → `POST /register`: prima di creare l'utente, verificare che il nickname (case-insensitive) non appartenga alla lista riservata:
  `["admin", "administrator", "administrators", "amministratore", "amministratori", "mod", "moderator", "moderatore"]`
- Se riservato, rispondere 400 `"Nickname non disponibile"`
- La stessa lista va applicata anche in `server/routes/users.ts` quando un utente modifica il proprio nickname

## Out of scope
- Creazione di nuovi utenti seed (admin e moderatore già esistono)
- Inter

_(troncato)_

### Risultato

## Relevant files
- `server/routes.ts:176-215`
- `server/routes/admin.ts:167-187,744-777`
- `server/routes/auth.ts:41-130`

---
## #19 — GPS Gate — Restrict tabs without location permission

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-13 23:39:11 UTC |
| **Aggiornato** | 2026-04-08 20:40:57 UTC |

### Richiesta

# GPS Gate — Restrict tabs without location permission

## What & Why
BikerLink depends entirely on GPS for matching, map, rides, and all core features. If a user denies GPS permission or disables location services after opening the app, they should only have access to **Profilo** and **Garage** tabs. All other tabs must be hidden until GPS is re-enabled. This prevents broken experiences and makes the GPS dependency explicit.

This feature is **controllable from the admin panel**: a protected toggle (`gps_required`) allows the admin to enable or disable the GPS gate. When disabled, the app works as before with all tabs always visible regardless of GPS status. When enabled, the restriction logic kicks in. Default: **enabled** (GPS required).

## Done looks like
- A new toggle "GPS Obbligatorio" appears in the admin settings panel, protected by admin password (same flow as donation, email verification, etc.)
- Toggle ON (default): GPS gate is active — without GPS permission, user sees only Profilo and Garage
- Toggle OFF: app works like before, all tabs always visible
- On first launch (or after clearing permissions), the app requests location permission
- If GPS gate is ON and permission denied: only Profilo and Garage tabs are visible in the tab bar; all other tabs are hidden
- If the user grants GPS, opens the app, then disables GPS from device settings mid-session: the app detects this in real time (~3-5s polling) and immediately restricts to Profilo + Garage
- If the user re-enables GPS (or grants permission from the alert): all tabs reappear without needing to restart the app
- A clear, non-dismissable banner appears when GPS is off, explaining why features are limited, with a button to open device location settings
- Web platform: uses browser geolocation API with equivalent gating behavior
- The tracking and route screens (hidden tabs) are also blocked when GPS is off

## Out of scope
- Background location tracking changes
- Server-side enforcement of GPS requ

_(troncato)_

### Risultato

## Relevant files
- `app/(tabs)/_layout.tsx`
- `app/_layout.tsx`
- `lib/auth-context.tsx`

---
## #20 — Mercatino Moto — Vendita moto dal garage

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-14 09:49:05 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Mercatino Moto — Vendita moto dal garage

## What & Why
Permettere ai biker di mettere in vendita le proprie moto direttamente dal garage, senza creare un marketplace separato. Approccio minimalista: una checkbox "In vendita" e un campo descrizione libera. Le moto in vendita vengono evidenziate sul profilo pubblico dell'utente e nella sezione motoclub. Funzionalità attivabile/disattivabile dall'admin panel.

## Done looks like
- Toggle admin "Mercatino Moto" nel pannello impostazioni, protetto da password (stesso pattern degli altri toggle)
- Toggle ON (default attivo): la funzionalità mercatino è disponibile
- Toggle OFF: il checkbox "In vendita" scompare dal garage e i badge "In vendita" non vengono mostrati da nessuna parte
- Nel garage del biker: checkbox "Questa moto è in vendita" su ogni moto. Spuntandola appare un campo testo libero per la descrizione (prezzo, condizioni, note)
- Sul profilo pubblico (`app/profile/[id].tsx`): le moto in vendita mostrano un badge visivo "In Vendita" con la descrizione sotto
- Nella sezione motoclub: una sezione "Mercatino del Club" che elenca le moto in vendita dei membri del club, con nome del venditore, dettagli moto e descrizione
- Il campo descrizione vendita è opzionale — la checkbox basta per segnare la moto come in vendita

## Out of scope
- Sistema di pagamento o transazioni
- Chat dedicata vendita (si usa la chat esistente)
- Notifiche automatiche per nuove moto in vendita
- Ricerca/filtro dedicato nel mercatino
- Tab separata mercatino

## Tasks
1. **Schema DB** — Aggiungere due campi alla tabella `user_motorcycles`: `isForSale` (boolean, default false) e `saleDescription` (text, nullable). Eseguire db:push.

2. **Backend: toggle admin + endpoint** — Aggiungere `marketplace_enabled` alla whitelist toggle-protected. Creare endpoint `GET /api/settings/marketplace-enabled`. Aggiornare le API motorcycles per accettare e restituire `isForSale` e `saleDescription`. Creare endpoint `GET /api/motoclubs/:id/marketplace` che

_(troncato)_

### Risultato

## Relevant files
- `shared/schema.ts`
- `server/routes/admin.ts`
- `server/routes.ts`

---
## #21 — Fix crash loop avvio preview web

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-14 10:34:24 UTC |
| **Aggiornato** | 2026-04-08 20:40:57 UTC |

### Richiesta

# Fix crash loop avvio preview web

  ## What & Why
  L'app va in loop di ricaricamento continuo nella preview web di Replit. Il problema è nel LocationProvider che chiama `navigator.permissions.query({ name: "geolocation" })` all'avvio — nella preview Replit (iframe cross-origin), questa API può fallire causando un crash non catturato. Metro HMR poi ricarica la pagina, creando un loop infinito.

  ## Done looks like
  - L'app si carica correttamente nella preview web senza loop di ricaricamento
  - Il GPS gate continua a funzionare (banner rosso quando GPS non concesso, tab bloccate)
  - Il garage rimane accessibile quando il GPS gate è attivo
  - Nessuna regressione su iOS/Android

  ## Out of scope
  - Modifiche a porte o workflow
  - Nuove funzionalità GPS
  - Modifiche all'ErrorBoundary (non è la causa del loop)

  ## Tasks
  1. Rendere il LocationProvider robusto su web: wrappare le chiamate a `navigator.permissions` in try/catch più aggressivi, gestire il caso iframe/cross-origin, assumere permesso concesso se l'API non è disponibile.
  2. Rimuovere il polling setInterval da 4 secondi su web — l'event listener `change` su `navigator.permissions` già gestisce i cambiamenti. Il polling è ridondante e causa re-render inutili.
  3. Verificare che la logica href invertita del garage (riga 187 di _layout.tsx) non causi re-mount quando isGpsGateActive cambia stato rapidamente all'avvio.
  4. Testare che l'app si carica senza loop nella preview e che il GPS gate funzioni ancora.

  ## Relevant files
  - `lib/location-context.tsx`
  - `app/(tabs)/_layout.tsx:57,187`
  - `app/_layout.tsx:97-118`

### Risultato

## Relevant files
- `lib/location-context.tsx`
- `app/(tabs)/_layout.tsx:57,187`
- `app/_layout.tsx:97-118`

---
## #22 — Fix utenti fake visibili dopo disattivazione

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-14 11:02:57 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix fake users still visible after disabling

## What & Why
When the admin disables fake users via the toggle in the admin panel, they still appear in the app (nearby list, online list, etc.). Two bugs cause this:

1. The `getNearbyUsers` query returns ALL active users with coordinates — it never checks `isFake` or `isAvailable`, so fake users always appear in the nearby view.
2. The automatic zavorrine rotation timer runs every 5 minutes and randomly re-enables fake zavorrine profiles (`isAvailable: true`, `lastLoginAt: now`), undoing the admin's disable action.

## Done looks like
- After disabling fake users from the admin panel, they immediately disappear from all user-facing lists (nearby, online, available bikers, available zavorrine).
- The rotation timer respects the admin's toggle and does not re-enable fake users that were globally disabled.
- Re-enabling fake users from admin restores normal behavior.

## Out of scope
- Changes to the admin panel UI itself
- Changes to how individual fake user toggle works (per-user availability)

## Tasks
1. **Filter fake users from nearby query** — Add `isAvailable = true` filtering to `getNearbyUsers` in storage so disabled fake users (and any unavailable user) are excluded from the nearby results.
2. **Respect admin global toggle in rotation timer** — Before the zavorrine rotation runs, check whether the admin has globally disabled fake users. If so, skip the rotation entirely so it doesn't re-enable them.
3. **Verify counts exclude disabled fakes** — Ensure `countOnlineUsers` and `getOnlineUsersList` properly exclude fake users that have been disabled (their `lastLoginAt` is set to 2020, which should already filter them, but verify).

## Relevant files
- `server/storage.ts:863-881`
- `server/storage.ts:935-971`
- `server/storage.ts:1251-1283`
- `server/storage.ts:1354-1369`
- `server/matching-engine.ts:196-202,285-292`
- `server/routes/users.ts:529-565`
- `server/routes/admin.ts:1204-1224`

### Risultato

- After disabling fake users from the admin panel, they immediately disappear from all user-facing lists (nearby, online, available bikers, available zavorrine).
- The rotation timer respects the admin's toggle and does not re-enable fake users that were globally disabled.
- Re-enabling fake users from admin restores normal behavior.

---
## #23 — Password per toggle utenti fake

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-14 11:06:22 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Password per toggle utenti fake

## What & Why
Il toggle "Abilita utenti fake" nel pannello admin (fake-users.tsx) è attualmente un semplice Switch senza protezione. Chiunque abbia accesso al pannello admin può attivare/disattivare i fake con un tap accidentale. Serve aggiungere la stessa protezione con password admin già usata per gli altri toggle (donazione, verifica email, GPS, marketplace).

## Done looks like
- Quando l'admin tocca lo Switch per abilitare o disabilitare gli utenti fake, appare un modal che chiede la password admin
- Solo dopo aver inserito la password corretta il toggle viene effettivamente eseguito
- Se la password è sbagliata, il toggle non cambia e appare un messaggio di errore
- Il backend verifica la password prima di eseguire l'operazione, usando lo stesso endpoint `toggle-protected` già esistente
- Il comportamento lato utenti (nascondere/mostrare i fake) rimane identico a prima

## Out of scope
- Modifiche al filtraggio degli utenti fake nelle liste (gestito da Task #22)
- Protezione password per i toggle individuali per singolo fake user
- Modifiche alla creazione di nuovi fake user

## Tasks
1. **Backend: migrare toggle fake su endpoint protetto** — Aggiungere `fake_users_enabled` alla whitelist `allowedKeys` nell'endpoint `toggle-protected` di admin.ts. Modificare l'endpoint `PUT /fake-users/toggle-all` per accettare anche `adminPassword` e verificarla con bcrypt prima di eseguire l'operazione (oppure fare in modo che il frontend usi direttamente `toggle-protected` per il setting e poi chiami `toggle-all` solo per aggiornare lo stato degli utenti).
2. **Frontend: aggiungere modal password** — In `app/admin/fake-users.tsx`, sostituire il comportamento diretto dello Switch con il pattern `protectedToggle`: al tap mostrare un modal con campo password, e solo dopo validazione eseguire la mutazione. Usare come riferimento il pattern già implementato in `app/admin/settings.tsx`.

## Relevant files
- `app/admin/fake-users.tsx:120-136,292-

_(troncato)_

### Risultato

- Quando l'admin tocca lo Switch per abilitare o disabilitare gli utenti fake, appare un modal che chiede la password admin
- Solo dopo aver inserito la password corretta il toggle viene effettivamente eseguito
- Se la password è sbagliata, il toggle non cambia e appare un messaggio di errore
- Il backend verifica la password prima di eseguire l'operazione, usando lo stesso endpoint `toggle-protected` già esistente

---
## #24 — Riorganizzazione pannello admin

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-15 18:58:20 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Riorganizzazione pannello admin

## What & Why
Le sezioni del pannello admin e della pagina impostazioni sono state aggiunte nel tempo senza un ordine logico. Vanno riorganizzate in gruppi coerenti per facilitare la navigazione e la gestione.

## Done looks like
- La dashboard admin mostra le sezioni raggruppate per categoria con titoli di sezione visibili (Utenti, Contenuti, Monitoraggio, Sistema)
- La pagina Impostazioni è divisa in sezioni con titoli separatori (Funzionalità App, Gestione Utenti, Monetizzazione, Configurazione Tecnica, Documenti Legali, Parametri)
- Nessuna funzionalità cambia — è solo una riorganizzazione visiva dell'ordine e dei raggruppamenti

## Out of scope
- Aggiunta di nuove funzionalità o toggle
- Modifiche al backend o alle API
- Restyling grafico (colori, font, dimensioni)

## Tasks
1. **Riorganizzare la dashboard admin** — Raggruppare le 11 card in 4 sezioni con titolo: "Utenti" (Utenti, Utenti Fake, Segnalazioni, Chat Utenti), "Contenuti" (Officine, Motoclub, Easter Eggs, Advertisement), "Monitoraggio" (Analytics, Performance), "Sistema" (Impostazioni). Aggiungere un titolo di sezione sopra ogni gruppo.

2. **Riorganizzare la pagina Impostazioni** — Raggruppare i toggle e le impostazioni in 6 sezioni con titolo separatore: "Funzionalità App" (Match Automatico, Percorsi Personalizzati, SOS Biker, Mercatino Moto, GPS Obbligatorio), "Gestione Utenti" (Verifica Email, Primal User), "Monetizzazione" (Advertisement, Branding Syneco, Donazione PayPal con email e testo), "Configurazione Tecnica" (Email SMTP, Modalità manutenzione, Versione minima app), "Documenti Legali" (EULA, Privacy Policy), "Parametri" (Messaggio Splash, Max foto zavorrina, Max voti giornalieri).

## Relevant files
- `app/admin/index.tsx`
- `app/admin/settings.tsx`

### Risultato

- La dashboard admin mostra le sezioni raggruppate per categoria con titoli di sezione visibili (Utenti, Contenuti, Monitoraggio, Sistema)
- La pagina Impostazioni è divisa in sezioni con titoli separatori (Funzionalità App, Gestione Utenti, Monetizzazione, Configurazione Tecnica, Documenti Legali, Parametri)
- Nessuna funzionalità cambia — è solo una riorganizzazione visiva dell'ordine e dei raggruppamenti

---
## #25 — Elimina tutti gli utenti fake

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-15 19:09:04 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Elimina tutti gli utenti fake

## What & Why
Attualmente è possibile eliminare i fake user solo uno alla volta dal pannello admin. Serve un'azione bulk per eliminarli tutti in un colpo solo, con conferma.

## Done looks like
- Il backend espone `DELETE /api/admin/fake-users` (senza id) che cancella tutti gli utenti con `is_fake = true` e ritorna il conteggio degli eliminati.
- Il metodo storage `deleteAllFakeUsers()` in `server/storage.ts` esegue la delete con `where(eq(users.isFake, true))`. Le tabelle correlate (`fake_user_interactions`, `user_profiles`, `user_motorcycles`, `zavarrina_wishlists`) si cancellano in cascade grazie agli FK con `onDelete: "cascade"` già definiti nello schema.
- La schermata `app/admin/fake-users.tsx` ha un pulsante "Elimina tutti" che mostra un Alert di conferma prima di procedere.
- Dopo la cancellazione la lista si aggiorna e le query della cache vengono invalidate.

## Relevant files
- `server/storage.ts` — aggiungere `deleteAllFakeUsers()`
- `server/routes/admin.ts` — aggiungere `router.delete("/fake-users", ...)` (senza `:id`)
- `app/admin/fake-users.tsx` — aggiungere pulsante "Elimina tutti" con conferma

### Risultato

## Relevant files
- `server/storage.ts` — aggiungere `deleteAllFakeUsers()`
- `server/routes/admin.ts` — aggiungere `router.delete("/fake-users", ...)` (senza `:id`)
- `app/admin/fake-users.tsx` — aggiungere pulsante "Elimina tutti" con conferma

---
## #26 — Fix toggle Abilita/Disabilita utenti fake

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-15 19:23:54 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix toggle Abilita/Disabilita utenti fake

## What & Why
Lo switch "Abilita utenti fake" nel pannello admin deriva il suo stato da
`allEnabled = users.length > 0 && users.every(u => u.profile?.isAvailable)`.
Se ci sono 0 fake user nel DB (dopo cancellazione), lo switch è sempre OFF
e la mutation fa 0 operazioni — il toggle sembra non funzionare.
Il setting globale `fake_users_enabled` esiste già nel DB ma non viene letto
dal frontend per determinare lo stato dello switch.

## Done looks like
- Lo switch legge lo stato da `GET /api/settings/fake-users-enabled` (setting globale),
  esattamente come già fa lo switch del chatbot con `/api/settings/chatbot-enabled`
- Il toggle funziona correttamente anche quando ci sono 0 utenti fake nel sistema
- Dopo "Elimina tutti" o toggle, entrambe le query (lista utenti + setting) vengono invalidate
- Se la lista è vuota, compare un messaggio esplicativo sotto lo switch:
  "Nessun utente fake nel sistema. Usa il form in basso per aggiungerne."

## Out of scope
- Re-seed automatico al toggle ON (utente deve aggiungere manualmente gli utenti)

## Tasks
1. **Endpoint settings** — Aggiungere `GET /api/settings/fake-users-enabled` che legge
   il setting `fake_users_enabled` da `appSettings` (default: `true` se assente).

2. **Frontend switch** — In `fake-users.tsx`, sostituire il calcolo `allEnabled`
   con una `useQuery` su `/api/settings/fake-users-enabled` (stesso pattern
   del chatbot già presente in questo file). Aggiornare le mutation `onSuccess`
   per invalidare anche questa query. Aggiungere messaggio se `users.length === 0`.

## Relevant files
- `server/routes/settings.ts`
- `app/admin/fake-users.tsx:97-148`
- `server/routes/admin.ts:1204-1225`

### Risultato

- Lo switch legge lo stato da `GET /api/settings/fake-users-enabled` (setting globale),
esattamente come già fa lo switch del chatbot con `/api/settings/chatbot-enabled`
- Il toggle funziona correttamente anche quando ci sono 0 utenti fake nel sistema
- Dopo "Elimina tutti" o toggle, entrambe le query (lista utenti + setting) vengono invalidate

---
## #27 — Generazione massiva 2420 utenti fake

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-15 19:33:12 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Generazione massiva utenti fake (2420 utenti)

## What & Why
L'app ha bisogno di popolare il DB con un gran numero di utenti fake realistici,
distribuiti uniformemente su tutto il territorio nazionale (incluse Sicilia e Sardegna),
per rendere la piattaforma credibile e testabile. I numeri richiesti:

- 1500 biker uomo
- 200 biker donna
- 100 coppie M+F
- 50 coppie M+M
- 20 coppie F+F
- 500 zavorrine donna
- 50 zavorrine uomo

**Totale: 2420 utenti**

Requisiti per ogni utente:
- Nickname unico, realistico (stile italiano)
- Email fake univoca
- Profilo con bio, regione, coordinate GPS
- **Distribuzione UNIFORME: ogni gruppo è suddiviso equamente su tutte le 20 regioni**
  italiane (incluse Sicilia e Sardegna). Es. 1500 biker uomo → ~75 per regione.
- Anno di nascita realistico (1970-2005)
- Almeno 2 moto in garage (biker/coppie) o 2 moto in lista desideri (zavorrine)
- Un messaggio di benvenuto nel sistema di chat da parte dell'account "BikerLink_Official"

## Done looks like
- Il pannello admin ha un pulsante "Generazione Massiva" che triggera il seed
- Avviando la generazione, i 2420 utenti vengono creati in background con barra di progresso
- Ogni utente ha: profilo completo, 2+ moto, messaggio di benvenuto visibile nella chat
- Gli utenti sono distribuiti **uniformemente** su tutte le 20 regioni (isole incluse):
  Abruzzo, Basilicata, Calabria, Campania, Emilia-Romagna, Friuli Venezia Giulia,
  Lazio, Liguria, Lombardia, Marche, Molise, Piemonte, Puglia, Sardegna, Sicilia,
  Toscana, Trentino-Alto Adige, Umbria, Valle d'Aosta, Veneto
- Il seed è idempotente: rieseguirlo non duplica gli utenti già esistenti
- Il toggle "Abilita utenti fake" funziona e i contatori rispecchiano i numeri reali

## Out of scope
- Foto profilo reali (nessuna avatar)
- Messaggi scambiati tra fake user (solo messaggio di benvenuto dal sistema)
- Percorsi GPS, SOS, proposte di viaggio

## Tasks

1. **Dati algoritmici** — Creare `server/mass-seed-data.ts` con pool di nomi
   italiani ma

_(troncato)_

### Risultato

## Relevant files
- `server/auto-seed.ts`
- `server/routes/admin.ts`
- `app/admin/fake-users.tsx`

---
## #28 — Caricamento progressivo + refresh 5 minuti

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-16 08:07:44 UTC |
| **Aggiornato** | 2026-04-08 20:40:57 UTC |

### Richiesta

# Caricamento Progressivo + Refresh 5 Minuti

## What & Why
La schermata principale lancia 14 richieste HTTP in parallelo appena
l'utente si autentica, rallentando la comparsa della mappa e
sovraccaricando il server. Parallelamente, le query che mostrano gli
utenti vicini si aggiornano ogni 30 secondi, un intervallo troppo
frequente per dati che cambiano lentamente.

Due obiettivi combinati:
1. **Caricamento progressivo** — caricare prima la mappa, poi gli utenti,
   poi i dati secondari (workshop, easter egg, ads, SOS) in sequenza.
2. **Refresh a 5 minuti** — allineare il `refetchInterval` degli utenti
   vicini e dei contatori al ciclo del backend (che ruota la disponibilità
   fake ogni 5 minuti), riducendo il carico computazionale.

Le porte Replit NON devono cambiare:
- localPort 5000 → externalPort 5000 (backend API)
- localPort 8081 → externalPort 80 (frontend web/Metro)
Verificare `.replit` prima e dopo le modifiche.

## Done looks like
- La mappa appare subito dopo login, senza aspettare utenti/workshop/ads
- I marker degli utenti vicini compaiono entro 2-3 secondi dalla mappa
- Workshop, Easter Egg, Ads e SOS si caricano per ultimi
- `nearbyUsersQuery` e i contatori (online/biker/zavorrine) si aggiornano
  ogni 5 minuti, non ogni 30 secondi
- Il SOS resta a 15 secondi (sicurezza stradale — non si tocca)
- Nessuna regressione: tutte le funzioni continuano a funzionare
- Le porte `.replit` restano invariate

## Out of scope
- Modifiche al backend o agli endpoint API
- Skeleton loading / shimmer UI
- Cambiamenti al sistema di autenticazione

## Tasks
**IMPORTANTE: i task vanno eseguiti in sequenza, non in parallelo.**

1. **Verificare le porte `.replit`** — Leggere `.replit` e confermare che
   `localPort 5000 → externalPort 5000` e `localPort 8081 → externalPort 80`
   siano invariati prima di toccare qualsiasi file.

2. **Aggiungere stato `mapReady` con fallback** — In `app/(tabs)/index.tsx`,
   aggiungere uno stato booleano `mapReady`. Impostarlo `true` qu

_(troncato)_

### Risultato

- La mappa appare subito dopo login, senza aspettare utenti/workshop/ads
- I marker degli utenti vicini compaiono entro 2-3 secondi dalla mappa
- Workshop, Easter Egg, Ads e SOS si caricano per ultimi
- `nearbyUsersQuery` e i contatori (online/biker/zavorrine) si aggiornano

---
## #29 — Script stress test 4 ore

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-16 09:48:13 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Script stress test 4 ore

## What & Why

Creare uno script Node.js standalone (`scripts/stress-test.ts`) che gira per 4 ore simulando attività realistica su tutte le funzioni dell'app BikerLink: chat utente↔utente, chat utente↔fake-user con risposte automatiche del chatbot, mercatino moto (proposals), richieste SOS, percorsi custom, visualizzazioni profilo, cambio disponibilità/posizione.

Lo scopo è verificare che backend, DB e chatbot reggano sotto carico sostenuto e che tutte le funzioni rispondano correttamente in produzione (o locale) con due utenti reali + i 2420 fake.

## Done looks like

- Eseguendo `npx ts-node scripts/stress-test.ts` il processo gira per 4 ore (configurabile) senza crashare
- Ad ogni ciclo (~30 secondi) esegue 3-5 azioni scelte casualmente
- Il log console mostra in tempo reale: timestamp, azione, esito (✓/✗), latenza in ms
- Al termine stampa un report con: totale chiamate, % successo per categoria, latenza media/max, tasso di risposta chatbot, eventuali errori
- Tutte le categorie vengono coperte almeno una volta ogni 10 minuti

## Out of scope

- Test di carico simultaneo multi-processo (un solo processo sequenziale)
- Test di upload foto
- Test di pagamento/abbonamento
- Modifica del database o seed dati

## Tasks

1. **Setup autenticazione e HTTP client** — Creare il file `scripts/stress-test.ts` con un HTTP client basato su `node-fetch` (o `fetch` nativo Node 18+) che gestisce cookies di sessione. Il client autentica due utenti reali tramite variabili d'ambiente (`TEST_USER1_EMAIL`, `TEST_USER1_PASSWORD`, `TEST_USER2_EMAIL`, `TEST_USER2_PASSWORD`, `TEST_BASE_URL`). Se le credenziali mancano, lo script stampa istruzioni e termina.

2. **Azioni utente: discovery e profilo** — Implementare le funzioni di test per: GET utenti vicini, GET lista online, GET profilo pubblico di un fake user (scelto casualmente), PUT aggiornamento posizione GPS (coordinate casuali nei pressi di Roma), PUT toggle disponibilità, GET search utenti.

3. **Azio

_(troncato)_

### Risultato

- Eseguendo `npx ts-node scripts/stress-test.ts` il processo gira per 4 ore (configurabile) senza crashare
- Ad ogni ciclo (~30 secondi) esegue 3-5 azioni scelte casualmente
- Il log console mostra in tempo reale: timestamp, azione, esito (✓/✗), latenza in ms
- Al termine stampa un report con: totale chiamate, % successo per categoria, latenza media/max, tasso di risposta chatbot, eventuali errori

---
## #30 — Codici Invito — Schema + API Backend

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-16 10:11:08 UTC |
| **Aggiornato** | 2026-04-08 20:40:57 UTC |

### Richiesta

# Codici Invito — Schema + API Backend

## What & Why
L'app ha già una tabella `invitation_codes` e il backend valida il codice alla registrazione,
ma mancano il campo omaggio, le API admin per creare/gestire i codici, e il ritorno del
testo dell'omaggio al frontend dopo la registrazione.
Serve anche un endpoint pubblico (senza login) per mostrare l'anteprima dell'omaggio
prima che l'utente si registri — così il QR porta a una schermata che invoglia subito
a completare l'iscrizione davanti all'esercente.

## Done looks like
- La tabella `invitation_codes` ha due nuovi campi: `label` (nome del codice, es. "Pub Rock Roma")
  e `giftMessage` (testo dell'omaggio mostrato all'utente)
- Le API admin permettono di creare, modificare, disattivare ed eliminare codici
- Un endpoint pubblico `GET /api/invite-preview/:code` restituisce `label` e `giftMessage`
  del codice se attivo e non scaduto — senza richiedere autenticazione, per permettere
  l'anteprima prima della registrazione (rate-limited per sicurezza)
- Un endpoint stats restituisce: utenti totali, utenti con codice invito, conteggio per ogni codice
- Dopo una registrazione con codice valido, la risposta include `giftMessage` se presente

## Out of scope
- QR code generation (può essere aggiunto in futuro)
- Tracking se l'utente ha effettivamente ritirato il premio

## Tasks
1. **Schema migration** — Aggiungere colonne `label` (varchar 100) e `gift_message` (text) alla
   tabella `invitation_codes` in `shared/schema.ts`, poi eseguire `npm run db:push --force`.

2. **Storage methods** — Aggiungere a `server/storage.ts`: `updateInvitationCode(id, data)`,
   `deleteInvitationCode(id)`, `countUsersWithInvitationCode()`, `countUsersByInvitationCode(code)`.

3. **Endpoint pubblico anteprima** — Aggiungere `GET /api/invite-preview/:code` (no auth,
   rate-limited) che restituisce `{ label, giftMessage }` se il codice è attivo e non scaduto,
   oppure 404 se non valido. Questo endpoint è chiamato dalla schermata di benvenuto

_(troncato)_

### Risultato

## Relevant files
- `shared/schema.ts:538-552`
- `server/storage.ts`
- `server/routes/auth.ts:73-100`

---
## #31 — Codici Invito — Registrazione + Pannello Admin

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-16 10:11:08 UTC |
| **Aggiornato** | 2026-04-08 20:40:57 UTC |

### Richiesta

# Codici Invito — Frontend (Registrazione + Admin)

## What & Why
Bisogna invogliare l'utente a registrarsi sul momento, davanti all'esercente che gli ha dato il QR.
Il flusso deve mostrare l'omaggio PRIMA della registrazione, col codice già inserito automaticamente,
così l'utente vede immediatamente il beneficio e completa l'iscrizione in pochi secondi.
Serve anche la schermata admin per creare e monitorare i codici.

## Done looks like

**Flusso utente (QR → app):**
- Il QR punta all'app con il codice pre-caricato (deep link o URL con parametro `?inviteCode=SMILE`)
- Appena il codice viene rilevato (da URL param o inserito a mano), il form mostra
  un banner/card in cima allo step 3 con: icona regalo, testo dell'omaggio, il codice in evidenza —
  così l'utente SA già cosa guadagna prima ancora di compilare i dati
- Il campo "Codice invito" è facoltativo e si trova in fondo allo step 3, pre-compilato se
  arrivato da QR
- Dopo la registrazione, appare un modal di conferma con:
    - Il messaggio dell'omaggio
    - Il codice in grande e ben visibile (per mostrarlo all'esercente)
    - Pulsante "Ho capito" — il modal non si chiude toccando fuori

**Schermata admin:**
- Voce "Codici Invito" nel pannello admin (sezione Sistema)
- Counter in cima: Utenti totali / Utenti con codice / Codici attivi
- Lista codici: nome, codice, omaggio, barra usi/max-usi, counter utenti, toggle attivo/disattivo, elimina
- Modal creazione nuovo codice: label, codice (testo libero), omaggio, max usi, scadenza opzionale

## Out of scope
- Generazione automatica QR code (può essere aggiunta in futuro; l'admin copia il link manualmente)
- Tracking riscatto effettivo del premio
- Statistiche storiche per codice nel tempo

## Tasks
1. **Schermata anteprima omaggio pre-registrazione** — Quando l'app viene aperta con un parametro
   `inviteCode` (da deep link o URL), mostrare una schermata/banner dedicato che chiama
   `GET /api/invite-preview/:code` e mostra l'omaggio in modo prominente con un in

_(troncato)_

### Risultato

## Relevant files
- `app/(auth)/register.tsx`
- `app/admin/index.tsx`
- `constants/colors.ts`

---
## #32 — Fix avvio sequenziale Backend→Frontend

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-16 15:36:52 UTC |
| **Aggiornato** | 2026-04-08 20:40:57 UTC |

### Richiesta

# Fix avvio sequenziale Backend→Frontend

  ## Obiettivo

  Garantire che esbuild non venga OOM-killato al riavvio dei workflow.

  ## Contesto tecnico

  Quando Replit fa auto-restart di tutti i workflow simultaneamente:
  - `Start Frontend` (Metro/expo) parte e occupa ~2GB RAM
  - `Start Backend` chiama `npm run server:build` (esbuild) mentre Metro è già in RAM
  - OOM killer uccide esbuild con SIGKILL → `server_dist/index.js` resta 0 bytes → backend non parte

  `start-expo.sh` già aspetta il backend prima di avviare Metro (wait_for_backend).
  Il problema è che `start-backend.sh` non uccide Metro prima di compilare.

  ## Fix 1 — `scripts/start-backend.sh`

  Aggiungere, PRIMA della riga `echo "Compilazione TypeScript server..."`, un blocco che:
  - Uccide i processi Metro/expo/node per porta 8081
  - Aspetta 3 secondi che i processi siano effettivamente morti
  - Poi avvia la compilazione con esbuild

  Questo è sicuro: `start-expo.sh` è in loop `wait_for_backend()` e non ha ancora avviato Metro. Quando il backend è pronto (porta 5000), `start-expo.sh` uscirà dal loop e avvierà Metro da solo.

  ## Fix 2 — `.gitignore`

  Aggiungere `logs/` al `.gitignore`.

  ## Done looks like

  - `server_dist/index.js` compilato correttamente (> 400KB)
  - Backend: RUNNING con log "express server serving on port 5000"
  - Frontend: RUNNING con Metro avviato DOPO il backend
  - Nessun OOM kill anche al restart simultaneo di tutti i workflow

  ## Relevant files
  - `scripts/start-backend.sh`
  - `.gitignore`

### Risultato

- `server_dist/index.js` compilato correttamente (> 400KB)
- Backend: RUNNING con log "express server serving on port 5000"
- Frontend: RUNNING con Metro avviato DOPO il backend
- Nessun OOM kill anche al restart simultaneo di tutti i workflow

---
## #33 — Monitoraggio RAM e disco in parallelo allo stress test

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-16 15:47:19 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Monitoraggio RAM e disco in parallelo allo stress test

## Obiettivo

Aggiungere un loop di monitoraggio di sistema che gira in background mentre lo stress test è attivo, scrivendo metriche di RAM e disco nello stesso file di log cumulativo (`logs/stress-test-cumulative.log`) con tag `[SYS]`. Questo permette di correlare picchi di latenza HTTP con spike di consumo RAM.

## Implementazione

### Modifica `scripts/run-stress-test.sh`

Aggiungere un loop bash in background tra la compilazione e `exec node ...`. Il loop:
1. Campiona RAM e disco ogni 30 secondi (stesso intervallo dei cicli HTTP)
2. Scrive una riga `[SYS]` con timestamp, RAM usata/totale/disponibile e disco
3. Viene ucciso automaticamente quando il processo principale (`exec node`) termina, tramite `trap`

```bash
# Avvia monitoraggio sistema in background
sysmon_loop() {
  while true; do
    TS=$(date '+%Y-%m-%d %H:%M:%S')
    RAM_LINE=$(free -m | grep '^Mem:')
    RAM_TOT=$(echo $RAM_LINE | awk '{printf "%.1fGB", $2/1024}')
    RAM_USED=$(echo $RAM_LINE | awk '{printf "%.1fGB", $3/1024}')
    RAM_AVAIL=$(echo $RAM_LINE | awk '{printf "%.1fGB", $7/1024}')
    DISK_LINE=$(df -h /home/runner/workspace | tail -1)
    DISK_USED=$(echo $DISK_LINE | awk '{print $3}')
    DISK_TOT=$(echo $DISK_LINE | awk '{print $2}')
    DISK_PCT=$(echo $DISK_LINE | awk '{print $5}')
    echo "[$TS] [SYS] RAM: ${RAM_USED}/${RAM_TOT} usata | Disponibile: ${RAM_AVAIL} | Disco: ${DISK_USED}/${DISK_TOT} (${DISK_PCT})" | tee -a "$LOG_FILE"
    sleep 30
  done
}

sysmon_loop &
SYSMON_PID=$!
trap "kill $SYSMON_PID 2>/dev/null" EXIT
```

La riga `exec node ...` sostituisce il processo principale, quindi `EXIT` viene triggerato correttamente al termine o kill del test.

### Nota su `exec`

Il `trap EXIT` con `exec` funziona perché il trap viene registrato nella shell corrente prima che `exec` la sostituisca. Al termine del processo node, la shell esegue il trap e uccide il loop.

## File coinvolti

- `scripts/run-stress-test.sh`

## D

_(troncato)_

### Risultato

- Stress Test riavviato con il nuovo script
- Nel log cumulativo compaiono righe `[SYS]` ogni ~30 secondi alternate ai cicli HTTP
- Esempio output:
```

---
## #34 — Traduzioni EN + DE con selettore lingua manuale nel profilo

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-16 15:55:40 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Traduzioni EN + DE con selettore lingua manuale

## Obiettivo

Aggiungere le traduzioni in inglese (EN) e tedesco (DE) all'app BikerLink, con un selettore lingua manuale nella schermata Profilo. La lingua scelta viene persistita in AsyncStorage.

## Lingue supportate

| Codice | Lingua   | Stato attuale |
|--------|----------|---------------|
| `it`   | Italiano | ✅ Attivo     |
| `en`   | English  | 🔲 Da aggiungere |
| `de`   | Deutsch  | 🔲 Da aggiungere |

## Architettura — nessun refactor delle schermate

Tutti i 41 file già usano `import { t } from "@/lib/i18n"` come funzione plain.
La strategia sfrutta questo: rendere reattiva la variabile `currentLanguage` tramite un context che forza il re-render dell'intera app quando la lingua cambia. I 331 `t()` esistenti non vanno toccati.

## Modifiche richieste

### 1. `lib/i18n.ts`

- Aggiungere blocco `en: { ... }` con tutte le ~90 chiavi tradotte in inglese
- Aggiungere blocco `de: { ... }` con tutte le ~90 chiavi tradotte in tedesco
- Aggiungere `export type AppLanguage = "it" | "en" | "de"`
- Aggiungere `export function setAppLanguage(lang: AppLanguage)` che aggiorna `currentLanguage`
- Aggiungere `export function getAppLanguage(): AppLanguage`
- La funzione `t()` esistente usa già `currentLanguage` — funzionerà automaticamente

Nota: termini specifici del dominio ("Zavorrina", "Biker", "Easter Egg", "Giro") restano in italiano anche nelle traduzioni EN/DE, oppure vengono adattati in modo naturale ("Pillion" per zavorrina in EN, "Sozia" in DE, ecc.).

### 2. `lib/language-context.tsx` (file nuovo)

Context che:
- Legge la lingua salvata da AsyncStorage (`@bikerlink_language`) al mount
- Chiama `setAppLanguage(lang)` per aggiornare il modulo i18n
- Espone `language` e `setLanguage(lang)` ai consumer
- Usa un `renderKey` (numero che incrementa) passato come key al root layout, forzando il remount dell'albero quando la lingua cambia

```typescript
export function useLanguage() {
  return useContext(LanguageContext

_(troncato)_

### Risultato

- Nel profilo compare la sezione lingua con 3 pulsanti IT / EN / DE
- Tappando EN tutta l'app passa in inglese (inclusi login, register, mappa, chat, ecc.)
- Tappando DE tutta l'app passa in tedesco
- Chiudendo e riaprendo l'app la lingua scelta è mantenuta (AsyncStorage)

---
## #35 — Aggiungi lingue Spagnolo e Francese

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-16 16:10:15 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Aggiungi Spagnolo e Francese all'app

## What & Why
Le lingue supportate al momento sono IT, EN, DE. L'app deve supportarne 5: Italiano, Inglese, Tedesco, Spagnolo e Francese. Bisogna aggiungere i dizionari ES e FR (stesse ~125 chiavi già presenti) e aggiornare il selettore nel profilo da 3 a 5 pulsanti.

## Done looks like
- Nel profilo appaiono 5 pulsanti lingua: 🇮🇹 IT · 🇬🇧 EN · 🇩🇪 DE · 🇪🇸 ES · 🇫🇷 FR
- Selezionando ES o FR tutta l'interfaccia si aggiorna in spagnolo o francese
- La lingua scelta persiste al riavvio dell'app (come già avviene per IT/EN/DE)
- Nessuna chiave di traduzione mancante nei dizionari ES e FR

## Out of scope
- Aggiunta di altre lingue (es. portoghese, olandese)
- Traduzione dei contenuti generati dagli utenti
- Cambio della lingua lato backend

## Tasks
1. **Aggiungere `AppLanguage`** — Estendere il tipo `AppLanguage` in `lib/i18n.ts` da `"it"|"en"|"de"` a `"it"|"en"|"de"|"es"|"fr"`. Aggiungere i dizionari `es` e `fr` con le stesse ~125 chiavi già presenti in `it`, `en`, `de`.

2. **Aggiornare il selettore nel profilo** — Nel componente Profile, aggiungere i due nuovi pulsanti 🇪🇸 ES e 🇫🇷 FR nella `languageBar` già esistente, mantenendo lo stile e il comportamento attivo/inattivo corrente.

## Relevant files
- `lib/i18n.ts`
- `lib/language-context.tsx`
- `app/(tabs)/profile.tsx`

### Risultato

- Nel profilo appaiono 5 pulsanti lingua: 🇮🇹 IT · 🇬🇧 EN · 🇩🇪 DE · 🇪🇸 ES · 🇫🇷 FR
- Selezionando ES o FR tutta l'interfaccia si aggiorna in spagnolo o francese
- La lingua scelta persiste al riavvio dell'app (come già avviene per IT/EN/DE)
- Nessuna chiave di traduzione mancante nei dizionari ES e FR

---
## #36 — Selezione paese + regione europea

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-16 16:17:18 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Selezione Paese + Regione Europea

## What & Why
Attualmente la selezione della regione è limitata alle 20 regioni italiane (lista hardcoded). Con l'aggiunta del supporto multilingue e dell'utenza europea, occorre permettere a ogni utente di scegliere il proprio paese (tutti gli stati europei + UK) e la relativa regione/provincia. Questo migliora la ricerca geografica, la visualizzazione sulla mappa e la rilevanza delle proposte.

## Done looks like
- In registrazione (Step 3) appaiono due righe: prima il selettore paese, poi il selettore regione (dipendente dal paese scelto)
- In modifica profilo (`profile/edit`) stessa doppia selezione paese + regione
- Sull'app, il profilo mostra "Paese · Regione" invece della sola regione
- I cursori sugli altri utenti nella mappa e nelle liste mostrano "Paese · Regione"
- La mappa si centra correttamente quando l'utente ha paese+regione non-italiani
- La colonna `country` viene salvata nel DB e restituita dalle API
- Il Zod schema (`registerSchema` e update schema) accetta il campo `country`

## Out of scope
- Paesi extra-europei (nessun Sud America, Asia, ecc.)
- Traduzione dei nomi dei paesi/regioni nelle 5 lingue (rimangono in italiano/nativo per ora)
- Filtro mappa per paese o regione (funzionalità futura)

## Tasks

1. **Data file paesi+regioni** — Creare `lib/countries-regions.ts` con la lista completa dei paesi europei (ISO2 code + nome + flag emoji) e, per ciascuno, l'elenco delle sue regioni/province con coordinate geografiche per la mappa. Includere tutte le nazioni europee + UK. Aggiornare/sostituire `constants/regions.ts` per usare questa nuova sorgente dati.

2. **Schema e API** — Nel `shared/schema.ts` aggiungere `country` al `registerSchema` (Zod, opzionale, max 2 char). Verificare che le route server (`POST /api/auth/register`, `PUT /api/users/profile`) leggano e salvino correttamente il campo `country` già presente nella tabella DB.

3. **Registrazione** — In `app/(auth)/register.tsx` sostituire il singolo dr

_(troncato)_

### Risultato

- In registrazione (Step 3) appaiono due righe: prima il selettore paese, poi il selettore regione (dipendente dal paese scelto)
- In modifica profilo (`profile/edit`) stessa doppia selezione paese + regione
- Sull'app, il profilo mostra "Paese · Regione" invece della sola regione
- I cursori sugli altri utenti nella mappa e nelle liste mostrano "Paese · Regione"

---
## #37 — Verifica feature, pulizia cache e riavvio

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-16 16:47:05 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Verifica lingua, regioni, cache e riavvio

## What & Why
Verifica end-to-end che le tre feature implementate siano integre e funzionanti, pulizia della cache Metro, riavvio completo dell'app e controllo autonomo del corretto avvio. Include snapshot delle porte Replit prima e dopo.

## Done looks like
- Porte 5000 (backend) e 8081 (frontend) verificate e documentate prima e dopo
- I selettori lingua (IT/EN/DE/ES/FR) presenti e funzionanti in profile.tsx e _layout.tsx
- Le 5 lingue in lib/i18n.ts hanno copertura chiavi uniforme (nessuna chiave mancante)
- Il picker paese+regione (49 paesi europei) è integrato correttamente in register.tsx e profile/edit.tsx
- Cache Metro (.expo/cache) pulita
- Backend (porta 5000) e Frontend (porta 8081) riavviati e operativi
- Controllo autonomo post-avvio: health endpoint, login, /api/users, /api/routes rispondono 200

## Out of scope
- Modifiche funzionali alle feature (non aggiungere/cambiare logica)
- Aggiunta di nuovi paesi o nuove chiavi i18n
- Modifiche al database

## Tasks
1. **Snapshot porte pre-avvio** — Verificare che le porte 5000 e 8081 rispondano correttamente e registrare lo stato iniziale.

2. **Verifica selettori lingua** — Controllare che LanguageProvider sia montato in _layout.tsx, che profile.tsx mostri i 5 pulsanti lingua (IT/EN/DE/ES/FR) e che le chiavi AppLanguage siano corrette.

3. **Verifica copertura i18n** — Per ciascuna delle 5 lingue in lib/i18n.ts contare/verificare che tutte le chiavi siano presenti senza gap. Correggere eventuali chiavi mancanti.

4. **Verifica picker paese+regione** — Confermare che EUROPEAN_COUNTRIES (49 voci) sia importato e usato correttamente in register.tsx e profile/edit.tsx, con il flusso paese→regione funzionante.

5. **Pulizia cache Metro** — Eliminare la directory .expo/cache per forzare una rigenerazione pulita dei bundle al prossimo avvio.

6. **Riavvio backend e frontend** — Riavviare in sequenza il workflow Start Backend e poi Start Frontend, attendendo la conferma d

_(troncato)_

### Risultato

- Porte 5000 (backend) e 8081 (frontend) verificate e documentate prima e dopo
- I selettori lingua (IT/EN/DE/ES/FR) presenti e funzionanti in profile.tsx e _layout.tsx
- Le 5 lingue in lib/i18n.ts hanno copertura chiavi uniforme (nessuna chiave mancante)
- Il picker paese+regione (49 paesi europei) è integrato correttamente in register.tsx e profile/edit.tsx

---
## #38 — Fix lingua + dropdown selettore + logout prominente in profilo

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-16 17:12:58 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix lingua, dropdown e logout in profile

## What & Why

Tre problemi da correggere nella schermata profilo:

1. **Lingua non cambia**: `t()` è una funzione statica che legge una variabile di modulo — React non sa quando ri-renderizzare i componenti. Il meccanismo `renderKey` funziona su mobile ma non su web (Expo Router mantiene il proprio stato di navigazione). Fix: aggiungere hook `useT()` reattivo in `lib/i18n.ts` che restituisce una funzione `t` legata alla lingua corrente del context.

2. **Selettore lingua → menu a tendina**: rimpiazzare la barra di 5 pulsanti con un picker inline a tendina (expand/collapse) simile al picker paese in `profile/edit.tsx`.

3. **Tasto logout**: renderlo più visibile (pulsante rosso pieno), spostarlo sotto "elimina account", non prima.

## Done looks like

- Selezionando EN tutti i testi tradotti cambiano immediatamente (sia su web che su mobile)
- Il selettore lingua è un unico elemento con bandiera+nome lingua corrente, che si espande in una lista a tendina con le 5 opzioni
- Il tasto logout è un pulsante rosso prominente, posizionato sotto "Elimina account"
- L'ordine nella sezione azioni è: Elimina account → Logout (rosso pieno)

## Out of scope

- Aggiungere nuove chiavi i18n o nuove lingue
- Modificare la traduzione di schermate diverse da profile.tsx (le altre schermata beneficiano del `renderKey` esistente su mobile e si aggiorneranno comunque)
- Modifiche al backend

## Tasks

1. **Hook `useT()` in `lib/i18n.ts`** — Aggiungere export `useT()` che importa `useLanguage` dal context e restituisce una funzione `t` reattiva legata alla lingua corrente. Aggiornare `app/(tabs)/profile.tsx` per usare `useT()` invece dell'import statico `t`. Fare lo stesso per `app/(tabs)/index.tsx`, `app/(tabs)/proposals.tsx`, `app/(tabs)/chat.tsx`, `app/(tabs)/contest.tsx` — così tutte le tab si aggiornano senza dipendere solo dal remount.

2. **Selettore lingua a tendina** — In `app/(tabs)/profile.tsx`, rimpiazzare la `languageBar` con 5 pul

_(troncato)_

### Risultato

- Selezionando EN tutti i testi tradotti cambiano immediatamente (sia su web che su mobile)
- Il selettore lingua è un unico elemento con bandiera+nome lingua corrente, che si espande in una lista a tendina con le 5 opzioni
- Il tasto logout è un pulsante rosso prominente, posizionato sotto "Elimina account"
- L'ordine nella sezione azioni è: Elimina account → Logout (rosso pieno)

---
## #39 — Mass-seed europeo: distribuire utenti fake in tutta Europa

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-16 17:21:11 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Spread mass-seed across Europe

## What & Why

Attualmente tutti i 2420 utenti fake sono distribuiti nelle 20 regioni italiane con `country: "IT"` hardcodato. Bisogna riscrivere la distribuzione geografica per coprire tutta Europa mantenendo le stesse tipologie e quantità.

## Done looks like

- 2420 utenti fake distribuiti su ~45 zone europee (non solo Italia)
- Ogni utente ha `country` corretto per la sua zona (IT, DE, FR, ES, PL, ...)
- `spokenLanguages` variato per paese (IT, EN, DE, FR, ES, ecc.)
- Al trigger del nuovo seed, gli utenti con il vecchio tag italiano vengono eliminati e sostituiti con quelli europei
- Le coordinate GPS (`latitude/longitude` nel profilo) cadono nella zona europea corretta

## Out of scope

- Non cambiare quantità per categoria
- Non cambiare i nomi (restano italiani — ok per seed)
- Non cambiare le bio (restano in italiano)
- Non toccare il backend API o il frontend

## Implementazione

### 1. `server/mass-seed-data.ts`

Sostituire `REGIONS` (array di stringhe) e `REGION_COORDS` con una struttura `EUROPEAN_ZONES`:

```ts
export interface EuropeanZone {
  region: string;    // nome zona/regione
  country: string;   // ISO2 codice paese (IT, DE, FR, ...)
  lat: number;
  lng: number;
}

export const EUROPEAN_ZONES: EuropeanZone[] = [ ... ]
```

**Distribuzione zone (~45 totali, pesi proporzionali alla popolazione motociclistica):**

| Paese | Zone | Esempi |
|-------|------|--------|
| IT | 5 | Nord, Centro, Sud, Sicilia, Sardegna |
| DE | 5 | Bayern, NRW, Baden-Württ., Berlin, Hamburg |
| FR | 5 | Île-de-France, PACA, Occitanie, Bretagne, Grand Est |
| ES | 4 | Cataluña, Madrid, Andalucía, País Vasco |
| PL | 3 | Mazowieckie, Malopolska, Slaskie |
| NL | 2 | Noord-Holland, Zuid-Holland |
| BE | 2 | Bruxelles, Anvers |
| CH | 2 | Zurigo, Ginevra |
| AT | 2 | Vienna, Tirolo |
| SE | 2 | Stoccolma, Goteborg |
| PT | 1 | Lisbona |
| GR | 1 | Atene |
| CZ | 1 | Praga |
| HU | 1 | Budapest |
| RO | 1 | Bucarest |
| HR | 1 | Zagabria |
| 

_(troncato)_

### Risultato

- 2420 utenti fake distribuiti su ~45 zone europee (non solo Italia)
- Ogni utente ha `country` corretto per la sua zona (IT, DE, FR, ES, PL, ...)
- `spokenLanguages` variato per paese (IT, EN, DE, FR, ES, ecc.)
- Al trigger del nuovo seed, gli utenti con il vecchio tag italiano vengono eliminati e sostituiti con quelli europei

---
## #40 — Fix pulsante Elimina tutti utenti fake

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-16 17:47:57 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix "Elimina tutti" utenti fake

## What & Why

Il pulsante "Elimina tutti gli utenti fake" nel pannello admin non funziona in modo affidabile. L'indagine ha mostrato che nessuna richiesta DELETE raggiunge il backend, oppure la query è troppo pesante per il database serverless Neon.

Il problema più probabile: `deleteAllFakeUsers()` usa `.returning({ id: users.id })` che obbliga PostgreSQL a restituire 2420+ UUID dopo la DELETE, creando un payload enorme e potenziale timeout. Dopo l'eliminazione, le conversation di BikerLink_Official con i fake user rimangono orfane nel DB.

## Done looks like

- Il click su "Elimina tutti" → modal di conferma → click "Elimina tutti" nel modal → spinner attivo → dopo qualche secondo il messaggio di successo appare e la lista si svuota
- Nessun errore silenzioso: se la DELETE fallisce, il testo di errore è visibile sotto il pulsante
- I log del backend mostrano la DELETE arrivare e completarsi con `[Admin] Eliminati N utenti fake`
- Le conversation orfane (con solo BikerLink_Official come partecipante) vengono eliminate dopo la DELETE degli utenti fake
- `skip_fake_user_seed=true` è impostato dopo la DELETE per impedire il re-seed automatico

## Out of scope

- Paginazione / progresso live della DELETE (operazione one-shot, non background)
- Modifica al mass-seed europeo (già implementato in task #39)

## Tasks

1. **Fix `deleteAllFakeUsers()` nel backend** — Rimuovere `.returning()`, usare `count(*)` prima della DELETE per ottenere il numero di utenti eliminati senza trasferire 2420 UUID. Aggiungere `console.log` all'inizio e alla fine dell'operazione. Aggiungere pulizia delle conversation orfane (conversation dove BikerLink_Official è l'unico partecipante rimasto).

2. **Migliorare feedback nel frontend** — Assicurarsi che il `deleteAllResultMsg` di errore sia visibile dopo la DELETE (attualmente la posizione nello schermo potrebbe renderlo non visibile). Il pulsante deve mostrare lo spinner mentre `deleteAllMutation.isPending ==

_(troncato)_

### Risultato

- Il click su "Elimina tutti" → modal di conferma → click "Elimina tutti" nel modal → spinner attivo → dopo qualche secondo il messaggio di successo appare e la lista si svuota
- Nessun errore silenzioso: se la DELETE fallisce, il testo di errore è visibile sotto il pulsante
- I log del backend mostrano la DELETE arrivare e completarsi con `[Admin] Eliminati N utenti fake`
- Le conversation orfane (con solo BikerLink_Official come partecipante) vengono eliminate dopo la DELETE degli utenti fake

---
## #41 — Chat di gruppo MotoClub

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-16 18:04:13 UTC |
| **Aggiornato** | 2026-04-08 20:40:57 UTC |

### Richiesta

# Chat di Gruppo MotoClub

## What & Why
Quando un utente è iscritto a un MotoClub, cliccando sulla card del club deve aprirsi la chat di gruppo. Il backend crea già automaticamente una conversazione di tipo "motoclub" al momento del join, con `conversationId` disponibile nell'API. Manca solo il collegamento lato frontend.

## Done looks like
- Nella scheda "I Miei" del tab MotoClub, cliccando sulla card di un club iscritto si apre la chat di gruppo con il nome del club come titolo
- La chat mostra il numero di partecipanti nel sottotitolo
- Il tab Chat elenca correttamente le conversazioni dei club con icona e titolo (nome del club)
- Le chat dei club senza ancora un `conversationId` mostrano un messaggio informativo invece di crashare

## Out of scope
- Modifiche al backend (tutto già funziona lato server)
- Creazione manuale di conversazioni (già gestita al join)
- Notifiche push per i messaggi di gruppo

## Tasks
1. **Tipo UserClub e prop onOpenChat** — Aggiungere `conversationId` al tipo `UserClub` e aggiungere prop `onOpenChat` a `ClubCard` per navigare alla chat quando il body del club viene toccato da un membro iscritto.

2. **Navigazione alla chat nel main screen** — Nel componente `MotoclubScreen`, aggiungere `useRouter()` e l'handler che naviga a `/chat/{conversationId}`. Solo per club iscritti con conversationId disponibile; mostrare un'icona chat sul card per segnalare l'azione disponibile.

3. **Gestione tipo "motoclub" in chat/[id].tsx** — Aggiornare `getTitle()` e il sottotitolo dei partecipanti per gestire `conversationType === "motoclub"` come già avviene per "group". Non mostrare link al profilo utente nelle chat motoclub.

4. **Gestione tipo "motoclub" nel tab Chat** — Aggiornare `getConversationTitle` e la logica dell'icona avatar nel tab Chat per mostrare correttamente le conversazioni di tipo "motoclub" con nome e icona club (shield/people).

## Relevant files
- `app/(tabs)/motoclub.tsx:21-192`
- `app/(tabs)/motoclub.tsx:237-559`
- `app/chat/[

_(troncato)_

### Risultato

- Nella scheda "I Miei" del tab MotoClub, cliccando sulla card di un club iscritto si apre la chat di gruppo con il nome del club come titolo
- La chat mostra il numero di partecipanti nel sottotitolo
- Il tab Chat elenca correttamente le conversazioni dei club con icona e titolo (nome del club)
- Le chat dei club senza ancora un `conversationId` mostrano un messaggio informativo invece di crashare

---
## #42 — Filtro hashtag nelle chat MotoClub

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-16 18:05:38 UTC |
| **Aggiornato** | 2026-04-08 20:40:57 UTC |

### Richiesta

# Filtro Hashtag nelle Chat MotoClub

  ## What & Why
  Nelle chat di gruppo dei MotoClub, gli utenti devono poter usare hashtag regionali (es. #veneto, #liguria) per organizzare i messaggi. Un banner di benvenuto spiega la funzionalità, un bottone filtro permette di vedere solo i messaggi con gli hashtag scelti. Un toggle opzionale aggiunge automaticamente gli hashtag attivi in fondo ad ogni messaggio inviato.

  ## Done looks like
  - Aprendo una chat motoclub, compare un banner informativo (solo UI, non un messaggio reale) che invita a usare l'hashtag della regione, con un esempio concreto come "#veneto #liguria"
  - In cima alla chat (header della topBar), appare un'icona filtro-hashtag (#) cliccabile, visibile solo nelle chat di tipo "motoclub"
  - Toccando l'icona si apre un pannello sotto la topBar con:
    - Campo di testo libero in cui scrivere uno o più hashtag separati da spazi (es. `#veneto #liguria`)
    - Toggle "Aggiungi automaticamente a fine frase" — quando attivo, ogni messaggio inviato riceve gli hashtag attivi appesi in fondo in automatico
    - Contatore messaggi filtrati (es. "12 di 45 messaggi")
    - Pulsante "×" per svuotare il filtro e tornare alla vista completa
  - Quando il filtro è attivo, vengono mostrati solo i messaggi che contengono almeno uno degli hashtag inseriti (confronto case-insensitive)
  - Quando il toggle auto-hashtag è attivo e l'utente invia un messaggio, il testo viene spedito con gli hashtag del filtro appesi alla fine (es. "Bella gita oggi! #veneto #dolomiti")
  - Nelle bolle dei messaggi, le parole che iniziano con `#` sono evidenziate in colore accentuato (Colors.accent)
  - La funzionalità funziona su iOS, Android e web

  ## Out of scope
  - Modifiche al backend o al DB
  - Hashtag suggeriti automaticamente
  - Ricerca full-text nei messaggi (solo hashtag #parola)
  - Funzionalità hashtag nelle chat private o di proposta

  ## Tasks
  1. **Banner di benvenuto motoclub** — Aggiungere un elemento UI non interattivo 

_(troncato)_

### Risultato

## Relevant files
- `app/chat/[id].tsx`
- `constants/colors.ts`

---
## #43 — Traduzione completa app — passata sistematica

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-16 18:22:50 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Traduzione Completa App — Passata Sistematica

## What & Why
Molte schermate dell'app hanno testo italiano hardcoded che non passa dal sistema i18n, rendendo inutile la scelta della lingua. Problemi principali segnalati: "Zavorrina" non si traduce mai, le etichette delle proposte restano in italiano, le date sono sempre in formato it-IT.

## Done looks like
- Scegliendo Inglese: "Pillion" ovunque appare "Zavorrina", "With Pillion" dove appare "Con Zavorrina", "Accepted"/"Rejected" per i match, date in formato en-GB
- Scegliendo Tedesco: "Sozia", "Mit Sozia", "Akzeptiert"/"Abgelehnt", date in de-DE
- Scegliendo Spagnolo: "Pasajera", "Con Pasajera", "Aceptado"/"Rechazado", date in es-ES
- Scegliendo Francese: "Passagère", "Avec Passagère", "Accepté"/"Rejeté", date in fr-FR
- Filtri proposte ("Giro tra Biker", "Passaggio al volo", "Richieste") tradotti
- Etichette tipi proposta nella card e nella schermata dettaglio tradotte
- Sottotitoli scelta tipo proposta nella creazione tradotti
- Status match (Accettato/Rifiutato/Match Garage) tradotti
- "Nessuna zavorrina disponibile" e messaggi analoghi tradotti
- Tutte le date formattate nella locale corretta (en-GB, de-DE, es-ES, fr-FR invece di it-IT fisso)

## Out of scope
- Contenuto generato dagli utenti (titolo e descrizione delle singole proposte, messaggi in chat) — non traducibile
- Schermate admin (solo per admin italiani, bassa priorità)
- Schermata moderatore
- Nuove chiavi di traduzione per funzionalità future

## Tasks

1. **Helper `langToLocale()` e date localizzate** — Aggiungere in `lib/i18n.ts` una funzione `langToLocale(lang: AppLanguage): string` che mappa le 5 lingue alle rispettive BCP-47 locale (it-IT, en-GB, de-DE, es-ES, fr-FR). Sostituire tutti i 33+ `toLocaleDateString("it-IT", ...)` e `toLocaleTimeString("it-IT", ...)` nell'app con chiamate che usano la locale corrente dell'utente.

2. **Chiavi i18n mancanti — tipi utente e proposte** — Aggiungere a `lib/i18n.ts` per tutte e 5 le lingue le chiavi:

_(troncato)_

### Risultato

## Relevant files
- `lib/i18n.ts`
- `lib/language-context.tsx`
- `app/(tabs)/proposals.tsx`

---
## #44 — Notifiche email per feedback e segnalazioni

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-16 18:35:50 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Notifiche Email Feedback e Segnalazioni

## What & Why
Quando un utente invia un feedback/bug report o segnala un altro utente, i dati vengono salvati nel DB ma l'admin non riceve nessun avviso. Aggiungere l'invio automatico di un'email a bikerlinkapp@gmail.com ad ogni submission, così i problemi e le richieste vengono notati immediatamente.

## Done looks like
- Un utente invia un feedback → email arriva a bikerlinkapp@gmail.com con tipo (bug/suggerimento/altro), oggetto, messaggio e nickname del mittente
- Un utente segnala un altro utente → email arriva a bikerlinkapp@gmail.com con nickname del segnalante, nickname del segnalato, motivo e descrizione
- Se le credenziali Gmail non sono configurate, il salvataggio nel DB avviene comunque senza errori (comportamento già esistente)
- L'email è formattata in stile BikerLink (dark card, arancione) come le email esistenti

## Out of scope
- Notifiche push
- Pannello admin già esistente (i ticket restano visibili lì come prima)
- Modifica al frontend

## Tasks

1. **Email notifica feedback** — Nel backend `server/routes/feedback.ts`, dopo `storage.createFeedbackTicket()`, chiamare `sendEmail("bikerlinkapp@gmail.com", ...)` con oggetto e corpo HTML che include tipo ticket, oggetto, messaggio e nickname dell'utente. Recuperare il nickname dalla sessione tramite `storage.getUser()`.

2. **Email notifica segnalazione** — Nel backend `server/routes/reports.ts`, dopo `storage.createReport()`, chiamare `sendEmail("bikerlinkapp@gmail.com", ...)` con nickname del segnalante (via `storage.getUser(userId)`), nickname del segnalato (già recuperato), motivo e descrizione.

## Relevant files
- `server/routes/feedback.ts`
- `server/routes/reports.ts`
- `server/email.ts`

### Risultato

- Un utente invia un feedback → email arriva a bikerlinkapp@gmail.com con tipo (bug/suggerimento/altro), oggetto, messaggio e nickname del mittente
- Un utente segnala un altro utente → email arriva a bikerlinkapp@gmail.com con nickname del segnalante, nickname del segnalato, motivo e descrizione
- Se le credenziali Gmail non sono configurate, il salvataggio nel DB avviene comunque senza errori (comportamento già esistente)
- L'email è formattata in stile BikerLink (dark card, arancione) come le email esistenti

---
## #45 — Manuale utente PDF multilingue scaricabile

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-16 18:44:49 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Manuale Utente PDF Multilingue

## What & Why
Ogni utente deve poter scaricare un manuale d'uso completo di BikerLink direttamente dalla sezione Profilo. L'admin può aggiornare il file quando vuole. Il PDF contiene le istruzioni in tutte le 5 lingue supportate (IT/EN/DE/ES/FR).

## Done looks like
- Nel tab Profilo compare un bottone "Scarica Manuale" (icona PDF) che avvia il download del PDF sul dispositivo
- Il PDF si scarica direttamente (no anteprima in-app), usando expo-file-system + expo-sharing
- Il manuale è completo: registrazione, navigazione, mappa, proposte, match garage, chat, contest, tracking, easter eggs, lingua, sicurezza — in tutte e 5 le lingue
- Il pannello Admin ha una voce "Manuale PDF" con un bottone "Carica nuovo PDF" (file upload) e mostra nome file e data aggiornamento del file attivo
- Backend: endpoint GET /api/manual/download che serve il PDF come attachment; endpoint POST /api/admin/manual/upload (admin only) per sostituire il file
- Il PDF generato alla prima build viene fornito all'utente come link diretto scaricabile

## Out of scope
- Visualizzazione in-app del PDF (solo download)
- Generazione PDF dinamica per ogni lingua separatamente (un file unico con tutte le sezioni)
- Traduzione automatica

## Tasks

1. **Genera PDF manuale completo** — Creare uno script Node.js one-shot `scripts/generate-manual.ts` che usa `pdfkit` per generare `server/public/bikerlink-manual.pdf`. Il PDF ha una copertina BikerLink (arancione, logo), poi per ogni lingua (IT/EN/DE/ES/FR) una sezione con: titolo lingua, capitoli (Registrazione, Navigazione, Mappa e disponibilità, SOS, Proposte, Match Garage, Chat privata, MotoClub, Contest foto, Tracking, Easter Eggs, Impostazioni e Lingua, Sicurezza e Privacy). Ogni capitolo ha un heading colorato e paragrafi di testo esplicativo dettagliato. Eseguire lo script e committare il PDF generato.

2. **Backend download e upload** — Aggiungere a Express la rotta GET `/api/manual/download` che serve `server/public/

_(troncato)_

### Risultato

## Relevant files
- `server/routes.ts`
- `server/routes/admin.ts`
- `app/(tabs)/profile.tsx`

---
## #46 — Filtro mappa per paese — Definisci Area

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-16 19:22:44 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Filtro Mappa per Paese

## What & Why
La mappa carica tutti gli utenti disponibili senza distinzione geografica, causando lentezza su una piattaforma pan-europea con 50+ paesi. Aggiungere un filtro "Definisci Area" che permette all'utente di scegliere quali paesi includere nella visualizzazione, riducendo drasticamente il carico di rete e la complessità visiva della mappa.

## Done looks like
- Pulsante "Definisci Area" in basso a destra nella schermata Mappa
- Toccandolo si apre un modal/sheet con la lista dei paesi europei: Italia in cima, poi gli altri in ordine
- Ogni paese mostra flag + nome + spunta (checkbox) per includerlo/escluderlo
- Al primo accesso (o se non salvata), la selezione default è solo il paese dell'utente (rilevato da GPS o dal campo `country` del profilo)
- La selezione viene salvata persistentemente (AsyncStorage, chiave `map_area_countries`)
- La mappa mostra solo gli utenti dei paesi selezionati (filtro applicato sia a nearby, sia alle liste biker/zavorrine)
- Le API backend accettano il parametro `?countries=IT,DE,FR` e filtrano a livello SQL (`users.country IN (...)`) — nessuna modifica allo schema DB
- Il label del pulsante mostra quanti paesi sono attivi (es. "1 paese" o "3 paesi") quando il filtro è attivo
- Traduzione della chiave `home.defineArea` in tutte e 5 le lingue (IT/EN/DE/ES/FR)
- **Al termine**: verificare che backend (porta 5000) e frontend (porta 8081) si avviino correttamente — riavviare entrambi i workflow e confermare nel log che entrambe le porte siano attive

## Out of scope
- Filtro per regione (solo per paese)
- Modifica allo schema del database
- Cambio del sistema di coordinate GPS

## Tasks
1. **Backend — aggiungere filtro countries alle route** — Modificare `/api/users/nearby`, `/api/users/online-list`, `/api/users/biker-available-list`, `/api/users/zavorrine-available-list` in `server/routes/users.ts` per accettare `?countries=` (stringa CSV). Se presente, passarlo al layer storage. Modificare `getNearbyUser

_(troncato)_

### Risultato

## Relevant files
- `app/(tabs)/index.tsx`
- `server/routes/users.ts:280,440,534,600`
- `server/storage.ts:893,920`

---
## #47 — Contatori filtrati per paesi selezionati

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-16 19:40:56 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Contatori filtrati per paesi selezionati

## What & Why
I tre contatori "online", "biker disponibili" e "zavorrine disponibili" mostrano totali globali anche quando l'utente ha selezionato una specifica area geografica (paesi). Questo crea incoerenza: le liste mostrano solo i paesi scelti, ma i badge dei counter mostrano tutti gli utenti del mondo. Bisogna allinearli.

## Done looks like
- Il counter "online" mostra solo gli utenti online nei paesi selezionati
- Il counter "biker disponibili" mostra solo i biker disponibili nei paesi selezionati
- Il counter "zavorrine disponibili" mostra solo le zavorrine disponibili nei paesi selezionati
- I counter si aggiornano automaticamente quando l'utente cambia i paesi nell'area modal
- Il comportamento è backward-compatible: senza `?countries=` i counter tornano il totale globale

## Out of scope
- Modifiche all'interfaccia dei counter (solo il dato cambia, non il layout)
- Aggiunta di nuovi counter

## Tasks
1. **Backend — aggiungere filtro `countries` ai 3 route dei counter** — Le route `/online-count`, `/biker-available-count` e `/zavorrine-available-count` in `server/routes/users.ts` devono parsare il parametro `?countries=` (CSV, come già fanno i route delle liste) e passarlo alle funzioni di storage.

2. **Storage — aggiungere `countries?` alle 3 funzioni di count** — Le funzioni `countOnlineUsers`, `countAvailableBikers` e `countAvailableZavorrine` in `server/storage.ts` devono aggiungere `inArray(users.country, countries)` alla clausola WHERE quando il parametro è presente, esattamente come già fanno le funzioni `getOnlineUsersList`, `getAvailableBikersList` e `getAvailableZavorrinaList`.

3. **Frontend — passare `countriesQueryParam` alle 3 query dei counter** — In `app/(tabs)/index.tsx`, le 3 `useQuery` per i counter devono includere `?countries=...` nell'URL e nei `queryKey` (come array `["/api/users/online-count", countriesQueryParam]`), così la cache si invalida automaticamente quando l'utente cambia l'area.

_(troncato)_

### Risultato

- Il counter "online" mostra solo gli utenti online nei paesi selezionati
- Il counter "biker disponibili" mostra solo i biker disponibili nei paesi selezionati
- Il counter "zavorrine disponibili" mostra solo le zavorrine disponibili nei paesi selezionati
- I counter si aggiornano automaticamente quando l'utente cambia i paesi nell'area modal

---
## #48 — Retry compilazione backend su OOM

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-16 19:50:34 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Retry compilazione backend su OOM

## What & Why
Lo script `scripts/start-backend.sh` non riprova la compilazione TypeScript se questa viene uccisa dal sistema (es. OOM killer). Il loop di retry esiste solo per crash del server già avviato — se `npm run server:build` fallisce, lo script esce subito con `exit 1` senza mai ritentare. Serve aggiungere un retry loop anche alla fase di compilazione.

## Done looks like
- Se la compilazione viene uccisa (OOM o altro errore), lo script riprova automaticamente fino a 3 volte
- Tra un tentativo di compilazione e l'altro, aspetta qualche secondo per lasciare che la RAM si liberi
- Se tutti i tentativi di compilazione falliscono, lo script esce con errore come prima
- Il comportamento normale (compilazione ok al primo tentativo) non cambia

## Out of scope
- Modifiche al processo di compilazione esbuild
- Modifiche alla configurazione di memoria del sistema
- Modifiche agli altri workflow

## Tasks
1. **Aggiungere retry loop alla compilazione** — In `scripts/start-backend.sh`, sostituire la chiamata singola a `npm run server:build` con un loop che riprova fino a 3 volte, con una pausa di 5 secondi tra un tentativo e l'altro, stampando il numero del tentativo corrente.

## Relevant files
- `scripts/start-backend.sh`

### Risultato

- Se la compilazione viene uccisa (OOM o altro errore), lo script riprova automaticamente fino a 3 volte
- Tra un tentativo di compilazione e l'altro, aspetta qualche secondo per lasciare che la RAM si liberi
- Se tutti i tentativi di compilazione falliscono, lo script esce con errore come prima
- Il comportamento normale (compilazione ok al primo tentativo) non cambia

---
## #49 — Mappa centrata su regione/ultima GPS all'apertura

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-17 08:58:03 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Mappa centrata su regione/ultima GPS all'apertura

## What & Why
All'apertura dell'app, la mappa aspetta il GPS live prima di centrarsi. L'utente vede la mappa inizialmente ferma su Roma o in posizione sbagliata. La logica corretta è: centrare immediatamente sulla regione del profilo (dati già disponibili), poi sull'ultima posizione GPS salvata, poi — solo se necessario — chiedere il GPS live.

## Done looks like
- Aprendo l'app, la mappa si centra immediatamente sulla regione del profilo utente (es: "Lombardia" → Milano)
- Se l'utente non ha una regione impostata, la mappa si centra sull'ultima posizione GPS salvata (il server la include già nell'oggetto utente come `profileLatitude`/`profileLongitude`)
- Solo se entrambe mancano, viene richiesto il GPS live
- Il GPS live continua a girare in background (come adesso) per aggiornare la posizione sul server
- Il comportamento del pulsante "centra sulla mia posizione" non cambia

## Out of scope
- Modifiche al backend
- Modifiche al tipo di accuratezza del GPS
- Modifiche al salvataggio della posizione sul server

## Tasks
1. **Invertire la priorità del centraggio iniziale** — In `app/(tabs)/index.tsx`, modificare l'`useEffect` che chiama `fetchGPSLocation` al mount: prima controllare `user?.region` (→ `getRegionCoordinates`), poi `user?.profileLatitude/profileLongitude`, e solo se entrambi mancano richiedere il GPS live. Il GPS live va sempre chiamato in background per aggiornare la posizione sul server, ma non deve bloccare il centraggio iniziale della mappa.

## Relevant files
- `app/(tabs)/index.tsx:179-242`
- `lib/countries-regions.ts:620-640`
- `server/routes/auth.ts:224-228`

### Risultato

- Aprendo l'app, la mappa si centra immediatamente sulla regione del profilo utente (es: "Lombardia" → Milano)
- Se l'utente non ha una regione impostata, la mappa si centra sull'ultima posizione GPS salvata (il server la include già nell'oggetto utente come `profileLatitude`/`profileLongitude`)
- Solo se entrambe mancano, viene richiesto il GPS live
- Il GPS live continua a girare in background (come adesso) per aggiornare la posizione sul server

---
## #50 — Lazy loading traduzioni i18n per lingua

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-17 09:11:32 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Lazy loading traduzioni i18n per lingua

## What & Why
`lib/i18n.ts` contiene tutti e 5 i dizionari di traduzione in un unico file da 1816 righe. Metro deve parsare tutto al bundle iniziale, causando un rallentamento visibile (~40% del bundling). Ogni utente usa una sola lingua ma paga il costo di caricarle tutte.

## Done looks like
- Il bundle iniziale carica solo la lingua selezionata dall'utente (~360 righe invece di 1816)
- Le altre lingue vengono caricate solo se l'utente cambia lingua nelle impostazioni
- Il cambio lingua funziona esattamente come prima (nessuna regressione)
- Il rallentamento al 40% del bundling scompare o si riduce significativamente

## Out of scope
- Modifiche all'interfaccia utente del selettore lingua
- Aggiunta di nuove chiavi di traduzione
- Modifiche al backend

## Tasks
1. **Creare 5 file separati per lingua** — Dividere il contenuto di `lib/i18n.ts` in 5 file: `lib/i18n/it.ts`, `lib/i18n/en.ts`, `lib/i18n/de.ts`, `lib/i18n/es.ts`, `lib/i18n/fr.ts`. Ciascun file esporta `default` il dizionario della propria lingua.

2. **Refactoring di `lib/i18n.ts`** — Sostituire l'oggetto `translations` monolitico con una funzione `loadTranslations(lang)` che usa `require()` inline in uno switch-case. Metro carica il modulo solo quando il `require()` viene effettivamente chiamato, evitando il parsing anticipato degli altri file. Mantenere tutte le funzioni pubbliche esistenti (`tWithLang`, `setAppLanguage`, `getAppLanguage`, `langToLocale`) con la stessa firma.

3. **Aggiornare `lib/language-context.tsx`** — La lingua viene caricata da AsyncStorage all'avvio. Assicurarsi che al mount del provider, `loadTranslations` venga chiamato con la lingua corretta prima del primo render dei figli, così non c'è flash di testo non tradotto.

## Relevant files
- `lib/i18n.ts`
- `lib/language-context.tsx`

### Risultato

- Il bundle iniziale carica solo la lingua selezionata dall'utente (~360 righe invece di 1816)
- Le altre lingue vengono caricate solo se l'utente cambia lingua nelle impostazioni
- Il cambio lingua funziona esattamente come prima (nessuna regressione)
- Il rallentamento al 40% del bundling scompare o si riduce significativamente

---
## #51 — Default paese mappa: sempre Italia

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-17 09:47:21 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Default paese mappa: sempre Italia

## What & Why
Al primo avvio, se non ci sono paesi salvati in AsyncStorage, il codice usa `user.country` come default (es. "DE" per un utente tedesco) oppure fa una rilevazione GPS lenta (5+ secondi). Questo causa due problemi: un utente tedesco vede solo biker tedeschi sulla mappa, e la rilevazione GPS rallenta l'avvio.

Il comportamento corretto è: se nessun paese è salvato in AsyncStorage → default fisso `["IT"]`, sempre. L'utente può aggiungere altri paesi dal selettore area.

## Done looks like
- Un nuovo utente (qualsiasi nazionalità) al primo avvio della mappa vede solo l'Italia selezionata
- Nessuna richiesta GPS viene fatta per determinare il paese iniziale
- Gli utenti esistenti con paesi già salvati in AsyncStorage non sono impattati
- Il selettore area funziona come prima per aggiungere/rimuovere paesi

## Out of scope
- Cambiare la logica del selettore area (modalità di aggiunta paesi rimane invariata)
- Cambiare il paese nel profilo utente (campo `country` del profilo rimane separato)

## Tasks
1. **Semplificare il useEffect di inizializzazione paesi** — Se AsyncStorage non ha `map_area_countries`, impostare direttamente `["IT"]` senza passare per `user.country` né per rilevazione GPS. Rimuovere tutto il codice GPS (righe 110-144 di index.tsx).

## Relevant files
- `app/(tabs)/index.tsx:89-151`

### Risultato

- Un nuovo utente (qualsiasi nazionalità) al primo avvio della mappa vede solo l'Italia selezionata
- Nessuna richiesta GPS viene fatta per determinare il paese iniziale
- Gli utenti esistenti con paesi già salvati in AsyncStorage non sono impattati
- Il selettore area funziona come prima per aggiungere/rimuovere paesi

---
## #52 — Selettore paese nell'header della mappa

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-17 09:54:11 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Selettore paese nell'header della mappa

## What & Why
Il pulsante di selezione area (🌍 Area — 🇮🇹 1 paese) è attualmente posizionato sotto la barra di ricerca, togliendo spazio verticale alle pubblicità e alle stats. Deve essere spostato dentro la riga dell'header, tra l'icona del casco e l'icona della chat.

Layout attuale:
```
[BikerLink + 🪖]                    [💬]
[barra di ricerca]
[🌍 Area — 🇮🇹 1 paese >]   ← da rimuovere qui
[stats: online / biker / zavorrine]
[pubblicità]
```

Layout finale:
```
[BikerLink + 🪖]  [🌍 🇮🇹 1 paese]  [💬]
[barra di ricerca]
[stats: online / biker / zavorrine]
[pubblicità]  ← guadagna una riga di spazio
```

## Done looks like
- Il pulsante area/paese compare nell'header tra il logo casco e l'icona chat
- Cliccandolo apre il modal di selezione area come prima
- La riga `defineAreaBtnInline` è rimossa dalla posizione attuale (tra ricerca e stats)
- Le stats e le pubblicità non hanno più la riga del selettore paese sopra

## Out of scope
- Cambiare il comportamento del modal di selezione area
- Cambiare la versione fullscreen della mappa (ha il suo pulsante separato)

## Tasks
1. **Spostare il Pressable `defineAreaBtnInline` nell'header** — Rimuoverlo dalla posizione attuale (riga 763-774) e inserirlo nel `View` dell'header (riga 599-607) tra `titleRow` e l'icona chat. Adattare lo stile `defineAreaBtnInline` per stare in orizzontale nell'header (dimensioni compatte, senza margini verticali).

## Relevant files
- `app/(tabs)/index.tsx:599-607,763-774,1251-1257,1766-1789`

### Risultato

- Il pulsante area/paese compare nell'header tra il logo casco e l'icona chat
- Cliccandolo apre il modal di selezione area come prima
- La riga `defineAreaBtnInline` è rimossa dalla posizione attuale (tra ricerca e stats)
- Le stats e le pubblicità non hanno più la riga del selettore paese sopra

---
## #53 — Fix 3 bug: moderatore back, ads lock, garage predefinita

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-17 20:14:58 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix 3 bug: moderatore, ads, garage predefinita

## What & Why

### Bug 1 — Freccia indietro moderatore su Android
Il pannello moderatore (`app/moderator/index.tsx`) usa un pulsante custom con `router.back()`. Se non esiste storia di navigazione nel stack (edge case), il back non funziona. Fix: usare `router.canGoBack()` e come fallback `router.replace("/(tabs)/profile")`.

### Bug 2 — Advertisement: blocco upload e banner warning
In `app/admin/ads.tsx` non viene mai letto lo stato globale `adsEnabled`. Il flusso corretto è: disabilitare gli ads → caricare campagne → riattivare. Fix:
- Aggiungere la query `/api/settings/ads-enabled` nella schermata
- Se `adsEnabled = true`: mostrare un banner warning sopra il form di creazione + disabilitare il pulsante di apertura del modal create

### Bug 3 — "Predefinita" scompare dal garage
Causa: `server/routes/motorcycles.ts` — `isDefault` non è nell'array `allowedFields` della route PUT, quindi viene silenziosamente ignorato dal backend.
Fix backend:
- Aggiungere `"isDefault"` agli `allowedFields`
- Quando `isDefault: true` viene salvato, resettare `isDefault = false` su tutte le altre moto dello stesso utente (una sola predefinita per volta)

## Done looks like
- Su Android, la freccia indietro del pannello moderatore funziona sempre
- In admin ads, se gli annunci sono attivi, compare un banner giallo e il pulsante "+" per creare una campagna è disabilitato
- In admin ads, se gli annunci sono disattivi, il form funziona normalmente
- Nel garage, dopo aver salvato una moto come "Predefinita", il badge "Predefinita" rimane visibile anche riaprendo la schermata di modifica

## Out of scope
- Cambiare il flusso di abilitazione/disabilitazione annunci globale
- Logica di moderazione dei log (solo fix back button)

## Tasks
1. **Bug 1 — Back button moderatore** — In `app/moderator/index.tsx`, modificare il gestore del back button per usare `router.canGoBack()` con fallback su `router.replace("/(tabs)/profile")`.

2. **Bug 2 — Ads

_(troncato)_

### Risultato

- Su Android, la freccia indietro del pannello moderatore funziona sempre
- In admin ads, se gli annunci sono attivi, compare un banner giallo e il pulsante "+" per creare una campagna è disabilitato
- In admin ads, se gli annunci sono disattivi, il form funziona normalmente
- Nel garage, dopo aver salvato una moto come "Predefinita", il badge "Predefinita" rimane visibile anche riaprendo la schermata di modifica

---
## #54 — Avvio sequenziale: porte, cache, riavvio

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-17 20:33:15 UTC |
| **Aggiornato** | 2026-04-08 20:40:57 UTC |

### Richiesta

# Avvio sequenziale: porte, cache, riavvio

## What & Why
Applicare il protocollo operativo standard prima di procedere con qualsiasi sviluppo: verifica porte attive, pulizia cache, riavvio ordinato Backend → Frontend. Garantisce un ambiente pulito e stabile per i task successivi.

## Done looks like
- Le porte 5000 (backend) e 8081 (frontend) sono libere e poi rioccupate correttamente dopo il riavvio
- La cache Expo/Metro è svuotata (flag --clear)
- Il backend si avvia e risponde su /api/health prima che il frontend parta
- Il frontend è visibile e funzionante sul web preview

## Out of scope
- Modifiche al codice applicativo
- Nuove feature

## Tasks
1. **Controllo porte prima del riavvio** — Verificare che le porte 5000 e 8081 siano occupate o libere e loggare lo stato iniziale.
2. **Stop e pulizia** — Fermare i workflow Start Backend e Start Frontend. Svuotare la cache Metro/Expo (--clear).
3. **Riavvio sequenziale** — Avviare prima Start Backend, attendere che risponda su /api/health, poi avviare Start Frontend.
4. **Controllo porte dopo il riavvio** — Verificare che entrambe le porte siano occupate correttamente e che l'app sia raggiungibile.

## Relevant files
- `server/index.ts`

### Risultato

- Le porte 5000 (backend) e 8081 (frontend) sono libere e poi rioccupate correttamente dopo il riavvio
- La cache Expo/Metro è svuotata (flag --clear)
- Il backend si avvia e risponde su /api/health prima che il frontend parta
- Il frontend è visibile e funzionante sul web preview

---
## #55 — Heartbeat + visibilità utenti in tempo reale

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-17 20:34:02 UTC |
| **Aggiornato** | 2026-04-08 20:40:57 UTC |

### Richiesta

# Heartbeat + Visibilità utenti in tempo reale

## What & Why
`lastLoginAt` viene aggiornato solo al login. Dopo 15 minuti senza heartbeat, ogni utente scompare da tutti i counter e liste online — anche se sta usando attivamente l'app. Questo causa tre sintomi visibili: (1) due utenti reali loggati non si vedono a vicenda, (2) in produzione nessuno compare nei counter, (3) un utente vede se stesso sulla mappa ma non nei conteggi. Parallelamente, i fake users vengono creati senza il campo `country` (sempre NULL), quindi risultano invisibili quando il filtro mappa è su `["IT"]`.

## Done looks like
- Due utenti reali loggati si vedono l'uno nell'altro nelle liste online/disponibili finché restano nell'app
- I counter biker/zavorrine/online si aggiornano correttamente in produzione senza dover rifare il login
- I fake users con paese IT (o senza paese) appaiono nei counter e nella lista quando il toggle è attivo
- L'utente vede se stesso anche nei counter, non solo sulla mappa

## Out of scope
- Presença/absence indicator in real time (WebSocket) — il polling ogni 5 min è sufficiente
- Cambio della finestra di "online" da 15 a un altro valore

## Tasks
1. **Endpoint heartbeat** — Aggiungere `POST /api/auth/heartbeat` (requireAuth) che aggiorna `lastLoginAt = now` per l'utente autenticato e risponde `{ ok: true }`. Nessun body richiesto.

2. **Chiamata heartbeat dal frontend** — Nel root layout (`app/_layout.tsx`), aggiungere un `useEffect` con un `AppState` listener: quando l'app torna in foreground, e ogni 5 minuti mentre è in foreground, chiamare il heartbeat (solo se autenticato). Usare `setInterval` + `AppState.addEventListener("change")`. Il timer deve essere pulito al dismount.

3. **Fix fake users: campo country** — Nella route di creazione fake user (`POST /api/admin/fake-users`), aggiungere `country: "IT"` come default quando non viene passato un campo country. Aggiornare anche la route di toggle-all (`PUT /api/admin/fake-users/toggle-all`) per settare `countr

_(troncato)_

### Risultato

- Due utenti reali loggati si vedono l'uno nell'altro nelle liste online/disponibili finché restano nell'app
- I counter biker/zavorrine/online si aggiornano correttamente in produzione senza dover rifare il login
- I fake users con paese IT (o senza paese) appaiono nei counter e nella lista quando il toggle è attivo
- L'utente vede se stesso anche nei counter, non solo sulla mappa

---
## #56 — Fix email verifica registrazione

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-17 20:34:02 UTC |
| **Aggiornato** | 2026-04-30 00:47:10 UTC |

### Richiesta

# Fix email verifica registrazione

## What & Why
Durante la registrazione l'email di conferma non arriva all'utente. Le credenziali in DB risultano configurate (`email_verification_enabled=true`, `gmail_user=bikerlinkapp@gmail.com`, `gmail_app_password` valorizzato; le env var `GMAIL_USER`/`GMAIL_APP_PASSWORD` non sono settate, ma il codice fa fallback corretto sul DB), eppure l'utente resta bloccato sulla schermata "verifica email". In admin non c'è nessun segnale visibile dell'errore: l'invio fallisce in silenzio nei log del server.

Sospetti principali (in ordine di probabilità, da verificare nei passi 1-3):

1. **Regressione del rate limiter introdotto dal commit `3bc790ca` (Task #1121, 28 apr)** che ha aggiunto su `/api/auth/resend-verification` un limite di 5 chiamate/ora per IP e un lockout per-utente dopo 5 tentativi falliti che cancella tutti i token attivi. Quando questi limiti scattano, l'endpoint risponde con il messaggio generico "Se l'email è registrata… riceverai un nuovo codice" **senza** mai chiamare `sendVerificationEmail` — esattamente lo scenario "non arriva niente" osservato.

2. **Gmail App Password revocata o scaduta** sull'account `bikerlinkapp@gmail.com`. Google invalida automaticamente le App Password quando rileva attività sospette o quando viene cambiata la password principale dell'account. In questo caso `nodemailer` riceve un errore `EAUTH 535-5.7.8 Username and Password not accepted` che viene loggato ma non risalito né all'utente né all'admin.

3. **Regressione lato DB**: il commit `e53ba9f4` (27 apr "Adjust database schema") ha modificato `drizzle.config.ts` e `shared/schema.ts` (aggiunti 2 campi a `moto_club_invites`). Apparentemente non tocca le tabelle email, ma va verificato che `getAppSetting('gmail_user' | 'gmail_app_password')` continui a leggere correttamente i valori e che `createEmailVerificationToken` / `getEmailVerificationToken` non abbiano subito drift di colonne dopo eventuali `db:push --force`.

In più, indipendentem

_(troncato)_

### Risultato

## Relevant files
- `server/email.ts`
- `server/routes/auth.ts:230-289,572-669`
- `server/routes/admin.ts`

---
## #57 — Mass seed 5000 utenti + distribuzione geografica uniforme

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-17 20:37:22 UTC |
| **Aggiornato** | 2026-04-08 20:40:57 UTC |

### Richiesta

# Mass seed 5000 utenti + distribuzione geografica

## What & Why
Il mass seed attuale genera ~2.420 utenti e li concentra su 49 punti fissi (una città per zona) con un offset di soli ±0.4° (~40-50km). Il risultato è che sulla mappa gli utenti appaiono ammassati in pochi cluster. Serve alzare il numero a 5.000 mantenendo le stesse proporzioni e distribuirli in modo equo su tutto il territorio europeo.

## Done looks like
- Il mass seed genera **5.000 utenti** (stesse proporzioni attuali: ~62% biker M, ~8% biker F, ~21% zavorrina F, ~2% zavorrina M, ~4% coppia M+F, ~2% coppia M+M, ~0.8% coppia F+F)
- Gli utenti appaiono **sparsi in modo uniforme** sulla mappa europea, non concentrati in poche città
- Ogni paese con più regioni ha utenti distribuiti su tutto il proprio territorio, non solo attorno alla capitale o città principale
- La funzionalità additiva del task #57 resta valida: il seed NON cancella utenti fake esistenti, i nuovi hanno `lastLoginAt = now`, `isAvailable = true`, `country` corretto
- Progress bar durante la generazione (come ora)

## Out of scope
- Eliminazione o modifica di fake users esistenti
- Cambiare le proporzioni tra categorie (biker/zavorrina/coppia)
- Cambiare nomi, cognomi, bio, o moto disponibili

## Tasks
1. **Espandere le zone europee** — In `mass-seed-data.ts`, ampliare `EUROPEAN_ZONES` da 49 a ~120-150 zone aggiungendo più città/regioni per ogni paese (es. Italia: tutte le 20 regioni; Germania: 10+ Länder; Francia: 10+ regioni; Spagna: 8+ comunità). Paesi piccoli con una sola zona (Portogallo, Grecia, ecc.) ne ricevono 2-3 (es. Lisbona + Porto, Atene + Salonicco).

2. **Aumentare il raggio di dispersione** — Portare `randOffset()` da `±0.4°` a un valore più ampio (es. `±1.0°` o `±1.5°`, circa 80-120km) per distribuire meglio gli utenti attorno a ciascun centro zona. Valutare un offset variabile in base alla dimensione della zona (più grande per zone rurali, più piccolo per zone urbane come città-stato).

3. **Scalare i numeri a 5.000

_(troncato)_

### Risultato

## Relevant files
- `server/mass-seed-data.ts`
- `server/mass-seed.ts:108-146`
- `server/mass-seed-data.ts:9-77,312-314,349-353`

---
## #58 — Asset Play Store (icona 512×512 + feature graphic)

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-17 21:36:08 UTC |
| **Aggiornato** | 2026-04-08 20:40:57 UTC |

### Richiesta

# Logo e Asset Play Store

  ## What & Why
  Generare gli asset grafici per la pubblicazione su Google Play Store: icona alta risoluzione (512×512) e feature graphic (1024×500). L'icona attuale (1024×1024) è ottima per l'app ma il Play Store richiede un upload separato a 512×512 nella Play Console, mentre la feature graphic è il banner mostrato in cima alla scheda dell'app.

  ## Done looks like
  - File `assets/images/playstore-icon.png` (512×512 PNG) con lo stesso stile dell'icona dell'app, pronto per l'upload nella Play Console come "Icona ad alta risoluzione"
  - File `assets/images/playstore-feature-graphic.png` (1024×500 PNG) con design coerente: sfondo scuro, logo BikerLink, claim in italiano e inglese
  - Entrambi i file rispettano le linee guida Play Store (dimensioni esatte, nessun bordo trasparente forzato)

  ## Out of scope
  - Screenshot per il Play Store listing
  - Video promozionale
  - Modifiche ad app.json o al bundle dell'app (questi asset vanno caricati manualmente nella Play Console)

  ## Tasks
  1. **Genera icona 512×512** — Usa la generazione di immagini AI per creare `playstore-icon.png`: sfondo arancione BikerLink (#FF9800), casco moto bianco stilizzato al centro, nessun testo. Dimensioni esatte 512×512 PNG.

  2. **Genera feature graphic 1024×500** — Crea `playstore-feature-graphic.png`: sfondo scuro (#1A1A2E o simile), logo/casco BikerLink centrato, testo "BikerLink" in bold arancione, sottotitolo "La community dei motociclisti" in italiano e inglese.

  3. **Verifica dimensioni e salva** — Assicurarsi che entrambi i file abbiano esattamente le dimensioni richieste e siano PNG validi.

  ## Relevant files
  - `assets/images/icon.png`
  - `assets/images/android-icon-foreground.png`
  - `assets/images/android-icon-background.png`
  - `assets/images/helmet-logo.png`
  - `app.json`

### Risultato

## Relevant files
- `assets/images/icon.png`
- `assets/images/android-icon-foreground.png`
- `assets/images/android-icon-background.png`

---
## #59 — Fix matching: brand+modello ignorato

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-17 21:38:29 UTC |
| **Aggiornato** | 2026-04-08 20:40:57 UTC |

### Richiesta

# Fix logica matching brand+modello

  ## What & Why
  Il motore di matching confronta le wishlist moto delle zavorrine con le moto dei biker usando tre blocchi `if` indipendenti: tipo, solo-brand, e brand+modello. Poiché i blocchi sono separati (non if/else if), il controllo "solo brand" viene soddisfatto per primo e imposta `compatible = true` anche quando la wish specifica anche il modello. Risultato: una zavorrina che vuole una "Ducati Monster" si accoppia con qualsiasi Ducati, ignorando il modello.

  ## Done looks like
  - Una wish con brand + model fa match solo con moto che hanno la stessa marca E modello compatibile
  - Una wish con solo brand (senza model) fa match con qualsiasi moto di quella marca
  - Una wish con solo motorcycleType (senza brand/model) fa match per tipo
  - I match esistenti non vengono cancellati (la correzione si applica ai nuovi cicli di matching)

  ## Out of scope
  - Modifiche al ciclo di pulizia dei match esistenti
  - Variazioni dello score/peso dei match
  - Modifiche al matching biker-biker

  ## Tasks
  1. **Fix if/else if in runWishlistMatching** — In `matching-engine.ts`, ristrutturare i tre blocchi `if` indipendenti (righe ~140-160) in un unico `if/else if/else if` con priorità: brand+model > solo-brand > solo-tipo. Aggiungere anche il check "wish ha brand ma non model" come caso intermedio separato.

  2. **Allineare la stessa logica in storage.ts** — Le funzioni `findMatchingWishlistMotos` e `findMatchingBikerMotos` in `storage.ts` già gestiscono correttamente la priorità brand+model rispetto al tipo. Verificare che siano coerenti con la nuova logica del motore.

  ## Relevant files
  - `server/matching-engine.ts:128-184`
  - `server/storage.ts:1138-1183`

### Risultato

## Relevant files
- `server/matching-engine.ts:128-184`
- `server/storage.ts:1138-1183`

---
## #60 — Fix: tap su utente in match accettati apre profilo

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-17 21:40:40 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix: tap su utente in match accettati

  ## What & Why
  Nella tab Match, le card dei match accettati (sia proposal-match che garage-match) mostrano il nickname dell'altra persona come testo statico non toccabile. L'utente si aspetta di poter toccare il nome/icona per vedere il profilo completo. I componenti `MatchCardFull` e `GarageMatchCard` usano un `View` normale invece di un `TouchableOpacity`.

  Gli ID degli utenti sono già presenti nel payload delle API (`userId1`/`userId2` per i proposal match, `bikerId`/`zavarrinaId` per i garage match). La route del profilo `/profile/[id]` esiste già e funziona (è usata in tutta l'app).

  ## Done looks like
  - Toccare il nome/icona utente in una card match accettato apre il profilo di quell'utente
  - Funziona sia per i match proposta (MatchCardFull) che per i garage match (GarageMatchCard)
  - Nessuna navigazione su match rifiutati/scaduti (opzionale, ma preferibile toccabile comunque)

  ## Out of scope
  - Modifiche alla schermata del profilo stesso
  - Modifiche all'API o al backend

  ## Tasks
  1. **GarageMatchCard toccabile** — In `GarageMatchCard`, aggiungere `useRouter()`, calcolare `otherUserId = isBiker ? match.zavarrinaId : match.bikerId` e wrappare la riga utente (div con icon + nickname) in un `TouchableOpacity` che naviga a `/profile/${otherUserId}`.

  2. **MatchCardFull toccabile** — In `MatchCardFull`, aggiungere `useRouter()`, calcolare `otherUserId = isUser1 ? match.userId2 : match.userId1` e wrappare la riga utente in un `TouchableOpacity` che naviga a `/profile/${otherUserId}`.

  ## Relevant files
  - `app/(tabs)/match.tsx:41-140`
  - `app/(tabs)/match.tsx:145-285`

### Risultato

## Relevant files
- `app/(tabs)/match.tsx:41-140`
- `app/(tabs)/match.tsx:145-285`

---
## #61 — Garage matching biker-biker

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-17 22:22:12 UTC |
| **Aggiornato** | 2026-04-08 20:40:57 UTC |

### Richiesta

# Garage matching biker-biker

  ## What & Why
  Attualmente il sistema di garage matching è limitato: le wishlist (moto che si vuole trovare) sono accessibili solo alle zavorrine. L'utente vuole che i biker possano anch'essi creare wishlist e ricevere match con altri biker che hanno quella moto, usando la stessa logica brand+modello > solo-brand > solo-tipo già corretta.

  Il motore di matching (`runWishlistMatching`) già processa TUTTE le wishlist contro TUTTE le moto biker senza filtrare per ruolo — basta sbloccare l'accesso e l'interfaccia.

  ## Done looks like
  - Un biker vede la sezione wishlist nel proprio garage, può aggiungere moto che cerca
  - Quando un biker aggiunge una wishlist moto, il motore la confronta con le moto degli altri biker
  - I match biker-biker appaiono nella schermata Match con icone/colori corretti per entrambi i profili
  - Il sistema notifica correttamente entrambi i biker quando avviene un match

  ## Out of scope
  - Cambiamenti allo schema DB (nessuna migrazione necessaria)
  - Cambiamenti al motore di matching (già funziona correttamente)
  - Separazione UI biker-biker vs biker-zavorrina nella schermata match

  ## Tasks
  1. **Sblocca wishlist API per i biker** — Rimuovi il controllo `userType !== "zavorrina"` in wishlist.ts che restituisce 403 ai biker. Aggiorna i messaggi di notifica istantanea (quando si aggiunge una wishlist moto) da "una zavorrina cerca" a messaggi generici validi per entrambi i tipi utente.

  2. **Mostra sezione wishlist ai biker nel garage** — In garage.tsx, rimuovi la condizione `user?.userType === "zavorrina"` che nasconde la sezione wishlist ai biker. La sezione deve essere visibile a tutti i tipi utente che hanno il garage (biker, zavorrina, coppia).

  3. **Aggiorna card match per biker-biker** — In match.tsx, sia in `GarageMatchCard` sia in `MatchCardFull`, usa `match.bikerType` e `match.zavarrinaType` (già presenti nella risposta API) invece di hardcodare il tipo come "biker" o "zavorrina". Que

_(troncato)_

### Risultato

## Relevant files
- `server/routes/wishlist.ts:25-165`
- `app/(tabs)/garage.tsx:342`
- `app/(tabs)/match.tsx:41-170`

---
## #62 — Nascondi match rifiutati dalla schermata

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-17 22:23:40 UTC |
| **Aggiornato** | 2026-04-08 20:40:57 UTC |

### Richiesta

# Nascondi match rifiutati dalla schermata

  ## What & Why
  Su iOS, i match rifiutati rimangono visibili nella schermata Match con aspetto sbiadito (dimmed) invece di sparire. Il problema ha due cause:

  1. **Dati non filtrati**: il tab "garage" mostra `garageMatchesTagged` che include TUTTI i garage match (nuovi, accettati, rifiutati). Dopo il rifiuto, il match cambia status a "rejected" ma rimane nella lista del tab garage, dove viene renderizzato sbiadito.
  2. **FlatList su iOS**: manca la prop `extraData` — su iOS il FlatList è più aggressivo nell'ottimizzare i re-render; senza `extraData`, anche quando `data` cambia riferimento, le celle esistenti potrebbero non aggiornarsi.

  Su web il problema è meno evidente perché il rendering DOM è diverso.

  ## Done looks like
  - Rifiutare un match lo fa sparire immediatamente dalla lista, senza card sbadita residua
  - Il tab "garage" mostra solo match con status "new" o "accepted"
  - Il tab "storia" mostra solo proposal match scaduti (expired), non i rifiutati
  - Il FlatList ha `extraData={currentList}` per garantire il re-render su iOS

  ## Out of scope
  - Eliminazione dal DB al momento del rifiuto (solo filtro lato UI)
  - Modifica al flusso di rifiuto (bottone, API, ecc.)

  ## Tasks
  1. **Filtra i rejected dal tab garage** — In `match.tsx`, cambia la `currentList` per il tab "garage" da `garageMatchesTagged` a una versione filtrata che esclude i match con status "rejected". Aggiorna anche il contatore badge del tab garage di conseguenza.

  2. **Rimuovi rejected dalla storia** — Rimuovi `rejectedGarageMatches` da `historyMatches` (riga 334) e rimuovi "rejected" da `historyProposalMatches` (riga 325, lascia solo "expired"). I match rifiutati non devono essere visibili da nessuna parte.

  3. **Aggiungi extraData al FlatList** — Aggiungi la prop `extraData={currentList}` al componente FlatList per garantire che su iOS il re-render avvenga correttamente quando la lista cambia dopo un'azione dell'utente.

  

_(troncato)_

### Risultato

## Relevant files
- `app/(tabs)/match.tsx:321-353`
- `app/(tabs)/match.tsx:485-489`
- `app/(tabs)/match.tsx:538-546`

---
## #63 — Fix motore matching - cleanup DB e stabilizzazione

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-17 22:31:47 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix motore matching - cleanup DB e stabilizzazione

## What & Why
Il vecchio bug del matching (if separati invece di if/else if, già fixato in #59) ha generato 2.267.423 match errati nel DB, occupando 710 MB. La logica difettosa matchava tutte le moto della stessa marca ignorando il modello, producendo combinazioni sbagliate (es. wishlist "Ducati Multistrada V2" → match con "Ducati Monster 821").

Ora che il motore è corretto (brand+model > solo-brand > solo-tipo), i dati storici vanno ripuliti e la tabella va irrobustita per prevenire future esplosioni.

## Done looks like
- La tabella `biker_zavorrina_matches` torna a dimensioni ragionevoli (< 5 MB)
- Il tab "garage" mostra solo match reali e corretti (stessa marca E modello)
- L'app non si blocca o rallenta a causa di migliaia di match per utente
- Un UNIQUE constraint a DB impedisce future duplicazioni
- L'API ritorna max 200 garage match per utente invece di tutti
- Il motore non crea mai più di 500 nuovi match per ciclo

## Out of scope
- Cambiamenti alla logica di matching (già corretta in #59)
- Modifica alla UI dei match card (coperta da #64)

## Tasks
1. **Cleanup DB**: Eliminare tutti i match con status "new" (2.267.373 record errati). I match "accepted" (2) e "rejected" (48) vengono preservati. Usare SQL diretto via `db.delete(bikerZavarrinaMatches).where(eq(bikerZavarrinaMatches.status, "new"))` in un task dedicato (o uno script one-shot) per evitare timeout su DELETE di 2M+ righe — considerare batch da 50.000 righe.

2. **UNIQUE constraint**: Aggiungere un vincolo UNIQUE sulla combinazione `(biker_id, zavorrina_id, biker_motorcycle_id, wishlist_moto_id)` nella tabella `biker_zavorrina_matches`. Aggiornare lo schema Drizzle in `shared/schema.ts` con `uniqueIndex(...)` e applicarlo al DB con `npm run db:push`. Il vincolo impedisce future duplicazioni a livello di DB.

3. **Cap per-run nel motore**: In `server/matching-engine.ts`, aggiungere un limite di 500 nuovi match per ciclo di `runWishlistMatching

_(troncato)_

### Risultato

- La tabella `biker_zavorrina_matches` torna a dimensioni ragionevoli (< 5 MB)
- Il tab "garage" mostra solo match reali e corretti (stessa marca E modello)
- L'app non si blocca o rallenta a causa di migliaia di match per utente
- Un UNIQUE constraint a DB impedisce future duplicazioni

---
## #64 — Match screen: rimuovi accettati, tab cronologia, reset rifiutati

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-17 22:35:11 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Match screen: rimuovi accettati, elimina cronologia, reset rifiutati

  ## What & Why
  Tre miglioramenti UX richiesti dall'utente per la schermata Match:

  1. **Rimuovi match accettati**: una volta chiusa una storia con un match accettato, l'utente deve poter cancellarlo per fare spazio ad altri. Aggiungere un bottone "elimina" su ogni card del tab "accettati".
  2. **Elimina tab cronologia**: il tab "storia/cronologia" non serve, va rimosso. I match rifiutati non devono essere visibili da nessuna parte (già previsto in #62).
  3. **Reset rifiutati**: il sistema memorizza i rifiuti e non riprova mai. L'utente vuole un bottone nella schermata match (in alto) per resettare tutti i match rifiutati, così il motore può rieseguire i match con quel biker/zavorrina.

  ## Done looks like
  - Il tab "storia/cronologia" non esiste più nella schermata Match (3 tab: in attesa, accettati, garage)
  - Su ogni card del tab "accettati" (sia proposal che garage) appare un'icona cestino in alto a destra che, dopo conferma, rimuove il match
  - In alto nella schermata Match (o nel tab "in attesa") appare un piccolo bottone "Reset rifiutati" che, dopo conferma, cancella tutti i match rifiutati dell'utente. Il bottone è visibile solo se ci sono effettivamente rifiuti
  - Dopo il reset, il motore di matching può rieseguire i match con quegli utenti al prossimo ciclo (perché non esiste più il record di rifiuto)

  ## Out of scope
  - Modifica alla logica di matching nel motore
  - Blocklist permanente (un match rifiutato può essere rifatto dopo il reset)
  - Notifiche al partner quando si rimuove un match accettato

  ## Tasks
  1. **Backend: endpoint DELETE match** — Aggiungere in `server/routes/proposals.ts`:
     - `DELETE /api/proposals/matches/:id` — elimina un proposal match se appartiene all'utente
     - `DELETE /api/proposals/garage-matches/:id` — elimina un garage match se appartiene all'utente
     - `DELETE /api/proposals/matches/rejected` — elimina tutti i proposal match 

_(troncato)_

### Risultato

## Relevant files
- `app/(tabs)/match.tsx:150` (TabKey)
- `app/(tabs)/match.tsx:41-148` (GarageMatchCard)
- `app/(tabs)/match.tsx:152-299` (MatchCardFull)

---
## #65 — Watchdog: monitoraggio e riavvio automatico

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-17 22:57:23 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Watchdog: monitoraggio e riavvio automatico

## What & Why
Creare uno script watchdog persistente che monitora backend (porta 5000) e frontend (porta 8081), li riavvia automaticamente se crashano, e controlla periodicamente la salute del server inviando un alert nel log se qualcosa non risponde.

## Done looks like
- Lo script `scripts/watchdog.sh` avvia e resta in esecuzione in background
- Se il backend (porta 5000) smette di rispondere, viene riavviato automaticamente entro pochi secondi
- Se il frontend (porta 8081) smette di rispondere, viene riavviato automaticamente
- Ogni 60 secondi viene fatto un controllo su `/api/health`; se fallisce, viene loggato un alert con timestamp in `logs/watchdog.log`
- Il log riporta ogni evento: crash rilevato, riavvio avviato, health check OK/FAIL
- Il workflow `Watchdog` è configurato per eseguire lo script

## Out of scope
- Notifiche push o email all'utente finale
- Monitoraggio di processi diversi da backend e frontend
- Dashboard UI per il watchdog

## Tasks
1. **Endpoint `/api/health`** — Verificare che esista e risponda con `{ status: "ok" }`. Se non esiste, aggiungerlo al server Express.
2. **Script `scripts/watchdog.sh`** — Script bash che in loop: controlla se le porte 5000 e 8081 sono attive (con `curl` o `nc`), riavvia il processo corrispondente se non risponde, esegue health check su `/api/health` ogni 60 secondi, logga tutto in `logs/watchdog.log` con timestamp.
3. **Workflow Watchdog** — Aggiungere un workflow Replit che esegue `scripts/watchdog.sh` come processo persistente.

## Relevant files
- `scripts/start-backend.sh`
- `scripts/start-expo.sh`
- `scripts/riavvia-tutto.sh`
- `server/index.ts`
- `server/routes.ts`

### Risultato

- Lo script `scripts/watchdog.sh` avvia e resta in esecuzione in background
- Se il backend (porta 5000) smette di rispondere, viene riavviato automaticamente entro pochi secondi
- Se il frontend (porta 8081) smette di rispondere, viene riavviato automaticamente
- Ogni 60 secondi viene fatto un controllo su `/api/health`; se fallisce, viene loggato un alert con timestamp in `logs/watchdog.log`

---
## #66 — Schermata Debug DB (solo Admin)

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-17 23:00:03 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Schermata Debug DB per Admin

## What & Why
Aggiungere una schermata di debug visibile solo agli admin che mostra in tempo reale lo stato del database: conteggio record per ogni tabella e ultimi inserimenti. Serve per monitorare la crescita del DB e individuare anomalie senza accedere direttamente al database.

## Done looks like
- Nel pannello admin compare una nuova voce "DB Debug" nella sezione Monitoraggio
- La schermata mostra ogni tabella principale del DB con il numero di record aggiornato automaticamente ogni 10 secondi
- Per ciascuna tabella si vedono anche gli ultimi 5 record (ID, data creazione, e un campo identificativo come email/nickname/nome)
- Un pulsante "Aggiorna ora" permette il refresh manuale
- L'endpoint è protetto da `requireAdmin` — nessun utente normale può accedervi

## Out of scope
- Modifica o cancellazione di record da questa schermata
- Export CSV/JSON dei dati
- Query personalizzate

## Tasks
1. **Endpoint backend `/api/admin/db-stats`** — Aggiungere un endpoint (già protetto da `requireAdmin`) che restituisce: conteggio record per ogni tabella principale (users, userProfiles, conversations, messages, motoClubs, motoClubMembers, motoClubRequests, workshops, reports, inviteCodes, ecc.) e gli ultimi 5 record per ogni tabella con i campi più significativi.

2. **Schermata `app/admin/db-debug.tsx`** — Creare la schermata admin che chiama l'endpoint ogni 10 secondi (con React Query e `refetchInterval`), mostra le tabelle come card con il conteggio in evidenza e una lista collassabile degli ultimi record. Aggiungere un pulsante di refresh manuale.

3. **Link nel pannello admin** — Aggiungere la voce "DB Debug" (icona database) nella sezione "Monitoraggio" di `app/admin/index.tsx`.

## Relevant files
- `server/routes/admin.ts`
- `app/admin/index.tsx`
- `app/admin/analytics.tsx`
- `app/admin/performance.tsx`
- `shared/schema.ts`

### Risultato

- Nel pannello admin compare una nuova voce "DB Debug" nella sezione Monitoraggio
- La schermata mostra ogni tabella principale del DB con il numero di record aggiornato automaticamente ogni 10 secondi
- Per ciascuna tabella si vedono anche gli ultimi 5 record (ID, data creazione, e un campo identificativo come email/nickname/nome)
- Un pulsante "Aggiorna ora" permette il refresh manuale

---
## #67 — Cestino match garage: reset a 'new' invece di delete fisico

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-17 23:26:15 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Cestino match garage: reset a "new"

## What & Why
Quando l'utente tocca il cestino su un match accettato nel tab Garage,
il record viene eliminato fisicamente dal DB. Il motore di matching
(cap 500/ciclo, ~42.000 combinazioni) impiega potenzialmente ore prima
di ricreare quella coppia. Il fix: invece di DELETE fisico, resettare
lo status a "new" così il match riappare subito nel tab "In attesa".

## Done looks like
- Cestino su un match accettato → il match sparisce dal tab "Accettati"
- Il match riappare immediatamente nel tab "In attesa" (status="new")
- Il testo dell'Alert di conferma è aggiornato in tutte e 5 le lingue
  per spiegare che il match "tornerà in attesa" (non viene eliminato)
- Backend riavviato senza errori TypeScript

## Out of scope
- Modifica al comportamento del "Reset rifiutati" (rimane delete fisico)
- Modifica al cap 500 del motore di matching

## Tasks
1. **Backend storage** — Aggiungere metodo `resetGarageMatchToNew(id, userId)`
   che verifica ownership e fa UPDATE status="new" usando `updateGarageMatch`.

2. **Backend route** — Nell'endpoint `DELETE /garage-matches/:matchId`
   sostituire `deleteGarageMatch` con `resetGarageMatchToNew`.
   Response invariata `{ deleted: true }` per non toccare il frontend.

3. **i18n — 5 lingue** — Aggiornare la chiave `"match.removeMatchConfirm"`
   in it/en/de/es/fr per riflettere il nuovo comportamento (match torna
   in attesa, non viene eliminato definitivamente).

## Relevant files
- `server/storage.ts:1233-1244`
- `server/routes/proposals.ts:520-530`
- `lib/i18n/it.ts`
- `lib/i18n/en.ts`
- `lib/i18n/de.ts`
- `lib/i18n/es.ts`
- `lib/i18n/fr.ts`

### Risultato

- Cestino su un match accettato → il match sparisce dal tab "Accettati"
- Il match riappare immediatamente nel tab "In attesa" (status="new")
- Il testo dell'Alert di conferma è aggiornato in tutte e 5 le lingue
per spiegare che il match "tornerà in attesa" (non viene eliminato)

---
## #68 — Redesign Match Screen + Match Biker ↔ Biker

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 11:37:08 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Redesign Match Screen + Match Biker ↔ Biker

## What & Why

Ristrutturare completamente la schermata Match eliminando la logica "per status" (In attesa / Accettati / Garage) e passando a una logica "per tipo di match" più intuitiva. Aggiungere contestualmente la nuova tipologia **biker ↔ biker** basata su moto compatibili nel garage, che trova compagni di viaggio con veicolo simile.

## Done looks like

- La schermata Match ha **3 tab per tipo**: "Zavorrine", "Biker", "Proposte" (rimossi "Accettati" e "Garage")
- **Tab Zavorrine**: tutti i match biker↔zavorrina (nuovi + accettati insieme, con badge visivo), con card che mostra moto del biker e wish della zavorrina
- **Tab Biker**: match biker↔biker per stessa marca+modello nel garage; il sistema li genera automaticamente ogni 60s
- **Tab Proposte**: match delle proposte di viaggio (come ora, ma isolati nel loro tab)
- Il pulsante "Reset rifiutati" è visibile **sopra i tab**, non annidato dentro la tab row
- Sotto l'header "I Miei Match" e **sopra i tab** appare un testo descrittivo breve che spiega come funziona il sistema di match (testo adatto per tutte e 5 le lingue)
- Funziona in IT/EN/DE/ES/FR

## Out of scope

- Match biker-biker per tipo moto (solo brand+model esatto per ora)
- Notifiche push per nuovi match biker-biker
- Ricerca manuale biker-biker

## Tasks

1. **Schema DB biker_biker_matches** — Aggiungere tabella `biker_biker_matches` in `server/schema.ts` con colonne: id (varchar UUID, gen_random_uuid()), biker1_id, biker2_id, motorcycle_brand, motorcycle_model, status (new/accepted/rejected), created_at. Applicare con `npm run db:push`.

2. **Storage layer biker-biker** — Aggiungere a IStorage e DatabaseStorage: `getBikerBikerMatchesForUser(userId)`, `createBikerBikerMatch(data)`, `updateBikerBikerMatch(id, data)`, `resetBikerBikerMatchToNew(id, userId)`, `getAllExistingBikerBikerMatchKeys()`. Match simmetrico: usare `ON CONFLICT DO NOTHING` su constraint univoco `(min(biker1_id,biker2_id), max(biker1

_(troncato)_

### Risultato

- `server/schema.ts`
- `server/storage.ts:1272-1315`
- `server/matching-engine.ts:118-194`
- `server/routes/proposals.ts`

---
## #69 — Ads nei Match + Layout header inline

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 12:09:04 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Ads nei Match + Layout header

## What & Why
Riorganizzare il layout della schermata Match e aggiungere uno slot pubblicitario
dedicato tra il titolo e le tab zavorrine/biker/proposte.
L'obiettivo è liberare spazio sopra le tab inserendo il pulsante "reset rifiutati"
inline con il titolo "I miei match", e sfruttare il gap creato per mostrare campagne
pubblicitarie orientate (es. ristoranti, mete) tramite un nuovo posizionamento "nei match".

## Done looks like
- Il titolo "I miei match" e il pulsante "reset rifiutati" sono sulla stessa riga
- Tra quella riga e le tab (zavorrine / biker / proposte) compare uno slot pubblicitario
  con campagne "nei match", stile card o banner, simile all'home
- Le tab zavorrine/biker/proposte hanno un po' più di respiro (margine top leggermente aumentato)
- Il pannello admin campagne ha una nuova opzione di placement: "nei match"
  (accanto all'esistente "home page" / "tutti")
- Le campagne con placement "nei match" compaiono solo nella schermata Match;
  quelle senza placement (o "tutti") continuano ad apparire ovunque
- Il backend filtra le campagne per placement tramite il campo `placement` aggiunto allo schema

## Out of scope
- Cambiare il design delle card match
- Aggiungere altri placement oltre a "home" e "nei match"
- Statistiche di impression separate per placement

## Tasks
1. **Schema + migrazione** — Aggiungere la colonna `placement` (varchar, default `"all"`)
   alla tabella `ad_campaigns` in `shared/schema.ts` e applicare la migrazione DB.
   Valori previsti: `"all"` (ovunque), `"home"`, `"match"`.

2. **Backend: endpoint filtrato per placement** — Aggiungere l'endpoint
   `GET /api/ads/placement/:placement` in `server/routes/ads.ts` che restituisce le campagne
   attive con `placement = placement` oppure `placement = "all"`, simile a `my-ads`.

3. **Layout Match — header inline** — In `app/(tabs)/match.tsx`, spostare il pulsante
   "reset rifiutati" nella stessa riga del titolo "I miei match" (View row con
   spaceb

_(troncato)_

### Risultato

## Relevant files
- `app/(tabs)/match.tsx:837-885`
- `shared/schema.ts:486-505`
- `server/routes/ads.ts`

---
## #70 — Sistema Backup automatico su Google Drive

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 14:40:31 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

---
title: Sistema Backup automatico su Google Drive
---
# Sistema Backup — Replit Object Storage

## What & Why
Aggiunge un sistema di backup automatico e manuale per BikerLink: dump completo del database PostgreSQL (+ media) salvato su Replit Object Storage (già configurato e attivo nel progetto, zero credenziali extra). La destinazione Google Drive verrà aggiunta in una task separata futura.

## Done looks like
- Nel pannello admin, gruppo "Sistema": pulsante "Backup automatici" (naviga alla schermata) + pulsante verde "Backup ora" (trigger immediato) — già implementati in `app/admin/index.tsx`
- Schermata `/admin/backup` mostra: toggle schedulazione 24h on/off, data/ora/dimensione dell'ultimo backup DB e media, lista dei backup su Object Storage divisa in tab DB/Media, pulsante "Scarica" e "Ripristina" per ogni backup DB, pulsante "Scarica" per media
- "Backup ora" / "Backup DB ora": esegue `pg_dump | gzip`, salva su Object Storage come `backup/database/{anno}/{mese}/bikerlink_db_{timestamp}.sql.gz`
- "Backup Media ora": archivia i file su Object Storage nella cartella media, salva `backup/media/{anno}/{mese}/bikerlink_media_{timestamp}.zip`
- "Ripristina": richiede password admin, scarica il dump da Object Storage, ripristina il DB con `psql`
- "Scarica": restituisce il file tramite download diretto dall'endpoint backend
- **Pulizia automatica**: ad ogni ciclo di backup i file più vecchi di 3 mesi vengono eliminati da Object Storage; la lista mostra solo i backup ancora presenti
- Schedulazione ogni 24h configurabile dall'admin (toggle on/off, persistenza in `app_settings`)
- Zero credenziali aggiuntive necessarie (usa `DEFAULT_OBJECT_STORAGE_BUCKET_ID` già configurato)

## Out of scope
- Backup su Google Drive (task futura separata)
- Backup incrementale (solo completi)
- Notifiche push/email al completamento
- Configurazione della retention (fissa a 3 mesi)

## Note architetturali
- Usare `@replit/object-storage` (npm) come client Object Storage — installarlo

_(troncato)_

### Risultato

## Relevant files
- `server/backup-service.ts` (già creato, da riscrivere)
- `server/google-drive.ts` (già creato, da eliminare)
- `server/routes/admin.ts:1899-1990` (route backup già aggiunte)

---
## #71 — Rimuovi tasto 'Backup ora' ridondante dall'admin

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 15:19:08 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

Rimuovi il tasto "Backup ora" ridondante dalla schermata admin principale.

## What & Why
Il tasto verde "Backup ora" (action="backup-now") nella lista della sezione "Sistema" di `app/admin/index.tsx` è ridondante: la stessa funzione è già accessibile entrando in "Backup automatici". Va eliminato per semplificare l'interfaccia.

## Done looks like
- La voce `{ key: "backup-now", label: "Backup ora", ..., action: "backup-now" }` è rimossa dall'array delle sezioni admin
- Il tipo `action?: "backup-now"` nella definizione del tipo locale è rimosso
- La mutation `backingUp` e tutta la logica `if (item.action === "backup-now")` è rimossa se non usata altrove
- Il tasto non compare più nell'interfaccia admin

## Relevant files
- `app/admin/index.tsx` (righe ~17, ~76, ~135, ~162)

### Risultato

- La voce `{ key: "backup-now", label: "Backup ora", ..., action: "backup-now" }` è rimossa dall'array delle sezioni admin
- Il tipo `action?: "backup-now"` nella definizione del tipo locale è rimosso
- La mutation `backingUp` e tutta la logica `if (item.action === "backup-now")` è rimossa se non usata altrove
- Il tasto non compare più nell'interfaccia admin

---
## #72 — Messaggio home admin (BikerLink/casco tap)

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 15:57:15 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Messaggio home cliccando BikerLink/casco

## What & Why
Aggiungere un sistema di annuncio controllato dall'admin: un toggle attivo/disattivo
e un testo libero nella schermata impostazioni. Quando l'utente clicca "BikerLink"
o il casco nella home, si apre un modal con il messaggio (solo se abilitato).

## Done looks like
- Nella schermata admin Impostazioni appare una nuova card "Messaggio Home" con:
  - Switch on/off per abilitare/disabilitare
  - TextInput multiriga per il testo libero, con pulsante Salva
- Sulla home, il titolo "BikerLink" e il casco diventano cliccabili
- Se il messaggio è abilitato, cliccandoli appare un modal con il testo dell'admin
- Se il messaggio è disabilitato, il tap non fa nulla (o mostra niente)
- Le modifiche dell'admin sono visibili agli utenti immediatamente

## Out of scope
- Internazionalizzazione del testo (testo singolo, l'admin scrive nella lingua che vuole)
- Titolo personalizzabile del modal (si usa "BikerLink")
- Push notification al cambio messaggio

## Tasks
1. **Backend** — Aggiungere endpoint `GET /api/settings/home-message` che restituisce
   `{ enabled: boolean, text: string }` leggendo le chiavi `home_message_enabled` e
   `home_message_text` dalla tabella `app_settings`. Riutilizzare il `PUT /api/admin/settings/:key`
   già esistente per gli aggiornamenti (nessun nuovo endpoint di scrittura necessario).

2. **Admin UI** — Aggiungere una card "Messaggio Home" in `app/admin/settings.tsx` con:
   Switch (toggle) per `home_message_enabled` e TextInput multiriga + pulsante Salva per
   `home_message_text`. Seguire il pattern delle altre impostazioni toggle già presenti.

3. **Home UI** — In `app/(tabs)/index.tsx` rendere il blocco titleRow (BikerLink + helmet)
   un `TouchableOpacity`. Aggiungere query a `/api/settings/home-message`. Aggiungere
   un Modal (stile quello già usato nell'app) che si apre al tap se `enabled === true`.

## Relevant files
- `server/routes/admin.ts`
- `server/routes.ts`
- `shared/schema.ts`
- `

_(troncato)_

### Risultato

- Nella schermata admin Impostazioni appare una nuova card "Messaggio Home" con:
- Switch on/off per abilitare/disabilitare
- TextInput multiriga per il testo libero, con pulsante Salva
- Sulla home, il titolo "BikerLink" e il casco diventano cliccabili

---
## #73 — Codici invito — email con immagine gadget sovraimpressa

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 16:51:40 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Redesign codici invito — email con immagine gadget

## What & Why
Ridisegnare il sistema codici invito: l'admin carica un'immagine per ogni codice; quando
un utente si registra inserendo un codice valido, gli viene inviata automaticamente un'email
contenente l'immagine con data/ora sovraimpresse e il messaggio "Riscatta il tuo gadget
entro 5gg".

## Done looks like
- Admin screen codici invito (`app/admin/invite-codes.tsx`):
  - Nella modal di creazione/modifica codice appare un pulsante per caricare un'immagine
  - Dopo il salvataggio, la card del codice mostra un thumbnail dell'immagine
- Dopo registrazione con codice valido, l'utente riceve un'email con:
  - L'immagine caricata dall'admin, con data e ora sovraimpressi (banda scura in basso con testo bianco)
  - Intestazione "BikerLink" in stile branding (dark + arancione come le altre email)
  - Messaggio in italiano: "Hai usato il codice [CODE]. Riscatta il tuo gadget entro 5 giorni!"
- Se il codice non ha immagine caricata, l'email viene comunque inviata ma senza immagine
- Se SMTP non è configurato, la registrazione va a buon fine silenziosamente (no crash)

## Technical plan

### 1. Installazione dipendenza
- Installare `sharp` per compositing immagine (overlay SVG testo su JPEG/PNG)

### 2. Schema DB (`shared/schema.ts`)
- Aggiungere campo `imageUrl: text("image_url")` a `invitationCodes`
- Applicare migrazione con `db.execute(sql\`ALTER TABLE invitation_codes ADD COLUMN IF NOT EXISTS image_url TEXT\`)`
  in un endpoint di inizializzazione o direttamente all'avvio server

### 3. Backend — endpoint upload immagine
- `POST /api/admin/invitation-codes/:id/image`
  - multer upload (campo `image`, solo JPEG/PNG, max 5MB)
  - Salva file in `uploads/invitation-codes/` oppure su Object Storage se disponibile
  - Aggiorna `image_url` nel record del codice via `storage.updateInvitationCode(id, { imageUrl })`
  - Richiede admin auth
- Aggiornare `storage.updateInvitationCode` (o analogo) per accettare `imageUrl`

###

_(troncato)_

### Risultato

## Note importanti
- `db:push` è interattivo: usare `db.execute(sql\`ALTER TABLE...\`)` per la migrazione
- SMTP potrebbe non essere configurato: wrappare la chiamata email in try/catch silenzioso
- Object Storage (expo_object_storage) è disponibile ma usare prima `uploads/` locale come

---
## #74 — Rimuovi pannello Chat Utenti dall'admin

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 18:34:51 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Rimuovi pannello Chat Utenti dall'admin

## What & Why
Il pannello "Chat Utenti" nel pannello admin mostra solo messaggi grezzi senza contesto utile e occupa memoria inutilmente. Va rimosso completamente.

## Done looks like
- La voce "Chat Utenti" non appare più nel menu del pannello admin
- Le route `/admin/chats` e `/admin/chat-messages/[id]` non esistono più
- Gli endpoint backend `/api/admin/chats` e `/api/admin/chats/:id/messages` sono rimossi
- Nessun link o riferimento rimasto nel codice

## Out of scope
- Rimozione delle tabelle `conversations`/`messages` dal database (sono usate altrove nell'app)
- Qualsiasi modifica alle chat nei club o alle chat private tra utenti

## Tasks
1. **Rimuovi i file frontend** — Elimina `app/admin/chats.tsx` e `app/admin/chat-messages/[id].tsx`, poi rimuovi la voce `{ key: "chats", ... }` dal menu in `app/admin/index.tsx`.
2. **Rimuovi gli endpoint backend** — Elimina i due endpoint `GET /api/admin/chats` e `GET /api/admin/chats/:id/messages` da `server/routes/admin.ts`.

## Relevant files
- `app/admin/index.tsx`
- `app/admin/chats.tsx`
- `app/admin/chat-messages/[id].tsx`
- `server/routes/admin.ts:1395-1470`

### Risultato

- La voce "Chat Utenti" non appare più nel menu del pannello admin
- Le route `/admin/chats` e `/admin/chat-messages/[id]` non esistono più
- Gli endpoint backend `/api/admin/chats` e `/api/admin/chats/:id/messages` sono rimossi
- Nessun link o riferimento rimasto nel codice

---
## #75 — Avviso permanente pannello Advertisement

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 18:35:33 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Avviso permanente pannello Advertisement

## What & Why
Aggiungere una dicitura di avvertimento visibile in cima alla schermata Advertisement del pannello admin, per ricordare all'admin di arrestare il sistema di Advertisement prima di caricare una nuova campagna.

## Done looks like
- In cima alla pagina Advertisement dell'admin (sopra le tab Biker/Zavorrine/Coppie) compare sempre un banner giallo/arancio di avvertimento con il testo: "Attenzione, prima di caricare una nuova campagna, il sistema di Advertisement va arrestato, e dopo fatto ripartire"
- Il banner è sempre visibile, indipendentemente dallo stato del sistema

## Out of scope
- Nessuna logica funzionale aggiuntiva (il banner è solo informativo)
- Modifiche ad altre schermate admin

## Tasks
1. Aggiungere un banner fisso di avvertimento in cima alla schermata ads.tsx, subito dopo l'apertura del container principale e prima delle tab, con il testo indicato. Usare uno stile evidenziato (sfondo giallo/ambra, icona warning, testo scuro in grassetto).

## Relevant files
- `app/admin/ads.tsx:288-320`

### Risultato

- In cima alla pagina Advertisement dell'admin (sopra le tab Biker/Zavorrine/Coppie) compare sempre un banner giallo/arancio di avvertimento con il testo: "Attenzione, prima di caricare una nuova campagna, il sistema di Advertisement va arrestato, e dopo fatto ripartire"
- Il banner è sempre visibile, indipendentemente dallo stato del sistema

---
## #76 — Sezione Documentazione nel profilo

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 18:36:01 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Sezione "Documentazione" nel Profilo

## What & Why
La sezione del profilo contiene un link alla Privacy Policy e il download del Manuale Utente, mescolati con le voci di menu ordinarie. L'utente vuole un'area dedicata "Documentazione" che raccolga tutti i documenti scaricabili (Manuale, EULA, Privacy Policy, esportazione dati utente) separata dal menu principale.

## Done looks like
- Nel profilo appare una nuova sezione con titolo "Documentazione" (separata da "Menu")
- La sezione contiene 4 voci: Manuale Utente, EULA, Privacy Policy, Dati Utente
- Ogni voce permette il download del relativo PDF nello stesso modo del manuale attuale (web: apre nel browser; mobile: scarica e condivide tramite Sharing)
- "Dati Utente" genera ed esporta un file JSON/PDF con i dati personali dell'utente autenticato (GDPR)
- Il pannello admin include l'upload dell'EULA e della Privacy Policy PDF (come già esiste per il manuale)
- Le voci Privacy Policy e Manuale Utente vengono rimosse dalla sezione "Menu"
- Le stringhe i18n sono aggiunte per tutte le lingue supportate (it, en, de, es, fr)

## Out of scope
- Modifica del contenuto dei documenti PDF
- Generazione automatica di EULA o Privacy Policy da testo

## Tasks
1. **Backend — endpoint EULA e Privacy Policy download** — Aggiungere `/api/eula/download` e `/api/privacy-policy/download` che servono i rispettivi PDF caricati dall'admin (stessa logica di `/api/manual/download`). Aggiungere `/api/user/export-data` (autenticato) che restituisce i dati personali dell'utente come file JSON scaricabile. Aggiungere endpoint admin per upload EULA PDF e Privacy Policy PDF.

2. **Frontend — sezione Documentazione nel profilo** — In `profile.tsx`, creare una nuova `<View style={styles.section}>` con titolo "Documentazione" contenente 4 MenuItem: Manuale Utente (esistente), EULA, Privacy Policy, Dati Utente. Rimuovere le voci Privacy Policy e Manuale Utente dalla sezione "Menu". Implementare i relativi handler di download con la stessa logica di 

_(troncato)_

### Risultato

## Relevant files
- `app/(tabs)/profile.tsx:240-268,610-635`
- `server/routes.ts:282-350`
- `lib/i18n/it.ts`

---
## #77 — Elimina Chat + Blocco Utente

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 18:36:15 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Elimina Chat + Blocco Utente

## What & Why
Aggiungere un tasto esplicito per eliminare le conversazioni e introdurre il blocco peer-to-peer tra utenti. Il blocco è irreversibile e bidirezionale: se A blocca B, né A vedrà B né B vedrà A (in chat, profili, match, ecc.).

## Done looks like
- In ogni conversazione aperta (e nella lista chat) è visibile un tasto cestino/elimina per cancellare la chat con una conferma
- Nel profilo di un utente c'è un tasto "Blocca utente" che mostra un avviso chiaro sull'irreversibilità prima di confermare
- Dopo il blocco, l'utente bloccato scompare dalla lista chat, dai match e dai risultati di ricerca per entrambi i lati
- Tentare di aprire una chat con un utente bloccato (o da cui si è bloccati) mostra un messaggio di errore

## Out of scope
- Sblocco utenti da parte dell'utente (solo gli admin possono farlo via pannello esistente)
- Notifiche al bloccato
- Blocco di gruppi o MotoClub

## Tasks
1. **Schema + API blocco utente** — Creare la tabella `user_blocks` (blockerId, blockedId, createdAt) nel database. Aggiungere endpoint `POST /api/users/:id/block` (irreversibile, restituisce errore se già bloccato). Aggiungere middleware che filtra utenti bloccati da: lista conversazioni, profili, match biker-biker, risultati heartbeat/visibilità.

2. **Tasto Elimina Chat nell'UI** — Aggiungere un'icona cestino visibile in cima alla schermata della conversazione aperta e un'azione rapida (swipe o tasto) nella lista chat, con dialog di conferma. Rendere il long-press esistente secondario o eliminarlo per coerenza.

3. **Tasto Blocca Utente nel profilo** — Nel profilo pubblico di un utente (`app/profile/[id].tsx`) aggiungere il tasto "Blocca utente". Al tap mostrare un Alert con testo che spiega chiaramente che il blocco è permanente e non reversibile, e che entrambi gli utenti non si vedranno più. Solo dopo conferma esplicita viene chiamato l'API di blocco. Dopo il blocco, reindirizzare fuori dal profilo e invalidare le cache.

## Relevant

_(troncato)_

### Risultato

- In ogni conversazione aperta (e nella lista chat) è visibile un tasto cestino/elimina per cancellare la chat con una conferma
- Nel profilo di un utente c'è un tasto "Blocca utente" che mostra un avviso chiaro sull'irreversibilità prima di confermare
- Dopo il blocco, l'utente bloccato scompare dalla lista chat, dai match e dai risultati di ricerca per entrambi i lati
- Tentare di aprire una chat con un utente bloccato (o da cui si è bloccati) mostra un messaggio di errore

---
## #78 — Splash Message — Modalità Singolo / Cicla

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 18:37:02 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Splash Message — Modalità Singolo / Cicla

## What & Why
Nella sezione "Messaggio Splash" del pannello admin, aggiungere la possibilità di scegliere tra due modalità:
- **Messaggio singolo**: comportamento attuale, un testo fisso mostrato nello splash.
- **Cicla messaggi**: una lista di messaggi editabile direttamente nell'admin, mostrati in rotazione ogni volta che l'utente vede lo splash.

## Done looks like
- Nell'admin (sezione Parametri → Messaggio Splash) compare un toggle/selettore "Messaggio singolo / Cicla messaggi".
- In modalità "Cicla", appare una lista di messaggi editabili sul posto: ogni riga è modificabile, si possono aggiungere e rimuovere messaggi singoli.
- La lista viene salvata come nuovo setting nel DB (`splash_messages_list`, array JSON stringificato).
- La modalità attiva viene salvata in un setting separato (`splash_message_mode`: `"single"` o `"cycle"`).
- Nello splash screen (`app/(auth)/splash.tsx`), se la modalità è "cicla", il messaggio mostrato viene scelto in modo rotante (round-robin basato su un contatore persistente in AsyncStorage, oppure casuale).
- Se la modalità è "single", lo splash continua a mostrare il messaggio dal campo `splash_message` esistente.

## Out of scope
- Animazioni di transizione tra messaggi durante lo splash (il messaggio è scelto prima che lo splash si apra).
- Invio di notifiche push legate ai messaggi.

## Tasks
1. **Backend — nuovi setting** — Aggiungere due nuove chiavi alla tabella `app_settings`: `splash_message_mode` (default `"single"`) e `splash_messages_list` (default `"[]"`). Assicurarsi che le API generiche `/api/admin/settings/:key` (GET e PUT) le coprano già senza modifiche aggiuntive; se necessario aggiungerle all'elenco delle chiavi permesse.

2. **Admin UI — toggle + lista editabile** — Nel card "Messaggio Splash" in `app/admin/settings.tsx`, sostituire il semplice `renderSettingCard` con un componente dedicato che mostri: (a) il campo testo esistente per il messaggio singolo, (b) un sele

_(troncato)_

### Risultato

## Relevant files
- `app/admin/settings.tsx:1-30,685-705,1209-1225`
- `app/(auth)/splash.tsx`
- `server/routes/admin.ts`

---
## #79 — Fix scorrimento lista regioni utenti fake

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 19:24:24 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix scorrimento lista regioni utenti fake

## What & Why
Nel modale di creazione utente fake, il selettore regione mostra tutte le 20 regioni italiane dentro una `View` statica. Se la lista supera lo spazio visibile del modale, le regioni in fondo non sono raggiungibili. Bisogna renderla scorrevole.

## Done looks like
- Aprendo il selettore regione nel modale "crea utente fake", l'elenco si può scorrere verso il basso
- Tutte e 20 le regioni sono raggiungibili

## Out of scope
- Qualsiasi altra modifica al modale o alla logica di creazione utenti

## Tasks
1. Nella sezione `showRegionPicker` di `app/admin/fake-users.tsx`, sostituire il `View` con `pickerList` con un `ScrollView` avente un `maxHeight` (es. 220px) in modo che la lista diventi scorrevole.

## Relevant files
- `app/admin/fake-users.tsx:804-820`

### Risultato

- Aprendo il selettore regione nel modale "crea utente fake", l'elenco si può scorrere verso il basso
- Tutte e 20 le regioni sono raggiungibili

---
## #80 — Protezione utente BikerLink_Official

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-03-18 21:12:55 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Protezione utente BikerLink_Official

## What & Why
L'utente "BikerLink_Official" è l'account ufficiale della piattaforma e deve essere intoccabile: nessun admin può eliminarlo, sospenderlo, bloccare il suo account o modificare email/password. Nessun utente normale può bloccarlo (nasconderlo dalla propria mappa).

## Done looks like
- Tentativo di eliminare BikerLink_Official dall'admin panel → 403
- Tentativo di sospenderlo/bloccarlo dall'admin panel → 403
- Tentativo di cambiarne ruolo, email o password dall'admin panel → 403
- Tentativo di bloccarlo come utente normale → 403
- Tutti gli altri utenti continuano a funzionare normalmente

## Out of scope
- Protezione a livello frontend (pannello admin)
- Aggiunta di un campo DB "isProtected" (si usa solo il nickname)

## Tasks
1. **Costante PROTECTED_NICKNAMES** — Aggiungere array `PROTECTED_NICKNAMES = ["BikerLink_Official"]` in un punto condiviso del backend (ad es. in cima a `server/routes/admin.ts` o in un file `server/constants.ts`).

2. **Protezione endpoint admin** — In `server/routes/admin.ts`, nei 5 endpoint che operano su un singolo utente (`DELETE /users/:id`, `PUT /users/:id/status`, `PUT /users/:id/role`, `PUT /users/:id/email`, `PUT /users/:id/password`), aggiungere un check dopo il fetch dell'utente: se il nickname è in `PROTECTED_NICKNAMES` restituire 403 con messaggio "Utente di sistema non modificabile".

3. **Protezione blocco utente** — In `server/routes/users.ts`, nel `POST /:id/block`, aggiungere analogo check sul targetUser prima di chiamare `storage.blockUser`.

## Relevant files
- `server/routes/admin.ts:62-212`
- `server/routes/users.ts:737-761`

### Risultato

- Tentativo di eliminare BikerLink_Official dall'admin panel → 403
- Tentativo di sospenderlo/bloccarlo dall'admin panel → 403
- Tentativo di cambiarne ruolo, email o password dall'admin panel → 403
- Tentativo di bloccarlo come utente normale → 403

---
## #81 — Fix crash mappa fullscreen su iOS

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 21:23:29 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix crash mappa fullscreen iOS

## What & Why
Su iPhone (testato su iPhone 13 Pro in Expo Go), aprendo la mappa a schermo intero l'app crasha. La causa è che vengono montate simultaneamente due istanze di `MapView` (minimap + Modal fullscreen), entrambe con `PROVIDER_GOOGLE` che richiedono i permessi di localizzazione in parallelo. Su iOS questo provoca la chiusura forzata di Expo Go.

## Done looks like
- Tap sull'icona "expand" nella minimap → apre la mappa fullscreen senza crash
- L'app non si chiude su iPhone durante questa azione
- La minimap ricompare normalmente alla chiusura del Modal

## Out of scope
- Modifiche all'InteractiveMap stesso
- Ottimizzazioni di performance della mappa

## Tasks
1. **Smonta la minimap quando il Modal è aperto** — In `app/(tabs)/index.tsx`, modificare il rendering della `<Pressable>` che contiene la minimap `InteractiveMap`: renderizzarla solo quando `mapFullscreen` è `false` (`{!mapFullscreen && <InteractiveMap ... />}`). Quando il Modal è aperto, mostrare al suo posto un `View` con `backgroundColor` scuro e opzionalmente un `ActivityIndicator` come placeholder. Questo garantisce che esista una sola istanza di MapView alla volta.

## Relevant files
- `app/(tabs)/index.tsx:676-697`
- `components/InteractiveMap.tsx`

### Risultato

- Tap sull'icona "expand" nella minimap → apre la mappa fullscreen senza crash
- L'app non si chiude su iPhone durante questa azione
- La minimap ricompare normalmente alla chiusura del Modal

---
## #82 — Fix definitivo crash mappa fullscreen iOS

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 21:40:14 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix crash mappa iOS — mount delay + cleanup async

## What & Why
Il fix precedente (#81) rimuoveva la minimap nello stesso ciclo di render in cui montava il MapView fullscreen. Sul layer nativo iOS questo non basta: il MapView nativo della minimap non fa in tempo a deallocarsi prima che venga inizializzato il secondo MapView nel Modal, causando ancora il crash in Expo Go su iPhone.

Serve agire su due fronti:
1. **Ritardo del mount**: il MapView fullscreen deve aspettare ~400ms dopo l'apertura del Modal prima di montarsi, per dare tempo al layer iOS di liberare il primo MapView.
2. **Cleanup dell'async in InteractiveMap**: il `useEffect` che chiama `Location.getCurrentPositionAsync()` non cancella l'operazione quando il componente viene smontato. Se la minimap viene smontata mentre la richiesta di localizzazione è ancora in volo, iOS riceve una risposta "orfana" che può interferire con il nuovo MapView.

## Done looks like
- Tap su "expand" sulla minimap → mappa fullscreen si apre senza crash su iPhone 13 Pro in Expo Go
- Chiusura del fullscreen → minimap torna normalmente
- Nessun setState su componente smontato (warning React eliminato)

## Out of scope
- Refactoring completo della gestione posizione
- Cambio di NavigationStack o nuove route

## Tasks
1. **Delay mount MapView fullscreen** — In `app/(tabs)/index.tsx`, aggiungere uno stato `mapFullscreenReady` (boolean, default false). Aggiungere un `useEffect` che quando `mapFullscreen` diventa `true` imposta un `setTimeout` di 400ms che setta `mapFullscreenReady = true`; quando `mapFullscreen` diventa `false`, resetta immediatamente `mapFullscreenReady = false`. Dentro il Modal, renderizzare `<InteractiveMap>` solo se `mapFullscreenReady` è true, altrimenti mostrare `<ActivityIndicator>` centrato.

2. **Cancella async localizzazione all'unmount** — In `components/InteractiveMap.tsx`, nel `useEffect` che richiede la posizione, aggiungere un ref `cancelled` (inizializzato a `false`) e restituire una cleanup functi

_(troncato)_

### Risultato

- Tap su "expand" sulla minimap → mappa fullscreen si apre senza crash su iPhone 13 Pro in Expo Go
- Chiusura del fullscreen → minimap torna normalmente
- Nessun setState su componente smontato (warning React eliminato)

---
## #83 — Fix bug garage: isDefault moto + moto spariscono dopo logout

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 21:49:59 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix bug garage: isDefault + moto spariscono

## What & Why
Due bug nel garage moto:

**Bug 1 — isDefault non salvato alla creazione:**
Il `POST /api/motorcycles` ignora il campo `isDefault` del body: la destructuring a riga 52 di `server/routes/motorcycles.ts` non include `isDefault`, quindi `createUserMotorcycle` viene sempre chiamato con il default del DB (`false`). Quando l'utente aggiunge una nuova moto con "Predefinita" selezionato, il flag viene perso.

**Bug 2 — Moto spariscono dopo logout/login:**
Sequenza: logout → `queryClient.clear()` → il tab Garage (ancora montato) esegue la query `/api/motorcycles` → riceve 401 → con `on401: "returnNull"` restituisce `null` e lo mette in cache → utente fa login → `loginMutation.onSuccess` aggiorna solo `/api/auth/me` → `/api/motorcycles` ha `null` in cache con `staleTime: Infinity` e non richiede mai i dati reali.

## Done looks like
- Aggiungere una moto con "Predefinita" selezionato → riaprendo il form la checkbox è spuntata
- Dopo logout + login → le moto dell'utente compaiono normalmente nel garage
- Non c'è regressione su altri tab che caricano dati al login

## Out of scope
- Cambiare la gestione globale della cache o staleTime
- Modifiche alla UI del garage

## Tasks
1. **Fix isDefault alla creazione** — In `server/routes/motorcycles.ts`, aggiungere `isDefault` alla destructuring del body (`const { ..., isDefault } = req.body`). Passare `isDefault: isDefault || false` a `createUserMotorcycle`. Aggiungere anche la logica di reset delle altre moto (come nel PUT): se `isDefault === true`, eseguire `db.update(userMotorcycles).set({ isDefault: false }).where(and(eq(userMotorcycles.userId, userId), ne(userMotorcycles.id, motorcycle.id)))` subito dopo la creazione.

2. **Fix cache dopo login** — In `lib/auth-context.tsx`, nella `useLoginMutation.onSuccess`, dopo `queryClient.setQueryData(["/api/auth/me"], user)`, aggiungere `queryClient.invalidateQueries()`. Questo forza il re-fetch di tutti i dati (moto, profilo, ch

_(troncato)_

### Risultato

- Aggiungere una moto con "Predefinita" selezionato → riaprendo il form la checkbox è spuntata
- Dopo logout + login → le moto dell'utente compaiono normalmente nel garage
- Non c'è regressione su altri tab che caricano dati al login

---
## #84 — Velocizza badge nuovi messaggi

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 22:00:47 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Velocizza badge nuovi messaggi

## What & Why
Il badge arancione "nuovi messaggi" sulla tab Chat si aggiorna ogni 30 secondi, causando un ritardo percepibile quando un utente riceve un messaggio. Ridurre l'intervallo di polling migliora la reattività e l'esperienza utente.

## Done looks like
- Il pallino arancione sulla tab Chat compare entro 5-8 secondi dalla ricezione del messaggio
- Non si verificano rallentamenti o crash dovuti al polling più frequente

## Out of scope
- Notifiche push native
- WebSocket o connessioni in tempo reale

## Tasks
1. Abbassare il `refetchInterval` del query `/api/chat/unread-total` da 30000ms a 6000ms in `app/(tabs)/_layout.tsx`.

## Relevant files
- `app/(tabs)/_layout.tsx`

### Risultato

- Il pallino arancione sulla tab Chat compare entro 5-8 secondi dalla ricezione del messaggio
- Non si verificano rallentamenti o crash dovuti al polling più frequente

---
## #85 — Fix pic!: foto degli altri utenti non visibili

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-03-18 22:01:57 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix pic!: foto degli altri utenti non visibili

## What & Why
Nel sistema pic! (contest settimanale), le foto caricate dagli utenti non
sono visibili agli altri partecipanti: il riquadro compare ma l'immagine è
vuota. L'utente che ha caricato la foto la vede perché l'URI locale è ancora
in React state, ma gli altri ricevono un `file:///...` URI del dispositivo
originale che non è accessibile dal loro.

Root cause: `app/(tabs)/contest.tsx` usa `showImagePickerMenu` che restituisce
un URI locale, poi lo manda direttamente come JSON `{ photoUrl: uri }` al
`POST /api/contest/entries`. Il server salva questo URI locale in DB. Gli altri
utenti non possono caricare un file locale altrui.

Confronto con il sistema che funziona (foto profilo): `app/(tabs)/profile.tsx`
usa FormData multipart via `POST /api/users/me/photos` + multer per inviare
i byte reali al server, che li salva in `/uploads/photos/` e restituisce una
URL pubblica tipo `/uploads/photos/nomefile.jpg` servita staticamente da
`app.use("/uploads", express.static(...))` in `server/index.ts`.

## Done looks like
- Utente A carica una foto nel contest
- Utente B vede la foto di A nel feed del contest
- Il sistema dei voti continua a funzionare
- La preview di upload sul dispositivo continua a funzionare
- Il campo `performanceData` (entry senza foto) non è toccato

## Out of scope
- Spostare lo storage su object storage cloud (rimane su disco /uploads come
  le foto profilo)
- Moderazione delle foto
- Modifiche alla UI del contest

## Tasks
1. **Backend: multer per contest** — In `server/routes/contest.ts`, aggiungere
   multer (disk storage in `/uploads/contest/`). Modificare il `POST /api/contest/entries`
   per accettare sia multipart form (con campo `photo`) sia JSON puro (per le
   entry `performanceData` senza foto). Quando arriva un file, salvarlo su disco
   e usare `/uploads/contest/nomefile` come `photoUrl`. Pattern identico a
   `server/routes/users.ts` righe 2-24 e 646-674.

2. **Frontend: FormData up

_(troncato)_

### Risultato

- Utente A carica una foto nel contest
- Utente B vede la foto di A nel feed del contest
- Il sistema dei voti continua a funzionare
- La preview di upload sul dispositivo continua a funzionare

---
## #86 — Fix flag Predefinita moto garage

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 22:02:39 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix flag "Predefinita" moto garage

## What & Why
Quando si aggiunge una moto al garage e si seleziona "Predefinita", riaprendo il profilo di quella moto la flag risulta deselezionata. Il flag viene perso durante il salvataggio o nel ritorno dei dati al frontend.

## Done looks like
- Aggiungendo una moto con "Predefinita" selezionato, il badge "Predefinita" appare nell'elenco del garage
- Riaprendo la moto in modifica, la checkbox "Predefinita" risulta spuntata
- Modificando una moto già predefinita e salvando senza toccare la flag, questa non viene azzerata
- Solo una moto per volta può essere predefinita; impostandone una nuova, la precedente perde il flag

## Out of scope
- Logica di matching o proposte basate sulla moto predefinita

## Tasks
1. **Verifica e fix del type coercion nel POST** — Nel route POST `/api/motorcycles`, assicurarsi che `isDefault` dal body venga correttamente coercito a boolean prima del confronto `=== true`. Usare `Boolean(isDefault)` o `isDefault === true || isDefault === 'true'` per gestire eventuali payload non strettamente tipati.

2. **Fix ordinamento nel PUT** — Nel route PUT `/:id`, il reset delle altre moto avviene PRIMA che la moto corrente venga aggiornata. Se `updateData.isDefault` è già `true` nel DB (moto già predefinita che viene ri-salvata senza cambiare il flag), il reset degli altri funziona correttamente; verificare però che il `updateData` non sovrascriva involontariamente `isDefault: false` se il campo arriva come `undefined` dalla request. Aggiungere un controllo esplicito: aggiornare `isDefault` solo se il campo è presente nel body.

3. **Fix refresh frontend** — Dopo il salvataggio (POST e PUT), verificare che `queryClient.invalidateQueries` forzi effettivamente il refetch prima che l'utente possa riaprire la scheda di modifica. Se necessario, usare `await queryClient.refetchQueries` in `onSuccess` per garantire dati freschi.

4. **Test end-to-end** — Testare: aggiunta moto con predefinita → badge visibile → riap

_(troncato)_

### Risultato

- Aggiungendo una moto con "Predefinita" selezionato, il badge "Predefinita" appare nell'elenco del garage
- Riaprendo la moto in modifica, la checkbox "Predefinita" risulta spuntata
- Modificando una moto già predefinita e salvando senza toccare la flag, questa non viene azzerata
- Solo una moto per volta può essere predefinita; impostandone una nuova, la precedente perde il flag

---
## #87 — Fix matching: diagnostica garage e match admin

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 22:08:35 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix matching: diagnostica garage e match admin

## What & Why
Il motore di matching completa ogni ciclo in 0.0s senza produrre match, e l'account admin non ha nessun match nonostante 2400 utenti fake appena creati. Il problema ha tre cause probabili:
1. La query `getAllBikerMotorcyclesWithUsers` filtra per `userType IN ('biker','coppia')` — l'admin (con `userType = 'admin'`) non viene mai incluso in nessun bucket
2. Il seed dei 2400 utenti fake potrebbe aver fallito silenziosamente l'inserimento delle moto (logSeedError non blocca l'esecuzione)
3. Il matching engine non logga quante moto trova, quanti bucket crea e quante coppie salta per conflitto — impossibile diagnosticare il problema senza

## Done looks like
- Il log del matching engine mostra chiaramente: N moto trovate, M bucket creati, K nuovi match, J saltati (già esistenti)
- Se i 2400 fake biker NON hanno moto nel DB, viene loggato un warning e il reconcile le inserisce
- L'admin vede match nella propria schermata (o, se l'admin non ha senso nel matching, viene spiegato chiaramente nel pannello admin quante moto/match esistono nel sistema)
- Dopo aver fixato, il ciclo di matching genera > 0 nuovi match con i fake users

## Out of scope
- Cambiamenti alla logica di scoring/compatibilità (quelli sono in #59 e #61)
- Nuove funzionalità del garage (aggiunta moto, foto, vendita)
- Cambiamenti all'UI dei match

## Tasks
1. **Aggiungi logging diagnostico al matching engine** — In `matching-engine.ts`, dopo ogni chiamata a `getAllBikerMotorcyclesWithUsers` e `getAllWishlistMotosWithUsers`, logga il conteggio delle righe restituite. In `runBikerBikerMatching`, logga quanti bucket sono stati creati, quanti skip per conflitto e quanti nuovi match inseriti. Stesso logging in `runWishlistMatching`.

2. **Reconcile moto mancanti sui fake users** — Aggiungi un endpoint admin `POST /api/admin/reconcile-fake-moto` (o uno script eseguibile) che: (a) carica tutti i fake biker/coppia senza moto in `user_motorcycles`, (b) i

_(troncato)_

### Risultato

- Il log del matching engine mostra chiaramente: N moto trovate, M bucket creati, K nuovi match, J saltati (già esistenti)
- Se i 2400 fake biker NON hanno moto nel DB, viene loggato un warning e il reconcile le inserisce
- L'admin vede match nella propria schermata (o, se l'admin non ha senso nel matching, viene spiegato chiaramente nel pannello admin quante moto/match esistono nel sistema)
- Dopo aver fixato, il ciclo di matching genera > 0 nuovi match con i fake users

---
## #88 — Fix: Elimina moto utenti fake

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 22:20:12 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix: Elimina moto utenti fake

## What & Why
Quando si preme "Elimina tutti gli utenti fake" dal pannello admin, il metodo `deleteAllFakeUsers()` in `server/storage.ts` cancella gli utenti e le conversazioni orfane, ma non elimina le moto (`userMotorcycles`) associate a quegli utenti fake. Questo lascia record orfani nel database.

## Done looks like
- Premendo il tasto "Elimina tutti", vengono cancellate anche tutte le moto associate agli utenti fake
- Nessun record orfano nella tabella `userMotorcycles` dopo l'operazione

## Out of scope
- Modifica al comportamento del pulsante nella UI
- Cancellazione di altri dati correlati non già gestiti

## Tasks
1. **Fix deleteAllFakeUsers** — All'interno della transazione in `deleteAllFakeUsers()`, aggiungere prima della DELETE degli utenti una DELETE sulla tabella `userMotorcycles` dove `userId` è tra gli utenti fake da eliminare (stessa condizione: `isFake = true` e nickname diverso da `BikerLink_Official`). Analogamente verificare e correggere `deleteFakeUser()` per il singolo utente.

## Relevant files
- `server/storage.ts:1525-1570`

### Risultato

- Premendo il tasto "Elimina tutti", vengono cancellate anche tutte le moto associate agli utenti fake
- Nessun record orfano nella tabella `userMotorcycles` dopo l'operazione

---
## #89 — Pannello Iscritti nella Chat Motoclub

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-18 22:41:50 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Pannello Iscritti nella Chat Motoclub

## What & Why
Nella chat di un motoclub, l'utente non ha modo di vedere chi è iscritto al club. Si vuole aggiungere un pulsante "Iscritti" vicino al nome del club nella barra superiore della chat. Toccandolo appare una lista scorrevole degli iscritti al club.

## Done looks like
- Nella topBar della chat motoclub, accanto al nome del club, compare un pulsante "Iscritti" (o icona persone)
- Toccando il pulsante si apre un pannello (modal o bottom sheet) con la lista di tutti i partecipanti alla conversazione
- Ogni riga mostra: avatar (o iniziale), nickname e tipo utente dell'iscritto
- Il pannello è chiudibile (con una X o toccando fuori)
- Il resto della UI della chat resta invariato

## Out of scope
- Nessuna funzionalità di gestione iscritti (espulsione, promozione admin, ecc.)
- Nessuna chiamata API aggiuntiva: i dati dei partecipanti sono già presenti in `conversation.participants`

## Tasks
1. **Pulsante Iscritti nella topBar** — Aggiungere, solo quando `isMotoclub` è true, un pulsante con icona persone (es. `people-outline`) o testo "Iscritti" nella barra superiore della chat, accanto al nome del club. Gestire uno stato `showMembersPanel`.

2. **Pannello lista iscritti** — Quando `showMembersPanel` è true, mostrare un Modal (o View sovrapposta) con una FlatList dei `conversation.participants`. Ogni riga mostra avatar/iniziale, nickname e userType. Il pannello ha un'intestazione "Iscritti" con pulsante di chiusura.

## Relevant files
- `app/chat/[id].tsx:1-55,310-358`

### Risultato

- Nella topBar della chat motoclub, accanto al nome del club, compare un pulsante "Iscritti" (o icona persone)
- Toccando il pulsante si apre un pannello (modal o bottom sheet) con la lista di tutti i partecipanti alla conversazione
- Ogni riga mostra: avatar (o iniziale), nickname e tipo utente dell'iscritto
- Il pannello è chiudibile (con una X o toccando fuori)

---
## #90 — Match biker per famiglia di moto

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-19 12:36:25 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Match biker per famiglia di moto

## What & Why
Il motore di matching biker↔biker richiede marca+modello identici al carattere (es. "Ducati Monster 821" ≠ "Ducati Monster 937"). L'utente vuole che biker con moto della stessa famiglia (stessa marca, stesso nome-base del modello) facciano match, ignorando la cilindrata/variante numerica finale (821, 937, 650, ecc.).

Esempio atteso: "Ducati Monster 821" e "Ducati Monster 694" → match (entrambi "Monster").

## Done looks like
- Biker con "Ducati Monster 821" e biker con "Ducati Monster 937" si trovano come match biker-biker
- Biker con "Yamaha MT-09" e biker con "Yamaha MT-07" NON si matchano (MT-09 ≠ MT-07, il numero fa parte del nome)
- Biker con "BMW R 1250 GS" e biker con "BMW F 850 GS" NON si matchano (R ≠ F)
- Il sistema dei match esistenti (garage, proposte) non è toccato

## Out of scope
- Modifiche al matching garage/wishlist (già usa partial match)
- Modifiche al matching proposte
- UI del tab match

## Tasks
1. **Funzione baseModelName** — In `server/matching-engine.ts`, aggiungere una funzione che estrae il nome-base del modello rimuovendo i token numerici isolati (separati da spazio), mantenendo numeri embedded nel nome (es. "MT-09", "Z900"). Regex: rimuove ` \d+ ` e ` \d+$` dal modello.

2. **Aggiorna chiave bucket** — In `runBikerBikerMatching()`, cambiare la chiave del bucket da `` `${brand}|${model}` `` a `` `${brand}|${baseModelName(model)}` `` così "Monster 821" e "Monster 937" finiscono nello stesso bucket e generano match tra loro.

## Relevant files
- `server/matching-engine.ts:202-258`

### Risultato

- Biker con "Ducati Monster 821" e biker con "Ducati Monster 937" si trovano come match biker-biker
- Biker con "Yamaha MT-09" e biker con "Yamaha MT-07" NON si matchano (MT-09 ≠ MT-07, il numero fa parte del nome)
- Biker con "BMW R 1250 GS" e biker con "BMW F 850 GS" NON si matchano (R ≠ F)
- Il sistema dei match esistenti (garage, proposte) non è toccato

---
## #91 — Fix eliminazione match accettati

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-19 12:43:10 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix eliminazione match accettati

## What & Why
Se un utente accetta un match biker-biker e poi lo elimina col tasto cestino (rosso), il sistema rimette il match in stato "new" e lo ripropone. Il comportamento corretto: il match eliminato dopo essere stato accettato deve diventare "rejected" e non riapparire finché l'utente non preme il pulsante "reset rifiutati" in alto a destra (che svuota tutti i match rejected).

## Done looks like
- Utente accetta un match → appare nella sezione "accettati"
- Utente preme il cestino rosso su un match accettato → il match scompare e NON ricompare nella lista
- Il match rimane invisibile finché l'utente non preme "reset rifiutati"
- Dopo il reset, il motore di matching può rigenerare il match nel ciclo successivo
- Il comportamento di "reject" diretto (senza prima accettare) rimane invariato

## Out of scope
- Modifica all'UI del tab match
- Modifica al matching garage/wishlist
- Modifica al matching proposte

## Tasks
1. **Fix storage.ts** — In `resetBikerBikerMatchToNew`, verificare lo stato attuale del match: se era `"accepted"`, impostare lo stato a `"rejected"` invece di `"new"`. Se era `"new"`, mantenere il reset a `"new"` (comportamento attuale per annullare una decisione in corso). Rinominare la funzione in modo appropriato se necessario.

2. **Allineare la route** — Aggiornare il commento/nome della route `DELETE /biker-matches/:matchId` in `proposals.ts` se la funzione viene rinominata.

## Relevant files
- `server/storage.ts:1741-1747`
- `server/routes/proposals.ts:367-377`

### Risultato

- Utente accetta un match → appare nella sezione "accettati"
- Utente preme il cestino rosso su un match accettato → il match scompare e NON ricompare nella lista
- Il match rimane invisibile finché l'utente non preme "reset rifiutati"
- Dopo il reset, il motore di matching può rigenerare il match nel ciclo successivo

---
## #92 — Popola motoclub con utenti fake

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-19 12:43:10 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Popola motoclub con utenti fake

## What & Why
I motoclub sono vuoti perché il sistema di creazione degli utenti fake non li iscrive ad alcun club. L'admin si aspetta che i fake user vengano automaticamente distribuiti nei motoclub esistenti (approvati), così le sezioni club risultano popolate come in produzione reale.

## Done looks like
- Quando si crea un singolo fake user (admin panel), viene iscritto automaticamente a 0-3 motoclub esistenti scelti casualmente
- Il mass seed script assegna ogni fake user a 1-3 motoclub casuali tra quelli approvati
- L'admin panel ha un bottone "Distribuisci nei motoclub" nella sezione fake users che assegna retroattivamente i fake user già esistenti ai club (per chi li ha già generati senza questa feature)
- Solo i motoclub con `isApproved = true` vengono usati come destinazione
- Non viene creata la stessa iscrizione due volte (controllo duplicati)

## Out of scope
- Modifica alla UI dei motoclub lato utente
- Creazione di nuovi motoclub fake
- Assegnazione di fake user a club non approvati

## Tasks
1. **Helper di assegnazione** — Creare una funzione interna in `admin.ts` (o `storage.ts`) che, dato un userId, prende la lista dei motoclub approvati e iscrive l'utente a N club casuali (N tra 1 e 3) aggiungendo righe in `motoClubMembers` con `status = "active"` e `role = "member"`, saltando quelli già iscritti.

2. **Hook su creazione fake user** — Richiamare l'helper al termine della `POST /fake-users` (dopo che profilo, moto e wishlist sono stati creati) passando l'id del nuovo utente.

3. **Hook nel mass seed** — Richiamare l'helper per ogni utente generato dal mass seed script.

4. **Bottone retroattivo in admin** — Aggiungere un endpoint `POST /admin/fake-users/distribute-to-clubs` che itera su tutti i fake user esistenti e chiama l'helper per ognuno. Aggiungere il bottone corrispondente nella UI admin (stessa sezione del toggle enable/disable fake users).

## Relevant files
- `server/routes/admin.ts:1115-1338`
- `server/m

_(troncato)_

### Risultato

- Quando si crea un singolo fake user (admin panel), viene iscritto automaticamente a 0-3 motoclub esistenti scelti casualmente
- Il mass seed script assegna ogni fake user a 1-3 motoclub casuali tra quelli approvati
- L'admin panel ha un bottone "Distribuisci nei motoclub" nella sezione fake users che assegna retroattivamente i fake user già esistenti ai club (per chi li ha già generati senza questa feature)
- Solo i motoclub con `isApproved = true` vengono usati come destinazione

---
## #93 — Fix freeze pannello admin motoclub

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-19 16:31:56 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix performance pannello admin motoclub

## What & Why
Aprire la sezione "Motoclub" nell'admin panel causa un freeze dell'app per due bug di performance:

1. **N+1 query sulla lista club**: `GET /admin/motoclubs` esegue una query SQL separata per ogni club per contare i membri. Con 50 club fa 51 query al DB in sequenza.
2. **Nessuna paginazione sul dettaglio club**: `GET /admin/motoclubs/:id` restituisce TUTTI i membri senza limite. Dopo la distribuzione dei fake user un club può avere 200-300+ membri — la FlatList del frontend prova a renderizzare tutto in una volta e si inceppa.

## Done looks like
- La lista dei motoclub nell'admin si carica rapidamente anche con molti club
- Il dettaglio di un singolo club si apre senza freeze, mostrando i membri a pagine (50 per volta) con un bottone "Carica altri"
- Il conteggio "Membri totali" nella schermata lista resta corretto

## Out of scope
- Paginazione sulla lista dei club (il numero di club è piccolo e gestibile)
- Modifica all'ordinamento o ai filtri esistenti

## Tasks
1. **Fix N+1 query lista club** — Sostituire il `Promise.all(clubs.map(...))` in `GET /admin/motoclubs` con una singola query SQL che usa `COUNT` + `LEFT JOIN` (o subquery) per ottenere memberCount in un colpo solo.

2. **Paginazione membri nel dettaglio club** — Aggiungere `?page=` (o `?offset=&limit=`) all'endpoint `GET /admin/motoclubs/:id`. Restituire max 50 membri per pagina insieme a `totalCount` e `hasMore`. Sul frontend, aggiungere un bottone "Carica altri N membri" che appende la pagina successiva alla lista esistente, senza svuotare quella corrente.

## Relevant files
- `server/routes/admin.ts:1661-1673`
- `server/routes/admin.ts:1771-1799`
- `app/admin/motoclub/[id].tsx`

### Risultato

- La lista dei motoclub nell'admin si carica rapidamente anche con molti club
- Il dettaglio di un singolo club si apre senza freeze, mostrando i membri a pagine (50 per volta) con un bottone "Carica altri"
- Il conteggio "Membri totali" nella schermata lista resta corretto

---
## #94 — Stato online/disponibile nel profilo + fix counter

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-19 16:47:34 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Stato Online e Disponibilità nel Profilo

## What & Why
Il profilo utente (sia il modal sulla mappa che la pagina completa) non mostra se un utente è online/offline né se è disponibile/non disponibile. Inoltre il counter degli utenti disponibili sulla schermata home non riflette i cambiamenti in tempo reale. Questi dati sono già presenti nel backend ma non vengono esposti nella UI del profilo.

## Done looks like
- Nel modal del profilo (sulla mappa) compare un badge o indicatore visivo che mostra: "Online" (verde) o "Offline" (grigio) basato su `lastLoginAt` < 15 minuti, e "Disponibile" / "Non disponibile" basato su `isAvailable`
- Nella pagina completa del profilo (`/profile/[id]`) compaiono gli stessi indicatori, visibili subito sotto il nickname
- Il counter degli utenti "disponibili" sulla home si aggiorna automaticamente ogni volta che i dati vengono ricaricati (polling già esistente o con refetch opportuno), senza richiedere un riavvio dell'app
- Gli indicatori sono coerenti con i dati reali: un utente che ha fatto heartbeat di recente appare online, uno che non fa heartbeat da >15 minuti appare offline

## Out of scope
- Cambio della logica del heartbeat o della finestra di 15 minuti (coperto da task #55)
- Indicatori in tempo reale via WebSocket
- Modifica dello stato disponibile/non disponibile dal profilo altrui

## Tasks
1. **Aggiungere i campi online/disponibile alle API profilo** — Verificare che `GET /api/users/:id` ritorni `isOnline` (calcolato da `lastLoginAt`) e `isAvailable` nella risposta. Se non presenti, aggiungerli nel backend.

2. **Indicatori nel modal profilo (home/mappa)** — Nel modal del profilo in `app/(tabs)/index.tsx`, aggiungere sotto il nickname due badge: uno per lo stato online/offline (verde/grigio) e uno per la disponibilità (colorato/grigio). Usare i dati già presenti nell'oggetto utente passato al modal.

3. **Indicatori nella pagina profilo completa** — In `app/profile/[id].tsx`, aggiungere gli stessi badge (online/offline e

_(troncato)_

### Risultato

## Relevant files
- `app/(tabs)/index.tsx`
- `app/profile/[id].tsx`
- `server/routes/users.ts`

---
## #95 — Schermata dettaglio motoclub

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-19 18:24:12 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Schermata dettaglio motoclub

## What & Why
Attualmente toccare un motoclub nella tab "I Miei" porta direttamente alla chat di gruppo, saltando qualsiasi contesto sul club. L'utente vuole una schermata intermedia che mostri i dettagli del club (info, iscritti) con un'icona separata per aprire la chat.

## Done looks like
- Toccare un club nella tab motoclub apre una schermata dettaglio (non la chat direttamente)
- La schermata mostra: nome club, tipo (brand/model), brand e modello, data creazione, numero iscritti
- Lista iscritti espandibile/collassabile (mostra avatar, nickname, userType)
- Icona/bottone ben visibile per aprire la chat del club
- La navigazione "Entra" (per chi non è membro) rimane invariata

## Out of scope
- Schermata dettaglio per utenti non-membri (vedono solo il bottone Entra, come ora)
- Modifica ai permessi di accesso al club
- Statistiche km percorsi o altre metriche avanzate

## Tasks
1. **Nuovo endpoint backend** — Creare `GET /api/motoclubs/:id/detail` che restituisce info club + lista iscritti paginata (limit 30, offset). Riutilizzare la query esistente di admin ma senza dati admin-only (no email, no userId completo). Verificare che l'utente sia membro prima di restituire la lista iscritti.

2. **Nuova schermata frontend** — Creare `app/motoclub/[id].tsx` con header club, sezione info, lista iscritti collassabile (default: prime 5 visibili, bottone "Mostra tutti N"), e bottone chat prominente in fondo. Usare `useLocalSearchParams` per leggere l'id e passare `conversationId` come param extra nella navigazione.

3. **Aggiornare navigazione in motoclub tab** — In `app/(tabs)/motoclub.tsx`, modificare l'handler del tap su club (per i soli membri): invece di `router.push("/chat/${conversationId}")`, navigare a `/motoclub/${club.id}?conversationId=${conversationId}`.

## Relevant files
- `app/(tabs)/motoclub.tsx:373-376`
- `app/admin/motoclub/[id].tsx`
- `server/routes/motoclubs.ts:111-165`
- `server/routes/admin.ts:1777-1820`

### Risultato

- Toccare un club nella tab motoclub apre una schermata dettaglio (non la chat direttamente)
- La schermata mostra: nome club, tipo (brand/model), brand e modello, data creazione, numero iscritti
- Lista iscritti espandibile/collassabile (mostra avatar, nickname, userType)
- Icona/bottone ben visibile per aprire la chat del club

---
## #96 — Admin toggle: zavorrine nei motoclub

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-19 18:24:12 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Admin toggle: zavorrine nei motoclub

## What & Why
Il pannello admin deve permettere di abilitare/disabilitare la partecipazione automatica delle zavorrine ai motoclub. Quando abilitato (default), le zavorrine vengono aggiunte ai club che corrispondono alle moto nella loro wishlist — esattamente come i biker vengono aggiunti in base al garage. La flag in `app_settings` è sufficiente: non serve nessun job periodico perché l'infrastruttura esiste già.

**Nota tecnica importante (già investigata):**
- `server/routes/wishlist.ts` chiama già `createClubInvitesForMoto` al momento in cui una zavorrina aggiunge una moto alla wishlist (riga 165)
- Basta leggere la flag prima di quella chiamata
- Il toggle OFF deve rimuovere immediatamente le zavorrine dai club; il toggle ON deve creare gli invite per le wishlist esistenti

## Done looks like
- Nel pannello admin → Settings compare il toggle "Zavorrine incluse nei motoclub" (ON di default)
- Toggle ON: quando una zavorrina aggiunge una moto alla wishlist, riceve gli invite ai club corrispondenti (comportamento attuale, ora condizionato dalla flag)
- Toggle OFF: le iscrizioni attive e gli invite pendenti delle zavorrine vengono rimossi dal DB nel momento in cui si disabilita
- Toggle ON (riabilitazione): viene eseguita una scansione delle wishlist esistenti e vengono creati gli invite per le zavorrine già presenti nel sistema
- Il tutto avviene immediatamente alla pressione del toggle, nessun job asincrono visibile all'utente

## Out of scope
- Zavorrine che hanno aderito manualmente a un club (JOIN volontario): non vengono toccate dal toggle, solo quelle aggiunte tramite invite automatico basato su wishlist (distinzione: verificare se è realizzabile; se complicato, rimuovere tutte le zavorrine)
- Notifiche all'utente quando viene rimosso da un club per via del toggle admin
- Storico delle rimozioni

## Tasks
1. **Flag in app_settings** — Aggiungere la chiave `motoclub_include_zav` con valore default `"true"` alla tabella `

_(troncato)_

### Risultato

## Relevant files
- `app/admin/settings.tsx`
- `server/routes/admin.ts:1777-1820`
- `server/routes/wishlist.ts:164-165`

---
## #97 — Fix crash admin motoclub

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-19 19:54:31 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix crash pannello admin motoclub

## What & Why
Aprendo la sezione "Motoclub" nel pannello admin, l'app crasha con:
`TypeError: Cannot read property 'id' of null`

Il crash è in `app/admin/motoclubs.tsx` riga 353. Il Modal per il rifiuto di una richiesta club ha `visible={!!rejectModal}`, ma in React Native il contenuto del Modal viene renderizzato anche quando `visible=false`. Con il React Compiler attivo, la callback `onPress` che accede a `rejectModal!.id` viene eseguita durante il render — quando `rejectModal` è ancora `null`.

## Done looks like
- La schermata admin → Motoclub si apre senza crash
- Il modal di rifiuto richiesta funziona correttamente quando aperto
- Nessuna regressione sulle funzionalità esistenti (approvazione, rifiuto, navigazione al dettaglio)

## Out of scope
- Modifiche funzionali al pannello admin motoclub
- Modifiche ad altri componenti

## Tasks
1. **Guard condizionale sul Modal** — Wrappare il `<Modal>` di rifiuto in `{rejectModal && <Modal visible ...>...</Modal>}` così il contenuto non viene mai renderizzato quando `rejectModal` è `null`, eliminando il crash causato dal React Compiler.

## Relevant files
- `app/admin/motoclubs.tsx:331-362`

### Risultato

- La schermata admin → Motoclub si apre senza crash
- Il modal di rifiuto richiesta funziona correttamente quando aperto
- Nessuna regressione sulle funzionalità esistenti (approvazione, rifiuto, navigazione al dettaglio)

---
## #98 — Fix colonna mancante placement in ad_campaigns

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-19 20:14:49 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix colonna mancante `placement` in ad_campaigns

## What & Why

Creando o visualizzando campagne pubblicitarie dal pannello admin, l'app restituisce errore 500. Il log backend mostra:
```
column "placement" does not exist on relation "ad_campaigns"
```
La colonna `placement` è definita in `shared/schema.ts` ma non è mai stata aggiunta al DB con una migrazione. Tutti gli endpoint advertisement (GET lista, POST crea, PUT aggiorna) falliscono.

Dopo il fix, verificare anche il pannello admin "Match" (chiamate `/api/admin/matches` o simili) che non è stato controllato dopo le modifiche del Task #96.

## Done looks like
- Creazione di una campagna pubblicitaria va a buon fine (nessun errore 500)
- La lista campagne si carica nel pannello admin
- Il pannello admin dei match carica senza errori
- Nessuna regressione sulle funzionalità advertisement esistenti

## Out of scope
- Modifiche funzionali alle campagne pubblicitarie
- Nuove feature nel sistema advertisement

## Tasks
1. **Migrazione runtime `placement`** — Aggiungere `ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS placement VARCHAR(30) NOT NULL DEFAULT 'all'` nel punto corretto di `server/index.ts` (tra le altre migrazioni runtime), poi riavviare il backend.

2. **Verifica pannello match admin** — Aprire la sezione match nel pannello admin e controllare che non ci siano errori nei log. Se ci sono problemi, correggerli.

## Relevant files
- `shared/schema.ts:486-506`
- `server/index.ts`
- `server/routes/admin.ts:1000-1060`

### Risultato

- Creazione di una campagna pubblicitaria va a buon fine (nessun errore 500)
- La lista campagne si carica nel pannello admin
- Il pannello admin dei match carica senza errori
- Nessuna regressione sulle funzionalità advertisement esistenti

---
## #99 — Pulizia UX schermata Campagne (ex Advertisement)

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-19 20:33:16 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Pulizia UX schermata Campagne

## What & Why

Tre miglioramenti alla schermata advertisement del pannello admin:

1. **Rimuovere i banner di avviso** che dicono di disabilitare il sistema prima di caricare campagne. Il caricamento deve funzionare indipendentemente dallo stato del toggle ads-enabled. In `app/admin/ads.tsx` ci sono due banner da rimuovere: uno sempre visibile (riga 290-295) e uno che appare quando gli ads sono attivi (riga 317-324). Sbloccare anche il FAB "+" che era disabilitato e grigio quando adsEnabled=true — deve essere sempre cliccabile e colorato.

2. **Aggiungere pulsante Reload** nella toolbar della schermata campagne. All'interno di `<View style={styles.toolbar}>` (riga 326), aggiungere un pulsante icona "refresh" che al click invalida la query cache delle campagne admin, forzando un refetch della lista. Utile dopo aver caricato nuove campagne.

3. **Rinominare il tab** da "Advertisement" a "Campagne":
   - In `app/admin/index.tsx`: modificare il label del menu da "Advertisement" a "Campagne"
   - In `app/admin/_layout.tsx`: cambiare `title: "Advertisement"` in `title: "Campagne"`

## Done looks like
- Nessun banner di avviso giallo visibile nella schermata campagne
- Il pulsante "+" per aggiungere campagne è sempre attivo (non grigio)
- Un'icona refresh nella toolbar ricarica la lista campagne al tocco
- Il tab nel menu admin si chiama "Campagne"
- Il titolo della schermata è "Campagne"

## Out of scope
- Modifiche funzionali al sistema advertisement
- Modifiche al backend

## Tasks
1. **Rimuovere banner + sbloccare FAB** — Eliminare i due `View` con warning banner (warningBanner e adsBanner) e togliere la condizione che disabilitava il FAB in base a adsEnabled.

2. **Aggiungere pulsante Reload** — Aggiungere un bottone icona "refresh" nella toolbar che invalida la query key `/api/admin/advertisements` per forzare il refetch.

3. **Rinominare tab** — Cambiare label e title da "Advertisement" a "Campagne" nei file di layout admin.

## Rele

_(troncato)_

### Risultato

- Nessun banner di avviso giallo visibile nella schermata campagne
- Il pulsante "+" per aggiungere campagne è sempre attivo (non grigio)
- Un'icona refresh nella toolbar ricarica la lista campagne al tocco
- Il tab nel menu admin si chiama "Campagne"

---
## #100 — Ghost Mode utenti (modalità invisibile)

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-19 21:03:54 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Ghost Mode utenti (modalità invisibile)

## What & Why
Aggiungere un "ghost mode" (modalità invisibile) nel tab **Ride**, subito sotto il pulsante "Disponibile". Quando attivo, l'utente risulta offline per tutti gli altri — non appare nelle liste online, nei contatori né sul profilo altrui.

Logica di mutua esclusione:
- Se si preme **Disponibile → ON**: ghost mode va automaticamente **OFF**
- Se si attiva **Ghost Mode → ON**: isAvailable va automaticamente **OFF** (pulsante disponibile diventa rosso)

## Done looks like
- Nel tab Ride, subito sotto il grande pulsante disponibile, compare un blocco con:
  - Pulsante Ghost Mode di colore **grigio scuro** (`#444` o simile) con icona `eye-off`
  - Accanto o sotto il pulsante, una breve descrizione in **rosso** (es. "Risulti offline per tutti gli altri utenti")
- Attivando ghost mode: il pulsante disponibile si spegne e diventa rosso; l'utente scompare da liste/contatori online
- Ghost mode attivo: pulsante rimane grigio scuro, testo descrittivo rimane in rosso
- Premendo disponibile (per riattivarsi): ghost mode si spegne automaticamente
- Lo stato persiste tra sessioni (salvato lato server)
- Funziona nelle 5 lingue (IT/EN/DE/ES/FR)

## Design del blocco Ghost Mode
```
[ 👁‍🗨 Ghost Mode ]   ← pulsante grigio scuro (#3A3A3A o #444)
  Risulti offline per tutti gli altri utenti   ← testo rosso (Colors.accentRed), font piccolo
```
Il pulsante cambia icona (`eye` / `eye-off`) e può avere un bordo o cambio opacità quando attivo vs inattivo, ma rimane sempre di colore grigio scuro base.

## Out of scope
- Notifica agli altri utenti che sei in ghost mode
- Ghost mode visibile agli admin
- Visibilità parziale (es. visibile solo agli amici)
- Nessuna modifica al pannello admin

## Tasks

1. **Migrazione DB e schema** — Aggiungere colonna `ghost_mode BOOLEAN NOT NULL DEFAULT FALSE` alla tabella `users` tramite `ALTER TABLE users ADD COLUMN IF NOT EXISTS ghost_mode BOOLEAN NOT NULL DEFAULT false` in `server/index.ts` (stesso p

_(troncato)_

### Risultato

## Relevant files
- `shared/schema.ts`
- `server/index.ts`
- `server/routes/users.ts:260-300,315-570`

---
## #101 — Rimuovi placement 'match' dalle campagne admin

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-19 22:14:19 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Rimuovi placement 'match' dalle campagne admin

## What & Why
Il placement "match" non è più usato (SynecoAd rimosso dalla tab Match).
Va eliminato dai riferimenti nell'interfaccia admin campagne per evitare confusione.

## Done looks like
- PLACEMENT_LABELS: rimossa la voce `match: "Match"`
- PLACEMENT_CYCLE: ciclo diventa `all → home → all` (rimosso il passaggio match)
- useState type: da `"all" | "home" | "match"` a `"all" | "home"`
- Form "Posizionamento": rimossa l'opzione `{ key: "match", label: "Nei Match" }`

## Relevant files
- `app/admin/ads.tsx` (righe 49-59, 135, 403-407)

### Risultato

- PLACEMENT_LABELS: rimossa la voce `match: "Match"`
- PLACEMENT_CYCLE: ciclo diventa `all → home → all` (rimosso il passaggio match)
- useState type: da `"all" | "home" | "match"` a `"all" | "home"`
- Form "Posizionamento": rimossa l'opzione `{ key: "match", label: "Nei Match" }`

---
## #102 — Indicatore Online/Offline sulla mappa (con Ghost Mode)

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-19 22:38:05 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Aggiungi indicatore Online/Offline sulla mappa

## What & Why
Sulla mappa, sotto il badge "Disponibile/Non disponibile" dell'utente corrente,
aggiungere una riga "Online/Offline". Quando il ghost mode è attivo, l'utente
risulta Offline (anche visivamente per se stesso sulla mappa).

## Done looks like
- `InteractiveMap.tsx`: aggiunta prop `ghostMode?: boolean` all'interfaccia
- `InteractiveMap.tsx`: sotto il testo "Disponibile/Non disponibile" aggiunto
  un secondo dot+testo "Online" (verde) / "Offline" (grigio) basato su `!ghostMode`
- `app/(tabs)/index.tsx`: estratto `isGhostMode` da `profileQuery.data?.ghostMode`
- `app/(tabs)/index.tsx`: passato `ghostMode={isGhostMode}` ad entrambe le
  istanze di `InteractiveMap` (mappa piccola + mappa fullscreen)

## Logic
- `ghostMode = false` (default) → mostra "Online" in verde
- `ghostMode = true` → mostra "Offline" in grigio

## Relevant files
- `components/InteractiveMap.tsx` (righe 52-69 props, 319-330 indicatore)
- `app/(tabs)/index.tsx` (riga 354 isAvailable, righe 691-707 e 721-740 InteractiveMap)

### Risultato

- `InteractiveMap.tsx`: aggiunta prop `ghostMode?: boolean` all'interfaccia
- `InteractiveMap.tsx`: sotto il testo "Disponibile/Non disponibile" aggiunto
un secondo dot+testo "Online" (verde) / "Offline" (grigio) basato su `!ghostMode`
- `app/(tabs)/index.tsx`: estratto `isGhostMode` da `profileQuery.data?.ghostMode`

---
## #103 — Riavvia frontend e verifica indicatore Online/Offline sulla mappa

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-19 22:46:08 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Riavvia frontend e verifica Online/Offline sulla mappa

## What & Why
Il workflow Start Frontend è crashato dopo le modifiche al Task #102.
Il nuovo codice con l'indicatore Online/Offline non è stato caricato.
Serve riavviare il frontend per rendere visibili le modifiche.

## Done looks like
- Frontend riavviato e funzionante (porta 8081)
- Badge sulla mappa mostra due righe: "Disponibile/Non disponibile" e "Online/Offline"
- Nessun errore di bundle Metro


---
## #104 — Fix due bug Ghost Mode: toggle admin e reset al login

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-19 22:59:19 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix due bug Ghost Mode

## Bug 1 — Admin toggle Ghost Mode sempre "attiva"
**File**: `app/admin/settings.tsx` riga 1061

Il toggle usa `String(val)` (stringa) invece di `val` (boolean).
Poi alla riga 1581 il modal fa `protectedToggle.value ? "true" : "false"`:
la stringa `"false"` è truthy in JS, quindi manda SEMPRE "true" al backend.

**Fix**: cambiare riga 1061 da:
```typescript
value: String(val)
```
a:
```typescript
value: val
```

## Bug 2 — Ghost mode si resetta ad ogni login
**File**: `server/routes/auth.ts` riga 204

Il login imposta `isAvailable: true` senza controllare il ghost mode.
Quando l'utente aveva ghost mode attivo (isAvailable=false), il login
lo forza a true. Poi il frontend chiama PUT /profile/dynamic con
isAvailable=true, che triggera: `if (isAvailable === true) ghostMode = false`.

**Fix**: Nel login, verificare ghostMode prima di impostare isAvailable:
```typescript
const userRecord = await storage.getUser(user.id);
if (!userRecord?.ghostMode) {
  await storage.updateUserProfile(user.id, { isAvailable: true }).catch(() => {});
}
```

## Done looks like
- Il toggle admin Ghost Mode si abilita E si disabilita correttamente
- Dopo login, se l'utente aveva ghost mode attivo, rimane attivo (Offline)
- Backend e frontend allineati

## Relevant files
- `app/admin/settings.tsx` (riga 1061)
- `server/routes/auth.ts` (riga 204)

### Risultato

- Il toggle admin Ghost Mode si abilita E si disabilita correttamente
- Dopo login, se l'utente aveva ghost mode attivo, rimane attivo (Offline)
- Backend e frontend allineati

---
## #105 — Privacy Policy in 5 lingue + data ultimo aggiornamento fissa

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-20 09:20:44 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Privacy Policy in 5 lingue + data fissa

## Problema 1 — Privacy Policy solo in italiano
Il GDPR Art. 12 richiede che l'informativa sia fornita in modo
"intelligibile" nella lingua dell'utente. Attualmente esiste solo
la versione italiana in `app/privacy-policy.tsx` come
`DEFAULT_PRIVACY_POLICY`.

## Problema 2 — Data "ultimo aggiornamento" dinamica
Riga 20 di `app/privacy-policy.tsx`:
```typescript
Ultimo aggiornamento: ${new Date().toLocaleDateString(getCurrentLocale())}
```
Questa riga stampa la data di OGGI ogni volta che la pagina si apre.
La data deve essere FISSA (la data dell'ultima modifica reale).

## Done looks like
- In `app/privacy-policy.tsx`, `DEFAULT_PRIVACY_POLICY` viene rimpiazzato
  da un oggetto a chiave lingua (`PRIVACY_POLICIES`) con 5 versioni:
  `it`, `en`, `de`, `es`, `fr`
- La policy mostrata viene scelta in base a `getCurrentLocale()` /
  `useLocale()` — fallback a IT se lingua non trovata
- La data è fissa: **"20/03/2026"** (o equivalente localizzata per lingua)
- Le traduzioni devono essere fedeli al contenuto italiano (stessa struttura
  10 articoli, stessi dati di contatto privacy@bikerlink.app)

## Versioni da tradurre
Partire dall'italiano esistente e tradurre in:
- English (en)
- Deutsch (de)
- Español (es)
- Français (fr)

## Relevant files
- `app/privacy-policy.tsx` (righe 18-85: DEFAULT_PRIVACY_POLICY)
- `lib/language-context.tsx` (per useLocale hook)
- `lib/i18n.ts` (per getCurrentLocale)

### Risultato

- In `app/privacy-policy.tsx`, `DEFAULT_PRIVACY_POLICY` viene rimpiazzato
da un oggetto a chiave lingua (`PRIVACY_POLICIES`) con 5 versioni:
`it`, `en`, `de`, `es`, `fr`
- La policy mostrata viene scelta in base a `getCurrentLocale()` /

---
## #106 — Doppio consenso privacy alla registrazione (GDPR Art. 7)

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-20 09:20:44 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Doppio consenso privacy alla registrazione

## Problema
Il GDPR Art. 7(2) richiede che il consenso al trattamento dati sia
separato dall'accettazione dei termini di servizio. Non si possono
"bundlare" insieme (cosiddetto bundled consent = non valido).

Attualmente in `app/(auth)/register.tsx` Step 4:
- Un unico checkbox accetta EULA
- Un link "Privacy Policy" che apre la schermata privacy
- Non c'è consenso ESPLICITO alla privacy policy

## Done looks like
- In `renderStep4()` viene aggiunto un SECONDO checkbox separato
  sotto al primo, con testo "Ho letto e accetto la Privacy Policy"
  (o traduzione via useT() per ogni lingua)
- Nuovo state `privacyAccepted` (boolean, false di default)
- La validazione al submit (handleNext step 4) richiede ENTRAMBI:
  - `eulaAccepted` = true
  - `privacyAccepted` = true
- Il link "Privacy Policy" rimane cliccabile (router.push "/privacy-policy")
  e viene integrato nel testo del secondo checkbox (es. tappando "Privacy
  Policy" apre la policy, il resto del testo attiva/disattiva il check)
- Messaggio di errore separato se manca il consenso privacy

## Traduzioni necessarie
Aggiungere le chiavi i18n in tutti e 5 i file lingua:
- `register.step4.acceptPrivacy` → "Ho letto e accetto la [Privacy Policy]"
- `register.step4.privacyRequired` → "Devi accettare la Privacy Policy"

## Relevant files
- `app/(auth)/register.tsx` (riga 131 states, riga 205-215 validazione,
  riga 696-720 renderStep4)
- `lib/i18n/{it,en,de,es,fr}.ts` (aggiungere chiavi)

### Risultato

## Relevant files
- `app/(auth)/register.tsx` (riga 131 states, riga 205-215 validazione,
riga 696-720 renderStep4)
- `lib/i18n/{it,en,de,es,fr}.ts` (aggiungere chiavi)

---
## #107 — EULA localizzato in 5 lingue nella registrazione

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-20 09:45:43 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# EULA localizzato in 5 lingue nella registrazione

## Problema
`EULA_TEXT` in `app/(auth)/register.tsx` (righe 62-98) è una stringa
hardcoded solo in italiano. Cambiando la lingua dell'app, l'EULA rimane
in italiano mentre tutto il resto si traduce.

## Done looks like
- `EULA_TEXT` viene sostituita con un oggetto
  `EULA_TEXTS: Record<AppLanguage, string>` con 5 versioni:
  it, en, de, es, fr
- Dentro `renderStep4()`, l'EULA mostrata nel ScrollView viene selezionata
  con `EULA_TEXTS[getAppLanguage()] ?? EULA_TEXTS.it`
- Il contenuto di ogni traduzione è fedele all'originale italiano
  (stessi 9 articoli, stessi contatti support@bikerlink.app)

## Import necessari
`getAppLanguage` è già esportato da `@/lib/i18n` — nessuna modifica al sistema
di i18n. `AppLanguage` è già esportato dalla stessa lib.

## Relevant files
- `app/(auth)/register.tsx` (righe 62-98: EULA_TEXT costante, riga ~707: uso)
- `lib/i18n.ts` (getAppLanguage, AppLanguage — solo lettura)

### Risultato

- `EULA_TEXT` viene sostituita con un oggetto
`EULA_TEXTS: Record<AppLanguage, string>` con 5 versioni:
it, en, de, es, fr
- Dentro `renderStep4()`, l'EULA mostrata nel ScrollView viene selezionata

---
## #108 — Privacy Policy accessibile dalla landing page pubblica + nota hosting

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-20 09:45:43 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Privacy Policy accessibile dalla landing page pubblica + nota hosting

## Problema 1 — Policy non raggiungibile senza login
La privacy policy esiste solo come schermata in-app (route Expo `/privacy-policy`).
Chi visita il sito pubblico (porta 5000) non può leggere la policy senza
scaricare l'app.

## Problema 2 — Testo policy non accurato sull'hosting
La policy attuale (IT/EN/DE/ES/FR in app/privacy-policy.tsx) afferma:
"I dati non saranno trasferiti a terzi al di fuori dell'Unione Europea
senza adeguate garanzie di protezione."
Ma Replit (il provider di hosting) usa infrastruttura cloud USA.
Il testo va aggiornato per riflettere la realtà con le garanzie corrette.

## Done looks like

### Landing page (HTML)
- Nel footer di `server/templates/landing-page.html` viene aggiunto un link
  al testo: "Privacy Policy" che punta a `/privacy-policy`

### Nuova rotta backend GET /privacy-policy
- In `server/routes.ts` (o `server/index.ts`), aggiungere prima del middleware
  catch-all una rotta `app.get("/privacy-policy", ...)` che serve un file
  HTML statico: `server/templates/privacy-policy.html`
- La pagina HTML è semplice e in linea con lo stile della landing page
  (sfondo scuro #0D0D0D, font di sistema, stile identico alla landing)
- Il testo è la versione italiana della policy (lingua principale del sito
  pubblico), con aggiunta della nota hosting al punto 6 (vedi sotto)

### Aggiornamento testo policy — punto 6 (condivisione terzi)
In TUTTE e 5 le versioni lingua in `app/privacy-policy.tsx`, al punto 6
aggiungere dopo la frase esistente sui dati fuori UE:
- IT: "I dati vengono elaborati su infrastruttura cloud che può essere
  situata al di fuori dello Spazio Economico Europeo. In tali casi, il
  trasferimento è regolato dalle Clausole Contrattuali Standard approvate
  dalla Commissione Europea ai sensi dell'art. 46 GDPR."
- (Equivalenti nelle altre 4 lingue)

## Relevant files
- `server/templates/landing-page.html` (footer — aggiungere link)
- `server/templates/p

_(troncato)_

### Risultato

### Landing page (HTML)
- Nel footer di `server/templates/landing-page.html` viene aggiunto un link
al testo: "Privacy Policy" che punta a `/privacy-policy`

---
## #109 — Tracciabilità consensi GDPR nel database

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-20 11:00:23 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Tracciabilità consensi GDPR nel database

## What & Why
Il consenso alla Privacy Policy viene validato solo lato app ma non viene
salvato nel database. Questo viola il GDPR art. 7: il titolare deve poter
dimostrare che il consenso è stato prestato (onere della prova). Serve anche
un timestamp che registri *quando* è stato dato il consenso. Infine, la
verifica dell'età minima (18 anni) esiste solo nel frontend e può essere
bypassata chiamando l'API direttamente.

## Done looks like
- Nel database, nella tabella `users`, esistono due nuovi campi:
  `privacy_accepted` (boolean, default false) e `consent_accepted_at`
  (timestamp, nullable — viene valorizzato al momento della registrazione)
- Al momento della registrazione, entrambi i campi vengono salvati:
  `eula_accepted = true`, `privacy_accepted = true`,
  `consent_accepted_at = NOW()`
- L'endpoint di registrazione rifiuta con errore 400 se l'anno di nascita
  fornito indica un'età inferiore a 18 anni (controllo lato server)
- L'export dati (`GET /api/user/export-data`) include i nuovi campi:
  `privacyAccepted`, `consentAcceptedAt`, e il vero `createdAt`
  dell'account (non più `null` hardcoded)

## Out of scope
- Nessuna modifica all'interfaccia utente di registrazione (i checkbox
  esistono già e funzionano)
- Nessuna modifica alla policy testuale

## Tasks
1. **Schema DB** — Aggiungere i campi `privacy_accepted` (boolean not null
   default false) e `consent_accepted_at` (timestamp nullable) alla tabella
   `users` in `shared/schema.ts`. Eseguire `npm run db:push` per applicare
   la migrazione.

2. **Endpoint registrazione** — In `server/routes/auth.ts`, aggiornare la
   route POST di registrazione per salvare `privacy_accepted: true` e
   `consent_accepted_at: new Date()` al momento della creazione utente.
   Aggiungere il controllo server-side: se `birthYear` è presente e
   `currentYear - birthYear < 18`, restituire 400.

3. **Export dati** — In `server/routes.ts`, nel handler
   `GET /api/user/export-dat

_(troncato)_

### Risultato

## Relevant files
- `shared/schema.ts:20-55`
- `server/routes/auth.ts`
- `server/routes.ts:497-525`

---
## #110 — Export dati completo (GDPR art. 20)

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-20 11:00:23 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Export dati completo (GDPR art. 20)

## What & Why
L'endpoint `GET /api/user/export-data` attualmente esporta solo i dati
del profilo di base, con `createdAt: null` hardcoded. Il GDPR art. 20
(diritto alla portabilità) richiede che l'export contenga tutti i dati
personali forniti dall'utente: messaggi, foto, percorsi GPS registrati,
partecipazione al contest, dati account completi.

## Done looks like
- `GET /api/user/export-data` restituisce un JSON strutturato che include:
  - **Profilo**: tutti i campi dell'utente inclusi `createdAt` reale,
    `eulaAccepted`, `privacyAccepted`, `consentAcceptedAt`
  - **Messaggi inviati**: lista delle chat con timestamp e contenuto
    (solo i messaggi di cui l'utente è mittente)
  - **Foto caricate**: lista degli URL delle foto caricate dall'utente
  - **Percorsi GPS**: lista dei percorsi registrati con nome, distanza,
    data di inizio e fine
  - **Contest**: lista delle foto inviate al contest con data e voti ricevuti
- Il file scaricato mantiene il nome `BikerLink-UserData-{nickname}-{data}.json`
- L'export funziona per utenti reali; gli utenti fake ottengono lo stesso
  export (nessuna esclusione speciale)

## Out of scope
- Export in formato CSV o PDF (solo JSON)
- Esportazione dei dati di altri utenti (solo dati dell'utente autenticato)
- Esportazione delle sessioni o dei cookie

## Tasks
1. **Raccolta dati aggiuntivi** — Interrogare il database per recuperare,
   per l'utente autenticato: messaggi di chat inviati, foto del profilo,
   percorsi GPS, partecipazioni al contest.

2. **Aggiornamento export endpoint** — Aggiornare `GET /api/user/export-data`
   in `server/routes.ts` per includere tutti i dati raccolti nella struttura
   JSON, correggendo anche il campo `createdAt: null` con il valore reale
   dall'oggetto utente.

## Relevant files
- `server/routes.ts:497-525`
- `server/storage.ts`
- `shared/schema.ts`

### Risultato

## Relevant files
- `server/routes.ts:497-525`
- `server/storage.ts`
- `shared/schema.ts`

---
## #111 — Revoca consenso e aggiornamento testo policy

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-20 11:00:23 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Revoca consenso e aggiornamento testo policy

## What & Why
Due requisiti GDPR rimasti aperti:
1. **GDPR art. 7 comma 3**: il consenso deve poter essere ritirato in
   qualsiasi momento con la stessa facilità con cui è stato prestato.
   Attualmente nell'app non esiste una voce esplicita "Revoca consenso";
   esiste solo "Elimina account" che fa la stessa cosa ma senza collegamento
   chiaro al diritto di revoca.
2. **Testo policy incompleto**: il punto 2 ("Dati raccolti") della policy
   non elenca tutti i dati effettivamente raccolti: mancano anno di nascita,
   paese, regione, tipo utente.

## Done looks like
- Nella schermata Profilo > sezione documenti/privacy, compare una voce
  "Revoca consenso al trattamento dati" con icona dedicata
- Toccandola, appare una spiegazione che: (a) il trattamento si basa
  esclusivamente sul consenso dell'utente; (b) revocare il consenso
  comporta la cancellazione dell'account entro 30 giorni; (c) il processo
  è lo stesso di "Elimina account" — con conferma esplicita
- La revoca esegue lo stesso endpoint di richiesta cancellazione già
  esistente (`POST /api/users/me/request-deletion`), nessuna nuova API
- In `app/privacy-policy.tsx`, al punto 2 ("Dati raccolti") vengono
  aggiunti: anno di nascita, paese, regione, tipo utente (biker/zavorrina/coppia)
- Lo stesso aggiornamento viene fatto nel file HTML pubblico
  `server/templates/privacy-policy.html`
- Le traduzioni della voce "Revoca consenso" sono disponibili in tutte
  e 5 le lingue (IT/EN/DE/ES/FR) nei file i18n

## Out of scope
- Nessuna nuova API backend (si riutilizza request-deletion)
- Nessuna modifica alla logica di cancellazione (già funzionante)
- Nessuna modifica all'EULA

## Tasks
1. **Voce "Revoca consenso" nel profilo** — Aggiungere nella schermata
   profilo, vicino a "Elimina account", una voce "Revoca consenso" che
   apre un modale esplicativo e, alla conferma, chiama
   `POST /api/users/me/request-deletion`. Aggiungere le chiavi i18n
   necessarie in tu

_(troncato)_

### Risultato

## Relevant files
- `app/(tabs)/profile.tsx:371-395,811`
- `app/privacy-policy.tsx:29-37`
- `server/templates/privacy-policy.html:80-115`

---
## #112 — EAS Build — Genera APK Android

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-20 11:34:40 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# EAS Build — Genera APK Android

## What & Why
Lanciare il primo build APK Android tramite EAS Build usando le credenziali Expo dell'utente (EXPO_TOKEN). Il file eas.json e app.json sono già configurati (Task #17).

## Done looks like
- `EXPO_TOKEN` salvato come secret Replit
- Progetto collegato all'account Expo (`eas init` o `projectId` in app.json)
- Build avviato con `eas build --platform android --profile preview`
- URL del build condiviso con l'utente (link expo.dev per scaricare l'APK)

## Out of scope
- Build iOS
- Upload su Play Store
- Nessuna modifica al codice dell'app

## Tasks
1. **Salva EXPO_TOKEN come secret** — Richiedere il token dall'utente tramite il sistema secrets, oppure usare quello già fornito in chat.
2. **Installa eas-cli e collega il progetto** — Installare globalmente `eas-cli`, configurare `EXPO_TOKEN`, eseguire `eas whoami` per verificare l'autenticazione, poi `eas init` per collegare il progetto all'account.
3. **Avvia il build** — Eseguire `eas build --platform android --profile preview --non-interactive` e condividere con l'utente il link expo.dev per seguire il progresso e scaricare l'APK.

## Relevant files
- `eas.json`
- `app.json`

### Risultato

- `EXPO_TOKEN` salvato come secret Replit
- Progetto collegato all'account Expo (`eas init` o `projectId` in app.json)
- Build avviato con `eas build --platform android --profile preview`
- URL del build condiviso con l'utente (link expo.dev per scaricare l'APK)

---
## #113 — Fix Gradle error e rilancia build APK

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-20 12:38:59 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix Gradle Error e Rilancia Build APK

## What & Why
Il build EAS Android (ID: 740e5271) è fallito con `EAS_BUILD_UNKNOWN_GRADLE_ERROR`. La causa è `newArchEnabled: true` in app.json — la New React Native Architecture non è compatibile con alcuni pacchetti nativi presenti nell'app (react-native-keyboard-controller, react-native-worklets, react-native-maps).

## Done looks like
- `app.json` ha `newArchEnabled: false`
- `react-native-maps` pinnato a esattamente `"1.18.0"` (senza `^`)
- Nuovo build EAS avviato con successo (`eas build --platform android --profile preview --non-interactive`)
- Link build expo.dev condiviso con l'utente

## Out of scope
- Modifiche al codice dell'app
- Build iOS
- Upload Play Store

## Tasks
1. **Fix app.json** — Impostare `newArchEnabled: false`. Correggere `react-native-maps` da `"^1.18.0"` a `"1.18.0"` (rimuovere il caret).
2. **Rilancia EAS Build** — Eseguire `eas build --platform android --profile preview --non-interactive` con `EXPO_TOKEN` e condividere il link expo.dev con l'utente.

## Relevant files
- `app.json`
- `package.json`
- `eas.json`

### Risultato

- `app.json` ha `newArchEnabled: false`
- `react-native-maps` pinnato a esattamente `"1.18.0"` (senza `^`)
- Nuovo build EAS avviato con successo (`eas build --platform android --profile preview --non-interactive`)
- Link build expo.dev condiviso con l'utente

---
## #114 — Fix dipendenze Expo SDK 54 + build APK

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-20 12:57:30 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix Dipendenze Expo SDK 54 — Sblocca Build APK

## What & Why
Il build APK su EAS fallisce (EAS_BUILD_UNKNOWN_GRADLE_ERROR) perché diverse dipendenze native hanno versioni incompatibili con Expo SDK 54. `expo doctor` ha identificato 4 major version mismatch che rendono il codice nativo incompilabile via Gradle.

## Done looks like
- `npx expo-doctor` non riporta più major version mismatch
- Un nuovo build EAS (profilo `preview`) viene avviato e completa con successo
- Un APK scaricabile è disponibile su expo.dev

## Out of scope
- Cambiare la versione di Expo SDK (rimane 54)
- Aggiungere nuove funzionalità
- Build iOS

## Tasks

1. **Correggere major version mismatch** — Reinstallare con le versioni corrette per Expo SDK 54:
   - `expo-document-picker: ~14.0.8` (era 55.0.8, pacchetto SDK 55 incompatibile)
   - `expo-sharing: ~14.0.8` (era 55.0.11, pacchetto SDK 55 incompatibile)
   - `@react-native-async-storage/async-storage: 2.2.0` (era 3.0.1, major mismatch)
   - `@expo/vector-icons: ^15.0.3` (era 14.0.4, major mismatch + duplicato)
   - Rimuovere `react-native-worklets: 0.5.1` (bundled in react-native-reanimated 4.x, potenziale conflitto nativo)

2. **Pulizia dipendenze** — Rimuovere `eas-cli` dalle dipendenze di progetto (deve essere usato via `npx`, non installato localmente); aggiungere `react-native-maps` a `expo.install.exclude` in `package.json` per la versione intenzionalmente pinnata a 1.18.0.

3. **Rilancio build EAS** — Dopo le correzioni, eseguire `EXPO_TOKEN=$EXPO_TOKEN npx eas build --platform android --profile preview --non-interactive` e aggiornare `eas-build-log.txt` con il nuovo build ID e URL.

## Nota critica
- `react-native-maps` deve rimanere pinnato a esattamente `1.18.0` (compatibilità Expo Go). Non aggiornare.
- `newArchEnabled: false` in `app.json` — non modificare.
- Verificare con `npx expo-doctor` dopo le reinstallazioni prima di lanciare EAS.

## Relevant files
- `package.json`
- `app.json`
- `eas.json`
- `eas-build-log.txt`

### Risultato

- `npx expo-doctor` non riporta più major version mismatch
- Un nuovo build EAS (profilo `preview`) viene avviato e completa con successo
- Un APK scaricabile è disponibile su expo.dev

---
## #115 — Fix EXPO_PUBLIC_DOMAIN nel build APK

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-03-20 14:15:52 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix EXPO_PUBLIC_DOMAIN nel build EAS

  ## What & Why
  L'APK Android prodotto dal build #5 mostra l'errore "EXPO_PUBLIC_DOMAIN is not set" appena avviato. In sviluppo su Replit, la variabile viene iniettata automaticamente dallo script di avvio (`$REPLIT_DEV_DOMAIN:5000`). Nel build EAS però nessuna env var viene configurata, quindi `lib/query-client.ts` lancia un errore e l'app non riesce a contattare il backend.

  La soluzione è aggiungere la variabile `EXPO_PUBLIC_DOMAIN=biker-link.replit.app` direttamente in `eas.json` per entrambi i profili `preview` e `production`, poi rilanciare il build.

  ## Done looks like
  - L'APK Android si avvia senza errori
  - Login e tutte le funzioni che chiamano il backend funzionano correttamente sul dispositivo fisico
  - Il build EAS produce un nuovo APK con la variabile inclusa

  ## Out of scope
  - Modifiche al codice di `lib/query-client.ts` (la logica è corretta, manca solo la configurazione)
  - Supporto a URL backend diversi per profili diversi (si usa sempre la produzione)

  ## Tasks
  1. **Aggiungi env var in eas.json** — Aggiungere `"env": { "EXPO_PUBLIC_DOMAIN": "biker-link.replit.app" }` a entrambi i profili `preview` e `production` in `eas.json`.

  2. **Rilancia il build EAS** — Eseguire un nuovo build APK con profilo `preview` tramite `npx eas-cli@latest` e aggiornare `eas-build-log.txt` con il nuovo ID e link download.

  ## Relevant files
  - `eas.json`
  - `lib/query-client.ts:7-17`
  - `eas-build-log.txt`

### Risultato

## Relevant files
- `eas.json`
- `lib/query-client.ts:7-17`
- `eas-build-log.txt`

---
## #116 — Fix crash APK: disabilita New Arch + development build

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-20 17:39:58 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix crash APK: newArchEnabled:false + development build

  ## What & Why
  L'APK crasha all'avvio sul dispositivo fisico. La causa root è un conflitto tra due librerie native:
  - `react-native-reanimated 4.x` richiede `newArchEnabled: true`
  - `react-native-keyboard-controller 1.18.5` (avvolge tutta l'app nel root layout come `KeyboardProvider`) crasha su dispositivi fisici Android con New Architecture attiva

  La soluzione è tornare a `newArchEnabled: false` e fare il downgrade di reanimated a 3.x (che funziona con old arch), poi compilare un APK di tipo **development** (con expo-dev-client) per poter analizzare eventuali errori residui direttamente dai log.

  ## Done looks like
  - `newArchEnabled: false` in app.json
  - `react-native-reanimated: ~3.19.5` (old arch compatible)
  - `react-native-worklets` rimosso (era peer dep esclusiva di reanimated 4.x)
  - `expo-dev-client` installato
  - Profilo `development` in eas.json con `developmentClient: true` e `EXPO_PUBLIC_DOMAIN`
  - `expo-doctor` ritorna 17/17 (con reanimated in expo.install.exclude)
  - Build EAS con `--clear-cache` lanciato, log analizzati, nessun errore fatale
  - Link APK development disponibile

  ## Out of scope
  - Upgrade di react-native-keyboard-controller a versione 2.x (è la futura soluzione per New Arch, ma richiede refactoring dei componenti)
  - Test funzionali completi dell'app sull'APK

  ## Tasks
  1. **Reset dipendenze confliggenti** — Impostare `newArchEnabled: false`, fare downgrade di react-native-reanimated a ~3.19.5, rimuovere react-native-worklets, aggiornare expo.install.exclude per includere react-native-reanimated.

  2. **Setup development build** — Installare expo-dev-client, aggiungere profilo `development` in eas.json con developmentClient: true, distribution: internal, android buildType: apk, e EXPO_PUBLIC_DOMAIN.

  3. **Build + analisi log** — Lanciare il build EAS con --clear-cache e --profile development, monitorare il completamento, scaricare e analizzare i 

_(troncato)_

### Risultato

## Relevant files
- `app.json:10`
- `eas.json`
- `package.json`

---
## #117 — Fix APK: moduli nativi + preview build

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-20 19:37:32 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix moduli nativi mancanti + nuovo APK

## What & Why
Il development APK (build #7) mostra 8 errori "Cannot find native module" all'avvio sul dispositivo fisico. I moduli Expo che funzionavano in Expo Go (pre-bundled) vanno dichiarati esplicitamente nel build nativo.

Due errori confermati dagli screenshot: ExpoScreenOrientation (expo-screen-orientation) ed ExpoCamera (expo-camera). Gli altri 6 sono sconosciuti perché l'app crasha prima di mostrarli tutti.

Strategia: installare i moduli mancanti noti + passare da development build a **preview build** (APK standalone senza expo-dev-client) che è più stabile e non ha problemi di inizializzazione del launcher.

## Done looks like
- APK Android installabile e avviabile senza errori "Cannot find native module"
- Schermata login/splash visibile al primo avvio
- Feature principali funzionanti sul dispositivo fisico (login, mappa, match, profilo, garage)
- Link APK scaricabile da EAS Build

## Out of scope
- Fix di bug funzionali (matching, chat, ecc.)
- Ottimizzazioni performance
- Build iOS

## Tasks

1. **Installa moduli nativi mancanti** — Aggiungere expo-screen-orientation e expo-camera come dipendenze esplicite in package.json. Aggiungere anche expo-file-system esplicitamente (usato in profile.tsx, già in node_modules come dep transitivo di expo ma non dichiarato in package.json). Verificare con expo-doctor che tutto passi.

2. **Cambia a preview build** — Usare il profilo `preview` in eas.json (crea APK standalone senza expo-dev-client, evita i problemi di inizializzazione del launcher). Verificare che il profilo preview in eas.json abbia: distribution "internal", EXPO_PUBLIC_DOMAIN, android.buildType "apk".

3. **Lancia build EAS e fornisci APK** — Eseguire il build con profilo preview e --clear-cache. Monitorare e fornire il link APK al completamento.

## Note tecniche critiche
- OBBLIGATORIO mantenere: newArchEnabled: false, react-native-reanimated ~3.19.5, react-native-maps 1.18.0 in expo.install.exclude
- Com

_(troncato)_

### Risultato

- APK Android installabile e avviabile senza errori "Cannot find native module"
- Schermata login/splash visibile al primo avvio
- Feature principali funzionanti sul dispositivo fisico (login, mappa, match, profilo, garage)
- Link APK scaricabile da EAS Build

---
## #118 — Audit + APK Android preview build

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-20 21:33:30 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Audit dipendenze + APK Android Preview Build

  ## What & Why
  Audit completo del codebase superato senza problemi critici. Tutte le dipendenze native mancanti sono già state installate (expo-camera, expo-screen-orientation, expo-file-system). Il piano aggiornato EAS è disponibile. Lanciare il build preview APK.

  ## Audit risultato (tutto OK)
  - Tutte le dipendenze dichiarate e installate
  - Import @/ e @shared/ tutti validi (import type — sicuro per Metro)
  - MapPickerModal corretto (platform-specific .native.tsx / .web.tsx)
  - Patch expo-asset corretta (versione 12.0.12)
  - Tutti gli asset app.json esistono
  - Tutte le 5 lingue (it/en/de/es/fr) presenti
  - Nessun URL hardcoded nel codice
  - babel.config.js e metro.config.js corretti

  ## Done looks like
  - Build EAS preview completato con successo
  - Link APK scaricabile fornito all'utente
  - Nessun errore "Cannot find native module"

  ## Tasks

  1. **Lancia EAS preview build** — Eseguire il build con profilo preview e --clear-cache. Monitorare il completamento e fornire il link APK diretto.

  ## Note tecniche
  - Comando: EXPO_TOKEN=$EXPO_TOKEN EAS_SKIP_AUTO_FINGERPRINT=1 npx eas-cli@latest build --platform android --profile preview --clear-cache --non-interactive
  - Account: andreamasteri, progetto: @andreamasteri/bikerlink
  - Profilo: preview (APK standalone, no expo-dev-client launcher)
  - newArchEnabled: false OBBLIGATORIO
  - react-native-reanimated ~3.19.5, react-native-maps 1.18.0 in expo.install.exclude

  ## Relevant files
  - `eas.json`
  - `package.json`
  - `app.json`

### Risultato

## Relevant files
- `eas.json`
- `package.json`
- `app.json`

---
## #119 — Fix matching engine — da loop continuo a trigger on-demand

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-20 22:41:32 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

Backend: sostituire il loop continuo del matching con un sistema on-demand. Nuova funzione `triggerMatchingRun()` con debounce 5min. Endpoint autenticato `POST /api/matching/trigger`. FakeZavorrina e cleanup restano su timer. Redeploy immediato → risolve admin server error.


---
## #120 — Fix APK crash + trigger matching da frontend + verifica + Build #9

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-20 22:41:32 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

Fix reactCompiler:true da app.json + trigger matching dopo login. STEP 1: modifiche codice. STEP 2: verifica su Expo Go (login admin + testolo1 senza crash, matching trigger nei log). STEP 3: solo se verifica OK → Build #9 EAS preview.


---
## #121 — Fix crash Expo Go — reanimated incompatibile in splash.tsx

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-21 00:09:07 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix crash Expo Go — reanimated incompatibile

## What & Why
`splash.tsx` usa `react-native-reanimated 3.19.5`, ma Expo Go per SDK 54 ha nel bundle
una versione nativa del modulo più vecchia. Quando il JS prova a caricare `useSharedValue`,
`useAnimatedStyle` ecc., il `ReanimatedModule` nativo lancia `NullPointerException` e l'app
crasha all'avvio con 15+ log identici. L'effetto cascata produce anche un secondo errore
`useAuth must be used within an AuthProvider` in `welcome.tsx`.

`splash.tsx` è l'UNICO file dell'intera app che importa da `react-native-reanimated`.
Le animazioni necessarie (opacity, translateY, scale) sono tutte supportate dal `Animated`
nativo di React Native, già usato correttamente in `welcome.tsx`.

## Done looks like
- Expo Go apre l'app senza errori `ReanimatedModule NullPointerException`
- La splash screen animata si carica e naviga al login dopo 3 secondi
- Nessun `useAuth must be used within an AuthProvider` in console
- Web preview funziona invariato (usa già `Platform.OS === "web"` guard su web)
- Pronto per Build #9 APK EAS preview

## Out of scope
- Downgrade globale di react-native-reanimated (non necessario, nessun altro file lo usa)
- Modifiche ad altri file oltre splash.tsx
- Build APK #9 (step separato, dopo verifica Expo Go)

## Tasks
1. **Sostituire reanimated con Animated nativo in splash.tsx** — Rimuovere tutti gli import
   da `react-native-reanimated` e riscrivere le 6 animazioni (`bgOpacity`, `overlayOpacity`,
   `titleTranslateY`/`Opacity`/`Scale`, `taglineOpacity`/`TranslateY`, `glowOpacity`) usando
   `useRef(new Animated.Value(0))` + `Animated.timing`/`Animated.sequence`/`Animated.parallel`
   da `react-native`. Convertire `useAnimatedStyle` in stili inline su `Animated.View`.
   Verificare che `AnimatedImageBackground` usi `Animated.createAnimatedComponent` da RN.

2. **Verifica Expo Go + lancio Build #9** — Testare su Expo Go che la splash appare,
   anima e naviga al login senza errori. Se OK, lanciare il build EAS p

_(troncato)_

### Risultato

- Expo Go apre l'app senza errori `ReanimatedModule NullPointerException`
- La splash screen animata si carica e naviga al login dopo 3 secondi
- Nessun `useAuth must be used within an AuthProvider` in console
- Web preview funziona invariato (usa già `Platform.OS === "web"` guard su web)

---
## #122 — Fix AuthProvider smontato durante inizializzazione font

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-21 00:27:42 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix AuthProvider smontato durante inizializzazione font

## What & Why
In `_layout.tsx` riga 163, `if (!ready) return null` smonta l'intero albero React — compresi
tutti i provider (AuthProvider, QueryClientProvider, ecc.) — mentre i font sono in caricamento.
Expo Router riesce comunque a rendere `welcome.tsx` attraverso il suo sistema interno di routing,
e quella schermata chiama `useAuth()` trovando nessun AuthProvider → "useAuth must be used
within an AuthProvider" crash.

La fix: i provider devono essere SEMPRE montati. Solo il contenuto di navigazione
(LanguageKeyedRoot + AppStateHandler) deve aspettare che `ready` sia true.
Il native splash screen rimane visibile durante l'attesa (SplashScreen.preventAutoHideAsync
è già chiamato e hideAsync viene chiamato solo quando ready=true).

## Done looks like
- Expo Go apre l'app senza errori "useAuth must be used within an AuthProvider"
- La splash animata si carica e naviga al login dopo 3 secondi
- Login admin e testolo1 funzionano senza crash
- Pronto per Build #9 APK EAS preview

## Out of scope
- Modifiche alla logica di font loading (tenere il timeout 5s)
- Modifiche a welcome.tsx, auth-context.tsx o altri file oltre _layout.tsx
- Build APK #9 (step separato dopo verifica)

## Tasks
1. **Spostare il guard `if (!ready)` dentro la navigazione** — In `_layout.tsx`, rimuovere
   `if (!ready) return null` dal RootLayout e invece condizionare solo il rendering di
   `AppStateHandler` e `LanguageKeyedRoot` all'interno dei provider già montati.
   I provider ErrorBoundary, LanguageProvider, QueryClientProvider, AuthProvider,
   LocationProvider devono sempre renderizzare, indipendentemente da `ready`.

## Relevant files
- `app/_layout.tsx:138-179`

### Risultato

- Expo Go apre l'app senza errori "useAuth must be used within an AuthProvider"
- La splash animata si carica e naviga al login dopo 3 secondi
- Login admin e testolo1 funzionano senza crash
- Pronto per Build #9 APK EAS preview

---
## #123 — Fix ReanimatedModule NullPointerException — rimuovere react-native-keyboard-controller

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-21 00:29:59 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix ReanimatedModule NullPointerException — react-native-keyboard-controller

## What & Why
`react-native-keyboard-controller` usa `react-native-reanimated` internamente.
Con la configurazione attuale (newArchEnabled: false, Expo Go), l'inizializzazione nativa di
reanimated crasha con NullPointerException ogni volta che un modulo che importa
react-native-keyboard-controller viene caricato.

Risultato: 13 errori identici "Exception in HostObject::get for prop 'ReanimatedModule'"
al caricamento dell'app in Expo Go, provenienti dai 10 file che importano questa libreria.

La fix è meccanica: sostituire tutte le occorrenze di KeyboardAvoidingView da
react-native-keyboard-controller con quella nativa di react-native, e rimuovere
KeyboardProvider da _layout.tsx.

## Done looks like
- 0 errori "ReanimatedModule NullPointerException" in Expo Go
- La tastiera si comporta normalmente nelle schermate di chat, contest, admin
- Pronto per Build #9 APK EAS preview (insieme al fix del task #122)

## Out of scope
- Non modificare la logica di chat, contest, moderator, admin oltre all'import della libreria
- Non installare/rimuovere pacchetti (la libreria può rimanere installata, basta non usarla)
- Build APK #9 (step separato)

## Tasks

### 1. Rimuovere KeyboardProvider da _layout.tsx
- File: `app/_layout.tsx`
- Rimuovere `import { KeyboardProvider } from "react-native-keyboard-controller"`
- Rimuovere il wrapper `<KeyboardProvider>...</KeyboardProvider>` (tenere il contenuto)

### 2. Sostituire KeyboardAvoidingView in tutti i file interessati
Per ciascuno dei seguenti file, sostituire:
```
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
```
con:
```
import { KeyboardAvoidingView } from "react-native";
```
File:
- `app/(tabs)/chat.tsx:14`
- `app/(tabs)/contest.tsx:16`
- `app/chat/[id].tsx:15`
- `app/moderator/index.tsx:14`
- `app/admin/workshops.tsx:3`
- `app/admin/performance.tsx:3`
- `app/admin/easter-eggs.tsx:3`
- `app/admin/fake-users.tsx:15`
- `app/a

_(troncato)_

### Risultato

- 0 errori "ReanimatedModule NullPointerException" in Expo Go
- La tastiera si comporta normalmente nelle schermate di chat, contest, admin
- Pronto per Build #9 APK EAS preview (insieme al fix del task #122)

---
## #124 — Build #9 APK EAS preview — con --clear-cache

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-21 00:32:21 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Build #9 APK EAS preview

## What & Why
Avviare la Build #9 dell'APK Android con EAS usando il profilo "preview" e --clear-cache.
Tutte le correzioni necessarie sono già applicate:
- Task #119: matching engine on-demand (no loop infinito)
- Task #120: reactCompiler rimosso, trigger matching dal login
- Task #121: splash.tsx reanimated crash rimosso

Le librerie native (react-native-keyboard-controller, react-native-reanimated) che crashano
in Expo Go funzionano correttamente nell'APK perché EAS le compila e le include nel pacchetto.

## Done looks like
- Il comando EAS build viene lanciato senza errori
- L'agent monitora i log e conferma che il build è in coda/running
- L'utente riceve l'URL del download dell'APK
- Nessun errore di build configuration (eas.json, app.json, EXPO_TOKEN)

## Build command
```bash
EXPO_TOKEN=$EXPO_TOKEN EAS_SKIP_AUTO_FINGERPRINT=1 npx eas-cli@latest build \
  --platform android \
  --profile preview \
  --clear-cache \
  --non-interactive
```

## Config check prima del build
- app.json: `newArchEnabled: false` ✅, no `reactCompiler` ✅
- eas.json: profilo preview con `EXPO_PUBLIC_DOMAIN=biker-link.replit.app` ✅
- package.json: `react-native-reanimated` in expo.install.exclude ✅
- EXPO_TOKEN in Replit secrets ✅

## Relevant files
- `app.json`
- `eas.json`
- `package.json`

### Risultato

- Il comando EAS build viene lanciato senza errori
- L'agent monitora i log e conferma che il build è in coda/running
- L'utente riceve l'URL del download dell'APK
- Nessun errore di build configuration (eas.json, app.json, EXPO_TOKEN)

---
## #125 — Startup sequenziale robusto — StartupGate + rimozione keyboard-controller

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-21 00:40:14 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Startup sequenziale robusto — StartupGate + rimozione keyboard-controller

## Sostituisce task #122 e #123

## What & Why
Due crash in Expo Go con la stessa radice: dipendenze non compatibili che si attivano
troppo presto nella sequenza di avvio.

**Crash 1 — AuthProvider (task #122)**:
`_layout.tsx` riga 163: `if (!ready) return null` smonta TUTTO il tree React, inclusi i
provider. Expo Router riesce comunque a renderizzare welcome.tsx → useAuth() senza provider
→ crash. Fix: i provider montano SEMPRE, solo la navigazione aspetta `ready`.

**Crash 2 — ReanimatedModule x13 (task #123)**:
`react-native-keyboard-controller` dipende da `react-native-reanimated` internamente.
In Expo Go il modulo nativo reanimated non è incluso → NullPointerException.
10 file importano da questa libreria + KeyboardProvider nel layout.
Fix: sostituire con `KeyboardAvoidingView` nativo di React Native (stessa API identica,
funziona sia in Expo Go che in APK).

## Principi applicati
- Robustezza: provider sempre nel tree, navigazione gated
- Caricamento sequenziale: font prima, poi navigazione
- Risparmio risorse: eliminata dipendenza pesante (reanimated via keyboard-controller)

## Done looks like
- 0 errori "useAuth must be used within an AuthProvider" in Expo Go
- 0 errori "ReanimatedModule NullPointerException" in Expo Go
- App si avvia, splash si carica, login funziona
- KeyboardAvoidingView funziona nelle chat e nei form
- Nessuna regressione su APK (le sostituzioni hanno la stessa API)

## Tasks

### 1. StartupGate in _layout.tsx
- Rimuovere `if (!ready) return null` dalla funzione `RootLayout`
- Creare componente interno `StartupGate` che accetta `ready: boolean`:
  se `!ready` renderizza null, altrimenti renderizza children
- Struttura risultante:
  ```
  RootLayout:
    ErrorBoundary
      LanguageProvider
        QueryClientProvider
          AuthProvider
            LocationProvider
              StartupGate (ready={ready})
                AppStateHandler
                Lang

_(troncato)_

### Risultato

- 0 errori "useAuth must be used within an AuthProvider" in Expo Go
- 0 errori "ReanimatedModule NullPointerException" in Expo Go
- App si avvia, splash si carica, login funziona
- KeyboardAvoidingView funziona nelle chat e nei form

---
## #126 — Ottimizza Metro: 3 cicli iterativi

| Campo | Valore |
|-------|--------|
| **Stato** | ✅ MERGED |
| **Creato** | 2026-03-21 01:34:18 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Ottimizza Metro: 3 cicli iterativi

## What & Why
Metro (il bundler del frontend) viene terminato dalla memoria (OOM kill) durante l'avvio, causando crash ripetuti. Il Watchdog riesce a recuperarlo, ma il processo è instabile. L'obiettivo è rendere l'avvio stabile e riducre il consumo di RAM con tre cicli di ottimizzazione progressiva, ognuno seguito da una prova reale con log registrati.

## Done looks like
- Metro si avvia in modo stabile senza OOM kill nei 3 tentativi dello script
- Il log di ogni ciclo è registrato in `/tmp/metro-opt-*.log` o simile per confronto
- La configurazione finale incorpora tutte le ottimizzazioni valide dei tre cicli
- L'app è ancora funzionante dopo le ottimizzazioni (mappa, login, chat)

## Out of scope
- Modifiche alla logica dell'app o alle schermate
- Cambio di dipendenze npm

## Tasks

1. **Ciclo 1 — Ottimizza metro.config.js**: Ridurre `maxWorkers` a 1, aggiungere `NODE_OPTIONS=--max-old-space-size=384` al comando di avvio npm in `package.json` (script `expo:dev`), limitare `resolver.platforms` a `['ios', 'android', 'web']`, aggiungere cache stabile (`cacheVersion`). Riavviare il frontend e registrare il log di avvio (durata, eventuali kill, esito).

2. **Ciclo 2 — Riduci il carico iniziale**: Con le impostazioni del Ciclo 1 fisse, espandere il `blockList` in `metro.config.js` per escludere dalla scansione le directory pesanti non necessarie al frontend (`/server/`, `/scripts/`, `/tmp/`, `/migrations/`, file di seed, file `.sh`). Riavviare e registrare log di confronto.

3. **Ciclo 3 — Ottimizzazione finale combinata**: Analizzare i due log precedenti, applicare le eventuali correzioni residue (es. ulteriore riduzione worker, opzioni transformer, esclusioni aggiuntive) e validare l'avvio stabile. Registrare log finale. Se qualcosa va storto durante uno qualsiasi dei cicli, controllare i log e correggere prima di procedere al ciclo successivo.

## Relevant files
- `metro.config.js`
- `scripts/start-expo.sh`
- `package.json`

### Risultato

- Metro si avvia in modo stabile senza OOM kill nei 3 tentativi dello script
- Il log di ogni ciclo è registrato in `/tmp/metro-opt-*.log` o simile per confronto
- La configurazione finale incorpora tutte le ottimizzazioni valide dei tre cicli
- L'app è ancora funzionante dopo le ottimizzazioni (mappa, login, chat)

---
## #189 — EAS Build APK Android (cloud)

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-26 12:24:00 UTC |
| **Aggiornato** | 2026-03-26 12:25:46 UTC |

### Richiesta

# EAS Build APK Android (cloud)

## What & Why
Pubblicare il backend BikerLink su Replit e generare l'APK Android tramite EAS Build (cloud), così l'utente può scaricare e installare l'app direttamente sul proprio dispositivo Android senza bisogno di Android Studio.

## Done looks like
- Il backend è pubblicato su Replit con URL stabile (`biker-link.replit.app`)
- `eas.json` e `app.json` sono allineati con il dominio di produzione corretto
- Il comando `eas build --platform android --profile preview` viene eseguito con successo tramite EAS CLI
- La build viene avviata sui server EAS e l'utente riceve il link diretto per scaricare l'APK dalla dashboard EAS (expo.dev)

## Out of scope
- Build iOS / TestFlight
- Pubblicazione automatica sul Google Play Store
- Modifiche alle funzionalità dell'app

## Tasks
1. **Deploy backend** — Pubblicare il backend Express su Replit. Verificare che l'URL di produzione risponda correttamente alle API prima di avviare la build.

2. **Verifica configurazione** — Controllare che `eas.json` punti al dominio di produzione corretto in `EXPO_PUBLIC_DOMAIN`, che `app.json` abbia `version` e `versionCode` aggiornati, e che tutti gli asset (icona, splash, adaptive icon) esistano nei percorsi dichiarati.

3. **EAS Build APK** — Eseguire `eas build --platform android --profile preview` tramite EAS CLI (il profilo `preview` produce un `.apk` installabile direttamente). Al termine mostrare all'utente il link per scaricare l'APK dalla dashboard EAS.

## Relevant files
- `eas.json`
- `app.json`
- `assets/images/icon.png`
- `assets/images/android-icon-foreground.png`
- `assets/images/android-icon-background.png`
- `assets/images/android-icon-monochrome.png`
- `assets/images/splash-icon.png`

### Risultato

- Il backend è pubblicato su Replit con URL stabile (`biker-link.replit.app`)
- `eas.json` e `app.json` sono allineati con il dominio di produzione corretto
- Il comando `eas build --platform android --profile preview` viene eseguito con successo tramite EAS CLI
- La build viene avviata sui server EAS e l'utente riceve il link diretto per scaricare l'APK dalla dashboard EAS (expo.dev)

---
## #214 — EULA e Privacy Policy PDF multilingua

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-03-27 11:01:51 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# EULA e Privacy Policy PDF multilingua

## What & Why
L'admin panel ha una duplicazione: esiste già una sezione "Documenti PDF" per caricare/scaricare EULA e Privacy Policy, ma è presente anche una seconda sezione "Documenti Legali" con editor di testo grezzo per gli stessi documenti. Va eliminata la sezione duplicata. Inoltre vanno generati i PDF ufficiali multilingua (5 lingue) da caricare nel server.

## Done looks like
- La sezione "Documenti Legali" con i text-editor è rimossa dall'admin settings — rimane solo la sezione PDF upload/download
- Il file `BikerLink-EULA.pdf` esiste in `server/public/` con contenuto completo in tutte e 5 le lingue (italiano, inglese, tedesco, spagnolo, francese)
- Il file `BikerLink-PrivacyPolicy.pdf` esiste in `server/public/` con contenuto completo in tutte e 5 le lingue
- Nell'admin settings, sotto la sezione "Documenti PDF", sono presenti pulsanti/link per scaricare direttamente i PDF (oltre a quelli di upload già esistenti)
- I link di download nel profilo utente e nel flusso di registrazione continuano a funzionare

## Out of scope
- Modifica al flusso di accettazione EULA durante la registrazione
- Modifica alla schermata `app/privacy-policy.tsx` (quella standalone)
- Traduzioni delle stringhe UI dell'app

## Tasks
1. **Rimozione sezione duplicata admin** — Rimuovere da `app/admin/settings.tsx` la sezione "Documenti Legali" (con i TextInput per testo EULA e testo Privacy Policy), mantenendo intatta la sezione "Documenti PDF" con upload/download PDF. Rimuovere anche le variabili di stato, handler e chiamate API collegati esclusivamente alla sezione testo (eula_text, privacy_policy_text).

2. **Generazione PDF EULA multilingua** — Creare uno script Node.js (o usare pdfkit già disponibile o installarlo) che generi `server/public/BikerLink-EULA.pdf` con il testo EULA completo nelle 5 lingue (it, en, de, es, fr), con titoli di sezione per ogni lingua. Il contenuto deve coprire: accettazione termini, licenza d'uso, limitazioni, pr

_(troncato)_

### Risultato

## Relevant files
- `app/admin/settings.tsx:1724-1745,1871-1920`
- `server/routes.ts:528,554,565,586`
- `server/public/bikerlink-manual.pdf`

---
## #224 — Nuovo APK --clear-cache (codice aggiornato)

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-03-27 19:13:43 UTC |
| **Aggiornato** | 2026-03-27 19:25:37 UTC |

### Richiesta

# Nuovo APK (--clear-cache, codice aggiornato)

## What & Why
Il precedente APK (Build #9) era stato compilato da un commit non aggiornato,
con funzionalità mancanti o non funzionanti. Serve un rebuild completo dal main
aggiornato, con cache EAS azzerata, che includa tutte le modifiche mergiate
(icone, blocco utente, OTA system, ottimizzazioni APK).

## Done looks like
- Nuovo APK compilato dal commit HEAD di main (post-merge di tutti i task pendenti)
- Flag `--clear-cache` usato: nessun residuo di build precedenti sul server EAS
- `replit.md` aggiornato con il nuovo link APK, build ID e commit di riferimento
- `scripts/run-stress-test.sh` ripristinato allo stato disabilitato dopo il build
- Il QR code / link APK è condivisibile e installabile su Android

## Out of scope
- Modifiche al codice sorgente (solo rebuild)
- Play Store / distribuzione pubblica
- Build iOS

## Tasks
1. **Verifica commit HEAD** — Confermare che tutti i task recenti (#220, #221, #222, #223) siano visibili nel git log prima di avviare il build.

2. **EAS build con --clear-cache** — Modificare temporaneamente `scripts/run-stress-test.sh` per lanciare `eas build --platform android --profile preview --non-interactive --clear-cache` tramite il workflow "Stress Test". Attendere il completamento (può richiedere 30-45 minuti).

3. **Aggiorna replit.md e ripristina script** — Una volta completato, recuperare l'APK URL dalla CLI EAS, aggiornare la sezione "Ultimo APK stabile" in `replit.md` con Build #10 (numero progressivo), e ripristinare `scripts/run-stress-test.sh` al contenuto disabilitato originale.

## Note critiche
- `newArchEnabled: false` è OBBLIGATORIO in `app.json` — non modificare.
- Il token EAS è in `EXPO_TOKEN` come variabile d'ambiente — NON hardcodarlo nello script.
- Usare `EXPO_TOKEN=$EXPO_TOKEN npx eas-cli@latest build ...` per autenticarsi.
- Dopo il build, `scripts/run-stress-test.sh` DEVE essere ripristinato a:
  `#!/bin/bash\necho "Stress test disabilitato."\nexit 0`

## Releva

_(troncato)_

### Risultato

- Nuovo APK compilato dal commit HEAD di main (post-merge di tutti i task pendenti)
- Flag `--clear-cache` usato: nessun residuo di build precedenti sul server EAS
- `replit.md` aggiornato con il nuovo link APK, build ID e commit di riferimento
- `scripts/run-stress-test.sh` ripristinato allo stato disabilitato dopo il build

---
## #228 — OTA Updates — Configurazione EAS Update

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-03-28 10:18:09 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Configurazione OTA Updates (EAS Update)

## What & Why
Aggiungere `expo-updates` e configurare EAS Update per permettere di pubblicare aggiornamenti JavaScript all'app già installata senza ricompilare l'APK. Ogni modifica al codice JS (nuove feature, bugfix, UI) potrà essere distribuita agli utenti con un semplice comando, senza passare dal Play Store.

## Done looks like
- Il pacchetto `expo-updates` è installato e configurato
- `app.json` ha la sezione `updates` con URL del server EAS e `runtimeVersion` policy impostata a `"appVersion"`
- `eas.json` ha il campo `channel` definito per ogni profilo (`preview`, `production`), così EAS sa a quale canale pubblicare gli aggiornamenti
- Al primo avvio dopo installazione APK, l'app controlla automaticamente se c'è un aggiornamento disponibile e lo scarica in background
- È possibile pubblicare un aggiornamento OTA con il comando `eas update --branch preview --message "descrizione"` senza ricompilare l'APK
- In caso di aggiornamento disponibile, l'utente vede l'app aggiornata al riavvio successivo (comportamento silenzioso, non intrusivo)

## Out of scope
- Aggiornamenti forzati (non si obbliga l'utente a riavviare immediatamente)
- Rollback automatico degli aggiornamenti
- Canale iOS / TestFlight
- Modifica delle funzionalità dell'app

## Tasks
1. **Installare expo-updates** — Aggiungere il pacchetto `expo-updates` tramite il package manager Expo. Verificare che la versione sia compatibile con l'SDK corrente dell'app.

2. **Configurare app.json** — Aggiungere la sezione `updates` con `url` puntata al server EAS (`https://u.expo.dev/<projectId>`), `enabled: true`, `fallbackToCacheTimeout: 0`, e impostare `runtimeVersion` con policy `"appVersion"`. Aggiungere anche il plugin `expo-updates` alla lista `plugins` se richiesto dalla versione installata.

3. **Configurare eas.json con channels** — Aggiungere il campo `channel` ai profili `preview` e `production` in `eas.json` (es. `"channel": "preview"` e `"channel": "producti

_(troncato)_

### Risultato

## Relevant files
- `app.json`
- `eas.json`
- `package.json`

---
## #234 — Fix origin APK + Rebuild EAS

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-03-28 11:12:29 UTC |
| **Aggiornato** | 2026-03-28 15:07:37 UTC |

### Richiesta

# Fix origin APK + Rebuild EAS

## What & Why
L'APK installato crasha immediatamente con l'errore `LoadJSBundleFromFile` perché in `app.json` il plugin `expo-router` ha `origin: "https://replit.com/"`. Quando l'app gira su Replit questa è corretta, ma nell'APK standalone l'app cerca di caricare il bundle JS da quell'URL remoto invece di usare quello incorporato nell'APK — causando il crash. Va corretta prima del rebuild.

## Done looks like
- L'APK si avvia correttamente sul dispositivo Android senza crash
- La prima schermata (login o mappa) è visibile
- Nessun errore `LoadJSBundleFromFile` nei log di crash
- Nuovo APK compilato con cache EAS azzerata e link aggiornato in `replit.md`

## Out of scope
- Modifiche alle funzionalità dell'app
- Play Store / distribuzione pubblica
- Build iOS

## Tasks
1. **Correggi origin in app.json** — Rimuovere o sostituire `"origin": "https://replit.com/"` sia nell'array `plugins` (config di expo-router) sia in `extra.router`. Per la build standalone usare lo scheme dell'app: `"origin": "bikerlink://"` oppure rimuoverlo del tutto. Assicurarsi che `newArchEnabled: false` rimanga intatto.

2. **EAS build con --clear-cache** — Usare il workflow "Stress Test" (tramite `scripts/run-stress-test.sh`) per lanciare `eas build --platform android --profile preview --non-interactive --clear-cache`. Attendere il completamento (30-45 minuti). Il token EAS è in `EXPO_TOKEN` — non hardcodarlo.

3. **Aggiorna replit.md e ripristina script** — Dopo il build, recuperare l'URL APK dalla CLI EAS, aggiornare la sezione "Ultimo APK stabile" in `replit.md` (numero build progressivo), e ripristinare `scripts/run-stress-test.sh` al contenuto disabilitato originale.

## Note critiche
- `newArchEnabled: false` è OBBLIGATORIO in `app.json` — non rimuoverlo.
- Il token EAS è in `EXPO_TOKEN` come variabile d'ambiente.
- Usare `EXPO_TOKEN=$EXPO_TOKEN npx eas-cli@latest build ...` per autenticarsi.
- Dopo il build, `scripts/run-stress-test.sh` DEVE essere ripristi

_(troncato)_

### Risultato

- L'APK si avvia correttamente sul dispositivo Android senza crash
- La prima schermata (login o mappa) è visibile
- Nessun errore `LoadJSBundleFromFile` nei log di crash
- Nuovo APK compilato con cache EAS azzerata e link aggiornato in `replit.md`

---
## #254 — Controllo accurato sistema in Power Mode: pulizia, riavvio, verifica app

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-03-28 19:11:00 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

## Obiettivo
Controllo accurato del sistema in Power Mode: pulizia completa, riavvio da zero, verifica che l'app funzioni end-to-end (backend + Metro + preview funzionante).

## Passi

### 1. Pulizia totale
- Kill tutti i processi node
- Rimuovere tutti i lock files (/tmp/start-*.flock, /tmp/start-*.lock, /tmp/watchdog.flock)
- Pulire .metro-cache/
- Verificare che static-build/ NON esista (altrimenti il backend serve bundle stale)
- Verificare che server_dist/index.js sia aggiornato (rebuild se necessario)

### 2. Riavvio sequenziale
- Avviare Start Backend → attendere health check 200 su /api/health
- Avviare Start Frontend → attendere Metro /status 200
- Avviare Watchdog

### 3. Verifica stabilità
- Aspettare 2+ minuti
- Controllare che backend e Metro rispondano ancora
- Controllare RAM (ps aux) — backend ~92MB, Metro ~250MB
- Controllare uptime-resets.log: nessun "exit 137" nella sessione corrente
- Controllare backend-crashes.log: nessun nuovo crash

### 4. Verifica app funzionante
- Verificare che il manifest Metro venga servito correttamente (log: "Serving live Metro manifest for android")
- Testare il preview dell'app via web_application_feedback sulla porta 8081
- Verificare che la schermata di login si carichi correttamente

### 5. Diagnosi errore "Something went wrong" (se persiste)
- Controllare browser console logs per errori JS
- Controllare se ci sono errori di compilazione Metro nel log cycle
- Se l'errore è applicativo (non infrastrutturale), identificare la causa e fixare

## File coinvolti
- scripts/start-backend.sh, scripts/start-expo.sh, scripts/watchdog.sh
- logs/uptime-resets.log, logs/backend-crashes.log
- .metro-cache/ (da pulire)

### Risultato

## File coinvolti
- scripts/start-backend.sh, scripts/start-expo.sh, scripts/watchdog.sh
- logs/uptime-resets.log, logs/backend-crashes.log
- .metro-cache/ (da pulire)

---
## #270 — OTA obbligatoria + script push bash

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-03-29 08:44:15 UTC |
| **Aggiornato** | 2026-03-29 10:23:46 UTC |

### Richiesta

# OTA obbligatoria + script push bash

## What & Why
La schermata OTA va resa bloccante: l'utente non deve poter rimandare l'aggiornamento. Il pulsante "Più tardi" va eliminato. Serve inoltre uno script bash per forzare il push OTA agli EAS server senza passare dall'interfaccia admin.

## Done looks like
- Il modal OTA non ha più il pulsante "Più tardi" — l'utente può solo premere "Aggiorna ora"
- Finché l'aggiornamento non viene applicato, l'app non è utilizzabile (il modal non è chiudibile)
- Esiste uno script bash (`scripts/force-ota-push.sh`) o un comando npm (`npm run ota:push`) che esegue `eas update` verso il branch di produzione e stampa il risultato in console

## Out of scope
- Rimozione del pannello admin OTA
- Rimozione delle API backend `/api/updates/check`
- Modifiche alla logica di rilevamento versione

## Tasks
1. **Rendi il modal OTA non chiudibile** — In `app/_layout.tsx`, rimuovi il pulsante "Più tardi" dal modal `OtaUpdateChecker`. Imposta `onRequestClose` a una funzione vuota e `dismissable={false}` (o equivalente) in modo che il modal non possa essere chiuso né con il tasto back né con tap fuori. L'unica azione disponibile è "Aggiorna ora".

2. **Crea script bash force-ota-push** — Aggiungi `scripts/force-ota-push.sh` che esegue `eas update --branch production --message "Force OTA push"` (o il branch configurato nel progetto). Aggiungi anche l'alias `ota:push` negli scripts di `package.json`. Lo script deve verificare che `eas-cli` sia disponibile prima di procedere.

## Relevant files
- `app/_layout.tsx:129-231`
- `app/admin/ota.tsx`

### Risultato

- Il modal OTA non ha più il pulsante "Più tardi" — l'utente può solo premere "Aggiorna ora"
- Finché l'aggiornamento non viene applicato, l'app non è utilizzabile (il modal non è chiudibile)
- Esiste uno script bash (`scripts/force-ota-push.sh`) o un comando npm (`npm run ota:push`) che esegue `eas update` verso il branch di produzione e stampa il risultato in console

---
## #271 — Admin OTA: lista utenti non aggiornati + Forza OTA

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-03-29 08:54:22 UTC |
| **Aggiornato** | 2026-03-29 10:23:46 UTC |

### Richiesta

# Admin OTA: lista utenti non aggiornati + Forza OTA

## What & Why
Il pannello admin OTA deve mostrare quali utenti non hanno ancora applicato l'ultima versione OTA, con la possibilità di forzare l'aggiornamento su ogni singolo utente. La forzatura avviene tramite il sistema heartbeat già esistente: il server imposta un flag per quell'utente, e al prossimo heartbeat l'app lo legge e applica automaticamente l'aggiornamento.

## Done looks like
- Ogni utente invia la propria versione OTA attuale ad ogni heartbeat; il server la salva nel database
- Il pannello admin OTA mostra una sezione "Utenti non aggiornati" con nome, username e versione OTA di ogni utente che non ha la versione attiva
- Ogni riga utente ha un tasto "Forza OTA" che imposta il flag server-side
- Al prossimo heartbeat dell'utente, l'app riceve il segnale e applica automaticamente l'aggiornamento senza che l'utente debba fare nulla
- Il tasto "Forza aggiornamento" per il dispositivo admin rimane invariato nella sua posizione attuale

## Out of scope
- Invio di push notification agli utenti offline
- Storico dei forzamenti OTA per utente
- Modifiche alla schermata OTA visibile agli utenti normali (trattata nel Task #270)

## Tasks

1. **Schema DB: aggiungi campi OTA agli utenti** — Aggiungere i campi `ota_version` (text, nullable) e `force_ota_pending` (boolean, default false) alla tabella `users` in `shared/schema.ts`. Creare la migration corrispondente.

2. **Heartbeat: sincronizza versione OTA** — Modificare il client in `app/_layout.tsx` per inviare la versione OTA corrente (da `AsyncStorage` con chiave `ota_active_version`) nel body del POST heartbeat. Modificare l'endpoint `/api/auth/heartbeat` in `server/routes/auth.ts` per salvare il valore ricevuto in `ota_version` e, se `force_ota_pending` è true per quell'utente, rispondere con `{ ok: true, forceOta: true }` e resettare il flag a false. Lato client, se la risposta contiene `forceOta: true`, eseguire `Updates.fetchUpdateAsync()` + `Updates.r

_(troncato)_

### Risultato

- Ogni utente invia la propria versione OTA attuale ad ogni heartbeat; il server la salva nel database
- Il pannello admin OTA mostra una sezione "Utenti non aggiornati" con nome, username e versione OTA di ogni utente che non ha la versione attiva
- Ogni riga utente ha un tasto "Forza OTA" che imposta il flag server-side
- Al prossimo heartbeat dell'utente, l'app riceve il segnale e applica automaticamente l'aggiornamento senza che l'utente debba fare nulla

---
## #272 — Fix OTA: aggiornamenti rilevati ma non applicati — fix AsyncStorage timing + errori visibili

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-03-29 09:16:51 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

---
title: Fix meccanismo applicazione OTA — fetchUpdateAsync conflitto con checkAutomatically
---

# Fix OTA: aggiornamenti rilevati ma non applicati

## Problema
Gli OTA vengono rilevati ma non applicati mai, dopo più riavvii.

Causa probabile: `checkAutomatically: "ON_LOAD"` scarica già l'update in background.
Quando poi `handleReload()` chiama `fetchUpdateAsync()` manualmente, questo lancia
un'eccezione ("download already in progress", "already up to date", ecc.) che viene
INGOIATA dal try/catch vuoto. `reloadAsync()` viene poi chiamato, ma il bundle
non è ancora applicabile → riavvia col bundle precedente.

AsyncStorage viene scritto con la versione "1.1.0" prima di reloadAsync(), quindi
il modal non riappare mai → l'utente è bloccato sulla versione vecchia silenziosamente.

## Fix principale — app/_layout.tsx: handleReload()

### Strategia corretta:
Non chiamare fetchUpdateAsync() se checkAutomatically già scarica in background.
Invece: verificare se c'è un update pronto, poi chiamare reloadAsync() direttamente.

### Nuovo handleReload():
```ts
async function handleReload() {
  setApplying(true);
  try {
    const Updates = await import("expo-updates");

    // Tenta di scaricare esplicitamente (potrebbe già essere in cache)
    let fetchError: string | null = null;
    try {
      await Updates.fetchUpdateAsync();
    } catch (e: any) {
      fetchError = e?.message ?? "fetch failed";
      // Non bloccare — se l'update è già in cache, reloadAsync funziona lo stesso
    }

    // Salva versione in AsyncStorage SOLO dopo che reloadAsync va a buon fine
    // (spostato nel catch invertito — vedi sotto)
    await Updates.reloadAsync();

    // Se arriviamo qui, reloadAsync non ha riavviato (non dovrebbe succedere)
    await AsyncStorage.setItem(OTA_ACTIVE_VERSION_KEY, updateInfo!.version).catch(() => {});

  } catch (e: any) {
    // reloadAsync è fallito — mostra errore esplicito
    const msg = e?.message ?? "Errore sconosciuto";
    Alert.alert(
      "Aggior

_(troncato)_

### Risultato

- Premendo "Ora" nel modal, se reloadAsync fallisce → Alert con messaggio reale
- Nel pannello OTA admin, device card mostra "Bundle incorporato" o "OTA: acc17d9e"
e il canale "preview" confermato
- AsyncStorage viene scritto solo se l'aggiornamento è andato a buon fine

---
## #284 — OTA-9: diagnostica e badge dinamico

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-03-29 14:43:56 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# OTA-9 Diagnostica — Debug aggiornamenti

## What & Why

L'APK riceve le OTA ma non le applica: dopo 2 avvii non compare nessun badge versione nel tab Profilo, segno che il bundle embedded non è mai stato sostituito da quelli pubblicati via EAS Update. Bisogna diagnosticare il problema e garantire che il meccanismo funzioni.

## Done looks like

- OTA-9 pubblicata sul canale `preview` con runtimeVersion `1.0.0` (Hermes)
- Dopo al massimo 2 avvii dell'APK, il badge nel tab Profilo mostra `v1.0 · OTA-9 · <commit>`
- Il badge in `app/(tabs)/profile.tsx` viene aggiornato dinamicamente tramite `expo-updates` (`Updates.updateId`, `Updates.runtimeVersion`) invece di una stringa hardcoded — così ogni OTA futura si vede automaticamente senza doverla hardcodare
- `OtaStartupChecker` in `_layout.tsx` rafforzato: controlla sia `isUpdatePending` che `isUpdateAvailable`, e gestisce il caso in cui `expo-updates` lanci un check esplicito (`Updates.checkForUpdateAsync()`) all'avvio se non c'è già un pending

## Out of scope

- Cambio del canale EAS o della runtimeVersion
- Modifica al processo di build APK
- OTA per iOS

## Tasks

1. **Rendi il badge versione dinamico** — Sostituire la stringa hardcoded `v1.0 · OTA-8 · d3aa6178` in `profile.tsx` con valori presi da `expo-updates` (`Updates.updateId`, `Updates.manifest`, ecc.) con fallback al valore hardcoded se non disponibili. Questo renderà ogni OTA auto-identificante.

2. **Rafforza OtaStartupChecker** — In `_layout.tsx`, aggiungere un check esplicito via `Updates.checkForUpdateAsync()` + `Updates.fetchUpdateAsync()` se `isUpdatePending` è falso ma la rete è disponibile. Gestire il caso in cui la prima check avviene prima che `isUpdatePending` diventi `true`. Aggiungere log (solo `__DEV__` o console) per tracciare il flow.

3. **Pubblica OTA-9** — Eseguire il comando OTA standard: `EAS_BUILD=1 CI=1 EAS_SKIP_AUTO_FINGERPRINT=1 npx eas-cli@latest update --channel preview --platform android --message "OTA-9: badge dinamico + OtaSta

_(troncato)_

### Risultato

- `app/_layout.tsx:119-137`
- `app/(tabs)/profile.tsx:506-513`
- `ota-updates.json`
- `app.config.ts`

---
## #368 — Build APK v2: cache pulita + runtimeVersion 2.0.0 + OTA-01

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-01 19:02:31 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Build APK v2 — cache pulita, GitHub sync, runtimeVersion 2.0.0 + OTA-01

  ## What & Why
  Il ciclo OTA 1.x è irrecuperabile per alcune devices (bug AsyncStorage).
  Si ricomincia da zero:
  - runtimeVersion 1.0.0 → 2.0.0 crea un taglio netto: le vecchie OTA non raggiungono
    più il nuovo APK e vice-versa
  - Pulizia completa delle cache Metro, EAS, npm evita contaminazioni da build vecchi
  - GitHub force-push sincronizza il repo pulito; rimozione dei remote subrepl-* spazzatura
  - EAS Build --clear-cache garantisce che Gradle e npm partano da zero
  - OTA-01 pubblicata subito dopo la build inizializza il canale 2.0.0 per aggiornamenti futuri

  ## Done looks like
  - app.json: runtimeVersion "2.0.0", versionCode 3, version "1.1.0"
  - eas.json: profilo preview aggiornato con --clear-cache flag annotato
  - GitHub origin aggiornato con force-push; remote subrepl-* rimossi
  - Cache Metro, npm, ~/.expo, dist/ svuotate
  - EAS Build completata e APK scaricabile (link nel commit message)
  - OTA-01 (runtimeVersion 2.0.0) pubblicata su channel preview
  - ota-updates.json aggiornato con la nuova sezione APK v2 e OTA-01

  ## Out of scope
  - Nessuna modifica al codice sorgente (già corretto con OTA-62)
  - Nessun redeploy backend
  - iOS non coinvolto

  ## Tasks
  1. **Pulizia cache e remote git spazzatura** — Svuotare Metro cache, npm cache,
     ~/.expo/cache, dist/. Rimuovere tutti i remote subrepl-* dal repo.
     Force-push del branch main su origin (GitHub).

  2. **Incremento versioni in app.json** — Aggiornare runtimeVersion "1.0.0" → "2.0.0",
     version "1.0.0" → "1.1.0", android versionCode 2 → 3.
     Questo crea il taglio netto tra APK vecchio (OTA 1.x) e nuovo (OTA 2.x).

  3. **EAS Build APK standalone** — Lanciare il build con
     `EAS_BUILD=1 CI=1 npx eas-cli build --platform android --profile preview --clear-cache --non-interactive`
     e registrare il link al download nel commit message.

  4. **Pubblica OTA-01 (runtimeVersion 2.0.0)** — Dop

_(troncato)_

### Risultato

## Relevant files
- `app.json`
- `eas.json`
- `ota-updates.json`

---
## #397 — Fix Google Drive: ricollega account Bikerlinkapp e ri-carica PDF

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-03 07:58:25 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix connessione Google Drive Bikerlinkapp

## What & Why
I PDF BikerLink (manuale, EULA, privacy policy) sono stati caricati nel Drive
sbagliato perché la connessione Google Drive punta a un account personale invece
dell'account ufficiale "Bikerlinkapp". Prima di eseguire il task, l'utente deve
riconfigurare la connessione Google Drive in Replit con l'account Bikerlinkapp
e comunicarlo all'agente.

Gli script non hanno connection ID hardcoded — usano il connettore `google-drive`
in modo generico, quindi basterà riconfigurare l'integrazione e ri-caricare i file.

## Done looks like
- La connessione Google Drive attiva è quella dell'account Bikerlinkapp (verificata via listConnections)
- I PDF (manuale, EULA, privacy policy, manual) sono presenti nel Drive Bikerlinkapp nella cartella "BikerLink — Documenti Legali"
- Il link di ogni file viene stampato nei log come conferma

## Out of scope
- Eliminare i file già caricati sul vecchio Drive (l'utente può farlo manualmente)
- Modifiche al codice (gli script sono già corretti)

## Tasks
1. **Attendi conferma utente** — All'avvio del task, chiedere all'utente se ha già riconfigurato la connessione Google Drive con l'account Bikerlinkapp. Aspettare il sì prima di procedere.

2. **Verifica connessione** — Usare listConnections per verificare che la nuova connessione Drive sia presente e healthy. Stampare il display name per confermare che sia l'account Bikerlinkapp.

3. **Ri-upload tutti i PDF** — Eseguire lo script upload-to-drive.js per caricare manuale, EULA e privacy policy nella cartella "BikerLink — Documenti Legali" del Drive Bikerlinkapp. Stampare i link risultanti.

## Relevant files
- `scripts/upload-to-drive.js`
- `scripts/upload-manual-to-gdrive.mjs`

### Risultato

- La connessione Google Drive attiva è quella dell'account Bikerlinkapp (verificata via listConnections)
- I PDF (manuale, EULA, privacy policy, manual) sono presenti nel Drive Bikerlinkapp nella cartella "BikerLink — Documenti Legali"
- Il link di ogni file viene stampato nei log come conferma

---
## #401 — Fix OTA: stop race condition + build APK v5

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-06 23:36:59 UTC |
| **Aggiornato** | 2026-04-09 00:33:04 UTC |

### Richiesta

# Fix OTA: checkAutomatically NEVER + APK v5

  ## What & Why
  L'app usa `checkAutomatically: "ON_LOAD"` in `app.json`, che fa scaricare automaticamente gli aggiornamenti OTA prima che il checker JavaScript possa intervenire. Questo crea una race condition: se il download finisce in meno di 2 secondi, `checkForUpdateAsync()` restituisce `isAvailable: false` (update già scaricato ma non applicato), e il passive check non lo applica. Risultato: l'app rimane ferma all'OTA precedente.

  La fix definitiva è impostare `checkAutomatically: "NEVER"` così il download automatico non parte, e il checker JS gestisce tutto in modo deterministico al 100%.

  ## Done looks like
  - L'app riceve e applica ogni nuova OTA entro pochi secondi dall'apertura, senza bisogno di riavvii multipli
  - Il profilo mostra il numero OTA corretto (OTA-04 o superiore) al primo avvio dopo la pubblicazione
  - Nessuna race condition tra il download nativo e il checker JS

  ## Out of scope
  - Modifiche al server/backend
  - Cambio di runtimeVersion o versionCode (APK v5 mantiene versionCode 5)
  - iOS (solo Android)

  ## Tasks
  1. **Modifica app.json** — Cambia `checkAutomatically` da `"ON_LOAD"` a `"NEVER"`.

  2. **Semplifica OtaStartupChecker** — Rimuovi il timer da 2000ms. Sostituiscilo con una chiamata immediata a `checkForUpdateAsync()` + `fetchUpdateAsync()` + `reloadAsync()` al mount del componente. Tieni il passive check (già fixato in OTA-04) come fallback.

  3. **Pubblica OTA-05** — Pubblica la nuova versione JS via EAS per coprire gli utenti che applicano l'APK v5 in futuro. Aggiorna `ota-updates.json`.

  4. **Build APK v5** — Avvia la build EAS per generare l'APK con `versionCode: 5`, `checkAutomatically: "NEVER"` e il nuovo OtaStartupChecker.

  ## Relevant files
  - `app.json`
  - `app/_layout.tsx`
  - `ota-updates.json`

### Risultato

## Relevant files
- `app.json`
- `app/_layout.tsx`
- `ota-updates.json`

---
## #463 — CANCELLED - Fix Spotify 403 → schermata In Arrivo (no popup errore)

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-09 19:30:42 UTC |
| **Aggiornato** | 2026-04-09 19:34:05 UTC |

### Richiesta

# Fix Spotify 403 → schermata "in arrivo"

## What & Why
Quando Spotify restituisce HTTP 403 (app in Development mode, Extended Quota Mode non attiva), il frontend mostra un popup di errore brutto. Il codice ha già una schermata "Funzione in arrivo" attivabile tramite la query `spotify_coming_soon`, ma non si attiva automaticamente su questo errore.

## Done looks like
- L'utente che preme "Collega con Spotify" e riceve il 403 vede la schermata "Funzione in arrivo" invece del dialog di errore
- Lo stesso accade durante la sincronizzazione automatica
- Nessun popup di errore con testo tecnico appare all'utente
- L'admin panel mantiene la possibilità di abilitare/disabilitare manualmente il toggle

## Out of scope
- Richiesta dell'Extended Quota Mode a Spotify (azione esterna)
- Modifica del backend o del database

## Tasks
1. Nei mutation handlers `connectMutation.onError` e `syncMutation.onError` in `music.tsx`, rilevare se il messaggio di errore contiene "Extended Quota Mode" o "Spotify non supportato". In quel caso, invece di mostrare un Alert, usare `queryClient.setQueryData` per forzare `["/api/settings/spotify-coming-soon"]` a `{ enabled: true }`, così la UI passa automaticamente alla schermata "Funzione in arrivo".
2. Assicurarsi che anche la chiamata di status iniziale, se ritorna 503 con messaggio "Extended Quota Mode", venga gestita allo stesso modo (silent fallback alla schermata in arrivo).

## Relevant files
- `app/(tabs)/music.tsx`

### Risultato

- L'utente che preme "Collega con Spotify" e riceve il 403 vede la schermata "Funzione in arrivo" invece del dialog di errore
- Lo stesso accade durante la sincronizzazione automatica
- Nessun popup di errore con testo tecnico appare all'utente
- L'admin panel mantiene la possibilità di abilitare/disabilitare manualmente il toggle

---
## #476 — Accordion Stile Mappa e Documentazione nel profilo

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-10 07:37:29 UTC |
| **Aggiornato** | 2026-04-10 21:12:12 UTC |

### Richiesta

# Accordion Stile Mappa e Documentazione

## What & Why
Le sezioni "Stile Mappa" e "Documentazione" nel profilo utente devono usare lo stesso stile accordion collassabile già applicato a "La mia privacy — Altera Posizione". Questo rende il profilo più compatto e coerente visivamente.

## Done looks like
- La sezione "Stile Mappa" ha un'intestazione cliccabile con titolo e freccia su/giù (stesso stile di `accordionHeader`)
- Il contenuto di "Stile Mappa" si espande e collassa al tap
- La sezione "Documentazione" ha lo stesso comportamento accordion
- Di default entrambe le sezioni sono collassate all'apertura del profilo
- Il comportamento è identico a quello di "La mia privacy"

## Out of scope
- Modifiche al contenuto interno delle sezioni
- Cambiamenti ad altre sezioni del profilo

## Tasks
1. Aggiungere due nuovi stati (`mapStyleExpanded`, `docsExpanded`) al componente Profile e avvolgere le sezioni "Stile Mappa" e "Documentazione" con lo stesso pattern `accordionHeader` + `{expanded && (...)}` usato per la privacy.

## Relevant files
- `app/(tabs)/profile.tsx:812-821,1042-1200`

### Risultato

- La sezione "Stile Mappa" ha un'intestazione cliccabile con titolo e freccia su/giù (stesso stile di `accordionHeader`)
- Il contenuto di "Stile Mappa" si espande e collassa al tap
- La sezione "Documentazione" ha lo stesso comportamento accordion
- Di default entrambe le sezioni sono collassate all'apertura del profilo

---
## #488 — Pulizia cache EAS + sync GitHub + backup GDrive

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-10 22:37:56 UTC |
| **Aggiornato** | 2026-04-10 22:40:17 UTC |

### Richiesta

# Pulizia cache EAS + GitHub + Backup GDrive

## What & Why
Operazione di manutenzione periodica: pulizia completa delle cache EAS/Metro/Expo, sincronizzazione del codice su GitHub, e backup aggiornato del progetto su Google Drive. Il sistema OTA resta invariato — non toccare publish-ota.sh né ota-updates.json.

## Done looks like
- Cache EAS, Metro e Expo (.expo/, .metro-cache/, eventuali cache temporanee) ripulite
- Codice corrente committato e pushato su GitHub con un messaggio di commit descrittivo che include la data
- Archivio ZIP (o folder) del progetto caricato su Google Drive tramite l'integrazione esistente, con nome che include la data (es. `bikerlink-backup-2026-04-10.zip`)
- I file esclusi da .gitignore (node_modules, dist, ecc.) non sono inclusi nel backup

## Out of scope
- Qualsiasi modifica al sistema OTA (publish-ota.sh, ota-updates.json, canali EAS)
- Nuove build EAS
- Modifiche al codice applicativo

## Tasks
1. **Pulizia cache** — Rimuovere le directory di cache locali: `.expo/`, `.metro-cache/`, `web-build/`, `dist/`, `server_dist/`. Non toccare `dist-ota/` né nulla legato all'OTA.
2. **Commit e push GitHub** — Eseguire `git add -A`, commit con messaggio tipo `"chore: manutenzione periodica - $(date +%Y-%m-%d)"`, e push sul branch corrente.
3. **Backup su Google Drive** — Creare un archivio ZIP del progetto (escludendo node_modules, .expo, dist, logs, ecc.) e caricarlo su Google Drive tramite l'integrazione google-drive già configurata, in una cartella dedicata ai backup.

## Relevant files
- `eas.json`
- `.gitignore`
- `ota-updates.json`

### Risultato

- Cache EAS, Metro e Expo (.expo/, .metro-cache/, eventuali cache temporanee) ripulite
- Codice corrente committato e pushato su GitHub con un messaggio di commit descrittivo che include la data
- Archivio ZIP (o folder) del progetto caricato su Google Drive tramite l'integrazione esistente, con nome che include la data (es. `bikerlink-backup-2026-04-10.zip`)
- I file esclusi da .gitignore (node_modules, dist, ecc.) non sono inclusi nel backup

---
## #517 — Report azionario — profilo aggressivo breve termine

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-11 21:53:11 UTC |
| **Aggiornato** | 2026-04-11 21:53:57 UTC |

### Richiesta

# Report Azionario — Profilo Aggressivo Breve Termine

## What & Why
Generare un report di ricerca azionaria completo per un investitore con profilo aggressivo e orizzonte breve termine (meno di 1 anno), con 10.000€ disponibili. Il report analizza titoli ad alto momentum nei settori AI/semiconduttori, difesa ed energia.

**Profilo investitore:**
- Rischio: Aggressivo
- Orizzonte: Breve termine (< 1 anno)
- Budget: ~10.000€
- Esperienza: Principiante/Intermedio

**Disclaimer obbligatorio:** Ogni output deve riportare chiaramente che si tratta di analisi puramente informativa e non costituisce consulenza finanziaria. Raccomandare sempre di consultare un consulente finanziario abilitato prima di prendere qualsiasi decisione d'investimento.

## Done looks like
- Un PDF di ricerca professionale multi-pagina (reports/stock_report_aggressivo.pdf) con:
  - Cover page con profilo investitore e disclaimer
  - Analisi fondamentale (P/E, PEG, EV/EBITDA, FCF yield, margini) per ogni titolo
  - Analisi tecnica (prezzo vs 50/200 SMA, RSI, volume) per ogni titolo
  - Tabella comparativa peer
  - Sezione "Segnali retail" (insider activity, short interest)
  - Pagina disclaimer finale completa
- Un modello Excel DCF (reports/stock_DCF_aggressivo.xlsx) con:
  - Foglio DCF Model con proiezioni 5 anni e calcolo WACC
  - Foglio Sensitivity Analysis (WACC vs terminal growth rate)
  - Foglio Scenario Analysis (Bull/Base/Bear con probabilità)
  - Foglio Comparable Companies con dati reali yfinance
  - Foglio Financial Summary con storici 3-4 anni
- Entrambi i file presentati all'utente in chat

## Out of scope
- Consulenza finanziaria diretta o raccomandazioni di acquisto/vendita
- Analisi di criptovalute o asset alternativi
- Strategie di opzioni o derivati complessi
- Analisi di mercati non quotati

## Tasks

1. **Setup e raccolta dati** — Installare yfinance, fpdf2, openpyxl, matplotlib se non presenti. Creare la struttura `reports/charts/`. Eseguire `python reports/generate_report.py` p

_(troncato)_

### Risultato

## Relevant files
- `reports/report_base.py`
- `reports/chart_utils.py`
- `reports/excel_base.py`

---
## #587 — APK v19 — New Arch obbligatoria in RN 0.83 (maps 1.27.2 + Reanimated 4.x)

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-14 16:38:53 UTC |
| **Aggiornato** | 2026-04-14 16:48:29 UTC |

### Richiesta

---
  title: APK v19 — fix definitivo (New Arch obbligatoria in RN 0.83, maps 1.27.2)
  ---
  # APK v19 — New Architecture è l'unica opzione

  ## Scoperta critica
  React Native 0.82+ ha RIMOSSO Old Architecture. Il flag newArchEnabled=false è ignorato
  e genera solo un warning. Il codice gradle hardcoda IS_NEW_ARCHITECTURE_ENABLED=true sempre.
  Tutto il lavoro con newArchEnabled=false era basato su una premessa falsa.

  Implicazione: TUTTI i crash passati erano da react-native-maps 1.18.0 incompatibile con
  New Architecture (che era SEMPRE attiva). La configurazione corretta era APK v17.

  ## Perché APK v17 ha crashato?
  v17 usava maps 1.27.2 + Reanimated 4.x + newArchEnabled=true.
  La configurazione era corretta. La causa del crash di v17 è ignota senza logcat.
  Possibilità: l'utente ha testato un APK vecchio, oppure c'è un altro problema a runtime.

  ## Steps

  1. Rimuovere la riga newArchEnabled=false da android/gradle.properties
     (genera warning ed è ignorata — pulire il file)

  2. Installare react-native-maps@1.27.2 (già fatto in Task #585 ma poi sovrascritto)
     via installLanguagePackages

  3. Installare react-native-reanimated@4.2.3 (versione originale compatibile con RN 0.83.4)
     via installLanguagePackages (ripristino da ~4.2.1)

  4. Verificare che package.json abbia le versioni corrette

  5. Aggiornare versionCode → 19 in android/app/build.gradle e app.json

  6. Aggiornare ota-updates.json:
     v18-apk → failed (Reanimated 3.x incompatibile con RN 0.83.4, build error CMake)
     v19-apk → entry pending

  7. touch .local/apk-build-authorized +
     EXPO_TOKEN=n3eaNnvxrl8Xmx8W4HcF2URMnkb8QXzZ7527vzzb bash scripts/build-apk.sh preview 2>&1
     — catturare build ID dalla riga "See logs: https://expo.dev/..."

  8. Aggiornare ota-updates.json v19-apk con apkBuildId e easDashboard reali

  9. Aggiornare .agents/skills/bikerlink-ota-publish/SKILL.md:
     - REGOLA ASSOLUTA: Old Architecture rimossa in RN 0.82+. newArchEnabled=false I

_(troncato)_

### Risultato

## Note critiche
- MAI npx eas-cli — sempre bash scripts/build-apk.sh
- EXPO_TOKEN come env var
- Catturare build ID dalla riga "See logs: ..."

---
## #595 — Background Location — Staying Alive

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-15 16:27:37 UTC |
| **Aggiornato** | 2026-04-15 17:21:38 UTC |

### Richiesta

# Background Location — Staying Alive

## What & Why
Implementare il vero background location tracking con expo-task-manager: quando l'app è minimizzata, la posizione continua ad aggiornarsi sul server. Su iOS appare il "pallino" blu nella status bar (background location indicator). Su Android appare una notifica persistente (foreground service). Questo mantiene la visibilità dell'utente sulla mappa e garantisce il funzionamento di SOS anche con l'app in background.

Il tentativo precedente (Task #564) è stato rimosso perché è stato distribuito via OTA su un APK che non aveva ACCESS_BACKGROUND_LOCATION nel manifest (causa crash). Questa volta il codice deve essere scritto in modo sicuro, e il task include la modifica di app.json (che richiede una nuova build nativa per Android).

## Done looks like

- Quando l'app va in background su iOS, compare il pallino blu nella status bar e la posizione continua ad essere inviata al server ogni ~30 secondi
- Su Android, una notifica persistente "BikerLink — monitoraggio attivo" è visibile nella drawer durante l'uso in background
- Il codice è protetto con try/catch e control flow che non crashano se la permission nativa non è presente (compatibilità con build precedenti via OTA, degradando silenziosamente a foreground-only)
- L'aggiornamento posizione in background avviene via expo-task-manager + Location.startLocationUpdatesAsync(), non via watchPositionAsync (che si interrompe in background)
- Il task si avvia automaticamente all'accesso utente se i permessi "Always" sono concessi, e si ferma al logout
- Se il permesso "Always" non è concesso, l'app mostra un banner non bloccante che invita ad abilitarlo dalle impostazioni (senza interrompere le funzionalità foreground)

## ⚠️ Nota critica — Build nativa obbligatoria per Android

app.json va aggiornato con ACCESS_BACKGROUND_LOCATION. Questo cambiamento non può essere distribuito via OTA su build precedenti — richiede una nuova APK. Il codice deve includere un guard esplicito

_(troncato)_

### Risultato

- `lib/location-context.tsx`
- `app/_layout.tsx`
- `app.json`
- `app/(tabs)/index.tsx`

---
## #597 — Pallino Flottante — Widget Overlay

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-15 16:41:33 UTC |
| **Aggiornato** | 2026-04-15 17:21:38 UTC |

### Richiesta

# Pallino Flottante — Widget Overlay

## What & Why
Aggiungere un widget flottante draggabile che rimane visibile sopra qualsiasi schermata dell'app. Il pallino mostra un badge con il totale dei messaggi non letti e delle notifiche (match, proposte), e al tocco apre un mini-menu contestuale. È il punto di espansione futuro per funzioni premium (GPS keep-alive, musica, ecc.).

Controllato a due livelli: l'admin può abilitarlo/disabilitarlo globalmente; se abilitato dall'admin, l'utente può scegliere se tenerlo attivo o no (opzione in fondo a "Modifica Profilo", discreta). Default: ON per entrambi.

## Done looks like

- Un piccolo pallino semi-trasparente appare sovrapposto a qualsiasi schermata, draggabile liberamente con il dito; la posizione viene memorizzata tra le sessioni
- Il pallino mostra un numero (badge) che somma messaggi chat non letti + notifiche non lette (match, proposte). Badge scompare se tutto è zero
- Toccando il pallino si apre un mini-popup con due shortcut rapidi: "Chat" (con contatore non letti) e "Notifiche" (con contatore); ogni shortcut naviga alla schermata corrispondente e chiude il popup
- L'utente può disattivare il pallino da "Modifica Profilo" → fondo pagina, opzione discreta (testo piccolo, toggle semplice). Ricompare solo se l'utente lo riattiva dallo stesso posto
- L'admin può disattivare il widget globalmente da "Admin → Impostazioni" → nuova sezione "Widget Flottante". Se disabilitato dall'admin, il pallino non appare per nessun utente indipendentemente dalla preferenza personale
- Su web, il pallino non viene renderizzato (Platform.OS check)

## Out of scope

- Funzioni aggiuntive dentro il widget (GPS keep-alive, musica, ecc.) — queste vengono aggiunte in task futuri come espansioni del widget
- Push notification in background (task separato)
- Monetizzazione/paywall sul widget
- Animazioni elaborate di apertura/chiusura del menu (solo fade semplice)

## Tasks

1. **Backend — impostazione admin** — Aggiungere la chiave `floatin

_(troncato)_

### Risultato

- `app/_layout.tsx`
- `lib/location-context.tsx`
- `app/profile/edit.tsx`
- `app/admin/settings.tsx`

---
## #600 — Fix: Tap club su mappa → schermata pubblica

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-15 20:28:39 UTC |
| **Aggiornato** | 2026-04-15 21:45:35 UTC |

### Richiesta

# Fix: Tap Club su Mappa → Schermata Pubblica

## What & Why
Cliccando su un club sulla mappa appare "Club non trovato" se l'utente non è membro. Il backend blocca con un 403 chiunque non sia già iscritto al club, e il frontend mostra quell'errore generico. Poiché la mappa mostra tutti i club approvati (inclusi quelli a cui non si appartiene, per scoprirli), è necessaria una vista pubblica del club accessibile a tutti.

## Done looks like
- Tappando un club sulla mappa di cui NON si è membri si apre una schermata con: nome, tipo di club, numero di membri, regione/paese, logo.
- I non-membri vedono un pulsante "Richiedi di entrare" (o "Entra" se il club è ad accesso libero), non il dettaglio completo con la lista membri.
- I membri esistenti continuano a vedere la schermata completa (lista membri, chat, ecc.) esattamente come ora.
- Il messaggio "Club non trovato" appare solo se il club non esiste davvero (404), non per i non-membri.

## Out of scope
- Redesign completo della schermata club.
- Gestione approvazioni/rifiuti di richieste (già gestite altrove).

## Tasks
1. **Crea endpoint pubblico club** — Aggiungere un endpoint `GET /api/motoclubs/:id/public` che restituisca le info base del club (nome, tipo, logoUrl, region, country, memberCount, isApproved) senza richiedere appartenenza.
2. **Aggiorna schermata dettaglio club** — In `app/motoclub/[id].tsx`, dopo aver ricevuto un 403 (non membro), caricare i dati dall'endpoint pubblico e mostrare una vista ridotta con le info base e il pulsante di richiesta adesione. Il 404 continua a mostrare "Club non trovato".

## Relevant files
- `server/routes/motoclubs.ts:801-819`
- `app/motoclub/[id].tsx:102-228`
- `components/InteractiveMap.tsx:341-343`

### Risultato

- Tappando un club sulla mappa di cui NON si è membri si apre una schermata con: nome, tipo di club, numero di membri, regione/paese, logo.
- I non-membri vedono un pulsante "Richiedi di entrare" (o "Entra" se il club è ad accesso libero), non il dettaglio completo con la lista membri.
- I membri esistenti continuano a vedere la schermata completa (lista membri, chat, ecc.) esattamente come ora.
- Il messaggio "Club non trovato" appare solo se il club non esiste davvero (404), non per i non-membri.

---
## #640 — Show a confirmation message after refreshing folder names

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-17 12:52:44 UTC |
| **Aggiornato** | 2026-04-17 12:56:39 UTC |

### Richiesta

# Show a confirmation message after refreshing folder names

  ## What & Why
  The "Refresh folder names" button in the Drive browser currently clears the cache silently (no visible feedback beyond the spinner disappearing). A brief success toast or inline message like "Folder names updated" would confirm to admins that the action worked.

  ## Done looks like
  - After the cache-clear request succeeds, a short toast/snackbar message appears (e.g. "Nomi cartelle aggiornati")
  - The message auto-dismisses after ~2 seconds
  - Errors are also surfaced if the request fails

  ## Relevant files
  - `app/admin/traduzioni.tsx` — `DriveFileBrowser` component, `refreshFolderCache` function

### Risultato

- After the cache-clear request succeeds, a short toast/snackbar message appears (e.g. "Nomi cartelle aggiornati")
- The message auto-dismisses after ~2 seconds
- Errors are also surfaced if the request fails
## Relevant files

---
## #645 — Fix Drive: quota esaurita + browse vuoto

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-04-17 14:14:42 UTC |
| **Aggiornato** | 2026-04-17 14:14:42 UTC |

### Richiesta

# Fix Drive: quota esaurita + browse vuoto

## What & Why
Il Service Account Google ha esaurito la quota di 15GB su Drive perché ogni esportazione traduzioni veniva salvata nella root del SA senza mai eliminare i file precedenti. Di conseguenza:
- L'esportazione traduzioni fallisce con "quota exceeded"
- Il browser "Scegli cartella Drive" mostra il Drive del SA (vuoto per l'admin), non il Drive personale condiviso con il SA

## Done looks like
- Il browser cartelle (backup + traduzioni) mostra le cartelle condivise con il Service Account (`sharedWithMe`), non la root vuota del SA
- La UI mostra l'email del Service Account nell'header del browser, così l'admin sa con quale email condividere le cartelle
- L'esportazione traduzioni elimina automaticamente il file precedente dal Drive del SA prima di caricarne uno nuovo, evitando accumulo
- Viene aggiunto un endpoint admin `DELETE /api/admin/drive/cleanup-exports` e un pulsante nell'UI per pulire manualmente tutti i vecchi file di export dal Drive del SA e liberare la quota
- Se la quota è esaurita, il messaggio di errore è specifico e indica come risolvere

## Out of scope
- Cambiare il Service Account o le credenziali Google
- Backup automatici (il fix del browse già sblocca la selezione cartella)

## Tasks

1. **Fix browse — mostra cartelle condivise con SA**: Modificare l'endpoint `/api/admin/translations/browse` perché, al livello root (nessun `folderId`), esegua la query con `sharedWithMe=true` invece di `'root' in parents`. Aggiungere un campo `saEmail` nella risposta root con l'email del SA (estratta da `GOOGLE_SERVICE_ACCOUNT_JSON`).

2. **Fix UI browse — mostra email SA**: In `FolderPickerModal` (usato sia in `backup.tsx` che in `traduzioni.tsx`), mostrare una riga informativa al livello root con l'email del SA e l'istruzione "Condividi la cartella Drive con questa email". Aggiornare il componente in entrambi i file.

3. **Fix export traduzioni — auto-delete vecchio file**: Nell'endpoint `/api/admin/translatio

_(troncato)_

### Risultato

## Relevant files
- `server/routes/admin.ts:3369-3450`
- `server/routes/admin.ts:3458-3547`
- `server/lib/drive-client.ts`

---
## #646 — MapLibre GL — Motore mappa alternativo

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-17 14:29:32 UTC |
| **Aggiornato** | 2026-04-17 14:30:47 UTC |

### Richiesta

# MapLibre GL — Motore mappa alternativo

## What & Why
Aggiungere MapLibre GL come secondo motore mappa, selezionabile dall'admin tramite un toggle nel pannello "Stile Mappa". Quando l'admin sceglie MapLibre, tutti i componenti mappa dell'app usano MapLibre GL (nativo, vettoriale, fluido). Quando sceglie Leaflet, tutto rimane come ora. Questo risolve anche il bug critico esistente in RouteDetailMap dove PROVIDER_GOOGLE viene forzato su Android (crash senza API key).

## Done looks like
- Nel pannello admin, sezione "Stile Mappa", compare un selettore "Motore": Leaflet / MapLibre GL
- Cambiando a MapLibre, tutte le mappe nell'app (home, evento, motoclub, profilo, route, tracking, picker coordinate) usano MapLibre con tile OpenFreeMap (gratuiti, no key, no limiti)
- Cambiando a Leaflet, tutto funziona esattamente come prima
- Il bug PROVIDER_GOOGLE in RouteDetailMap è corretto indipendentemente dal motore scelto
- La build EAS funziona con il plugin MapLibre configurato in app.json

## Out of scope
- Stili vettoriali personalizzati (dark mode MapLibre, custom colors) — solo tile standard OpenFreeMap
- Clustering avanzato su MapLibre
- Migrazione degli easter egg e SOS sulla mappa principale MapLibre (la mappa home in modalità MapLibre mostra solo la posizione utente e biker base, senza tutti i layer avanzati — quelli rimangono su Leaflet)

## Tasks

1. **Installare @maplibre/maplibre-react-native e configurare app.json** — aggiungere il pacchetto e il plugin nativo in app.json. Usare OpenFreeMap come tile source (nessuna API key richiesta).

2. **Backend: aggiungere setting `map_engine`** — aggiungere `map_engine` (valori: `"leaflet"` | `"maplibre"`) alla risposta di `/api/settings/maps`, aggiungere la route admin PUT `/settings/map_engine` con log moderatore, default `"leaflet"`.

3. **map-context.tsx: esporre `mapEngine`** — aggiungere il campo `mapEngine: "leaflet" | "maplibre"` al `MapConfig` e al context, letto dal setting backend.

4. **Creare componenti MapLib

_(troncato)_

### Risultato

- Nel pannello admin, sezione "Stile Mappa", compare un selettore "Motore": Leaflet / MapLibre GL
- Cambiando a MapLibre, tutte le mappe nell'app (home, evento, motoclub, profilo, route, tracking, picker coordinate) usano MapLibre con tile OpenFreeMap (gratuiti, no key, no limiti)
- Cambiando a Leaflet, tutto funziona esattamente come prima
- Il bug PROVIDER_GOOGLE in RouteDetailMap è corretto indipendentemente dal motore scelto

---
## #649 — Toggle motore mappa nel pannello admin

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-17 14:37:56 UTC |
| **Aggiornato** | 2026-04-17 18:37:32 UTC |

### Richiesta

# Toggle motore mappa nel pannello admin

## What & Why
Dopo la migrazione a Leaflet (task #650), react-native-maps rimane compilato nell'APK ma non viene più usato di default. Invece di rimuoverlo subito (il che richiederebbe un nuovo APK), aggiungiamo un toggle nel pannello admin per scegliere il motore mappa tra Leaflet (WebView, default) e Google Maps (react-native-maps). Questo permette di passare da un motore all'altro via OTA, senza rebuild, utile per testare o fare fallback rapido in caso di problemi.

## Done looks like
- Nel pannello admin esiste una sezione "Impostazioni Mappa" con un toggle Leaflet / Google Maps
- La scelta viene salvata (es. AsyncStorage o config backend) e letta da un context condiviso
- I componenti mappa (`MapPickerModal`, `TrackingMap`, `RouteDetailMap`, `RouteMap`) renderizzano la versione Leaflet o react-native-maps in base all'impostazione attiva
- Cambiando il toggle, le mappe si aggiornano senza riavviare l'app (o al massimo con un reload della schermata)
- Default: Leaflet

## Out of scope
- Rimozione di react-native-maps da package.json (da fare al prossimo APK, se Leaflet risulta stabile)
- Modifiche al backend

## Tasks
1. **Context motore mappa** — Creare un context/hook `useMapEngine` che espone la scelta corrente (`leaflet` | `googlemaps`) e la funzione per cambiarla, persistita con AsyncStorage.
2. **Toggle nel pannello admin** — Aggiungere una voce "Motore mappa" nella sezione impostazioni del pannello admin, con switch Leaflet / Google Maps e descrizione delle differenze (WebView vs nativo, pro/contro).
3. **Componenti condizionali** — In ciascuno dei 4 componenti migrati (`MapPickerModal`, `TrackingMap`, `RouteDetailMap`, `RouteMap`), leggere `useMapEngine` e renderizzare la versione Leaflet o la versione react-native-maps originale di conseguenza.

## Nota per il prossimo APK
Quando si farà un nuovo build APK e Leaflet risulta stabile, rimuovere react-native-maps da package.json, eliminare le varianti Google Maps da

_(troncato)_

### Risultato

- Nel pannello admin esiste una sezione "Impostazioni Mappa" con un toggle Leaflet / Google Maps
- La scelta viene salvata (es. AsyncStorage o config backend) e letta da un context condiviso
- I componenti mappa (`MapPickerModal`, `TrackingMap`, `RouteDetailMap`, `RouteMap`) renderizzano la versione Leaflet o react-native-maps in base all'impostazione attiva
- Cambiando il toggle, le mappe si aggiornano senza riavviare l'app (o al massimo con un reload della schermata)

---
## #650 — Completare migrazione mappe su Leaflet

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-17 14:37:56 UTC |
| **Aggiornato** | 2026-04-17 18:37:36 UTC |

### Richiesta

# Completare migrazione mappe su Leaflet

## What & Why
Quattro componenti usano ancora react-native-maps direttamente (`MapPickerModal.native.tsx`, `TrackingMap.tsx`, `RouteDetailMap.tsx`, `RouteMap.tsx`), e tre schermate importano ancora `MapPickerModal`. L'obiettivo è migrare tutto su Leaflet via WebView, come già fatto per `InteractiveMap.tsx`, in modo da eliminare completamente la dipendenza da react-native-maps e il relativo rischio di crash per mancanza di Google Maps API key su Android.

## Done looks like
- `MapPickerModal.native.tsx` usa WebView + Leaflet invece di MapView (supporta tap per posizionare marker, polyline delle tappe esistenti, marker colorati per tipo)
- `TrackingMap.tsx` usa WebView + Leaflet invece di MapView (mostra percorso tracciato, posizione corrente aggiornata in tempo reale via injectedJavaScript, auto-centra sulla posizione attuale)
- `RouteDetailMap.tsx` usa WebView + Leaflet invece di MapView (mostra waypoint con colori per tipo, polyline tratteggiata, auto-zoom per contenere tutti i punti)
- `RouteMap.tsx` usa WebView + Leaflet invece di MapView (polyline percorso, marker partenza/arrivo opzionali, altezza personalizzabile)
- Le tre schermate `app/admin/easter-eggs.tsx`, `app/proposals/create.tsx`, `app/routes/create.tsx` continuano a funzionare con il nuovo `MapPickerModal` basato su Leaflet
- Nessun file nel progetto importa più `react-native-maps` direttamente

## Out of scope
- Rimozione di react-native-maps da package.json (coperta dal task #649)
- Modifiche all'InteractiveMap (già migrata)
- Modifiche al backend

## Tasks
1. **Migra MapPickerModal** — Riscrivere `components/MapPickerModal.native.tsx` usando WebView + HTML Leaflet inline: tap sulla mappa per posizionare marker, polyline tratteggiata delle tappe esistenti con marker colorati per tipo, barra coordinate in basso, stessa API props invariata.
2. **Migra TrackingMap** — Riscrivere `components/TrackingMap.tsx` con WebView + Leaflet: renderizza la polyline del perc

_(troncato)_

### Risultato

## Relevant files
- `components/MapPickerModal.native.tsx`
- `components/TrackingMap.tsx`
- `components/RouteDetailMap.tsx`

---
## #652 — Pubblica OTA-71 con le modifiche UI admin backup/traduzioni

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-17 15:33:22 UTC |
| **Aggiornato** | 2026-04-17 18:37:28 UTC |

### Richiesta

# Pubblica OTA-71 con le modifiche UI admin backup/traduzioni

  ## What & Why
  Le modifiche frontend del Task #651 (rimozione folder picker da backup.tsx e traduzioni.tsx, label cartelle fisse) sono pronte ma non ancora distribuite agli utenti Android. Va pubblicata una OTA.

  ## Done looks like
  - OTA-71 pubblicata con successo tramite `bash scripts/publish-ota.sh`
  - `ota-updates.json` aggiornato con i nuovi campi
  - `CURRENT_OTA_NUMBER=71` nel registro

  ## Relevant files
  - `app/admin/backup.tsx`
  - `app/admin/traduzioni.tsx`
  - `ota-updates.json`
  - `.agents/skills/bikerlink-ota-publish/SKILL.md`

### Risultato

- OTA-71 pubblicata con successo tramite `bash scripts/publish-ota.sh`
- `ota-updates.json` aggiornato con i nuovi campi
- `CURRENT_OTA_NUMBER=71` nel registro
## Relevant files

---
## #653 — Invio foto in chat

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-17 16:54:07 UTC |
| **Aggiornato** | 2026-04-17 18:37:39 UTC |

### Richiesta

# Invio Foto in Chat

  ## What & Why
  Aggiungere la possibilità di inviare foto nelle chat (private, di gruppo, motoclub). L'utente può scegliere un'immagine dalla galleria del telefono oppure scattarne una al volo con la fotocamera. Le foto vengono visualizzate come bolle nell'interfaccia chat.

  ## Done looks like
  - Nella barra di input della chat appare un pulsante fotocamera (o un'icona immagine)
  - Premendolo appare un menu con due opzioni: "Scatta foto" e "Scegli dalla galleria"
  - La foto selezionata/scattata viene compressa e inviata come messaggio
  - Le foto appaiono nelle bolle della chat come immagini cliccabili
  - Premendo su un'immagine nella chat si apre una visualizzazione a schermo intero
  - Il tutto funziona su Android (la piattaforma principale dell'app)

  ## Out of scope
  - Invio di video
  - Invio di file (PDF, documenti)
  - Anteprima/modifica dell'immagine prima dell'invio
  - Cancellazione di messaggi immagine già inviati

  ## Tasks
  1. **Backend — endpoint upload immagine chat**: Creare `POST /api/chat/conversations/:id/images` con multer (memory storage), upload in Object Storage sotto `public/chat-images/`, inserimento messaggio con `messageType: "image"` e `imageUrl` puntata a un endpoint di serving. Creare anche `GET /api/chat/images/:filename` per servire le immagini.

  2. **Frontend — picker e invio foto**: In `app/chat/[id].tsx` aggiungere un pulsante nella barra input che apre un ActionSheet (Scatta / Galleria). Usare `expo-image-picker` (già installato) con `MediaTypeOptions.Images` e `allowsEditing: false`, comprimere con quality 0.7, poi inviare in multipart form al nuovo endpoint. Mostrare indicatore di caricamento durante l'upload.

  3. **Frontend — rendering immagini nelle bolle**: Aggiornare il rendering di `messageType === "image"` in `app/chat/[id].tsx` per mostrare la foto reale (Image component con aspect ratio fisso) invece dell'icona placeholder. Aggiungere un tap-to-fullscreen tramite Modal.

  ## Relevan

_(troncato)_

### Risultato

## Relevant files
- `app/chat/[id].tsx`
- `server/routes/chat.ts`
- `server/objectStorage.ts`

---
## #654 — Fix posizione X mappa fullscreen

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-17 16:54:11 UTC |
| **Aggiornato** | 2026-04-17 18:37:47 UTC |

### Richiesta

# Fix posizione X mappa fullscreen

## What & Why
Il pulsante di chiusura (X) della mappa a schermo intero è posizionato male. Va spostato 15px più in basso e 8px più a destra.

## Done looks like
- Il pulsante X della mappa fullscreen appare 15px più in basso rispetto alla posizione attuale
- Il pulsante X appare 8px più vicino al bordo destro dello schermo

## Out of scope
- Qualsiasi altro pulsante di chiusura nell'app
- Modifiche estetiche al pulsante (colore, dimensione, icona)

## Tasks
1. Nel componente della mappa fullscreen in `app/(tabs)/index.tsx`, modificare il `top` inline del `closeBtn` aggiungendo 15px (nativo: `insets.top + 32`, web: `40`), e nella style sheet `closeBtn` cambiare `right` da `16` a `8`.

## Relevant files
- `app/(tabs)/index.tsx:849,1742-1752`

### Risultato

- Il pulsante X della mappa fullscreen appare 15px più in basso rispetto alla posizione attuale
- Il pulsante X appare 8px più vicino al bordo destro dello schermo

---
## #655 — Chiudi task completati + Fix X mappa + OTA-73

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-17 17:55:53 UTC |
| **Aggiornato** | 2026-04-17 18:37:28 UTC |

### Richiesta

# Chiudi task completati + Fix #654 + OTA-73

## What & Why
Quattro task (OTA-71 #652, toggle mappa #649, migrazione Leaflet #650, foto chat #653) risultano ancora aperti ma il lavoro è già incluso nelle OTA-71 e OTA-72 già pubblicate. Vanno chiusi. Resta da fare solo il fix posizione pulsante X mappa fullscreen (#654), dopodiché si pubblica OTA-73.

## Done looks like
- I task #649, #650, #652, #653 risultano chiusi nel pannello
- Il pulsante X della mappa fullscreen è 15px più in basso e 8px più a destra rispetto alla posizione attuale
- OTA-73 pubblicata e validata (CURRENT_OTA_NUMBER=73)

## Out of scope
- Qualsiasi altra modifica non richiesta

## Tasks
1. **Chiudi task già completati** — Marca come completati #649, #650, #652 e #653 (lavoro già incluso in OTA-71 e OTA-72).

2. **Fix #654** — In `app/(tabs)/index.tsx`, modificare lo stile `closeBtn`: `right` da `16` a `8`, e il `top` inline da `insets.top + 17` (o valore attuale) a `insets.top + 32` su nativo e da `25` a `40` su web.

3. **Pubblica OTA-73** — Aggiornare `CURRENT_OTA_NUMBER` a 73 in `profile.tsx`, aggiungere entry in `ota-updates.json`, eseguire `bash scripts/publish-ota.sh "1.73.0" "OTA-73: Fix X mappa fullscreen"`, aggiornare i campi con gli ID reali, validare con `validate-ota.sh`.

## Relevant files
- `app/(tabs)/index.tsx:849,1742-1752`
- `app/(tabs)/profile.tsx:134`
- `ota-updates.json`

### Risultato

- I task #649, #650, #652, #653 risultano chiusi nel pannello
- Il pulsante X della mappa fullscreen è 15px più in basso e 8px più a destra rispetto alla posizione attuale
- OTA-73 pubblicata e validata (CURRENT_OTA_NUMBER=73)

---
## #658 — Mostra il profilo GPS scelto anche durante il tracciamento attivo

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-17 19:01:06 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

# Mostra il profilo GPS scelto anche durante il tracciamento attivo

  ## What & Why
  Attualmente il selettore Easy/Medium/Race è visibile solo prima di avviare il giro.
  Una volta avviato il tracciamento, l'utente non vede più quale profilo è attivo.
  Sarebbe utile mostrare il nome del profilo (es. "Race · 1s") nell'infoBox o nella dashboard.

  ## Done looks like
  - Il nome del profilo appare chiaramente nella schermata di tracciamento attivo
  - L'utente può vedere subito quale strategia di aggiornamento GPS è in uso

  ## Relevant files
  - app/(tabs)/tracking.tsx (infoBox, dashboard, PROFILE_LABELS)

### Risultato

- Il nome del profilo appare chiaramente nella schermata di tracciamento attivo
- L'utente può vedere subito quale strategia di aggiornamento GPS è in uso
## Relevant files
- app/(tabs)/tracking.tsx (infoBox, dashboard, PROFILE_LABELS)

---
## #659 — Permettere di cambiare il profilo GPS anche a giro già avviato

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-17 19:01:06 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

# Permettere di cambiare il profilo GPS anche a giro già avviato

  ## What & Why
  Il profilo (Easy/Medium/Race) si sceglie solo prima di avviare il giro. 
  Se le condizioni stradali cambiano (es. si passa dall'autostrada alla città), 
  l'utente non può adattare la frequenza GPS senza fermare e riavviare il tracciamento.

  ## Done looks like
  - Pulsante o menu compatto per cambiare profilo GPS anche durante il giro
  - Il cambio è istantaneo: l'intervallo di aggiornamento cambia subito
  - Non interrompe il tracciamento né perde i punti già registrati

  ## Relevant files
  - app/(tabs)/tracking.tsx (updateProfileRef, switchTrackingAccuracy, getModeConfig)

### Risultato

- Pulsante o menu compatto per cambiare profilo GPS anche durante il giro
- Il cambio è istantaneo: l'intervallo di aggiornamento cambia subito
- Non interrompe il tracciamento né perde i punti già registrati
## Relevant files

---
## #660 — Aggiungere grafici di velocità e altitudine al dettaglio del giro

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-17 19:01:06 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

# Aggiungere grafici di velocità e altitudine al dettaglio del giro

  ## What & Why
  I RecordCard mostrano statistiche aggregate (media, max) ma non c'è nessun grafico 
  che mostri l'andamento di velocità e altitudine nel tempo. I punti GPS sono già 
  salvati in DB e potrebbero alimentare un grafico lineare.

  ## Done looks like
  - Ogni giro completato ha una pagina di dettaglio con grafico velocità nel tempo
  - Grafico altitudine opzionale nella stessa pagina
  - I dati arrivano dall'endpoint esistente dei punti GPS

  ## Relevant files
  - app/(tabs)/tracking.tsx (RecordCard, completedRecords)
  - server/routes/tracking.ts (GET /:id/points)

### Risultato

- Ogni giro completato ha una pagina di dettaglio con grafico velocità nel tempo
- Grafico altitudine opzionale nella stessa pagina
- I dati arrivano dall'endpoint esistente dei punti GPS
## Relevant files

---
## #662 — Annulla il countdown Delayed Start con un tap

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-17 19:27:13 UTC |
| **Aggiornato** | 2026-04-17 19:29:24 UTC |

### Richiesta

# Annulla il countdown Delayed Start con un tap

  ## What & Why
  Attualmente, una volta avviato il countdown del Delayed Start, non c'è modo di annullarlo se l'utente cambia idea. Serve un pulsante "Annulla" visibile durante il conto alla rovescia.

  ## Done looks like
  - Durante il countdown, compare un pulsante "Annulla" ben visibile nell'overlay
  - Premendolo il countdown si ferma, l'overlay sparisce, e si torna alla schermata di start
  - L'intervallo viene pulito correttamente (no memory leak)

  ## Relevant files
  - app/(tabs)/tracking.tsx (countdownOverlay, countdownIntervalRef, countdownValue)

### Risultato

- Durante il countdown, compare un pulsante "Annulla" ben visibile nell'overlay
- Premendolo il countdown si ferma, l'overlay sparisce, e si torna alla schermata di start
- L'intervallo viene pulito correttamente (no memory leak)
## Relevant files

---
## #664 — Tocca il countdown per annullarlo

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-17 21:32:15 UTC |
| **Aggiornato** | 2026-04-17 21:43:19 UTC |

### Richiesta

# Tocca il countdown per annullarlo

  ## What & Why
  Quando il countdown è attivo (5, 4, 3…) non c'è modo di annullarlo se ci si pente. Un tap sull'overlay del countdown dovrebbe cancellarlo e riportare alla schermata di avvio.

  ## Done looks like
  - Tappando l'overlay del countdown durante il conto alla rovescia, il countdown si interrompe e l'overlay scompare
  - L'app torna allo stato "pronto per avviare"
  - Non parte il tracciamento

  ## Relevant files
  - `app/(tabs)/tracking.tsx` (countdownOverlay, countdownIntervalRef, countdownValue state, handleStartPress)

### Risultato

- Tappando l'overlay del countdown durante il conto alla rovescia, il countdown si interrompe e l'overlay scompare
- L'app torna allo stato "pronto per avviare"
- Non parte il tracciamento
## Relevant files

---
## #665 — Override touch schermo durante Hands Off

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-17 21:32:15 UTC |
| **Aggiornato** | 2026-04-17 21:43:19 UTC |

### Richiesta

# Override touch schermo durante Hands Off

  ## What & Why
  Quando "Hands Off" è attivo e la velocità supera la soglia, lo schermo non risponde ai tocchi. Ma se l'utente ha un'emergenza e vuole fermare il tracciamento, non può farlo. Serve un meccanismo di sblocco (es. pressione lunga 2 secondi sull'overlay).

  ## Done looks like
  - Quando Hands Off è attivo (handsOffActive = true), un overlay semi-trasparente copre lo schermo con la scritta "Hands Off attivo"
  - Tener premuto l'overlay per 2 secondi disabilita temporaneamente Hands Off
  - Il tracking continua normalmente

  ## Relevant files
  - `app/(tabs)/tracking.tsx` (handsOffActive state, ScrollView pointerEvents, handleGpsUpdate)

### Risultato

- Quando Hands Off è attivo (handsOffActive = true), un overlay semi-trasparente copre lo schermo con la scritta "Hands Off attivo"
- Tener premuto l'overlay per 2 secondi disabilita temporaneamente Hands Off
- Il tracking continua normalmente
## Relevant files

---
## #666 — Badge precisione GPS in tempo reale

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-17 21:53:09 UTC |
| **Aggiornato** | 2026-04-17 22:04:35 UTC |

### Richiesta

# Badge precisione GPS in tempo reale

## What & Why
Il tab Performance Counter deve mostrare in cima, sempre visibile, la qualità del segnale GPS ricevuto. Il dato viene già fornito da `expo-location` nel campo `coords.accuracy` (raggio di incertezza in metri) per ogni aggiornamento di posizione, ma attualmente viene scartato. Si tratta di un'informazione utile al pilota per capire quanto siano affidabili velocità, distanza e quota rilevate.

## Done looks like
- In cima alla schermata Performance Counter compare un widget testuale su due righe, sempre visibile (sia durante il tracciamento sia nella schermata iniziale).
- **Riga 1 (etichette):** `Scarsa   Discreta   Buona   Ottima` disposte orizzontalmente da sinistra a destra.
- **Riga 2 (valori):** sotto ciascuna etichetta compare il range corrispondente: `>30 m`, `15-30 m`, `5-15 m`, `<5 m`.
- La categoria attiva è colorata (rosso = Scarsa, giallo = Discreta, blu = Buona, verde = Ottima); le altre tre sono grigie.
- Il widget si aggiorna in tempo reale a ogni fix GPS, senza pulsanti né interazione.
- Se la precisione non è ancora disponibile (prima fix o web), tutte le etichette restano grigie.
- Dimensione testo contenuta (12-13pt), nessun bordo o card — solo testo.

## Out of scope
- Storico della precisione nel tempo
- Differenziazione tra precisione orizzontale e verticale
- Allarmi o notifiche legate alla precisione

## Tasks
1. **State + lettura accuracy** — Aggiungere uno state `gpsAccuracy` (number | null). Nei tre callback `watchPositionAsync` (nativo) e `navigator.geolocation.watchPosition` (web) leggere `coords.accuracy` e aggiornare lo state. Non modificare la firma di `handleGpsUpdate`.

2. **Helper di classificazione** — Scrivere una funzione `getAccuracyTier(meters)` che restituisce `"scarsa" | "discreta" | "buona" | "ottima" | null` secondo le soglie: >30 m = scarsa, 15-30 = discreta, 5-15 = buona, <5 = ottima. Null se il valore non è disponibile.

3. **Componente widget** — Aggiungere un piccolo

_(troncato)_

### Risultato

## Relevant files
- `app/(tabs)/tracking.tsx:320-330,445-455,585-600,709-740`

---
## #677 — Calibrazione e confronto accuracy GPS in tempo reale

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 05:36:24 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

# Calibrazione e confronto accuracy GPS in tempo reale

  ## What & Why
  Il profilo ora permette di scegliere 5 livelli di precisione GPS, ma l'utente non ha feedback visivo sull'accuracy effettiva ricevuta dal dispositivo in ciascuna modalità. Un pannello di diagnostica GPS aiuterebbe a scegliere il livello giusto e a capire perché la velocità può risultare 0 in certi contesti.

  ## Done looks like
  - Un pannello opzionale (toggle nel profilo o in-app) mostra: satellites, accuracy (m), hdop se disponibile, frequenza aggiornamenti
  - I dati cambiano in tempo reale durante il tracking
  - Una mini-guida spiega quale livello scegliere in base allo scenario (città, autostrada, pista)

  ## Relevant files
  - `app/(tabs)/tracking.tsx` (già usa expo-location watchPositionAsync — esporre accuracy dalla posizione)
  - `app/(tabs)/profile.tsx` (accordion Precisione GPS — aggiungere link a diagnostica)
  - `hooks/useColors.ts`, `constants/colors.ts`

### Risultato

- Un pannello opzionale (toggle nel profilo o in-app) mostra: satellites, accuracy (m), hdop se disponibile, frequenza aggiornamenti
- I dati cambiano in tempo reale durante il tracking
- Una mini-guida spiega quale livello scegliere in base allo scenario (città, autostrada, pista)
## Relevant files

---
## #679 — Mostra la mappa del percorso anche nel dettaglio di ogni uscita salvata

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 06:59:22 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

# Mostra la mappa del percorso anche nel dettaglio di ogni uscita salvata

  ## What & Why
  Al momento la mappa GPS live è visibile solo durante il tracking attivo. Una volta finita la sessione, l'utente non può rivedere il percorso fatto su mappa. Aggiungere la mappa nel dettaglio dell'uscita (ride history) renderebbe il feature completo e molto più utile.

  ## Done looks like
  - Nel dettaglio di un'uscita salvata (schermata che mostra km, durata, velocità, ecc.) appare una card mappa con il percorso GPS
  - Il componente TrackingMap è riutilizzato (non serve nuovo codice mappa)
  - I punti GPS vengono caricati dall'endpoint esistente (es. /api/sessions/:id/gps-points)

  ## Relevant files
  - `components/TrackingMap.tsx` — componente da riutilizzare
  - `app/(tabs)/tracking.tsx` — vedere come vengono caricati i punti con loadBgPoints()
  - Schermata dettaglio uscita (cercare in app/ la route del ride detail)

### Risultato

- Nel dettaglio di un'uscita salvata (schermata che mostra km, durata, velocità, ecc.) appare una card mappa con il percorso GPS
- Il componente TrackingMap è riutilizzato (non serve nuovo codice mappa)
- I punti GPS vengono caricati dall'endpoint esistente (es. /api/sessions/:id/gps-points)
## Relevant files

---
## #680 — Ottimizzare gli aggiornamenti della mappa per gite molto lunghe

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 06:59:22 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

# Ottimizzare gli aggiornamenti della mappa per gite molto lunghe

  ## What & Why
  Attualmente, ogni volta che arriva un fix GPS durante il tracking, il componente TrackingMap riceve l'array completo di tutti i punti accumulati. Su gite lunghe (2-3 ore a 1 fix/secondo) questo array può arrivare a migliaia di elementi, causando un payload JSON molto grande ad ogni update. Questo può rallentare la mappa su dispositivi meno potenti.

  ## Done looks like
  - Implementare un sistema di delta-update: la mappa riceve solo i nuovi punti, non l'intero array
  - Aggiornare i componenti LeafletTrackingMap e NativeTrackingMap per supportare incrementally append di nuovi punti
  - Nessuna regressione visibile per gite brevi

  ## Relevant files
  - `components/LeafletTrackingMap.tsx` — postMessage invia tutti i punti ogni volta
  - `components/LeafletTrackingMap.web.tsx` — stesso pattern
  - `components/NativeTrackingMap.tsx` — MapView con Polyline riceve tutti i coords
  - `lib/leaflet-tracking-map-html.ts` — HTML/JS della mappa Leaflet, gestisce receiveUpdate
  - `app/(tabs)/tracking.tsx` — handleGpsUpdate: mapCoordsRef.current.push + setMapCoords([...ref])

### Risultato

## Relevant files
- `components/LeafletTrackingMap.tsx` — postMessage invia tutti i punti ogni volta
- `components/LeafletTrackingMap.web.tsx` — stesso pattern
- `components/NativeTrackingMap.tsx` — MapView con Polyline riceve tutti i coords

---
## #684 — Reset automatico modalità 0-100 se la misurazione si blocca

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 08:30:30 UTC |
| **Aggiornato** | 2026-04-18 08:34:11 UTC |

### Richiesta

# Reset automatico modalità 0-100 se la misurazione si blocca

  ## What & Why
  Se l'utente attiva il 0-100 ma non parte (o GPS perde segnale), il countdown scatta ma poi rimane bloccato in fase "waiting" per sempre. Aggiungere un timeout automatico (es. 3 minuti) che resetta la fase sprint e avvisa l'utente, evitando che il tracciamento rimanga in uno stato inconsistente.

  ## Done looks like
  - Dopo un timeout configurabile (es. 3 min) in fase "waiting", la sprint viene resettata
  - L'utente riceve una notifica/alert visivo
  - La modalità torna in stato neutro senza perdere il tracciamento in corso

  ## Relevant files
  - `app/(tabs)/tracking.tsx` — sprintPhaseRef, sprintCountdownRef, gestione stati sprint (~riga 918-1060)

### Risultato

- Dopo un timeout configurabile (es. 3 min) in fase "waiting", la sprint viene resettata
- L'utente riceve una notifica/alert visivo
- La modalità torna in stato neutro senza perdere il tracciamento in corso
## Relevant files

---
## #685 — Animazione pulsante sulla velocità durante il VIA! (0-100)

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 08:36:29 UTC |
| **Aggiornato** | 2026-04-18 08:44:22 UTC |

### Richiesta

# Animazione pulsante sulla velocità durante il VIA! (0-100)

  ## What & Why
  Il pannello velocità mostrato durante la fase di misura 0-100 km/h è statico. Aggiungere un'animazione pulsante al numero di velocità (e/o al badge VIA!) durante la fase "measuring" renderebbe il pannello più dinamico e coinvolgente durante la corsa.

  ## Done looks like
  - Il valore velocità (o il badge VIA!) pulsa con un'animazione reanimated durante la fase "measuring"
  - L'animazione si ferma o cambia nella fase "waiting" (ATTENDI)
  - Nessun crash su web (Layout animations disabilitate su web)

  ## Relevant files
  - `app/(tabs)/tracking.tsx` — SprintSpeedPanel component (righe ~1686-1727)

### Risultato

- Il valore velocità (o il badge VIA!) pulsa con un'animazione reanimated durante la fase "measuring"
- L'animazione si ferma o cambia nella fase "waiting" (ATTENDI)
- Nessun crash su web (Layout animations disabilitate su web)
## Relevant files

---
## #686 — Mostra il tempo trascorso in tempo reale durante la misurazione 0-100

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 08:36:29 UTC |
| **Aggiornato** | 2026-04-18 08:44:22 UTC |

### Richiesta

# Mostra il tempo trascorso in tempo reale durante la misurazione 0-100

  ## What & Why
  Durante la fase "measuring" del pannello velocità 0-100, l'utente non vede quanto tempo è passato dall'inizio dello sprint. Aggiungere un cronometro live (es. "1.34s...") sotto il valore velocità darebbe un feedback immediato sulla prestazione in corso.

  ## Done looks like
  - Un cronometro in tempo reale appare nel SprintSpeedPanel durante la fase "measuring"
  - Il timer parte da 0 quando la misurazione inizia e si aggiorna ogni 100ms
  - Il timer si ferma e mostra il tempo finale quando la fase diventa "done"

  ## Relevant files
  - `app/(tabs)/tracking.tsx` — SprintSpeedPanel component (~righe 1686-1790), sprintStartTimeRef, sprintPhase state

### Risultato

- Un cronometro in tempo reale appare nel SprintSpeedPanel durante la fase "measuring"
- Il timer parte da 0 quando la misurazione inizia e si aggiorna ogni 100ms
- Il timer si ferma e mostra il tempo finale quando la fase diventa "done"
## Relevant files

---
## #688 — Mostra schermata risultato dopo il completamento 0-100

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 08:54:11 UTC |
| **Aggiornato** | 2026-04-18 08:56:32 UTC |

### Richiesta

# Mostra schermata risultato dopo il completamento 0-100

  ## What & Why
  Quando la misurazione 0-100 km/h termina, il tempo risultante appare nello
  SprintDashboard ma l'utente riceve un feedback visivo minimo. Aggiungere una
  schermata risultato dedicata (overlay o card) che mostri chiaramente il tempo
  impiegato (es. "4.2s"), con possibilità di condividere o salvare il record.

  ## Done looks like
  - Al completamento della misurazione ("done" phase) appare un overlay/card
    con il tempo risultante in grande
  - Pulsante "Condividi" e "Chiudi" visibili
  - Eventuale evidenza se è un nuovo record personale

  ## Relevant files
  - `app/(tabs)/tracking.tsx` — sprintPhase "done", SprintDashboard, SprintSpeedPanel (~riga 1325-1380)
  - `constants/colors.ts`

### Risultato

- Al completamento della misurazione ("done" phase) appare un overlay/card
con il tempo risultante in grande
- Pulsante "Condividi" e "Chiudi" visibili
- Eventuale evidenza se è un nuovo record personale

---
## #690 — Avvisa l'utente se la sessione non si è salvata correttamente

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 12:15:32 UTC |
| **Aggiornato** | 2026-04-18 12:26:17 UTC |

### Richiesta

# Avvisa l'utente se la sessione non si è salvata correttamente

  ## What & Why
  Quando la chiamata API di stop del tracking fallisce (errore di rete o server),
  l'utente vede solo un generico "Errore nel completamento della sessione" e l'app
  torna allo schermo di Start — ma la sessione sul backend rimane aperta e i dati
  GPS non sono stati salvati correttamente. L'utente non sa se il giro è stato
  registrato o meno, né può fare nulla.

  ## Done looks like
  - Se la chiamata API di stop fallisce, l'utente vede un messaggio chiaro che
    indica che il giro potrebbe non essere stato salvato
  - L'app mostra un pulsante "Riprova" per tentare di nuovo il salvataggio
  - In alternativa, il routeId viene memorizzato e il salvataggio viene ritentato
    automaticamente al prossimo avvio dell'app

  ## Relevant files
  - `app/(tabs)/tracking.tsx:1069-1155` (stopTracking — catch block)
  - `server/routes.ts` (endpoint PUT /api/routes/:id/stop)

### Risultato

- Se la chiamata API di stop fallisce, l'utente vede un messaggio chiaro che
indica che il giro potrebbe non essere stato salvato
- L'app mostra un pulsante "Riprova" per tentare di nuovo il salvataggio
- In alternativa, il routeId viene memorizzato e il salvataggio viene ritentato

---
## #691 — Rendi il blocco tocchi durante Hands-Off più robusto e preciso

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 12:15:32 UTC |
| **Aggiornato** | 2026-04-18 12:26:17 UTC |

### Richiesta

# Rendi il blocco tocchi durante Hands-Off più robusto e preciso

  ## What & Why
  Attualmente la ScrollView principale usa `pointerEvents={handsOffActive ? "none" : "auto"}`,
  il che blocca TUTTI i tocchi sull'intera schermata quando Hands-Off è attivo.
  Questo pattern ha già causato un bug grave (pulsante Start irraggiungibile dopo
  errore API). Sarebbe più corretto applicare il blocco solo agli elementi
  specifici che non devono essere toccati durante la guida, lasciando accessibili
  Stop e Pausa.

  ## Done looks like
  - La ScrollView non usa più `pointerEvents` globale
  - Gli elementi di navigazione (pulsante Stop, pausa) rimangono sempre toccabili
  - Solo i controlli configurazione (GPS freq, Hands-Off, 0-100 toggle) vengono
    bloccati durante la guida
  - L'interfaccia non può più bloccarsi completamente per colpa di un flag non resettato

  ## Relevant files
  - `app/(tabs)/tracking.tsx:1200-1215` (ScrollView pointerEvents)
  - `app/(tabs)/tracking.tsx:395-432` (cleanupTracking)

### Risultato

- La ScrollView non usa più `pointerEvents` globale
- Gli elementi di navigazione (pulsante Stop, pausa) rimangono sempre toccabili
- Solo i controlli configurazione (GPS freq, Hands-Off, 0-100 toggle) vengono
bloccati durante la guida

---
## #693 — Guida utente: abilitare 'Sempre' per GPS in background (opzionale)

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 12:47:26 UTC |
| **Aggiornato** | 2026-04-18 12:53:33 UTC |

### Richiesta

# Guida utente: abilitare 'Sempre' per GPS in background

  ## What & Why
  Con OTA-91, la richiesta del permesso background GPS è stata rimossa dall'avvio del tracking per non bloccare l'utente. Tuttavia, senza il permesso "Sempre", il tracking si interrompe quando lo schermo si spegne. Sarebbe utile mostrare una guida contestuale (es. banner o modale) che spiega come abilitare il permesso background GPS nelle impostazioni, attivata solo quando l'utente esplicitamente va in background (AppState change) e il permesso non è concesso.

  ## Done looks like
  - Un banner o tooltip compare nella schermata tracking SOLO se bgPermGranted è false e l'app è in background
  - La guida spiega in modo semplice come andare in Impostazioni → App → BikerLink → Posizione → Sempre
  - Non blocca l'avvio del tracking
  - Scompare automaticamente dopo qualche secondo o al tap

  ## Relevant files
  - app/(tabs)/tracking.tsx (handleAppStateChange, bgPermGranted state)

### Risultato

- Un banner o tooltip compare nella schermata tracking SOLO se bgPermGranted è false e l'app è in background
- La guida spiega in modo semplice come andare in Impostazioni → App → BikerLink → Posizione → Sempre
- Non blocca l'avvio del tracking
- Scompare automaticamente dopo qualche secondo o al tap

---
## #697 — Mostra semaforo GPS prima di avviare un giro

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 13:43:32 UTC |
| **Aggiornato** | 2026-04-18 14:03:29 UTC |

### Richiesta

# Mostra semaforo GPS prima di avviare un giro

  ## What & Why
  Dopo il fix del crash OTA-92, l'utente vede il pulsante Start anche quando il GPS non è ancora agganciato. Avviare un giro con GPS scarso può produrre tracciati imprecisi o un errore "GPS non disponibile". Un semaforo visivo (Ottimo/Buono/Scarso) sulla schermata di tracciamento prima di premere Start aiuterebbe l'utente ad aspettare il segnale sufficiente.

  ## Done looks like
  - Indicatore colorato sotto il pulsante Start che mostra la qualità del segnale GPS in tempo reale
  - Il pulsante Start rimane tappable ma mostra un avviso se la precisione è scarsa (>30m)
  - Nessuna regressione sul comportamento attuale del tracking

  ## Relevant files
  - `app/(tabs)/tracking.tsx` (gpsAccuracy state, getAccuracyTier, pulsante Start)

### Risultato

- Indicatore colorato sotto il pulsante Start che mostra la qualità del segnale GPS in tempo reale
- Il pulsante Start rimane tappable ma mostra un avviso se la precisione è scarsa (>30m)
- Nessuna regressione sul comportamento attuale del tracking
## Relevant files

---
## #699 — Mostra una dashboard degli errori GPS nel pannello admin

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 14:06:43 UTC |
| **Aggiornato** | 2026-04-18 14:19:26 UTC |

### Richiesta

# Mostra una dashboard degli errori GPS nel pannello admin

  ## What & Why
  Attualmente gli errori GPS vengono loggati sul server e inviati via email. Non c'è un modo rapido per vedere la lista e la frequenza degli errori direttamente nell'app admin senza dover leggere le email.

  ## Done looks like
  - Il pannello admin ha una sezione "Error Log" che mostra gli errori GPS salvati nel DB
  - Ogni riga mostra: timestamp, OTA, piattaforma, messaggio errore, contesto
  - Si può filtrare per OTA o piattaforma
  - Gli errori vengono persistiti nel DB (tabella `error_logs` o simile)

  ## Relevant files
  - `server/routes/errors.ts` (aggiungere persistenza su DB)
  - `server/routes/admin.ts` (endpoint lista errori)
  - `app/(tabs)/admin.tsx` o pannello admin esistente

### Risultato

- Il pannello admin ha una sezione "Error Log" che mostra gli errori GPS salvati nel DB
- Ogni riga mostra: timestamp, OTA, piattaforma, messaggio errore, contesto
- Si può filtrare per OTA o piattaforma
- Gli errori vengono persistiti nel DB (tabella `error_logs` o simile)

---
## #701 — Mostra nel profilo l'OTA attiva letta da expo-updates (non hardcoded)

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 14:13:57 UTC |
| **Aggiornato** | 2026-04-18 14:31:49 UTC |

### Richiesta

# Mostra nel profilo l'OTA attiva letta da expo-updates (non hardcoded)

  ## What & Why
  CURRENT_OTA_NUMBER è ancora un valore hardcoded in profile.tsx che deve essere aggiornato manualmente prima di ogni OTA. Il check automatico (ota-guard) avvisa se dimentica, ma il valore rimane duplicato tra profile.tsx e ota-updates.json.

  Un'alternativa più robusta: leggere il numero OTA direttamente dall'updateId di expo-updates (Updates.updateId) e fare un lookup nel registro ota-updates.json servito dall'API, eliminando la costante hardcoded.

  ## Done looks like
  - CURRENT_OTA_NUMBER rimosso da profile.tsx
  - Il profilo legge il numero OTA corrente dall'updateId fornito da expo-updates (lookup verso l'API o il registro)
  - L'ota-guard non deve più controllare la costante hardcoded (controllo aggiornato o rimosso)

  ## Relevant files
  - `app/(tabs)/profile.tsx` (riga 134: const CURRENT_OTA_NUMBER = 92)
  - `ota-updates.json` (source of truth)
  - `scripts/validate-ota.sh` (check #3 da aggiornare)
  - `server/routes/` (eventuale endpoint /api/ota/lookup?updateId=...)

### Risultato

- CURRENT_OTA_NUMBER rimosso da profile.tsx
- Il profilo legge il numero OTA corrente dall'updateId fornito da expo-updates (lookup verso l'API o il registro)
- L'ota-guard non deve più controllare la costante hardcoded (controllo aggiornato o rimosso)
## Relevant files

---
## #703 — Audit completo di tutte le chiamate watchPositionAsync nell'app

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 14:23:53 UTC |
| **Aggiornato** | 2026-04-18 14:30:07 UTC |

### Richiesta

# Audit completo watchPositionAsync nell'app

  ## What & Why
  Tre OTA consecutive (91, 92, 93) sono state necessarie per correggere crash causati da watchPositionAsync non protetto. Ogni fix è stato chirurgico su un punto specifico scoperto dopo il crash. Non è mai stato fatto un audit sistematico di *tutte* le chiamate watchPositionAsync nell'intera codebase, né in altri file oltre tracking.tsx.

  ## Done looks like
  - Ricerca di tutte le occorrenze di watchPositionAsync in tutta la codebase (tracking.tsx, app/_layout.tsx, components/InteractiveMap.tsx, app/route/tracking.tsx, ecc.)
  - Ogni chiamata ha try-catch oppure .catch() appropriato
  - Nessuna Promise rejection non catturata relativa al GPS può causare crash Hermes
  - Documentazione nel codice (commento breve) di ogni punto di gestione errori GPS

  ## Relevant files
  - `app/(tabs)/tracking.tsx` (già fixato in OTA-92/93)
  - `app/_layout.tsx` (riga ~121 — watchPositionAsync nel layout root)
  - `components/InteractiveMap.tsx` (riga ~218 — watchPositionAsync nella mappa)
  - `app/route/tracking.tsx` (riga ~157 — watchPositionAsync nel tracking per route)

### Risultato

## Relevant files
- `app/(tabs)/tracking.tsx` (già fixato in OTA-92/93)
- `app/_layout.tsx` (riga ~121 — watchPositionAsync nel layout root)
- `components/InteractiveMap.tsx` (riga ~218 — watchPositionAsync nella mappa)

---
## #704 — Prevent accidental re-introduction of duplicate OTA constants

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 14:35:45 UTC |
| **Aggiornato** | 2026-04-18 14:41:08 UTC |

### Richiesta

# Prevent accidental re-introduction of duplicate OTA constants

  ## What & Why
  Now that `CURRENT_OTA_NUMBER` lives exclusively in `lib/ota.ts`, there is no automated check that prevents a developer (or agent) from accidentally defining the constant again in another file (e.g. a copy-paste into a new screen). The existing `scripts/validate-ota.sh` validates that the number matches `ota-updates.json`, but does not verify that the constant is defined in only one place.

  ## Done looks like
  - `scripts/validate-ota.sh` includes a new check (e.g. check 8) that scans the whole codebase for `CURRENT_OTA_NUMBER\s*=\s*[0-9]+` and fails if any match is found outside `lib/ota.ts`
  - The check prints a clear error message naming the offending file(s)
  - The script still exits 0 when only `lib/ota.ts` defines the constant

  ## Relevant files
  - `scripts/validate-ota.sh` — add the new grep-based check here
  - `lib/ota.ts` — the one allowed definition

### Risultato

- `scripts/validate-ota.sh` includes a new check (e.g. check 8) that scans the whole codebase for `CURRENT_OTA_NUMBER\s*=\s*[0-9]+` and fails if any match is found outside `lib/ota.ts`
- The check prints a clear error message naming the offending file(s)
- The script still exits 0 when only `lib/ota.ts` defines the constant
## Relevant files

---
## #709 — Verifica che il crash all'avvio sia risolto — analisi beacon OTA-96

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 15:57:47 UTC |
| **Aggiornato** | 2026-05-01 07:58:56 UTC |

### Richiesta

# Verifica che il crash all'avvio sia risolto — analisi beacon OTA-96

  ## Cosa & Perché
  OTA-96 ha introdotto beacon diagnostici in startTracking (watchPositionResolved, onNativeLocation:error) e reso accessibile il POST /api/admin/client-error. Dopo che gli utenti ricevono l'aggiornamento, i log di produzione devono mostrare il punto esatto del crash per confermare che sia risolto o per localizzare un crash residuo.

  ## Done looks like
  - I deployment log mostrano [CLIENT-ERROR] con messaggi errore degli utenti
  - I beacon beacon startTracking:watchPositionResolved presenti senza crash successivi confermano fix
  - Se appare ancora un crash, il beacon esatto indica dove agire

  ## Procedura
  1. Analizzare i deployment log di biker-link.replit.app per beacon onNativeLocation:error e startTracking:watchPositionResolved
  2. Verificare [CLIENT-ERROR] nei log per messaggi dal device degli utenti
  3. Se crash persiste, aprire Task per fix specifico basato sul nuovo beacon

  ## File rilevanti
  - `app/(tabs)/tracking.tsx` — beacon GPS e startTracking
  - `server/routes/admin.ts` — endpoint /api/admin/client-error
  - `lib/ota.ts` — CURRENT_OTA_NUMBER = 96

### Risultato

## File rilevanti
- `app/(tabs)/tracking.tsx` — beacon GPS e startTracking
- `server/routes/admin.ts` — endpoint /api/admin/client-error
- `lib/ota.ts` — CURRENT_OTA_NUMBER = 96

---
## #711 — Fermare il watcher GPS di sistema durante il tracciamento attivo

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 16:13:02 UTC |
| **Aggiornato** | 2026-04-18 16:20:21 UTC |

### Richiesta

# Fermare il watcher GPS di sistema durante il tracciamento attivo

  ## Cosa & Perché
  Quando l'utente inizia a registrare un giro, nell'app sono attivi SIMULTANEAMENTE:
  - Il watcher GPS di _layout.tsx (Accuracy.Balanced, ogni 30s — aggiorna la posizione sulla mappa)
  - Il watcher GPS di tracking.tsx (Accuracy.High, ogni 15s — registra il percorso)

  Questo significa 2 subscription GPS attive in parallelo sul GPS nativo Android. Anche se Android gestisce correttamente le richieste multiple, questa ridondanza aumenta il consumo di batteria e potenzialmente la pressione sul GPS system. Durante il tracking, il watcher di _layout.tsx è ridondante (il tracking già aggiorna la posizione tramite onNativeLocation).

  ## Cosa fare
  1. In _layout.tsx AppStateHandler: esporre via contesto (LocationProvider o nuovo TrackingContext) una funzione pauseLayoutWatcher() / resumeLayoutWatcher()
  2. In tracking.tsx startTracking: chiamare pauseLayoutWatcher() prima di watchPositionAsync
  3. In tracking.tsx cleanupTracking: chiamare resumeLayoutWatcher() per riattivare il watcher dopo lo stop

  ## File rilevanti
  - `app/_layout.tsx` — AppStateHandler, startNativeWatcher, stopNativeWatcher (L92-200)
  - `app/(tabs)/tracking.tsx` — startTracking (L869), cleanupTracking (L430)
  - `lib/location-context.tsx` — LocationProvider (possibile punto di coordinamento)

### Risultato

## File rilevanti
- `app/_layout.tsx` — AppStateHandler, startNativeWatcher, stopNativeWatcher (L92-200)
- `app/(tabs)/tracking.tsx` — startTracking (L869), cleanupTracking (L430)
- `lib/location-context.tsx` — LocationProvider (possibile punto di coordinamento)

---
## #712 — Automatically delete orphaned routes directly from the database on a schedule

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 16:22:35 UTC |
| **Aggiornato** | 2026-04-18 16:29:17 UTC |

### Richiesta

# Automatically delete orphaned routes from the database on a schedule

  ## What & Why
  The current cleanup only hides orphaned routes from the GET /api/routes response and cleans them up client-side on next startTracking. Orphaned routes (created before a crash, with totalDistanceKm=0 and no GPS points) remain permanently in the database. A server-side background job or periodic cleanup would remove them from storage entirely, keeping the DB clean.

  ## Done looks like
  - A scheduled task or cron-style cleanup runs periodically (e.g. every hour) on the server
  - Orphaned routes older than 10 minutes with 0 distance and 0 GPS points are deleted from the DB
  - OR: the DELETE is performed server-side on every GET /api/routes call (delete instead of just filter)

  ## Relevant files
  - `server/routes/tracking.ts` — GET handler currently filters orphans, should also delete them
  - `server/storage.ts` — deleteRoute and getRoutes methods

### Risultato

- A scheduled task or cron-style cleanup runs periodically (e.g. every hour) on the server
- Orphaned routes older than 10 minutes with 0 distance and 0 GPS points are deleted from the DB
- OR: the DELETE is performed server-side on every GET /api/routes call (delete instead of just filter)
## Relevant files

---
## #714 — Stop layout watcher durante tracking attivo

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 17:06:29 UTC |
| **Aggiornato** | 2026-04-18 17:37:30 UTC |

### Richiesta

# Stop layout watcher durante tracking attivo

## What & Why
Il watcher GPS nativo in `_layout.tsx` (`startNativeWatcher`) aggiorna continuamente la posizione globale dell'utente. Quando la schermata di tracking è attiva, questo watcher entra in conflitto con il watcher di tracking in `tracking.tsx`: entrambi chiedono aggiornamenti GPS in parallelo, sprecando batteria e potenzialmente causando race condition sullo stato della posizione.

La soluzione è sospendere il native watcher di `_layout.tsx` per tutta la durata di una sessione di tracking attiva, e riprenderlo alla fine.

## Done looks like
- Durante una sessione di misurazione giro, il watcher globale di posizione è sospeso
- Al termine (stop o crash della sessione), il watcher globale viene ripreso automaticamente
- Nessun doppio aggiornamento GPS visibile nei log durante il tracking

## Out of scope
- Modifiche all'algoritmo di tracking (frequenza, accuratezza)
- Modifiche al layout del tab di tracking

## Steps
1. **Esponi flag isTracking via context o global ref** — Aggiungere un meccanismo (es. ref condiviso o context boolean) che `tracking.tsx` può impostare a true quando il tracking è attivo e false quando si ferma.

2. **Guarda il flag in `_layout.tsx`** — In `startNativeWatcher`, controllare il flag prima di avviare e all'interno del loop di polling: se `isTracking=true`, saltare l'aggiornamento. Riprendere automaticamente quando `isTracking` torna false.

## Relevant files
- `app/_layout.tsx`
- `app/(tabs)/tracking.tsx`

### Risultato

- Durante una sessione di misurazione giro, il watcher globale di posizione è sospeso
- Al termine (stop o crash della sessione), il watcher globale viene ripreso automaticamente
- Nessun doppio aggiornamento GPS visibile nei log durante il tracking

---
## #715 — Cleanup rotte GPS orfane al riavvio tracking

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 17:06:29 UTC |
| **Aggiornato** | 2026-04-18 17:37:35 UTC |

### Richiesta

# Cleanup rotte GPS orfane al riavvio tracking

## What & Why
Quando la schermata di tracking viene chiusa bruscamente (crash, home button, cambio tab), possono rimanere task di background GPS (`BG_LOCATION_TASK`) e subscription `watchPositionAsync` non terminati. OTA-97 ha già aggiunto una difesa in `startTracking`, ma non gestisce i punti GPS in sospeso sul server (route create ma mai concluse) né pulisce eventuali sessioni zombie nel DB.

## Done looks like
- Al prossimo avvio di tracking, la UI mostra solo la nuova sessione — nessuna rotta "pending" orfana
- Le route nel DB senza `endedAt` più vecchie di N ore vengono marcate come abbandonate (o eliminate)
- Nessun punto GPS orfano inviato alla route sbagliata dopo un riavvio

## Out of scope
- Modifiche all'algoritmo di tracking in tempo reale
- UI per visualizzare/recuperare sessioni interrotte

## Steps
1. **Endpoint backend cleanup** — Aggiungere endpoint `POST /api/routes/:id/abandon` che imposta `endedAt=now()` e `status='abandoned'` alle route orfane (senza `endedAt`) appartenenti all'utente corrente.

2. **Chiamata cleanup all'avvio tracking** — In `startTracking` di `tracking.tsx`, prima di creare una nuova route, chiamare l'endpoint di cleanup per chiudere eventuali route orfane precedenti.

## Relevant files
- `app/(tabs)/tracking.tsx`
- `server/routes/routes.ts`

### Risultato

- Al prossimo avvio di tracking, la UI mostra solo la nuova sessione — nessuna rotta "pending" orfana
- Le route nel DB senza `endedAt` più vecchie di N ore vengono marcate come abbandonate (o eliminate)
- Nessun punto GPS orfano inviato alla route sbagliata dopo un riavvio

---
## #722 — Reintrodurre il GPS nel cronometro (OTA-103)

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 19:35:07 UTC |
| **Aggiornato** | 2026-04-18 19:36:44 UTC |

### Richiesta

# Reintrodurre il GPS nel cronometro (OTA-103)

  ## What & Why
  Dopo aver verificato che il tab "Registra giro" non crasha più con il cronometro minimale (OTA-102), il primo passo del rebuild incrementale è aggiungere il tracciamento GPS in foreground per misurare distanza percorsa e velocità durante il cronometro. Questo è il primo dei 6 step di reintroduzione pianificati.

  ## Done looks like
  - Quando l'utente preme START, il cronometro parte E inizia il watchPosition GPS in foreground.
  - Sotto il display HH:MM:SS appaiono distanza (km) e velocità istantanea (km/h).
  - STOP ferma sia cronometro sia GPS e azzera entrambi.
  - Pubblicata OTA-103 (CURRENT_OTA_NUMBER=103, entry in ota-updates.json).
  - Confermato sull'APK che il tab continua a NON crashare.

  ## Relevant files
  - `app/(tabs)/tracking.tsx` (file minimale OTA-102 da estendere)
  - `app/(tabs)/tracking.legacy.tsx.bak` (riferimento per logica watchPosition pre-esistente)
  - `lib/ota.ts`
  - `ota-updates.json`
  - `scripts/publish-ota.sh`

  ## Note importanti
  - Aggiungere SOLO `expo-location` (foreground watchPosition). Non aggiungere expo-task-manager, expo-sensors o background location in questo step.
  - Mantenere import minimale; non riportare AsyncStorage, MiniPlayer, TrackingMap.
  - Se anche OTA-103 crasha → il colpevole era expo-location stesso (o le sue versioni native nel runtime 7.0.0).

### Risultato

## Note importanti
- Aggiungere SOLO `expo-location` (foreground watchPosition). Non aggiungere expo-task-manager, expo-sensors o background location in questo step.
- Mantenere import minimale; non riportare AsyncStorage, MiniPlayer, TrackingMap.
- Se anche OTA-103 crasha → il colpevole era expo-lo

_(troncato)_

---
## #723 — Reintrodurre la mappa Leaflet nel cronometro (OTA-104+)

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 19:35:07 UTC |
| **Aggiornato** | 2026-04-18 19:36:44 UTC |

### Richiesta

# Reintrodurre la mappa Leaflet nel cronometro

  ## What & Why
  Dopo OTA-103 (GPS), aggiungere la mappa Leaflet (TrackingMap) per mostrare la traccia del giro in tempo reale. Step incrementale del rebuild della schermata di tracking.

  ## Done looks like
  - Sopra il cronometro appare la mappa Leaflet centrata sulla posizione corrente.
  - La traccia GPS viene disegnata in tempo reale come polyline sulla mappa.
  - Tab continua a non crashare sull'APK.
  - Pubblicata l'OTA corrispondente.

  ## Relevant files
  - `app/(tabs)/tracking.tsx`
  - `components/TrackingMap.tsx`
  - `components/LeafletTrackingMap.tsx`

  ## Note
  - Solo dopo che OTA-103 è confermata stabile.
  - Mantenere isolata: non aggiungere ancora sensori/background/MiniPlayer.

### Risultato

- Sopra il cronometro appare la mappa Leaflet centrata sulla posizione corrente.
- La traccia GPS viene disegnata in tempo reale come polyline sulla mappa.
- Tab continua a non crashare sull'APK.
- Pubblicata l'OTA corrispondente.

---
## #724 — Reintrodurre sensori, background tracking, salvataggio giro e musica

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 19:35:07 UTC |
| **Aggiornato** | 2026-04-18 19:36:44 UTC |

### Richiesta

# Reintrodurre sensori, background tracking, salvataggio giro e musica

  ## What & Why
  Step finali del rebuild della schermata "Registra giro", da fare uno alla volta dopo che mappa+GPS sono confermati stabili:

  1. **OTA-105 — sensori**: `expo-sensors` / DeviceMotion per accelerazione e inclinazione.
  2. **OTA-106 — background**: `expo-task-manager` + background location task per registrare il giro anche con app in background.
  3. **OTA-107 — salvataggio**: integrazione React Query con backend per salvare il giro completato (route, stats, foto).
  4. **OTA-108 — musica**: reintrodurre `InlineMiniPlayer` per controllo Spotify/Last.fm durante il giro.

  ## Done looks like
  - Tutte le 4 OTA pubblicate progressivamente.
  - A ogni step, l'APK conferma "non crasha".
  - Funzionalità complete come nel `tracking.legacy.tsx.bak` originale, ma stabilizzate.
  - Eliminato `tracking.legacy.tsx.bak` quando il nuovo file copre tutta la funzionalità.

  ## Relevant files
  - `app/(tabs)/tracking.tsx`
  - `app/(tabs)/tracking.legacy.tsx.bak` (riferimento da consultare/eliminare a fine ciclo)
  - `lib/tracking-active.ts`, `lib/startup-beacon.ts`
  - `components/MiniPlayer.tsx`
  - backend endpoints di salvataggio giro

  ## Note
  - Procedere SEMPRE una OTA alla volta, attendendo conferma utente "non crasha" tra una e l'altra.
  - Se uno step crasha, abbiamo trovato il colpevole reale del crash storico.

### Risultato

## Note
- Procedere SEMPRE una OTA alla volta, attendendo conferma utente "non crasha" tra una e l'altra.
- Se uno step crasha, abbiamo trovato il colpevole reale del crash storico.

---
## #729 — Show speed and distance in preferred units on ride detail and public route screens

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 21:35:13 UTC |
| **Aggiornato** | 2026-04-18 21:39:52 UTC |

### Richiesta

# Show speed and distance in preferred units on ride detail and public route screens

  ## What & Why
  The tracking screen now respects unit preferences, but several other screens still
  hardcode "km/h" and "km" regardless of the user's settings:
  - `app/route/[id].tsx` — ride detail page (avgSpeedKmh, maxSpeedKmh, totalDistanceKm)
  - `app/routes/index.tsx` — public routes list (totalDistanceKm)
  - `app/routes/user/[userId].tsx` — user route list (totalDistanceKm)
  - `app/(tabs)/contest.tsx` — leaderboard (totalDistanceKm, maxSpeedKmh)

  ## Done looks like
  - All the screens above import `useUnits()` from `lib/units-context`
  - Speed and distance values are converted before display using the same helpers
    already in `app/(tabs)/tracking.tsx`
  - Unit labels update automatically alongside values

  ## Relevant files
  - `lib/units-context.tsx` — context to consume
  - `app/route/[id].tsx`
  - `app/routes/index.tsx`
  - `app/routes/user/[userId].tsx`
  - `app/(tabs)/contest.tsx`
  - Conversion helpers can be extracted to a shared `lib/units-convert.ts` module

### Risultato

- All the screens above import `useUnits()` from `lib/units-context`
- Speed and distance values are converted before display using the same helpers
already in `app/(tabs)/tracking.tsx`
- Unit labels update automatically alongside values

---
## #730 — Let users enter the hands-off speed threshold in their preferred unit

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 21:35:13 UTC |
| **Aggiornato** | 2026-04-18 21:39:52 UTC |

### Richiesta

# Let users enter the hands-off speed threshold in their preferred unit

  ## What & Why
  The tracking screen has a "hands-off" mode where the screen locks when speed
  exceeds a threshold the user types in (default 50). This input is always shown
  as "km/h" even when the user has selected mph or knots in their profile. Users
  in mph mode have to mentally convert the threshold they want.

  ## Done looks like
  - The threshold input label shows the user's chosen speed unit instead of "km/h"
  - The displayed/entered value is in the user's chosen unit
  - The internal trigger logic still operates in km/h (convert the stored value back
    before comparing against GPS speed in km/h)

  ## Relevant files
  - `app/(tabs)/tracking.tsx` — look for `handsOffSpeedStr` state, `handsOffUnit`
    label around line 1003, and the threshold comparison in the GPS update handler
  - `lib/units-context.tsx` — `useUnits()` for current `speedUnit`

### Risultato

- The threshold input label shows the user's chosen speed unit instead of "km/h"
- The displayed/entered value is in the user's chosen unit
- The internal trigger logic still operates in km/h (convert the stored value back
before comparing against GPS speed in km/h)

---
## #731 — Show speed in preferred units during live ride tracking

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 21:44:54 UTC |
| **Aggiornato** | 2026-04-18 22:40:28 UTC |

### Richiesta

# Show speed in preferred units during live ride tracking

  ## What & Why
  Task #728 applied unit preferences to history and statistics screens. The live tracking screen (app/(tabs)/tracking.tsx) still shows current speed, max speed, average speed, and distance in hardcoded km and km/h during an active ride. Users who prefer miles or knots should see consistent units across all parts of the app.

  ## Done looks like
  - Live tracking speed display (the large speedometer number) converts to the user's preferred speed unit
  - Active tracking StatCards for max speed, average speed, and total distance use the correct units
  - Labels update dynamically (km/h → mph or kn)

  ## Relevant files
  - `app/(tabs)/tracking.tsx` — live speed display around lines 969–1140, live StatCards section
  - `lib/units-context.tsx` — useUnits() hook already available
  - `lib/units.ts` — formatDistance, formatSpeed helpers (created in task #728)

### Risultato

- Live tracking speed display (the large speedometer number) converts to the user's preferred speed unit
- Active tracking StatCards for max speed, average speed, and total distance use the correct units
- Labels update dynamically (km/h → mph or kn)
## Relevant files

---
## #732 — Apply preferred units to other users' public profiles and shared route views

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 21:44:54 UTC |
| **Aggiornato** | 2026-04-18 22:40:28 UTC |

### Richiesta

# Apply preferred units to other users' public profiles and shared route views

  ## What & Why
  Task #728 applied unit preferences to the logged-in user's own statistics screen. When viewing another biker's public profile or a shared route (published to the feed), distances and speeds are still displayed in hardcoded km/km/h. Users who prefer miles or knots see inconsistent units.

  ## Done looks like
  - Public profile screens import useUnits() and format totalKm and ride stats in the viewer's preferred units
  - Any "published routes" or shared ride feed cards also respect the viewer's unit preferences

  ## Relevant files
  - `app/(tabs)/tracking.tsx` — published routes feed, RecordCard already updated but check publish modal
  - `lib/units.ts` — formatDistance, formatSpeed helpers (created in task #728)

### Risultato

- Public profile screens import useUnits() and format totalKm and ride stats in the viewer's preferred units
- Any "published routes" or shared ride feed cards also respect the viewer's unit preferences
## Relevant files
- `app/(tabs)/tracking.tsx` — published routes feed, RecordCard already updated but check publish modal

---
## #738 — Ricalibra G anche in modalità 0-100 sprint

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 23:36:07 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

# Ricalibra G anche in modalità 0-100 sprint

  ## What & Why
  Il pulsante "Ricalibra" è attualmente visibile solo nella stats grid normale.
  Quando l'utente usa la modalità 0-100, le card G (G istantaneo, G max accel, G max frenata)
  nella sezione sprint non hanno il pulsante di ricalibrazione. Se il telefono viene
  riposizionato durante una sessione 0-100, la baseline è errata.

  ## Done looks like
  - La card "G istantaneo" (o una delle card G nella sezione sprint) mostra "Ricalibra"
    durante phase === "active" && sprintPhase === "waiting" (non durante la misurazione)
  - Stessa logica esistente: isCalibrating mostra "Calibro..." e azzera i valori G max

  ## Relevant files
  - `app/(tabs)/tracking.tsx` righe ~1265-1300 (sezione sprint G cards)
  - handleRecalibrate() e isCalibrating già implementati nel componente

### Risultato

- La card "G istantaneo" (o una delle card G nella sezione sprint) mostra "Ricalibra"
durante phase === "active" && sprintPhase === "waiting" (non durante la misurazione)
- Stessa logica esistente: isCalibrating mostra "Calibro..." e azzera i valori G max
## Relevant files

---
## #739 — Sincronizza i giri recuperati con il server dopo il recupero offline

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-18 23:42:45 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

# Sincronizza i giri recuperati con il server dopo il recupero offline

  ## What & Why
  Quando l'utente sceglie "Recupera" un giro interrotto, i dati rimangono solo in memoria locale
  (come da spec attuale). I giri recuperati non vengono creati come route sul server e quindi non
  compaiono nella cronologia persistente. Un utente che chiude e riapre l'app perde i dati recuperati.

  ## Done looks like
  - Dopo "Recupera", creare una route sul server con POST /api/routes, POST /api/routes/:id/points (con i punti del buffer), PUT /api/routes/:id/stop (con le statistiche ricalcolate)
  - Il giro appare nella lista "I miei giri" come tutti gli altri
  - Se la sincronizzazione fallisce (offline), il LocalRouteRecord rimane visibile con un pulsante "Riprova"

  ## Relevant files
  - `app/(tabs)/tracking.tsx` useEffect orphan check (righe ~512-570)
  - `server/routes/tracking.ts` endpoint POST /api/routes e PUT /api/routes/:id/stop

### Risultato

- Dopo "Recupera", creare una route sul server con POST /api/routes, POST /api/routes/:id/points (con i punti del buffer), PUT /api/routes/:id/stop (con le statistiche ricalcolate)
- Il giro appare nella lista "I miei giri" come tutti gli altri
- Se la sincronizzazione fallisce (offline), il LocalRouteRecord rimane visibile con un pulsante "Riprova"
## Relevant files

---
## #741 — Mostra la mappa del percorso anche nei giri condivisi su Pic!

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-19 00:34:22 UTC |
| **Aggiornato** | 2026-04-19 00:42:47 UTC |

### Richiesta

# Mostra la mappa del percorso anche nei giri condivisi su Pic!

  ## What & Why
  Quando un utente pubblica un giro su Pic!, le statistiche vengono condivise ma non la mappa del percorso. Aggiungere una preview della mappa nel post aumenterebbe l'engagement e farebbe capire meglio il tragitto.

  ## Done looks like
  - Il post Pic! include una mappa statica o WebView con il percorso del giro
  - La mappa usa buildLeafletPostRideHtml già presente in lib/leaflet-route-map-html.ts
  - I punti GPS vengono passati dal routeId del record

  ## Relevant files
  - `app/(tabs)/tracking.tsx` (publish modal, PublishModal section)
  - `lib/leaflet-route-map-html.ts` (buildLeafletPostRideHtml)
  - `server/routes/tracking.ts` (GET /:id restituisce già i points)

### Risultato

- Il post Pic! include una mappa statica o WebView con il percorso del giro
- La mappa usa buildLeafletPostRideHtml già presente in lib/leaflet-route-map-html.ts
- I punti GPS vengono passati dal routeId del record
## Relevant files

---
## #744 — Rimuovere il badge BETA dai sensori G quando confermati stabili

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-19 01:29:00 UTC |
| **Aggiornato** | 2026-04-19 01:34:28 UTC |

### Richiesta

# Promuovere i sensori G da BETA a stabile

  ## What & Why
  Il toggle "Sensori telefono (G)" è stato rilasciato con badge BETA e default OFF per
  sicurezza (OTA-112). Dopo aver raccolto feedback dagli utenti, se i sensori funzionano
  senza freeze, rimuovere il badge BETA, portare il default a ON, e considerare di far
  partire l'accelerometro automaticamente quando l'utente abilita il trigger 0-100.

  ## Done looks like
  - Badge BETA rimosso dalla label "Sensori telefono (G)"
  - Default `sensorsEnabled` cambiato da `false` a `true`
  - Opzionale: se 0-100 è attivo, sensori automaticamente ON (con nota informativa)
  - OTA pubblicata con le modifiche

  ## Relevant files
  - `app/(tabs)/tracking.tsx` — stato sensorsEnabled e toggle nel pannello pre-avvio

### Risultato

- Badge BETA rimosso dalla label "Sensori telefono (G)"
- Default `sensorsEnabled` cambiato da `false` a `true`
- Opzionale: se 0-100 è attivo, sensori automaticamente ON (con nota informativa)
- OTA pubblicata con le modifiche

---
## #748 — Aggiungere link alla Privacy Policy direttamente nell'app

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-19 09:20:43 UTC |
| **Aggiornato** | 2026-04-19 09:24:10 UTC |

### Richiesta

# Aggiungere link alla Privacy Policy nell'app

  ## What & Why
  La Privacy Policy è ora disponibile all'URL /privacy sul server, ma non è raggiungibile dall'interno dell'app.
  Google Play e Apple richiedono che la privacy policy sia accessibile direttamente in-app (non solo via URL esterno).
  Va aggiunto un link nella schermata delle impostazioni e/o nella schermata di registrazione/accettazione EULA.

  ## Done looks like
  - Un link "Privacy Policy" visibile nelle impostazioni dell'app (tab Profilo o Settings)
  - Il link apre la WebView o il browser con l'URL /privacy del backend
  - Il link è presente anche nella schermata di registrazione / accettazione EULA
  - Il testo "bikerlinkapp@gmail.com" è cliccabile per aprire il client email

  ## Relevant files
  - `app/(tabs)/profile.tsx` — schermata profilo/impostazioni dove aggiungere il link
  - `components/` — eventuali componenti modal/sheet per EULA
  - Server: `https://[dominio]/privacy` già attivo

### Risultato

- Un link "Privacy Policy" visibile nelle impostazioni dell'app (tab Profilo o Settings)
- Il link apre la WebView o il browser con l'URL /privacy del backend
- Il link è presente anche nella schermata di registrazione / accettazione EULA
- Il testo "bikerlinkapp@gmail.com" è cliccabile per aprire il client email

---
## #749 — Build AAB per pubblicazione Play Store (Google richiede formato bundle)

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-19 09:20:43 UTC |
| **Aggiornato** | 2026-04-19 09:24:10 UTC |

### Richiesta

# Build AAB (Android App Bundle) per Play Store

  ## What & Why
  La guida di submission (docs/playstore-submission-guide.md) utilizza l'APK EAS attuale (versionCode 29).
  Google Play accetta APK ma per la pubblicazione pubblica raccomanda fortemente AAB (Android App Bundle):
  è il formato obbligatorio per le nuove app dal 2021 e consente ottimizzazioni di dimensione per gli utenti.

  ## Done looks like
  - Un file .aab generato tramite EAS Build per il canale "production"
  - Il versionCode è incrementato (30) rispetto all'APK attuale (29)
  - Il file .aab è allegato nella sezione Produzione del Play Console
  - La guida docs/playstore-submission-guide.md viene aggiornata con il link AAB

  ## Relevant files
  - `app.json` — versionCode da aggiornare (attuale: 29)
  - `android/app/build.gradle` — versionCode speculare
  - `docs/playstore-submission-guide.md` — aggiornare link APK → AAB
  - Comando EAS: `eas build --platform android --profile production` (da eseguire via EAS dashboard, NON in locale)

### Risultato

## Relevant files
- `app.json` — versionCode da aggiornare (attuale: 29)
- `android/app/build.gradle` — versionCode speculare
- `docs/playstore-submission-guide.md` — aggiornare link APK → AAB

---
## #755 — Scegliere la visibilità del percorso al momento della creazione

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-19 17:50:24 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

# Scegliere la visibilità del percorso al momento della creazione

  ## What & Why
  Al momento, i nuovi percorsi vengono sempre creati come "Pubblico" per default. L'utente dovrebbe poter scegliere Pubblico/Amici/Privato già in fase di creazione, senza dover tornare nella lista dei percorsi per cambiare la visibilità.

  ## Done looks like
  - Nella schermata di creazione percorso (`app/routes/create.tsx`), aggiungere un selettore a 3 stati (Pubblico / Amici / Privato) con gli stessi colori e icone usati nella lista percorsi
  - Il valore selezionato viene inviato come `visibility` nella POST `/api/custom-routes`
  - Il backend già supporta il campo `visibility` nella POST (implementato in `server/routes/custom-routes.ts`)

  ## Relevant files
  - `app/routes/create.tsx` — aggiungere il selettore di visibilità
  - `server/routes/custom-routes.ts` — già aggiornato, supporta `visibility` nella POST

### Risultato

- Nella schermata di creazione percorso (`app/routes/create.tsx`), aggiungere un selettore a 3 stati (Pubblico / Amici / Privato) con gli stessi colori e icone usati nella lista percorsi
- Il valore selezionato viene inviato come `visibility` nella POST `/api/custom-routes`
- Il backend già supporta il campo `visibility` nella POST (implementato in `server/routes/custom-routes.ts`)
## Relevant files

---
## #756 — Mostra il nome del giro nella lista dei percorsi completati

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-19 18:08:50 UTC |
| **Aggiornato** | 2026-04-19 18:13:06 UTC |

### Richiesta

# Mostra il nome del giro nella lista dei percorsi completati

  ## What & Why
  Con il Task #754 è possibile assegnare un nome al giro alla fine. Però il componente `RecordCard` in `app/(tabs)/tracking.tsx` non mostra il titolo nella lista dei giri completati — l'utente non vede il nome che ha scelto a meno che non apra il dettaglio.

  ## Done looks like
  - La RecordCard mostra il titolo personalizzato (es. "Giro del 19/04 · 17:30" o il nome che l'utente ha inserito) sopra la data
  - Se non c'è titolo, mostra solo la data come fa attualmente
  - Il titolo è troncato a una riga con numberOfLines={1}

  ## Relevant files
  - `app/(tabs)/tracking.tsx` — componente RecordCard (~righe 196-296), interfaccia RouteRecord (~riga 53)
  - Il tipo RouteRecord non include `title`: va aggiunto come `title?: string | null`
  - L'API `GET /api/routes` già restituisce il campo `title` dalla tabella routes

### Risultato

- La RecordCard mostra il titolo personalizzato (es. "Giro del 19/04 · 17:30" o il nome che l'utente ha inserito) sopra la data
- Se non c'è titolo, mostra solo la data come fa attualmente
- Il titolo è troncato a una riga con numberOfLines={1}
## Relevant files

---
## #757 — Rinominare un giro precedente dalla lista dei percorsi

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-19 18:08:50 UTC |
| **Aggiornato** | 2026-04-19 18:13:06 UTC |

### Richiesta

# Rinominare un giro precedente dalla lista dei percorsi

  ## What & Why
  Con il Task #754 l'utente può assegnare un nome solo appena finisce il giro. Se vuole rinominare un giro salvato in precedenza, non c'è modo di farlo. Sarebbe utile poter toccare il titolo di un giro nella lista e modificarlo.

  ## Done looks like
  - Nella RecordCard (o in un dialog), l'utente può toccare il titolo/nome del giro per modificarlo
  - Viene mostrato un Alert con TextInput (o un inline editing) per inserire il nuovo nome
  - La modifica viene salvata via PATCH /api/routes/:id/title (già implementata nel Task #754)
  - Il nome aggiornato compare subito nella lista

  ## Relevant files
  - `app/(tabs)/tracking.tsx` — componente RecordCard (~righe 196-296), RecordCard component
  - `server/routes/tracking.ts` — endpoint PATCH /:id/title già pronto (Task #754)

### Risultato

- Nella RecordCard (o in un dialog), l'utente può toccare il titolo/nome del giro per modificarlo
- Viene mostrato un Alert con TextInput (o un inline editing) per inserire il nuovo nome
- La modifica viene salvata via PATCH /api/routes/:id/title (già implementata nel Task #754)
- Il nome aggiornato compare subito nella lista

---
## #760 — Build and release APK with volume-button Hands-Off support

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-19 18:56:52 UTC |
| **Aggiornato** | 2026-04-19 19:22:24 UTC |

### Richiesta

# Build and release APK with volume-button Hands-Off support

  ## What & Why
  Task #759 added `react-native-volume-manager` (a native module) to enable dismissing the Hands-Off overlay with 5 quick volume-down presses. Because this package contains native Android code, it cannot be shipped via OTA — a new APK build is required for the feature to reach users.

  ## Done looks like
  - A new APK is built with `versionCode: 30` (already set in `app.json`)
  - The APK is distributed via the existing Android release channel
  - Users on the new APK can dismiss Hands-Off by pressing volume-down 5 times within 3 seconds

  ## Relevant files
  - `app.json` (versionCode: 30, runtimeVersion: 7.0.0)
  - `package.json` (react-native-volume-manager dependency)
  - `.agents/skills/bikerlink-ota-publish/SKILL.md` (publish procedure reference)

### Risultato

- A new APK is built with `versionCode: 30` (already set in `app.json`)
- The APK is distributed via the existing Android release channel
- Users on the new APK can dismiss Hands-Off by pressing volume-down 5 times within 3 seconds
## Relevant files

---
## #763 — Admin toggle — Abilita uso sensori telefono

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-04-19 21:27:13 UTC |
| **Aggiornato** | 2026-04-19 21:27:13 UTC |

### Richiesta

# Admin Toggle — Sensori Telefono

## What & Why
Aggiungere un toggle nel pannello admin "Abilita uso sensori telefono" che controlla la visibilità del tasto "Usa sensori telefono" nella schermata "Registra giro e performance". Se disabilitato dall'admin, il tasto sparisce completamente per tutti gli utenti.

## Done looks like
- Nel pannello admin (Impostazioni) compare un nuovo switch "Abilita uso sensori telefono"
- Con il toggle OFF: nella schermata tracking il tasto/switch "Usa sensori telefono" non è visibile
- Con il toggle ON: il tasto torna visibile e funzionante come prima
- Il valore persiste (salvato nel DB come le altre impostazioni)
- Default: disabilitato (OFF) — comportamento cautelativo

## Out of scope
- Modifiche al funzionamento interno dei sensori
- Permessi a livello di singolo utente
- Nessuna notifica push agli utenti al cambio stato

## Steps
1. **Backend — nuova impostazione** — Aggiungere la chiave `sensors-phone-enabled` al sistema di settings esistente (stesso pattern di `sos-enabled`, `ghost-mode-enabled`, ecc.), con valore di default `false`.

2. **Admin Panel — nuovo toggle** — In `app/admin/settings.tsx`, aggiungere uno switch "Abilita uso sensori telefono" nella sezione appropriata (Funzionalità / Features), collegato all'endpoint `/api/settings/sensors-phone-enabled`.

3. **Tracking screen — lettura setting e hide condizionale** — In `app/(tabs)/tracking.tsx`, recuperare il valore di `sensors-phone-enabled` tramite query (stesso pattern delle altre settings lette lato client). Se il valore è `false`, non renderizzare il componente Switch "Usa sensori telefono" (e il relativo stato/logica accelerometro rimane inattivo).

## Relevant files
- `app/(tabs)/tracking.tsx`
- `app/admin/settings.tsx`
- `app/admin/index.tsx`

### Risultato

- Nel pannello admin (Impostazioni) compare un nuovo switch "Abilita uso sensori telefono"
- Con il toggle OFF: nella schermata tracking il tasto/switch "Usa sensori telefono" non è visibile
- Con il toggle ON: il tasto torna visibile e funzionante come prima
- Il valore persiste (salvato nel DB come le altre impostazioni)

---
## #764 — Build APK v30 + AAB + iOS insieme per il Play Store e App Store

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-19 21:46:51 UTC |
| **Aggiornato** | 2026-04-19 22:17:06 UTC |

### Richiesta

# Build APK v30 + AAB + iOS per distribuzione

  ## What & Why
  L'utente vuole fare 2 prove sull'app (OTA 118 già pubblicata) e poi buildare APK v30 + AAB + iOS insieme. Questo è il prossimo passo pianificato dopo il completamento del task #762.

  ## Done looks like
  - APK v30 buildato e testato (include react-native-volume-manager #759)
  - AAB generato per Google Play Store
  - Build iOS pronto per App Store via Expo Launch

  ## Relevant files
  - `app.json` (versionCode, bundleId)
  - `package.json` (versione)
  - `scripts/publish-ota.sh`
  - `ota-updates.json`

### Risultato

- APK v30 buildato e testato (include react-native-volume-manager #759)
- AAB generato per Google Play Store
- Build iOS pronto per App Store via Expo Launch
## Relevant files

---
## #768 — Build APK v30 + AAB + iOS per distribuzione

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-19 22:57:33 UTC |
| **Aggiornato** | 2026-05-01 07:59:08 UTC |

### Richiesta

# Build APK v30 + AAB + iOS

  ## What & Why
  L'APK corrente è la v29. Dopo i task #765 e #766 è il momento di produrre una nuova build nativa che includa tutte le ultime modifiche (toggle sensori G-force, importazione playlist da chat).

  ## Done looks like
  - APK Android v30 generata (per sideload/testing diretto)
  - AAB Android v30 generata (per Google Play Store)
  - Build iOS aggiornata
  - Versione incrementata in app.json (versionCode 30)

  ## Relevant files
  - app.json (versionCode, version)
  - eas.json (build profiles)

### Risultato

- APK Android v30 generata (per sideload/testing diretto)
- AAB Android v30 generata (per Google Play Store)
- Build iOS aggiornata
- Versione incrementata in app.json (versionCode 30)

---
## #775 — Prevent the rest of the Music tab from re-rendering when the search bar updates

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-20 07:24:43 UTC |
| **Aggiornato** | 2026-04-20 07:27:31 UTC |

### Richiesta

# Prevent re-renders from the search input in the Music tab

  ## What & Why
  Similar to the Last.fm form fix, the search input state (searchInput, debouncedQuery) lives in the top-level MusicScreen component. Every keystroke in the search bar triggers a full re-render of MusicScreen and all its children. Extracting the search bar into its own memoized component with local state would reduce re-renders significantly on low-end devices.

  ## Done looks like
  - The search input is in a separate memoized component with its own local state
  - Only the search results section updates on keystroke, not the entire tab
  - MusicScreen receives only the final debounced query via a callback

  ## Relevant files
  - `app/(tabs)/music.tsx` (lines ~740-741: searchInput/debouncedQuery state, search bar JSX)

### Risultato

- The search input is in a separate memoized component with its own local state
- Only the search results section updates on keystroke, not the entire tab
- MusicScreen receives only the final debounced query via a callback
## Relevant files

---
## #786 — Pubblica OTA-127

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-04-20 19:27:00 UTC |
| **Aggiornato** | 2026-04-20 19:27:00 UTC |

### Richiesta

# Pubblica OTA-127

## What & Why
Pubblicare l'aggiornamento OTA-127 per distribuire le modifiche correnti agli utenti Android con APK v29 installato.

## Done looks like
- `CURRENT_OTA_NUMBER` in `lib/ota.ts` aggiornato a 127
- Entry OTA-127 aggiunta in `ota-updates.json` con tutti gli ID reali (releaseId, bundleUrl, updateGroupId, androidUpdateId)
- Entry OTA-126 marcata come `"status": "superseded"`
- Script `bash scripts/publish-ota.sh "1.127.0" "OTA-127: Fix Drive UTF8 + distinzione permessi/quota"` eseguito con successo
- Validazione finale `bash scripts/validate-ota.sh` superata con tutti i check ✔

## Out of scope
- Nessuna modifica al codice — solo pubblicazione OTA del codebase attuale
- Nessuna build APK

## Steps
1. Leggere il commit hash corrente con `git rev-parse HEAD`
2. Aggiornare `CURRENT_OTA_NUMBER` in `lib/ota.ts` da 126 a 127
3. In `ota-updates.json`: marcare l'entry OTA-126 come `"status": "superseded"` e aggiungere la nuova entry OTA-127 con `"status": "pending"` e i campi sconosciuti a `null`
4. Eseguire `bash scripts/publish-ota.sh "1.127.0" "OTA-127: Fix Drive UTF8 + distinzione permessi/quota"` con le credenziali admin
5. Raccogliere gli ID dall'output dello script e aggiornare l'entry OTA-127 in `ota-updates.json` con i valori reali, impostando `"status": "published"`
6. Eseguire `bash scripts/validate-ota.sh` e verificare che tutti i check siano ✔

## Relevant files
- `lib/ota.ts`
- `ota-updates.json`
- `scripts/publish-ota.sh`
- `scripts/validate-ota.sh`

### Risultato

- `CURRENT_OTA_NUMBER` in `lib/ota.ts` aggiornato a 127
- Entry OTA-127 aggiunta in `ota-updates.json` con tutti gli ID reali (releaseId, bundleUrl, updateGroupId, androidUpdateId)
- Entry OTA-126 marcata come `"status": "superseded"`
- Script `bash scripts/publish-ota.sh "1.127.0" "OTA-127: Fix Drive UTF8 + distinzione permessi/quota"` eseguito con successo

---
## #790 — Attivare le nuove funzioni backend in produzione

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-20 20:22:37 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

# Attivare le nuove funzioni backend in produzione

  ## What & Why
  Diversi endpoint aggiunti nelle ultime sessioni (Clear Last.fm cache admin, export Privacy Policy PDF, OAuth Last.fm) non sono ancora attivi sulla versione pubblicata dell'app. Gli utenti in produzione non ne beneficiano.

  ## Done looks like
  - Il backend di produzione viene ridistribuito con le ultime modifiche
  - L'endpoint `GET /api/privacy-policy/export` genera il PDF in produzione
  - L'endpoint `DELETE /api/admin/lastfm/cache` funziona in produzione
  - L'autenticazione OAuth Last.fm è operativa in produzione

  ## Relevant files
  - `server/routes.ts`
  - `scripts/start-backend.sh`
  - `shared/privacy-policy-it.ts`

### Risultato

- Il backend di produzione viene ridistribuito con le ultime modifiche
- L'endpoint `GET /api/privacy-policy/export` genera il PDF in produzione
- L'endpoint `DELETE /api/admin/lastfm/cache` funziona in produzione
- L'autenticazione OAuth Last.fm è operativa in produzione

---
## #794 — Keep the app protected as dependencies update over time

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-20 20:44:02 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

# Periodic security audit automation

  ## What & Why
  After resolving all vulnerabilities with npm overrides, the overrides may drift as upstream packages are updated. There is no automated check to alert when new vulnerabilities appear or when overrides can be removed (because the upstream packages have been fixed natively).

  ## Done looks like
  - A periodic CI/scheduled task (or developer checklist) exists to run `npm audit` and review overrides
  - Overrides for `esbuild` and `@tootallnate/once` in `package.json` are reviewed and updated when upstream fixes land natively
  - Security Center in Replit continues to show 0 active vulnerabilities

  ## Relevant files
  - `package.json` (overrides section)
  - Any CI configuration if added in the future

### Risultato

- A periodic CI/scheduled task (or developer checklist) exists to run `npm audit` and review overrides
- Overrides for `esbuild` and `@tootallnate/once` in `package.json` are reviewed and updated when upstream fixes land natively
- Security Center in Replit continues to show 0 active vulnerabilities
## Relevant files

---
## #801 — Verifica login admin su biker-link.replit.app dopo il deploy

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-20 21:30:13 UTC |
| **Aggiornato** | 2026-04-20 21:31:39 UTC |

### Richiesta

# Verifica login admin su biker-link.replit.app dopo il deploy

  ## What & Why
  Dopo il deploy del backend (Task #800), è necessario verificare manualmente (o tramite script) che il login admin funzioni correttamente su biker-link.replit.app con la nuova password. Attualmente non esiste uno smoke test automatico post-deploy.

  ## Done looks like
  - Il login admin su https://biker-link.replit.app/api/auth/login risponde con 200 e restituisce il profilo admin
  - Uno script bash o curl command documentato in scripts/ verifica l'endpoint di produzione
  - I futuri deploy includono questo controllo come step finale

  ## Relevant files
  - `server/routes/auth.ts` — endpoint POST /api/auth/login
  - `scripts/publish-ota.sh` — script OTA che usa BIKERLINK_BACKEND_URL

### Risultato

- Il login admin su https://biker-link.replit.app/api/auth/login risponde con 200 e restituisce il profilo admin
- Uno script bash o curl command documentato in scripts/ verifica l'endpoint di produzione
- I futuri deploy includono questo controllo come step finale
## Relevant files

---
## #803 — Invia BikerLink all'App Store: build iOS + submission

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-20 21:50:01 UTC |
| **Aggiornato** | 2026-04-20 21:51:12 UTC |

### Richiesta

# Invia BikerLink all'App Store: build iOS + submission

  ## What & Why
  Con i 3 blockers App Store corretti (NSAllowsArbitraryLoads rimosso, chiavi Apple Music
  rimosse, stringhe expo-media-library corrette) e le versioni già aggiornat
  (buildNumber "2", versionCode 31), l'app è pronta per la build EAS e la submission
  all'App Store Review. Il flusso di pubblicazione iOS su Replit è gestito tramite
  Expo Launch (pulsante Publish nella UI di Replit).

  ## Done looks like
  - Build iOS produzione completata senza errori (versionCode 31, buildNumber 2)
  - IPA caricata su App Store Connect
  - Metadati, screenshot e privacy policy già configurati in App Store Connect
  - App Store Review submission avviata

  ## Steps
  1. Cliccare il pulsante "Publish" nella UI di Replit per avviare Expo Launch (build iOS)
  2. Verificare che la build non contenga warning ATS (NSAllowsArbitraryLoads rimosso)
  3. Completare metadati App Store Connect se mancanti (descrizione, categoria, screenshot)
  4. Inviare a review

  ## Relevant files
  - `app.json` (ios.buildNumber: "2", android.versionCode: 31 — pronti)
  - `eas.json` (profili di build configurati)

### Risultato

## Relevant files
- `app.json` (ios.buildNumber: "2", android.versionCode: 31 — pronti)
- `eas.json` (profili di build configurati)

---
## #804 — View OTA update errors in the admin panel

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-20 21:53:30 UTC |
| **Aggiornato** | 2026-04-20 21:55:13 UTC |

### Richiesta

# View OTA update errors in the admin panel

  ## What & Why
  The app now silently reports OTA update failures to `/api/admin/ota-error` in production, but there is no UI to view these events. Adding an admin panel section for OTA errors would help diagnose failed updates before they impact users.

  ## Done looks like
  - Admin panel has an "OTA Errors" section listing recent failures (timestamp, error message, failCount, runtimeVersion, updateId)
  - Errors are persisted in the database (new table or appended to existing admin logs)
  - The endpoint `POST /api/admin/ota-error` stores the payload instead of discarding it

  ## Relevant files
  - `app/_layout.tsx` (OtaStartupChecker — sends errors to /api/admin/ota-error)
  - `server/routes.ts` or equivalent route file (add/update the /api/admin/ota-error endpoint)
  - `app/(tabs)/admin*.tsx` or admin panel screens

### Risultato

- Admin panel has an "OTA Errors" section listing recent failures (timestamp, error message, failCount, runtimeVersion, updateId)
- Errors are persisted in the database (new table or appended to existing admin logs)
- The endpoint `POST /api/admin/ota-error` stores the payload instead of discarding it
## Relevant files

---
## #814 — Genera gli screenshot dell'app nelle dimensioni richieste da App Store

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-21 04:02:25 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

# Genera gli screenshot dell'app nelle dimensioni richieste da App Store

  ## What & Why
  Gli screenshot da caricare su App Store Connect non esistono ancora nel progetto. Apple richiede screenshot con dimensioni precise per ogni formato iPhone supportato.

  ## Done looks like
  - 3 screenshot iPhone 6.5" (1284×2778 px) salvati in `assets/images/screenshots/`
  - 3 screenshot iPhone 5.5" (1242×2208 px) salvati in `assets/images/screenshots/`
  - I file sono pronti per il caricamento su App Store Connect

  ## Steps
  1. Avvia il simulatore iPhone con le dimensioni corrette
  2. Naviga nelle schermate chiave (mappa, chat, profilo)
  3. Cattura gli screenshot con Cmd+S nel simulatore
  4. Ridimensiona se necessario e salva nella cartella `assets/images/screenshots/`

  ## Relevant files
  - `assets/images/screenshots/` (cartella target)

### Risultato

- 3 screenshot iPhone 6.5" (1284×2778 px) salvati in `assets/images/screenshots/`
- 3 screenshot iPhone 5.5" (1242×2208 px) salvati in `assets/images/screenshots/`
- I file sono pronti per il caricamento su App Store Connect
## Steps

---
## #815 — Traduci il link Termini di Servizio in tutte le lingue dell'app

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-21 04:04:47 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

# Traduci il link Termini di Servizio in tutte le lingue dell'app

  ## What & Why
  Il testo "Leggi i Termini di Servizio completi →" aggiunto nella schermata di
  registrazione (step 4 EULA) è hardcoded in italiano. L'app supporta 6 lingue
  (it, en, de, es, fr, tr) tramite il sistema i18n in lib/i18n.ts.

  ## Done looks like
  - La chiave `register.step4.termsLink` aggiunta ai file di traduzione per
    tutte e 6 le lingue supportate
  - Il testo nel componente usa `t("register.step4.termsLink")` al posto della
    stringa hardcoded

  ## Relevant files
  - `app/(auth)/register.tsx` — riga con "Leggi i Termini di Servizio completi →"
  - `lib/i18n.ts` (o file di traduzione equivalente) — aggiungere le chiavi

### Risultato

- La chiave `register.step4.termsLink` aggiunta ai file di traduzione per
tutte e 6 le lingue supportate
- Il testo nel componente usa `t("register.step4.termsLink")` al posto della
stringa hardcoded

---
## #818 — Pubblica l'app su Google Play Store dopo la verifica del pacchetto

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-22 10:39:12 UTC |
| **Aggiornato** | 2026-04-22 12:08:22 UTC |

### Richiesta

# Pubblica l'app su Google Play Store dopo la verifica del pacchetto

  ## What & Why
  Una volta completata la verifica del nome pacchetto `com.bikerlink.app` su Google Play Console, 
  l'app BikerLink è pronta per essere caricata sul Play Store. Serve un build AAB firmato con 
  il profilo production di EAS e il successivo upload su Play Console.

  ## Done looks like
  - Build AAB production completato su expo.dev (profilo `production`, piattaforma Android)
  - APK/AAB caricato correttamente su Google Play Console
  - L'app BikerLink è visibile nella schermata "Versioni" di Play Console

  ## Relevant files
  - `eas.json` (profilo production, buildType: app-bundle)
  - `android/app/build.gradle` (versionCode e versionName)
  - `app.json` (android.versionCode, version)
  - `android/app/src/main/assets/adi-registration.properties`

### Risultato

- Build AAB production completato su expo.dev (profilo `production`, piattaforma Android)
- APK/AAB caricato correttamente su Google Play Console
- L'app BikerLink è visibile nella schermata "Versioni" di Play Console
## Relevant files

---
## #823 — Aggiungi il link Privacy Policy in tutte le lingue dell'app

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-22 12:57:20 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

# Aggiungi il link Privacy Policy in tutte le lingue dell'app

  ## What & Why
  Come il link ToS, anche il testo del checkbox Privacy Policy nella schermata di registrazione (step 4) è parzialmente hardcoded o potrebbe non essere coerente in tutte le lingue. Verificare che anche il link alla Privacy Policy segua le stesse traduzioni già presenti.

  ## Done looks like
  - Il testo del collegamento Privacy Policy nella schermata di registrazione è correttamente tradotto in tutte le lingue (IT, EN, DE, ES, FR, TR)
  - Il link è visibile e cliccabile in ogni lingua

  ## Relevant files
  - `app/(auth)/register.tsx` — renderStep4, sezione checkbox privacy
  - `lib/i18n/it.ts`, `en.ts`, `de.ts`, `es.ts`, `fr.ts`, `tr.ts` — chiavi esistenti da verificare

### Risultato

- Il testo del collegamento Privacy Policy nella schermata di registrazione è correttamente tradotto in tutte le lingue (IT, EN, DE, ES, FR, TR)
- Il link è visibile e cliccabile in ogni lingua
## Relevant files
- `app/(auth)/register.tsx` — renderStep4, sezione checkbox privacy

---
## #825 — Notifica email/push al moderatore quando viene assegnato un nuovo ticket bug

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-22 14:14:51 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

Quando un utente invia un bug o una feature request (POST /api/feedback), inviare una notifica push o email ai moderatori attivi. File rilevanti: server/routes/feedback.ts, server/routes/moderator.ts. Attualmente i moderatori devono aprire manualmente la schermata per vedere i nuovi ticket.


---
## #826 — Filtro per moderatore nei log admin

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-22 14:14:51 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

La schermata Log Moderatori (app/admin/moderator-logs.tsx) mostra tutti i log di tutti i moderatori. Aggiungere un filtro per selezionare un singolo moderatore e vedere solo le sue azioni. Il backend (server/routes/admin.ts, GET /moderator-logs) potrebbe supportare un query param ?moderatorId=... per efficienza.


---
## #827 — Paginazione dei log moderatori per prevenire caricamenti lenti

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-22 14:14:51 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

Il GET /api/admin/moderator-logs carica tutti i log in memoria (server/routes/admin.ts). Con molti moderatori e molte azioni, la risposta diventerà pesante. Aggiungere paginazione limit/offset al backend e scroll infinito alla UI (app/admin/moderator-logs.tsx).


---
## #831 — Upload APK to Play Console and confirm adi-registration.properties verification passes

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-22 15:28:22 UTC |
| **Aggiornato** | 2026-04-22 15:36:41 UTC |

### Richiesta

# Upload APK to Play Console and confirm adi-registration.properties verification

  ## What & Why
  The code changes for including adi-registration.properties in the release APK are verified and correct. The final step is to download the APK produced by EAS Build (profile: preview), confirm the file is present inside the APK, and upload it to Play Console so Google can verify and register package com.bikerlink.app.

  ## Done looks like
  - EAS Build (preview profile) for com.bikerlink.app is completed on expo.dev (or existing build 705614c0-2d9a-48c9-8c09-ef656500bb4a is used if still valid)
  - APK is downloaded and unzipped; `assets/adi-registration.properties` contains `CKO4ROI4RUDE2AAAAAAAAAAAAA`
  - APK is uploaded to Play Console as an internal test track and the package verification step succeeds

  ## Steps
  1. Check expo.dev for build 705614c0-2d9a-48c9-8c09-ef656500bb4a — if still downloadable, use it
  2. Otherwise trigger a new build: `npx eas-cli@16 build --platform android --profile preview`
  3. Download the APK and verify: `unzip -p app.apk assets/adi-registration.properties` should print `CKO4ROI4RUDE2AAAAAAAAAAAAA`
  4. Upload to Play Console (Internal Testing track) and confirm verification passes

  ## Relevant files
  - `android/app/build.gradle` — ensureAdiRegistration task + release signing config
  - `android/app/src/main/assets/adi-registration.properties` — static asset with snippet
  - `eas.json` — preview profile (buildType: apk, gradleCommand: :app:assembleRelease)

### Risultato

## Relevant files
- `android/app/build.gradle` — ensureAdiRegistration task + release signing config
- `android/app/src/main/assets/adi-registration.properties` — static asset with snippet
- `eas.json` — preview profile (buildType: apk, gradleCommand: :app:assembleRelease)

---
## #833 — Verifica fingerprint APK e carica su Google Play Console

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-22 18:04:32 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

# Verifica fingerprint APK e carica su Google Play Console

  ## What & Why
  La build d2bb5256-eb7d-4e40-8b4c-f7ef57a6d79f (versionCode 32, v2.0.0) includerà adi-registration.properties nel package. Una volta completata, va scaricato l'APK e verificato il fingerprint SHA-256 con apksigner, poi caricato su Play Console.

  ## Done looks like
  - APK scaricato da https://expo.dev/accounts/andreamasteri/projects/bikerlink/builds/d2bb5256-eb7d-4e40-8b4c-f7ef57a6d79f
  - Fingerprint SHA-256 verificato == 33:AC:D7:05:6F:1F:0D:35:4F:06:E7:54:BF:56:93:AC:AB:16:C3:CB:73:E6:60:30:DD:AF:9D:38:DD:9F:00:30
  - APK caricato su Google Play Console senza errori
  - Play Console accetta il file con adi-registration.properties presente

  ## Relevant files
  - `android/app/src/main/assets/adi-registration.properties`
  - `android/app/build.gradle` (task ensureAdiRegistration)
  - `eas.json` (profilo release-apk)
  - `logs/apk-build-history.log`

### Risultato

- APK scaricato da https://expo.dev/accounts/andreamasteri/projects/bikerlink/builds/d2bb5256-eb7d-4e40-8b4c-f7ef57a6d79f
- Fingerprint SHA-256 verificato == 33:AC:D7:05:6F:1F:0D:35:4F:06:E7:54:BF:56:93:AC:AB:16:C3:CB:73:E6:60:30:DD:AF:9D:38:DD:9F:00:30
- APK caricato su Google Play Console senza errori
- Play Console accetta il file con adi-registration.properties presente

---
## #836 — Aggiungi allarme vibrazione/sonoro quando si supera una soglia G

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-22 18:12:27 UTC |
| **Aggiornato** | 2026-04-22 18:23:05 UTC |

### Richiesta

# Aggiungi allarme vibrazione/sonoro quando si supera una soglia G

  ## What & Why
  I motociclisti potrebbero voler essere avvisati in tempo reale quando raggiungono una soglia G pericolosa (es. frenata >0.8G). Un feedback aptico o sonoro immediato aumenta la sicurezza e l'utilità del pannello sensori.

  ## Done looks like
  - L'utente può impostare una soglia per ciascuna metrica G
  - Quando il valore live supera la soglia, il dispositivo vibra (expo-haptics) e/o emette un suono
  - La soglia è configurabile per ogni metrica (accelG, brakeG, lateralG)

  ## Relevant files
  - `app/admin/sensors/final.tsx`

### Risultato

- L'utente può impostare una soglia per ciascuna metrica G
- Quando il valore live supera la soglia, il dispositivo vibra (expo-haptics) e/o emette un suono
- La soglia è configurabile per ogni metrica (accelG, brakeG, lateralG)
## Relevant files

---
## #837 — Esporta o condividi la cronologia picchi G

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-22 18:25:55 UTC |
| **Aggiornato** | 2026-04-22 18:41:11 UTC |

### Richiesta

# Esporta o condividi la cronologia picchi G

  ## What & Why
  I motociclisti potrebbero voler condividere i loro picchi G con amici o salvarli come CSV/testo per confronti a lungo termine.

  ## Done looks like
  - Pulsante "Condividi" nella sezione Sessioni Precedenti che apre il foglio di condivisione nativo con i dati in formato testo o CSV
  - I dati includono data, durata e picchi per sessione

  ## Relevant files
  - `app/admin/sensors/final.tsx` (sezione storico sessioni)
  - Usare `expo-sharing` o `Share` da react-native

### Risultato

- Pulsante "Condividi" nella sezione Sessioni Precedenti che apre il foglio di condivisione nativo con i dati in formato testo o CSV
- I dati includono data, durata e picchi per sessione
## Relevant files
- `app/admin/sensors/final.tsx` (sezione storico sessioni)

---
## #838 — Grafico storico dei picchi G nel tempo

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-22 18:25:55 UTC |
| **Aggiornato** | 2026-04-22 18:41:11 UTC |

### Richiesta

# Grafico storico dei picchi G nel tempo

  ## What & Why
  Avere i picchi G salvati per sessione abilita la visualizzazione di un grafico di tendenza. I motociclisti potrebbero vedere se stanno migliorando o cambiando stile di guida nel tempo.

  ## Done looks like
  - Nella schermata sensori, sopra o sotto la lista sessioni, compare un grafico a linee con i picchi G per sessione (accelG, brakeG, lateralG separati per colore)
  - Asse X = data sessione, asse Y = picco in G

  ## Relevant files
  - `app/admin/sensors/final.tsx`
  - Usare `react-native-svg` o `victory-native` per il grafico

### Risultato

- Nella schermata sensori, sopra o sotto la lista sessioni, compare un grafico a linee con i picchi G per sessione (accelG, brakeG, lateralG separati per colore)
- Asse X = data sessione, asse Y = picco in G
## Relevant files
- `app/admin/sensors/final.tsx`

---
## #842 — Evita che sessioni in memoria si perdano ad ogni riavvio del server

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-23 05:55:47 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

# Sessioni persistenti — sopravvivono ai riavvii del server

  ## What & Why
  Attualmente le sessioni utente sono salvate solo in memoria. Quando il server si riavvia (per crash OOM, deploy, o manutenzione), tutte le sessioni vengono azzerate e ogni utente deve riloggarsi. Questo è il comportamento che ha causato il logout involontario dopo il crash della notte del 22/23 aprile.

  Il fix del task #840 riduce la frequenza dei crash OOM, ma non elimina completamente i riavvii (deploy, aggiornamenti, crash residui). Un session store persistente (salvato nel database PostgreSQL già disponibile) garantisce che gli utenti restino loggati anche attraverso i riavvii.

  ## Done looks like
  - Le sessioni sono salvate in PostgreSQL (tabella `session` già esistente nel DB, 248 righe attuali)
  - Un riavvio del server non fa perdere le sessioni degli utenti loggati
  - Le sessioni scadono naturalmente dopo il timeout configurato (es. 7 giorni)
  - Cleanup automatico delle sessioni scadute (già gestito da connect-pg-simple)

  ## Out of scope
  - Aggiunta di Redis (overengineering per questo caso d'uso)
  - Modifica del sistema di autenticazione

  ## Steps
  1. Installare connect-pg-simple o pg-simple-session e configurare express-session per usare il pool PostgreSQL come store
  2. Verificare che la tabella session già presente nel DB abbia lo schema corretto (session_id, expire, sess)
  3. Aggiungere cleanup automatico delle sessioni scadute all'avvio

  ## Relevant files
  - `server/index.ts` (configurazione session middleware)
  - `server/db.ts` (pool pg già disponibile)

### Risultato

## Relevant files
- `server/index.ts` (configurazione session middleware)
- `server/db.ts` (pool pg già disponibile)

---
## #843 — Reindirizza alla schermata di login se la sessione scade mentre usi l'app

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-23 06:05:59 UTC |
| **Aggiornato** | 2026-04-23 06:09:17 UTC |

### Richiesta

## What & Why

  Con il fix del task #841, il logout involontario allo splash screen è risolto.
  Rimane però un gap: se la sessione scade MENTRE l'utente è già dentro l'app (tab attiva),
  `isAuthenticated` diventa false ma non c'è un redirect automatico alla welcome screen.
  L'utente continua a vedere le tab con dati vuoti/broken finché non riapre l'app.

  Questo avviene perché la navigazione verso /(tabs) è gestita solo da `welcome.tsx`
  (che non è montata quando l'utente è già nelle tab).

  ## Done looks like
  - Un componente `AuthGuard` o useEffect globale in `app/(tabs)/_layout.tsx` che,
    quando `isAuthenticated` diventa false, esegue `router.replace("/welcome")`
  - Il redirect avviene solo quando la transizione è "da autenticato a non autenticato"
    (non al primo caricamento, per evitare flash non voluti)
  - Deve coesistere con la logica di `isReconnecting` (non redirigere durante i retry)

  ## Relevant files
  - `app/(tabs)/_layout.tsx` — layout del tab bar, posto ideale per il guard
  - `lib/auth-context.tsx` — fornisce `isAuthenticated`, `isReconnecting`, `sessionExpired`
  - `app/welcome.tsx` — destinazione del redirect

### Risultato

## Relevant files
- `app/(tabs)/_layout.tsx` — layout del tab bar, posto ideale per il guard
- `lib/auth-context.tsx` — fornisce `isAuthenticated`, `isReconnecting`, `sessionExpired`
- `app/welcome.tsx` — destinazione del redirect

---
## #845 — APK — Bump versionCode 34 per build Play Store/App Store

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-23 06:59:11 UTC |
| **Aggiornato** | 2026-04-23 08:25:08 UTC |

### Richiesta

---
  title: APK — Bump versionCode 34 per build Play Store/App Store
  ---
  # APK — Bump versionCode 34

  ## What & Why
  Gli ultimi APK caricati sul Play Store (v30-v33) sono stati rifiutati per firma errata (build locali
  senza credenziali EAS). Il prossimo APK deve essere compilato tramite EAS che inietta il keystore
  corretto via credentialsSource: remote, con versionCode incrementato a 34.

  Nota su Task #842 (sessioni persistenti): già implementato e verificato. connect-pg-simple con PostgreSQL
  era già attivo — 103 sessioni in DB con userId validi. Nessuna azione necessaria per #842.

  ## Done looks like
  - versionCode 34 in android/app/build.gradle
  - versionCode: 34 in app.json
  - versionName "2.2.0" in build.gradle, version "2.2.0" in app.json
  - Commit e push su main
  - Messaggio finale con istruzioni precise per avviare la build EAS su expo.dev

  ## Steps
  1. android/app/build.gradle: versionCode 33 → 34, versionName "2.1.0" → "2.2.0"
  2. app.json: "versionCode": 33 → 34, "version": "2.1.0" → "2.2.0"
  3. git add android/app/build.gradle app.json && git commit && git push
  4. Scrivere istruzioni per build EAS su expo.dev:
     - Profilo "preview" → APK diretto (test su dispositivo)
     - Profilo "production" → AAB per Play Store/App Store
     - credentialsSource: remote garantisce stessa firma di v29

  ## Relevant files
  - android/app/build.gradle
  - app.json
  - eas.json (profili: preview, release-apk, production)

### Risultato

## Relevant files
- android/app/build.gradle
- app.json
- eas.json (profili: preview, release-apk, production)

---
## #848 — Prepara i 5 screenshot iPhone per la submission App Store

| Campo | Valore |
|-------|--------|
| **Stato** | ❌ CANCELLED |
| **Creato** | 2026-04-23 08:26:20 UTC |
| **Aggiornato** | 2026-05-01 08:07:21 UTC |

### Richiesta

# Screenshot App Store iOS — Richiesti per la submission

  ## What & Why
  Apple richiede obbligatoriamente almeno 5 screenshot per iPhone (dimensione 6.9" — 1320×2868px) prima di poter sottomettere l'app all'App Store. Senza questi la submission viene bloccata da App Store Connect.

  ## Done looks like
  - 5 screenshot iPhone 6.9" in formato PNG (1320×2868px)
  - Coprono le schermate chiave: mappa biker, profilo, match, tracking, motoclub
  - Caricati in App Store Connect nella sezione "Screenshot" della versione corrente
  - Facoltativamente: 5 screenshot iPad (App Store accetta "usa iPhone" solo per app con supportsTablet: false)

  ## Relevant files
  - app.json (ios.supportsTablet: false — solo iPhone richiesto)
  - app/(tabs)/index.tsx (schermata mappa — principale)
  - app/(tabs)/profile.tsx
  - app/moderator/campaigns.tsx
  - .local/ios-audit-report.md (sezione checklist pre-submission)

  ## Note
  Gli screenshot vanno generati su simulatore iOS o dispositivo fisico con Expo, non dalla versione web. Dimensione preferita: iPhone 16 Pro Max (6.9").

### Risultato

## Note
Gli screenshot vanno generati su simulatore iOS o dispositivo fisico con Expo, non dalla versione web. Dimensione preferita: iPhone 16 Pro Max (6.9").

---
## #904 — Live Ride Streaming (HLS)

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-04-24 07:23:18 UTC |
| **Aggiornato** | 2026-04-24 07:23:18 UTC |

### Richiesta

# Live Ride Streaming (HLS)

## What & Why
Permette a un biker di avviare una diretta del suo giro dalla schermata di tracking. Gli altri utenti possono guardare la diretta in tempo reale direttamente nell'app, con una mappa che mostra il punto GPS del broadcaster aggiornato in diretta. Il protocollo usato è HLS (HTTP Live Streaming), lo stesso di VLC/VideoLAN — compatibile con expo-av senza moduli nativi aggiuntivi.

## Done looks like
- Nella schermata Tracking compare un pulsante "Avvia Live" che richiede l'accesso alla fotocamera
- Il broadcaster vede un'anteprima della camera con un indicatore rosso "LIVE" e contatore di spettatori
- La mappa principale mostra icone speciali per i rider in diretta; toccando un'icona si apre il player
- Il player mostra il video in streaming con la posizione GPS del broadcaster aggiornata in tempo reale
- Il broadcaster può terminare la diretta in qualsiasi momento; il video è eliminato dopo la fine
- Le dirette attive sono visibili anche nella tab Esplora/Motoclub

## Out of scope
- Registrazione e salvataggio permanente delle dirette dopo la fine
- Chat/commenti in tempo reale sul player (fase successiva)
- Streaming audio separato dal microfono (il video include già l'audio nativo)
- Push notification "Tizio è in diretta" (fase successiva)
- Integrazione con piattaforme esterne (YouTube, Twitch, ecc.)

## Steps

1. **Schema DB** — Aggiungere la tabella `live_streams` con campi: id, user_id, title, status (live/ended), hls_base_path (percorso segmenti su object storage), segment_count, viewer_count, lat/lng aggiornati, started_at, ended_at. Creare la migration Drizzle.

2. **Backend — Gestione stream** — Creare `server/routes/streams.ts` con endpoint: `POST /api/streams/start` (crea lo stream, restituisce stream_id), `POST /api/streams/:id/end` (chiude lo stream, rimuove segmenti), `GET /api/streams/active` (lista stream live con posizione GPS), `PATCH /api/streams/:id/position` (aggiorna lat/lng broadcaster in tempo reale).



_(troncato)_

### Risultato

- Nella schermata Tracking compare un pulsante "Avvia Live" che richiede l'accesso alla fotocamera
- Il broadcaster vede un'anteprima della camera con un indicatore rosso "LIVE" e contatore di spettatori
- La mappa principale mostra icone speciali per i rider in diretta; toccando un'icona si apre il player
- Il player mostra il video in streaming con la posizione GPS del broadcaster aggiornata in tempo reale

---
## #1054 — Fix build Android R8 + Ottimizza profilo preview EAS

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-04-27 16:04:11 UTC |
| **Aggiornato** | 2026-04-27 16:09:55 UTC |

### Richiesta

# Fix build Android R8 + Ottimizza profilo preview EAS

## What & Why
Il build Android release fallisce durante la fase R8 (minificazione) perché `expo-av` referenzia `expo.modules.core.interfaces.services.KeepAwakeManager`, rimossa dal tree-shaker. Serve una regola ProGuard per preservarla.

In parallelo, il profilo `preview` di EAS va completato con: cache pulita ad ogni build, skip del fingerprint automatico, architettura arm64 esclusiva, output APK, e gradleCommand esplicito.

## Done looks like
- Il build Android con profilo `preview` completa senza errori R8
- Il task `:app:minifyReleaseWithR8` passa con successo
- Il profilo `preview` in `eas.json` ha:
  - `buildType: "apk"`
  - `gradleCommand: ":app:assembleRelease"` esplicito
  - `cache: { "clear": true }` (equivalente di `--clear-cache`)
  - `EAS_SKIP_AUTO_FINGERPRINT: "1"` nella sezione `env`
- In `app.json` il plugin `expo-build-properties` ha:
  - `extraProguardRules` con la regola `-keep class expo.modules.core.interfaces.services.KeepAwakeManager { *; }`
  - `buildArchs: ["arm64-v8a"]` già presente — verificare che sia l'unico valore (nessun'altra architettura)

## Out of scope
- Aggiornamento versioni di expo-av o expo-modules-core
- Modifiche ai profili `release-apk` o `production`
- Configurazione iOS

## Steps
1. In `app.json`, dentro il plugin `expo-build-properties` → `android`, aggiungere `extraProguardRules` con la regola ProGuard per `KeepAwakeManager`. Verificare che `buildArchs` contenga solo `"arm64-v8a"`.
2. In `eas.json`, nel profilo `preview` → `android`, assicurarsi che siano presenti: `buildType: "apk"`, `gradleCommand: ":app:assembleRelease"` esplicito.
3. Sempre in `eas.json`, nel profilo `preview`, aggiungere `"cache": { "clear": true }` (al livello del profilo, non sotto `android`).
4. Aggiungere `EAS_SKIP_AUTO_FINGERPRINT: "1"` nella sezione `env` del profilo `preview`.

## Relevant files
- `app.json:128-139`
- `eas.json`

### Risultato

## Relevant files
- `app.json:128-139`
- `eas.json`

---
## #1186 — Add a language switcher in the app settings screen

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-01 11:11:47 UTC |
| **Aggiornato** | 2026-05-01 11:11:47 UTC |

### Richiesta

# Add in-app language switcher to settings

  ## What & Why
  The i18n system supports 7 languages (IT, EN, DE, ES, FR, TR, EL) but there is no UI for users to change language from within the app. Users must rely on device locale detection.

  ## Done looks like
  - A language picker (dropdown or modal) is accessible from the profile/settings screen
  - Selecting a language instantly re-renders the app in that language
  - The selection is persisted (AsyncStorage) across app restarts

  ## Relevant files
  - `app/(tabs)/profile.tsx` — settings screen where picker should be added
  - `lib/language-context.tsx` — exports useT() and current language state
  - `lib/i18n/index.ts` — list of supported AppLanguage values

### Risultato

- A language picker (dropdown or modal) is accessible from the profile/settings screen
- Selecting a language instantly re-renders the app in that language
- The selection is persisted (AsyncStorage) across app restarts
## Relevant files

---
## #1190 — Aggiungi vibrazione + audio breve quando il GPS viene recuperato

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-01 13:57:39 UTC |
| **Aggiornato** | 2026-05-01 13:57:39 UTC |

### Richiesta

# Haptic + audio feedback al ripristino del segnale GPS

  ## What & Why
  Il banner rosso "GPS perso" è silenzioso. Quando il segnale torna, l'utente potrebbe non accorgersene subito se ha lo schermo in tasca. Un breve feedback aptico (vibrazione) + suono di conferma ("signal recovered") migliora la UX senza essere invasivo.

  ## Done looks like
  - Quando `gpsLost` torna da `true` a `false`, chiamare `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)` da expo-haptics
  - Opzionale: breve beep o suono di sistema (expo-audio / expo-av) per confermare il ripristino
  - Solo su native (Platform.OS !== "web"), nessuna modifica al backend

  ## Relevant files
  - `app/(tabs)/tracking.tsx` (useEffect su gpsLost con expo-haptics)

### Risultato

- Quando `gpsLost` torna da `true` a `false`, chiamare `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)` da expo-haptics
- Opzionale: breve beep o suono di sistema (expo-audio / expo-av) per confermare il ripristino
- Solo su native (Platform.OS !== "web"), nessuna modifica al backend
## Relevant files

---
## #1192 — Periodic orphan-image sweep: delete uploads/ads/ files with no DB reference

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-01 14:15:49 UTC |
| **Aggiornato** | 2026-05-01 14:15:49 UTC |

### Richiesta

# Periodic orphan-image sweep

  ## What & Why
  Campaigns can also lose their image reference when an admin replaces the image via PUT /api/admin/advertisements/:id (the old file is not deleted). A periodic background job that scans uploads/ads/ for files not referenced by any campaign row would catch these and any edge cases missed by per-delete cleanup.

  ## Done looks like
  - A background sweep (e.g. daily cron-like setInterval or triggered by a POST /api/admin/advertisements/image-health/cleanup endpoint) reads all files in uploads/ads/ and cross-checks against all campaign imageUrls in the DB
  - Files with no matching row are deleted (fire-and-forget, errors logged)
  - Admin panel shows the count of orphaned files cleaned
  - Follows the pattern in server/routes/ads.ts pruneOrphanAdImages()

  ## Relevant files
  - server/routes/ads.ts (pruneOrphanAdImages already exists ~line 79)
  - server/routes/admin.ts (~line 2416 /advertisements/image-health/check)

### Risultato

- A background sweep (e.g. daily cron-like setInterval or triggered by a POST /api/admin/advertisements/image-health/cleanup endpoint) reads all files in uploads/ads/ and cross-checks against all campaign imageUrls in the DB
- Files with no matching row are deleted (fire-and-forget, errors logged)
- Admin panel shows the count of orphaned files cleaned
- Follows the pattern in server/routes/ads.ts pruneOrphanAdImages()

---
## #1196 — Show notification delivery errors so push problems are visible

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-01 14:37:20 UTC |
| **Aggiornato** | 2026-05-01 14:37:20 UTC |

### Richiesta

# Show notification delivery errors so push problems are visible

  ## What & Why
  The Expo push service returns per-message error tickets (e.g. DeviceNotRegistered, InvalidCredentials). Currently these are only logged as warnings and silently discarded. Stale tokens that return DeviceNotRegistered should be cleared from the database to avoid wasting push quota and to keep the users table clean.

  ## Done looks like
  - After sending push messages, tickets with status "error" and details.error === "DeviceNotRegistered" cause the corresponding expoPushToken to be NULLed in the users table
  - Other error types are still logged as warnings
  - No changes needed to the frontend

  ## Relevant files
  - `server/push-notifications.ts` — sendExpoMessages() function (lines 24–48)
  - `server/db.ts` or `server/storage.ts` — to update user tokens

### Risultato

- After sending push messages, tickets with status "error" and details.error === "DeviceNotRegistered" cause the corresponding expoPushToken to be NULLed in the users table
- Other error types are still logged as warnings
- No changes needed to the frontend
## Relevant files

---
## #1198 — Show download progress for large admin backups instead of just a spinner

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-01 14:53:26 UTC |
| **Aggiornato** | 2026-05-01 14:53:26 UTC |

### Richiesta

# Show download progress for large admin backups

  ## What & Why
  The "Scarica" button in the admin backup screen shows a spinner while downloading, but gives no indication of how much has been downloaded. Database dumps and media zips can be tens or hundreds of MB — admins have no feedback on whether the download is progressing or stalled.

  ## Done looks like
  - On Android/iOS: expo-file-system/legacy downloadAsync supports a callback option; use it to show a progress percentage or a determinate progress bar next to the download button
  - On web: fetch with a ReadableStream reader can track bytes received vs. total (from Content-Length header)
  - The download button label changes from "Scarica" to "47%…" or a thin progress bar appears below the button

  ## Relevant files
  - `app/admin/backup.tsx` — handleDownload function (lines 133–180); the download button UI (lines 228–254)

### Risultato

- On Android/iOS: expo-file-system/legacy downloadAsync supports a callback option; use it to show a progress percentage or a determinate progress bar next to the download button
- On web: fetch with a ReadableStream reader can track bytes received vs. total (from Content-Length header)
- The download button label changes from "Scarica" to "47%…" or a thin progress bar appears below the button
## Relevant files

---
## #1203 — Filter OTA history by runtime version cycle in the admin panel

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-01 15:40:27 UTC |
| **Aggiornato** | 2026-05-01 15:40:27 UTC |

### Richiesta

# Filter OTA history by runtime version cycle

  ## What & Why
  Now that runtime version is visible next to each OTA release in the admin panel
  (Task #1034), a natural next step is to let admins filter the list by cycle
  (e.g., show only rv 8.0.0 releases) to quickly identify cross-cycle stale entries
  or compare cycles without scrolling through everything.

  ## Done looks like
  - A simple segmented control or dropdown at the top of the OTA history screen
    lets the admin select "Tutti", "8.0.0", "7.0.0", etc. (derived from the
    unique runtimeVersion values present in ota-updates.json)
  - The release cards are filtered client-side (no backend change needed)
  - "Tutti" is the default (shows all 26+ entries)

  ## File rilevanti
  - `app/admin/ota-history.tsx`

### Risultato

- A simple segmented control or dropdown at the top of the OTA history screen
lets the admin select "Tutti", "8.0.0", "7.0.0", etc. (derived from the
unique runtimeVersion values present in ota-updates.json)
- The release cards are filtered client-side (no backend change needed)

---
## #1204 — Add validation guard to OTA retention input (min 7 days, max 3650 days)

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-01 17:17:53 UTC |
| **Aggiornato** | 2026-05-01 17:17:53 UTC |

### Richiesta

# Add validation guard to OTA retention input

  ## What & Why
  The OTA cleanup retention setting (Task #1041) accepts any positive integer.
  A retention of 1 day or 2 days would aggressively delete recent superseded
  releases before admins have a chance to rollback. Adding a minimum of 7 days
  and a maximum of 3650 (10 years) both on the server and in the UI would
  prevent accidental misconfiguration.

  ## Done looks like
  - PUT /api/admin/settings/ota_cleanup_retention_days rejects values < 7 or > 3650
    with a 400 error and a clear message
  - The admin UI input shows a helper text "min 7 days, max 3650 days"
  - The mutation error surface shows the server validation message

  ## File rilevanti
  - `server/routes/admin.ts` — generic PUT /settings/:key OR a dedicated
    PUT /settings/ota_cleanup_retention_days endpoint with explicit validation
  - `app/admin/settings.tsx` — UI helper text + client-side guard

### Risultato

- PUT /api/admin/settings/ota_cleanup_retention_days rejects values < 7 or > 3650
with a 400 error and a clear message
- The admin UI input shows a helper text "min 7 days, max 3650 days"
- The mutation error surface shows the server validation message

---
## #1216 — Show OTA adoption as a percentage bar so it's easier to see rollout progress at a glance

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-01 22:21:46 UTC |
| **Aggiornato** | 2026-05-01 22:21:46 UTC |

### Richiesta

# Show OTA adoption as a percentage bar

  ## What & Why
  The new Adozione OTA card (Task #1167) shows raw ok/error counts per update and platform. Adding a visual percentage bar (e.g. "87% success rate") would make it immediately obvious whether a rollout is going well without needing to read individual numbers.

  ## Done looks like
  - Each OTA group row shows a small horizontal bar representing ok_count / (ok_count + error_count)
  - The bar is green for high success rates, red/orange if errors are significant
  - Still compact and within the existing card layout

  ## Relevant files
  - `app/admin/system.tsx` — OtaAdoptionCard component (added in Task #1167, around line 1303)

### Risultato

- Each OTA group row shows a small horizontal bar representing ok_count / (ok_count + error_count)
- The bar is green for high success rates, red/orange if errors are significant
- Still compact and within the existing card layout
## Relevant files

---
## #1217 — Add a time-range filter to the OTA adoption card (last 7d / 30d / all time)

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-01 22:21:46 UTC |
| **Aggiornato** | 2026-05-01 22:21:46 UTC |

### Richiesta

# Add time-range filter to OTA adoption stats

  ## What & Why
  The /api/admin/ota-stats endpoint (added in Task #1167) queries all ota_events with no date filter. As history grows this could show very old updates. A time-range filter (last 7d / 30d / all) lets admins see recent adoption separately from historical data.

  ## Done looks like
  - Backend GET /api/admin/ota-stats accepts an optional `since` query param (ISO date string) and adds a WHERE created_at >= $since clause
  - Frontend card has three small toggle buttons: "7g" / "30g" / "Tutto"
  - Default is 30 days

  ## Relevant files
  - `server/routes/admin.ts` — /ota-stats handler (around line 615)
  - `app/admin/system.tsx` — OtaAdoptionCard component (around line 1303)

### Risultato

- Backend GET /api/admin/ota-stats accepts an optional `since` query param (ISO date string) and adds a WHERE created_at >= $since clause
- Frontend card has three small toggle buttons: "7g" / "30g" / "Tutto"
- Default is 30 days
## Relevant files

---
## #1218 — Show the current OTA event table row count in the admin panel

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-01 23:07:18 UTC |
| **Aggiornato** | 2026-05-01 23:07:18 UTC |

### Richiesta

# Show ota_events row count in admin panel

  ## What & Why
  After adding the scheduled cleanup (Task #1168), admins have no visibility into the current table size or whether the cleanup is keeping it under control. A simple row count + last cleanup timestamp displayed in the admin OTA section would confirm the job is working.

  ## Done looks like
  - GET /api/admin/ota-stats (or /api/admin/system-health) returns current ota_events row count and the timestamp of the last cleanup
  - The admin system panel displays: "ota_events: X rows (last cleanup: <timestamp>)"

  ## Relevant files
  - `server/routes/admin.ts` — /api/admin/ota-stats or /api/admin/system-health
  - `server/index.ts` — Phase 12.5 cleanup job (added in Task #1168)
  - `app/admin/system.tsx` — admin system panel UI

### Risultato

- GET /api/admin/ota-stats (or /api/admin/system-health) returns current ota_events row count and the timestamp of the last cleanup
- The admin system panel displays: "ota_events: X rows (last cleanup: <timestamp>)"
## Relevant files
- `server/routes/admin.ts` — /api/admin/ota-stats or /api/admin/system-health

---
## #1219 — Open the right content when tapping a push notification while the app is closed

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-02 01:21:42 UTC |
| **Aggiornato** | 2026-05-02 01:21:42 UTC |

### Richiesta

# Handle deep-link navigation from cold-start push notification tap

  ## What & Why
  Task #1170 wires up in-app notification list taps to navigate to the right screen.
  But when the user taps a push notification from the system tray while the app is
  closed (or backgrounded), `app/+native-intent.tsx` currently redirects everything
  to '/'. The push notification payload should carry a deep-link URL and the native
  intent handler should parse it and route accordingly.

  ## Done looks like
  - When a push notification is sent, its payload includes a deep-link path derived
    from notificationType + referenceId (e.g. /profile/123, /motoclub/456)
  - `app/+native-intent.tsx` reads the incoming URL and returns it instead of '/'
  - Tapping a notification from a closed app navigates directly to the target screen

  ## Relevant files
  - `app/+native-intent.tsx` (currently returns '/' unconditionally)
  - `server/routes/notifications.ts` or push-sending code (to add deep-link in payload)
  - Same notificationType → route mapping as in `app/notifications.tsx`

### Risultato

- When a push notification is sent, its payload includes a deep-link path derived
from notificationType + referenceId (e.g. /profile/123, /motoclub/456)
- `app/+native-intent.tsx` reads the incoming URL and returns it instead of '/'
- Tapping a notification from a closed app navigates directly to the target screen

---
## #1221 — Get a push notification on your phone when the live OTA version is wrong

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-02 01:51:40 UTC |
| **Aggiornato** | 2026-05-02 01:51:40 UTC |

### Richiesta

# Send a push/email alert to admin when WARN_OTA_MISMATCH is detected

  ## What & Why
  Task #1172 makes the Error Monitor log WARN_OTA_MISMATCH when production serves the
  wrong OTA bundle, but the admin only sees this if they actively check the log file.
  Adding an active alert (push notification via Expo or email) would surface the problem
  immediately without requiring manual log review.

  ## Done looks like
  - When error-monitor.sh logs WARN_OTA_MISMATCH, it also fires an HTTP call to
    POST /api/admin/alert (or similar internal endpoint) that sends a push notification
    to the admin's registered expo_push_token and/or an email
  - The alert includes: OTA number expected, OTA id served, OTA id expected, rv

  ## Relevant files
  - `scripts/error-monitor.sh` (check_ota_mismatch — add curl call on mismatch)
  - `server/routes/admin.ts` (add POST /api/admin/alert or reuse existing push infra)
  - Admin push token retrieval from `users` table (`expo_push_token` column)

### Risultato

- When error-monitor.sh logs WARN_OTA_MISMATCH, it also fires an HTTP call to
POST /api/admin/alert (or similar internal endpoint) that sends a push notification
to the admin's registered expo_push_token and/or an email
- The alert includes: OTA number expected, OTA id served, OTA id expected, rv

---
## #1222 — Let admins share a crash report directly from the modal (WhatsApp, Slack, email…)

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-02 01:56:38 UTC |
| **Aggiornato** | 2026-05-02 01:56:38 UTC |

### Richiesta

# Add a Share button to the crash log modal

  ## What & Why
  The modal already has a Copy button (Task #1173). A Share button using the native
  share sheet would let admins forward crash reports directly to teammates via
  WhatsApp, Slack, email, or any installed app — faster than copy-paste.

  ## Done looks like
  - A share icon (ionicons "share-outline") sits next to the copy button in the header
  - Tapping it opens the native share sheet with the same content: errorMessage + "\n\n" + stackTrace
  - Uses Share from react-native (cross-platform, no extra dependency)

  ## Relevant files
  - `app/admin/crash-logs.tsx` — StackTraceModal headerActions area (lines 397-414)
  - Share is already available: `import { Share } from "react-native"`

### Risultato

- A share icon (ionicons "share-outline") sits next to the copy button in the header
- Tapping it opens the native share sheet with the same content: errorMessage + "\n\n" + stackTrace
- Uses Share from react-native (cross-platform, no extra dependency)
## Relevant files

---
## #1223 — Remember that the user denied GPS background so the prompt doesn't reappear every session

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-02 02:31:52 UTC |
| **Aggiornato** | 2026-05-02 02:31:52 UTC |

### Richiesta

# Persist GPS background denial so the notice doesn't re-show on every app open

  ## What & Why
  AlwaysPermissionNotice is shown based on hasBackgroundPermission=false. After a user
  denies the OS dialog and dismisses the notice, the next time they open the app the same
  modal will appear again — even though they already said no. This is annoying and reduces
  trust.

  A simple "user has seen and dismissed this" flag in AsyncStorage would prevent the modal
  from reappearing until the user explicitly opens Settings and grants the permission, at
  which point the flag should be cleared.

  ## Done looks like
  - On dismiss (or after denial + dismiss), persist a flag in AsyncStorage:
    e.g. `BACKGROUND_PERMISSION_DISMISSED`
  - The component (or the parent that decides whether to show it) checks this flag
    before rendering AlwaysPermissionNotice
  - The flag is cleared when hasBackgroundPermission becomes true
    (user granted from Settings and re-opened app)

  ## Relevant files
  - `components/AlwaysPermissionNotice.tsx` — onDismiss handler
  - `lib/location-context.tsx` — could expose a "dismissed" flag from context
  - The screen(s) that render AlwaysPermissionNotice (check where it is conditionally shown)

### Risultato

## Relevant files
- `components/AlwaysPermissionNotice.tsx` — onDismiss handler
- `lib/location-context.tsx` — could expose a "dismissed" flag from context
- The screen(s) that render AlwaysPermissionNotice (check where it is conditionally shown)

---
## #1224 — Clean up the old ad image file when an admin replaces it via the edit form

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-04 07:46:44 UTC |
| **Aggiornato** | 2026-05-04 07:46:44 UTC |

### Richiesta

# Delete old image file when an admin replaces an ad image via PUT

  ## What & Why
  Task #1175 confirmed that DELETE handlers already clean up image files on disk.
  However, the PUT /advertisements/:id handler (server/routes/admin.ts ~line 2226)
  uploads a new image when req.file is present but does NOT delete the old one.
  Over time, every image replacement leaves an orphaned file in uploads/ads/.

  Task #1193 is already tracked for this exact fix — see that task for implementation details.

  ## Done looks like
  - In the PUT handler, when req.file is provided, fetch the existing campaign imageUrl
    before updating, extract the old filename the same way as in the DELETE handlers,
    and call fs.unlink on it (silent fail on ENOENT) after the new image is uploaded.

  ## Relevant files
  - `server/routes/admin.ts` — PUT /advertisements/:id handler (~line 2226-2275)
  - Same filename extraction pattern already used in the DELETE handlers (lines 2287-2300)

### Risultato

- In the PUT handler, when req.file is provided, fetch the existing campaign imageUrl
before updating, extract the old filename the same way as in the DELETE handlers,
and call fs.unlink on it (silent fail on ENOENT) after the new image is uploaded.
## Relevant files

---
## #1227 — Upgrade sprint-history.tsx sprint label to use convertSpeed() for knots support

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-04 10:25:51 UTC |
| **Aggiornato** | 2026-05-04 10:25:51 UTC |

### Richiesta

# Use convertSpeed() in sprint-history.tsx for consistent unit handling

  ## What & Why
  app/sprint-history.tsx currently builds the sprint target label with a manual
  ternary (lines 55-56):
    const targetSpeed = speedUnit === "mph" ? 62 : 100;
    const targetLabel = speedUnit === "mph" ? "62 mph" : "100 km/h";

  This misses the "knots" speed unit (should show "54 kn"). Task #1181 fixed
  app/route/[id].tsx using convertSpeed(100, speedUnit) from lib/units.ts.
  sprint-history.tsx should use the same helper for full consistency.

  ## Done looks like
  - Lines 55-56 replaced with:
    const { value: targetValue, label: targetUnitLabel } = convertSpeed(100, speedUnit);
    const targetLabel = `${targetValue.toFixed(0)} ${targetUnitLabel}`;
  - convertSpeed imported from "@/lib/units" (already imports formatDateTime).
  - targetSpeed constant removed (unused after change).
  - Renders "0→100 km/h", "0→62 mph", "0→54 kn" correctly.

  ## Relevant files
  - `app/sprint-history.tsx` — lines 19-56 (imports + targetLabel)

### Risultato

- Lines 55-56 replaced with:
const { value: targetValue, label: targetUnitLabel } = convertSpeed(100, speedUnit);
const targetLabel = `${targetValue.toFixed(0)} ${targetUnitLabel}`;
- convertSpeed imported from "@/lib/units" (already imports formatDateTime).

---
## #1230 — Add Portuguese (pt) and Polish (pl) language support

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 20:33:55 UTC |
| **Aggiornato** | 2026-05-18 20:33:55 UTC |

### Richiesta

# Add Portuguese and Polish translations

  ## What & Why
  The app now covers Italian, English, German, Spanish, French, Turkish and Greek. Portuguese and Polish are two of the largest European motorcycle communities — adding them would meaningfully expand the app's reach.

  ## Done looks like
  - `lib/i18n/pt.ts` created with all 628 keys translated into Portuguese (Brazil or European)
  - `lib/i18n/pl.ts` created with all 628 keys translated into Polish
  - Both languages registered in the i18n index/config (same pattern as existing files)
  - No empty strings in either file

  ## Relevant files
  - `lib/i18n/it.ts` — authoritative source (628 keys)
  - `lib/i18n/en.ts` — complete English reference
  - `lib/i18n/de.ts`, `lib/i18n/el.ts` — recently completed files to use as structural template
  - i18n config/index file in `lib/i18n/`

### Risultato

- `lib/i18n/pt.ts` created with all 628 keys translated into Portuguese (Brazil or European)
- `lib/i18n/pl.ts` created with all 628 keys translated into Polish
- Both languages registered in the i18n index/config (same pattern as existing files)
- No empty strings in either file

---
## #1246 — Skip the manual 'Confirm' step in Last.fm login — connect automatically

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 21:35:53 UTC |
| **Aggiornato** | 2026-05-18 21:35:53 UTC |

### Richiesta

# Skip the manual 'Confirm' step in Last.fm login — connect automatically

  ## What & Why
  The current Last.fm OAuth flow is a two-step process: (1) the user opens the Last.fm auth page in a browser, (2) after the browser closes they must manually tap a "Confirm" button for the app to finalise the connection. Step 2 is unnecessary — the `openAuthSessionAsync` result already returns the redirect URL (`bikerlink://lastfm-callback?token=...`), so the app can extract the token from there and call `POST /api/lastfm/auth-session` automatically as soon as the browser closes.

  ## Done looks like
  - After the user approves on Last.fm and the browser closes, the app immediately exchanges the token and shows the success alert — no "Confirm" button needed
  - The UI shows a brief "Connecting…" spinner while the exchange happens
  - The `/api/lastfm/auth-session` endpoint is unchanged; only the frontend flow changes

  ## Relevant files
  - `app/(tabs)/music.tsx` — `LastfmLoginModal` component (~line 715), `handleOpenBrowser` callback (~line 734), `AuthStep` type (~line 717)
  - `server/routes/lastfm.ts` — `POST /auth-session` endpoint (~line 284)

### Risultato

- After the user approves on Last.fm and the browser closes, the app immediately exchanges the token and shows the success alert — no "Confirm" button needed
- The UI shows a brief "Connecting…" spinner while the exchange happens
- The `/api/lastfm/auth-session` endpoint is unchanged; only the frontend flow changes
## Relevant files

---
## #1248 — Remove unused iOS section from eas.json production profile

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 21:57:00 UTC |
| **Aggiornato** | 2026-05-18 21:57:00 UTC |

### Richiesta

# Remove unused iOS section from eas.json production profile

  ## What & Why
  The `production` build profile in `eas.json` still contains:
  ```json
  "ios": { "autoIncrement": false }
  ```
  iOS builds are handled exclusively by Replit Expo Launch — the EAS CLI never
  builds iOS for this project. This key is a leftover and has no effect, but
  it's misleading and suggests iOS is still configured via EAS.

  ## Done looks like
  - `eas.json`: `"ios": { "autoIncrement": false }` removed from the `production` profile
  - All other keys in the profile remain unchanged
  - `scripts/build-apk.sh` still works (it only builds Android via `production`)

  ## Relevant files
  - `eas.json`

### Risultato

- `eas.json`: `"ios": { "autoIncrement": false }` removed from the `production` profile
- All other keys in the profile remain unchanged
- `scripts/build-apk.sh` still works (it only builds Android via `production`)
## Relevant files

---
## #1251 — Tapping Previous while shuffling should respect history (go back to last played)

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 22:08:36 UTC |
| **Aggiornato** | 2026-05-18 22:08:36 UTC |

### Richiesta

# Tapping Previous while shuffling should respect history

  ## What & Why
  The `prev()` function in `lib/player-context.tsx` always steps linearly backward through the queue index (idx - 1). When shuffle is on, there is no concept of a "previous shuffled track" — the user can't go back to what they just heard.

  A good UX would maintain a separate shuffle-back stack: every time a track finishes or `next()` is called, the index is pushed onto a stack. Tapping previous in shuffle mode would pop that stack to return to the last played track.

  ## Done looks like
  - A `shuffleBackStackRef` is maintained in `lib/player-context.tsx`
  - `getNextIndex` pushes the current index onto the stack
  - `prev()` checks `isShuffledRef.current`: if true, pops the back-stack instead of stepping linearly
  - If the back-stack is empty and shuffle is on, `prev()` is a no-op (or rewinds to 0)

  ## Relevant files
  - `lib/player-context.tsx` — `prev()` (~line 432), `getNextIndex` (~line 209)

### Risultato

- A `shuffleBackStackRef` is maintained in `lib/player-context.tsx`
- `getNextIndex` pushes the current index onto the stack
- `prev()` checks `isShuffledRef.current`: if true, pops the back-stack instead of stepping linearly
- If the back-stack is empty and shuffle is on, `prev()` is a no-op (or rewinds to 0)

---
## #1254 — Resume music after a Bluetooth headset reconnects mid-track

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 22:17:55 UTC |
| **Aggiornato** | 2026-05-18 22:17:55 UTC |

### Richiesta

# Resume music after a Bluetooth headset reconnects mid-track

  ## What & Why
  When a Bluetooth audio device disconnects mid-playback (headset runs out of battery,
  momentary disconnect), Android fires a BECOME_NOISY broadcast and the OS pauses audio.
  The current interruption recovery (Task #1206) handles AppState-based focus loss but
  does not specifically detect BECOME_NOISY. When the headset reconnects, the player
  stays paused because the AppState never changed (app was in foreground the whole time).

  ## Done looks like
  - On Android, if audio pauses because of a BECOME_NOISY event (Bluetooth disconnect),
    the player stays paused (expected — we don't want to suddenly blast through speakers)
  - When the user explicitly taps Play after reconnecting, the audio session is re-requested
    and playback resumes correctly (this should already work with the current implementation)
  - Optionally: detect headset reconnect via DeviceEventEmitter and auto-resume if
    `userPausedRef.current` is false

  ## Relevant files
  - `lib/player-context.tsx` — `userPausedRef`, AppState listener, `play()`

### Risultato

- On Android, if audio pauses because of a BECOME_NOISY event (Bluetooth disconnect),
the player stays paused (expected — we don't want to suddenly blast through speakers)
- When the user explicitly taps Play after reconnecting, the audio session is re-requested
and playback resumes correctly (this should already work with the current implementation)

---
## #1255 — Show a toast when the ride ends if background GPS points were collected

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 22:29:40 UTC |
| **Aggiornato** | 2026-05-18 22:29:40 UTC |

### Richiesta

# Show a toast when the ride ends if background GPS points were collected

  ## What & Why
  When a ride is stopped, `pendingBgToastCountRef` is now cleared (Task #1226).
  But if the user stopped the ride while on another tab and background GPS points
  were collected, they never see any confirmation that those points were recorded.
  A brief summary toast at ride-stop time ("X punti GPS acquisiti in background
  durante il giro") would give the user confidence that no data was lost.

  ## Done looks like
  - In the stopTracking flow (before cleanupTracking is called), if
    `pendingBgToastCountRef.current > 0`, show a toast/snackbar with the count
  - The toast fires only once per ride, then the ref is cleared by cleanupTracking
  - All 7 i18n files updated with the new string key

  ## Relevant files
  - `app/(tabs)/tracking.tsx` — stopTracking(), cleanupTracking(), pendingBgToastCountRef (line ~714)
  - `lib/i18n/{it,en,de,el,es,fr,tr}.ts`

### Risultato

- In the stopTracking flow (before cleanupTracking is called), if
`pendingBgToastCountRef.current > 0`, show a toast/snackbar with the count
- The toast fires only once per ride, then the ref is cleared by cleanupTracking
- All 7 i18n files updated with the new string key

---
## #1260 — Show ad storage usage in the admin panel so orphan counts are visible

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 22:38:15 UTC |
| **Aggiornato** | 2026-05-18 22:38:15 UTC |

### Richiesta

# Show ad storage usage in the admin panel

  ## What & Why
  After the orphan cleanup, admins have no visibility into how many objects are
  in public/ads/ or how much storage they consume. Adding a simple counter on
  the Advertisements admin page (similar to the existing /advertisements/cache-stats
  endpoint for local cache) would let admins confirm the cleanup ran correctly and
  monitor storage going forward.

  ## Done looks like
  - New GET /api/admin/advertisements/storage-stats endpoint: queries
    listObjects("public/ads/"), returns { count, totalBytes, referencedCount,
    orphanCount } (cross-referenced against DB imageUrls)
  - Admin Advertisements page shows an info row: "X files in object storage,
    Y orphaned" with a "Run cleanup" button that triggers
    POST /api/admin/advertisements/cleanup-orphans

  ## Relevant files
  - server/routes/admin.ts — new endpoint near the existing /cache-stats handler (~line 2473)
  - server/routes/ads.ts — cleanupOrphanedAdImages() already exported
  - app/admin/advertisements.tsx (or equivalent admin frontend screen)

### Risultato

## Relevant files
- server/routes/admin.ts — new endpoint near the existing /cache-stats handler (~line 2473)
- server/routes/ads.ts — cleanupOrphanedAdImages() already exported
- app/admin/advertisements.tsx (or equivalent admin frontend screen)

---
## #1262 — OTA Modulare — Failsafe + Skill V43 + Check 6h

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 22:44:04 UTC |
| **Aggiornato** | 2026-05-18 22:46:55 UTC |

### Richiesta

# OTA Modulare — Failsafe + Skill V43 + Check 6h

## What & Why
Il sistema OTA attuale non ha un failsafe designato lato admin né una procedura di startup
garantita. Il confronto tra APK v43 (stabile) e v44 (correzioni in corso, esito incerto)
suggerisce che la logica di avvio di v43 sia più robusta.

Obiettivi:
1. **Skill V43OtaLogic**: estrarre dalla git history la logica di startup OTA di v43
   (`lib/ota-check.ts` e `app/_layout.tsx` all'epoca di v43) e salvarla come skill
   permanente `.agents/skills/V43OtaLogic/SKILL.md`. Questa diventa la documentazione
   di riferimento e il comportamento failsafe certificato del client.
2. **Failsafe release admin-selezionabile**: l'admin marca una release come "failsafe"
   (quella attualmente stabile, corrispondente all'era v43). In caso di problemi con il
   bundle attivo, la attiva in un tap — nessun script, nessun terminale.
3. **Check periodico ogni 6h + check su backgrounding**: aggiungere check automatici
   per dispositivi che restano in background a lungo.

## Context
- APK v43 (3.2.0) è stabile: buildId `38cb1b32`, OTA pubblicati nel ciclo 8.x
- APK v44 (3.3.0) ha ricevuto correzioni — esito non ancora certo
- La logica di startup attuale (`lib/ota-check.ts`) potrebbe aver subito regressioni tra v43 e v44
- La tabella `ota_releases` esiste già (con campi `id`, `version`, `runtimeVersion`,
  `bundlePath`, `status`). Manca il campo `is_failsafe`.

## Done looks like
- Esiste il file `.agents/skills/V43OtaLogic/SKILL.md` con la logica di avvio OTA
  estratta dall'era v43 (codice annotato, spiegazione del comportamento, differenze
  rispetto alla versione attuale).
- Nel pannello admin OTA (`app/admin/ota-history.tsx`) ogni release ha un pulsante
  "Imposta failsafe". La release con il flag mostra un badge arancione "FAILSAFE".
- Un pulsante "Attiva failsafe" in cima alla schermata attiva immediatamente la release
  designata, con modale di conferma prima dell'azione.
- Se nessuna release è designata failsafe, il pu

_(troncato)_

### Risultato

## Relevant files
- `shared/schema.ts`
- `server/routes/admin.ts`
- `app/admin/ota-history.tsx`

---
## #1264 — Extend admin-exclusion check to cover includeOffline and countOnlineUsers DB path

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 22:51:26 UTC |
| **Aggiornato** | 2026-05-18 22:51:26 UTC |

### Richiesta

The Task #1233 check covers the main storage methods and OnlineTracker, but two code paths are not yet exercised: storage.countOnlineUsers() (the DB-backed count query) and the inline includeOffline branch in GET /api/users/online-list which has its own notInArr(role,["admin"]) condition separate from storage.getOnlineUsersList(). Add assertions to scripts/check-admin-map-exclusion.ts for both paths.


---
## #1277 — Show matched-proposal notifications in the app's notification bell

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 23:50:32 UTC |
| **Aggiornato** | 2026-05-18 23:50:32 UTC |

### Richiesta

# Show matched-proposal notifications in the app's notification bell

  ## What & Why
  The zone-match notification is now saved to the database, but the frontend notification list needs to handle referenceType="proposal_match" entries that belong to third-party observers (not the two matched users). Currently tapping such a notification may not navigate anywhere meaningful for these observers — it should show a prompt to create their own proposal instead.

  ## Done looks like
  - Notifications with referenceType="proposal_match" where the user is NOT one of the matched parties are displayed with copy like "La proposta vicina a te ha trovato il suo match — creane una tu!"
  - Tapping the notification opens the "Crea proposta" flow or navigates to the proposals tab
  - The notification bell count includes these new notification entries

  ## Relevant files
  - `app/(tabs)/notifications.tsx` (or equivalent notification list screen)
  - `server/routes/proposals.ts` (accept match route, lines 400–470)

### Risultato

- Notifications with referenceType="proposal_match" where the user is NOT one of the matched parties are displayed with copy like "La proposta vicina a te ha trovato il suo match — creane una tu!"
- Tapping the notification opens the "Crea proposta" flow or navigates to the proposals tab
- The notification bell count includes these new notification entries
## Relevant files

---
## #1280 — Mostra il toggle Widget solo se il widget flottante è attivo sul dispositivo

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 23:51:06 UTC |
| **Aggiornato** | 2026-05-18 23:51:06 UTC |

### Richiesta

# Mostra il toggle Widget solo se il widget flottante è attivo sul dispositivo

  ## What & Why
  Il toggle Widget in "Il mio profilo" è condizionato solo all'abilitazione admin (`adminWidgetEnabled`). Sarebbe utile nasconderlo o mostrarlo disabilitato anche se il floating widget non è supportato dalla piattaforma (es. web), per evitare confusione.

  ## Done looks like
  - Su piattaforme dove il widget non è disponibile (web), la riga Widget non appare
  - La logica di visibilità è centralizzata

  ## Relevant files
  - `app/(tabs)/profile.tsx` — riga Widget, sezione Taskbar (~1321)

### Risultato

- Su piattaforme dove il widget non è disponibile (web), la riga Widget non appare
- La logica di visibilità è centralizzata
## Relevant files
- `app/(tabs)/profile.tsx` — riga Widget, sezione Taskbar (~1321)

---
## #1282 — Make notification taps work even when the app is fully closed (not just backgrounded)

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 23:52:05 UTC |
| **Aggiornato** | 2026-05-18 23:52:05 UTC |

### Richiesta

# Make notification taps work when app is fully closed

  ## What & Why
  The current fix handles cold start by queuing the navigation until the router is mounted. However, on Android, when the app is fully terminated and relaunched via the overlay deep link, the `Linking.getInitialURL()` call may race with expo-router's initialization in some edge cases. A more robust solution would use a persistent pending-navigation store (AsyncStorage) so the intent is never dropped regardless of boot timing.

  ## Done looks like
  - Tap the overlay bubble when app is fully closed → app opens → correct screen shown reliably
  - No race condition between Linking.getInitialURL() and router mount
  - Works for both the background_badge and match notification types

  ## Relevant files
  - `app/_layout.tsx` (BackgroundNotificationHandler, parseDeepLink)
  - `lib/floating-widget-context.tsx`

### Risultato

- Tap the overlay bubble when app is fully closed → app opens → correct screen shown reliably
- No race condition between Linking.getInitialURL() and router mount
- Works for both the background_badge and match notification types
## Relevant files

---
## #1284 — Stop GPS spike noise from inflating ride statistics

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 23:53:42 UTC |
| **Aggiornato** | 2026-05-18 23:53:42 UTC |

### Richiesta

# Stop GPS spike noise from inflating ride statistics

  ## What & Why
  The current maxSpeed guard only filters out readings above 300 km/h. Recovered rides (offline buffer recovery flow) still apply maxSpeed without any spike filter — line 1191 of `app/(tabs)/tracking.tsx`. Likewise, the server-side recalculation in `server/routes/tracking.ts` (line 167) has no upper-bound guard on speedKmh stored in the database. A bad GPS point persisted in the DB can still produce a wrong maxSpeed when the server recalculates.

  ## Done looks like
  - Recovered ride flow caps maxSpeed at 300 km/h (same guard as live tracking)
  - Server-side recalculation ignores stored speedKmh values > 300 km/h

  ## Relevant files
  - `app/(tabs)/tracking.tsx` (line ~1191, recovered ride maxSpeed loop)
  - `server/routes/tracking.ts` (line ~167, server recalc maxSpeedKmh)

### Risultato

- Recovered ride flow caps maxSpeed at 300 km/h (same guard as live tracking)
- Server-side recalculation ignores stored speedKmh values > 300 km/h
## Relevant files
- `app/(tabs)/tracking.tsx` (line ~1191, recovered ride maxSpeed loop)

---
## #1285 — Mappa: torna automaticamente sull'utente dopo inattività

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 23:54:48 UTC |
| **Aggiornato** | 2026-05-18 23:54:48 UTC |

### Richiesta

# Mappa: torna automaticamente sull'utente dopo inattività

  ## What & Why
  Dopo che l'utente ha spostato la mappa manualmente, la mappa rimane ferma. Aggiungere un pulsante/logica di "re-center automatico" dopo N secondi di inattività migliorebbe l'esperienza, soprattutto su moto in movimento.

  ## Done looks like
  - Dopo X secondi senza interazione con la mappa, la camera torna silenziosamente sulla posizione GPS live
  - Un indicatore visivo (es. pulsante pulsante) mostra che il re-center automatico è attivo/disattivo
  - L'utente può disabilitare il re-center tenendo premuto o toccando il pulsante

  ## Relevant files
  - `app/(tabs)/index.tsx` (logica mappa, handleCenterPosition, initMapLocation)

### Risultato

- Dopo X secondi senza interazione con la mappa, la camera torna silenziosamente sulla posizione GPS live
- Un indicatore visivo (es. pulsante pulsante) mostra che il re-center automatico è attivo/disattivo
- L'utente può disabilitare il re-center tenendo premuto o toccando il pulsante
## Relevant files

---
## #1286 — Mappa: salva e ripristina il livello di zoom precedente

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 23:54:48 UTC |
| **Aggiornato** | 2026-05-18 23:54:48 UTC |

### Richiesta

# Mappa: salva e ripristina il livello di zoom precedente

  ## What & Why
  Ogni volta che si riapre l'app la mappa torna allo zoom di default, anche se l'utente aveva impostato uno zoom diverso. Con la cache GPS già in posto, salvare anche il delta latitudine/longitudine (livello zoom) in AsyncStorage completa l'esperienza di "riapre dove avevo lasciato".

  ## Done looks like
  - Il livello di zoom (latitudeDelta/longitudeDelta) viene salvato in AsyncStorage (chiave `map_last_zoom`) ogni volta che cambia
  - All'avvio, il valore viene letto e applicato insieme alle coordinate GPS cached
  - Se non esiste nessun valore salvato, si usa lo zoom di default attuale

  ## Relevant files
  - `app/(tabs)/index.tsx` (region, setLocation, mapReady logic)

### Risultato

- Il livello di zoom (latitudeDelta/longitudeDelta) viene salvato in AsyncStorage (chiave `map_last_zoom`) ogni volta che cambia
- All'avvio, il valore viene letto e applicato insieme alle coordinate GPS cached
- Se non esiste nessun valore salvato, si usa lo zoom di default attuale
## Relevant files

---
## #1287 — Show biker photos on their public profile card visible to other users

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 23:54:57 UTC |
| **Aggiornato** | 2026-05-18 23:54:57 UTC |

### Richiesta

# Show biker photos on their public profile card visible to other users

  ## What & Why
  Bikers can now upload up to 3 photos in their own profile panel, but those photos are not yet displayed when other users view a biker's public profile card or detail page. To complete the feature, biker photos should be visible to other users just like zavorrina photos already are.

  ## Done looks like
  - When another user taps a biker on the map or in a list, the biker's approved photos are shown in their profile view
  - The display mirrors how zavorrina photos are already shown in the public profile

  ## Relevant files
  - Any public-profile or user-detail component (e.g. components/UserProfile.tsx or similar)
  - `app/(tabs)/profile.tsx` (reference for photo grid UI)

### Risultato

- When another user taps a biker on the map or in a list, the biker's approved photos are shown in their profile view
- The display mirrors how zavorrina photos are already shown in the public profile
## Relevant files
- Any public-profile or user-detail component (e.g. components/UserProfile.tsx or similar)

---
## #1289 — Carica gli asset competitor su Object Storage per persistenza in produzione

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 23:55:18 UTC |
| **Aggiornato** | 2026-05-18 23:55:18 UTC |

### Richiesta

# Carica gli asset competitor su Object Storage per persistenza in produzione

  ## What & Why
  Il PDF e il PNG dell'analisi competitor sono salvati in `server/public/assets/` che è sul filesystem locale. In produzione Replit, i file locali non sono persistenti tra deploy. Caricarli su Object Storage garantisce che rimangano disponibili indipendentemente dai deploy.

  ## Done looks like
  - competitor-analysis.pdf e competitor-analysis.png caricati nel bucket Object Storage (directory `public/`)
  - Le route /assets/competitor-analysis.pdf e /assets/competitor-analysis.png aggiornate per leggere da Object Storage (come già fatto per altri asset, vedere server/objectStorage.ts)
  - Script di generazione aggiornato per fare upload automatico dopo la generazione

  ## Relevant files
  - `server/public/assets/competitor-analysis.pdf`
  - `server/public/assets/competitor-analysis.png`
  - `server/objectStorage.ts`
  - `server/routes.ts` (righe 1338-1353 — route degli asset)
  - `scripts/generate-competitor-analysis.js`

### Risultato

## Relevant files
- `server/public/assets/competitor-analysis.pdf`
- `server/public/assets/competitor-analysis.png`
- `server/objectStorage.ts`

---
## #1290 — Remember the map center between app restarts

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 23:55:43 UTC |
| **Aggiornato** | 2026-05-18 23:55:43 UTC |

### Richiesta

# Remember the map center between app restarts

  ## What & Why
  The small map currently centers on the user's saved profile position at logout. However, if the user manually pans the map to a different area and then closes the app, the next session still starts from the logout position rather than where they left off. Persisting the last known map center in AsyncStorage would give a more natural "resume" feeling.

  ## Done looks like
  - When the user pans the small map (onRegionChangeComplete fires), save the center to AsyncStorage
  - On next app open, read that stored center and use it as the initial center override (taking priority over the profile position, which remains the fallback)
  - Clear the stored center on logout

  ## Relevant files
  - `app/(tabs)/index.tsx` — `lastSmallMapCenter` state, `smallMapInitialCenter` useMemo, AsyncStorage reads
  - `components/InteractiveMap.tsx` — `initialCenterOverride` prop, `onRegionChangeComplete` callback
  - `lib/auth-context.tsx` — logout mutation (to clear the key)

### Risultato

- When the user pans the small map (onRegionChangeComplete fires), save the center to AsyncStorage
- On next app open, read that stored center and use it as the initial center override (taking priority over the profile position, which remains the fallback)
- Clear the stored center on logout
## Relevant files

---
## #1292 — Keep map style preference hidden when admin later disables the toggle

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-18 23:57:12 UTC |
| **Aggiornato** | 2026-05-18 23:57:12 UTC |

### Richiesta

# Keep map style preference hidden when admin later disables the toggle

  ## What & Why
  When an admin disables the "Scelta stile utente" toggle after a user has already set their own map style, the user's saved `preferredMapStyle` value in the database remains and will silently be applied again if the toggle is re-enabled. There is no indication to the admin that existing user preferences persist, and the resolved provider in `lib/map-context.tsx` will use the stale user pref on re-enable.

  ## Done looks like
  - When the admin disables `maps_user_choice_enabled`, the API (or a migration) optionally resets all `preferredMapStyle` values to null, OR the admin panel shows a warning that user preferences are retained
  - Alternatively: add a "Reset all user map preferences" button in the admin maps section

  ## Relevant files
  - `app/admin/settings.tsx` (maps section, around line 2660)
  - `server/routes.ts` (PUT /api/admin/settings/maps_user_choice_enabled)
  - `lib/map-context.tsx`

### Risultato

- When the admin disables `maps_user_choice_enabled`, the API (or a migration) optionally resets all `preferredMapStyle` values to null, OR the admin panel shows a warning that user preferences are retained
- Alternatively: add a "Reset all user map preferences" button in the admin maps section
## Relevant files
- `app/admin/settings.tsx` (maps section, around line 2660)

---
## #1301 — Add Asia, North America, and Middle East countries to the area selector

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 00:06:14 UTC |
| **Aggiornato** | 2026-05-19 00:06:14 UTC |

### Richiesta

# Add Asia, North America, and Middle East countries to the area selector

  ## What & Why
  The CONTINENT_MAP currently has only JP and IN under Asia (AS) and only US/CA under North America (NA). Missing: China, South Korea, Thailand, Vietnam, Indonesia, Philippines, Malaysia, Saudi Arabia, UAE, Turkey, Israel, Mexico, Central American nations, etc.

  ## Done looks like
  - Asia: ~30+ countries added (CN, KR, TH, VN, ID, PH, MY, SG, TW, HK, BD, PK, LK, MM, KH, LA, MN, NP, BT, MV, AF, IR, IQ, SA, AE, QA, KW, OM, YE, JO, LB, SY, IL, CY, AZ, GE, KZ, UZ, AM, TJ, TM, KG)
  - North America: MX + Caribbean + Central American countries added
  - Each country has a flag, name, and regions list
  - Relevant files: `lib/countries-regions.ts`

### Risultato

- Asia: ~30+ countries added (CN, KR, TH, VN, ID, PH, MY, SG, TW, HK, BD, PK, LK, MM, KH, LA, MN, NP, BT, MV, AF, IR, IQ, SA, AE, QA, KW, OM, YE, JO, LB, SY, IL, CY, AZ, GE, KZ, UZ, AM, TJ, TM, KG)
- North America: MX + Caribbean + Central American countries added
- Each country has a flag, name, and regions list
- Relevant files: `lib/countries-regions.ts`

---
## #1302 — Let users search for a country or city inside the area selector

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 00:06:14 UTC |
| **Aggiornato** | 2026-05-19 00:06:14 UTC |

### Richiesta

# Let users search for a country or city inside the area selector

  ## What & Why
  With 130+ countries across 6 continents, the accordion list is large. A search bar at the top of the area modal would let users quickly find a specific country (e.g. "Brazil", "Australia") without manually expanding continents.

  ## Done looks like
  - A TextInput search bar appears at the top of the area modal
  - Typing filters continents/countries in real time (matches name or ISO code)
  - Selecting a result toggles that country on/off
  - The "Tutto il mondo" and confirm button remain visible

  ## Relevant files
  - `app/(tabs)/index.tsx` (showAreaModal section, ~line 1544)
  - `lib/countries-regions.ts` (ALL_COUNTRIES, getCountryByCode)

### Risultato

- A TextInput search bar appears at the top of the area modal
- Typing filters continents/countries in real time (matches name or ISO code)
- Selecting a result toggles that country on/off
- The "Tutto il mondo" and confirm button remain visible

---
## #1303 — Add a database index to make conversations load even faster

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 00:07:19 UTC |
| **Aggiornato** | 2026-05-19 00:07:19 UTC |

### Richiesta

# Add a database index to make conversations load even faster

  ## What & Why
  The `GET /api/chat/conversations` endpoint now paginates and uses a JOIN query, but the JOIN between `conversations` and `conversation_participants` on `conversationId`/`userId` can still do a full table scan without an index. Adding a composite index on `(userId, conversationId)` in `conversation_participants` will make the JOIN sub-millisecond even at scale.

  ## Done looks like
  - A migration adds `CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON conversation_participants(user_id, conversation_id)`
  - Query explain plan confirms an index scan is used instead of a seq scan

  ## Relevant files
  - `server/storage.ts` (getConversations, line ~770)
  - `shared/schema.ts` (conversation_participants table definition)
  - Migration script / drizzle schema

### Risultato

- A migration adds `CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON conversation_participants(user_id, conversation_id)`
- Query explain plan confirms an index scan is used instead of a seq scan
## Relevant files
- `server/storage.ts` (getConversations, line ~770)

---
## #1304 — Load more conversations when the user scrolls to the bottom of the chat list

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 00:07:19 UTC |
| **Aggiornato** | 2026-05-19 00:07:19 UTC |

### Richiesta

# Load more conversations when the user scrolls to the bottom of the chat list

  ## What & Why
  The backend now supports pagination (`limit` + `offset` query params, default 20 items) but the frontend chat tab still fetches all conversations in one call. Wiring up infinite scroll / "load more" will let users with 50+ conversations see the first 20 almost immediately, and fetch older ones on demand.

  ## Done looks like
  - The conversations query in the Expo frontend passes `limit=20&offset=N`
  - The FlatList triggers fetching the next page when the user reaches the end
  - New pages are appended to the existing list without a full re-render

  ## Relevant files
  - Frontend chat tab (likely `app/(tabs)/chat.tsx` or similar)
  - `server/routes/chat.ts` (GET /conversations — already paginated on backend)

### Risultato

- The conversations query in the Expo frontend passes `limit=20&offset=N`
- The FlatList triggers fetching the next page when the user reaches the end
- New pages are appended to the existing list without a full re-render
## Relevant files

---
## #1306 — Keep map focused on the right user when navigating back to the map

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 00:08:58 UTC |
| **Aggiornato** | 2026-05-19 00:08:58 UTC |

### Richiesta

# Keep map focused on the right user when navigating back to the map

  ## What & Why
  Currently, when navigating from a profile to the map with focusLat/focusLng params, the map centers on those coordinates. However, if the user visits another profile or presses back, the old params may still be in the URL and re-trigger the focus on stale coordinates. A dedicated "pending focus" mechanism — cleared after use — would be more robust than URL params.

  ## Done looks like
  - Replace URL-param-based focus with a React context or global store (e.g. `map-focus-context.tsx`) that holds a one-shot `pendingFocus` coordinate
  - The profile screen writes to this context on button tap instead of appending query params to the URL
  - The map tab reads and clears `pendingFocus` on mount/focus, so navigating back never re-triggers

  ## Relevant files
  - `app/profile/[id].tsx`
  - `app/(tabs)/index.tsx`
  - New file: `lib/map-focus-context.tsx`

### Risultato

- Replace URL-param-based focus with a React context or global store (e.g. `map-focus-context.tsx`) that holds a one-shot `pendingFocus` coordinate
- The profile screen writes to this context on button tap instead of appending query params to the URL
- The map tab reads and clears `pendingFocus` on mount/focus, so navigating back never re-triggers
## Relevant files

---
## #1310 — Show sensor overlay toggle for the 0-100 sprint screen too

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 00:10:21 UTC |
| **Aggiornato** | 2026-05-19 00:10:21 UTC |

### Richiesta

# Show sensor overlay toggle for the 0-100 sprint screen too

  ## What & Why
  The live sensor overlay toggle ("Sensori live") was added only for Race Mode (profile === "race"). The 0-100 sprint screen shows aggregate sensor cards after GO!, but doesn't yet have the compact live overlay with G-long / G-lateral / tilt that Race Mode has. Adding the same toggle to the sprint UI would give the rider real-time sensor feedback during the sprint.

  ## Done looks like
  - The same sensorOverlayToggleRow and sensorOverlayPanel UI appears in the sprint active screen (is0100Enabled === true)
  - The toggle is hidden during countdown and "waiting" phase, visible only when sprintPhase === "measuring" or "done"

  ## Relevant files
  - `app/(tabs)/tracking.tsx` — sprint section around line 2330–2460 (the is0100Enabled block)

### Risultato

- The same sensorOverlayToggleRow and sensorOverlayPanel UI appears in the sprint active screen (is0100Enabled === true)
- The toggle is hidden during countdown and "waiting" phase, visible only when sprintPhase === "measuring" or "done"
## Relevant files
- `app/(tabs)/tracking.tsx` — sprint section around line 2330–2460 (the is0100Enabled block)

---
## #1311 — Persist sensor overlay preference across rides

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 00:10:21 UTC |
| **Aggiornato** | 2026-05-19 00:10:21 UTC |

### Richiesta

# Persist sensor overlay preference across rides

  ## What & Why
  The `showSensorOverlay` state (Race Mode live sensor panel toggle) is in-memory React state and resets to `false` every time the user navigates away from the tracking tab or the app restarts. Saving this preference to AsyncStorage — alongside existing persisted settings like `sensorsEnabled` — would mean riders don't have to re-enable it on every ride.

  ## Done looks like
  - On mount, read `showSensorOverlay` from AsyncStorage (key: `@bikerlink/show_sensor_overlay`)
  - Write to AsyncStorage whenever the value changes (alongside the existing AsyncStorage.multiSet for other settings)

  ## Relevant files
  - `app/(tabs)/tracking.tsx` — state declaration line ~637, existing AsyncStorage.multiSet usage around line 750–800

### Risultato

- On mount, read `showSensorOverlay` from AsyncStorage (key: `@bikerlink/show_sensor_overlay`)
- Write to AsyncStorage whenever the value changes (alongside the existing AsyncStorage.multiSet for other settings)
## Relevant files
- `app/(tabs)/tracking.tsx` — state declaration line ~637, existing AsyncStorage.multiSet usage around line 750–800

---
## #1313 — Show the route on a map in the Giri detail screen

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 00:13:14 UTC |
| **Aggiornato** | 2026-05-19 00:13:14 UTC |

### Richiesta

# Show route polyline on map in Giri detail screen

  ## What & Why
  The Giri detail screen (app/giri/[id].tsx) currently shows stats, waypoints, weather, POI, and bikers — but no map visualization of the route. Users expect to see the actual road on a map before riding.

  ## Done looks like
  - A map view rendered in the detail screen showing the route polyline (when GraphHopper polyline is available) or waypoint markers (when only waypoints are saved)
  - The map uses the same LeafletHTML/WebView pattern already used in tracking ([id].tsx) or react-native-maps (v1.18.0 pinned) as used elsewhere in the app
  - Waypoint markers with numbered labels for start, stops, and end

  ## Relevant files
  - `app/giri/[id].tsx` — detail screen, add map view after heroCard
  - `app/routes/[id].tsx` — reference for existing map implementation pattern
  - `server/routes/planned-routes.ts` — polyline is returned from GraphHopper as encoded string, decodePolyline() is available

### Risultato

## Relevant files
- `app/giri/[id].tsx` — detail screen, add map view after heroCard
- `app/routes/[id].tsx` — reference for existing map implementation pattern
- `server/routes/planned-routes.ts` — polyline is returned from GraphHopper as encoded string, decodePolyline() is available

---
## #1315 — Aggiungi un form di contatto diretto nella pagina investitori

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 00:15:11 UTC |
| **Aggiornato** | 2026-05-19 00:15:11 UTC |

### Richiesta

# Aggiungi un form di contatto diretto nella pagina investitori

  ## What & Why
  La pagina /investors ha attualmente solo un link mailto:. Un form integrato (nome, email, messaggio, tipo di investitore) aumenta il tasso di conversione e permette di raccogliere lead in modo strutturato senza richiedere un client di posta.

  ## Done looks like
  - Form HTML/backend con campi: nome, email, tipologia (angel / fondo / partner strategico), messaggio
  - Invio via API e salvataggio nel DB o notifica email al team
  - Feedback visivo di conferma dopo l'invio

  ## Relevant files
  - `server/templates/investors.html`
  - `server/routes.ts`
  - `server/index.ts`

### Risultato

- Form HTML/backend con campi: nome, email, tipologia (angel / fondo / partner strategico), messaggio
- Invio via API e salvataggio nel DB o notifica email al team
- Feedback visivo di conferma dopo l'invio
## Relevant files

---
## #1316 — Proteggi la pagina investitori con un accesso riservato

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 00:15:11 UTC |
| **Aggiornato** | 2026-05-19 00:15:11 UTC |

### Richiesta

# Proteggi la pagina investitori con un accesso riservato

  ## What & Why
  La pagina /investors è pubblica ma contiene dati sensibili su mercato, revenue e strategia. Una protezione semplice (password o token URL) la rende accessibile solo a chi ne ha diritto.

  ## Done looks like
  - Accesso alla pagina /investors protetto da password o link con token segreto
  - Chi non ha il token viene reindirizzato a una pagina neutra
  - Il token è configurabile via variabile d'ambiente

  ## Relevant files
  - `server/index.ts`
  - `server/templates/investors.html`

### Risultato

- Accesso alla pagina /investors protetto da password o link con token segreto
- Chi non ha il token viene reindirizzato a una pagina neutra
- Il token è configurabile via variabile d'ambiente
## Relevant files

---
## #1321 — Promote GPS-based and event match types from predisposed to real DB match rows

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 00:19:17 UTC |
| **Aggiornato** | 2026-05-19 00:19:17 UTC |

### Richiesta

# Promote GPS/event matches to real match rows

  ## What & Why
  Match types 11–17 (lean angle, route zone, avg speed, avg duration, day/time, events) currently compute affinities but do not persist them as match rows in the DB — they are "predisposed" and return 0 inserted rows. Once the data model is confirmed ready, these should create actual match rows so users see them in their match feeds.

  ## Done looks like
  - `runGpsBasedMatching()` and `runEventMatching()` in `server/matching-engine.ts` create rows in the appropriate matches table rather than logging counts only
  - Preference gate checks (both-users-enabled) already in place and preserved
  - Consider a dedicated `gps_matches` or `affinity_matches` table if we don't want to mix them into the main `biker_biker_matches` table

  ## Relevant files
  - `server/matching-engine.ts` — `runGpsBasedMatching`, `runEventMatching`, `runBikerBikerTypeStyleMatching`
  - `shared/schema.ts` — add affinity match table if needed

### Risultato

- `runGpsBasedMatching()` and `runEventMatching()` in `server/matching-engine.ts` create rows in the appropriate matches table rather than logging counts only
- Preference gate checks (both-users-enabled) already in place and preserved
- Consider a dedicated `gps_matches` or `affinity_matches` table if we don't want to mix them into the main `biker_biker_matches` table
## Relevant files

---
## #1322 — Prevent match preferences from blocking direct match requests made via 'Richiedi Match'

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 00:19:17 UTC |
| **Aggiornato** | 2026-05-19 00:19:17 UTC |

### Richiesta

# Ensure directMatch preference is checked in direct-match request flow

  ## What & Why
  The `directMatch` preference flag is stored in the DB and readable via API but is not yet checked server-side when a user sends a direct match request (via the "Richiedi Match" button). A user with `directMatch=false` should not receive unsolicited direct match requests.

  ## Done looks like
  - `server/routes/friends.ts` (the `directMatchRequests` route) queries the receiver's `matchPreferences` row before inserting
  - If the receiver has `directMatch=false`, the API returns 403 with an Italian-language error message
  - Preference table already exists and defaults to `true`, so existing users are unaffected

  ## Relevant files
  - `server/routes/friends.ts` — direct match request creation
  - `server/routes/match-preferences.ts` — preference lookup helpers
  - `shared/schema.ts` — `matchPreferences` table

### Risultato

- `server/routes/friends.ts` (the `directMatchRequests` route) queries the receiver's `matchPreferences` row before inserting
- If the receiver has `directMatch=false`, the API returns 403 with an Italian-language error message
- Preference table already exists and defaults to `true`, so existing users are unaffected
## Relevant files

---
## #1340 — Add match history timeline — show when each match was created and status changes over time

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 01:10:45 UTC |
| **Aggiornato** | 2026-05-19 01:10:45 UTC |

### Richiesta

# Add match history timeline to the Match Inspector detail view

  ## What & Why
  The current Match Inspector detail shows each user's active matches grouped by type, but there's no historical view of when matches were made/accepted/rejected over time. An admin timeline would help diagnose why the engine is or isn't producing matches for specific users.

  ## Done looks like
  - In the match-inspector-detail screen, add a "Timeline" tab or section showing all matches in chronological order (newest first)
  - Each entry: date, type badge, matched user nickname, status change event
  - Optional filter by match type or status

  ## Relevant files
  - `app/admin/match-inspector-detail.tsx`
  - `server/routes/admin.ts` (GET /api/admin/match-inspector/users/:userId already returns createdAt)

### Risultato

- In the match-inspector-detail screen, add a "Timeline" tab or section showing all matches in chronological order (newest first)
- Each entry: date, type badge, matched user nickname, status change event
- Optional filter by match type or status
## Relevant files

---
## #1343 — Fix startup error: users.is_deleted column missing

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 01:33:00 UTC |
| **Aggiornato** | 2026-05-19 01:33:00 UTC |

### Richiesta

# Fix startup error: users.is_deleted column missing

  ## What & Why
  At startup (Phase 4+), a DrizzleQueryError appears: "column is_deleted does not exist" on the `users` table, triggered by the `/api/stats/global` query. The column is used in queries but lacks a migration to add it to the database.

  ## Done looks like
  - Add `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false` to the Phase 1 migrations block in `server/index.ts`
  - The startup error disappears from logs
  - `/api/stats/global` returns correct counts without error

  ## Relevant files
  - `server/index.ts` — Phase 1 migrations block
  - `shared/schema.ts` — users table definition (is_deleted column)
  - `server/storage.ts` — queries that use is_deleted

### Risultato

- Add `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false` to the Phase 1 migrations block in `server/index.ts`
- The startup error disappears from logs
- `/api/stats/global` returns correct counts without error
## Relevant files

---
## #1353 — Add app store preview screenshots to the landing page

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 12:23:46 UTC |
| **Aggiornato** | 2026-05-19 12:23:46 UTC |

### Richiesta

# Add app store preview screenshots to the landing page

  ## What & Why
  The feature sections (01–08) each have a `.feature-visual` placeholder div that currently renders as an empty dark box. Real in-app screenshots or mockup images in these slots would dramatically increase conversion and visual impact.

  ## Done looks like
  - Each of the 8 feature sections has a relevant screenshot or mockup in its `.feature-visual` area
  - Images are hosted via the project's object storage or inlined as optimized assets
  - Images use `loading="lazy"` and have proper alt text

  ## Relevant files
  - `server/templates/landing-page.html` — .feature-visual divs (one per feature section, lines ~965–1150)
  - `public/assets/images/` — where new images would be placed

### Risultato

- Each of the 8 feature sections has a relevant screenshot or mockup in its `.feature-visual` area
- Images are hosted via the project's object storage or inlined as optimized assets
- Images use `loading="lazy"` and have proper alt text
## Relevant files

---
## #1354 — Hook up the investor contact form so it actually sends messages

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 12:23:46 UTC |
| **Aggiornato** | 2026-05-19 12:23:46 UTC |

### Richiesta

# Hook up the investor contact form so it actually sends messages

  ## What & Why
  The landing page footer links to `#investitori` nav item and there is an "INVESTITORI" nav link, but there is no functioning contact or lead-capture form for investors. Adding a simple form that POSTs to the backend (or sends an email) would make the investor CTA actionable.

  ## Done looks like
  - A form (name, email, message) is accessible from the INVESTITORI nav link
  - Submission POSTs to a new `POST /api/contact/investor` endpoint on the Express server
  - The backend either stores the lead in the DB or sends a notification email
  - A success/error state is shown inline on the page without reloading

  ## Relevant files
  - `server/templates/landing-page.html`
  - `server/routes.ts`

### Risultato

- A form (name, email, message) is accessible from the INVESTITORI nav link
- Submission POSTs to a new `POST /api/contact/investor` endpoint on the Express server
- The backend either stores the lead in the DB or sends a notification email
- A success/error state is shown inline on the page without reloading

---
## #1358 — Let admins upload PDF and video files directly in the media panel

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 12:51:59 UTC |
| **Aggiornato** | 2026-05-19 12:51:59 UTC |

### Richiesta

# Let admins upload PDF and video files directly in the media panel

  ## What & Why
  The admin media panel (/admin/media) currently accepts a URL or file upload, but the file upload endpoint requires object storage integration to be fully wired. The UI is complete but the upload flow needs end-to-end testing and the file-serving route needs validation with real object storage.

  ## Done looks like
  - Admin can upload a PDF or video file from the modal
  - File is stored in object storage and served correctly
  - The URL field is auto-filled after upload completes

  ## Relevant files
  - `server/routes/media-library.ts` — upload endpoint (POST /upload, GET /file/:filename)
  - `server/objectStorage.ts` — uploadBuffer / downloadBuffer helpers
  - `server/templates/web-portal.html` — handleFileSelect() JS function

### Risultato

- Admin can upload a PDF or video file from the modal
- File is stored in object storage and served correctly
- The URL field is auto-filled after upload completes
## Relevant files

---
## #1359 — Let logged-in users edit their profile from the web area

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 12:51:59 UTC |
| **Aggiornato** | 2026-05-19 12:51:59 UTC |

### Richiesta

# Let logged-in users edit their profile from the web area

  ## What & Why
  The /area-utente page currently shows the user's profile (nickname, type, garage, stats) in read-only mode. Users expect to be able to update their info — at minimum their nickname or profile preferences — from the web interface without needing the mobile app.

  ## Done looks like
  - Edit button on the user area opens a form pre-filled with current data
  - User can update nickname, user type, and other editable fields
  - Changes are persisted via the existing /api/auth/profile (or equivalent) endpoint

  ## Relevant files
  - `server/templates/web-portal.html` — renderArea() function
  - `server/routes/auth.ts` — profile update endpoint

### Risultato

- Edit button on the user area opens a form pre-filled with current data
- User can update nickname, user type, and other editable fields
- Changes are persisted via the existing /api/auth/profile (or equivalent) endpoint
## Relevant files

---
## #1360 — Add navbar links to the landing page pointing to the web portal

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 12:51:59 UTC |
| **Aggiornato** | 2026-05-19 12:51:59 UTC |

### Richiesta

# Add navbar links to the landing page pointing to the web portal

  ## What & Why
  The landing page (/) and the web portal (/accedi, /registrati, /media) are separate HTML files with no cross-links. Users visiting the landing page have no way to discover the register/login pages unless they know the URL.

  ## Done looks like
  - Landing page navbar includes a "Registrati" button linking to /registrati
  - Landing page navbar includes an "Accedi" button linking to /accedi
  - A "Risorse" link pointing to /media is visible on the landing page

  ## Relevant files
  - `server/templates/landing-page.html` — navbar section

### Risultato

- Landing page navbar includes a "Registrati" button linking to /registrati
- Landing page navbar includes an "Accedi" button linking to /accedi
- A "Risorse" link pointing to /media is visible on the landing page
## Relevant files

---
## #1362 — Rigenera automaticamente i PDF di documentazione ad ogni release

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 12:52:55 UTC |
| **Aggiornato** | 2026-05-19 12:52:55 UTC |

### Richiesta

# Rigenera automaticamente i PDF di documentazione ad ogni release

  ## What & Why
  Esistono due script di generazione PDF (`generate-manual-pdf.mjs` e ora `generate-matching-pdf.mjs`) che devono essere lanciati manualmente. È facile dimenticarsene e finire con PDF disallineati rispetto ai markdown sorgente. Conviene agganciarli a uno step automatico (es. pre-build, hook di post-merge, o script unico `docs:all`).

  ## Done looks like
  - Un singolo comando (es. `npm run docs:all`) rigenera tutti i PDF della documentazione
  - La generazione viene invocata automaticamente prima delle build di produzione o nel post-merge hook
  - I PDF in docs/ sono sempre allineati alla versione corrente dei markdown

  ## Relevant files
  - `scripts/generate-manual-pdf.mjs`
  - `scripts/generate-matching-pdf.mjs`
  - `scripts/post-merge.sh`
  - `package.json`

### Risultato

- Un singolo comando (es. `npm run docs:all`) rigenera tutti i PDF della documentazione
- La generazione viene invocata automaticamente prima delle build di produzione o nel post-merge hook
- I PDF in docs/ sono sempre allineati alla versione corrente dei markdown
## Relevant files

---
## #1364 — Track who toggled match preferences and when

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 12:53:11 UTC |
| **Aggiornato** | 2026-05-19 12:53:11 UTC |

### Richiesta

# Track who toggled match preferences and when

  ## What & Why
  The admin can now toggle global visibility of match preferences and reset all users' preferences in bulk, but these privileged actions leave no audit trail. For accountability and debugging (e.g. "why did everyone's preferences reset last Tuesday?"), log who performed them and when.

  ## Done looks like
  - Each call to `PUT /api/admin/match-settings` and `POST /api/admin/match-settings/reset-all` writes an entry to the existing moderator/admin log table (see `app/admin/moderator-logs.tsx` for what's already tracked)
  - Entry includes admin user id, action type, timestamp, and for reset-all the affected count
  - Visible in the existing Moderator Logs admin screen

  ## Relevant files
  - `server/routes/admin.ts` — endpoints around line 6074 (toggle) and 6398 (reset-all)
  - `app/admin/moderator-logs.tsx` — existing audit log UI to mirror

### Risultato

- Each call to `PUT /api/admin/match-settings` and `POST /api/admin/match-settings/reset-all` writes an entry to the existing moderator/admin log table (see `app/admin/moderator-logs.tsx` for what's already tracked)
- Entry includes admin user id, action type, timestamp, and for reset-all the affected count
- Visible in the existing Moderator Logs admin screen
## Relevant files

---
## #1365 — Mostra una mappa anteprima del tracciato GPX importato

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 12:53:30 UTC |
| **Aggiornato** | 2026-05-19 12:53:30 UTC |

### Richiesta

# Mostra una mappa anteprima del tracciato GPX importato

  ## What & Why
  Quando un utente importa un file GPX, il backend salva solo i waypoint (`<wpt>`) ma scarta tutti i `<trkpt>` del tracciato reale (vedi `server/routes/planned-routes.ts` blocco import-gpx). Di conseguenza la pagina dettaglio del Giro mostra solo le tappe in linea retta, perdendo la forma reale del percorso che l'utente ha caricato. Salvare e visualizzare la polyline del tracciato renderebbe l'import GPX molto più utile.

  ## Done looks like
  - Il tracciato originale (campionato a max ~500 punti) viene codificato in polyline e salvato nel campo `polyline` del PlannedRoute durante l'import
  - La pagina dettaglio Giro disegna il tracciato reale sulla mappa, non solo i waypoint
  - La distanza salvata continua a essere calcolata dai trkpt completi (già funzionante)

  ## Relevant files
  - `server/routes/planned-routes.ts` (blocco `/import-gpx`)
  - `app/giri/[id].tsx`

### Risultato

- Il tracciato originale (campionato a max ~500 punti) viene codificato in polyline e salvato nel campo `polyline` del PlannedRoute durante l'import
- La pagina dettaglio Giro disegna il tracciato reale sulla mappa, non solo i waypoint
- La distanza salvata continua a essere calcolata dai trkpt completi (già funzionante)
## Relevant files

---
## #1366 — Permetti di scegliere visibilità e titolo quando si importa un GPX

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 12:53:30 UTC |
| **Aggiornato** | 2026-05-19 12:53:30 UTC |

### Richiesta

# Permetti di scegliere visibilità e titolo quando si importa un GPX

  ## What & Why
  L'attuale flusso di import salva sempre il Giro come `private` e usa il nome del file come titolo. Gli utenti che importano percorsi da rally o da amici vorrebbero spesso condividerli subito con la community o assegnare un titolo descrittivo prima del salvataggio.

  ## Done looks like
  - Dopo aver scelto il file GPX, appare un piccolo modal con: campo Titolo precompilato dal filename, selettore visibilità (Pubblico / Privato), pulsante "Importa"
  - Il modal mostra anche un riepilogo (numero waypoint trovati, distanza stimata) prima della conferma
  - Annullare il modal non crea alcun Giro

  ## Relevant files
  - `app/(tabs)/giri.tsx` (handler `handleImportGpx`)
  - `server/routes/planned-routes.ts` (endpoint `/import-gpx` accetta già `title` e `visibility`)

### Risultato

- Dopo aver scelto il file GPX, appare un piccolo modal con: campo Titolo precompilato dal filename, selettore visibilità (Pubblico / Privato), pulsante "Importa"
- Il modal mostra anche un riepilogo (numero waypoint trovati, distanza stimata) prima della conferma
- Annullare il modal non crea alcun Giro
## Relevant files

---
## #1372 — Show a Pic! badge on sprint rows already shared

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 13:02:18 UTC |
| **Aggiornato** | 2026-05-19 13:02:18 UTC |

### Richiesta

# Show a Pic! badge on sprint rows already shared

  ## What & Why
  After publishing a sprint to the Photo Contest from sprint-history, there's no visual indication that the sprint has already been shared. Riders may publish the same result multiple times by accident. A small "shared" badge or a disabled state on the share button would make the published state visible.

  ## Done looks like
  - Sprint rows that have already been published to the Pic! contest show a badge / different icon
  - The share button is either hidden or visually marked as "already shared" for those entries
  - Detection is based on existing contest entries for the current user that reference the sprint id (may require linking sprintId in performanceData or a new join)

  ## Relevant files
  - `app/sprint-history.tsx`
  - `server/routes/contest.ts`
  - `shared/schema.ts` (photoContestEntries.performanceData)

### Risultato

- Sprint rows that have already been published to the Pic! contest show a badge / different icon
- The share button is either hidden or visually marked as "already shared" for those entries
- Detection is based on existing contest entries for the current user that reference the sprint id (may require linking sprintId in performanceData or a new join)
## Relevant files

---
## #1373 — Render sprint performance cards nicely in the Pic! feed

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 13:02:18 UTC |
| **Aggiornato** | 2026-05-19 13:02:18 UTC |

### Richiesta

# Render sprint performance cards nicely in the Pic! feed

  ## What & Why
  Sprint entries published from sprint-history now reach the Pic! contest with structured `performanceData` (type="sprint", time, G, tilt) but no photo. The Pic! feed should detect these performance-only entries and render a polished stat card (trophy icon, big 0→100 time, G / tilt chips) instead of an empty placeholder.

  ## Done looks like
  - Pic! feed/list component detects entries where performanceData.type === "sprint"
  - Renders a dedicated visual card with the sprint time, max G and max tilt
  - Falls back to the existing ride performance card layout for ride-type entries

  ## Relevant files
  - `app/(tabs)/pic.tsx` (or wherever the contest feed is rendered)
  - `server/routes/contest.ts`

### Risultato

- Pic! feed/list component detects entries where performanceData.type === "sprint"
- Renders a dedicated visual card with the sprint time, max G and max tilt
- Falls back to the existing ride performance card layout for ride-type entries
## Relevant files

---
## #1374 — Mostra anche distanza percorsa nella notifica blocco-schermo

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 13:03:26 UTC |
| **Aggiornato** | 2026-05-19 13:03:26 UTC |

### Richiesta

# Mostra anche distanza percorsa nella notifica blocco-schermo

  ## What & Why
  La notifica del foreground service ora mostra il numero di punti GPS acquisiti durante la registrazione a schermo bloccato. Aggiungere anche la distanza percorsa (es. "12,4 km — 87 punti acquisiti") darebbe al pilota un'informazione molto più utile a colpo d'occhio senza sbloccare il telefono.

  ## Done looks like
  - La notifica include sia distanza che numero di punti, localizzata in tutte le 7 lingue
  - La distanza è formattata secondo l'unità scelta dall'utente (km o miglia)
  - L'aggiornamento resta throttlato per non causare churn

  ## Relevant files
  - `app/(tabs)/tracking.tsx` — task BACKGROUND_LOCATION_TASK (linee 58-109), BG_NOTIF_CONFIG_KEY
  - `lib/i18n/*.ts` — chiave `tracking.bgNotification.pointsCount`

### Risultato

- La notifica include sia distanza che numero di punti, localizzata in tutte le 7 lingue
- La distanza è formattata secondo l'unità scelta dall'utente (km o miglia)
- L'aggiornamento resta throttlato per non causare churn
## Relevant files

---
## #1375 — Filter the sprint leaderboard by bike type and engine size

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 13:03:46 UTC |
| **Aggiornato** | 2026-05-19 13:03:46 UTC |

### Richiesta

# Filter the sprint leaderboard by bike type and engine size

  ## What & Why
  The leaderboard endpoint already supports filtering by motorcycle type and displacement range via query params, but the UI doesn't expose those filters yet. Adding chips/dropdowns would let riders compare like-for-like (e.g. naked vs sport, 600cc class vs 1000cc class) and make the leaderboard more meaningful.

  ## Done looks like
  - A filter row above the leaderboard list with chips for motorcycle type (sport, naked, touring, etc.) and a displacement range selector (e.g. 0-300, 300-600, 600-900, 900+)
  - Selected filters are passed to /api/sprints/leaderboard as motorcycleType, minDisplacement, maxDisplacement
  - React Query key includes the filters so cache works correctly
  - Empty state is friendly when filters return no riders

  ## Relevant files
  - `app/sprint-history.tsx` (UI)
  - `server/routes/sprints.ts` (endpoint already supports the params)

### Risultato

- A filter row above the leaderboard list with chips for motorcycle type (sport, naked, touring, etc.) and a displacement range selector (e.g. 0-300, 300-600, 600-900, 900+)
- Selected filters are passed to /api/sprints/leaderboard as motorcycleType, minDisplacement, maxDisplacement
- React Query key includes the filters so cache works correctly
- Empty state is friendly when filters return no riders

---
## #1379 — Sync country/area selection across devices too

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 13:05:52 UTC |
| **Aggiornato** | 2026-05-19 13:05:52 UTC |

### Richiesta

# Sync country/area selection across devices too

  ## What & Why
  We now sync the four map filter toggles (Biker, Zavorrine, Motoclub, Eventi) to the user's profile, but the selected countries / areas on the map are still saved only in AsyncStorage (`map_area_countries`). For consistency, the country selection should follow the same pattern so users get the same map view on every device.

  ## Done looks like
  - A new field on the user profile (e.g. `mapCountries` string array) is persisted server-side
  - On login, country selection is loaded from the server, overriding the device default
  - `saveCountries` in `app/(tabs)/index.tsx` pushes the change to the backend with graceful AsyncStorage fallback

  ## Relevant files
  - `app/(tabs)/index.tsx` (around `saveCountries` and the initial countries-load effect, lines ~144–205)
  - `server/routes/users.ts` (PUT /api/users/me)
  - `server/routes/auth.ts` (GET /api/auth/me response)
  - `shared/schema.ts` (userProfiles table)

### Risultato

- A new field on the user profile (e.g. `mapCountries` string array) is persisted server-side
- On login, country selection is loaded from the server, overriding the device default
- `saveCountries` in `app/(tabs)/index.tsx` pushes the change to the backend with graceful AsyncStorage fallback
## Relevant files

---
## #1380 — Show riders in more African countries in the area picker

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 13:06:53 UTC |
| **Aggiornato** | 2026-05-19 13:06:53 UTC |

### Richiesta

# Show riders in more African countries in the area picker

  ## What & Why
  The Africa continent group in `lib/countries-regions.ts` (CONTINENT_MAP) lists ~50 country codes (AO, BF, BI, BJ, BW, CD, CF, CG, CI, CM, CV, DJ, DZ, EG, ER, GA, GM, GN, GQ, GW, KM, LR, LS, LY, MA, MG, ML, MR, MU, MW, MZ, NA, NE, RW, SC, SD, SL, SN, SO, SS, ST, SZ, TD, TG, TN, UG, ZM, ZW, etc.), but only ET, GH, KE, NG, TZ, and ZA have CountryData entries with regions. The rest don't render any entries when the user expands "Africa" in the area picker.

  ## Done looks like
  - All (or the highest-motorcycle-density majority of) African country codes referenced in CONTINENT_MAP have matching CountryData entries with their main regions/cities and coordinates in `lib/countries-regions.ts`
  - Expanding "Africa" in the area picker shows all those countries as selectable entries with flags

  ## Relevant files
  - `lib/countries-regions.ts` — add new CountryData entries and ensure CONTINENT_MAP Africa stays in sync
  - `app/(tabs)/index.tsx` — area picker that renders continent → countries

### Risultato

- All (or the highest-motorcycle-density majority of) African country codes referenced in CONTINENT_MAP have matching CountryData entries with their main regions/cities and coordinates in `lib/countries-regions.ts`
- Expanding "Africa" in the area picker shows all those countries as selectable entries with flags
## Relevant files
- `lib/countries-regions.ts` — add new CountryData entries and ensure CONTINENT_MAP Africa stays in sync

---
## #1382 — Mostra agli utenti come l'admin ha configurato le regole di privacy

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 13:08:29 UTC |
| **Aggiornato** | 2026-05-19 13:08:29 UTC |

### Richiesta

# Mostra agli utenti come l'admin ha configurato le regole di privacy

  ## What & Why
  Oggi l'utente non ha modo di sapere se la randomizzazione offline è disabilitata globalmente o se la mappa è filtrata per soli online/disponibili. Esponendo le regole correnti tramite un endpoint pubblico (read-only) il client può adattare l'UI (es. nascondere il toggle utente se l'admin l'ha disattivato globalmente) e mostrare un piccolo avviso informativo.

  ## Done looks like
  - Nuovo endpoint pubblico `GET /api/settings/privacy-rules` (no auth admin) che restituisce le 3 regole
  - Le schermate impostazioni utente leggono il valore e disabilitano/spiegano i toggle locali quando sovrascritti dall'admin

  ## Relevant files
  - `server/routes/admin.ts` (o nuovo router pubblico per le settings)
  - `app/(tabs)/settings.tsx` / schermate privacy utente

### Risultato

- Nuovo endpoint pubblico `GET /api/settings/privacy-rules` (no auth admin) che restituisce le 3 regole
- Le schermate impostazioni utente leggono il valore e disabilitano/spiegano i toggle locali quando sovrascritti dall'admin
## Relevant files
- `server/routes/admin.ts` (o nuovo router pubblico per le settings)

---
## #1384 — Mostra il pulsante 'Sync ora' nel pannello admin per triggerare il sync senza usare la shell

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 13:16:28 UTC |
| **Aggiornato** | 2026-05-19 13:16:28 UTC |

### Richiesta

# Pulsante Sync ora nel pannello admin

  ## What & Why
  L'endpoint POST /api/admin/sync/trigger esiste ma non è esposto nell'interfaccia admin. Per triggerare un sync immediato bisogna usare la shell o curl. Un pulsante nella pagina admin settings consentirebbe al developer di sincronizzare il DB dev dal pannello senza accesso al terminale.

  ## Done looks like
  - In app/admin/settings.tsx (o pagina admin dedicata) appare una card "Sync Prod → Dev"
  - La card mostra lo stato dell'ultimo sync (data, esito) e il prossimo sync schedulato tramite GET /api/admin/sync/status
  - Un pulsante "Sync ora" chiama POST /api/admin/sync/trigger e mostra feedback (loading, successo, errore)
  - Visibile solo in ambiente di sviluppo (isSyncAvailable = true)

  ## Relevant files
  - app/admin/settings.tsx
  - server/routes/admin.ts (endpoint già presenti: GET /sync/status, POST /sync/trigger)
  - server/sync-service.ts

### Risultato

- In app/admin/settings.tsx (o pagina admin dedicata) appare una card "Sync Prod → Dev"
- La card mostra lo stato dell'ultimo sync (data, esito) e il prossimo sync schedulato tramite GET /api/admin/sync/status
- Un pulsante "Sync ora" chiama POST /api/admin/sync/trigger e mostra feedback (loading, successo, errore)
- Visibile solo in ambiente di sviluppo (isSyncAvailable = true)

---
## #1385 — Animate the visibility badge when it changes state

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 13:21:00 UTC |
| **Aggiornato** | 2026-05-19 13:21:00 UTC |

### Richiesta

# Animate the visibility badge when it changes state

  ## What & Why
  The visibility summary badge in the Status tab currently updates instantly with no visual feedback. A brief color-fade or scale animation when the badge transitions between states (e.g. ghost mode on/off) would make the change feel polished and deliberate.

  ## Done looks like
  - The badge smoothly fades or pulses when its label/color changes as toggles are flipped
  - Animation uses react-native-reanimated (already installed) so it works on iOS, Android, and web

  ## Relevant files
  - `app/(tabs)/ready.tsx` — VisibilitySummary component and visStyles

### Risultato

- The badge smoothly fades or pulses when its label/color changes as toggles are flipped
- Animation uses react-native-reanimated (already installed) so it works on iOS, Android, and web
## Relevant files
- `app/(tabs)/ready.tsx` — VisibilitySummary component and visStyles

---
## #1386 — Translate privacy toggle strings in the ride/settings screen too

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 13:22:08 UTC |
| **Aggiornato** | 2026-05-19 13:22:08 UTC |

### Richiesta

# Translate privacy toggle strings in the ride/settings screen too

  ## What & Why
  The ride.tsx (or settings/GPS) screen may contain hardcoded Italian strings related to ghost mode, privacy, and GPS settings that were not covered by this task — which only targeted ready.tsx. Non-Italian users on those screens would still see Italian text.

  ## Done looks like
  - All privacy/GPS-related strings in app/(tabs)/ride.tsx (and any other screen referencing ghost mode or privacy settings) use t() calls with i18n keys present in all 7 language files (it, en, fr, es, de, el, tr)

  ## Relevant files
  - app/(tabs)/ride.tsx
  - lib/i18n/it.ts, en.ts, fr.ts, es.ts, de.ts, el.ts, tr.ts

### Risultato

- All privacy/GPS-related strings in app/(tabs)/ride.tsx (and any other screen referencing ghost mode or privacy settings) use t() calls with i18n keys present in all 7 language files (it, en, fr, es, de, el, tr)
## Relevant files
- app/(tabs)/ride.tsx
- lib/i18n/it.ts, en.ts, fr.ts, es.ts, de.ts, el.ts, tr.ts

---
## #1387 — Clear stale sensor snapshot when a ride ends so the next ride starts fresh

| Campo | Valore |
|-------|--------|
| **Stato** | 📋 PROPOSED |
| **Creato** | 2026-05-19 13:22:46 UTC |
| **Aggiornato** | 2026-05-19 13:22:46 UTC |

### Richiesta

# Clear stale sensor snapshot when a ride ends so the next ride starts fresh

  ## What & Why
  `BG_SENSOR_SNAPSHOT_KEY` is now written to AsyncStorage during every ride and persists indefinitely.
  If the app crashes mid-ride or the user force-quits, the last snapshot from the previous session
  remains in storage. On the next ride, the background task would read that stale value until the
  foreground sensor loop fires and overwrites it (~1 s after calibration). Clearing the key at the
  correct lifecycle points avoids any mismatch.

  ## Done looks like
  - `BG_SENSOR_SNAPSHOT_KEY` is removed from AsyncStorage (or set to null) when:
    - A ride is stopped/completed (`stopRide` / phase transition to "idle")
    - The background-task start IIFE clears stale bg points (line ~1037 in tracking.tsx)
  - No stale sensor data appears on a fresh ride if the app was previously killed mid-ride

  ## Relevant files
  - `app/(tabs)/tracking.tsx` — look for `BG_POINTS_KEY` clears at ride-stop and at bg-task start (~lines 1037, 1147, 1659–1660)

### Risultato

- `BG_SENSOR_SNAPSHOT_KEY` is removed from AsyncStorage (or set to null) when:
- A ride is stopped/completed (`stopRide` / phase transition to "idle")
- The background-task start IIFE clears stale bg points (line ~1037 in tracking.tsx)
- No stale sensor data appears on a fresh ride if the app was previously killed mid-ride

---
## #2168 — Fix crash loop web — SyntaxError 'app'

| Campo | Valore |
|-------|--------|
| **Stato** | 🔄 IN_PROGRESS |
| **Creato** | 2026-05-23 21:09:08 UTC |
| **Aggiornato** | 2026-05-23 21:53:25 UTC |

### Richiesta

# Fix crash loop web — SyntaxError Unexpected identifier 'app'

## What & Why
La preview web crasha in loop continuo con `SyntaxError: Unexpected identifier 'app'`. Il browser console mostra 88+ occorrenze dello stesso errore. L'app non è utilizzabile nella preview web di Replit.

## Done looks like
- La preview web si carica senza crash
- Il browser console non mostra più `SyntaxError: Unexpected identifier 'app'`
- Il loop di riavvio cessa

## Out of scope
- Correzione di problemi di layout o UI nella preview web
- Ottimizzazioni di performance web

## Steps
1. **Individua il file responsabile** — Cercare nei file recentemente modificati (post-merge task #2155 e #2156) file `.js` o `.ts` che contengano la stringa `app` in posizione sintattica illegale (es. `export app`, `module app`, dichiarazione di variabile mal formata). Cercare anche file con `import` o `export` default che usino `app` come identificatore ambiguo.

2. **Invalida la cache Metro/bundle web** — Se il file non è immediatamente individuabile, eseguire una pulizia cache Metro (clean-metro.sh) e riavviare il frontend per verificare se il bundle corrotto si risolve da solo con una ricompilazione pulita.

3. **Verifica la preview web** — Dopo il fix o la pulizia cache, aprire la preview web su porta 8081 e confermare che non ci siano più SyntaxError nel browser console.

## Relevant files
- `package.json`

### Risultato

- La preview web si carica senza crash
- Il browser console non mostra più `SyntaxError: Unexpected identifier 'app'`
- Il loop di riavvio cessa

---
## #2173 — Export storia task + endpoint protetto

| Campo | Valore |
|-------|--------|
| **Stato** | 🔄 IN_PROGRESS |
| **Creato** | 2026-05-23 21:53:43 UTC |
| **Aggiornato** | 2026-05-23 21:54:11 UTC |

### Richiesta

# Export storia task BikerLink

## What & Why
Esportare la storia completa dei task del progetto in un file Markdown leggibile da un altro agente, con un endpoint Express protetto per scaricarli via HTTP.

## Realtà della sorgente dati (importante per il task agent)
- L'API PID2 (`listProjectTasks` / `getProjectTask`) espone **298 task** suddivisi per stato: PROPOSED 98, MERGED 100, CANCELLED 99, IN_PROGRESS 1. Non 2200.
- Ci sono **1.759 file `.md`** in `.local/tasks/` — piani scritti nel tempo, molti relativi a task non più tracciati nell'API.
- Le funzioni PID2 sono accessibili **solo nella sandbox code_execution** dell'agente — non da uno script ts-node ordinario.
- Strategia adottata: l'agente pre-genera `exports/bikerlink-tasks-meta.json` via code_execution (fetch di tutti i task + descrizioni one-by-one); poi `scripts/src/export-tasks.ts` legge quel JSON + i file piano e produce il Markdown.

## Done looks like
- `exports/bikerlink-tasks-meta.json` contiene tutti i 298 task con metadata e descrizione
- `exports/bikerlink-tasks.md` (o parti numerate se >2MB) contiene la storia in Markdown leggibile
- `GET /api/_internal/tasks-export` risponde 401 senza token, 200 con il Markdown corretto
- Script rieseguibile via `npx ts-node scripts/src/export-tasks.ts`
- In chat: conteggio task esportati, dimensione file, base URL pubblica, senza mai stampare il token

## Out of scope
- UI di qualsiasi tipo
- Cron job o scheduling
- Modifiche al database
- OpenAPI spec aggiornata
- Logica di auto-refresh del JSON (va rigenerato manualmente dall'agente quando serve)

## Steps

1. **Pre-generazione metadata JSON** — Usare code_execution per: (a) iterare su tutti gli stati (`PROPOSED`, `PENDING`, `IN_PROGRESS`, `IMPLEMENTED`, `MERGING`, `MERGED`, `CANCELLED`, `BLOCKED_BY_DRIFT`), (b) per ogni task chiamare `getProjectTask` individualmente per ottenere la `description`, (c) scrivere `exports/bikerlink-tasks-meta.json` ordinato per `createdAt` con campi: `taskRef`, `title`, `stat

_(troncato)_

### Risultato

- `exports/bikerlink-tasks-meta.json` contiene tutti i 298 task con metadata e descrizione
- `exports/bikerlink-tasks.md` (o parti numerate se >2MB) contiene la storia in Markdown leggibile
- `GET /api/_internal/tasks-export` risponde 401 senza token, 200 con il Markdown corretto
- Script rieseguibile via `npx ts-node scripts/src/export-tasks.ts`

---
