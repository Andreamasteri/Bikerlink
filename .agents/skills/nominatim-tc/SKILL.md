---
name: nominatim-tc
description: Gestire Nominatim self-hosted sul ThinkCentre BikerLink. Usa questa skill quando l'utente dice "grafa con nominatim", "avvia nominatim", "stato nominatim", "controlla geocoding", o vuole sapere se l'import è finito. Copre avvio, monitoraggio import, verifica stato, stop e troubleshooting del container bikerlink-nominatim.
---

# Nominatim — ThinkCentre BikerLink

Nominatim è il geocoder self-hosted di BikerLink. Gira su Docker sul ThinkCentre.

## Dati chiave

| Cosa | Valore |
|---|---|
| Container | `bikerlink-nominatim` |
| Immagine | `mediagis/nominatim:5.3` |
| Porta locale TC | `127.0.0.1:7070` |
| File PBF sorgente (host) | `~/bikerlink/infra/self-host/data/europeecuador-merged.osm.pbf` (~33 GB) |
| File PBF nel container | `/nominatim_data/europeecuador-merged.osm.pbf` |
| PBF_URL da passare | `file:///nominatim_data/europeecuador-merged.osm.pbf` |
| Profilo Docker Compose | `nominatim` (NON parte con `docker compose up -d`) |
| FREEZE | `true` (nessun aggiornamento OSM — Europa+Ecuador non ha replication URL) |
| Script di setup | `~/bikerlink/infra/self-host/setup-nominatim.sh` |
| Tempo import | 24–48 ore (Europa intera) |
| Spazio DB stimato | ~400 GB |

## SSH sul ThinkCentre

Sempre via `tc.py`. Non usare mai IP LAN o Tailscale dalla sandbox Replit.

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec "<comando>"
```

## Comandi frequenti

### Verifica stato container
```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "docker ps --filter name=bikerlink-nominatim --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
```

### Verifica se l'import è completato
```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "curl -fsS --max-time 5 http://localhost:7070/status.php && echo 'NOMINATIM_OK' || echo 'IMPORT_IN_PROGRESS_OR_DOWN'"
```
- `NOMINATIM_OK` = import finito, geocoding attivo
- `IMPORT_IN_PROGRESS_OR_DOWN` = import ancora in corso (normale nelle prime 48h) oppure container fermo

### Ultime righe di log (progress import)
```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "docker logs --tail 20 bikerlink-nominatim 2>&1"
```

### Avvio container
```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "cd ~/bikerlink/infra/self-host && \
   NONINTERACTIVE=1 \
   ./setup-nominatim.sh \
     --pbf-url file:///nominatim_data/europeecuador-merged.osm.pbf \
     --freeze --no-wait"
```

### Stop container
```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "docker stop bikerlink-nominatim"
```

### Test geocoding (dopo import completato)
```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "curl -s 'http://localhost:7070/search?q=Roma&format=json&limit=1' | python3 -m json.tool | head -20"
```

## Flusso "grafa con nominatim"

1. Verificare che il file PBF esista (~33 GB):
   ```bash
   python3 .agents/skills/thinkcentre-access/tc.py exec \
     "ls -lh ~/bikerlink/infra/self-host/data/europeecuador-merged.osm.pbf"
   ```

2. Verificare se il container è già `Up`:
   ```bash
   python3 .agents/skills/thinkcentre-access/tc.py exec \
     "docker ps --filter name=bikerlink-nominatim --format '{{.Status}}'"
   ```

3. Se non è `Up` → avviare con il comando di avvio sopra.

4. Comunicare all'utente: "Container Nominatim avviato. Import Europa intera in corso — richiede 24-48h."

5. NON aspettare il completamento dell'import — è un processo asincrono.

## Troubleshooting

**Container in crash loop**
- Log: `docker logs --tail 50 bikerlink-nominatim`
- `shm_size` troppo basso → verificare `docker-compose.yml` abbia `shm_size: "4gb"`
- Spazio disco esaurito → `df -h`

**`/status.php` risponde 500**
- Import in corso ma PostgreSQL interno non pronto → normale, aspettare

**File PBF non trovato**
- Il vecchio nome era `valhalla-merged.osm.pbf` — se ancora presente, rinominare:
  `mv valhalla-merged.osm.pbf europeecuador-merged.osm.pbf`

**Container non parte**
- Il servizio ha `profiles: ["nominatim"]`: specificare il servizio per nome nel comando compose

## File di riferimento
- `infra/self-host/setup-nominatim.sh`
- `infra/self-host/docker-compose.yml`
- `.agents/skills/thinkcentre-access/tc.py`
