---
name: graphhopper-grafa
description: Gestire l'intera operazione GraphHopper su ThinkCentre — download PBF, build grafi, avvio/stop container, status. Usa questa skill ogni volta che si parla di "grafa", "build grafi", "GraphHopper aree", "container GH", "download mappe", o si vuole controllare/riavviare uno o più dei container bikerlink-gh-*.
---

# GraphHopper — Gestione completa aree BikerLink

Questa skill copre l'intera pipeline: download PBF → build grafi → avvio container → verifica stato.
Tutto gira sul **ThinkCentre** via SSH. Usa sempre `tc.py` (vedi skill `thinkcentre-access`).

---

## Le 8 aree (FONTE DI VERITÀ)

| Codice | Container | Porta interna | Heap serve | PBF approx | Tier |
|---|---|---|---|---|---|
| `grecia` | `bikerlink-gh-grecia` | 8990 | 2 GB | 0.6 GB | core |
| `balcani` | `bikerlink-gh-balcani` | 8991 | 2 GB | 1.5 GB | core |
| `est` | `bikerlink-gh-est` | 8992 | 2 GB | 1.5 GB | on-demand |
| `iberia` | `bikerlink-gh-iberia` | 8993 | 2 GB | 1.8 GB | on-demand |
| `arco-alpino` | `bikerlink-gh-arco-alpino` | 8994 | 4 GB | 3.6 GB | core |
| `germania-centro` | `bikerlink-gh-germania-centro` | 8995 | 4 GB | 5.2 GB | on-demand |
| `francia-benelux` | `bikerlink-gh-francia-benelux` | 8996 | 4 GB | 6.7 GB | on-demand |
| `ecuador` | `bikerlink-gh-ecuador` | 8997 | 2 GB | 0.1 GB | on-demand |

> **⚠️ Non dimenticare ecuador.** È l'ottava area, Sud America (Geofabrik south-america), porta 8997.

**Tutti i comandi vanno eseguiti da:** `/home/andrea/bikerlink/infra/self-host/` sul ThinkCentre.

---

## Immagine Docker

```
bikerlink/graphhopper:latest
```
Immagine custom compilata da sorgente (GH 12.x, Java 25), vive solo nel daemon locale del ThinkCentre. **Non è su Docker Hub.** Se manca, va ricostruita (vedi README.md nel repo infra).

---

## ⚡ Grafo di test (prima di buildare tutto)

**Usa sempre `ecuador` come banco di prova** (PBF 114 MB, build ~5 min).  
Serve a verificare che il comando docker sia corretto prima di lanciare le aree grandi.

```bash
# 1. Cleanup (obbligatorio — evita residui da run precedenti)
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "rm -rf /home/andrea/bikerlink/infra/self-host/graphs/ecuador && \
   mkdir -p /home/andrea/bikerlink/infra/self-host/graphs/ecuador" --sudo

# 2. Build test — docker diretto (non via script, path esplicito)
python3 .agents/skills/thinkcentre-access/tc.py exec "
nohup docker run --rm \
  --name bk-test-ecuador \
  -v /home/andrea/bikerlink/infra/self-host/data:/data:ro \
  -v /home/andrea/bikerlink/infra/self-host/graphs/ecuador:/graphhopper/graph-cache \
  -v /home/andrea/bikerlink/infra/self-host/graphhopper/config.yml:/graphhopper/config.yml:ro \
  -e GRAPH='/graphhopper/graph-cache' \
  -e FILE='/data/ecuador.osm.pbf' \
  -e JAVA_OPTS='-Xmx8g -Xms2g -XX:+UseParallelGC -XX:ParallelGCThreads=4 -XX:MaxMetaspaceSize=512m -server -Ddw.graphhopper.graph.dataaccess.default_type=RAM_STORE' \
  bikerlink/graphhopper:latest \
  --import -c /graphhopper/config.yml -o /graphhopper/graph-cache \
  > /tmp/bk-test-ecuador.log 2>&1 &
echo PID:\$!" --sudo

# 3. Monitora (ogni 60s)
python3 .agents/skills/thinkcentre-access/tc.py exec "tail -5 /tmp/bk-test-ecuador.log"

# 4. Verifica successo (il file 'properties' è il marker di completamento GH 12)
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "ls -lh /home/andrea/bikerlink/infra/self-host/graphs/ecuador/properties 2>/dev/null && echo OK || echo MANCANTE"
```

Se `properties` c'è → approccio corretto → applica agli altri.

---

## Pipeline completa (da zero)

### FASE 1 — Download PBF e merge

Script: `infra/self-host/download-regions.sh`

```bash
# Tutti e 8
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "cd /home/andrea/bikerlink/infra/self-host && bash download-regions.sh"

# Solo alcune aree
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "cd /home/andrea/bikerlink/infra/self-host && bash download-regions.sh grecia ecuador"
```

