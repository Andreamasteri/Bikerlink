# BikerLink — Self-Host Stack (PC di casa)

Setup completo per ospitare in casa tutti i servizi self-hostabili di BikerLink:
**PostgreSQL + PostGIS, Redis, GraphHopper (profilo moto curvy), Valhalla, pgAdmin**.
Lo stack scarica i dati OpenStreetMap (Europa completa + Ecuador), li unisce in un
unico file e genera un `.env.local` precompilato con tutti gli URL locali.

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
| RAM     | 32 GB  | 32 GB+       |
| Disco   | 150 GB SSD | 250 GB SSD (NVMe) |
| CPU     | 4 core | 8 core       |
| Rete    | — | connessione veloce per i ~30 GB di download |

Lo spazio serve per: download OSM (~35 GB) + merge (~35 GB) + grafo GraphHopper
(~25 GB) + tile Valhalla (~25 GB) + DB/varie.

## Stima tempi (prima esecuzione)

| Fase | Durata indicativa |
|------|-------------------|
| `apt` + install Docker | 5–10 min |
| Download OSM (Europa + Ecuador) | ~2 h (dipende dalla banda) |
| Merge PBF con osmium | 10–20 min |
| Build grafo GraphHopper | ~45 min |
| Build tile Valhalla | ~3 h |

> GraphHopper e Valhalla buildano **in parallelo** dopo `docker compose up -d`.
> Postgres, Redis e pgAdmin sono pronti in meno di un minuto.

---

## Procedura passo-passo (dalla prima accensione)

```bash
# 1. Aggiorna il sistema
sudo apt update && sudo apt upgrade -y

# 2. Vai nella cartella dello stack (copiala sul PC se necessario)
cd infra/self-host

# 3. Rendi eseguibili gli script
chmod +x setup.sh download-osm.sh update-osm.sh

# 4. Lancia il setup completo (installa Docker, scarica OSM, avvia tutto)
./setup.sh
```

`setup.sh` fa tutto in sequenza:
1. Installa i prerequisiti via `apt` (Docker Engine + plugin compose, `osmium-tool`, `wget`).
2. Verifica >100 GB liberi.
3. Genera `.env` con password casuali e `.env.local` (con `DATABASE_URL` già pronto).
4. Chiede conferma e scarica i dati OSM (`download-osm.sh`).
5. `docker compose up -d` e attende l'health di ogni servizio.
6. Stampa il riepilogo finale con URL e credenziali.

### Solo download dati (senza avviare nulla)

Se vuoi scaricare in anticipo tutti i file dati che ti servono:

```bash
./download-osm.sh
```

Scarica Europa + Ecuador, verifica i checksum MD5 e genera
`data/europe-ecuador-merged.osm.pbf`. È idempotente e riprende i download interrotti.

---

## Servizi e porte

| Servizio | URL locale | Health/Status |
|----------|-----------|---------------|
| PostgreSQL + PostGIS | `localhost:5432` | `pg_isready` |
| Redis | `redis://localhost:6379` | `redis-cli ping` |
| GraphHopper | `http://localhost:8989` | `GET /health` |
| Valhalla | `http://localhost:8002` | `GET /status` |
| pgAdmin 4 | `http://localhost:5050` | UI web |

Le credenziali di Postgres e pgAdmin sono generate da `setup.sh` e salvate in `.env`
(stampate anche nel riepilogo finale).

## Variabili d'ambiente per l'app

`setup.sh` genera `.env.local` dal template `.env.local.template`, con già pronti:

```
GRAPHHOPPER_URL=http://localhost:8989
VALHALLA_URL=http://localhost:8002
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/bikerlink
ROUTING_DISABLED=0
```

