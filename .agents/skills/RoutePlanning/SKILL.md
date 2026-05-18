---
name: motorcycle-route-planning
description: Skill per integrare il route planning moto in un'app. Copre stack OSM + GraphHopper, algoritmo curvy roads proprietario a costo zero, hosting su Oracle/Hetzner, copertura Europa + Nord Africa, e integrazione dati sensori telefono (piega, accelerazione, velocità curva). Usa questa skill quando devi implementare percorsi moto curvy, hostare un server di routing, o integrare telemetria reale nell'algoritmo.
---

# Motorcycle Route Planning — Skill Completa

## Contesto di riferimento: le app esistenti

Tutte le app moto serie usano la stessa stack:

| App | Motore | Note |
|---|---|---|
| **Calimoto** | GraphHopper | Fork pubblico su GitHub: `calimoto-GmbH/calimoto-graphhopper` |
| **Kurviger** | GraphHopper | Profilo motorcycle disponibile via GraphHopper Directions API |
| **Motobit** | Proprietario su OSM | Aggiunge cornering assistant da sensori |
| **Motoplanner** | Proprietario su OSM | DB passi montagna e strade panoramiche |

**Conclusione:** non esiste un segreto industriale. La differenza è nella taratura dei pesi, non nel motore.

---

## Stack standard

- **Dati mappa:** OpenStreetMap (OSM) — gratuito, licenza aperta, aggiornato dalla community
- **Motore di routing:** GraphHopper — open source Java, Apache 2.0
- **Sorgente dati OSM:** Geofabrik (download.geofabrik.de) — estratti regionali gratuiti

---

## Come funziona il "curvy roads"

GraphHopper calcola la **curvatura geometrica** di ogni tratto OSM (variazione angolare per km).
Due file di configurazione JSON già presenti nel repo GraphHopper:

- `motorcycle.json` — penalizza autostrade/tangenziali, applica regole di accesso moto
- `curvature.json` — usa la curvatura calcolata come peso positivo nel routing

Combinati, producono percorsi che massimizzano le curve ed evitano le strade dritte e le città.

### Esempio config custom (motorcycle_curvy.json)

```json
{
  "priority": [
    { "if": "road_class == MOTORWAY", "multiply_by": "0" },
    { "if": "road_class == TRUNK",    "multiply_by": "0.2" },
    { "if": "road_class == PRIMARY",  "multiply_by": "0.5" },
    { "if": "curvature > 0.7",        "multiply_by": "1.8" },
    { "if": "curvature > 0.4",        "multiply_by": "1.3" }
  ],
  "speed": [
    { "if": "road_class == MOTORWAY", "limit_to": "0" }
  ]
}
```

---

## 3 opzioni di integrazione

### Opzione 1 — GraphHopper Directions API (cloud, a pagamento)
Il profilo `motorcycle` include già la logica Kurviger. Adatto per prototipo rapido.
- URL: `https://graphhopper.com/api/1/route`
- Costo: ~$0.50/1000 richieste
- Profilo moto curvy disponibile su richiesta

### Opzione 2 — OpenRouteService (gratuito con limiti)
Basato su GraphHopper, profilo `driving-hgv` adattabile a moto.
- URL: `https://api.openrouteservice.org/v2/directions/driving-hgv`
- Free tier: 2000 richieste/giorno
- Adatto per sviluppo e test

### Opzione 3 — GraphHopper self-hosted (zero costi variabili) ⭐ RACCOMANDATO
Download OSM regionale + GraphHopper JAR + config custom. Costo: solo server.

---

## Hosting

### Sviluppo e test: Oracle Cloud Free Tier (costo zero)
- 2 CPU ARM Ampere + 24 GB RAM + 200 GB storage
- Sufficiente per Italia + Balcani + Grecia
- Nessuna scadenza, nessuna carta di credito dopo il trial
- URL: cloud.oracle.com → Always Free Resources

### Produzione (Europa + Nord Africa): Hetzner VPS
- CPX31: 4 vCPU + 8 GB RAM + 160 GB NVMe → ~€10/mese
- CPX41: 8 vCPU + 16 GB RAM + 240 GB NVMe → ~€20/mese (consigliato per Europa completa)
- Datacenter: Francoforte o Helsinki (bassa latenza Europa)
- URL: hetzner.com/cloud

---

## Copertura geografica

Dataset da scaricare da Geofabrik:

| Regione | File | Dimensione approssimativa |
|---|---|---|
| Europa completa | `europe-latest.osm.pbf` | ~30 GB |
| Nord Africa | `africa/morocco-latest.osm.pbf` + `africa/algeria-latest.osm.pbf` + `africa/tunisia-latest.osm.pbf` + `africa/egypt-latest.osm.pbf` | ~4 GB totali |

