# BikerLink — Self-Host Stack (PC di casa)

Setup completo per ospitare in casa tutti i servizi self-hostabili di BikerLink:
**PostgreSQL + PostGIS, Redis, 7 istanze GraphHopper (una per gruppo-area), Valhalla, pgAdmin**.
Lo stack scarica i dati OpenStreetMap per ciascun gruppo di nazioni, costruisce i grafi
per area e genera un `.env.local` precompilato con tutti gli URL locali.

> **Cosa NON è incluso (resta cloud):** servizi AI (Anthropic, OpenAI, Gemini),
> Mapbox tiles, TomTom, Last.fm, Expo Push. Non sono self-hostabili senza GPU/licenze
> dedicate. Le relative variabili restano `<INSERIRE>` nel template.

---

## Sistema operativo supportato

| Distro | Versioni testate | Note |
|--------|-----------------|------|
| **Ubuntu Server** | 22.04 LTS (Jammy), **24.04 LTS (Noble)** | versione raccomandata |
| **Debian** | 11 (Bullseye), **12 (Bookworm)** | testato su Debian 12 |

Lo script richiede accesso diretto (monitor + tastiera) oppure SSH con sudo.
Usa `apt` e `systemd`; non funziona su distribuzioni non-Debian (CentOS, Arch, ecc.).

Gli script rilevano automaticamente la distro da `/etc/os-release` e configurano
il repository Docker corretto (`download.docker.com/linux/ubuntu` o `.../debian`).

## Requisiti hardware

| Risorsa | Minimo | Raccomandato |
|---------|--------|--------------|
| RAM     | **16 GB + swap 32–48 GB** (vedi nota) | 32 GB+       |
| Disco   | 150 GB SSD | 300 GB SSD (NVMe) |
| CPU     | 4 core | 8 core       |
| Rete    | — | connessione veloce per il download dei .pbf per area |

Lo spazio serve per: .pbf nazionali (~15 GB per i 4 gruppi core) + .pbf per-gruppo
(~8 GB) + grafi GraphHopper (~6-25 GB per gruppo, ~50 GB totale 4 core) +
tile Valhalla (~25 GB) + DB/varie.

> **Build Valhalla Europa su 16 GB (PC fisso i5-14400):** la build dei tile Europa è un
> **blocco unico** con picchi RAM **oltre i 16 GB** (parsing iniziale + `graphenhancer`).
> Su 16 GB **senza swap** il container viene ucciso dall'OOM-killer a metà build. Poiché
> Valhalla usa file memory-mapped, su **SSD** uno **swapfile da 32–48 GB** permette di
> completare la build con un rallentamento tollerabile. Crea/verifica lo swap **prima**
> della build con `thinkcentre-scripts/swap.sh` (idempotente, persistente al reboot).
> Con 32+ GB di RAM lo swap resta consigliato come rete di sicurezza ma non è critico.

## Stima tempi (prima esecuzione)

| Fase | Durata indicativa |
|------|-------------------|
| `apt` + install Docker | 5–10 min |
| Download .pbf nazionali (4 gruppi core) | 30–90 min (dipende dalla banda) |
| Merge PBF per gruppo (osmium) | 5–15 min per gruppo |
| Build grafo GraphHopper per gruppo | 20–60 min per gruppo (RAM-dipendente) |
| Build tile Valhalla (Europa) | ~3 h su 32 GB; **più lenta su 16 GB + swap** (I/O su SSD) |

> I grafi vengono buildati **in sequenza** (uno alla volta) da `setup.sh` prima
> di avviare i container. Postgres, Redis e pgAdmin partono in meno di un minuto.
> Le istanze GraphHopper-area avviano velocemente una volta che il grafo è pronto.

---

## Procedura passo-passo (dalla prima accensione)

```bash
# 1. Aggiorna il sistema
sudo apt update && sudo apt upgrade -y

# 2. Vai nella cartella dello stack (copiala sul PC se necessario)
cd infra/self-host

# 3. Rendi eseguibili gli script
chmod +x setup.sh download-regions.sh build-regions.sh update-osm.sh

# 4. Lancia il setup completo (installa Docker, scarica OSM per area, builda grafi, avvia tutto)
./setup.sh
```

`setup.sh` fa tutto in sequenza:
1. Installa i prerequisiti via `apt` (Docker Engine + plugin compose, `osmium-tool`, `python3-pyosmium`, `wget`).
2. Verifica >150 GB liberi.
3. Genera `.env` con password casuali e `.env.local` (con `DATABASE_URL` già pronto).
4. Chiede conferma e scarica i dati OSM per i gruppi core (`download-regions.sh`).
5. Builda i grafi GraphHopper per i gruppi core (`build-regions.sh`).
6. `docker compose up -d` (postgres, redis, valhalla, pgadmin) + avvia le istanze GraphHopper-area core; attende l'health di ogni servizio.
7. Stampa il riepilogo finale con URL e credenziali.

### Solo download dati (senza avviare nulla)

Se vuoi scaricare in anticipo i file dati per area:

```bash
./download-regions.sh                      # tutti e 7 i gruppi
./download-regions.sh grecia balcani       # solo alcuni gruppi
```

