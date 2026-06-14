#!/usr/bin/env bash
# 06 — verifica post-build Valhalla e test HTTP

TILES="$HOME/valhalla/data/valhalla_tiles"
CONTAINER="bikerlink-valhalla-build"
LOG="/tmp/valhalla-build.log"
VALHALLA_URL="http://localhost:8002"

echo "=== VERIFICA POST-BUILD VALHALLA ==="
echo ""

# 1. Tiles presenti e non vuoti
if [ -d "$TILES" ] && [ -n "$(ls -A "$TILES" 2>/dev/null)" ]; then
  TILES_SIZE=$(du -sh "$TILES" | cut -f1)
  echo "[OK] valhalla_tiles presente — ${TILES_SIZE}"
else
  echo "[FAIL] valhalla_tiles assente o vuota."
  echo "       La build non è terminata o è fallita."
  if [ -f "$LOG" ]; then
    echo ""
    echo "--- Ultime righe log ---"
    tail -20 "$LOG"
  fi
  exit 1
fi

# 2. Stato container
echo ""
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "[OK] Container '$CONTAINER' ancora in esecuzione (serve in corso)"
elif docker ps -a --format '{{.Names}}\t{{.Status}}' | grep -q "^${CONTAINER}"; then
  STATUS=$(docker ps -a --filter "name=$CONTAINER" --format '{{.Status}}')
  echo "[WARN] Container presente ma non attivo: $STATUS"
else
  echo "[INFO] Container non trovato — potrebbe essere terminato dopo la build (comportamento normale con --rm)"
fi

# 3. Test HTTP /status
echo ""
echo "[>] Test HTTP $VALHALLA_URL/status ..."
HTTP_CODE=$(curl -s -o /tmp/valhalla-status.json -w "%{http_code}" --max-time 5 "$VALHALLA_URL/status" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  echo "[OK] Server risponde (HTTP 200)"
  echo "     Response: $(cat /tmp/valhalla-status.json 2>/dev/null)"
elif [ "$HTTP_CODE" = "000" ]; then
  echo "[FAIL] Nessuna risposta — il server non è in ascolto su $VALHALLA_URL"
  echo "       Se la build è appena finita, attendi qualche secondo e riprova."
else
  echo "[WARN] Server risponde ma con HTTP $HTTP_CODE"
  cat /tmp/valhalla-status.json 2>/dev/null
fi

echo ""
echo "=== Fine report ==="