Merge dei file con osmium-tool:
```bash
osmium merge europe-latest.osm.pbf morocco-latest.osm.pbf algeria-latest.osm.pbf tunisia-latest.osm.pbf egypt-latest.osm.pbf -o full-coverage.osm.pbf
```

---

## Setup e avvio — segui questo ordine

### Step 1: Verifica con dataset piccolo PRIMA dell'import completo

Scarica un estratto regionale piccolo per verificare che tutto funzioni:

```bash
# Dataset Veneto (~100MB, import in ~5 minuti)
wget https://download.geofabrik.de/europe/italy/nord-est-latest.osm.pbf

# Scarica GraphHopper
wget https://repo1.maven.org/maven2/com/graphhopper/graphhopper-web/9.1/graphhopper-web-9.1.jar

# Crea config.yml con profilo moto curvy
# (vedi sezione config sotto)

# Avvia con dataset piccolo
java -Xmx4g -jar graphhopper-web-9.1.jar server config.yml
```

Verifica che le route funzionino su Veneto. Testa 3-4 percorsi curvy noti.
**Solo dopo che i risultati sono soddisfacenti**, procedi allo step 2.

### Step 2: Import completo Europa + Nord Africa (da lanciare in background)

L'import completo richiede 12-24 ore. Lanciarlo dentro `screen` o `tmux` per evitare interruzioni:

```bash
# Installa screen se non presente
sudo apt install screen

# Avvia sessione persistente
screen -S graphhopper-import

# Scarica dataset completo (operazione lunga)
wget https://download.geofabrik.de/europe-latest.osm.pbf
wget https://download.geofabrik.de/africa/morocco-latest.osm.pbf
# ... altri file Nord Africa

# Merge
osmium merge europe-latest.osm.pbf morocco-latest.osm.pbf [altri...] -o full-coverage.osm.pbf

# Avvia import (questo è il processo lungo)
java -Xmx20g -jar graphhopper-web-9.1.jar import config-full.yml

# Puoi staccarti dalla sessione con: Ctrl+A poi D
# Torni con: screen -r graphhopper-import
```

### config.yml (profilo moto curvy)

```yaml
graphhopper:
  datareader.file: nord-est-latest.osm.pbf  # cambia con full-coverage.osm.pbf per produzione
  graph.location: ./graph-cache
  profiles:
    - name: motorcycle_curvy
      custom_model_files: [motorcycle.json, curvature.json]
  profiles_lm:
    - profile: motorcycle_curvy
  profiles_ch:
    - profile: motorcycle_curvy

server:
  application_connectors:
    - type: http
      port: 8989
      bind_host: 0.0.0.0
```

---

## API — query di base

```bash
# Route curvy da A a B
curl "http://localhost:8989/route?\
  point=45.4,12.3&\
  point=45.8,11.6&\
  profile=motorcycle_curvy&\
  instructions=true&\
  elevation=true&\
  details=surface,curvature,road_class"

# Round trip (partenza + raggio + direzione)
curl "http://localhost:8989/route?\
  point=45.4,12.3&\
  profile=motorcycle_curvy&\
  algorithm=round_trip&\
  round_trip.distance=150000&\
  round_trip.seed=42"
```

---

## Parametri configurabili (lato utente)

- **Curvatura:** da "veloce" (peso curvatura basso) a "extra curvy" (peso alto)
- **Evita autostrade:** penalità MOTORWAY da 0.2 a 0 (blocco totale)
- **Evita strade sterrate:** filtro su `surface != paved`
- **Evita pedaggi:** filtro su tag OSM `toll=yes`
- **Elevazione preferita:** `uphillcostfactor < 1` per premiare i passi di montagna
- **Raggio roundtrip:** distanza totale in km

---

## Integrazione dati sensori telefono (differenziatore proprietario)

I sensori del telefono durante la guida forniscono dati reali che OSM non ha:

| Sensore | Dato | Uso nel routing |
|---|---|---|
| Accelerometro / Giroscopio | Angolo di piega (lean angle) | Misura quanto la curva OSM è percepita come impegnativa |
| GPS | Velocità reale in curva | Indica il limite di comfort su quel tratto |
| Accelerometro asse X | Accelerazione laterale | Classifica la difficoltà della curva |

### Come integrare

