# GraphHopper Self-Hosted — Documentazione BikerLink

Questo documento descrive come configurare e integrare il server GraphHopper self-hosted con il backend BikerLink.

## Variabili d'ambiente

| Variabile            | Descrizione                                         | Esempio                              |
|----------------------|-----------------------------------------------------|--------------------------------------|
| `GRAPHHOPPER_URL`    | URL base del server GH (senza trailing slash)       | `https://gh.bikerlink.app`           |
| `GRAPHHOPPER_TOKEN`  | Token di autenticazione (header `X-GH-Token`)       | `my-secret-token-32chars`            |

Se `GRAPHHOPPER_URL` non è impostata, il backend usa la **GraphHopper Cloud API** come fallback (`https://graphhopper.com/api/1`). In quel caso è necessaria anche `GRAPHHOPPER_API_KEY`.

## Ambienti

### Sviluppo locale
```bash
# .env (non committare)
GRAPHHOPPER_URL=http://localhost:8989
GRAPHHOPPER_TOKEN=dev-token-local
```

### Staging
```bash
GRAPHHOPPER_URL=https://gh-staging.bikerlink.app
GRAPHHOPPER_TOKEN=<staging-token>
```

### Produzione
```bash
GRAPHHOPPER_URL=https://gh.bikerlink.app
GRAPHHOPPER_TOKEN=<prod-token-generato-con-openssl-rand-base64-32>
```

## Endpoint esposti dal server GH

| Endpoint         | Metodo | Auth | Descrizione                          |
|------------------|--------|------|--------------------------------------|
| `/health`        | GET    | No   | Stato server + flag grafo caricato   |
| `/route`         | POST   | Sì   | Calcolo percorso (profili: motorcycle, motorcycle_fast) |
| `/match`         | POST   | Sì   | Map Matching GPS → segmenti OSM      |
| `/info`          | GET    | Sì   | Info grafo (data OSM, profili, bbox) |

### Autenticazione

Tutte le richieste (tranne `/health`) richiedono il token via header:

```http
X-GH-Token: <GRAPHHOPPER_TOKEN>
# oppure
Authorization: Bearer <GRAPHHOPPER_TOKEN>
```

## Profili di routing

### `motorcycle` (default per BikerLink)
Ottimizzato per strade panoramiche e curve. Penalizza autostrade e strade principali, favorisce strade secondarie e terziarie.

```json
{
  "profile": "motorcycle"
}
```

### `motorcycle_fast`
Ottimizzato per il tempo minimo. Utile come confronto.

```json
{
  "profile": "motorcycle_fast"
}
```

### Custom Model (Fase 3 — pesi telemetria)
Per il routing con pesi dinamici basati sui dati di telemetria:

```json
{
  "profile": "motorcycle",
  "custom_model": {
    "priority": [
      {"if": "road_class == MOTORWAY", "multiply_by": "0.01"},
      {"if": "road_class == SECONDARY", "multiply_by": "1.8"}
    ]
  }
}
```

## Esempio richiesta routing

```typescript
// server/graphhopper-client.ts (da implementare in Fase 2)
const GH_URL = process.env.GRAPHHOPPER_URL || 'https://graphhopper.com/api/1';
const GH_TOKEN = process.env.GRAPHHOPPER_TOKEN || '';

const response = await fetch(`${GH_URL}/route`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-GH-Token': GH_TOKEN,
  },
  body: JSON.stringify({
    points: [[lon1, lat1], [lon2, lat2]],
    profile: 'motorcycle',
    instructions: false,
    calc_points: true,
    points_encoded: false,
  }),
});
```

## Esempio richiesta Map Matching

```typescript
const response = await fetch(`${GH_URL}/match`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-GH-Token': GH_TOKEN,
  },
  body: JSON.stringify({
    points: gpsTrack.map(p => [p.lon, p.lat]),
    profile: 'motorcycle',
  }),
});

const data = await response.json();
// data.paths[0].details.osm_way_id → array di [start, end, wayId]
```

## Risposta /health

```json
{
  "status": "ok",
  "graph_loaded": true,
  "osm_date": "2024-01-15",
  "version": "9.1",
  "profiles": ["motorcycle", "motorcycle_fast"]
}
```

## Setup server (riepilogo rapido)

Il setup completo è in `graphhopper/setup-oracle.sh`. Passaggi principali:

1. **Oracle Cloud Free Tier**: VM.Standard.A1.Flex (4 OCPU ARM, 24 GB RAM)
   - Regione: EU Frankfurt o Milan
   - OS: Ubuntu 22.04 LTS
   - Porta 443 aperta nel Security Group

2. **Esecuzione setup**:
   ```bash
   DOMAIN=gh.bikerlink.app GH_TOKEN=$(openssl rand -base64 32) \
     sudo ./graphhopper/setup-oracle.sh
   ```

3. **Verifica**:
   ```bash
   ./graphhopper/test-graphhopper.sh https://gh.bikerlink.app <token>
   ```

4. **Impostare le variabili** nel backend BikerLink (Replit Secrets):
   - `GRAPHHOPPER_URL` = `https://gh.bikerlink.app`
   - `GRAPHHOPPER_TOKEN` = `<token generato al punto 2>`

## Aggiornamento mensile OSM

Il cron è installato automaticamente da `setup-oracle.sh`:
```
0 2 1 * * /opt/graphhopper/update-osm.sh
```

Per aggiornamento manuale:
```bash
sudo /opt/graphhopper/update-osm.sh
```

## Troubleshooting

**GraphHopper non risponde:**
```bash
systemctl status graphhopper
journalctl -u graphhopper -n 100 --no-pager
```

**Grafo non caricato (health restituisce graph_loaded: false):**
Il grafo impiega 2-3 min a caricarsi all'avvio. Attendere e riprovare.

**Map Matching restituisce errore:**
Verificare che `map_matching.enabled: true` sia nel `config.yml` e che il grafo sia stato buildato con il flag `store_simple_shortest_path_edges=true`.

**429 Too Many Requests:**
Il rate limiter Nginx è impostato a 100 req/min per IP. Ridurre la frequenza delle chiamate o aumentare il limite in `nginx.conf` (zona `gh_limit`).

## Riferimenti

- [GraphHopper Docs](https://docs.graphhopper.com/)
- [Map Matching API](https://docs.graphhopper.com/#tag/Map-Matching-API)
- [Custom Model](https://docs.graphhopper.com/latest/custom-models/)
- [Geofabrik OSM Downloads](https://download.geofabrik.de/europe/italy.html)
- Script infrastruttura: `graphhopper/` directory
