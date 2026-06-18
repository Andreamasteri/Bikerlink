#!/usr/bin/env bash
# 99 — boot check: riavvio rapido servizi dopo riavvio ThinkCentre
#      Avvia Valhalla (serve-only, tiles già buildati) e Nominatim.
#      NON esegue rebuild — usa i dati già presenti su disco.
set -euo pipefail

# Config condivisa: parametri di serve (porta, data dir, tiles, immagine) — fonte unica
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config-valhalla.sh"
if [ -f "$CONFIG_FILE" ]; then
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
fi
# Fallback (retro-compatibilità se il config manca)
VALHALLA_DATA="${VALHALLA_DATA_DIR:-$HOME/valhalla/data}"
TILES="${VALHALLA_TILES_DIR:-$VALHALLA_DATA/valhalla_tiles}"
VALHALLA_PORT="${VALHALLA_PORT:-8002}"
VALHALLA_IMAGE="${VALHALLA_IMAGE:-ghcr.io/gis-ops/docker-valhalla/valhalla:latest}"
# Boot-check sempre su localhost (NON usare un eventuale VALHALLA_URL pubblico)
VALHALLA_URL="http://localhost:$VALHALLA_PORT"

VALHALLA_CONTAINER="bikerlink-valhalla-serve"
VALHALLA_SCREEN="valhalla-serve"
VALHALLA_LOG="/tmp/valhalla-serve.log"

NOM_DIR="$HOME/nominatim"
NOM_COMPOSE="$NOM_DIR/docker-compose.yml"
NOM_URL="http://localhost:8080"

echo "======================================================"
echo "  BikerLink — Boot check servizi ThinkCentre"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================================"
echo ""

# ──────────────────────────────────────────────
# 1. VALHALLA
# ──────────────────────────────────────────────
echo "─── VALHALLA ─────────────────────────────────────────"

# 1a. Tiles esistono?
if [ ! -d "$TILES" ] || [ -z "$(ls -A "$TILES" 2>/dev/null)" ]; then
  echo "[FAIL] valhalla_tiles non trovata o vuota: $TILES"
  echo "       Esegui prima 05.sh per costruire il grafo."
  VALHALLA_SKIP=true
else
  TILES_SIZE=$(du -sh "$TILES" | cut -f1)
  echo "[OK]  valhalla_tiles presente — ${TILES_SIZE}"
  VALHALLA_SKIP=false
fi

if [ "$VALHALLA_SKIP" = false ]; then
  # 1b. Container già in esecuzione?
  if docker ps --format '{{.Names}}' | grep -q "^${VALHALLA_CONTAINER}$"; then
    echo "[OK]  Container '$VALHALLA_CONTAINER' già in esecuzione — nessuna azione."
  else
    # 1c. Pulisci screen stale
    if screen -ls 2>/dev/null | grep -q "$VALHALLA_SCREEN"; then
      echo "[WARN] Screen '$VALHALLA_SCREEN' già esistente. La termino..."
      screen -S "$VALHALLA_SCREEN" -X quit 2>/dev/null || true
      sleep 1
    fi

    # 1d. Rimuovi container stale (uscito ma non rimosso)
    if docker ps -a --format '{{.Names}}' | grep -q "^${VALHALLA_CONTAINER}$"; then
      echo "[>]   Rimuovo container stale '$VALHALLA_CONTAINER'..."
      docker rm -f "$VALHALLA_CONTAINER" >/dev/null 2>&1 || true
    fi

    echo "[>]   Avvio Valhalla in serve-only mode (screen: $VALHALLA_SCREEN)..."
    echo "[>]   Log: $VALHALLA_LOG"

    screen -dmS "$VALHALLA_SCREEN" bash -c "
      docker run --name $VALHALLA_CONTAINER --shm-size=4g \
        -v \"$VALHALLA_DATA:/custom_files\" \
        -p $VALHALLA_PORT:8002 \
        -e use_tiles_ignore_pbf=True \
        -e serve_tiles=True \
        -e build_admins=False \
        -e build_time_zones=False \
        -e build_elevation=False \
        -e force_rebuild=False \
        $VALHALLA_IMAGE \
        2>&1 | tee $VALHALLA_LOG
      echo '=== VALHALLA SERVE TERMINATO: '\$(date)' ===' >> $VALHALLA_LOG
    "

    sleep 1
    if screen -ls 2>/dev/null | grep -q "$VALHALLA_SCREEN"; then
      echo "[OK]  Valhalla avviata in background."
    else
      echo "[WARN] Screen non trovata dopo l'avvio — controlla: tail -f $VALHALLA_LOG"
    fi
  fi
