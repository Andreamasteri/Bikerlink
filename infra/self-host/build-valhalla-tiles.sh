#!/usr/bin/env bash
# =============================================================================
# BikerLink — build-valhalla-tiles.sh
# Builda (o ricostruisce) i tile Valhalla a partire dai PBF per area in ./data,
# mostrando i log in tempo reale e verificando lo stato del server al termine.
#
# Cosa fa:
#   1. Verifica i prerequisiti (Docker + plugin compose, curl, osmium).
#   2. Unisce i PBF delle aree core in valhalla-merged.osm.pbf (se necessario).
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
#       Se i PBF per area mancano, lancia prima: ./download-osm.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DATA_DIR="${DATA_DIR:-${SCRIPT_DIR}/data}"
ENV_FILE="${SCRIPT_DIR}/.env"

MERGED_PBF="${DATA_DIR}/valhalla-merged.osm.pbf"

# Aree core da unire per Valhalla (modifica se vuoi coprire aree on-demand).
VALHALLA_AREAS=(grecia balcani iberia arco-alpino)

VALHALLA_PORT="${VALHALLA_PORT:-8002}"
STATUS_URL="http://localhost:${VALHALLA_PORT}/status"

BUILD_TIMEOUT_SECS="${BUILD_TIMEOUT_SECS:-10800}"
POLL_INTERVAL_SECS="${POLL_INTERVAL_SECS:-30}"

log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRORE: $*" >&2; exit 1; }

DOCKER="docker"; docker info >/dev/null 2>&1 || DOCKER="sudo docker"
COMPOSE="$DOCKER compose"
[[ -f "$ENV_FILE" ]] && COMPOSE="$DOCKER compose --env-file $ENV_FILE"

# ── Prerequisiti ──────────────────────────────────────────────────────────────
command -v curl   >/dev/null 2>&1 || die "curl non installato (sudo apt install -y curl)"
command -v osmium >/dev/null 2>&1 || die "osmium non installato (sudo apt install -y osmium-tool)"
$DOCKER compose version >/dev/null 2>&1 || die "Docker Compose plugin non disponibile. Installa con: sudo apt install -y docker-compose-plugin"

# ── Verifica PBF per area presenti ────────────────────────────────────────────
AREA_PBFS=()
MISSING=()
for area in "${VALHALLA_AREAS[@]}"; do
  pbf="${DATA_DIR}/${area}.osm.pbf"
  if [[ -f "$pbf" ]]; then
    AREA_PBFS+=("$pbf")
  else
    MISSING+=("$area")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  log "[PBF] Aree mancanti: ${MISSING[*]}"
  log "[PBF] Lancia prima: ./download-osm.sh"
  log "[PBF] oppure: AREAS=\"${MISSING[*]}\" ./download-osm.sh"
  die "PBF mancanti per le aree: ${MISSING[*]}"
fi

# ── Merge PBF aree → valhalla-merged.osm.pbf ─────────────────────────────────
needs_merge=false
if [[ ! -f "$MERGED_PBF" ]]; then
  needs_merge=true
else
  for pbf in "${AREA_PBFS[@]}"; do
    if [[ "$pbf" -nt "$MERGED_PBF" ]]; then
      needs_merge=true; break
    fi
  done
fi

if [[ "$needs_merge" == "true" ]]; then
  log "[PBF] Unione PBF aree in ${MERGED_PBF}..."
  osmium merge "${AREA_PBFS[@]}" -o "$MERGED_PBF" --overwrite
  log "[PBF] merge completato ✓ ($(du -h "$MERGED_PBF" | cut -f1))"
else
  log "[PBF] ${MERGED_PBF} già aggiornato ($(du -h "$MERGED_PBF" | cut -f1)) — skip merge"
fi

echo "============================================================"
echo " BikerLink — Build tile Valhalla"
echo " PBF sorgente : ${MERGED_PBF} ($(du -h "$MERGED_PBF" | cut -f1))"
echo " Aree incluse : ${VALHALLA_AREAS[*]}"
echo " Status URL   : ${STATUS_URL}"
echo " Timeout build: $((BUILD_TIMEOUT_SECS / 3600))h (${BUILD_TIMEOUT_SECS}s)"
echo "============================================================"

# ── 1. Avvio con force_rebuild=True ──────────────────────────────────────────
log "[Valhalla] avvio container in modalità build (force_rebuild=True)..."
VALHALLA_FORCE_REBUILD=True $COMPOSE up -d --force-recreate valhalla

# ── 2. Segui i log in background ──────────────────────────────────────────────
log "[Valhalla] log in tempo reale (Ctrl-C interrompe SOLO il tail, non il build):"
$COMPOSE logs -f --since 1s valhalla &
LOGS_PID=$!
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

[[ "$serve_ok" == "true" ]] || die "[Valhalla] /status non è tornato online entro 5 min. Controlla: $COMPOSE logs -f valhalla"

echo "============================================================"
echo " ✓ Tile Valhalla pronti."
echo "   - Verifica:  curl ${STATUS_URL}"
echo "   - Imposta nei Secrets Replit:  VALHALLA_URL=http://<IP-ThinkCentre>:${VALHALLA_PORT}"
echo "   - Poi: pannello Admin → Mappe → Test routing"
echo "============================================================"
