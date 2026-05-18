---
name: bikerlink-website
description: Skill completa per costruire il sito internet di BikerLink. Contiene struttura pagine, sezioni, requisiti tecnici, contesto app, strategia utenti e tutto il necessario per realizzare il sito. Usa questa skill ogni volta che lavori sul sito di BikerLink.
---

# BikerLink — Sito Internet

## Identità

- **Nome app:** BikerLink
- **Tagline:** *U'll Never Ride Alone*
- **Concept:** App sociale GPS per biker. Trova altri motociclisti compatibili nelle vicinanze in tempo reale. Non è un'app di route planning — è un social network per chi è in moto.
- **Lingue:** Italiano + Inglese di default. Struttura i18n per aggiungere altre lingue in futuro.

---

## Utenti dell'app (terminologia ufficiale)

| Tipo | Descrizione |
|---|---|
| **Biker** | Motociclista (uomo o donna) |
| **Zavorrina** | Passeggero/a (termine italiano ufficiale nell'app) |

Usare sempre questi termini nel sito — mai "passeggero" o "pillion".

---

## Struttura del sito

### 1. Frontpage (/)

La frontpage è il cuore del sito. Deve comunicare immediatamente cosa fa BikerLink e mostrare la community in tempo reale.

**Elementi obbligatori:**

#### Video di presentazione
- Sezione dedicata ai video promo dell'app
- L'utente ha già video e immagini pronti da caricare
- Supporto upload nella sezione CMS (vedi sezione Assets)

#### Mappa interattiva in tempo reale
- Mappa del mondo che mostra iscritti/online/disponibili
- Collegata all'API dell'app (vedi sezione API)
- Fallback: mappa statica/immagine se API non disponibile
- Punti sulla mappa = biker registrati o online in quel momento

#### Counter triplo (cliccabile)
Tre counter affiancati, visibili subito:
- **Iscritti totali** — cliccando: apre breakdown per continente → per paese
- **Biker** — counter specifico per biker
- **Zavorrine** — counter specifico per passeggeri

Struttura counter iscritti (gerarchia cliccabile):
```
Iscritti Totali: 12.450
  └── Europa: 8.200
        ├── Italia: 3.100
        ├── Germania: 1.800
        ├── Francia: 1.200
        └── ...
  └── America: 2.100
  └── Asia: 1.500
  └── ...
```

#### Roadmap
- Sezione roadmap visibile in frontpage
- **DA COSTRUIRE** — preparare una struttura editabile con:
  - Tappe completate (con data)
  - Tappa corrente (in corso)
  - Tappe future
- Formato consigliato: timeline orizzontale o verticale con stati visivi (fatto/in corso/futuro)
- Deve essere facile da aggiornare senza toccare il codice (CMS o file JSON editabile)

---

### 2. Chi siamo (/about)

Pagina con template editabile. Sezioni da riempire:
- Storia di BikerLink (chi l'ha creata, perché)
- Missione
- Team (anche solo founder per ora)
- Valori

**Preparare un template con placeholder chiari** — il testo definitivo verrà scritto dall'utente in seguito. La struttura deve essere modificabile senza toccare il codice.

---

### 3. Partner (/partners)

Pagina dedicata ai partner di distribuzione:
- Traghetti
- Parcheggi moto
- Agenzie turistiche moto
- Altri partner fisici

Contenuto:
- Spiegazione del programma partner
- Vantaggi per il partner
- Form di contatto per diventare partner
- Logo dei partner esistenti (quando disponibili)

---

### 4. Press Kit & Download (/press)

**Pubblica per tutti**, senza registrazione.

Contenuto scaricabile:
- Immagini dell'app (screenshot, mockup)
- Video di presentazione
- Manuale utente
- Privacy Policy
- Loghi BikerLink (3 versioni disponibili)
- Materiale stampa

Struttura: griglia con anteprima + pulsante download per ogni asset.

---

## Requisiti tecnici

### Multi-lingua (i18n)
- Italiano e Inglese attivi fin dall'inizio
- Struttura predisposta per aggiungere altre lingue (DE, FR, ES, HR...)
- Selettore lingua visibile nell'header
- Usare react-i18next o equivalente

### Connessione API app (counter e mappa in tempo reale)

Preparare un layer di integrazione API per:

```typescript
// Endpoints da implementare lato app o creare mock
GET /api/stats/global         // { total, bikers, zavorrine }
GET /api/stats/by-continent   // { continents: [{name, count, countries: [...]}] }
GET /api/stats/live-map       // GeoJSON con punti biker online
```

**Stato attuale:** API non ancora esposta. Preparare:
1. Interfaccia/tipo TypeScript per i dati
2. Hook con fallback su dati statici quando API non risponde
3. Documentazione di cosa deve esporre il backend dell'app

### Roadmap CMS
Roadmap editabile via file JSON (niente database):
```json
// public/roadmap.json
{
  "milestones": [
    { "title": "...", "date": "2024-Q1", "status": "done", "description": "..." },
    { "title": "...", "date": "2025-Q2", "status": "current", "description": "..." },
    { "title": "...", "date": "2025-Q4", "status": "upcoming", "description": "..." }
  ]
}
```

### Chi siamo CMS
Template editabile via file JSON o markdown:
```json
// public/about.json
{
  "story": "...",
  "mission": "...",
  "team": [{ "name": "...", "role": "...", "bio": "...", "photo": "..." }],
  "values": [{ "title": "...", "text": "..." }]
}
```

---

## Assets disponibili

L'utente ha già pronti:
- 3 versioni del logo BikerLink
- Immagini dell'app
- Video di presentazione

**Da caricare nella sezione press kit** non appena il sito è online.

---

## Raccolta email (newsletter)

Strategia: **non chiamarla newsletter**. Usare invece:

> *"Ricevi notifiche di giri nella tua zona"*

Questo è un servizio, non marketing — GDPR compliant senza bisogno di opt-in separato.

Form di iscrizione email:
- Campo email
- Checkbox: *"Voglio essere avvisato dei giri BikerLink nella mia zona"* (pre-spuntata è grigio legale, valutare)
- CTA: "Iscrivimi"

---

## Registrazione GDPR nell'app (per riferimento)

Schermata consensi al momento della registrazione:
- ✅ Privacy Policy (pre-spuntata)
- ✅ Termini di servizio (pre-spuntata)
- ✅ Ricevi messaggi e aggiornamenti app via email quando sei offline (pre-spuntata — è un servizio)
- ☐ Newsletter BikerLink (NON pre-spuntata — GDPR richiede consenso esplicito)

---

## Strategia distribuzione (contesto per il sito)

BikerLink si distribuisce fisicamente via QR code su:
- Traghetti (canale principale — developer è pilota del porto)
- Parcheggi moto
- Agenzie turistiche moto
- Sulle moto stesse

Il sito deve supportare questa strategia con:
- Pagina partner chiara
- Press kit scaricabile
- URL corta e memorabile per il QR

---

## Dominio

- **Attuale:** dominio Replit (sviluppo)
- **Futuro:** da registrare al momento del lancio pubblico
- Candidati suggeriti: bikerlink.com, bikerlink.app, bikerlink.eu

---

## Coerenza visiva con l'app

**Il sito deve essere la continuazione visiva dell'app — stessi colori, stesso stile, stessa identità.**

Prima di iniziare a costruire il sito, estrarre i design token dall'app:

1. **Loghi:** l'utente ha 3 versioni del logo BikerLink — caricarle e usarle come riferimento per colori primari, forma e stile
2. **Screenshot app:** analizzare gli screenshot per estrarre:
   - Palette colori (primario, secondario, sfondo, testo, accenti)
   - Stile bordi (radius, bordi netti o morbidi)
   - Tipografia (font family usato nell'app se identificabile)
   - Tono visivo (dark/light, contrasto alto/basso)
3. **Design token da definire prima di iniziare:**
   ```css
   --color-primary: /* dal logo/app */
   --color-secondary: /* dal logo/app */
   --color-background: /* dark o light come l'app */
   --color-text: /* dal logo/app */
   --color-accent: /* colore evidenziazione */
   --font-family: /* stesso dell'app se possibile */
   ```

**Regola:** se l'app ha un tema scuro, il sito è scuro. Se l'app usa un arancione come colore primario, il sito usa quell'arancione. L'utente che passa dall'app al sito deve sentire di essere nello stesso mondo.

**Come procedere:**
- Chiedere all'utente di caricare i 3 loghi e almeno 2-3 screenshot dell'app prima di iniziare
- Usare `extractBranding` o analisi visiva delle immagini per estrarre la palette
- Passare i token estratti al design subagent come vincolo visivo

---

## Note di design

- Terminologia ufficiale: **Biker** e **Zavorrine** (mai "passeggero")
- Tono: diretto, energico, da community — non corporate
- Il sito parla a biker veri, non a investitori (la pagina investor se serve è separata)
- La mappa in tempo reale è il pezzo più impattante — va above the fold
- Il design DEVE rispecchiare l'app — vedi sezione "Coerenza visiva con l'app" sopra

---

## QR Code App Store / Play Store

Il QR code di download dell'app va mostrato in bella vista — è il ponte tra il sito e l'installazione.

**Posizionamento:** above the fold in frontpage, visibile senza scrollare. Anche nel footer.

**Struttura visiva consigliata:**
```
[ Logo BikerLink ]
[ Tagline: U'll Never Ride Alone ]

[ QR Code grande ]     [ Badge Google Play ]
                       [ Badge App Store ]

"Inquadra il QR con il telefono e scarica subito"
```

**Note tecniche:**
- Il QR code deve puntare a un URL redirect controllato dall'utente (es. bikerlink.app/download) che poi rimanda a Play Store / App Store in base al sistema operativo rilevato
- Generare il QR come SVG (non PNG) per massima qualità su tutti gli schermi
- Usare un QR con logo BikerLink al centro (branded QR)
- Quando il link App Store / Play Store non è ancora disponibile, mostrare il QR che punta al sito stesso con messaggio "Coming soon"

---

## Route Planning Web (integrazione con skill motorcycle-route-planning)

**Funzionalità:** l'utente si logga sul sito con le stesse credenziali dell'app, richiama i propri dati (garage, storico giri, preferenze) e pianifica percorsi moto da PC — più comodo che da telefono.

**Riferimento tecnico:** leggere la skill `motorcycle-route-planning` per stack completo (GraphHopper + OSM + profilo curvy).

### Flusso utente

```
1. Login web (nickname + PIN, stesse credenziali app)
2. Dashboard personale:
   - Il mio garage (moto salvate)
   - I miei giri passati
   - Le mie proposte di giro
3. Pianificatore percorso:
   - Mappa interattiva (MapLibre GL o Leaflet)
   - Punto di partenza + destinazione (o round trip)
   - Cursore curvatura (da "veloce" a "extra curvy")
   - Filtri: evita autostrade, evita sterrato, evita pedaggi
   - Calcola percorso → mostra sulla mappa
4. Esporta GPX o condividi il giro nell'app
```

### Pagina dedicata: /planner

- Mappa a schermo intero
- Pannello laterale con controlli routing
- Risultato percorso sovrapposto alla mappa
- Pulsante "Condividi nella app" — crea una proposta di giro nel profilo utente
- Pulsante "Esporta GPX" — download del tracciato

### Autenticazione web

Il login web deve usare le stesse credenziali dell'app (nickname + PIN). Implementare:
```typescript
POST /api/auth/login   { nickname: string, pin: string }
→ { token: string, userId: string }
```
Il token JWT viene usato per tutte le chiamate successive (garage, giri, route planning).

### API routing (da integrare con server GraphHopper)

```typescript
// Chiamata al server GraphHopper (vedi skill motorcycle-route-planning)
POST /api/route
{
  points: [[lat, lng], [lat, lng]],    // start + end (o più waypoint)
  profile: "motorcycle_curvy",
  curvature_weight: 0.8,              // 0 = veloce, 1 = max curvy
  avoid_motorways: true,
  avoid_unpaved: true,
  round_trip: false,
  round_trip_distance: 150000         // solo se round_trip = true
}
→ { path: GeoJSON, distance_km: number, duration_min: number, gpx_url: string }
```

### Integrazione dati sensori (futuro)

Quando disponibile, il planner web mostrerà anche:
- Heat map delle strade con punteggio divertimento (da telemetria utenti)
- Indicazione curva "consigliata dalla community" vs "solo geometria OSM"

---

## Archivio Pubblico Percorsi (/routes)

Sezione pubblica dove gli utenti pubblicano, condividono e confrontano i propri percorsi moto. Accessibile a tutti — anche senza account. Per pubblicare serve il login.

### Funzionalità

**Visualizzazione pubblica:**
- Lista percorsi con anteprima mappa, distanza, dislivello, rating curvatura
- Filtri: zona geografica, lunghezza, curvatura, superficie, difficoltà
- Mappa esplorativa — tutti i percorsi sovrapposti per zona
- Ordinamento: più votati, più recenti, più percorsi, vicini a me

**Scheda singolo percorso:**
- Mappa interattiva con tracciato
- Statistiche: km, dislivello, tempo stimato, curvatura media
- Foto e video del percorso (caricati dall'utente)
- Rating e commenti della community
- Pulsante "Voglio farlo" — aggiunge ai preferiti
- Pulsante "L'ho fatto" — con possibilità di aggiungere il proprio tempo/foto
- Pulsante "Esporta GPX"
- Pulsante "Apri nell'app" — apre il percorso direttamente in BikerLink

**Pubblicazione percorso (login richiesto):**
- Upload GPX oppure disegno manuale su mappa
- Titolo, descrizione, zona, difficoltà
- Foto/video allegati
- Tag: tipo di strada, fondo, panorama, tecnicità

---

### Integrazione con il motore di matching dell'app

I percorsi salvati e votati diventano dati per l'algoritmo di matching. Ogni interazione arricchisce il profilo utente:

```
Utente salva/vota/percorre un percorso
  ↓
Backend aggiorna il profilo con:
  - Zona geografica preferita
  - Livello curvatura preferito
  - Distanza tipica dei giri
  - Tipo di strade (montagna, costiera, pianura)
  ↓
Matching engine usa questi dati per:
  - Asse "stile di guida" (percorsi simili = stile simile)
  - Suggerire biker compatibili anche senza GPS attivo
  - Notifiche "qualcuno nella tua zona ha percorso il tuo percorso preferito"
```

**Nuovo asse di matching generato dall'archivio:**
> "Marco ha salvato gli stessi 3 percorsi che hai fatto tu — probabilmente avete lo stesso stile di guida."

Questo è dati-driven e si costruisce nel tempo — più l'archivio cresce, più il matching migliora.

---

### API archivio percorsi

```typescript
GET  /api/routes              // lista pubblica con filtri
GET  /api/routes/:id          // scheda singolo percorso
POST /api/routes              // pubblica percorso (auth richiesto)
POST /api/routes/:id/save     // salva nei preferiti (auth richiesto)
POST /api/routes/:id/done     // segna come percorso (auth richiesto)
POST /api/routes/:id/rate     // vota il percorso (auth richiesto)
GET  /api/routes/nearby       // percorsi vicino a una coordinata
```

---

### Aggiornamento checklist

Aggiungere alla checklist:
- [ ] Pagina /routes con archivio pubblico percorsi
- [ ] Scheda singolo percorso con mappa e statistiche
- [ ] Form pubblicazione percorso (upload GPX o disegno)
- [ ] Sistema rating e commenti
- [ ] Integrazione dati archivio → profilo utente → matching engine

---

## Sicurezza e Privacy

### Protezioni anti-hacker obbligatorie

**Rate limiting** — blocca attacchi brute force e abusi API:
```typescript
// Sul backend: max tentativi login
POST /api/auth/login → max 5 tentativi per IP in 15 minuti, poi blocco temporaneo
GET /api/stats/*     → max 60 richieste/minuto per IP (counter e mappa)
POST /api/route      → max 20 richieste/minuto per utente autenticato
```

**JWT sicuro:**
- Token con scadenza breve (1-7 giorni)
- Refresh token separato con scadenza lunga
- Token invalidato al logout
- Mai salvare il PIN in chiaro — hashing con bcrypt

**Input sanitization:**
- Validare tutti i parametri delle chiamate API (Zod o equivalente)
- Nessun input utente mai concatenato in query SQL o comandi
- Protezione XSS su tutti i campi di testo

**CORS configurato correttamente:**
```typescript
// Accettare richieste solo dai domini autorizzati
allowedOrigins: ['https://bikerlink.replit.app', 'https://bikerlink.com']
```

**Headers di sicurezza** (Helmet.js o equivalente):
- `X-Frame-Options: DENY` — niente clickjacking
- `Content-Security-Policy` — limita script esterni
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` — forza HTTPS

**Nessuna API key nel frontend** — le chiamate a GraphHopper o servizi esterni passano sempre dal backend, mai direttamente dal browser.

---

### Protezioni privacy (GDPR)

**Mappa in tempo reale — posizioni fuzzy:**
- Non mostrare mai la posizione esatta dei biker
- Applicare la stessa logica di alterazione randomica dell'app anche sulla mappa web
- Granularità minima consigliata: cerchio di ~500m-2km di raggio

**Analytics privacy-first:**
- Non usare Google Analytics (richiede cookie banner pesante)
- Usare **Plausible** o **Umami** — niente cookie, GDPR compliant, nessun banner necessario
- Contano solo pageview aggregate, nessun dato personale

**Cookie banner:**
- Se si usano solo cookie tecnici (sessione, preferenze lingua) → nessun banner necessario
- Se si aggiungono cookie di terze parti → banner obbligatorio con opt-in esplicito

**Dati esposti dalle API pubbliche:**
- I counter globali (iscritti, biker, zavorrine) sono aggregati anonimi — nessun nome, nessuna posizione esatta
- La mappa mostra solo punti anonimi, mai profili o nickname

---

### Strategia domini — variazione semplice

Registrare un dominio principale + redirect su varianti:

**Dominio principale consigliato:** `bikerlink.app` (€10-15/anno)

**Redirect automatici da impostare:**
```
bikerlink.com     → bikerlink.app
bikerlink.eu      → bikerlink.app
bikerlink.it      → bikerlink.app (mercato italiano)
```

**URL intelligente per QR code:**
```
bikerlink.app/download
  └── Se Android  → redirect Google Play Store
  └── Se iOS      → redirect Apple App Store
  └── Se desktop  → pagina sito con QR da scansionare
```
Questo URL va sul QR code fisico nei traghetti/parcheggi — non cambia mai anche se i link store cambiano.

**URL breve per condivisione:**
```
bikerlink.app/g/[ID_GIRO]  → link diretto a proposta di giro
bikerlink.app/u/[NICKNAME] → profilo pubblico biker
```

---

## Checklist costruzione sito

- [ ] Frontpage con video, mappa, counter, roadmap
- [ ] QR code App Store/Play Store in frontpage e footer
- [ ] Pagina Chi siamo con template editabile
- [ ] Pagina Partner con form contatto
- [ ] Pagina Press Kit con download pubblico
- [ ] Pagina /planner con route planning web (login richiesto)
- [ ] Sistema login web (nickname + PIN, stesse credenziali app)
- [ ] i18n IT + EN configurato
- [ ] Layer API per counter e mappa (con fallback statico)
- [ ] Integrazione API GraphHopper per route planning
- [ ] Roadmap via JSON editabile
- [ ] Form raccolta email
- [ ] SEO base (title, description, OG tags)
- [ ] Logo caricato (3 versioni disponibili)
- [ ] Link Play Store / App Store (quando disponibile)
