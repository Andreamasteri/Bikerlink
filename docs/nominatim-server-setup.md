# Nominatim sul server di casa — Guida BikerLink

> Guida passo-passo per installare **Nominatim** (geocoding/reverse geocoding OSM
> locale) sul server di casa (ThinkCentre 910q, 32 GB RAM, Ubuntu 26.04 LTS) ed
> esporlo all'app BikerLink tramite l'URL pubblico Tailscale Funnel già esistente,
> con autenticazione a token — stesso pattern di GraphHopper
> (`X-GH-Token` → `X-Nominatim-Token`).

Lo script automatico è: [`scripts/setup-nominatim-server.sh`](../scripts/setup-nominatim-server.sh).

---

## 1. Prerequisiti

Sul server di casa devono essere già presenti e funzionanti:

- **Ubuntu 26.04 LTS** (o versione compatibile) con accesso `sudo`.
- **nginx** installato e configurato con un `server { ... }` servito da
  **Tailscale Funnel** (l'URL pubblico, es. `https://bikerlink.tail5056aa.ts.net`,
  già raggiungibile dall'esterno).
- Connessione internet (per scaricare Nominatim e i dati OSM).
- **~60 GB liberi su disco**: il file PBF Italia pesa ~3 GB, ma PostgreSQL
  espande i dati a ~30–40 GB dopo l'import.
- **RAM**: 32 GB sono ampiamente sufficienti. L'import usa ~4–8 GB;
  il servizio a regime ~2–4 GB.

> **Hardware**: il 910q ha CPU Intel i5-7500T con 4 core (8 thread). Lo script
> usa 4 thread di default per l'import — cambia con `IMPORT_THREADS=<n>`.

> **Attenzione ai tempi**: l'import OSM Italia richiede tipicamente **60–90 minuti**
> su questa CPU. Lo script avvisa e non si può accelerare ulteriormente.

---

## 2. Copia ed esegui lo script via SSH

Dal tuo PC, copia lo script sul server e lancialo:

```bash
# 1) Copia lo script sul server (sostituisci utente/host)
scp scripts/setup-nominatim-server.sh utente@bikerlink.tail5056aa.ts.net:~/

# 2) Connettiti via SSH
ssh utente@bikerlink.tail5056aa.ts.net

# 3) Esegui (chiederà la password sudo quando serve)
bash setup-nominatim-server.sh
```

> In alternativa, se hai già il repo sul server, puoi eseguirlo direttamente da lì.

### Override opzionali

Lo script funziona senza parametri, ma puoi personalizzarlo con variabili
d'ambiente:

```bash
# Riusa un token esistente invece di generarne uno nuovo
NOMINATIM_TOKEN="il-mio-token-esistente" bash setup-nominatim-server.sh

# Forza l'hostname pubblico se l'auto-detect Tailscale non funziona
PUBLIC_HOST="bikerlink.tail5056aa.ts.net" bash setup-nominatim-server.sh

# Scarica i dati di un'altra area invece dell'Italia
OSM_PBF_URL="https://download.geofabrik.de/europe-latest.osm.pbf" \
  bash setup-nominatim-server.sh

# Aumenta i thread di import (default: 4)
IMPORT_THREADS=8 bash setup-nominatim-server.sh

# Forza il file nginx da modificare
NGINX_CONF="/etc/nginx/sites-enabled/default" bash setup-nominatim-server.sh

# Salta il download PBF e l'import (database già presente)
SKIP_IMPORT=1 bash setup-nominatim-server.sh

# Installa una versione specifica di Nominatim
NOMINATIM_VERSION=4.3.2 bash setup-nominatim-server.sh
```

---

## 3. Cosa fa lo script (output atteso per fase)

### STEP 1 — Dipendenze di sistema

Installa tramite `apt` tutti i pacchetti necessari: PostgreSQL, PostGIS,
cmake, g++, libboost-dev, osm2pgsql, Python + nominatim-db e le altre
dipendenze di build. Verifica che PostgreSQL sia attivo con `pg_lsclusters`.

```
[ OK  ] Dipendenze di sistema installate.
[ OK  ] PostgreSQL attivo:
  16  main  5432  online  postgres
```

### STEP 2 — Installazione Nominatim

Scarica la release `v4.4.0` (o la versione configurata) da GitHub, estrae
i sorgenti in `/tmp/`, compila con `cmake` in `/opt/nominatim/build/`.
Crea l'utente di sistema `nominatim` con home in `/opt/nominatim/`.

```
[ OK  ] Nominatim compilato: Nominatim 4.4.0
```

> **Reinstallare**: per forzare una ricompilazione, rimuovi
> `/opt/nominatim/build/` e riesegui lo script.

### STEP 3 — Database PostgreSQL

Crea (se non esiste) il database `nominatim` con le estensioni **PostGIS**
e **hstore** attivate. Se il database esiste già, `SKIP_IMPORT` viene
impostato automaticamente per non sovrascriverlo.

```
[ OK  ] Database 'nominatim' creato con PostGIS e hstore.
```

### STEP 4 — Download dati OSM e import

Scarica il file PBF da Geofabrik con **resume** support (puoi interrompere
e riprendere il download):

```
italy-latest.osm.pbf:  3.1G [================>] 100%
[ OK  ] Download OSM completato: 3.1G
```

Poi esegue l'import OSM — **questa è la fase più lunga**:

```
[WARN ] ⚠️  ATTENZIONE: l'import richiede 30–90 minuti su CPU (ThinkCentre i5-7500T).
         Thread usati: 4. Per aumentare: IMPORT_THREADS=<n> bash setup-nominatim-server.sh
```

Dopo l'import, verifica l'integrità del database:

```
[ OK  ] Import OSM completato.
```

> **Per aggiungere altri paesi in futuro**: droppare il database e reimportare
> con un PBF diverso (es. Europa completa). Vedi la sezione Troubleshooting.

### STEP 5 — Servizio systemd

Crea `/etc/systemd/system/nominatim.service` che avvia Nominatim sulla
porta locale `8088` (bind solo su `127.0.0.1`, mai esposto direttamente).
Il servizio dipende da `postgresql.service`.

```
[ OK  ] nominatim.service attivo: active
```

### STEP 6 — Configurazione nginx

Crea lo snippet `/etc/nginx/snippets/bikerlink-nominatim.conf` con la
`location /nominatim/` che:
- verifica l'header **`X-Nominatim-Token`** (restituisce **403** se assente/errato);
- rimuove il prefisso `/nominatim` con `rewrite`;
- proxya a `http://127.0.0.1:8088` con timeout generosi (60s).

Poi inserisce automaticamente `include snippets/bikerlink-nominatim.conf;`
dentro il primo blocco `server { ... }` del vhost (con **backup** del file
e **rollback automatico** se `nginx -t` fallisce).

```
[ OK  ] include aggiunto in /etc/nginx/sites-enabled/default (dentro il primo server{}).
[ OK  ] nginx validato e ricaricato.
```

> **Se l'inserimento automatico non riesce** (vhost insolito), lo script stampa
> la riga `include ...` da aggiungere a mano dentro il `server { ... }`, seguita da:
> ```
> sudo nginx -t && sudo systemctl reload nginx
> ```

### STEP 7 — Test e output finale

- API locale `/search?q=Roma` → deve rispondere.
- API locale `/reverse?lat=41.9&lon=12.5` → deve rispondere.
- Via nginx **senza** token → **403**.
- Via nginx **con** token → **200**.

```
[ OK  ] API locale /search risponde.
[ OK  ] API locale /reverse risponde.
[ OK  ] Senza token → 403 (auth attiva).
[ OK  ] Con token → 200 (proxy + rewrite OK).
```

Poi stampa i valori da copiare su Replit:

```
  NOMINATIM_URL   = https://bikerlink.tail5056aa.ts.net/nominatim
  NOMINATIM_TOKEN = <token di 64 caratteri esadecimali>
```

---

## 4. Aggiungere i 2 secret su Replit

Nel progetto BikerLink su Replit:

1. Apri **Tools → Secrets** (o il pannello "Secrets" / "Environment variables").
2. Aggiungi i due secret con i valori stampati dallo script:
   - `NOMINATIM_URL` → l'URL pubblico con suffisso `/nominatim` (senza slash finale).
   - `NOMINATIM_TOKEN` → il token (lo stesso verificato da nginx come `X-Nominatim-Token`).
3. **Riavvia il backend** perché i secret vengano letti.

> Il token è un segreto: non committarlo nel repo, non condividerlo.
>
> **Riesecuzioni e rotazione**: se rilanci lo script e nello snippet nginx esiste
> già un token, viene **riusato** (i secret su Replit restano validi). Lo script
> genera un token nuovo solo alla prima esecuzione o se passi `NOMINATIM_TOKEN=<nuovo>`.
> Per forzare la rotazione: rimuovi `/etc/nginx/snippets/bikerlink-nominatim.conf` e
> riesegui, poi aggiorna `NOMINATIM_TOKEN` su Replit con il nuovo valore stampato.

---

## 5. Verificare che funzioni

### Dal server stesso

```bash
# Servizio attivo
systemctl is-active nominatim        # → active

# Test geocoding diretto
curl "http://127.0.0.1:8088/search?q=Roma+Colosseo&format=json&limit=3"

# Test reverse geocoding diretto
curl "http://127.0.0.1:8088/reverse?lat=41.8902&lon=12.4923&format=json"
```

### Dall'esterno (da un altro PC, via URL pubblico)

```bash
# Geocoding (testo → coordinate) — deve dare 200 + JSON
curl -H "X-Nominatim-Token: <IL-TUO-TOKEN>" \
  "https://bikerlink.tail5056aa.ts.net/nominatim/search?q=Milano+Duomo&format=json&limit=5"

# Reverse geocoding (coordinate → indirizzo) — es. centro di Roma
curl -H "X-Nominatim-Token: <IL-TUO-TOKEN>" \
  "https://bikerlink.tail5056aa.ts.net/nominatim/reverse?lat=41.890&lon=12.492&format=json"

# Senza token deve dare 403
curl -i "https://bikerlink.tail5056aa.ts.net/nominatim/search?q=Roma&format=json"
```

### Dall'app BikerLink

Dopo aver impostato i 2 secret e riavviato il backend, il client Nominatim
lato server userà `NOMINATIM_URL` + `NOMINATIM_TOKEN` per le chiamate di
geocoding. Verifica nei log del backend l'assenza di errori 403/timeout.

---

## 6. Troubleshooting

**`nominatim.service` non parte**
```bash
sudo systemctl status nominatim --no-pager -l
journalctl -u nominatim -n 100 --no-pager
```

**Il servizio parte ma risponde lentamente alla prima query**
- Normale: Nominatim carica gli indici PostgreSQL in RAM al primo utilizzo.
  Le query successive saranno molto più rapide grazie alla cache del sistema.
  Con 32 GB di RAM la cache si scalda completamente in pochi minuti.

**nginx restituisce 403 anche col token giusto**
- Verifica che l'header sia esattamente `X-Nominatim-Token` e che il valore
  coincida con quello in `/etc/nginx/snippets/bikerlink-nominatim.conf`.
- Ricontrolla che l'`include` sia nel `server { ... }` giusto (quello del Funnel).

**nginx restituisce 404 sulle rotte `/nominatim/...`**
- L'`include` non è nel blocco server corretto, oppure manca lo slash finale.
  L'URL deve essere `…/nominatim/search?…` (lo script gestisce il `rewrite`).

**L'import si è interrotto a metà**
```bash
# Droppare il database e ricominciare
sudo -u postgres dropdb nominatim
# Rieseguire lo script (senza SKIP_IMPORT)
bash setup-nominatim-server.sh
```

**Aggiungere dati di altri paesi/regioni**

Nominatim supporta un solo import per database. Per importare più paesi:

```bash
# Opzione A: usa un file PBF che li include già (es. Europa)
OSM_PBF_URL="https://download.geofabrik.de/europe-latest.osm.pbf" \
  bash setup-nominatim-server.sh
# Nota: l'Europa completa richiede ~500 GB di disco e molte ore di import.

# Opzione B: merge manuale di PBF prima dell'import
# Usa osmium-tool: sudo apt install osmium-tool
osmium merge italy-latest.osm.pbf france-latest.osm.pbf -o merged.osm.pbf
OSM_PBF_URL="file:///path/to/merged.osm.pbf" bash setup-nominatim-server.sh
```

**Aggiornare i dati OSM (daily/weekly diff)**

L'aggiornamento incrementale non è incluso in questo script (task futuro).
Nel frattempo è possibile farlo manualmente:

```bash
# Installa pyosmium
sudo pip3 install osmium

# Configura le repliche Geofabrik
sudo -u nominatim /opt/nominatim/build/nominatim replication \
  --project-dir /opt/nominatim \
  --init

# Esegui un aggiornamento
sudo -u nominatim /opt/nominatim/build/nominatim replication \
  --project-dir /opt/nominatim
```

**Disco pieno durante l'import**
```bash
# Controlla lo spazio libero
df -h /opt/nominatim
# L'import per l'Italia richiede ~35–40 GB di spazio totale (PBF + PostgreSQL).
```

---

## 7. Struttura dei file installati

```
/opt/nominatim/
├── build/            ← binari compilati (nominatim, …)
│   └── nominatim     ← eseguibile principale
├── data/
│   └── italy-latest.osm.pbf  ← dati OSM scaricati
└── nominatim.log     ← log runtime (via journald)

/etc/systemd/system/nominatim.service        ← unit file systemd
/etc/nginx/snippets/bikerlink-nominatim.conf ← snippet nginx (generato)
```

---

## 8. Riferimenti

- Script di setup: [`scripts/setup-nominatim-server.sh`](../scripts/setup-nominatim-server.sh)
- Pattern token auth di riferimento: [`server/graphhopper-client.ts`](../server/graphhopper-client.ts)
- Script analoga per Ollama: [`scripts/setup-ollama-server.sh`](../scripts/setup-ollama-server.sh)
- Download dati Geofabrik: <https://download.geofabrik.de/europe/italy.html>
- Documentazione API Nominatim: <https://nominatim.org/release-docs/latest/api/Search/>
- Documentazione installazione Nominatim: <https://nominatim.org/release-docs/latest/admin/Installation/>
