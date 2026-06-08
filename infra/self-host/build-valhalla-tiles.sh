#!/usr/bin/env bash
# =============================================================================
# BikerLink — build-valhalla-tiles.sh
# Builda (o ricostruisce) i tile Valhalla a partire dai PBF per-regione in ./data,
# mostrando i log in tempo reale e verificando lo stato del server al termine.
#
# Cosa fa:
#   1. Verifica i prerequisiti (Docker + plugin compose, curl).
#   2. Verifica che almeno un .osm.pbf sia presente in DATA_DIR.
#      Se mancano, suggerisce di eseguire download-regions.sh prima.
#   3. Avvia il container Valhalla con force_rebuild=True (rigenera i tile).
#   4. Segue i log in tempo reale finché /status non risponde (timeout 3h).
#   5. Verifica GET http://localhost:8002/status e stampa version + tile date.
#   6. Ripristina force_rebuild=False ricreando il container (serve i tile).
#
# Uso:
#   ./build-valhalla-tiles.sh
#   DATA_DIR=/mnt/osm ./build-valhalla-tiles.sh
#
# NOTA: il build dei tile può richiedere fino a 3h e molta RAM.
#       Se i PBF mancano, esegui prima: bash download-regions.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DATA_DIR="${DATA_DIR:-${SCRIPT_DIR}/data}"
ENV_FILE="${SCRIPT_DIR}/.env"

VALHALLA_PORT="${VALHALLA_PORT:-8002}"
STATUS_URL="http://localhost:${VALHALLA_PORT}/status"

# Timeout massimo di attesa del build dei tile (secondi). Default 3h.
BUILD_TIMEOUT_SECS="${BUILD_TIMEOUT_SECS:-10800}"
# Intervallo di polling dello /status durante il build (secondi).
POLL_INTERVAL_SECS="${POLL_INTERVAL_SECS:-30}"

log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRORE: $*" >&2; exit 1; }

# ── Docker / compose wrapper (con o senza sudo) ──────────────────────────────
DOCKER="docker"; docker info >/dev/null 2>&1 || DOCKER="sudo docker"
COMPOSE="$DOCKER compose"
[[ -f "$ENV_FILE" ]] && COMPOSE="$DOCKER compose --env-file $ENV_FILE"

# ── Prerequisiti ──────────────────────────────────────────────────────────────
command -v curl >/dev/null 2>&1 || die "curl non installato (sudo apt install -y curl)"
$DOCKER compose version >/dev/null 2>&1 || die "Docker Compose plugin non disponibile. Installa con: sudo apt install -y docker-compose-plugin"

# PBF mancanti → segnala e interrompi (il download è responsabilità di download-regions.sh).
mapfile -t PBF_FILES < <(find "$DATA_DIR" -maxdepth 1 -name '*.osm.pbf' 2>/dev/null | sort)
if [[ ${#PBF_FILES[@]} -eq 0 ]]; then
  die "Nessun .osm.pbf trovato in ${DATA_DIR}/. Esegui prima: bash download-regions.sh"
fi

echo "============================================================"
echo " BikerLink — Build tile Valhalla"
echo " PBF in ${DATA_DIR}/:"
for pbf in "${PBF_FILES[@]}"; do
  echo "   $(basename "$pbf")  ($(du -h "$pbf" | cut -f1))"
done
echo " Status URL   : ${STATUS_URL}"
echo " Timeout build: $((BUILD_TIMEOUT_SECS / 3600))h (${BUILD_TIMEOUT_SECS}s)"
echo "============================================================"

# ── 1. Avvio con force_rebuild=True ──────────────────────────────────────────
# La variabile force_rebuild è letta dal docker-compose.yml (env del container).
# La esportiamo per questa esecuzione; al termine ricreiamo con force_rebuild=False.
log "[Valhalla] avvio container in modalità build (force_rebuild=True)..."
VALHALLA_FORCE_REBUILD=True $COMPOSE up -d --force-recreate valhalla

# ── 2. Segui i log in background ──────────────────────────────────────────────
log "[Valhalla] log in tempo reale (Ctrl-C interrompe SOLO il tail, non il build):"
$COMPOSE logs -f --since 1s valhalla &
LOGS_PID=$!
# Assicura che il tail dei log venga terminato all'uscita dello script.
cleanup() { kill "$LOGS_PID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# ── 3. Attendi che /status risponda (build completato) ───────────────────────
log "[Valhalla] attendo il completamento del build (polling /status ogni ${POLL_INTERVAL_SECS}s)..."
elapsed=0
status_ok=false
while (( elapsed < BUILD_TIMEOUT_SECS )); do
  if curl -fsS --max-time 10 "$STATUS_URL" >/dev/null 2>&1; then
    status_ok=true
    break
  fi
  sleep "$POLL_INTERVAL_SECS"
  elapsed=$((elapsed + POLL_INTERVAL_SECS))
done

cleanup
trap - EXIT

if [[ "$status_ok" != "true" ]]; then
  die "[Valhalla] /status non ha risposto entro $((BUILD_TIMEOUT_SECS / 3600))h. Controlla i log: $COMPOSE logs valhalla"
fi

# ── 4. Verifica e stampa lo stato ────────────────────────────────────────────
log "[Valhalla] build completato ✓ — verifico ${STATUS_URL}"
STATUS_JSON="$(curl -fsS --max-time 10 "$STATUS_URL" || true)"
echo "------------------------------------------------------------"
echo " Risposta /status:"
echo "$STATUS_JSON"
echo "------------------------------------------------------------"

# ── 5. Ripristina force_rebuild=False (serve i tile appena costruiti) ─────────
log "[Valhalla] ripristino force_rebuild=False e riavvio in modalità serve..."
$COMPOSE up -d --force-recreate valhalla

log "[Valhalla] attendo che /status torni online dopo il riavvio..."
elapsed=0
serve_ok=false
while (( elapsed < 300 )); do
  if curl -fsS --max-time 10 "$STATUS_URL" >/dev/null 2>&1; then
    serve_ok=true
    log "[Valhalla] online ✓ — i tile sono serviti."
    break
  fi
  sleep 5
  elapsed=$((elapsed + 5))
done

[[ "$serve_ok" == "true" ]] || die "[Valhalla] /status non è tornato online entro 5 min dopo il riavvio in modalità serve. Controlla: $COMPOSE logs -f valhalla"

echo "============================================================"
echo " ✓ Tile Valhalla pronti."
echo "   - Verifica:  curl ${STATUS_URL}"
echo "   - Imposta nei Secrets Replit:  VALHALLA_URL=http://<IP-ThinkCentre>:${VALHALLA_PORT}"
echo "   - Poi: pannello Admin → Mappe → Test routing"
echo "============================================================"
