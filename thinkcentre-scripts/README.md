# ThinkCentre Scripts — BikerLink

Script shell pronti all'uso per il ThinkCentre (Ubuntu, IP 192.168.1.35, user `andrea`).

Dopo `git pull`, tutti i comandi sono disponibili senza digitarli a mano.
I processi lunghi girano in `screen` e sopravvivono alla disconnessione SSH.

---

## Prerequisiti

- Docker installato e in esecuzione
- PBF scaricato in `~/valhalla/data/europe-latest.osm.pbf`
  ```bash
  wget -c -P ~/valhalla/data/ https://download.geofabrik.de/europe-latest.osm.pbf
  ```

---

## Script

| Script  | Cosa fa                                                    |
|---------|------------------------------------------------------------|
| `00.sh` | `git pull` con stash automatico delle modifiche locali     |
| `01.sh` | Monitor CPU + RAM + disco (aggiorna ogni 2s)               |
| `02.sh` | Monitor build Valhalla: container, tiles, log (ogni 5s)    |
| `03.sh` | Pulizia Valhalla: ferma container, rimuove tiles e log     |
| `04.sh` | Check pre-build: PBF, Docker, spazio disco (OK/WARN/FAIL)  |
| `05.sh` | Avvia build grafo Valhalla in background (screen)          |
| `06.sh` | Verifica post-build: tiles, container, test HTTP /status   |
| `07.sh` | Prepara workspace Nominatim + crea docker-compose.yml      |
| `08.sh` | Avvia import Nominatim in background (screen)              |
| `09.sh` | Monitor import Nominatim: container, log, test HTTP        |

---

## Ordine consigliato

### Valhalla (build grafo routing)

```
04.sh   ← check pre-build
05.sh   ← avvia build (dura ore)
02.sh   ← monitora (in un'altra sessione SSH)
06.sh   ← verifica quando il monitor mostra "TERMINATO"
```

Se la build è fallita o vuoi ripartire da zero: `03.sh` poi `05.sh`.

### Nominatim (geocoding self-hosted)

```
07.sh   ← prepara workspace e docker-compose.yml
08.sh   ← avvia import (6–24h per Europe)
09.sh   ← monitora (in un'altra sessione SSH)
```

---

## Note operative

- **Ctrl+C** sui monitor (01/02/09) esce dal monitor, **non** ferma la build.
- `screen -ls` → lista sessioni attive
- `screen -r valhalla-build` → rientra nella sessione Valhalla
- `screen -r nominatim-import` → rientra nella sessione Nominatim
- I log sono sempre in `/tmp/*.log`

---

## Porte

| Servizio   | Porta         |
|------------|---------------|
| Valhalla   | `8002`        |
| Nominatim  | `8080`        |
