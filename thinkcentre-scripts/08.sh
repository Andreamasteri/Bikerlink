#!/usr/bin/env bash
# 08 — avvio import Nominatim (in screen, sopravvive al disconnect SSH)
set -euo pipefail

NOM_DIR="$HOME/nominatim"
LOG="/tmp/nominatim-import.log"
SCREEN_NAME="nominatim-import"
COMPOSE="$NOM_DIR/docker-compose.yml"

echo "=== AVVIO IMPORT NOMINATIM ==="
echo ""

# Verifica docker-compose.yml
if [ ! -f "$COMPOSE" ]; then
  echo "[FAIL] $COMPOSE non trovato. Esegui prima 07.sh"
  exit 1
fi
echo "[OK] docker-compose.yml trovato"

# Verifica PBF
if [ ! -f "$NOM_DIR/data/europe-latest.osm.pbf" ] && [ ! -L "$NOM_DIR/data/europe-latest.osm.pbf" ]; then
  echo "[FAIL] PBF non trovato in $NOM_DIR/data/. Esegui prima 07.sh"
  exit 1
fi
echo "[OK] PBF presente"

# Verifica screen session già esistente
if screen -ls 2>/dev/null | grep -q "$SCREEN_NAME"; then
  echo "[WARN] Screen session '$SCREEN_NAME' già esistente. La termino..."
  screen -S "$SCREEN_NAME" -X quit 2>/dev/null || true
  sleep 1
fi

echo ""
echo "[!] ATTENZIONE: l'import di Europe richiede tra 6 e 24 ore."
echo "    Il processo girerà in background — puoi disconnetterti liberamente."
echo ""
read -rp "Avviare l'import? [s/N] " CONFIRM
if [[ "$CONFIRM" != "s" && "$CONFIRM" != "S" ]]; then
  echo "Annullato."
  exit 0
fi

echo ""
echo "[>] Avvio import in screen '$SCREEN_NAME'..."
echo "[>] Log: $LOG"

screen -dmS "$SCREEN_NAME" bash -c "
  cd $NOM_DIR
  docker compose up 2>&1 | tee $LOG
  echo '=== NOMINATIM IMPORT TERMINATO: '\$(date)' ===' >> $LOG
"

sleep 1

if screen -ls 2>/dev/null | grep -q "$SCREEN_NAME"; then
  echo "[OK] Import avviato in background."
else
  echo "[WARN] Screen non trovata subito dopo l'avvio — controlla il log."
fi

echo ""
echo "Monitora con:"
echo "  tail -f $LOG"
echo "  oppure: ./09.sh"
echo ""
echo "Stato container: docker ps | grep nominatim"
echo "Stato screen:    screen -ls"
