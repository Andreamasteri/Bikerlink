---
name: valhalla-graph-build
description: Gestire l'intero processo di build tile Valhalla sul ThinkCentre in autonomia — pre-flight, avvio in background, monitoring progressivo, verifica post-build, gestione errori comuni. Usa quando l'utente dice "grafa con valhalla", "rebuilda valhalla", "build tile valhalla", "rigenera i tile Valhalla" o simili.
---

# Skill — Grafa con Valhalla (processo autonomo end-to-end)

## Trigger

- "grafa con valhalla"
- "rebuilda valhalla"
- "build tile valhalla"
- "rigenera i tile Valhalla"
- "ricostruisci valhalla"
- o qualsiasi variante che implichi ricostruire i tile Valhalla da zero

## Dipendenze

- Skill `thinkcentre-access`: tutta la comunicazione col TC passa da `tc.py`.
  - Connessione: `python3 .agents/skills/thinkcentre-access/tc.py exec "<cmd>"`
  - Sudo: aggiungere `--sudo`
  - Se `paramiko` manca: `installLanguagePackages('python3', 'paramiko')`
- File chiave sul ThinkCentre (paths relativi alla home di deploy):
  - Script: `~/bikerlink/infra/self-host/build-valhalla-tiles.sh`
  - Compose: `~/bikerlink/infra/self-host/docker-compose.yml`
  - PBF sorgente: `~/bikerlink/infra/self-host/data/europeecuador-merged.osm.pbf`
  - Config Valhalla generata: `~/bikerlink/infra/self-host/data/valhalla.json`
- Log build: `/tmp/valhalla-build.log` (quando avviato con nohup)
- Container: `bikerlink-valhalla` · porta `8002` · status `http://localhost:8002/status`

---

## Fase 0 — Pre-flight (~30 secondi)

Esegui i controlli nell'ordine seguente. Se un check fallisce, **blocca** con messaggio chiaro prima di procedere.

### 0a — PBF sorgente presente

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "ls -lh ~/bikerlink/infra/self-host/data/europeecuador-merged.osm.pbf"
```

- **OK**: file trovato → riporta dimensione all'utente.
- **KO** (file non trovato): blocca con:
  > "Il file `europeecuador-merged.osm.pbf` è assente in `~/bikerlink/infra/self-host/data/`.
  > Devi eseguire prima `./download-osm.sh` nella stessa cartella per scaricarlo e unire le aree.
  > Il download Europa + Ecuador richiede ore e decine di GB di spazio."

### 0b — Immagine Docker presente

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "docker image inspect bikerlink/valhalla:latest --format '{{.Id}} {{.Created}}'"
```

- **OK**: immagine trovata → riporta ID/data.
- **KO**: blocca con:
  > "L'immagine `bikerlink/valhalla:latest` non è presente localmente.
  > Va ricostruita da sorgente. Vedi la skill `valhalla-custom-build` (memory: `valhalla-custom-build.md`)
  > oppure esegui il build dal Dockerfile in `infra/self-host/valhalla/Dockerfile`."

### 0c — RAM disponibile

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec "free -h | head -2"
```

- Riporta i valori all'utente.
- Se la RAM disponibile (colonna `available`) è < 20 GB: **avvisa** (non blocca):
  > "⚠️ RAM disponibile bassa ({X} GB). Il build tile Europa intera è pesante;
  > considera di fermare altri container prima di procedere."

### 0d — Nessun build già in corso

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "pgrep -fa 'build-valhalla-tiles' | head -5"
```

- Se un processo è già attivo: informa l'utente e passa direttamente alla **Fase 2 — Monitoring**.

---

## Fase 1 — Avvio build in background

### Preferenza: tmux (più robusto)

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "tmux new-session -d -s valhalla-build 'cd ~/bikerlink/infra/self-host && bash build-valhalla-tiles.sh 2>&1 | tee /tmp/valhalla-build.log' 2>&1 || echo 'TMUX_FALLBACK'"
```

- Se tmux non è disponibile (`command not found` o `TMUX_FALLBACK` nell'output):

### Fallback: nohup

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "cd ~/bikerlink/infra/self-host && nohup bash build-valhalla-tiles.sh > /tmp/valhalla-build.log 2>&1 & echo \"PID: $!\""
```

