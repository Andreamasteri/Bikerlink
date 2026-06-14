#!/usr/bin/env bash
# 02 — monitor stato build Valhalla (aggiorna ogni 5s, Ctrl+C per uscire)

LOG="/tmp/valhalla-build.log"

while true; do
  clear
  echo "=== VALHALLA BUILD MONITOR — $(date '+%H:%M:%S') ==="
  echo ""

  echo "--- Container Docker ---"
  docker ps --filter "name=bikerlink-valhalla" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null \
    || echo "[WARN] Docker non raggiungibile"
  echo ""

  echo "--- Tiles (dimensione) ---"
  du -sh ~/valhalla/data/valhalla_tiles 2>/dev/null || echo "(cartella non ancora creata)"
  echo ""

  echo "--- Ultime righe log ($LOG) ---"
  if [ -f "$LOG" ]; then
    tail -30 "$LOG"
  else
    echo "(log non ancora creato — build non avviata?)"
  fi

  echo ""
  echo "[Ctrl+C per uscire]"
  sleep 5
done