Scarica i singoli `.pbf` nazionali da Geofabrik (cache condivisa in `data/countries/`),
li unisce per gruppo con `osmium` e produce `data/<codice>.osm.pbf`. È idempotente,
verifica i checksum MD5 e riprende i download interrotti.

---

## Servizi e porte

### Servizi base (sempre attivi)

| Servizio | URL locale | Health/Status |
|----------|-----------|---------------|
| PostgreSQL + PostGIS | `localhost:5432` | `pg_isready` |
| Redis | `redis://localhost:6379` | `redis-cli ping` |
| Valhalla | `http://localhost:8002` | `GET /status` |
| pgAdmin 4 | `http://localhost:5050` | UI web |

Le credenziali di Postgres e pgAdmin sono generate da `setup.sh` e salvate in `.env`
(stampate anche nel riepilogo finale).

### GraphHopper — istanze multi-area (profilo `areas`)

| Codice | Porta interna | Health | Default |
|--------|---------------|--------|---------|
| `grecia` | `127.0.0.1:8990` | `GET /health` | ON |
| `balcani` | `127.0.0.1:8991` | `GET /health` | ON |
| `est` | `127.0.0.1:8992` | `GET /health` | OFF |
| `iberia` | `127.0.0.1:8993` | `GET /health` | ON |
| `arco-alpino` | `127.0.0.1:8994` | `GET /health` | ON |
| `germania-centro` | `127.0.0.1:8995` | `GET /health` | OFF |
| `francia-benelux` | `127.0.0.1:8996` | `GET /health` | OFF |
| `ecuador` | `127.0.0.1:8997` | `GET /health` | OFF |

> ⚠ Le porte sono bindate su `127.0.0.1`: **non accessibili da internet**.
> L'accesso pubblico passa SOLO dal reverse proxy nginx
> (`expose/nginx-bikerlink.conf`, location `/areas/<codice>/`).
>
> I servizi `graphhopper-*` sono sotto il profilo `areas` e **non partono**
> con un semplice `docker compose up -d`. Si gestiscono per nome:
> ```bash
> docker compose up -d graphhopper-grecia   # accendi
> docker compose stop  graphhopper-grecia   # spegni
> ```

### Nominatim 4.4 — geocoding self-hosted (profilo `nominatim`)

| Servizio | URL locale | Health | Default |
|----------|-----------|--------|---------|
| Nominatim | `http://127.0.0.1:7070` | `GET /status.php` | OFF |

Nominatim fornisce geocoding (indirizzo → coordinate) e reverse geocoding
(coordinate → indirizzo) basato su dati OSM, in alternativa al server pubblico
`nominatim.openstreetmap.org` (rate-limited).

> ⚠ Il servizio è sotto il profilo `nominatim` e **non parte** con
> `docker compose up -d`. Deve essere avviato manualmente dopo l'import iniziale.

#### Prima configurazione (ThinkCentre)

```bash
cd infra/self-host
chmod +x setup-nominatim.sh
./setup-nominatim.sh
```

Lo script:
1. Chiede quale dataset OSM importare (Italy default, ~1.7 GB PBF / ~30 GB DB / ~1-2h)
2. Salva `NOMINATIM_PBF_URL` nel `.env`
3. Avvia il container e monitora il log dell'import
4. Stampa le istruzioni per configurare `NOMINATIM_URL` e `NOMINATIM_TOKEN` nel `.env.local`

Dataset disponibili:

| Dataset | PBF | DB | Tempo |
|---------|-----|-----|-------|
| **Italia intera** (default) | ~1.7 GB | ~30 GB | 1-2h |
| Nord-Ovest Italia | ~350 MB | ~5 GB | ~15 min |
| Nord-Est Italia | ~300 MB | ~5 GB | ~15 min |

#### Avvio/stop manuale

```bash
docker compose up -d nominatim      # avvia (o riprende dopo reboot)
docker compose stop nominatim       # ferma senza perdere dati
docker compose logs -f nominatim    # monitora import e log
```

#### Variabili .env per Nominatim

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `NOMINATIM_PBF_URL` | Italy Geofabrik | URL PBF da importare alla prima esecuzione |
| `NOMINATIM_REPLICATION_URL` | Italy updates | URL aggiornamenti OSM periodici |
| `NOMINATIM_FREEZE` | `false` | Se `true` disabilita gli aggiornamenti (DB statico) |

Queste variabili si impostano nel `.env` (non in `.env.local`).

#### Variabili .env.local dell'app

Dopo l'import, aggiungi in `.env.local`:

```
NOMINATIM_URL=https://nominatim.<tuo-dominio>
NOMINATIM_TOKEN=<token-da-setup-expose.sh>
```

Il token si genera (se non esiste già) con:
```bash
cd infra/self-host/expose && ./setup-expose.sh --gen-tokens
```

## Kalman filter service (stima bias DR/GPS)