Dopo l'avvio riporta all'utente:

> "Build Valhalla avviata in background (tmux: `valhalla-build` / nohup PID: {X}).
> Log in `/tmp/valhalla-build.log`.
> Stima: **3–6 ore** per Europa + Ecuador (i5-14400, 8 thread mjolnir, 96 GB RAM).
> Puoi chiedermi aggiornamenti in qualsiasi momento."

---

## Fase 2 — Monitoring progressivo

Ogni volta che l'utente chiede un aggiornamento, oppure dopo l'avvio:

### Leggi le ultime 40 righe del log

```bash
# Con tmux:
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "tmux capture-pane -p -t valhalla-build 2>/dev/null || tail -40 /tmp/valhalla-build.log"
```

### Verifica che il processo sia ancora vivo

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "pgrep -fa 'build-valhalla-tiles' | head -3"
```

### Interpretazione delle fasi nello script

Lo script `build-valhalla-tiles.sh` usa questi marker:

| Marker nel log | Fase | Durata tipica |
|---|---|---|
| `[1/5]` | Genera `valhalla.json` con `valhalla_build_config` | < 1 min |
| `[2/5]` | Imposta `mjolnir.concurrency` nel JSON | < 1 min |
| `[3/5]` | Admin database (`valhalla_build_admins`) | 5–20 min |
| `[4/5]` | Timezone database (`valhalla_build_timezones`) | 2–10 min |
| `[5/5]` | **Tile build** (`valhalla_build_tiles`) — la fase più lunga | 2–5 ore |
| `[extra]` | Tile extract (`.tar`) con `valhalla_build_extract` | 10–30 min |
| `[check]` | Verifica presenza artefatti nel volume | < 1 min |
| `[Serve]` | Avvio container + polling `/status` | 1–10 min |
| `✓ Tile Valhalla pronti` | **Build completato con successo** | — |

### Segnali di errore critici

Cerca nel log le parole chiave:
- `ERRORE:` → errore dello script (esce con `exit 1`)
- `Error` / `error` (case-sensitive: distingui dai log normali di Valhalla)
- `die` → funzione die() dello script (sempre fatale)
- `exit 1`
- `killed` / `Killed` → possibile OOM

Se trovi errori critici: passa immediatamente alla **Fase 4 — Report KO**.

---

## Fase 3 — Verifica post-build

Quando il log mostra `✓ Tile Valhalla pronti e server in ascolto su :8002`  
**oppure** il processo risulta terminato (pgrep vuoto):

### 3a — Risposta /status

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "curl -fsS --max-time 15 http://localhost:8002/status"
```

Salva la versione Valhalla dal campo `version` della risposta JSON.

### 3b — Verifica tile nel volume

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "docker compose -f ~/bikerlink/infra/self-host/docker-compose.yml exec valhalla \
   sh -c 'ls /custom_files/valhalla_tiles/ | head -20 && find /custom_files/valhalla_tiles -name \"*.gph\" -o -name \"*.bin\" | wc -l'"
```

### 3c — Test routing reale (Roma → Napoli)

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec "curl -fsS --max-time 30 \
  'http://localhost:8002/route' \
  -H 'Content-Type: application/json' \
  -d '{\"locations\":[{\"lon\":12.4922,\"lat\":41.8902},{\"lon\":14.2681,\"lat\":40.8518}],\"costing\":\"motorcycle\",\"directions_options\":{\"units\":\"kilometers\"}}' \
  | python3 -c \"import sys,json; r=json.load(sys.stdin); print(\\\"OK — distanza:\\\", r[\\\"trip\\\"][\\\"summary\\\"][\\\"length\\\"], \\\"km\\\")\" 2>/dev/null \
  || echo 'Routing KO o risposta non valida'"
```

---

## Fase 4 — Report finale

### ✅ Se tutto OK

Riporta all'utente:
- Versione Valhalla (`/status → version`)
- Numero tile (file `.gph`/`.bin`) nel volume
- Tempo totale build (ricavato dai timestamp `[$(date)]` nel log)
- Esito test Roma → Napoli

