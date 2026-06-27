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
| `iberia` | `bikerlink-gh-iberia` | 8993 | 2 GB | 1.8 GB | core |
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

Script: `infra/self-host/build-regions.sh`

```bash
# Tutti e 8 (sequenziale, RAM-hungry — ci vogliono ore)
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "cd /home/andrea/bikerlink/infra/self-host && bash build-regions.sh"

# Solo alcune aree
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "cd /home/andrea/bikerlink/infra/self-host && bash build-regions.sh grecia ecuador"
```

Lo script:
- Usa `docker run --rm` (non compose): avvia, builda, ed **esce**
- JAVA_OPTS build: `-Xmx25g -Xms6g -XX:+UseParallelGC` (RAM_STORE forzato)
- Il grafo finito finisce in `graphs/<area>/` sul ThinkCentre
- Marker di completamento GH 12: file `properties` nella cartella del grafo
- Continua anche se un'area fallisce; stampa riepilogo ✓/✗ alla fine

**⚠️ Prima del primo build su cartelle root-owned** (le crea Docker), serve pulizia manuale interattiva **UNA VOLTA**:
```bash
sudo rm -rf /home/andrea/bikerlink/infra/self-host/graphs/{grecia,balcani,est,iberia,arco-alpino,germania-centro,francia-benelux,ecuador}
```
Il build-regions.sh NON usa sudo (gira unattended).

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
# 1. Ferma
docker stop bikerlink-gh-<area>
# 2. Scarica PBF aggiornato
bash download-regions.sh <area>
# 3. Rebuild
bash build-regions.sh <area>
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
| Container `Exited (1)` subito dopo start | `graph-cache/properties` assente — grafo non ancora buildato | Normale: esegui build-regions.sh |
| `expected 'GH' as file marker but was [vuoto]` | Cartella graph-cache svuotata (es. pulizia NVMe) | Esegui build-regions.sh per quell'area |
| `bikerlink-gh-ecuador` non esiste | Container mai creato con docker compose | `docker compose up -d graphhopper-ecuador` da infra/self-host |
| Probe HTTP `000` per tutte le aree | ThinkCentre spento o tunnel Cloudflare giù | Verifica con `tc.py status` |
| Build usa MMAP invece di RAM_STORE | JAVA_OPTS mancante | build-regions.sh lo imposta già nel BUILD_JAVA_OPTS |
