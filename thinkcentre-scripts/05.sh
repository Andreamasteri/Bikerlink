#!/usr/bin/env bash
# 05 — avvio build grafo Valhalla (in screen, sopravvive al disconnect SSH)
set -euo pipefail

PBF="$HOME/valhalla/data/europe-latest.osm.pbf"
LOG="/tmp/valhalla-build.log"
CONTAINER="bikerlink-valhalla-build"
SCREEN_NAME="valhalla-build"

echo "=== AVVIO BUILD VALHALLA ==="
echo ""

# Verifica PBF
if [ ! -f "$PBF" ]; then
  echo "[FAIL] PBF non trovato: $PBF"
  echo "       Esegui prima 04.sh per la verifica completa."
  exit 1
fi
echo "[OK] PBF trovato: $PBF"

# Avviso swap (non bloccante): su 16 GB la build muore senza swap.
# Il check completo (RAM + swap, con FAIL) è in 04.sh — qui solo un promemoria.
SWAP_GB=$(awk '/SwapTotal/{printf "%d", $2/1048576}' /proc/meminfo)
RAM_GB=$(awk '/MemTotal/{printf "%d", $2/1048576}' /proc/meminfo)
if [ "$SWAP_GB" -lt 32 ] && [ "$RAM_GB" -lt 30 ]; then
  echo "[WARN] Swap attivo: ${SWAP_GB} GB su ${RAM_GB} GB di RAM — rischio OOM-kill durante la build Europa."
  echo "       Consigliato: interrompi (Ctrl+C), esegui ./swap.sh, poi 04.sh, quindi riavvia 05.sh."
fi

# Verifica container già in esecuzione
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "[FAIL] Container '$CONTAINER' già in esecuzione."
  echo "       Ferma prima con: docker stop $CONTAINER"
  exit 1
fi

# Verifica screen session già esistente
if screen -ls 2>/dev/null | grep -q "$SCREEN_NAME"; then
  echo "[WARN] Screen session '$SCREEN_NAME' già esistente. La termino..."
  screen -S "$SCREEN_NAME" -X quit 2>/dev/null || true
  sleep 1
fi

echo "[>] Avvio build in screen '$SCREEN_NAME'..."
echo "[>] Log: $LOG"
echo ""

# --shm-size=8g: alzato per i 16 GB. Valhalla usa /dev/shm per i file temporanei
# delle fasi di parsing/enhancer; uno shm più capiente riduce la pressione su /tmp.
# NOTA concurrency: l'immagine ghcr.io/gis-ops/docker-valhalla NON espone una env
# per ridurre i thread di build (la concurrency è hardcoded in valhalla.json,
# generato dall'entrypoint). La mitigazione universale dei picchi RAM è quindi lo
# SWAP capiente su SSD (vedi ./swap.sh e il check in 04.sh), non la concurrency.
screen -dmS "$SCREEN_NAME" bash -c "
  docker run --rm --name $CONTAINER --shm-size=8g \
    -v \"$HOME/valhalla/data:/custom_files\" \
    -p 8002:8002 \
    -e use_tiles_ignore_pbf=False \
    -e serve_tiles=True \
    -e build_admins=True \
    -e build_time_zones=True \
    -e build_elevation=False \
    -e force_rebuild=True \
    ghcr.io/gis-ops/docker-valhalla/valhalla:latest \
    2>&1 | tee $LOG
  echo '=== VALHALLA BUILD TERMINATO: '\$(date)' ===' >> $LOG
"

sleep 1

if screen -ls 2>/dev/null | grep -q "$SCREEN_NAME"; then
  echo "[OK] Build avviata in background."
else
  echo "[WARN] Screen non trovata subito dopo l'avvio — controlla il log."
fi

echo ""
echo "Monitora con:"
echo "  tail -f $LOG"
echo "  oppure: ./02.sh"
echo ""
echo "Stato container: docker ps | grep $CONTAINER"
echo "Stato screen:    screen -ls"