1. **Durante il giro:** registra per ogni tratto GPS i dati sensore (piega massima, velocità, accelerazione laterale)
2. **Post-ride:** associa ogni segmento di dati al tratto OSM corrispondente (map matching con GraphHopper)
3. **Aggiorna i pesi:** correggi il `curvature score` OSM con il punteggio reale misurato
4. **Con più utenti:** aggrega i dati → il punteggio diventa una media di esperienze reali su quel tratto

### Risultato

Il tuo algoritmo conosce la curvatura **reale percepita** di ogni strada, non solo quella geometrica da OSM. Nessun competitor ha questo — è il tuo dataset, costruito dai tuoi utenti in sella.

---

## Integrazione Meteo lungo il percorso

### API consigliata: Open-Meteo (gratuita, nessuna API key)

- **URL:** `https://api.open-meteo.com/v1/forecast`
- **Costo:** zero, nessuna registrazione, nessun limite dichiarato per uso normale
- **Previsioni:** fino a 16 giorni, dati orari
- **Documentazione:** open-meteo.com

### Funzionalità

L'utente imposta:
- Data e ora di partenza
- Velocità media stimata (es. 80 km/h)

Il sistema calcola l'ora stimata di arrivo a ogni waypoint del percorso e interroga il meteo in quel punto a quell'ora.

### Dati meteo rilevanti per moto

```typescript
// Parametri consigliati per moto
hourly: [
  "temperature_2m",        // temperatura °C
  "precipitation",         // mm/ora — pioggia
  "precipitation_probability", // % probabilità pioggia
  "windspeed_10m",         // km/h velocità vento
  "windgusts_10m",         // km/h raffiche
  "visibility",            // metri — nebbia/foschia
  "weathercode"            // codice WMO (sereno, nuvoloso, temporale...)
]
```

### Logica di calcolo

```typescript
// Per ogni waypoint del percorso:
// 1. Calcola ora stimata di passaggio
const departureTime = new Date("2025-06-15T10:00:00");
const distanceToWaypoint = 85; // km
const avgSpeed = 80; // km/h
const eta = new Date(departureTime.getTime() + (distanceToWaypoint / avgSpeed) * 3600000);

// 2. Chiama Open-Meteo per quel punto a quell'ora
const response = await fetch(
  `https://api.open-meteo.com/v1/forecast?` +
  `latitude=${waypoint.lat}&longitude=${waypoint.lng}` +
  `&hourly=temperature_2m,precipitation,precipitation_probability,windspeed_10m,windgusts_10m,visibility,weathercode` +
  `&start_date=${eta.toISOString().split('T')[0]}` +
  `&end_date=${eta.toISOString().split('T')[0]}` +
  `&timezone=auto`
);

// 3. Estrai il dato per l'ora esatta di passaggio
const hourIndex = eta.getHours();
const weather = data.hourly.temperature_2m[hourIndex];
```

### Output per l'utente

Riepilogo meteo lungo il percorso:

```
Partenza   Milano      10:00  ☀️  22°C  Vento 15 km/h  0mm
Tappa 1    Passo Stelvio 12:30  ⛅  8°C   Vento 35 km/h  0mm  ⚠️ raffiche
Tappa 2    Merano       14:00  🌧️  14°C  Vento 10 km/h  2mm  ⚠️ pioggia
Arrivo     Bolzano      15:30  ⛅  18°C  Vento 8 km/h   0mm
```

Alert automatici:
- ⚠️ Pioggia prevista (precipitation > 0.5 mm)
- ⚠️ Vento forte (windspeed > 50 km/h o gusts > 70 km/h)
- ⚠️ Scarsa visibilità (visibility < 1000 m)
- ⚠️ Temperatura bassa (temperature < 5°C — rischio ghiaccio)

### Integrazione con il planner web (bikerlink-website)

Il pianificatore web mostra il meteo direttamente sulla mappa:
- Icone meteo sui waypoint
- Banda colorata lungo il tracciato (verde=ok, giallo=attenzione, rosso=sconsigliato)
- Tooltip su hover con dettagli ora per ora

### API endpoint da esporre

```typescript
GET /api/route/:id/weather?departure=2025-06-15T10:00:00
→ {
    waypoints: [
      {
        name: "Milano",
        lat: 45.4, lng: 9.1,
        eta: "10:00",
        temp: 22,
        precipitation: 0,
        precipitationProb: 5,
        windspeed: 15,
        windgusts: 22,
        visibility: 10000,
        alert: null
      },
      ...
    ],
    summary: "Pioggia prevista a Merano alle 14:00",
    recommendation: "warning" // ok | warning | avoid
  }
