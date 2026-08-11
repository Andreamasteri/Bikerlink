#!/usr/bin/env bash
# 99 — boot check: riavvio rapido di Valhalla dopo il riavvio ThinkCentre.
# NON esegue rebuild — usa i tiles già presenti su disco.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config-valhalla.sh"
if [ -f "$CONFIG_FILE" ]; then
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
fi

VALHALLA_DATA="${VALHALLA_DATA_DIR:-$HOME/valhalla/data}"
TILES="${VALHALLA_TILES_DIR:-$VALHALLA_DATA/valhalla_tiles}"
VALHALLA_PORT="${VALHALLA_PORT:-8002}"
VALHALLA_IMAGE="${VALHALLA_IMAGE:-ghcr.io/gis-ops/docker-valhalla/valhalla:latest}"
VALHALLA_URL="http://localhost:$VALHALLA_PORT"
VALHALLA_CONTAINER="bikerlink-valhalla-serve"
VALHALLA_SCREEN="valhalla-serve"
VALHALLA_LOG="/tmp/valhalla-serve.log"

echo "======================================================"
echo "  BikerLink — Boot check Valhalla"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================================"

if [ ! -d "$TILES" ] || [ -z "$(ls -A "$TILES" 2>/dev/null)" ]; then
  echo "[FAIL] valhalla_tiles non trovata o vuota: $TILES"
  echo "       Esegui prima 05.sh per costruire il grafo."
  VALHALLA_SKIP=true
else
  echo "[OK]  valhalla_tiles presente — $(du -sh "$TILES" | cut -f1)"
  VALHALLA_SKIP=false
fi

if [ "$VALHALLA_SKIP" = false ]; then
  if docker ps --format '{{.Names}}' | grep -q "^$VALHALLA_CONTAINER$"; then
    echo "[OK]  Container '$VALHALLA_CONTAINER' già in esecuzione."
  else
    screen -S "$VALHALLA_SCREEN" -X quit 2>/dev/null || true
    docker rm -f "$VALHALLA_CONTAINER" >/dev/null 2>&1 || true
    screen -dmS "$VALHALLA_SCREEN" bash -c "
      docker run --name $VALHALLA_CONTAINER --shm-size=4g \
        -v \"$VALHALLA_DATA:/custom_files\" \
        -p $VALHALLA_PORT:8002 \
        -e use_tiles_ignore_pbf=True -e serve_tiles=True \
        -e build_admins=False -e build_time_zones=False \
        -e build_elevation=False -e force_rebuild=False \
        $VALHALLA_IMAGE 2>&1 | tee $VALHALLA_LOG
    "
    echo "[OK]  Valhalla avviato in background."
  fi
fi

sleep 10
if [ "$VALHALLA_SKIP" = false ]; then
  VAL_CODE=$(curl -s -o /tmp/valhalla-boot-status.json -w "%{http_code}" --max-time 5 "$VALHALLA_URL/status" 2>/dev/null || echo "000")
  if [ "$VAL_CODE" = "200" ]; then
    echo "[OK]  Valhalla risponde."
  else
    echo "[WARN] Valhalla HTTP $VAL_CODE — potrebbe essere ancora in avvio."
  fi
fi

echo "======================================================"
docker ps --filter "name=$VALHALLA_CONTAINER" --format "  {{.Names}}  {{.Status}}  {{.Ports}}" 2>/dev/null || true
echo "  Log: tail -f $VALHALLA_LOG"