Servizio Node dedicato che stima nel tempo il **bias di velocità e heading** di
ogni utente dagli scostamenti dead-reckoning vs GPS, usando la libreria
[`kalman-filter`](https://github.com/piercus/kalman-filter). È il motore
statistico su cui il Task #47 (correzione DR/GPS) costruirà tabella di
scostamento e modulo di correzione.

| Servizio | URL locale | Health | Esposizione |
|----------|-----------|--------|-------------|
| Kalman filter | `http://127.0.0.1:9210` | `GET /health` | via `thinkcentre-agent` → `/kalman/*` |

Vive in `infra/self-host/kalman/`, gira sotto **pm2** (come il `thinkcentre-agent`)
e bind **solo su `127.0.0.1`**: NON ha una regola ingress Cloudflare dedicata.
L'accesso pubblico passa esclusivamente dal `thinkcentre-agent` (già su
`tc.biker-link.net`), che inoltra `/kalman/*` verso il servizio locale riusando
la sua autenticazione (`X-Agent-Token` + Cloudflare Access).

```bash
cd infra/self-host/kalman
npm ci --omit=dev
node test-model.js            # smoke test del modello (opzionale)
pm2 start ecosystem.config.js && pm2 save   # avvio persistente + boot
curl -s http://127.0.0.1:9210/health
```

> **Contratto dati completo (request/response di `/update` e `/state/:userId`),
> parametri del modello e comportamento di fallback:** vedi
> [`kalman/README.md`](kalman/README.md).

Lato app (backend cloud) il client è `server/services/kalman-client.ts`
(**fail-soft**: ritorna `null` se il TC è spento/irraggiungibile, senza lanciare).
Secret da impostare: `KALMAN_SERVICE_URL=https://tc.biker-link.net/kalman`
(auth via `THINKCENTRE_AGENT_TOKEN` + `CF_ACCESS_CLIENT_ID/SECRET`, già presenti).

---

## Variabili d'ambiente per l'app

`setup.sh` genera `.env.local` dal template `.env.local.template`, con già pronti:

```
GRAPHHOPPER_URL=<INSERIRE>   # URL base del reverse proxy nginx (es. https://gh.<dominio>)
VALHALLA_URL=http://localhost:8002
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/bikerlink
# ⛔ NON impostare ROUTING_DISABLED — variabile DEPRECATA/VIETATA in produzione.
# Se presente blocca il deploy (gate in scripts/deploy-build.sh) e bypassa
# il toggle admin rendendolo inoperante. Usa sempre Admin → Hub Routing → kill-switch.
```

**`GRAPHHOPPER_URL`** deve puntare alla **base del reverse proxy** che espone le 7
istanze su `/areas/<codice>/`. Il server app costruisce l'URL per-area aggiungendo
il path dell'area (es. `https://gh.bikerlink.app/areas/arco-alpino`).

Per il deploy cloud su Replit imposta `GRAPHHOPPER_URL` nei Secrets di Replit
con l'URL pubblico del tunnel (Cloudflare Tunnel o Nginx+TLS — vedi `expose/`).

Le variabili cloud (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MAPBOX_ACCESS_TOKEN`,
`TOMTOM_API_KEY`, `LASTFM_API_KEY`, ...) restano `<INSERIRE>`: vanno compilate a mano.

---

## Aggiornare i dati OSM (senza ripartire da zero)

```bash
./update-osm.sh                          # aggiorna tutti i gruppi attivi
./update-osm.sh grecia balcani           # aggiorna solo alcuni gruppi
```

Usa `pyosmium-up-to-date` per applicare **solo i diff** OSM ai singoli file
nazionali in `data/countries/` (nessun ri-download GB), ri-genera i merge per
gruppo con `download-regions.sh`, ricostruisce i grafi per gruppo con
`build-regions.sh` e riavvia le istanze in esecuzione **una alla volta**
(le altre restano attive durante il rebuild). Poi rilancia il rebuild dei tile
Valhalla se il container è in esecuzione.

Schedulazione mensile via cron (1° del mese, 03:00 Europe/Rome):

```cron
CRON_TZ=Europe/Rome
0 3 1 * * /percorso/infra/self-host/update-osm.sh >> /var/log/bikerlink-osm.log 2>&1
```

---

## Attivazione Valhalla

Valhalla è il secondo routing engine (motorcycle nativo, fallback robusto). È già
definito nel `docker-compose.yml` e il client TypeScript è pronto: per attivarlo
servono solo i tile e il collegamento `VALHALLA_URL`.

### 1. Builda i tile

```bash
cd infra/self-host
chmod +x build-valhalla-tiles.sh
./build-valhalla-tiles.sh
```

Lo script:
1. Verifica i prerequisiti (Docker, curl, osmium) e che l'immagine `bikerlink/valhalla:latest` esista localmente.
2. Unisce i PBF delle aree core in `valhalla-merged.osm.pbf` (se i sorgenti sono più recenti del merged).
3. Ferma il container Valhalla se in esecuzione (per liberare i volumi).
4. **Genera `valhalla.json`** invocando direttamente `valhalla_build_config` (binario dell'immagine custom) — produce una config compatibile con master senza crash `ptree_bad_path`.
5. **Costruisce gli admin database** (`valhalla_build_admins`) dal PBF merged.
6. **Costruisce il timezone database** (`valhalla_build_timezones`).
7. **Costruisce i tile** (`valhalla_build_tiles`) — step più lungo, fino a 3h, richiede RAM elevata (swap ≥32 GB su sistemi con 16 GB RAM).
8. **Crea il tile extract** (`valhalla_build_extract`, file `.tar` usato da `valhalla_service`).
9. Avvia il container in modalità serve (`valhalla_service`) e attende che `GET http://localhost:8002/status` risponda (timeout 10 min). Se non risponde, esce con errore.

> **Differenza rispetto al vecchio flusso `gis-ops`:** la vecchia immagine leggeva
> le variabili d'ambiente `force_rebuild`, `serve_tiles`, `build_admins`, ecc. dal
> suo entrypoint orchestratore. L'immagine custom `bikerlink/valhalla:latest` non ha
> tale entrypoint (CMD=/bin/bash): i binari vengono invocati direttamente da questo
> script tramite `docker compose run --rm -T valhalla <binario>` — il che garantisce
> che i volumi usati durante il build siano identici (stessa mappatura project-scoped)
> a quelli del container serve. Tali variabili sono state rimosse dal `docker-compose.yml`
> perché no-op con l'immagine custom.

> Se i PBF per area mancano, lancia prima `./download-osm.sh`.

### 2. Imposta il Secret `VALHALLA_URL`

Nel pannello **Secrets di Replit** aggiungi:

```
VALHALLA_URL=http://<IP-ThinkCentre>:8002
```

Sostituisci `<IP-ThinkCentre>` con l'IP del server di casa (o l'URL del tunnel/reverse
proxy se esposto pubblicamente). Solo dopo aver impostato questa variabile il routing
Valhalla diventa attivabile dall'admin.