```

---

## POI lungo il percorso (OpenStreetMap — gratuito)

### API: Overpass API (gratuito, nessuna registrazione)

- **URL:** `https://overpass-api.de/api/interpreter`
- **Costo:** zero, open source, dati OSM in tempo reale
- **Alternativa mirror:** `https://overpass.kumi.systems/api/interpreter` (backup)

Permette di interrogare OpenStreetMap per trovare qualsiasi tipo di POI in un'area geografica.

### POI rilevanti per moto

| Tipo | Tag OSM | Utilità |
|---|---|---|
| Distributori benzina | `amenity=fuel` | Pianificazione autonomia |
| Aree di sosta | `highway=rest_area` | Pause lungo il percorso |
| Parcheggi moto coperti | `amenity=motorcycle_parking` | Soste sicure |
| Meccanici moto | `shop=motorcycle` + `service=repair` | Emergenze |
| Ospedali / pronto soccorso | `amenity=hospital` | Sicurezza |
| Ristoranti/bar | `amenity=restaurant` \| `amenity=cafe` | Soste pranzo |
| Hotel/B&B | `tourism=hotel` \| `tourism=guest_house` | Giri multi-giorno |
| Valichi / passi montagna | `mountain_pass=yes` | Punti panoramici |

### Query Overpass — esempio distributori lungo il percorso

