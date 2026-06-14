#!/usr/bin/env bash
# 09 — monitor stato import Nominatim (aggiorna ogni 5s, Ctrl+C per uscire)

LOG="/tmp/nominatim-import.log"

while true; do
  clear
  echo "=== NOMINATIM IMPORT MONITOR — $(date '+%H:%M:%S') ==="
  echo ""

  echo "--- Container Docker ---"
  docker ps --filter "name=bikerlink-nominatim" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null \
    || echo "[WARN] Docker non raggiungibile"
  echo ""

  echo "--- Screen session ---"
  screen -ls 2>/dev/null | grep nominatim-import || echo "(nessuna sessione nominatim-import attiva)"
  echo ""

  echo "--- Test HTTP (risponde solo dopo il completamento dell'import) ---"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:8080/search?q=Roma&format=json&limit=1" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    echo "[OK] Server risponde (HTTP 200) — import completato!"
  elif [ "$HTTP_CODE" = "000" ]; then
    echo "(nessuna risposta — import probabilmente ancora in corso)"
  else
    echo "(HTTP $HTTP_CODE)"
  fi
  echo ""

  echo "--- Ultime righe log ($LOG) ---"
  if [ -f "$LOG" ]; then
    tail -30 "$LOG"
  else
    echo "(log non ancora creato — import non avviato?)"
  fi

  echo ""
  echo "[Ctrl+C per uscire]"
  sleep 5
done