Lo script:
- Scarica i `.pbf` nazionali da Geofabrik (Europa: `europe/<slug>`, Ecuador: `south-america/ecuador`)
- Fa il merge con `osmium` per i gruppi multi-nazione
- È **idempotente**: skip se il file è già presente e il checksum MD5 è valido
- Riprende i download interrotti con `wget -c`

**Nazioni per area** (sync con `shared/routing-areas.ts`):
- `grecia` → greece + albania
- `balcani` → croatia, bosnia-herzegovina, montenegro, serbia, macedonia, albania
- `est` → romania, hungary, bulgaria
- `iberia` → spain + portugal
- `arco-alpino` → italy, austria, switzerland, slovenia
- `germania-centro` → germany + czech-republic
- `francia-benelux` → france, belgium, netherlands, luxembourg
- `ecuador` → ecuador *(Sud America, non Europa)*

---

### FASE 2 — Build grafi (import)

#### Metodo A — Script sequenziale (se funziona)

Script sul TC: `infra/self-host/build-graphs-sequential.sh`

```bash
# Tutte le 8 aree
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "cd /home/andrea/bikerlink/infra/self-host && nohup bash build-graphs-sequential.sh > /tmp/bk-build.out 2>&1 &"

# Solo alcune aree (passale come argomenti)
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "cd /home/andrea/bikerlink/infra/self-host && nohup bash build-graphs-sequential.sh grecia ecuador > /tmp/bk-build.out 2>&1 &"
```

#### Metodo B — Docker diretto per area (raccomandato, privo di bug)

**Usa sempre questo metodo** se lo script ha problemi (vedi Gotcha).  
Path assoluti e heap/RAM_STORE calibrati per area:

```bash
# Parametri per area
# area        | heap            | RAM_STORE
# ------------|-----------------|----------
# grecia      | -Xmx12g -Xms3g  | yes
# balcani     | -Xmx16g -Xms4g  | yes
# est         | -Xmx16g -Xms4g  | yes
# iberia      | -Xmx18g -Xms4g  | yes
# arco-alpino | -Xmx22g -Xms5g  | yes
# germania-centro | -Xmx14g -Xms3g | NO (MMAP — PBF 5.2GB → OOM con RAM_STORE)
# francia-benelux | -Xmx14g -Xms3g | NO (MMAP — PBF 6.8GB → OOM con RAM_STORE)
# ecuador     | -Xmx8g  -Xms2g  | yes

# Template (sostituisci AREA, HEAP, e aggiungi/rimuovi RAM_STORE_FLAG)
python3 .agents/skills/thinkcentre-access/tc.py exec "
BASE=/home/andrea/bikerlink/infra/self-host
AREA=ecuador
HEAP='-Xmx8g -Xms2g'
RAM_STORE_FLAG='-Ddw.graphhopper.graph.dataaccess.default_type=RAM_STORE'

rm -rf \$BASE/graphs/\$AREA && mkdir -p \$BASE/graphs/\$AREA
nohup docker run --rm \
  --name bk-build-\$AREA \
  -v \$BASE/data:/data:ro \
  -v \$BASE/graphs/\$AREA:/graphhopper/graph-cache \
  -v \$BASE/graphhopper/config.yml:/graphhopper/config.yml:ro \
  -e GRAPH='/graphhopper/graph-cache' \
  -e FILE=\"/data/\${AREA}.osm.pbf\" \
  -e JAVA_OPTS=\"\$HEAP -XX:+UseParallelGC -XX:ParallelGCThreads=4 -XX:MaxMetaspaceSize=512m -server \$RAM_STORE_FLAG\" \
  bikerlink/graphhopper:latest \
  --import -c /graphhopper/config.yml -o /graphhopper/graph-cache \
  > /tmp/bk-build-\$AREA.log 2>&1 &
echo PID:\$!" --sudo
```

**⚠️ IMPORTANTE per aree grandi (germania-centro, francia-benelux):**
- **NON usare RAM_STORE** (rimuovi `-Ddw.graphhopper.graph.dataaccess.default_type=RAM_STORE`)
- RAM_STORE con PBF > 5 GB → import OK (28+ min) ma flush finale OOM silenzioso → `properties` non scritto, exit 0 falso
- Senza RAM_STORE → GH usa **MMAP** di default → scrive su disco progressivamente → nessun OOM → `properties` scritto correttamente
- Con MMAP: usa heap ridotto (`-Xmx14g`) perché il grafo non sta in heap, solo le strutture CH

#### Monitoraggio e verifica

