#!/usr/bin/env bash
# reset — elimina ~/valhalla/ intera per ripartire da uno stato pulito
#
# Flusso consigliato:
#   reset.sh  ← partenza pulita
#   usb.sh    ← ricopia PBF dalla pennetta USB
#   swap.sh   ← swapfile (OBBLIGATORIO su 16 GB)
#   cpu.sh    ← governor performance
#   04.sh     ← check pre-build
#   05.sh     ← avvia build
set -euo pipefail

VALHALLA_DIR="$HOME/valhalla"
CONTAINER="bikerlink-valhalla-build"

ok()   { echo "[OK]   $1"; }
warn() { echo "[WARN] $1"; }
fail() { echo "[FAIL] $1"; }

echo "=== RESET VALHALLA — PARTENZA PULITA ==="
echo ""
echo "Questa operazione elimina in modo IRREVERSIBILE:"
echo "  - Container $CONTAINER (se in esecuzione)"
echo "  - Tutta la cartella $VALHALLA_DIR/"
echo "    (tiles, PBF europe-latest.osm.pbf, config — tutto)"
echo ""
echo "Dopo il reset dovrai ricopiare il PBF dalla pennetta USB con usb.sh."
echo ""
read -rp "Sei sicuro? [s/N] " CONFIRM
if [[ "$CONFIRM" != "s" && "$CONFIRM" != "S" ]]; then
  echo "Annullato."
  exit 0
fi

echo ""

# 1. Ferma e rimuovi il container se in esecuzione o presente
echo "[>] Verifico container $CONTAINER..."
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER}$"; then
  echo "[>] Fermo container in esecuzione..."
  docker stop "$CONTAINER" 2>/dev/null && ok "Container fermato." || warn "Stop fallito — procedo comunque."
fi
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER}$"; then
  echo "[>] Rimuovo container..."
  docker rm "$CONTAINER" 2>/dev/null && ok "Container rimosso." || warn "Rimozione fallita — procedo comunque."
else
  ok "Container non trovato (già rimosso o mai creato)."
fi

# 2. Mostra spazio prima
echo ""
echo "[>] Spazio disco prima della pulizia:"
df -h "$HOME" | tail -1 | awk '{printf "    Usato: %s  Libero: %s  Totale: %s\n", $3, $4, $2}'

if [ -d "$VALHALLA_DIR" ]; then
  DIR_SIZE=$(du -sh "$VALHALLA_DIR" 2>/dev/null | cut -f1 || echo "N/A")
  echo "    Cartella $VALHALLA_DIR: $DIR_SIZE"
fi

# 3. Rimuovi ~/valhalla/
echo ""
echo "[>] Rimuovo $VALHALLA_DIR/ ..."
if [ -d "$VALHALLA_DIR" ]; then
  rm -rf "$VALHALLA_DIR"
  ok "Cartella $VALHALLA_DIR eliminata."
else
  ok "Cartella $VALHALLA_DIR non esiste — nulla da eliminare."
fi

# 4. Mostra spazio dopo
echo ""
echo "[>] Spazio disco dopo la pulizia:"
df -h "$HOME" | tail -1 | awk '{printf "    Usato: %s  Libero: %s  Totale: %s\n", $3, $4, $2}'

# 5. Avvisi finali
echo ""
warn "Il PBF (europe-latest.osm.pbf) è stato eliminato con tutto il resto."
warn "Esegui usb.sh per ricopiarlo dalla pennetta USB prima di avviare la build."
echo ""
echo "=== Reset completato ==="
echo ""
echo "Prossimi passi:"
echo "  ./usb.sh    ← copia PBF dalla USB"
echo "  ./swap.sh   ← swapfile 32–48 GB (OBBLIGATORIO su 16 GB)"
echo "  ./cpu.sh    ← governor performance (opzionale)"
echo "  ./04.sh     ← check pre-build"
echo "  ./05.sh     ← avvia build"
