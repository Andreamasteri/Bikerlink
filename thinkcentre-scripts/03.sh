#!/usr/bin/env bash
# 03 — pulizia completa Valhalla (tiles + log + container)
set -euo pipefail

echo "=== PULIZIA VALHALLA ==="
echo ""
echo "Verranno eliminati:"
echo "  - Container bikerlink-valhalla-build (se in esecuzione)"
echo "  - ~/valhalla/data/valhalla_tiles/"
echo "  - /tmp/valhalla-build.log"
echo ""
read -rp "Sei sicuro? [s/N] " CONFIRM
if [[ "$CONFIRM" != "s" && "$CONFIRM" != "S" ]]; then
  echo "Annullato."
  exit 0
fi

echo ""
echo "[>] Fermo container (se esiste)..."
docker stop bikerlink-valhalla-build 2>/dev/null && echo "[OK] Container fermato." || echo "[--] Container non in esecuzione."

echo "[>] Rimuovo tiles..."
BEFORE=$(df -h ~/valhalla/data 2>/dev/null | tail -1 | awk '{print $4}' || echo "N/A")
sudo rm -rf ~/valhalla/data/valhalla_tiles
AFTER=$(df -h ~/valhalla/data 2>/dev/null | tail -1 | awk '{print $4}' || echo "N/A")
echo "[OK] Tiles rimossi. Spazio libero: $BEFORE → $AFTER"

echo "[>] Rimuovo log Valhalla..."
rm -f /tmp/valhalla-build.log
echo "[OK] Log rimosso."

echo ""
echo "[OK] Pulizia completata. Puoi ripartire con 05.sh"