```bash
# Log in tempo reale
python3 .agents/skills/thinkcentre-access/tc.py exec "tail -20 /tmp/bk-build-<area>.log"

# Verifica completamento (properties = marker GH 12)
python3 .agents/skills/thinkcentre-access/tc.py exec "
for d in grecia balcani est iberia arco-alpino germania-centro francia-benelux ecuador; do
  p=/home/andrea/bikerlink/infra/self-host/graphs/\$d
  [[ -f \"\$p/properties\" ]] && echo \"\$d: OK (\$(du -sh \$p | cut -f1))\" || echo \"\$d: MANCANTE\"
done"
```

---

### FASE 3 — Avvio container (serving)

```bash
# Avvia tutti e 8 (tramite compose)
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "cd /home/andrea/bikerlink/infra/self-host && docker compose --profile areas up -d"

# Avvia solo alcune aree
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "cd /home/andrea/bikerlink/infra/self-host && docker compose up -d graphhopper-grecia graphhopper-ecuador"

# docker start diretto (se il container esiste già)
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "docker start bikerlink-gh-grecia bikerlink-gh-balcani bikerlink-gh-est bikerlink-gh-iberia bikerlink-gh-arco-alpino bikerlink-gh-germania-centro bikerlink-gh-francia-benelux bikerlink-gh-ecuador"
```

**JAVA_OPTS serving** (diversi dal build):
- Piccole (grecia, balcani, est, iberia, ecuador): `-Xmx2g -Xms512m -XX:+UseG1GC`
- Grandi (arco-alpino, germania-centro, francia-benelux): `-Xmx4g -Xms1g -XX:+UseG1GC`

---

## Operazioni frequenti

### Stato container

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep gh"
```

### Stato grafi

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "cd /home/andrea/bikerlink/infra/self-host && bash check-status.sh"
```

Verifica: presenza file `properties` (marker GH 12), presenza dei 3 profili `motorcycle`/`motorcycle_fast`/`car`, dimensione cartella.

### Stop container

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "docker stop bikerlink-gh-grecia bikerlink-gh-balcani bikerlink-gh-est bikerlink-gh-iberia bikerlink-gh-arco-alpino bikerlink-gh-germania-centro bikerlink-gh-francia-benelux bikerlink-gh-ecuador"
```

### Rebuild di una singola area

```bash
# 1. Ferma il container serving
docker stop bikerlink-gh-<area>
# 2. (opzionale) Scarica PBF aggiornato
bash download-regions.sh <area>
# 3. Rebuild (usa Metodo B - docker diretto)
# 4. Riavvia
docker start bikerlink-gh-<area>
```

### Probe HTTP rapida (senza SSH)

```bash
areas="grecia balcani est iberia arco-alpino germania-centro francia-benelux ecuador"
for area in $areas; do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${GRAPHHOPPER_TOKEN}" \
    "${GRAPHHOPPER_URL}/areas/${area}/info" --max-time 8)
  echo "$area → $code"
done
```
- `200` = up e grafo caricato
- `502` = container fermo o in build
- `000` = ThinkCentre irraggiungibile o tunnel giù
- `401` = manca token nel probe

---

## Profili GraphHopper attivi

Definiti in `infra/self-host/graphhopper/config.yml`:
- `motorcycle` — moto curvy (motorcycle.json + curvature.json) — ottimizzato LM
- `motorcycle_fast` — moto veloce (motorcycle.json) — ottimizzato CH
- `car` — auto (car.json) — ottimizzato CH

Il grafo è **completo** solo se tutti e 3 i profili sono presenti nel file `properties`.

---

## Gotcha noti

| Problema | Causa | Fix |
|---|---|---|
| `properties` assente dopo import di 28+ min, exit 0 | OOM silenzioso durante flush/CH con RAM_STORE su PBF > 5 GB | Rimuovi `-Ddw.graphhopper.graph.dataaccess.default_type=RAM_STORE` → usa MMAP |
| Build monta dir sbagliata (es. `graphs/est` invece di `graphs/france-benelux`) | Bug in `build-graphs-sequential.sh`: `graph_dir` non aggiornato nei retry delle large areas | Usa **Metodo B** (docker diretto) con path assoluti espliciti |
| Container `Exited (1)` subito dopo start | `graph-cache/properties` assente — grafo non buildato o corrotto | Rebuild con Metodo B |
| `expected 'GH' as file marker but was [vuoto]` | Cartella graph-cache svuotata | Rebuild |
| `bikerlink-gh-ecuador` non esiste | Container mai creato con docker compose | `docker compose up -d graphhopper-ecuador` da infra/self-host |
| Probe HTTP `000` per tutte le aree | ThinkCentre spento o tunnel Cloudflare giù | Verifica con `tc.py status` |
| Import da 5 sec (quasi istantaneo) | GH trova grafo esistente in graph-cache (già buildato) e lo salta | `rm -rf graphs/<area>` prima del build |
