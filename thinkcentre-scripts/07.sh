#!/usr/bin/env bash
# 07 — preparazione workspace Nominatim (directory + docker-compose.yml)
set -euo pipefail

PBF_SRC="$HOME/valhalla/data/europe-latest.osm.pbf"
NOM_DIR="$HOME/nominatim"
NOM_DATA="$NOM_DIR/data"
NOM_PBF="$NOM_DATA/europe-latest.osm.pbf"
COMPOSE="$NOM_DIR/docker-compose.yml"

echo "=== PREPARAZIONE WORKSPACE NOMINATIM ==="
echo ""

# 1. Crea directory
mkdir -p "$NOM_DATA"
echo "[OK] Directory creata: $NOM_DATA"

# 2. Collegamento PBF
if [ -f "$NOM_PBF" ]; then
  echo "[OK] PBF già presente in $NOM_DATA"
elif [ -f "$PBF_SRC" ]; then
  echo "[>] Creo link simbolico PBF da $PBF_SRC..."
  ln -sf "$PBF_SRC" "$NOM_PBF"
  echo "[OK] Link simbolico creato: $NOM_PBF -> $PBF_SRC"
else
  echo "[FAIL] PBF non trovato né in $NOM_DATA né in $PBF_SRC"
  echo "       Scaricalo con:"
  echo "       wget -c -P ~/valhalla/data/ https://download.geofabrik.de/europe-latest.osm.pbf"
  exit 1
fi

# 3. Crea docker-compose.yml (solo se non esiste già)
if [ -f "$COMPOSE" ]; then
  echo "[OK] $COMPOSE già presente — non sovrascritto."
else
  echo ""
  read -rp "Password per il DB interno Nominatim (Invio = genera casuale): " NOM_PASS
  if [ -z "$NOM_PASS" ]; then
    NOM_PASS="nom_$(tr -dc 'a-z0-9' < /dev/urandom | head -c 16)"
    echo "[OK] Password generata automaticamente."
  fi

  cat > "$COMPOSE" <<COMPOSE_EOF
services:
  nominatim:
    image: mediagis/nominatim:4.4
    container_name: bikerlink-nominatim
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      PBF_PATH: /nominatim/data/europe-latest.osm.pbf
      REPLICATION_URL: https://download.geofabrik.de/europe-updates/
      NOMINATIM_PASSWORD: ${NOM_PASS}
      THREADS: 8
    volumes:
      - ./data:/nominatim/data
      - nominatim-db:/var/lib/postgresql/14/main
    shm_size: 1g

volumes:
  nominatim-db:
COMPOSE_EOF
  echo "[OK] docker-compose.yml creato: $COMPOSE"
  echo "[!] Salva la password se vuoi riconnetterti al DB manualmente: $NOM_PASS"
fi

echo ""
echo "=== Prossimi passi ==="
echo "  1. Esegui 08.sh per avviare l'import (durata stimata: 6-24h per Europe)"
echo "  2. Monitora con: 09.sh"
echo "  3. Quando l'import è finito, il server è disponibile su http://localhost:8080"
echo ""
echo "  Test rapido (dopo l'import):"
echo "  curl 'http://localhost:8080/search?q=Roma&format=json&limit=1'"
