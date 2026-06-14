#!/usr/bin/env bash
# 04 — verifica pre-build Valhalla (OK / WARN / FAIL per ogni check)

PBF="$HOME/valhalla/data/europe-latest.osm.pbf"
TILES="$HOME/valhalla/data/valhalla_tiles"
MIN_PBF_GB=1
MIN_DISK_GB=80

ok()   { echo "[OK]   $1"; }
warn() { echo "[WARN] $1"; }
fail() { echo "[FAIL] $1"; FAILURES=$((FAILURES+1)); }

FAILURES=0

echo "=== CHECK PRE-BUILD VALHALLA ==="
echo ""

# 1. PBF esiste
if [ -f "$PBF" ]; then
  ok "PBF trovato: $PBF"
else
  fail "PBF NON trovato: $PBF"
  echo "       Scaricalo con:"
  echo "       wget -c -P ~/valhalla/data/ https://download.geofabrik.de/europe-latest.osm.pbf"
fi

# 2. Dimensione PBF > 1 GB
if [ -f "$PBF" ]; then
  PBF_SIZE=$(stat -c%s "$PBF" 2>/dev/null || stat -f%z "$PBF" 2>/dev/null || echo 0)
  PBF_GB=$(awk "BEGIN{printf \"%.1f\", $PBF_SIZE/1073741824}")
  if [ "$PBF_SIZE" -ge $((MIN_PBF_GB * 1073741824)) ]; then
    ok "Dimensione PBF: ${PBF_GB} GB (>= ${MIN_PBF_GB} GB)"
  else
    fail "PBF troppo piccolo: ${PBF_GB} GB (atteso >= ${MIN_PBF_GB} GB) — file corrotto o incompleto"
  fi
fi

# 3. Cartella tiles assente (indicherebbe build precedente incompleta)
if [ -d "$TILES" ]; then
  TILES_SIZE=$(du -sh "$TILES" 2>/dev/null | cut -f1)
  warn "Cartella valhalla_tiles già presente (${TILES_SIZE}). Se la build è completa ignora questo avviso. Altrimenti esegui 03.sh per pulire."
else
  ok "Cartella valhalla_tiles assente (pulizia non necessaria)"
fi

# 4. Docker disponibile e in esecuzione
if docker info &>/dev/null; then
  ok "Docker disponibile e in esecuzione"
else
  fail "Docker non disponibile o non in esecuzione (sudo systemctl start docker)"
fi

# 5. Spazio disco libero >= 80 GB
DISK_FREE_KB=$(df "$HOME" | tail -1 | awk '{print $4}')
DISK_FREE_GB=$((DISK_FREE_KB / 1048576))
if [ "$DISK_FREE_GB" -ge "$MIN_DISK_GB" ]; then
  ok "Spazio disco libero: ${DISK_FREE_GB} GB (>= ${MIN_DISK_GB} GB consigliati)"
else
  warn "Spazio disco libero: ${DISK_FREE_GB} GB — consigliati almeno ${MIN_DISK_GB} GB per Europe. Procedi con cautela."
fi

echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo "=== Tutti i check superati — puoi eseguire 05.sh ==="
else
  echo "=== $FAILURES check FALLITI — risolvi i problemi prima di procedere ==="
  exit 1
fi