Aggiungi il promemoria:

> "⚠️ Non riavviare il ThinkCentre nei prossimi 10 minuti: Valhalla sta caricando i tile in memoria."

E ricorda il controllo nginx se il servizio pubblico era su 502:

> "Se `valhalla.bikerlink.duckdns.org` restituisce 502 nonostante Valhalla risponda su localhost:8002,
> verifica che nginx punti a `127.0.0.1:8002` (non 8003 — vecchio bug noto).
> Controlla: `sudo nginx -T | grep valhalla_backend`"

### ❌ Se build fallita

Leggi le ultime 50 righe del log:

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec "tail -50 /tmp/valhalla-build.log"
```

Riporta le righe con errore e il suggerimento correttivo dalla sezione "Errori comuni" sotto.

---

## Errori comuni e fix autonomi

### Immagine Docker non trovata

```
ERRORE: Immagine 'bikerlink/valhalla:latest' non trovata localmente.
```

**Fix**: l'immagine è custom (build da sorgente, non su Docker Hub).  
Istruzioni complete in `infra/self-host/README.md` § "Come ricostruire Valhalla"  
e nel memory file `valhalla-custom-build.md`.  
Non eseguire `docker pull` — non esiste su Docker Hub.

### valhalla.json non valido / `boost ptree_bad_path`

```
ERRORE: valhalla.json generato non è un JSON valido.
```
oppure il container crasha con `boost ptree_bad_path: No such node (loki.service_defaults.mvt_min_zoom_road_class)`.

**Fix**: cancella il `valhalla.json` esistente; lo script lo rigenera al passo `[1/5]`:

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "rm -f ~/bikerlink/infra/self-host/data/valhalla.json"
```

Poi riavvia il build (Fase 1).

### `/status` non risponde dopo 10+ minuti dalla fine del build

**Fix**: controlla i log del container:

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "docker logs bikerlink-valhalla --tail 50"
```

Se il container non è in esecuzione (`docker ps | grep valhalla` vuoto):

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "cd ~/bikerlink/infra/self-host && docker compose up -d valhalla"
```

### Build terminato da OOM killer

Sintomo: `Killed` nel log oppure `dmesg` mostra OOM:

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "dmesg --ctime | grep -i oom | tail -10"
```

Con 96 GB RAM sul TC questo non dovrebbe accadere. Se accade:
1. Ferma tutti i container non necessari durante il build (`docker stop bikerlink-nominatim bikerlink-gh-*`).
2. Riavvia il build con concurrency ridotta: `MJOLNIR_CONCURRENCY=4 bash build-valhalla-tiles.sh`.

### Build timeout (> 6 ore)

Lo script usa `timeout 21600s` per `valhalla_build_tiles`. Se supera il limite:

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "cd ~/bikerlink/infra/self-host && BUILD_TILES_TIMEOUT_SECS=43200 nohup bash build-valhalla-tiles.sh > /tmp/valhalla-build.log 2>&1 &"
```

### Container bikerlink-valhalla-serve fermo (502 dal proxy)

Se `/status` risponde su `localhost:8002` ma l'endpoint pubblico dà 502:
- Verifica il problema nginx noto (upstream punta a 8003 invece di 8002):

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "sudo nginx -T 2>/dev/null | grep -A3 'upstream valhalla'" --sudo
```

- Fix: aggiorna la conf nginx e ricarica: `sudo nginx -s reload`.

---

## Nota architetturale (non dimenticare)

L'immagine `bikerlink/valhalla:latest` è **bare upstream** senza l'orchestratore gis-ops:
- `ENTRYPOINT=null`, `CMD=["/bin/bash"]`
- Il container `serve` usa `command: ["valhalla_service", "/custom_files/valhalla.json", "1"]` nel compose
- Il build tile è un processo **separato** (non l'entrypoint) — gestito interamente da `build-valhalla-tiles.sh`
- I volumi sono `./data:/custom_files` + `valhalladata:/custom_files/valhalla_tiles` (volume Compose project-scoped)

Fonte: `infra/self-host/docker-compose.yml` (servizio `valhalla`) e `infra/self-host/build-valhalla-tiles.sh`.
