# OSM Monthly Update — BikerLink

Script per l'aggiornamento mensile automatico dei dati OpenStreetMap usati da GraphHopper.

## File

| File | Scopo |
|---|---|
| `update-osm.sh` | Script principale (download, merge, re-import, restart) |
| `notify.sh` | Helper notifica Slack / email |

## Deploy

```bash
# 1. Copia gli script sul server
sudo mkdir -p /opt/graphhopper/scripts
sudo cp update-osm.sh notify.sh /opt/graphhopper/scripts/
sudo chmod +x /opt/graphhopper/scripts/*.sh

# 2. Crea la directory log
sudo mkdir -p /var/log/bikerlink

# 3. Crea file .env con le variabili (vedere sezione Variabili)
sudo nano /opt/graphhopper/scripts/.env
```

## Cron — 1° del mese alle 02:00 Europe/Rome

Aggiungere con `sudo crontab -e` (utente con permessi systemd):

```cron
CRON_TZ=Europe/Rome
0 2 1 * * /bin/bash -a -c 'set -o allexport; source /opt/graphhopper/scripts/.env; set +o allexport; /opt/graphhopper/scripts/update-osm.sh >> /var/log/bikerlink/osm-update.log 2>&1'
```

## Variabili d'ambiente

Creare `/opt/graphhopper/scripts/.env`:

```bash
# Area Geofabrik (default: italy)
OSM_AREA=italy

# URL custom .pbf (override automatico se OSM_AREA impostato)
# GEOFABRIK_URL=https://download.geofabrik.de/europe/italy-latest.osm.pbf

# Percorsi GraphHopper
GH_DIR=/opt/graphhopper
GH_DATA_DIR=/opt/graphhopper/data
GH_JAR=/opt/graphhopper/graphhopper.jar
GH_CONFIG=/opt/graphhopper/config.yml
GH_SERVICE=graphhopper

# Segreto interno per aggiornare il campo DB (stesso valore in Replit Secrets)
OSM_UPDATE_SECRET=<segreto-sicuro>
BACKEND_URL=https://biker-link.replit.app

# Notifiche (almeno uno dei due)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
NOTIFY_EMAIL=admin@bikerlink.app
```

## Esecuzione manuale (test)

```bash
sudo OSM_UPDATE_SECRET=xxx SLACK_WEBHOOK_URL=yyy \
  /opt/graphhopper/scripts/update-osm.sh
```

Verificare log:

```bash
tail -f /var/log/bikerlink/osm-update.log
```

## Endpoint backend

L'endpoint `POST /api/admin/maps/osm-updated` aggiorna la data ultimo aggiornamento OSM in `app_settings` (chiave `osm_last_updated_at`). Richiede header `X-OSM-Update-Secret` uguale alla variabile d'ambiente `OSM_UPDATE_SECRET` configurata nel backend.

Il pannello Admin → Mappe mostra la data dell'ultimo aggiornamento riuscito.