```javascript
// Trova distributori entro 5km dal tracciato del percorso
const bbox = computeBoundingBox(routePoints, bufferKm=5);
const query = `
  [out:json][timeout:25];
  (
    node["amenity"="fuel"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    way["amenity"="fuel"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  );
  out center;
`;

const response = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  body: `data=${encodeURIComponent(query)}`
});
const data = await response.json();
// data.elements = array di distributori con lat/lng e tag OSM
```

### Logica "soste consigliate"

Per ogni percorso, calcolare automaticamente le soste ottimali:

```typescript
// 1. Autonomia stimata in base alla moto in garage
const tankRange = userGarage.selectedBike.tankRangeKm ?? 200; // default 200km

// 2. Trova distributori a intervalli regolari lungo il percorso
const fuelStops = findPoiAtIntervals({
  routePoints,
  intervalKm: tankRange * 0.75,  // ricarica al 75% autonomia
  poiType: "fuel"
});

// 3. Soste riposo ogni X km (configurabile dall'utente)
const restStops = findPoiAtIntervals({
  routePoints,
  intervalKm: userPrefs.restIntervalKm ?? 150,
  poiType: "rest_area"
});

// 4. Combina in una timeline di soste consigliate
const suggestedStops = mergeSortedByDistance([fuelStops, restStops]);
```

### Output per l'utente

```
Km   0    Partenza  Milano
Km  85    ⛽ Distributore — Agip SS38, Sondrio
Km 150    🅿️  Area sosta — Passo dello Spluga
Km 180    ⛽ Distributore — Eni Chiavenna  ← consigliato (prossimo a 320km)
Km 220    🏁 Arrivo  Coira (CH)

Autonomia stimata: 280km  |  Soste carburante necessarie: 1
```

### API endpoint

```typescript
GET /api/route/:id/poi?types=fuel,rest_area,restaurant
→ {
    poi: [
      {
        type: "fuel",
        name: "Agip SS38",
        lat: 46.17, lng: 9.87,
        distanceFromStart: 85,
        etaFromDeparture: "11:04",
        brand: "Agip",
        openingHours: "06:00-22:00"  // da OSM se disponibile
      },
      ...
    ],
    suggestedStops: [...],  // soste ottimali calcolate
    fuelStopsNeeded: 1
  }
```

### Integrazione con il garage dell'app

Se l'utente ha una moto nel garage BikerLink con autonomia configurata, il calcolo delle soste carburante usa quella autonomia reale invece del default.

```typescript
// Recupera autonomia dalla moto selezionata
GET /api/user/garage → { bikes: [{ model: "...", tankRangeKm: 220 }] }
```

### Visualizzazione sulla mappa web

- Icone POI cliccabili sulla mappa lungo il tracciato
- Filtri per tipo (carburante, soste, ristoranti, hotel)
- Click sul POI → popup con nome, orari, distanza dal percorso
- Pulsante "Aggiungi come tappa" — inserisce il POI come waypoint nel percorso

---

## Giri multi-giorno con hotel e tappe automatiche

### Selezione moto e carburante — input obbligatori

Prima di pianificare qualsiasi giro (singolo o multi-giorno), l'app/sito deve chiedere:

**Step 1 — Quale moto usi?**
```
[ Seleziona moto dal tuo garage ]
  ○ BMW R1250GS  (serbatoio: 20L, autonomia: ~350km)
  ○ Ducati Monster (serbatoio: 17L, autonomia: ~220km)
  ○ + Aggiungi moto manualmente

oppure: [ Non ho un account ] → inserisci autonomia stimata manualmente
```

**Step 2 — Livello carburante attuale**
```
Quanto hai nel serbatoio adesso?
  ○ Pieno
  ○ 3/4
  ○ 1/2
  ○ 1/4
  ○ Quasi vuoto (< 30km)

→ L'app calcola l'autonomia residua reale per posizionare il PRIMO distributore
```

**Logica autonomia residua:**
```typescript
const fullRange = selectedBike.tankRangeKm; // es. 350km
const currentFuelFraction = { pieno: 1.0, "3/4": 0.75, "1/2": 0.5, "1/4": 0.25, vuoto: 0.08 }[fuelLevel];
const currentRange = fullRange * currentFuelFraction; // autonomia attuale

// Primo distributore: quando rimane il 20% dell'autonomia attuale
const firstFuelStop = currentRange * 0.80;
// Distributori successivi: al 75% dell'autonomia piena
const nextFuelStopInterval = fullRange * 0.75;
```

---

### Giri multi-giorno — suddivisione automatica tappe

**Input utente:**
- Partenza e arrivo
- Numero di giorni (o "calcola tu")
- Ore di guida al giorno (default: 6h — configurabile)
- Velocità media (default: 70 km/h su curvy, 90 km/h su misto)
- Preferenza hotel: economico / medio / comfort

**Algoritmo suddivisione tappe:**

```typescript
const totalKm = route.totalDistance;
const drivingHoursPerDay = userPrefs.hoursPerDay ?? 6;
const avgSpeed = userPrefs.avgSpeed ?? 75;
const kmPerDay = drivingHoursPerDay * avgSpeed; // es. 6h × 75 = 450km/giorno

const numDays = Math.ceil(totalKm / kmPerDay);

// Suddividi il percorso in segmenti giornalieri bilanciati
const daySegments = splitRouteIntoEqualSegments(routePoints, numDays);

// Per ogni fine tappa → cerca hotel nelle vicinanze (Overpass API)
const nightStops = daySegments.map((segment, i) => ({
  day: i + 1,
  endPoint: segment.lastPoint,
  kmFromStart: segment.totalKm,
  eta: calculateEta(departureTime, segment.totalKm, avgSpeed),
  hotels: findNearbyPoi(segment.lastPoint, radiusKm=3, type="accommodation")
}));
```

**Output timeline multi-giorno:**

```
📅 GIORNO 1 — Martedì 17 giugno
Partenza   Milano          09:00
Km  85     ⛽ Distributore Agip, Sondrio       10:05
Km 150     🅿️  Area sosta Passo Spluga          11:15
Km 250     🏨 TAPPA NOTTURNA — Coira (CH)      14:30
           Hotel Stern ★★★ (3.2km dal percorso)
           B&B Lenzerheide (1.8km)
           Albergo du Lac ★★ (0.5km)

📅 GIORNO 2 — Mercoledì 18 giugno
Partenza   Coira           09:00
Km  95     ⛽ Distributore Shell, Davos          10:15
...
Km 410     🏁 ARRIVO — Zurigo                  16:30

TOTALE: 410km  |  2 giorni  |  6h guida/giorno
Soste carburante: 3  |  Notti: 1
```

### Ricerca hotel con Overpass API

```javascript
// Tag OSM per alloggio
const accommodationQuery = `
  [out:json][timeout:25];
  (
    node["tourism"="hotel"](around:3000,${lat},${lng});
    node["tourism"="guest_house"](around:3000,${lat},${lng});
    node["tourism"="hostel"](around:3000,${lat},${lng});
    node["tourism"="motel"](around:3000,${lat},${lng});
    node["tourism"="chalet"](around:3000,${lat},${lng});
  );
  out body;
`;
// Nota: OSM ha molti hotel con nome ma raramente prezzi/rating
// Per rating e disponibilità → usa link esterni (Booking.com, Maps)
```

**Nota importante:** OSM ha i nomi degli hotel ma non prezzi né disponibilità in tempo reale. La scheda dell'hotel mostra:
- Nome e indirizzo (da OSM)
- Distanza dal punto tappa
- Pulsante "Cerca su Booking.com" → link diretto alla ricerca filtrata per quella città e quelle date

Questo è legale e non richiede API a pagamento.

### API endpoint multi-giorno

```typescript
POST /api/route/plan/multiday
{
  from: "Milano",
  to: "Zurigo",
  departureDate: "2025-06-17",
  departureTime: "09:00",
  bikeId: "bmw-gs-123",          // dal garage utente
  fuelLevel: "pieno",            // input utente
  daysAvailable: 2,              // null = calcola automaticamente
  hoursPerDay: 6,
  style: "curvy"                 // curvy | fastest | balanced
}

→ {
    days: [
      {
        day: 1,
        date: "2025-06-17",
        startPoint: { name: "Milano", ... },
        endPoint: { name: "Coira", ... },
        distanceKm: 250,
        drivingHours: 4.2,
        fuelStops: [...],
        restStops: [...],
        hotels: [...],
        weather: [...]   // meteo tappe giornaliere
      },
      ...
    ],
    totalKm: 410,
    totalDays: 2,
    totalFuelStops: 3
  }
```

### Integrazione con il social dell'app

Il giro multi-giorno pianificato può diventare una **proposta di giro** nell'app:

```
[ Pubblica questo giro nell'app BikerLink ]
→ Gli utenti nella zona vengono notificati
→ Altre persone possono unirsi al giro o alle singole tappe
```

Questo chiude il cerchio: route planning web → social matching app.

---

## Modalità "Sorpresa" — percorso circolare automatico

L'utente non sa dove andare. Dice solo quanto tempo ha e la app genera un percorso circolare curvy ottimizzato che parte e torna dallo stesso punto.

### Input utente — minimo indispensabile

```
⏱️  Quanto tempo hai?
    [ 1h ] [ 2h ] [ 3h ] [ 4h ] [ 6h ] [ tutto il giorno ]

🏍️  Quale moto?
    (stessa selezione garage / manuale dell'altro flusso)

⛽  Livello carburante?
    (stessa selezione del flusso standard)

🌀  Preferisci:
    ○ Il più curvy possibile
    ○ Misto (curve + un po' di strada)
    ○ Rilassato (panoramico, poche curve tecniche)
```

Input opzionale (collassato di default, espandibile):
```
📍 Punto di partenza  [usa posizione GPS attuale ✓]
🧭 Direzione preferita  [nessuna preferenza ✓]
🚫 Evita autostrade  [✓]
🚫 Evita strade bianche  [✓]
```

---

### Algoritmo percorso circolare

```typescript
// 1. Calcola km disponibili in base al tempo
const drivingMinutes = userInput.timeAvailable * 60 * 0.85; // 85% del tempo = guida, 15% = soste
const avgSpeed = 65; // km/h su curvy (più lento del normale)
const targetKm = (drivingMinutes / 60) * avgSpeed;

// Esempio: 4 ore → 4 * 60 * 0.85 = 204 minuti guida → ~221 km

// 2. Verifica autonomia — il circolare non può superare l'autonomia senza soste
const safeRange = bike.tankRangeKm * (fuelFraction * 0.85); // margine sicurezza 15%
const maxKmNoFuelStop = safeRange;

// Se targetKm > maxKmNoFuelStop → include una sosta carburante nel circolare
const needsFuelStop = targetKm > maxKmNoFuelStop;

// 3. Genera il percorso circolare con GraphHopper
// GraphHopper supporta "round trip" nativo con parametri:
const graphhopperRequest = {
  points: [[startLng, startLat]],  // solo il punto di partenza
  "ch.disable": true,
  algorithm: "round_trip",
  "round_trip.distance": targetKm * 1000,  // in metri
  "round_trip.seed": Math.random() * 1000, // seed → ogni volta un giro diverso
  vehicle: "motorcycle",
  weighting: "motorcycle_curvy",           // profilo curvy custom
  locale: "it"
};

// 4. Se richiesto "il più curvy" → aumenta round_trip.seed e prendi
//    la variante con il punteggio curvatura più alto tra 3 generate
const variants = await Promise.all([0,1,2].map(seed =>
  generateRoundTrip({ ...graphhopperRequest, "round_trip.seed": seed })
));
const best = variants.sort((a, b) => b.curvatureScore - a.curvatureScore)[0];
```

---

### Output

```
🌀 IL TUO GIRO SORPRESA

Partenza    Mira (VE)        09:00
━━━━━━━━━━━━━━━━━━━━━━━━━
  Colli Euganei — SP89
  Passo della Forca
  Lago di Fimon
━━━━━━━━━━━━━━━━━━━━━━━━━
Rientro     Mira (VE)        ~13:10

📍 218 km  |  ⏱️ ~4h10m  |  🌀 Curvatura: ████░ alta
🌤️  Meteo: sereno, 19°C, vento 10 km/h  ✅
⛽  Carburante: sufficiente senza soste  ✅

[ Avvia navigazione ] [ Rigenera giro diverso ] [ Salva percorso ]
```

Il pulsante **"Rigenera giro diverso"** cambia il seed e produce una variante completamente diversa sugli stessi km — utile se l'utente conosce già quella zona.

---

### Logica "Rigenera"

```typescript
// Ogni click su "Rigenera" usa un seed diverso
// Mantiene la stessa distanza target e la stessa preferenza curvatura
// Evita di riproporre lo stesso percorso degli ultimi 5 rigenera (localStorage)
const usedSeeds = JSON.parse(localStorage.getItem("used_seeds") ?? "[]");
let newSeed = Math.floor(Math.random() * 10000);
while (usedSeeds.includes(newSeed)) newSeed++;
usedSeeds.push(newSeed);
localStorage.setItem("used_seeds", JSON.stringify(usedSeeds.slice(-5)));
```

---

### Integrazione social — da sorpresa a proposta di giro

Dopo la generazione, un banner opzionale:

```
👥 Vuoi fare questo giro in compagnia?
   [ Pubblica come proposta nell'app BikerLink ]
   → I biker nelle vicinanze vengono notificati adesso
```

Questo è il collegamento diretto tra il planner web e il matching engine dell'app: un giro generato automaticamente diventa in un click una proposta sociale.

---

### API endpoint

```typescript
POST /api/route/surprise
{
  lat: 45.43,
  lng: 12.15,
  timeHours: 4,
  bikeId: "bmw-gs-123",
  fuelLevel: "pieno",
  style: "curvy",        // curvy | mixed | relaxed
  seed: 0                // 0 = primo giro, incrementa per rigenerare
}

→ {
    route: { points: [...], distanceKm: 218, durationMin: 250 },
    curvatureScore: 0.82,
    weather: { summary: "sereno", temp: 19, alert: null },
    fuelOk: true,
    fuelStops: [],
    shareUrl: "bikerlink.app/routes/surprise/abc123"
  }
```

---

## Notifica "Meteo del Mattino" — buongiorno biker

Ogni mattina alle 7:00, l'utente riceve un messaggio che gli dice in 3 secondi se oggi è una buona giornata per uscire in moto — con un giro già pronto, calibrato sul suo tempo libero.

### Canali di invio

| Canale | Quando usarlo |
|---|---|
| **Push notification** (app) | Se l'app è installata e le notifiche sono attive — canale principale |
| **Email** | Se l'utente ha fornito email (anche per recupero account) — canale di fallback |
| **In-app banner** | Sempre visibile all'apertura dell'app quella mattina |

Il messaggio email non è una newsletter — è una **notifica di servizio** ("Le condizioni meteo della tua zona"). Pienamente GDPR-compliant con il consenso "notifiche aggiornamenti e informazioni area" già raccolto al signup.

---

### Logica di calcolo

```typescript
// Eseguito ogni mattina alle 06:30 (cron job)
// Per ogni utente con notifiche attive:

async function morningWeatherCheck(userId: string) {
  const user = await getUser(userId);
  const position = user.lastKnownPosition; // posizione fuzzy già nell'app

  // 1. Chiedi meteo Open-Meteo per oggi, ore 08:00-20:00
  const forecast = await getHourlyForecast(position, date: "today");

  // 2. Calcola "biker score" della giornata
  const bikerScore = calculateBikerScore(forecast);
  /*
    bikerScore basato su:
    - Precipitazioni: 0mm = +40 punti, >2mm = 0 punti
    - Temperatura: 15-28°C = max punti, <8°C o >35°C = penalità
    - Vento: <30km/h = ok, >50km/h = penalità forte
    - Visibilità: >5km = ok, <1km = blocco totale
    - Finestre di bel tempo: ore consecutive senza pioggia
  */

  // 3. Determina se mandare la notifica
  if (bikerScore < 30) return; // giornata no — non disturbare
  // Se score >= 30 → manda notifica

  // 4. Genera un giro sorpresa pre-calcolato
  //    (usa le preferenze salvate dell'utente o i default)
  const suggestedRide = await generateSurpriseRoute({
    lat: position.lat,
    lng: position.lng,
    timeHours: user.prefs.typicalRideHours ?? 3,
    bikeId: user.garage.primaryBike?.id,
    style: user.prefs.rideStyle ?? "curvy",
    fuelLevel: "pieno" // assunzione al mattino
  });

  await sendMorningNotification(userId, { bikerScore, forecast, suggestedRide });
}
```

---

### Contenuto notifica push

```
Titolo:  🏍️ Oggi si gira!

Corpo:   Bella giornata a Mestre — 21°C, sole fino alle 18.
         Ho preparato un giro da 3h per te.
         [ Vedi il percorso ]
```

Versione con allerta parziale:
```
Titolo:  🌤️ Mattina ok, poi peggiora

Corpo:   Esci prima delle 14 — dalle 15 arriva la pioggia.
         Giro da 2h già pronto.
         [ Vedi il percorso ]
```

Giornata no (notifica NON inviata — silenzio totale):
```
// score < 30 → nessuna notifica
// Non disturbare l'utente per dirgli che piove
```

---

### Contenuto email (canale fallback)

```
Oggetto: 🏍️ Oggi a [Città] si può girare

Ciao [nickname],

Condizioni meteo nella tua zona oggi:
  ☀️ Sereno  |  21°C  |  Vento 12 km/h  |  0mm pioggia

Finestra ideale: dalle 09:00 alle 17:00

Ho generato un giro da ~3 ore partendo da casa tua:
  📍 [Nome percorso]  —  178km  —  Curvatura: alta
  [ Apri il percorso → ]

Buon giro,
BikerLink
```

Footer obbligatorio:
```
Ricevi questa email perché hai attivato le notifiche meteo della tua area.
[ Gestisci notifiche ] [ Cancellati ]
```

---

### Preferenze utente (configurabili in app)

```typescript
interface MorningNotificationPrefs {
  enabled: boolean;           // attiva/disattiva
  sendTime: "06:30" | "07:00" | "07:30"; // orario invio
  minBikerScore: number;      // default 30 — solo se abbastanza bello
  typicalRideHours: 1 | 2 | 3 | 4 | 6;  // per il giro pre-generato
  rideStyle: "curvy" | "mixed" | "relaxed";
  weekdaysOnly: boolean;      // solo lun-ven (per chi lavora nel weekend)
  weekendsOnly: boolean;      // solo sab-dom (per chi lavora in settimana)
}
```

---

### Cron job — implementazione server

```typescript
// Ogni giorno alle 06:30
// Usa un worker queue (BullMQ / pg-boss) per non bloccare il server
cron.schedule("30 6 * * *", async () => {
  const users = await getUsersWithMorningNotificationsEnabled();

  // Raggruppa per zona geografica — stessa zona = stessa chiamata meteo
  const zones = groupByGeographicZone(users, gridKm=50);

  for (const zone of zones) {
    const forecast = await getZoneForecast(zone.center); // 1 chiamata per zona
    const bikerScore = calculateBikerScore(forecast);

    if (bikerScore >= 30) {
      // Manda notifiche a tutti gli utenti della zona in parallelo
      await Promise.allSettled(
        zone.users.map(u => sendMorningNotification(u, forecast, bikerScore))
      );
    }
  }
});
```

Raggruppare per zona riduce le chiamate a Open-Meteo: 1000 utenti sparsi su 20 zone = 20 chiamate API invece di 1000.

---

### Integrazione con il social

La notifica mattutina include:

```
👥 Altri 3 biker nella tua zona hanno aperto l'app stamattina.
   [ Proponi un giro insieme → ]
```

Se due utenti aprono la stessa mattina il giro sorpresa e sono compatibili per matching → notifica reciproca:

```
🏍️ Marco ha un giro simile al tuo stamattina.
   Volete partire insieme? [ Scrivi a Marco ]
```

Questo trasforma la notifica meteo in un motore di acquisizione engagement giornaliero.

---

## Output e formati

- **GPX Track:** tracciato punto per punto, ideale per seguire il percorso senza ricalcoli
- **GPX Route:** solo waypoint principali, il navigatore ricalcola tra essi
- **Encoded Polyline:** formato compatto per visualizzazione su mappa (Google Maps, Leaflet, MapLibre)
- **GeoJSON:** formato standard per API moderne

GraphHopper restituisce encoded polyline di default. Per GPX, usa un converter o la libreria `graphhopper-maps`.

---

## Costo totale

| Componente | Costo |
|---|---|
| Dati OSM (Geofabrik) | Gratuito |
| GraphHopper (open source) | Gratuito |
| Server sviluppo (Oracle Free Tier) | Gratuito |
| Server produzione (Hetzner CPX41) | ~€20/mese |
| osmium-tool (merge PBF) | Gratuito |

**Totale sviluppo:** €0  
**Totale produzione:** ~€20/mese per copertura Europa + Nord Africa completa