### 3. (Opzionale) `VALHALLA_API_KEY`

Se Valhalla è dietro un reverse proxy nginx che richiede autenticazione, imposta anche:

```
VALHALLA_API_KEY=<chiave>
```

Il client la invia come header `X-Valhalla-Key`.

### 4. Verifica dal pannello Admin

- **Admin → Mappe → Test routing**: esegue una richiesta di prova sull'engine attivo.
- La card **"Server di casa (ThinkCentre)"** mostra ora Valhalla accanto a
  GraphHopper/Ollama/Whisper/Nominatim, con latenza e versione dei tile. Se
  `VALHALLA_URL` non è impostato, la riga mostra "Non configurato" senza errori.

### Avvio automatico al boot (ThinkCentre)

Per far ripartire Valhalla automaticamente al boot, installa la unit systemd
`scripts/thinkcentre/valhalla.service` (analoga a `graphhopper.service`):

```bash
# Personalizza WorkingDirectory nel file (path della cartella infra/self-host), poi:
sudo cp scripts/thinkcentre/valhalla.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now valhalla
journalctl -u valhalla -f
```

---

## Come ricostruire Valhalla (immagine Docker custom da sorgente)

L'immagine `gis-ops/docker-valhalla` è semi-abbandonata (ferma a 3.5.1, ott 2024).
Per avere i fix critici di upstream (crash su oneway traces, loop edges, UB in
adminbuilder, NaN in rapidjson, heap OOB, ecc.) costruiamo l'immagine **direttamente
da `master` HEAD** di `valhalla/valhalla`, sotto il nostro controllo.

Il Dockerfile custom è salvato in `infra/self-host/valhalla/Dockerfile`: è il
`docker/Dockerfile` ufficiale di upstream **senza modifiche alla logica di build**,
con in coda solo tre label di tracciamento (`bikerlink.version`, `bikerlink.built`,
`bikerlink.commit`) passate come `--build-arg`.

### Procedura di rebuild (sul ThinkCentre via SSH)

```bash
# 1. Clona il sorgente upstream e inizializza i submodule (third_party)
rm -rf /tmp/valhalla-src
git clone --depth=50 https://github.com/valhalla/valhalla.git /tmp/valhalla-src
cd /tmp/valhalla-src
git submodule update --init --recursive --depth=1
SHA=$(git rev-parse HEAD)

# 2. Builda con il Dockerfile custom (context = sorgente, -f = Dockerfile custom)
DAY=$(date +%Y%m%d); BUILT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker build \
  -f /home/andrea/bikerlink/infra/self-host/valhalla/Dockerfile \
  --build-arg BIKERLINK_VERSION=master-$DAY \
  --build-arg BIKERLINK_BUILT=$BUILT \
  --build-arg BIKERLINK_COMMIT=$SHA \
  --build-arg VERSION_MODIFIER=${SHA:0:7} \
  -t bikerlink/valhalla:master-$DAY \
  -t bikerlink/valhalla:latest \
  /tmp/valhalla-src
```

> La build dura ~20-40 min e richiede diversi GB di RAM (il ThinkCentre ha 30 GB +
> 57 GB di swap — abbondante). Il Dockerfile usa un multi-stage build: stage `builder`
> (ubuntu:24.04 + compilazione) e stage `runner` (solo runtime + binari).

### Verifica dopo il build

```bash
docker images bikerlink/valhalla
docker run --rm bikerlink/valhalla:latest valhalla_build_timezones --version
docker inspect -f '{{json .Config.Labels}}' bikerlink/valhalla:latest
```

I label `bikerlink.version` / `bikerlink.built` / `bikerlink.commit` identificano la
release. Il tag `latest` punta sempre all'ultima `master-YYYYMMDD` costruita.

### Aggiornare a un master più recente

