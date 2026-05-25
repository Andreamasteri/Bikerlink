# Valhalla Self-Hosted — BikerLink

## Panoramica

Valhalla è il secondo routing engine di BikerLink, affiancato a GraphHopper.  
È lo stesso engine che gira sotto Mapbox Directions (licenza MIT).  
Viene attivato dall'admin tramite il pannello Admin → Mappe → Routing Engine.

**Copertura tile attuale**: Italia + paesi limitrofi (Francia, Svizzera, Austria, Slovenia, Croazia).  
Estensione Europa completa + Nord Africa pianificata in task successiva.

---

## Requisiti hardware (stima per area Italia + limitrofi)

| Risorsa | Minimo | Raccomandato |
|---------|--------|--------------|
| RAM | 4 GB | 8 GB |
| Disco | 30 GB (tile + temp) | 60 GB SSD |
| CPU | 2 vCPU | 4 vCPU |
| OS | Linux (Ubuntu 22.04) | Ubuntu 22.04 LTS |

> **Nota**: il build iniziale dei tile richiede ~2–4h e fino a 32 GB RAM per l'area completa.  
> Per l'area Italia + limitrofi (~4 GB PBF) si stimano 8 GB RAM e ~1h build.

---

## Setup con Docker Compose

```yaml
# docker-compose.valhalla.yml
version: "3.8"
services:
  valhalla:
    image: ghcr.io/gis-ops/docker-valhalla/valhalla:latest
    container_name: bikerlink-valhalla
    restart: unless-stopped
    ports:
      - "8002:8002"
    volumes:
      - ./valhalla_tiles:/custom_files
      - ./valhalla_config:/valhalla_tiles
    environment:
      - tile_urls=https://download.geofabrik.de/europe/italy-latest.osm.pbf https://download.geofabrik.de/europe/france-latest.osm.pbf https://download.geofabrik.de/europe/switzerland-latest.osm.pbf https://download.geofabrik.de/europe/austria-latest.osm.pbf https://download.geofabrik.de/europe/slovenia-latest.osm.pbf https://download.geofabrik.de/europe/croatia-latest.osm.pbf
      - serve_tiles=True
      - build_admins=True
      - build_time_zones=True
      - use_tiles_ignore_pbf=False
      - force_rebuild=False
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8002/status"]
      interval: 30s
      timeout: 10s
      retries: 5
```

### Avvio

```bash
# Prima esecuzione: scarica PBF e builda i tile (1–4h)
docker compose -f docker-compose.valhalla.yml up -d

# Monitora il build
docker logs -f bikerlink-valhalla

# Verifica stato quando il build è completo
curl http://localhost:8002/status
```

### Ricostruzione tile (aggiornamento OSM)

```bash
# Forza rebuild scaricando nuovi PBF da Geofabrik
docker compose -f docker-compose.valhalla.yml down
# Imposta force_rebuild=True nel compose, poi:
docker compose -f docker-compose.valhalla.yml up -d
# Ripristina force_rebuild=False dopo il build
```

---

## Configurazione ambiente BikerLink

```
VALHALLA_URL=https://valhalla.bikerlink.app   # URL del server Valhalla
VALHALLA_API_KEY=<chiave-opzionale>            # Se protetto con reverse proxy auth
```

Impostare le variabili d'ambiente tramite il pannello Secrets di Replit o `.env` locale.

---

## Protezione con Nginx (reverse proxy)

Esempio configurazione Nginx con autenticazione basic:

```nginx
server {
    listen 443 ssl;
    server_name valhalla.bikerlink.app;

    location / {
        proxy_pass http://localhost:8002;
        proxy_set_header Host $host;
        proxy_read_timeout 30s;

        # Autenticazione opzionale via header (invece di basic auth)
        # Il client invia X-Valhalla-Key: <VALHALLA_API_KEY>
        # Il proxy verifica con map + return 403
    }
}
```

---

## Aree OSM coperte

| Area | File PBF Geofabrik | Dimensione stimata |
|------|--------------------|--------------------|
| Italia | europe/italy-latest.osm.pbf | ~1.8 GB |
| Francia | europe/france-latest.osm.pbf | ~4.0 GB |
| Svizzera | europe/switzerland-latest.osm.pbf | ~0.4 GB |
| Austria | europe/austria-latest.osm.pbf | ~0.6 GB |
| Slovenia | europe/slovenia-latest.osm.pbf | ~0.1 GB |
| Croazia | europe/croatia-latest.osm.pbf | ~0.3 GB |

**Totale PBF**: ~7.2 GB  
**Tile risultanti su disco**: ~15–25 GB

---

## Profilo motorcycle

Il client usa queste costanti default (vedi `server/valhalla-client.ts`):

```json
{
  "costing": "motorcycle",
  "costing_options": {
    "motorcycle": {
      "use_highways": 0.3,
      "use_trails": 0.0,
      "use_ferry": 0.5,
      "country_crossing_penalty": 0
    }
  }
}
```

**Note progettuali**:
- `use_highways: 0.3` — penalizza autostrade, favorisce statali e provinciali
- `use_trails: 0.0` — evita completamente sterrati (profilo road touring, non enduro)
- Valhalla non ha un "curvature mode" nativo. L'approssimazione curvy è ottenuta
  indirettamente: il profilo motorcycle con `use_highways` basso privilegia
  strade di classe SECONDARY/TERTIARY che hanno naturalmente più curve.
- **NON** è una replica esatta dell'algoritmo curvy proprietario di GraphHopper.
  È un backup robusto per uso in produzione.

---

## Architettura gate (sicurezza)

Il client Valhalla viene istanziato lato server SOLO quando:
- `maps_rollout = "tester"` AND `utente.mapTester = true`
- OPPURE `maps_rollout = "all"`

Per tutte le altre richieste, il `router-selector.ts` instrada a GraphHopper
senza mai contattare Valhalla. Nessun preload o health-check viene eseguito
per utenti non-tester.

---

## Fallback automatico

Se Valhalla restituisce errore (5xx, timeout >10s, errore di mapping):
1. Il `router-selector.ts` usa GraphHopper automaticamente
2. L'header `X-Routing-Fallback: graphhopper` viene impostato sulla risposta
3. Un log `[RouterSelector] Valhalla fallito (...)` viene emesso per debug admin

---

## Test admin

Endpoint di test disponibile nell'admin panel:

```
GET /api/admin/maps/test-routing
```

Esegue una richiesta Milano → Como sull'engine attualmente configurato e
restituisce `{ ok, latencyMs, distanceKm, durationMinutes, engine }`.

---

## Versione Docker

- Immagine: `ghcr.io/gis-ops/docker-valhalla/valhalla:latest`
- Branch atteso: 3.5.x (maggio 2026)
- Per pin SHA-256: `docker inspect ghcr.io/gis-ops/docker-valhalla/valhalla:latest | jq '.[0].RepoDigests'`
  e aggiungere `@sha256:<digest>` al tag nel compose.
