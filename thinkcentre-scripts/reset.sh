#!/usr/bin/env bash
# reset — pulizia Valhalla con due modalità:
#
#   [1] Soft reset (default)
#       Ferma il container, rimuove tiles e log.
#       Conserva: europe-latest.osm.pbf e l'immagine Docker.
#       Dopo il soft reset puoi ripartire direttamente da 04.sh → 05.sh.
#
#   [2] Reset completo
#       Elimina ~/valhalla/ intera (PBF compreso).
#       Dopo dovrai ricopiare il PBF con usb.sh.
set -euo pipefail

VALHALLA_DIR="$HOME/valhalla"
TILES_DIR="$VALHALLA_DIR/data/valhalla_tiles"
PBF="$VALHALLA_DIR/data/europe-latest.osm.pbf"
CONTAINER="bikerlink-valhalla-build"

ok()   { echo "[OK]   $1"; }
warn() { echo "[WARN] $1"; }
fail() { echo "[FAIL] $1"; }

echo "=== RESET VALHALLA ==="
echo ""
echo "Scegli la modalità:"
echo "  [1] Soft reset   — rimuove tiles e log; conserva PBF e immagine Docker"
echo "  [2] Reset completo — elimina ~/valhalla/ intera (PBF compreso)"
echo ""
read -rp "Scelta [1/2, default 1]: " MODE
case "$MODE" in
  2) MODE=2 ;;
  *) MODE=1 ;;
esac

echo ""
if [ "$MODE" -eq 1 ]; then
  echo "Modalità: SOFT RESET"
  echo "Verranno eliminati:"
  echo "  - Container $CONTAINER (se in esecuzione)"
  echo "  - $TILES_DIR/"
  echo "  - /tmp/valhalla-build.log"
  echo "Conservati: PBF, immagine Docker, config."
else
  echo "Modalità: RESET COMPLETO"
  echo "Verranno eliminati in modo IRREVERSIBILE:"
  echo "  - Container $CONTAINER (se in esecuzione)"
  echo "  - Tutta la cartella $VALHALLA_DIR/ (tiles, PBF, config — tutto)"
fi

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

# 2. Spazio prima
echo ""
echo "[>] Spazio disco prima della pulizia:"
df -h "$HOME" | tail -1 | awk '{printf "    Usato: %s  Libero: %s  Totale: %s\n", $3, $4, $2}'

if [ "$MODE" -eq 1 ]; then
  # ── SOFT RESET ────────────────────────────────────────────────────────────
  echo ""
  echo "[>] Rimuovo tiles..."
  if [ -d "$TILES_DIR" ]; then
    BEFORE=$(df -h "$VALHALLA_DIR/data" 2>/dev/null | tail -1 | awk '{print $4}' || echo "N/A")
    rm -rf "$TILES_DIR"
    AFTER=$(df -h "$VALHALLA_DIR/data" 2>/dev/null | tail -1 | awk '{print $4}' || echo "N/A")
    ok "Tiles rimossi. Spazio libero: $BEFORE → $AFTER"
  else
    ok "Tiles non presenti — nulla da rimuovere."
  fi

  echo "[>] Rimuovo log build..."
  rm -f /tmp/valhalla-build.log
  ok "Log rimosso."

  echo ""
  ok "Soft reset completato."
  if [ -f "$PBF" ]; then
    PBF_SIZE=$(du -sh "$PBF" 2>/dev/null | cut -f1 || echo "N/A")
    ok "PBF conservato: $PBF ($PBF_SIZE)"
  fi
  echo ""
  echo "Prossimi passi:"
  echo "  ./04.sh   ← check pre-build"
  echo "  ./05.sh   ← avvia build"

else
  # ── RESET COMPLETO ────────────────────────────────────────────────────────
  echo ""
  if [ -d "$VALHALLA_DIR" ]; then
    DIR_SIZE=$(du -sh "$VALHALLA_DIR" 2>/dev/null | cut -f1 || echo "N/A")
    echo "    Cartella $VALHALLA_DIR: $DIR_SIZE"
  fi
  echo ""
  echo "[>] Rimuovo $VALHALLA_DIR/ ..."
  if [ -d "$VALHALLA_DIR" ]; then
    rm -rf "$VALHALLA_DIR"
    ok "Cartella $VALHALLA_DIR eliminata."
  else
    ok "Cartella $VALHALLA_DIR non esiste — nulla da eliminare."
  fi

  echo ""
  echo "[>] Spazio disco dopo la pulizia:"
  df -h "$HOME" | tail -1 | awk '{printf "    Usato: %s  Libero: %s  Totale: %s\n", $3, $4, $2}'

  echo ""
  warn "Il PBF (europe-latest.osm.pbf) è stato eliminato con tutto il resto."
  warn "Esegui usb.sh per ricopiarlo dalla pennetta USB prima di avviare la build."
  echo ""
  echo "=== Reset completato ==="
  echo ""
  echo "Prossimi passi:"
  echo "  ./usb.sh    ← copia PBF dalla USB"
  echo "  ./swap.sh   ← swapfile (consigliato su 32 GB, obbligatorio su 16 GB)"
  echo "  ./cpu.sh    ← governor performance (opzionale)"
  echo "  ./04.sh     ← check pre-build"
  echo "  ./05.sh     ← avvia build"
fi