Ripeti la procedura: il `--build-arg VERSION_MODIFIER` è sempre il commit hash, quindi
ogni rebuild ricompila l'intero progetto dal nuovo HEAD. La sostituzione del container
in produzione (swap dell'immagine nel `docker-compose.yml`) è gestita dal task
dedicato — qui costruiamo soltanto l'immagine.

> **Commit usato per la prima build:** `ae2c62e` (master HEAD del 2026-06-26),
> include i fix #6048 (crash backwards traces oneway), #6050 (loop edges),
> #6065 (auto_pedestrian costing), #6077 (UB adminbuilder), #6086 (flood fill loki),
> #6115 (tileheader), #6143 (low_class_penalty), #6147 (NaN rapidjson).

---

## Routing "ad aree regionali" (multi-istanza GraphHopper)

Oltre al routing globale, BikerLink supporta un sistema di routing **per gruppi di
nazioni**: l'Europa è divisa in 7 gruppi-area, ognuno servito da una **propria
istanza GraphHopper** (GraphHopper 12) con il suo grafo. Le aree di nicchia restano
spente finché non servono, per risparmiare RAM sul ThinkCentre.

La **fonte di verità** dei gruppi (codici, porte, nazioni, bbox) è
`shared/routing-areas.ts`. Gli script bash/infra ne tengono una copia parallela:
se cambi codici o porte lì, aggiorna anche `download-regions.sh`, `build-regions.sh`,
`docker-compose.yml` e `expose/nginx-bikerlink.conf`.

| Codice | Nazioni | Porta interna | Path pubblico | Default |
|--------|---------|---------------|---------------|---------|
| `grecia` | Grecia, Albania | 8990 | `/areas/grecia` | ON |
| `balcani` | Croazia, Bosnia, Montenegro, Serbia, Macedonia del Nord, Albania | 8991 | `/areas/balcani` | ON |
| `est` | Romania, Ungheria, Bulgaria | 8992 | `/areas/est` | OFF |
| `iberia` | Spagna, Portogallo | 8993 | `/areas/iberia` | ON |
| `arco-alpino` | Italia, Austria, Svizzera, Slovenia | 8994 | `/areas/arco-alpino` | ON |
| `germania-centro` | Germania, Rep. Ceca | 8995 | `/areas/germania-centro` | OFF |
| `francia-benelux` | Francia, Belgio, Paesi Bassi, Lussemburgo | 8996 | `/areas/francia-benelux` | OFF |
| `ecuador` | Ecuador | 8997 | `/areas/ecuador` | OFF |

> Le porte sono bindate su `127.0.0.1`: l'accesso pubblico passa SOLO dal reverse
> proxy nginx (`/areas/<codice>/...`, stesso token `X-GH-Token` del vecchio monolite).

### 1. Scarica e unisci i dati per gruppo

```bash
cd infra/self-host
./download-regions.sh                  # tutti i gruppi → ./data/<codice>.osm.pbf
./download-regions.sh grecia balcani   # solo alcuni gruppi
```

Scarica i singoli `.pbf` nazionali da Geofabrik (cache condivisa in `data/countries/`,
così Albania viene scaricata una volta sola) e li unisce per gruppo con `osmium`.
Idempotente, verifica MD5, riprende i download interrotti.

### 2. Builda i grafi — procedura GH 12 ⭐

**Script consigliato: `build-graphs-sequential.sh`** (vedi sezione dedicata sotto).

```bash
# Tutte le 8 aree in sequenza (ordine ottimizzato: piccola → grande)
./build-graphs-sequential.sh

# Solo alcune aree
./build-graphs-sequential.sh grecia balcani

# Con path custom e swap dedicato
GRAPHS_DIR=/mnt/nvme/graphs \
SWAP_FILE=/mnt/nvme/build.swap \
SWAP_SIZE_GB=64 \
  ./build-graphs-sequential.sh

# Monitoraggio in un secondo terminale
./monitor-build-graphs.sh
```

**Procedura GH 12:** il build avviene in due fasi separate.
1. `--import` crea la graph-cache (RAM-intensivo, termina quando finisce)
2. Il server riusa la cache (avvio rapido)

A import riuscito, la `graph-cache/<area>/` contiene:
`properties` *(marcatore di completamento — contiene i fingerprint dei profili)*,
`nodes`, `edges`, `geometry`, `location_index`.

> ⚠️ **GH 12 vs versioni precedenti:** in GH 12 il marcatore è il **file** `properties`,
> NON la directory `edges/` (che non esiste più). `check-status.sh` usa già la logica corretta.

> **Prima pulizia grafi:** le cartelle graph-cache sono create da Docker come root.
> `build-graphs-sequential.sh` usa `sudo rm -rf` internamente per i retry. Per ripulirle
> manualmente: `sudo rm -rf graphs/<area>`.

**Script legacy:** `build-regions.sh` — build manuale senza verifica né test funzionale.
Usare `build-graphs-sequential.sh` per la procedura completa.

### 3. Avvia le istanze abilitate

I servizi `graphhopper-*` sono sotto il profilo `areas`: NON partono con un semplice
`docker compose up -d` (che avvia solo postgres/redis/valhalla/pgadmin). Si accendono
per nome:

```bash
docker compose up -d graphhopper-grecia graphhopper-balcani   # accendi
docker compose stop  graphhopper-est                          # spegni
curl http://localhost:8990/health                             # verifica (grecia)
```

### 4. Watchdog automatico (consigliato)

`expose/areas-watchdog.sh` interroga l'app cloud per sapere quali aree sono abilitate
e accende/spegne i container di conseguenza. Contratto dell'endpoint app (Task B):

```json
GET <APP_AREAS_URL>   (header X-GH-Token)
{ "areas": [ { "code": "grecia", "enabled": true }, { "code": "est", "enabled": false } ] }
```

Configura `/etc/bikerlink-areas.env` e installa la unit systemd (timer ogni 1 min):

```bash
sudo tee /etc/bikerlink-areas.env >/dev/null <<'EOF'
APP_AREAS_URL=https://bikerlink.app/api/routing/areas/status
GH_TOKEN=<token>
COMPOSE_DIR=/opt/bikerlink/self-host
# AREAS_EVENTS_FILE=/var/lib/bikerlink/watchdog-events.jsonl  # default, sovrascrivibile
EOF

sudo cp expose/areas-watchdog.service expose/areas-watchdog.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now areas-watchdog.timer
journalctl -u areas-watchdog.service -f
```

> **Fail-safe:** se l'endpoint app non risponde o il payload è illeggibile, il
> watchdog NON tocca i container (non spegne nulla per sbaglio).

### 5. Metriche delle aree

`expose/areas-metrics.py` (solo stdlib) espone su `127.0.0.1:9090` un JSON con stato
+ `docker stats` per ogni area. nginx lo pubblica su `/metrics/areas` (auth `X-GH-Token`):

```bash
sudo cp expose/areas-metrics.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now areas-metrics
curl -H "X-GH-Token: <token>" https://gh.<dominio>/metrics/areas
```

### 6. Avvio automatico al boot (istanze core)

`scripts/thinkcentre/bikerlink-areas-core.service` avvia automaticamente i 4 gruppi
core (`grecia`, `balcani`, `iberia`, `arco-alpino`) dopo che Docker è pronto, così
lo stack GraphHopper torna operativo senza intervento manuale anche dopo un riavvio
imprevisto del ThinkCentre.

**Installazione:**

```bash
# 1. Copia la unit (se lo stack non è in /opt/bikerlink/self-host vedi nota COMPOSE_DIR sotto)
sudo cp scripts/thinkcentre/bikerlink-areas-core.service /etc/systemd/system/

# 2. Ricarica il daemon e abilita l'avvio automatico
sudo systemctl daemon-reload
sudo systemctl enable --now bikerlink-areas-core

# 3. Verifica
systemctl status bikerlink-areas-core
journalctl -u bikerlink-areas-core -n 30
```

> **Compatibilità con il watchdog:** `areas-watchdog.sh` controlla sempre lo stato
> corrente del container prima di agire. Se un'istanza è già in esecuzione (avviata
> dalla unit al boot) il watchdog non la tocca — nessun conflitto.