fi

echo ""

# ──────────────────────────────────────────────
# 2. NOMINATIM
# ──────────────────────────────────────────────
echo "─── NOMINATIM ────────────────────────────────────────"

if [ ! -f "$NOM_COMPOSE" ]; then
  echo "[FAIL] docker-compose.yml non trovato: $NOM_COMPOSE"
  echo "       Esegui prima 07.sh per preparare il workspace."
  NOMINATIM_SKIP=true
else
  NOMINATIM_SKIP=false
fi

if [ "$NOMINATIM_SKIP" = false ]; then
  # Controlla se il container è già up
  if docker ps --format '{{.Names}}' | grep -q "bikerlink-nominatim"; then
    echo "[OK]  Nominatim già in esecuzione — nessuna azione."
  else
    echo "[>]   Avvio Nominatim (docker compose up -d)..."
    (cd "$NOM_DIR" && docker compose up -d)
    echo "[OK]  Nominatim avviato."
  fi
fi

echo ""

# ──────────────────────────────────────────────
# 3. ATTESA + VERIFICA HTTP
# ──────────────────────────────────────────────
echo "─── VERIFICA HTTP (attendo 10s) ──────────────────────"
sleep 10

# Valhalla
if [ "$VALHALLA_SKIP" = false ]; then
  echo ""
  echo "[>]   Test HTTP Valhalla: $VALHALLA_URL/status"
  VAL_CODE=$(curl -s -o /tmp/valhalla-boot-status.json -w "%{http_code}" \
    --max-time 5 "$VALHALLA_URL/status" 2>/dev/null || echo "000")
  if [ "$VAL_CODE" = "200" ]; then
    echo "[OK]  Valhalla risponde — $(cat /tmp/valhalla-boot-status.json 2>/dev/null)"
  elif [ "$VAL_CODE" = "000" ]; then
    echo "[WARN] Valhalla non risponde ancora (potrebbe impiegare qualche minuto ad avviarsi)."
    echo "       Riprova con: curl $VALHALLA_URL/status"
  else
    echo "[WARN] Valhalla: HTTP $VAL_CODE"
  fi
fi

# Nominatim
if [ "$NOMINATIM_SKIP" = false ]; then
  echo ""
  echo "[>]   Test HTTP Nominatim: $NOM_URL/search?q=Roma&format=json&limit=1"
  NOM_CODE=$(curl -s -o /tmp/nominatim-boot-status.json -w "%{http_code}" \
    --max-time 5 "$NOM_URL/search?q=Roma&format=json&limit=1" 2>/dev/null || echo "000")
  if [ "$NOM_CODE" = "200" ]; then
    echo "[OK]  Nominatim risponde (HTTP 200)"
  elif [ "$NOM_CODE" = "000" ]; then
    echo "[WARN] Nominatim non risponde ancora (normale se l'import non è completato)."
    echo "       Monitora con: ./09.sh"
  else
    echo "[WARN] Nominatim: HTTP $NOM_CODE"
  fi
fi

echo ""
echo "======================================================"
echo "  Stato container:"
docker ps --filter "name=bikerlink-valhalla-serve" \
  --format "  {{.Names}}  {{.Status}}  {{.Ports}}" 2>/dev/null || true
docker ps --filter "name=bikerlink-nominatim" \
  --format "  {{.Names}}  {{.Status}}  {{.Ports}}" 2>/dev/null || true
echo ""
echo "  Screen attive:"
screen -ls 2>/dev/null | grep -E "valhalla-serve|nominatim" \
  | sed 's/^/  /' || echo "  (nessuna)"
echo ""
echo "  Log Valhalla:   tail -f $VALHALLA_LOG"
echo "  Monitor servizi: ./02.sh  (Valhalla)  ./09.sh  (Nominatim)"
echo "======================================================"
