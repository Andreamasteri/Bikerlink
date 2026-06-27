# Self-Hosting Server — Guida Completa da Zero

> Guida operativa per configurare un singolo server Linux che ospiti **GraphHopper** (routing moto curvy), **TileServer GL** (mappe vettoriali), e il sistema di **backup automatico** di BikerLink (PostgreSQL + object storage).
>
> Obiettivo: zero dipendenze da CDN a consumo, costo fisso mensile prevedibile.

---

## Indice

1. [Distro e Hardware Consigliato](#1-distro-e-hardware-consigliato)
2. [Installazione Base OS e Pacchetti di Sistema](#2-installazione-base-os-e-pacchetti-di-sistema)
3. [Setup Docker e Docker Compose](#3-setup-docker-e-docker-compose)
4. [GraphHopper — Installazione e Configurazione](#4-graphhopper--installazione-e-configurazione)
5. [Download Dati OSM e Import Completo](#5-download-dati-osm-e-import-completo)
6. [Tile Server Vettoriale (TileServer GL)](#6-tile-server-vettoriale-tileserver-gl)
7. [Tile Server Raster Fallback (mod_tile)](#7-tile-server-raster-fallback-mod_tile)
8. [Backup Automatico PostgreSQL + Object Storage](#8-backup-automatico-postgresql--object-storage)
9. [Nginx Reverse Proxy + HTTPS (Let's Encrypt)](#9-nginx-reverse-proxy--https-lets-encrypt)
10. [Systemd Services — Avvio Automatico](#10-systemd-services--avvio-automatico)
11. [Checklist Verifica Finale](#11-checklist-verifica-finale)

---

## 1. Distro e Hardware Consigliato

### Distribuzione: Ubuntu 24.04 LTS

**Motivazione:**
- LTS con supporto sicurezza garantito 5 anni (fino al 2029)
- Supporto nativo ARM64 (compatibile Oracle Ampere)
- Repository aggiornati: Java 25 LTS, Docker, Nginx, Certbot tutti disponibili via apt
- Ampia documentazione e community — il 90% degli errori si risolve con una ricerca

### Opzione A — Sviluppo/Test: Oracle Cloud Free Tier (costo zero)

| Risorsa | Valore |
|---|---|
| CPU | 2 core ARM Ampere (OCPU) |
| RAM | 24 GB |
| Storage | 200 GB block volume |
| Costo | **€0 — Always Free, nessuna scadenza** |
| Registrazione | Richiede carta di credito ma non viene addebitata |
| URL | cloud.oracle.com → Compute → Always Free Resources |

**Sufficiente per:** GraphHopper con dataset Italia + Penisola Balcanica + Grecia (~8 GB OSM), TileServer GL con tiles regionali.

**Non sufficiente per:** dataset Europa completa (~30 GB OSM) — la RAM non è sufficiente per l'import.

### Opzione B — Produzione: Hetzner Cloud (consigliato)

| Piano | CPU | RAM | NVMe | Costo |
|---|---|---|---|---|
| CPX31 | 4 vCPU | 8 GB | 160 GB | ~€10/mese |
| **CPX41** | **8 vCPU** | **16 GB** | **240 GB** | **~€20/mese** ⭐ |
| CPX51 | 16 vCPU | 32 GB | 360 GB | ~€40/mese |

**Raccomandazione per BikerLink:** CPX41 a ~€20/mese.
- 16 GB RAM: sufficiente per l'import Europa completa (`-Xmx14g` GraphHopper)
- 240 GB NVMe: dataset OSM grezzo (~34 GB) + graph cache GraphHopper (~80 GB) + tiles mbtiles (~50 GB) + sistema = ok
- Datacenter: **Francoforte** (bassa latenza per utenti Europa centrale e Italia)

**URL:** hetzner.com/cloud → New Server → Location: Nuremberg/Frankfurt → CPX41 → Ubuntu 24.04

### Requisiti Hardware Minimi per le Tre Workload

| Componente | Minimo | Consigliato (prod) |
|---|---|---|
| CPU | 4 core | 8 core |
| RAM | 8 GB (solo Italia) | 16 GB (Europa completa) |
| Storage | 100 GB | 300 GB NVMe |
| Banda uscita | 1 TB/mese | 5 TB/mese (incluso in Hetzner) |
| OS | Ubuntu 22.04 | Ubuntu 24.04 LTS |

---

## 2. Installazione Base OS e Pacchetti di Sistema

### 2.1 Primo accesso e hardening base

```bash
# Connettiti al server (Hetzner fornisce IP e password root via email)
ssh root@<IP_SERVER>

# Aggiorna tutto prima di fare qualsiasi cosa
apt update && apt upgrade -y

# Crea utente non-root per le operazioni ordinarie
adduser bikerlink
usermod -aG sudo bikerlink

# Copia le chiavi SSH al nuovo utente (se usi chiave pubblica)
rsync --archive --chown=bikerlink:bikerlink ~/.ssh /home/bikerlink

# Da ora in poi usa: ssh bikerlink@<IP_SERVER>
```

### 2.2 Pacchetti di sistema — lista completa

```bash
# Installa tutti i pacchetti necessari in un colpo solo
# Packages: Java 25 LTS (GraphHopper/planetiler), osmium-tool (merge OSM), screen/tmux (sessioni persistenti),
#           fail2ban (protezione SSH), ufw (firewall), nginx (proxy), certbot (HTTPS),
#           postgresql-client (backup pg_dump), rclone (upload object storage)
sudo apt install -y \
  openjdk-25-jdk \
  python3 \
  python3-pip \
  osmium-tool \
  wget \
  curl \
  screen \
  tmux \
  git \
  unzip \
  htop \
  fail2ban \
  ufw \
  nginx \
  certbot \
  python3-certbot-nginx \
  postgresql-client \
  rclone
```

### 2.3 Verifica Java

```bash
java -version
# Output atteso: openjdk version "25.x.x" 2025-...

# Java 25 è LTS (rilasciato set 2025) ed è il default di sistema.
# Se openjdk-25-jdk non fosse nei repo della tua release Ubuntu, usa il
# repository APT Adoptium/Temurin (temurin-25-jdk) o il tarball Temurin 25.
# Imposta 25 come default:
# sudo update-alternatives --config java   # seleziona java-25-openjdk-amd64
```

### 2.4 Configurazione Firewall (ufw)

```bash
# Abilita ufw con le porte necessarie
sudo ufw allow OpenSSH          # SSH (porta 22)
sudo ufw allow 80/tcp           # HTTP (redirect a HTTPS)
sudo ufw allow 443/tcp          # HTTPS
sudo ufw allow 8989/tcp         # GraphHopper API (opzionale, solo per test diretto)
sudo ufw allow 8080/tcp         # TileServer GL (opzionale, solo per test diretto)

# Attiva il firewall
sudo ufw enable

# Verifica stato
sudo ufw status
```

> **Nota:** In produzione, le porte 8989 e 8080 non devono essere esposte direttamente — Nginx fa da proxy. Puoi rimuoverle da ufw dopo aver configurato il reverse proxy.

### 2.5 Configurazione fail2ban

```bash
# fail2ban è già attivo di default dopo l'installazione
# Verifica che sia in esecuzione
sudo systemctl status fail2ban

# Controlla i ban attivi
sudo fail2ban-client status sshd
```

---

## 3. Setup Docker e Docker Compose

> **Perché Docker solo per i tile server e non per GraphHopper?**
>
> GraphHopper carica l'intero graph in memoria durante il serving delle richieste. Per Europa completa, questo significa **12-14 GB di RAM costantemente allocati**. Un container Docker aggiunge overhead di memoria e latenza I/O durante l'accesso ai file del graph cache. Eseguire GraphHopper direttamente sulla JVM del host elimina questo overhead e garantisce accesso diretto alla memoria senza layer di virtualizzazione.
>
> TileServer GL, invece, ha un footprint di memoria molto più piccolo e beneficia dell'isolamento Docker senza penalità significative.

### 3.1 Installazione Docker

```bash
# Rimuovi eventuali versioni vecchie
sudo apt remove -y docker docker-engine docker.io containerd runc

# Aggiungi repository Docker ufficiale
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Aggiungi l'utente corrente al gruppo docker (evita sudo ogni volta)
sudo usermod -aG docker $USER

# Applica il cambio di gruppo senza logout
newgrp docker

# Verifica installazione
docker --version
docker compose version
```

### 3.2 Test installazione Docker

```bash
docker run --rm hello-world
# Output atteso: "Hello from Docker!"
```

---

## 4. GraphHopper — Installazione e Configurazione

### 4.1 Struttura directory

```bash
# Crea la struttura di directory per GraphHopper
sudo mkdir -p /opt/graphhopper/{data,graph-cache,config,custom-models,logs}
sudo chown -R bikerlink:bikerlink /opt/graphhopper
```

```
/opt/graphhopper/
├── graphhopper-web-9.1.jar     # JAR principale
├── data/                       # File OSM (.pbf)
│   ├── nord-est-latest.osm.pbf # Dataset piccolo per test
│   └── full-coverage.osm.pbf   # Dataset produzione (dopo merge)
├── graph-cache/                # Graph precompilato (generato da GH)
├── config/
│   ├── config-test.yml         # Config per dataset piccolo (test)
│   └── config-prod.yml         # Config per dataset completo (prod)
├── custom-models/
│   └── motorcycle_curvy.json   # Profilo curvy custom
└── logs/
    └── graphhopper.log
```

### 4.2 Download GraphHopper JAR

```bash
cd /opt/graphhopper

wget https://repo1.maven.org/maven2/com/graphhopper/graphhopper-web/9.1/graphhopper-web-9.1.jar

# Verifica il download
ls -lh graphhopper-web-9.1.jar
# Output atteso: ~70-80 MB
```

### 4.3 Profilo custom motorcycle_curvy

```bash
cat > /opt/graphhopper/custom-models/motorcycle_curvy.json << 'EOF'
{
  "priority": [
    { "if": "road_class == MOTORWAY",  "multiply_by": "0"   },
    { "if": "road_class == TRUNK",     "multiply_by": "0.2" },
    { "if": "road_class == PRIMARY",   "multiply_by": "0.5" },
    { "if": "road_class == SECONDARY", "multiply_by": "0.9" },
    { "if": "curvature > 0.7",         "multiply_by": "1.8" },
    { "if": "curvature > 0.4",         "multiply_by": "1.3" },
    { "if": "road_environment == TUNNEL", "multiply_by": "0.5" }
  ],
  "speed": [
    { "if": "road_class == MOTORWAY", "limit_to": "0" }
  ]
}
EOF
```

### 4.4 File di configurazione — Test (Nord-Est Italia)

```bash
cat > /opt/graphhopper/config/config-test.yml << 'EOF'
graphhopper:
  datareader.file: /opt/graphhopper/data/nord-est-latest.osm.pbf
  graph.location: /opt/graphhopper/graph-cache/test

  profiles:
    - name: motorcycle_curvy
      custom_model_files: [/opt/graphhopper/custom-models/motorcycle_curvy.json]

  profiles_lm:
    - profile: motorcycle_curvy
      maximum_lm_weight: 10000

  profiles_ch:
    - profile: motorcycle_curvy

  import.osm.ignored_highways: footway, cycleway, steps, path, pedestrian

server:
  application_connectors:
    - type: http
      port: 8989
      bind_host: 0.0.0.0
  request_log:
    appenders: []

logging:
  level: INFO
  appenders:
    - type: file
      current_log_filename: /opt/graphhopper/logs/graphhopper.log
      archive: true
      max_file_size: 50MB
      max_history: 5
EOF
```

### 4.5 File di configurazione — Produzione (Europa + Nord Africa)

```bash
cat > /opt/graphhopper/config/config-prod.yml << 'EOF'
graphhopper:
  datareader.file: /opt/graphhopper/data/full-coverage.osm.pbf
  graph.location: /opt/graphhopper/graph-cache/prod

  profiles:
    - name: motorcycle_curvy
      custom_model_files: [/opt/graphhopper/custom-models/motorcycle_curvy.json]
    - name: motorcycle_fast
      vehicle: motorcycle
      weighting: fastest

  profiles_lm:
    - profile: motorcycle_curvy
      maximum_lm_weight: 10000
    - profile: motorcycle_fast

  profiles_ch:
    - profile: motorcycle_curvy
    - profile: motorcycle_fast

  import.osm.ignored_highways: footway, cycleway, steps, path, pedestrian

server:
  application_connectors:
    - type: http
      port: 8989
      bind_host: 127.0.0.1   # Solo localhost in prod — Nginx fa da proxy
  request_log:
    appenders: []

logging:
  level: INFO
  appenders:
    - type: file
      current_log_filename: /opt/graphhopper/logs/graphhopper.log
      archive: true
      max_file_size: 100MB
      max_history: 10
EOF
```

---

## 5. Download Dati OSM e Import Completo

> **Strategia:** testa sempre su un dataset piccolo prima di lanciare l'import Europa completo (12-24 ore non interrompibili).

### 5.1 Step 1 — Test con dataset Nord-Est Italia (~100 MB)

```bash
cd /opt/graphhopper/data

# Scarica dataset Veneto/Nord-Est (piccolo, import in ~5 minuti)
wget https://download.geofabrik.de/europe/italy/nord-est-latest.osm.pbf

# Avvia GraphHopper in modalità server con dataset piccolo
# -Xmx4g = max 4 GB RAM per il test
java -Xmx4g -Xms512m \
  -jar /opt/graphhopper/graphhopper-web-9.1.jar \
  server /opt/graphhopper/config/config-test.yml
```

**Verifica che funzioni:**

```bash
# In un altro terminale (o tmux pane), testa un percorso curvy in Veneto
curl -s "http://localhost:8989/route?\
point=45.4,12.3&\
point=45.8,11.6&\
profile=motorcycle_curvy&\
instructions=false" | python3 -m json.tool | grep -E '"distance"|"time"'

# Output atteso:
# "distance": 85234.5,
# "time": 4521000,
```

Testa 3-4 percorsi in zone curvy note (Dolomiti, Prealpi Venete). **Solo se i risultati sono soddisfacenti**, procedi allo Step 2.

### 5.2 Step 2 — Download dataset per regione

> **Nota:** BikerLink usa 8 regioni GraphHopper separate (grecia, balcani, est-europa, iberia, arco-alpino, germania-centro, francia-benelux, ecuador). Lo script `download-regions.sh` scarica i PBF corretti per ogni regione.

```bash
cd infra/self-host

# Scarica tutti i PBF per-regione in ./data (idempotente, riprende se interrotto)
bash download-regions.sh

# Verifica i file scaricati
ls -lh data/*.osm.pbf
```

### 5.3 Build tile per regione

Ogni container GraphHopper legge il proprio PBF dalla cartella `./data`. Al primo avvio il build avviene automaticamente. Per forzare un rebuild:

```bash
# Rebuild di una singola regione (es. arco-alpino)
docker compose restart graphhopper-arco-alpino

# Verifica stato
docker compose logs -f graphhopper-arco-alpino
```

### 5.4 Import completo (processo lungo — usare screen o tmux)

```bash
# Apri sessione screen dedicata all'import
screen -S graphhopper-import

# L'import richiede 12-24 ore su CPX41
# -Xmx14g = 14 GB RAM per GraphHopper (lascia 2 GB al sistema su CPX41 con 16 GB)
java -Xmx14g -Xms2g \
  -jar /opt/graphhopper/graphhopper-web-9.1.jar \
  import /opt/graphhopper/config/config-prod.yml

# Stacca con Ctrl+A poi D
# Monitora il progresso con: screen -r graphhopper-import

# Oppure monitora il log:
# tail -f /opt/graphhopper/logs/graphhopper.log
```

**Segnali che l'import è completato:**

```
# Nel log appare:
# [main] INFO  com.graphhopper.GraphHopper - Finished in 54321s
# La directory graph-cache/prod/ si popola con file .ghz, edges, nodes, ecc.
```

**Dopo l'import, avvia il server:**

```bash
java -Xmx14g -Xms2g \
  -jar /opt/graphhopper/graphhopper-web-9.1.jar \
  server /opt/graphhopper/config/config-prod.yml
```

### 5.5 Comandi API di riferimento

```bash
# Route curvy da A a B con dettagli
curl "http://localhost:8989/route?\
point=45.4,12.3&\
point=45.8,11.6&\
profile=motorcycle_curvy&\
instructions=true&\
elevation=true&\
details=surface,curvature,road_class"

# Round trip circolare (partenza + raggio in km)
curl "http://localhost:8989/route?\
point=45.4,12.3&\
profile=motorcycle_curvy&\
algorithm=round_trip&\
round_trip.distance=150000&\
round_trip.seed=42"

# Genera variante diversa del round trip cambiando seed
curl "http://localhost:8989/route?\
point=45.4,12.3&\
profile=motorcycle_curvy&\
algorithm=round_trip&\
round_trip.distance=150000&\
round_trip.seed=73"
```

---

## 6. Tile Server Vettoriale (TileServer GL)

> **Cosa fornisce:** tile vettoriali compatibili con MapLibre GL JS (il successore moderno di Leaflet per mappe vettoriali). Fornisce strade, building, label — tutto dentro tile compatte in formato `.pbf`, disegnate lato client.

### 6.1 Struttura directory

```bash
sudo mkdir -p /opt/tileserver/{data,config,styles}
sudo chown -R bikerlink:bikerlink /opt/tileserver
```

### 6.2 Download file MBTiles

I file `.mbtiles` contengono tutte le tile pre-generate per una regione. Scaricali da [openmaptiles.org](https://openmaptiles.org/downloads/) (richiede registrazione gratuita) o da mirrors alternativi:

```bash
cd /opt/tileserver/data

# Europa — Italia (più leggero, per iniziare)
# Dimensione: ~1.5 GB
wget -O italy.mbtiles \
  "https://data.maptiler.com/downloads/europe/italy/?viamaptiler=1"

# Europa completa (attenzione: ~50 GB)
# Scarica per regioni se lo storage è limitato
# wget -O europe.mbtiles "https://..."

# Alternativa gratuita: usare planettiler per generare i tiles da OSM
# (più complesso, vedi sezione 6.5)
```

### 6.3 File di configurazione TileServer GL

```bash
cat > /opt/tileserver/config/config.json << 'EOF'
{
  "options": {
    "paths": {
      "root": "/data",
      "fonts": "fonts",
      "sprites": "sprites",
      "styles": "styles",
      "mbtiles": ""
    }
  },
  "styles": {
    "basic": {
      "style": "styles/basic.json",
      "tilejson": {
        "bounds": [-180, -85.05112877980659, 180, 85.05112877980659]
      }
    }
  },
  "data": {
    "openmaptiles": {
      "mbtiles": "italy.mbtiles"
    }
  }
}
EOF
```

### 6.4 Docker Compose per TileServer GL

```bash
cat > /opt/tileserver/docker-compose.yml << 'EOF'
version: "3.8"

services:
  tileserver:
    image: maptiler/tileserver-gl:latest
    container_name: tileserver-gl
    restart: unless-stopped
    volumes:
      - /opt/tileserver/data:/data:ro
      - /opt/tileserver/config:/config:ro
    ports:
      - "127.0.0.1:8080:8080"    # Solo localhost — Nginx fa da proxy
    command: ["--config", "/config/config.json", "--port", "8080"]
    environment:
      - NODE_ENV=production

networks:
  default:
    name: bikerlink-network
EOF
```

### 6.5 Avvio TileServer GL

```bash
cd /opt/tileserver

# Prima esecuzione: scarica l'immagine Docker
docker compose pull

# Avvio in background
docker compose up -d

# Verifica che sia in esecuzione
docker compose ps
docker compose logs -f tileserver

# Test diretto (prima di configurare Nginx)
curl -s http://localhost:8080/ | head -20
```

**Verifica nel browser:** apri `http://<IP_SERVER>:8080` (deve essere aperta la porta nel firewall per il test).

### 6.6 Generazione MBTiles da OSM con planetiler (alternativa gratuita)

Se non vuoi acquistare i MBTiles pre-generati:

```bash
# Scarica planetiler
wget https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar

# Genera MBTiles per l'Italia dal file OSM già scaricato
# Richiede ~4-6 GB RAM e ~30 minuti per l'Italia
java -Xmx6g -jar planetiler.jar \
  --area=italy \
  --download \
  --output=/opt/tileserver/data/italy.mbtiles

# Per Europa completa (richiede ~32 GB RAM e 8-12 ore)
java -Xmx28g -jar planetiler.jar \
  --osm-path=/opt/graphhopper/data/full-coverage.osm.pbf \
  --output=/opt/tileserver/data/europe.mbtiles
```

---

## 7. Tile Server Raster Fallback (mod_tile)

> **Quando usarlo:** se vuoi mantenere la compatibilità con l'attuale implementazione Leaflet nell'app BikerLink mentre la migrazione a MapLibre è in corso. Le tile raster sono PNG pre-renderizzati, compatibili con qualsiasi mappa Leaflet esistente senza modifiche al codice.
>
> **Questa sezione è opzionale.** Se stai già migrando a MapLibre, usa solo TileServer GL (Sezione 6).

### 7.1 Installazione stack raster (Ubuntu 24.04)

```bash
sudo apt install -y \
  apache2 \
  libapache2-mod-tile \
  renderd \
  mapnik-utils \
  python3-mapnik \
  fonts-dejavu \
  fonts-noto-cjk \
  fonts-noto-hinted \
  ttf-unifont

sudo a2enmod tile
```

### 7.2 Download stile OpenStreetMap Carto

```bash
cd /opt
sudo git clone https://github.com/gravitystorm/openstreetmap-carto.git
sudo chown -R bikerlink:bikerlink /opt/openstreetmap-carto

cd /opt/openstreetmap-carto
pip3 install pyaml requests
python3 scripts/get-shapefiles.py  # Scarica shapefile richiesti (~1-2 GB)
```

### 7.3 Importazione dati OSM in PostgreSQL per Mapnik

```bash
# Installa osm2pgsql per importare OSM in PostgreSQL
sudo apt install -y osm2pgsql postgresql-14-postgis-3

# Crea database per le tile
sudo -u postgres createdb gis
sudo -u postgres psql gis -c "CREATE EXTENSION postgis; CREATE EXTENSION hstore;"
sudo -u postgres psql gis -c "GRANT ALL ON DATABASE gis TO bikerlink;"

# Import dati OSM (per Italia: ~30 minuti)
osm2pgsql \
  --database gis \
  --username bikerlink \
  --host localhost \
  --slim \
  --drop \
  --number-processes 4 \
  --tag-transform-script /opt/openstreetmap-carto/openstreetmap-carto.lua \
  --style /opt/openstreetmap-carto/openstreetmap-carto.style \
  /opt/graphhopper/data/nord-est-latest.osm.pbf
```

### 7.4 Configurazione renderd e mod_tile

```bash
# Configurazione renderd
sudo cat > /etc/renderd.conf << 'EOF'
[renderd]
num_threads=4
tile_dir=/var/cache/renderd/tiles
stats_file=/var/run/renderd/renderd.stats

[mapnik]
plugins_dir=/usr/lib/mapnik/3.1/input
font_dir=/usr/share/fonts/truetype
font_dir_recurse=true

[default]
URI=/tile/
TILEDIR=/var/cache/renderd/tiles
XML=/opt/openstreetmap-carto/mapnik.xml
HOST=localhost
TILESIZE=256
MAXZOOM=18
EOF

sudo mkdir -p /var/cache/renderd/tiles
sudo chown -R www-data:www-data /var/cache/renderd

# Avvia renderd
sudo systemctl start renderd
sudo systemctl enable renderd
```

### 7.5 Virtual host Apache per le tile raster

```bash
sudo cat > /etc/apache2/sites-available/tiles-raster.conf << 'EOF'
<VirtualHost *:8082>
    ServerName tiles-raster.bikerlink.app

    LoadTileConfigFile /etc/renderd.conf
    AddTileConfig /tile/ default

    ModTileTileDir /var/cache/renderd/tiles
    ModTileEnableTileThrottling Off
    ModTileRequestTimeout 0
    ModTileMissingRequestTimeout 30
    ModTileMaxLoadOld 16
    ModTileMaxLoadMissing 50

    ErrorLog ${APACHE_LOG_DIR}/tiles-error.log
    CustomLog ${APACHE_LOG_DIR}/tiles-access.log combined
</VirtualHost>
EOF

sudo a2ensite tiles-raster
sudo systemctl reload apache2
```

**URL tile raster risultante:** `http://localhost:8082/tile/{z}/{x}/{y}.png`

---

## 8. Backup Automatico PostgreSQL + Object Storage

### 8.1 Script di backup

```bash
sudo mkdir -p /opt/backup/scripts /opt/backup/dumps
sudo chown -R bikerlink:bikerlink /opt/backup

cat > /opt/backup/scripts/backup-postgres.sh << 'SCRIPT'
#!/bin/bash
# BikerLink — Backup automatico PostgreSQL
# Eseguito da cron ogni notte alle 03:00

set -euo pipefail

# ---- CONFIGURAZIONE ----
DB_NAME="${BACKUP_DB_NAME:-bikerlink}"
DB_USER="${BACKUP_DB_USER:-postgres}"
DB_HOST="${BACKUP_DB_HOST:-localhost}"
BACKUP_DIR="/opt/backup/dumps"
RETENTION_DAYS=7
LOG_FILE="/opt/backup/scripts/backup.log"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/bikerlink_${TIMESTAMP}.sql.gz"

# ---- FUNZIONI ----
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# ---- BACKUP ----
log "Inizio backup database ${DB_NAME}"

# Dump compresso con gzip
pg_dump \
  -h "$DB_HOST" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --verbose \
  --format=custom \
  --compress=9 \
  -f "${BACKUP_FILE%.gz}.dump" 2>> "$LOG_FILE"

# Comprimi ulteriormente se preferisci formato SQL plain
# pg_dump -h "$DB_HOST" -U "$DB_USER" "$DB_NAME" | gzip -9 > "$BACKUP_FILE"

log "Dump locale completato: ${BACKUP_FILE%.gz}.dump"

# ---- ROTAZIONE LOCALE ----
log "Rimozione dump più vecchi di ${RETENTION_DAYS} giorni"
find "$BACKUP_DIR" -name "bikerlink_*.dump" -mtime +"$RETENTION_DAYS" -delete

# ---- UPLOAD SU OBJECT STORAGE ----
log "Upload su object storage con rclone"

# rclone deve essere configurato: esegui 'rclone config' per setup
# Supporta: S3, GCS, R2 (Cloudflare), Backblaze B2, e molti altri
rclone copy \
  "${BACKUP_FILE%.gz}.dump" \
  "bikerlink-backup:backups/postgres/" \
  --progress \
  2>> "$LOG_FILE"

if [ $? -eq 0 ]; then
  log "Upload completato con successo"
else
  log "ERRORE: upload fallito — controlla la configurazione rclone"
  exit 1
fi

# Mantieni solo gli ultimi 30 giorni su object storage
rclone delete \
  "bikerlink-backup:backups/postgres/" \
  --min-age 30d \
  2>> "$LOG_FILE"

log "Backup completato"
SCRIPT

chmod +x /opt/backup/scripts/backup-postgres.sh
```

### 8.2 Configurazione rclone per l'upload

```bash
# Configura rclone in modalità interattiva
rclone config

# Segui il wizard:
# n = New remote
# Name: bikerlink-backup
# Type: scegli il tuo provider (es. 4 per S3, 12 per Google Cloud Storage,
#        11 per Cloudflare R2, 6 per Backblaze B2)
# Inserisci le credenziali del tuo provider

# Test della configurazione
rclone lsd bikerlink-backup:
```

**Configurazione rclone per un bucket S3 generico (es. Cloudflare R2):**

```ini
# ~/.config/rclone/rclone.conf
[bikerlink-backup]
type = s3
provider = Cloudflare
access_key_id = YOUR_ACCESS_KEY
secret_access_key = YOUR_SECRET_KEY
endpoint = https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
acl = private
```

### 8.3 Scheduling con cron

```bash
# Aggiungi il cron job per l'utente bikerlink
crontab -e

# Aggiungi questa riga:
# Backup ogni notte alle 03:00
0 3 * * * /opt/backup/scripts/backup-postgres.sh >> /opt/backup/scripts/cron.log 2>&1
```

### 8.4 Procedura di restore step-by-step

```bash
# ---- RESTORE DA FILE LOCALE ----

# 1. Identifica il dump da ripristinare
ls -lht /opt/backup/dumps/ | head -10

# 2. Crea il database di destinazione (se non esiste)
sudo -u postgres createdb bikerlink_restore

# 3. Esegui il restore
pg_restore \
  -h localhost \
  -U postgres \
  -d bikerlink_restore \
  --verbose \
  /opt/backup/dumps/bikerlink_20250101_030000.dump

# 4. Verifica l'integrità del restore
psql -h localhost -U postgres -d bikerlink_restore \
  -c "SELECT COUNT(*) FROM users;"

# 5. Se tutto ok, swappa il database (opzionale — in produzione pianifica una maintenance window)
# sudo -u postgres psql -c "ALTER DATABASE bikerlink RENAME TO bikerlink_old;"
# sudo -u postgres psql -c "ALTER DATABASE bikerlink_restore RENAME TO bikerlink;"

# ---- RESTORE DA OBJECT STORAGE ----

# Scarica l'ultimo backup disponibile
rclone copy \
  "bikerlink-backup:backups/postgres/bikerlink_20250101_030000.dump" \
  /opt/backup/dumps/

# Poi segui la procedura locale sopra
```

### 8.5 Backup object storage (file utente)

```bash
cat > /opt/backup/scripts/backup-objectstorage.sh << 'SCRIPT'
#!/bin/bash
# Backup dei file su object storage (avatar, foto, documenti utenti)
set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="/opt/backup/scripts/backup-objects.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Inizio sync object storage"

# Sync bidirezionale (Replit Object Storage → backup offsite)
# Modifica la sorgente in base al tuo provider
rclone sync \
  "bikerlink-prod:public/" \
  "bikerlink-backup:backups/objects/public/" \
  --progress \
  2>> "$LOG_FILE"

rclone sync \
  "bikerlink-prod:.private/" \
  "bikerlink-backup:backups/objects/private/" \
  --progress \
  2>> "$LOG_FILE"

log "Sync object storage completato"
SCRIPT

chmod +x /opt/backup/scripts/backup-objectstorage.sh

# Aggiungi al cron (esegui 1 volta al giorno alle 04:00)
# 0 4 * * * /opt/backup/scripts/backup-objectstorage.sh >> /opt/backup/scripts/cron-objects.log 2>&1
```

---

## 9. Nginx Reverse Proxy + HTTPS (Let's Encrypt)

> **Prerequisiti:** i tuoi domini DNS devono già puntare all'IP del server prima di procedere.
> - `gh.bikerlink.app` → IP server
> - `tiles.bikerlink.app` → IP server
>
> **Flusso corretto:** prima si creano i vhost HTTP-only, poi si avvia Nginx, poi Certbot ottiene i certificati e modifica automaticamente i vhost aggiungendo il blocco SSL. Non creare mai manualmente i blocchi `listen 443 ssl` prima che Certbot abbia emesso i certificati.

### 9.1 Step 1 — Configurazioni Nginx HTTP-only (prima di Certbot)

Crea prima i vhost HTTP-only. Certbot li modificherà in automatico aggiungendo SSL.

```bash
# GraphHopper — vhost HTTP iniziale
sudo tee /etc/nginx/sites-available/graphhopper.conf > /dev/null << 'EOF'
server {
    listen 80;
    server_name gh.bikerlink.app;

    access_log /var/log/nginx/graphhopper-access.log;
    error_log /var/log/nginx/graphhopper-error.log;

    # CORS per l'app BikerLink
    add_header Access-Control-Allow-Origin "https://bikerlink.app" always;
    add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;

    location / {
        proxy_pass http://127.0.0.1:8989;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
        gzip on;
        gzip_types application/json;
    }
}
EOF

# TileServer GL — vhost HTTP iniziale
sudo tee /etc/nginx/sites-available/tileserver.conf > /dev/null << 'EOF'
server {
    listen 80;
    server_name tiles.bikerlink.app;

    access_log /var/log/nginx/tileserver-access.log;
    error_log /var/log/nginx/tileserver-error.log;

    add_header Cache-Control "public, max-age=86400, stale-while-revalidate=3600" always;
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET, OPTIONS" always;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
```

### 9.2 Step 2 — Attiva i siti e avvia Nginx

```bash
# Attiva le configurazioni
sudo ln -sf /etc/nginx/sites-available/graphhopper.conf /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/tileserver.conf /etc/nginx/sites-enabled/

# Rimuovi il default se presente
sudo rm -f /etc/nginx/sites-enabled/default

# Verifica la sintassi
sudo nginx -t
# Output atteso: nginx: configuration file /etc/nginx/nginx.conf test is successful

# Avvia (o ricarica) Nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# Verifica che risponda su HTTP prima di procedere con HTTPS
curl -s -o /dev/null -w "%{http_code}" http://gh.bikerlink.app/health
# Atteso: 200 (o 502 se GraphHopper non è ancora avviato — entrambi significano che Nginx risponde)
```

### 9.3 Step 3 — Ottieni i certificati HTTPS con Certbot

Certbot usa il server HTTP appena attivato per validare il dominio (challenge HTTP-01), poi modifica automaticamente i vhost aggiungendo i blocchi SSL e il redirect HTTP → HTTPS.

```bash
# Ottieni certificati per entrambi i domini in un solo comando
sudo certbot --nginx \
  -d gh.bikerlink.app \
  -d tiles.bikerlink.app \
  --email admin@bikerlink.app \
  --agree-tos \
  --non-interactive \
  --redirect

# Output atteso al termine:
# Congratulations! ...
# Certificate is saved at: /etc/letsencrypt/live/gh.bikerlink.app/fullchain.pem
# ...
# HTTPS enabled for gh.bikerlink.app
# HTTPS enabled for tiles.bikerlink.app

# Verifica rinnovo automatico (Certbot installa un timer systemd di default)
sudo certbot renew --dry-run
# Output atteso: Congratulations, all simulated renewals succeeded
```

Dopo questo step, i file `/etc/nginx/sites-available/graphhopper.conf` e `tileserver.conf` sono stati modificati da Certbot e ora contengono anche il blocco `listen 443 ssl`.

### 9.4 Step 4 — Aggiungi CORS e headers post-HTTPS (opzionale ma raccomandato)

Dopo che Certbot ha aggiunto SSL, aggiungi gli header di sicurezza nel blocco `server { listen 443 ssl; ... }` che Certbot ha generato:

```bash
# Verifica la configurazione finale generata da Certbot
sudo nginx -t && sudo systemctl reload nginx

# Test HTTPS
curl -s -o /dev/null -w "%{http_code}" https://gh.bikerlink.app/health
# Atteso: 200

# Test redirect HTTP → HTTPS
curl -s -o /dev/null -w "%{http_code}\n" -L http://gh.bikerlink.app/
# Atteso: 200 (dopo redirect 301)
```

### 9.5 Cache Nginx per le tile (opzionale, performance)

Aggiunge una cache disco in Nginx per ridurre le richieste passanti a TileServer GL:

```bash
# Crea directory cache
sudo mkdir -p /var/cache/nginx/tiles
sudo chown www-data:www-data /var/cache/nginx/tiles

# Aggiungi nel blocco http{} di /etc/nginx/nginx.conf (prima del blocco include):
#
# proxy_cache_path /var/cache/nginx/tiles levels=1:2
#     keys_zone=tiles_cache:10m max_size=10g inactive=24h use_temp_path=off;
#
# Poi nel location {} del vhost tileserver, aggiungi:
# proxy_cache tiles_cache;
# proxy_cache_valid 200 24h;
# proxy_cache_valid 404 1m;

sudo nginx -t && sudo systemctl reload nginx
```

---

## 10. Systemd Services — Avvio Automatico

> I servizi systemd garantiscono che GraphHopper e TileServer GL si riavviino automaticamente dopo un reboot del server o in caso di crash.

### 10.1 Systemd service per GraphHopper

```bash
sudo cat > /etc/systemd/system/graphhopper.service << 'EOF'
[Unit]
Description=GraphHopper Routing Engine — BikerLink
Documentation=https://github.com/graphhopper/graphhopper
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=bikerlink
Group=bikerlink
WorkingDirectory=/opt/graphhopper

# Usa il dataset di produzione
ExecStart=/usr/bin/java \
  -Xmx14g \
  -Xms2g \
  -Djava.awt.headless=true \
  -Dfile.encoding=UTF-8 \
  -jar /opt/graphhopper/graphhopper-web-9.1.jar \
  server /opt/graphhopper/config/config-prod.yml

# Riavvio automatico in caso di crash
Restart=always
RestartSec=30s
StartLimitInterval=0

# Log su journald
StandardOutput=journal
StandardError=journal
SyslogIdentifier=graphhopper

# Limiti di risorse
LimitNOFILE=65535
LimitNPROC=4096

# Timeout avvio generoso (GraphHopper carica il graph in RAM all'avvio)
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF
```

### 10.2 Systemd service per TileServer GL (via Docker Compose)

```bash
sudo cat > /etc/systemd/system/tileserver.service << 'EOF'
[Unit]
Description=TileServer GL — BikerLink Maps
Documentation=https://github.com/maptiler/tileserver-gl
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=bikerlink
Group=bikerlink
WorkingDirectory=/opt/tileserver

ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down

Restart=on-failure
RestartSec=10s

StandardOutput=journal
StandardError=journal
SyslogIdentifier=tileserver

[Install]
WantedBy=multi-user.target
EOF
```

### 10.3 Attivazione dei servizi

```bash
# Ricarica la configurazione systemd
sudo systemctl daemon-reload

# Abilita avvio automatico al boot
sudo systemctl enable graphhopper
sudo systemctl enable tileserver
sudo systemctl enable nginx

# Avvia i servizi
sudo systemctl start tileserver    # Prima TileServer (avvio rapido)
sudo systemctl start graphhopper   # Poi GraphHopper (avvio lento — carica graph)

# Verifica stato
sudo systemctl status graphhopper
sudo systemctl status tileserver
sudo systemctl status nginx
```

### 10.4 Comandi di gestione utili

```bash
# Visualizza log in tempo reale
journalctl -u graphhopper -f
journalctl -u tileserver -f

# Riavvia un servizio
sudo systemctl restart graphhopper

# Controlla quanto tempo impiega GraphHopper ad avviarsi
journalctl -u graphhopper --since "5 minutes ago" | grep -E "started|ready|listening"

# Vedi quanta RAM usa GraphHopper
ps aux | grep graphhopper
# oppure
sudo systemctl show graphhopper | grep MemoryCurrent
```

---

## 11. Checklist Verifica Finale

Esegui tutti questi test dopo il setup completo. Un ✅ per ogni voce = server pronto per la produzione.

### 11.1 GraphHopper API

```bash
# Test 1: Health check base
curl -s https://gh.bikerlink.app/health
# Atteso: {"status":"UP"}

# Test 2: Route curvy Nord-Est Italia
curl -s "https://gh.bikerlink.app/route?\
point=45.4374,12.3346&\
point=46.0661,11.1218&\
profile=motorcycle_curvy" \
| python3 -c "import sys,json; r=json.load(sys.stdin); print(f'Distanza: {r[\"paths\"][0][\"distance\"]/1000:.1f} km')"
# Atteso: Distanza: XX.X km (un numero ragionevole)

# Test 3: Round trip circolare
curl -s "https://gh.bikerlink.app/route?\
point=45.4374,12.3346&\
profile=motorcycle_curvy&\
algorithm=round_trip&\
round_trip.distance=100000&\
round_trip.seed=1" \
| python3 -c "import sys,json; r=json.load(sys.stdin); print('Round trip OK:', r['paths'][0]['distance']/1000, 'km')"

# Test 4: Verifica profilo motorcycle_curvy disponibile
curl -s https://gh.bikerlink.app/info \
| python3 -c "import sys,json; r=json.load(sys.stdin); print([p['name'] for p in r.get('profiles',[])])"
# Atteso: ['motorcycle_curvy'] (o simile)
```

### 11.2 TileServer GL

```bash
# Test 5: TileServer risponde
curl -s https://tiles.bikerlink.app/health
# Atteso: {"status":"OK"} o simile

# Test 6: Tile specifica caricata (tile di Milano, zoom 10)
curl -sI "https://tiles.bikerlink.app/data/openmaptiles/10/535/370.pbf"
# Atteso: HTTP/2 200, Content-Type: application/x-protobuf

# Test 7: Stile disponibile
curl -s https://tiles.bikerlink.app/styles/basic/style.json | python3 -c \
"import sys,json; r=json.load(sys.stdin); print('Style OK:', r.get('name','?'))"
```

### 11.3 HTTPS e Certificati

```bash
# Test 8: HTTPS funzionante su GraphHopper
curl -sI https://gh.bikerlink.app/health | head -5
# Atteso: HTTP/2 200

# Test 9: Redirect HTTP → HTTPS
curl -sI http://gh.bikerlink.app/health | grep -i location
# Atteso: Location: https://gh.bikerlink.app/health

# Test 10: Certificato valido e non scaduto
echo | openssl s_client -connect gh.bikerlink.app:443 -servername gh.bikerlink.app 2>/dev/null \
| openssl x509 -noout -dates
# Atteso: notAfter= una data futura di almeno 60 giorni

# Test 11: Stesso per tiles
echo | openssl s_client -connect tiles.bikerlink.app:443 -servername tiles.bikerlink.app 2>/dev/null \
| openssl x509 -noout -dates
```

### 11.4 Backup PostgreSQL

```bash
# Test 12: Esegui un backup manuale e verifica
/opt/backup/scripts/backup-postgres.sh

# Verifica che il file dump esista
ls -lh /opt/backup/dumps/
# Atteso: un file bikerlink_TIMESTAMP.dump di dimensione > 0

# Test 13: Verifica upload su object storage
rclone ls bikerlink-backup:backups/postgres/
# Atteso: il file appena caricato

# Test 14: Test restore su database temporaneo
sudo -u postgres createdb bikerlink_test_restore
pg_restore \
  -h localhost -U postgres \
  -d bikerlink_test_restore \
  /opt/backup/dumps/$(ls -t /opt/backup/dumps/ | head -1)
# Verifica tabelle
psql -U postgres -d bikerlink_test_restore -c "\dt"
# Cleanup
sudo -u postgres dropdb bikerlink_test_restore
```

### 11.5 Avvio automatico dopo reboot

```bash
# Test 15: Simula un reboot (senza reboot effettivo)
sudo systemctl stop graphhopper tileserver nginx
sleep 5
sudo systemctl start nginx tileserver graphhopper
sleep 10  # attendi che GraphHopper carichi il graph

# Verifica che tutti e tre siano up
sudo systemctl is-active graphhopper tileserver nginx
# Atteso: active / active / active

# Test 16: Verifica che i servizi siano abilitati al boot
sudo systemctl is-enabled graphhopper tileserver nginx
# Atteso: enabled / enabled / enabled
```

### 11.6 Riepilogo finale

| # | Test | Comando rapido | Atteso |
|---|---|---|---|
| 1 | GraphHopper health | `curl https://gh.bikerlink.app/health` | `{"status":"UP"}` |
| 2 | Route A→B curvy | `curl "https://gh.bikerlink.app/route?..."` | JSON con `paths[0].distance` |
| 3 | Round trip | `curl "...algorithm=round_trip..."` | JSON con percorso circolare |
| 4 | Tile servita | `curl -I "https://tiles.bikerlink.app/data/openmaptiles/10/535/370.pbf"` | HTTP 200 |
| 5 | HTTPS valido | `openssl s_client -connect gh.bikerlink.app:443` | Cert valido |
| 6 | Redirect HTTP | `curl -I http://gh.bikerlink.app` | 301 → HTTPS |
| 7 | Backup locale | `ls /opt/backup/dumps/` | File .dump presente |
| 8 | Backup remoto | `rclone ls bikerlink-backup:backups/postgres/` | File visibile |
| 9 | Restore funziona | `pg_restore ...` su DB temporaneo | Nessun errore, tabelle presenti |
| 10 | Servizi al boot | `systemctl is-enabled graphhopper tileserver nginx` | `enabled` tutti e tre |

---

*Documento creato per BikerLink — Self-Hosting Infrastructure*
*Ultima revisione: Maggio 2025*