> **Solo gruppi core:** `est`, `germania-centro` e `francia-benelux` sono OFF per
> default e rimangono spenti al boot. Vengono accesi/spenti esclusivamente dal
> watchdog in base allo stato configurato nell'app.

> **COMPOSE_DIR:** la unit usa `/opt/bikerlink/self-host` come default. Se hai
> installato lo stack in una cartella diversa, modifica **due righe** nel file `.service`
> prima di copiarlo: `Environment=COMPOSE_DIR=…` e `EnvironmentFile=-…/.env`
> (systemd non espande variabili nei path `EnvironmentFile=`).

### Rigenerare l'immagine GraphHopper (custom, da sorgente, Java 25)

Non si usa più l'immagine di terze parti `israelhikingmap/graphhopper`. Ora gira
un'immagine **custom** `bikerlink/graphhopper:latest` **compilata da sorgente** dal
`master` HEAD di [`graphhopper/graphhopper`](https://github.com/graphhopper/graphhopper)
(GraphHopper 12.x) su runtime **Java 25 LTS** (Temurin). L'immagine vive **solo
nell'image store locale** del ThinkCentre (non è su Docker Hub) ed è referenziata per
tag in `docker-compose.yml` (anchor `x-gh-area`) e `build-graphs-sequential.sh` (`GH_IMAGE`).

Il contratto d'avvio è identico all'immagine precedente: `WORKDIR /graphhopper`,
porta `8989`, `curl` presente per l'healthcheck, e lo script `graphhopper.sh` che
legge le env `FILE`/`GRAPH` e forza `graph.location` via sysprop (così ogni gruppo
scrive sul proprio grafo). L'`entrypoint` del compose resta invariato.

Il build context (`Dockerfile` multi-stage + `graphhopper.sh`) sta in
`infra/self-host/graphhopper/image/`. Per ricostruire l'immagine sul ThinkCentre:

```bash
cd infra/self-host/graphhopper/image
docker build --pull -t bikerlink/graphhopper:latest .

# Verifica: runtime Java 25 + versione GraphHopper
docker run --rm --entrypoint sh bikerlink/graphhopper:latest -c 'java -version'
# -> openjdk version "25..."

# Poi ri-builda i grafi con la nuova immagine.
```

Lo stage di build clona il `master` HEAD: ricostruire l'immagine prende l'ultimo
codice. Per fissare un commit specifico, sostituisci nel `Dockerfile` il
`git clone --depth 1` con un checkout del commit voluto.

Override al volo senza editare i file: `GRAPHHOPPER_IMAGE=<ref> ./build-graphs-sequential.sh`.

---

## Build sequenziale grafi — dettaglio script

### `build-graphs-sequential.sh`

Orchestratore completo per costruire i grafi di tutte le 8 aree GraphHopper in serie.

**Funzionamento passo-passo per ogni area:**

1. **Stop preventivo** di tutte le istanze GH (`docker compose stop`) — evita crash-loop
   (`restart: unless-stopped`) e libera tutta la RAM disponibile per il build
2. **Guard risorse** — controlla RAM libera, swap (per le aree grandi), spazio disco
3. **Attivazione swap NVMe** (solo per `germania-centro` e `francia-benelux`) — la
   contraction CH a ~5-7 GB di `.pbf` può superare i 32 GB di RAM
4. **Cleanup** graph-cache precedente (start pulito; usa `sudo rm -rf` per file root-owned)
5. **`--import`** con heap JVM calibrato per area (`-Xmx` da 8 GB a 28 GB)
6. **Verifica artefatti GH 12**: `properties` (marcatore principale + fingerprint profili),
   `nodes`, `edges`, `geometry`, `location_index`
7. **Avvio container** + attesa `/health` (max 5 min)
8. **Test funzionale** `POST /route` con `profile=motorcycle` tra due punti reali dell'area
9. **Stop container** — pronto per l'area successiva
10. **Retry automatico** su qualsiasi errore (incluso OOM/exit 137), max `MAX_RETRIES` volte

Al termine, se **tutte** le aree sono OK: backup automatico in `GRAFIGH/<area>/`.

**Heap JVM per area** (32 GB RAM, OS + postgres/redis = ~4 GB):

| Area | `.pbf` (~GB) | `-Xmx` | Swap NVMe |
|------|-------------|--------|-----------|
| ecuador | 0.1 | 8 GB | no |
| grecia | 0.6 | 12 GB | no |
| balcani | 1.5 | 16 GB | no |
| est | 1.5 | 16 GB | no |
| iberia | 1.8 | 18 GB | no |
| arco-alpino | 3.6 | 22 GB | no |
| germania-centro | 5.2 | **28 GB** | **sì** |
| francia-benelux | 6.7 | **28 GB** | **sì** |

**Variabili d'ambiente:**

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `DATA_DIR` | `./data` | Directory dei `.pbf` merged |
| `GRAPHS_DIR` | `./graphs` | Directory dei grafi prodotti |
| `BACKUP_DIR` | `/mnt/nvme/GRAFIGH` | Destinazione backup finale |
| `SWAP_FILE` | `/mnt/nvme/build.swap` | File di swap per le aree grandi |
| `SWAP_SIZE_GB` | `64` | Dimensione swap in GB |
| `MAX_RETRIES` | `2` | Max tentativi per area |
| `STATE_FILE` | `/tmp/bk-build-graphs-state.txt` | File di stato (letto dal monitor) |
| `LOG_FILE` | `/tmp/bk-build-graphs.log` | Log completo |
| `GRAPHHOPPER_IMAGE` | `bikerlink/graphhopper:latest` | Immagine Docker da usare |

---

### `monitor-build-graphs.sh`

Interfaccia di monitoraggio in tempo reale per `build-graphs-sequential.sh`.
Legge il file di stato scritto dall'orchestratore e mostra a colpo d'occhio:
stato per ogni area (✓/✗/🔄/⏳), area e fase corrente, tempo trascorso, utilizzo RAM/swap,
ultime righe del log.

```bash
# Apri in un secondo terminale mentre build-graphs-sequential.sh gira
./monitor-build-graphs.sh

# Aggiorna ogni 10s (default: 5s)
REFRESH=10 ./monitor-build-graphs.sh
```

Il monitor esce automaticamente quando il build è terminato.

---

## FAQ / Troubleshooting

**Come verifico che i servizi siano attivi?**
```bash
docker compose ps                          # servizi base
docker compose ps --all                    # tutti (incluse istanze area)
curl http://127.0.0.1:8994/health          # arco-alpino
curl http://127.0.0.1:8990/health          # grecia
curl http://localhost:8002/status          # valhalla
```

**Dove vedo i log di un container?**
```bash
docker compose logs -f graphhopper-arco-alpino   # o: grecia / balcani / iberia / ...
docker compose logs -f valhalla
docker compose logs -f postgres
```

**Il build di GraphHopper per un'area fallisce — cosa faccio?**
- Controlla l'output di `build-regions.sh`: spesso è memoria insufficiente.
- Forza un rebuild pulito del grafo (rimuovi la cartella, poi ribuildi):
  ```bash
  sudo rm -rf graphs/arco-alpino          # serve sudo: le cartelle sono create da Docker
  ./build-regions.sh arco-alpino
  docker compose up -d graphhopper-arco-alpino
  ```
- Riduci l'heap via variabile d'ambiente se la RAM è limitata:
  ```bash
  BUILD_JAVA_OPTS="-Xmx12g -Xms4g -XX:+UseParallelGC" ./build-regions.sh arco-alpino
  ```
- Verifica che `data/arco-alpino.osm.pbf` esista e non sia corrotto:
  rilancia `./download-regions.sh arco-alpino`, che ri-verifica i checksum.

**Il download si è interrotto.** Rilancia `./download-regions.sh <codice>`:
`wget -c` riprende da dove era e i checksum vengono ri-verificati.

**Voglio fermare/riavviare tutto.**
```bash
docker compose down               # ferma i servizi base (i dati restano nei volumi)
docker compose up -d              # riavvia i servizi base
docker compose up -d graphhopper-arco-alpino   # riavvia una singola area
docker compose down -v            # ATTENZIONE: cancella anche i volumi (dati persi)
```

**Posso eseguire `docker` senza sudo?** `setup.sh` aggiunge il tuo utente al gruppo
`docker`. Esci e rientra (o riavvia) perché abbia effetto.

---

## Setup parziale (solo servizi base)

Se alcune istanze `graphhopper-*` e Ollama sono già attivi sul server e vuoi aggiungere
solo i servizi base (**PostgreSQL, Redis, Valhalla, pgAdmin**), usa lo script
dedicato invece del `setup.sh` completo:

```bash
cd infra/self-host
chmod +x setup-missing.sh
./setup-missing.sh
```

### Differenze rispetto a `setup.sh`

| Aspetto | `setup.sh` | `setup-missing.sh` |
|---------|------------|--------------------|
| Servizi base avviati | postgres, redis, valhalla, pgadmin | postgres, redis, valhalla, pgadmin |
| Download dati OSM (GH) | ✓ (interattivo, via download-regions.sh) | ✓ (skip se PBF già presenti, prompt altrimenti) |
| Build grafi GraphHopper | ✓ (build-regions.sh per gruppi core) | ✓ (skip se grafi già presenti) |
| Istanze graphhopper-* | avviate (gruppi core) + health check | avviate (gruppi core) + health check |
| Verifica spazio disco | ✓ (>150 GB richiesti) | ✗ (non effettuata) |
| Generazione `.env` | ✓ | ✓ (stessa logica, non sovrascrive) |
| Generazione `.env.local` | ✓ | ✓ (non sovrascrive se già presente) |

Flag opzionali di `setup-missing.sh`:

```bash
./setup-missing.sh --groups "grecia arco-alpino"   # solo determinati gruppi GH
./setup-missing.sh --skip-gh                       # salta download/build/avvio GH
./setup-missing.sh --gen-secrets                   # genera SESSION_SECRET e OSM_UPDATE_SECRET
```

### Dati OSM per Valhalla

Se nessun `.osm.pbf` è presente in `./data/`, lo script chiede se vuoi scaricare
i gruppi core. Valhalla usa qualsiasi PBF disponibile in `./data/`.

Puoi scaricare i dati in un secondo momento:

```bash
./download-regions.sh arco-alpino grecia balcani iberia   # gruppi core
./setup-missing.sh   # rilancia: rileverà i PBF e riavvierà Valhalla con --force-recreate

# Oppure, se i servizi sono già tutti in piedi, riavvia solo Valhalla manualmente:
docker compose up -d --force-recreate valhalla
```

### Secret locali

Come `setup.sh`, anche `setup-missing.sh` supporta `--gen-secrets` per generare
automaticamente `SESSION_SECRET` e `OSM_UPDATE_SECRET` nel `.env.local`:

```bash
./setup-missing.sh --gen-secrets
```

---

## File in questa cartella

| File | Scopo |
|------|-------|
| `setup.sh` | Setup end-to-end (prerequisiti, download aree, build grafi, avvio, health check). |
| `setup-missing.sh` | Setup parziale: installa solo postgres, redis, valhalla, pgadmin (istanze graphhopper-* gestite separatamente). |
| `download-regions.sh` | Scarica i `.pbf` nazionali e li unisce per gruppo-area (`data/<codice>.osm.pbf`). |
| `build-regions.sh` | Builda i grafi GraphHopper per gruppo-area (import RAM_STORE, immagine pinnata). |
| `update-osm.sh` | Aggiornamento incrementale OSM (diff per-paese) + rebuild grafi per area + restart istanze + tile Valhalla. |
| `build-valhalla-tiles.sh` | Builda/ricostruisce i tile Valhalla dal PBF, segue i log, verifica `/status`. |
| `docker-compose.yml` | Servizi base (postgres, redis, valhalla, pgadmin) + 7 istanze GraphHopper-area (profilo `areas`). |
| `graphhopper/config.yml` | Config GraphHopper 12 condivisa (4 profili moto/auto, MMAP in serving). |
| `expose/areas-watchdog.sh` + `.service`/`.timer` | Routing aree: accende/spegne le istanze in base allo stato app. |
| `expose/areas-metrics.py` + `.service` | Routing aree: collector metriche (docker stats) esposto su `/metrics/areas`. |
| `.env.local.template` | Template variabili app con URL locali precompilati. |
| `expose/` | Guida + config (Cloudflare Tunnel o Nginx+TLS) per esporre GraphHopper e Valhalla all'app cloud in modo sicuro. |
| `.env` | (generato) credenziali dei container — non committare. |
| `.env.local` | (generato) variabili per l'app BikerLink — non committare. |