Le variabili cloud (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MAPBOX_ACCESS_TOKEN`,
`TOMTOM_API_KEY`, `LASTFM_API_KEY`, ...) restano `<INSERIRE>`: vanno compilate a mano.

---

## Aggiornare i dati OSM (senza ripartire da zero)

```bash
./update-osm.sh
```

Usa `pyosmium-up-to-date` per scaricare **solo i diff** OSM (non i 30 GB completi),
ricostruisce il grafo GraphHopper in una cartella separata e fa lo swap a caldo
(no downtime percepibile), poi rilancia il rebuild dei tile Valhalla in background.

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

Lo script verifica i prerequisiti (Docker, curl, osmium), avvia il container in
modalità build (`force_rebuild=True`), mostra i log in tempo reale e attende che
`GET http://localhost:8002/status` risponda (timeout 3h). Al termine ripristina
`force_rebuild=False` e riavvia in modalità serve, poi stampa version + data tile.
Se `/status` non torna online dopo il riavvio, lo script esce con errore.

> Se il PBF unificato `data/europe-ecuador-merged.osm.pbf` manca, lo script lancia
> automaticamente `./download-osm.sh` (download Europa + Ecuador + merge, ~2h).

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

### 2. Builda i grafi (uno alla volta)

```bash
./build-regions.sh                     # tutti i gruppi
./build-regions.sh grecia balcani      # solo alcuni gruppi
GRAPHS_DIR=/mnt/nvme/graphs ./build-regions.sh   # grafi su NVMe dedicato
```

Per ogni gruppo lancia `docker run --import` con l'immagine **pinnata per digest**,
forzando `RAM_STORE` via `JAVA_OPTS` per un import veloce. Continua anche se un
gruppo fallisce (riepilogo finale ✓/✗). I grafi finiscono in `${GRAPHS_DIR}/<codice>`.

> **Prima pulizia grafi:** le cartelle sono create da Docker come root. Per ripulirle
> serve `sudo` una volta:
> `sudo rm -rf graphs/{grecia,balcani,est,iberia,arco-alpino,germania-centro,francia-benelux}`.
> Lo script NON usa `sudo` internamente (gira unattended senza prompt).

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

### Aggiornare il pin dell'immagine GraphHopper

L'immagine è **pinnata per digest** (riproducibilità) in `docker-compose.yml` e
`build-regions.sh`. `latest` corrisponde a GraphHopper 12 (non esiste un tag `12.0`).
Per aggiornare al digest corrente:

```bash
docker pull israelhikingmap/graphhopper:latest
docker inspect --format='{{index .RepoDigests 0}}' israelhikingmap/graphhopper:latest
# Sostituisci il nuovo sha256:... in docker-compose.yml (anchor x-gh-area)
# e in build-regions.sh (GH_IMAGE). Poi ri-builda i grafi.
```

Override al volo senza editare i file: `GRAPHHOPPER_IMAGE=<ref> ./build-regions.sh`.

---

## FAQ / Troubleshooting

**Come verifico che i servizi siano attivi?**
```bash
docker compose ps
curl http://localhost:8989/health
curl http://localhost:8002/status
```

**Dove vedo i log di un container?**
```bash
docker compose logs -f graphhopper   # o: postgres / redis / valhalla / pgadmin
```

**Il build di GraphHopper o Valhalla fallisce — cosa faccio?**
- Controlla i log: `docker compose logs graphhopper` (spesso è memoria insufficiente).
- GraphHopper: riduci lo heap in `.env` (`GRAPHHOPPER_JAVA_OPTS=-Xmx12g -Xms4g`) e
  rilancia `docker compose up -d --force-recreate graphhopper`.
- Per forzare un rebuild pulito del grafo, rimuovi il volume:
  `docker compose down && docker volume rm bikerlink-selfhost_ghgraph && docker compose up -d`.
- Verifica che `data/europe-ecuador-merged.osm.pbf` esista e non sia corrotto
  (rilancia `./download-osm.sh`, che ri-verifica i checksum).

**Il download si è interrotto.** Rilancia `./download-osm.sh`: `wget -c` riprende da
dove era e i checksum vengono ri-verificati.

**Voglio fermare/riavviare tutto.**
```bash
docker compose down        # ferma (i dati restano nei volumi)
docker compose up -d        # riavvia
docker compose down -v      # ATTENZIONE: cancella anche i volumi (dati persi)
```

**Posso eseguire `docker` senza sudo?** `setup.sh` aggiunge il tuo utente al gruppo
`docker`. Esci e rientra (o riavvia) perché abbia effetto.

---

## Setup parziale (GraphHopper già installato)

Se GraphHopper (porta 8989) e Ollama sono già attivi sul server e vuoi aggiungere
solo i servizi rimanenti (**PostgreSQL, Redis, Valhalla, pgAdmin**), usa lo script
dedicato invece del `setup.sh` completo:

```bash
cd infra/self-host
chmod +x setup-missing.sh
./setup-missing.sh
```

### Differenze rispetto a `setup.sh`

| Aspetto | `setup.sh` | `setup-missing.sh` |
|---------|------------|--------------------|
| Servizi avviati | tutti e 5 | postgres, redis, valhalla, pgadmin |
| GraphHopper | avviato | **saltato** (già attivo) |
| Ollama | non gestito | **saltato** (già attivo) |
| Verifica spazio disco | ✓ (>100 GB richiesti) | ✗ (non effettuata) |
| Download dati OSM | ✓ (interattivo) | ✓ (prompt opzionale se PBF assente) |
| Generazione `.env` | ✓ | ✓ (stessa logica, non sovrascrive) |
| Generazione `.env.local` | ✓ | ✓ (non sovrascrive se già presente) |

### Dati OSM per Valhalla

Se il file PBF non è presente in `./data/`, lo script lo rileva e chiede se vuoi
scaricarlo subito:

```
  → Nessun file PBF trovato in ./data/
  → Il download scarica Europa + Ecuador (~35 GB) e richiede circa 2 ore.
  Vuoi scaricare i dati OSM ora? [s/N]
```

- **Rispondi `s`**: `download-osm.sh` viene eseguito in sequenza (download + verifica MD5
  + merge osmium), poi Valhalla viene avviato con `--force-recreate` per triggerare il
  build dei tile.
- **Rispondi `N` / invio**: lo script salta il download e avvia ugualmente tutti i
  servizi. Valhalla partirà vuoto e non calcolerà percorsi finché non riceverà i dati.

> **Nota:** ogni volta che il file PBF è presente in `./data/`, lo script avvia Valhalla
> con `--force-recreate`. Questo garantisce che il container costruisca i tile anche se
> era già in esecuzione da prima del download. I tile già costruiti (nel volume Docker)
> vengono preservati: se sono aggiornati, Valhalla li rileva e non riesegue il build.

Puoi scaricare i dati in un secondo momento e poi rilanciare lo script:

```bash
# Download dei dati OSM (Europa + Ecuador, ~35 GB, idempotente)
./download-osm.sh

# Rilancia setup-missing.sh: rileverà il PBF e riavvierà Valhalla con --force-recreate
./setup-missing.sh

# Oppure, se i servizi sono già tutti in piedi, riavvia solo Valhalla manualmente:
docker compose up -d --force-recreate valhalla
```

In modalità non-interattiva (`NONINTERACTIVE=1`), il download viene saltato
automaticamente e viene stampato solo un avviso.

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
| `setup.sh` | Setup end-to-end (prerequisiti, download, avvio, health check). |
| `setup-missing.sh` | Setup parziale: installa solo postgres, redis, valhalla, pgadmin (GraphHopper già attivo). |
| `download-osm.sh` | Scarica Europa + Ecuador, verifica MD5, merge in un unico PBF. |
| `download-regions.sh` | Routing aree: scarica i `.pbf` nazionali e li unisce per gruppo (`data/<codice>.osm.pbf`). |
| `build-regions.sh` | Routing aree: builda i grafi GraphHopper per gruppo (import RAM_STORE, immagine pinnata). |
| `update-osm.sh` | Aggiornamento incrementale dati OSM (diff) + rebuild a caldo (incl. tile Valhalla). |
| `build-valhalla-tiles.sh` | Builda/ricostruisce i tile Valhalla dal PBF, segue i log, verifica `/status`. |
| `docker-compose.yml` | Servizi base (postgres, redis, valhalla, pgadmin) + 7 istanze GraphHopper-area (profilo `areas`). |
| `graphhopper/config.yml` | Config GraphHopper 12 condivisa (4 profili moto/auto, MMAP in serving). |
| `expose/areas-watchdog.sh` + `.service`/`.timer` | Routing aree: accende/spegne le istanze in base allo stato app. |
| `expose/areas-metrics.py` + `.service` | Routing aree: collector metriche (docker stats) esposto su `/metrics/areas`. |
| `.env.local.template` | Template variabili app con URL locali precompilati. |
| `expose/` | Guida + config (Cloudflare Tunnel o Nginx+TLS) per esporre GraphHopper e Valhalla all'app cloud in modo sicuro. |
| `.env` | (generato) credenziali dei container — non committare. |
| `.env.local` | (generato) variabili per l'app BikerLink — non committare. |
