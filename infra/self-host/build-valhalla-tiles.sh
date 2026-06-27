#!/usr/bin/env bash
# =============================================================================
# BikerLink — build-valhalla-tiles.sh
# Builda (o ricostruisce) i tile Valhalla a partire da europeecuador-merged.osm.pbf
# già presente in ./data (prodotto da download-osm.sh — NON va rifatto qui).
#
# Cosa fa:
#   0. Verifica i prerequisiti (Docker + plugin compose, curl, python3).
#   1. Verifica che ${DATA_DIR}/europeecuador-merged.osm.pbf esista (fail rapido se assente).
#   2. Ferma il container Valhalla (se in esecuzione) per liberare i volumi.
#   3. Genera valhalla.json con valhalla_build_config.
#   4. Post-processa valhalla.json con python3 → mjolnir.concurrency = 8.
#   5. Costruisce gli admin database con valhalla_build_admins.
#   6. Costruisce il timezone database con valhalla_build_timezones.
#   7. Costruisce i tile con valhalla_build_tiles (lunga, timeout 6h).
#   8. Crea il tile extract (.tar) con valhalla_build_extract.
#   9. Verifica che i file chiave esistano nel volume.
#  10. Avvia il container in modalità serve (valhalla_service) e verifica /status.
#
# Uso:
#   ./build-valhalla-tiles.sh
#   DATA_DIR=/mnt/osm ./build-valhalla-tiles.sh
#
# NOTA: il build dei tile può richiedere fino a 6h e molta RAM.
#       Se europeecuador-merged.osm.pbf manca, esegui prima: ./download-osm.sh
#
# IMMAGINE: bikerlink/valhalla:latest — build custom da valhalla/valhalla master.
#   CMD=/bin/bash (nessun entrypoint orchestratore gis-ops): i binari vanno invocati
#   esplicitamente tramite "docker compose run --rm -T valhalla".
#
# VOLUMI: tutti gli step di build usano "docker compose run --rm -T valhalla"
#   (NON "docker run -v ...") così il mapping dei volumi è identico al container
#   serve e non dipende dal nome del volume project-scoped generato da Compose.
#
# INTERFACCIA CON update-osm.sh:
#   - Legge le variabili: DATA_DIR, VALHALLA_PORT, SERVE_TIMEOUT_SECS
#   - Exit 0 = successo, exit 1 = errore (identico al comportamento precedente)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DATA_DIR="${DATA_DIR:-${SCRIPT_DIR}/data}"
ENV_FILE="${SCRIPT_DIR}/.env"

MERGED_PBF="${DATA_DIR}/europeecuador-merged.osm.pbf"
VALHALLA_JSON="${DATA_DIR}/valhalla.json"

VALHALLA_PORT="${VALHALLA_PORT:-8002}"
STATUS_URL="http://localhost:${VALHALLA_PORT}/status"

# Timeout per il polling di /status dopo l'avvio del server.
SERVE_TIMEOUT_SECS="${SERVE_TIMEOUT_SECS:-600}"
POLL_INTERVAL_SECS="${POLL_INTERVAL_SECS:-10}"

# Timeout per valhalla_build_tiles (Europa intera è più grande delle 4 aree precedenti).
BUILD_TILES_TIMEOUT_SECS="${BUILD_TILES_TIMEOUT_SECS:-21600}"  # 6 ore

# Percorsi interni al container (come da docker-compose.yml).
CONTAINER_DATA_DIR="/custom_files"
CONTAINER_TILES_DIR="/custom_files/valhalla_tiles"
CONTAINER_PBF="/custom_files/europeecuador-merged.osm.pbf"
CONTAINER_JSON="/custom_files/valhalla.json"
CONTAINER_ADMINS="/custom_files/valhalla_tiles/admins.sqlite"
CONTAINER_TIMEZONES="/custom_files/valhalla_tiles/timezones.sqlite"
CONTAINER_EXTRACT="/custom_files/valhalla_tiles.tar"

# Numero di thread per il build tile (i5-14400 16-thread, 96 GB RAM).
MJOLNIR_CONCURRENCY="${MJOLNIR_CONCURRENCY:-8}"

log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRORE: $*" >&2; exit 1; }

DOCKER="docker"; docker info >/dev/null 2>&1 || DOCKER="sudo docker"
COMPOSE="$DOCKER compose"
[[ -f "$ENV_FILE" ]] && COMPOSE="$DOCKER compose --env-file $ENV_FILE"

# Helper: esegue un binario Valhalla usando "docker compose run" sul servizio
# "valhalla", ereditando gli STESSI volumi del container serve (./data:/custom_files
# + volume Compose project-scoped per i tile).
# -T disabilita il TTY per avere stdout pulito (utile per la redirect di build_config).
compose_run() {
  $COMPOSE run --rm -T valhalla "$@"
}

# ── Prerequisiti ───────────────────────────────────────────────────────────────
command -v curl    >/dev/null 2>&1 || die "curl non installato (sudo apt install -y curl)"
command -v python3 >/dev/null 2>&1 || die "python3 non installato (sudo apt install -y python3-minimal)"
$DOCKER compose version >/dev/null 2>&1 || \
  die "Docker Compose plugin non disponibile. Installa con: sudo apt install -y docker-compose-plugin"

# Verifica che il servizio valhalla sia definito nel compose.
if ! $COMPOSE config --services 2>/dev/null | grep -q '^valhalla$'; then
  die "Servizio 'valhalla' non trovato nel docker-compose.yml."
fi

# Verifica che l'immagine esista localmente.
VALHALLA_IMAGE="$($COMPOSE config --format json 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['services']['valhalla']['image'])" 2>/dev/null \
  || echo "bikerlink/valhalla:latest")"
if ! $DOCKER image inspect "$VALHALLA_IMAGE" >/dev/null 2>&1; then
  die "Immagine '$VALHALLA_IMAGE' non trovata localmente.
  Costruiscila prima con la procedura in infra/self-host/README.md § 'Come ricostruire Valhalla'."
fi

# ── Verifica PBF unificato ─────────────────────────────────────────────────────
if [[ ! -f "$MERGED_PBF" ]]; then
  die "File non trovato: ${MERGED_PBF}
  Il PBF unificato è prodotto da download-osm.sh.
  Esegui prima:  ./download-osm.sh
  (download-osm.sh scarica le aree e le unisce in europeecuador-merged.osm.pbf)"
fi

echo "============================================================"
echo " BikerLink — Build tile Valhalla (immagine custom)"
echo " Immagine         : ${VALHALLA_IMAGE}"
echo " PBF sorgente     : ${MERGED_PBF} ($(du -h "$MERGED_PBF" | cut -f1))"
echo " Concurrency      : ${MJOLNIR_CONCURRENCY} thread"
echo " Timeout build    : $((BUILD_TILES_TIMEOUT_SECS / 3600))h"
echo " Status URL       : ${STATUS_URL}"
echo " Volumi           : stessi del servizio compose (project-scoped)"
echo "============================================================"

# ── 0. Ferma il container Valhalla (se gira) ──────────────────────────────────
log "[Valhalla] fermo il container serve (se in esecuzione)..."
$COMPOSE stop valhalla 2>/dev/null || true
sleep 2

# ── 1. Genera valhalla.json ────────────────────────────────────────────────────
# valhalla_build_config scrive su stdout: lo salviamo in DATA_DIR (montato come
# /custom_files nel container serve). L'opzione -T di compose_run garantisce
# stdout pulito, senza caratteri TTY che corromperebbero il JSON.
log "[1/5] Genero valhalla.json con valhalla_build_config..."
compose_run \
  valhalla_build_config \
    --mjolnir-tile-dir     "${CONTAINER_TILES_DIR}" \
    --mjolnir-tile-extract "${CONTAINER_EXTRACT}" \
    --mjolnir-timezone     "${CONTAINER_TIMEZONES}" \
    --mjolnir-admin        "${CONTAINER_ADMINS}" \
  > "${VALHALLA_JSON}"

# Sanity check: deve essere un JSON valido.
if ! python3 -c "import sys,json; json.load(open('${VALHALLA_JSON}'))" 2>/dev/null; then
  die "valhalla.json generato non è un JSON valido. Controlla l'output di valhalla_build_config."
fi
log "[1/5] valhalla.json generato ✓ ($(wc -l < "${VALHALLA_JSON}") righe)"

# ── 2. Post-processa valhalla.json → mjolnir.concurrency = MJOLNIR_CONCURRENCY ─
log "[2/5] Imposto mjolnir.concurrency = ${MJOLNIR_CONCURRENCY} in valhalla.json..."
python3 - "${VALHALLA_JSON}" "${MJOLNIR_CONCURRENCY}" <<'PYEOF'
import sys, json

path = sys.argv[1]
concurrency = int(sys.argv[2])

with open(path, "r") as f:
    cfg = json.load(f)

# Naviga/crea la chiave mjolnir.concurrency
cfg.setdefault("mjolnir", {})["concurrency"] = concurrency

with open(path, "w") as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"  mjolnir.concurrency = {concurrency} scritto in {path}")
PYEOF
log "[2/5] concurrency impostata ✓"

# ── 3. Costruisci gli admin database ──────────────────────────────────────────
log "[3/5] Costruisco admin database (valhalla_build_admins)..."
log "      Qualche minuto..."
compose_run \
  valhalla_build_admins \
  -c "${CONTAINER_JSON}" \
  "${CONTAINER_PBF}"
log "[3/5] admin database ✓"

# ── 4. Costruisci il timezone database ────────────────────────────────────────
log "[4/5] Costruisco timezone database (valhalla_build_timezones)..."
compose_run \
  valhalla_build_timezones \
  -c "${CONTAINER_JSON}"
log "[4/5] timezone database ✓"

# ── 5. Costruisci i tile ───────────────────────────────────────────────────────
log "[5/5] Costruisco i tile (valhalla_build_tiles) — timeout ${BUILD_TILES_TIMEOUT_SECS}s (~$((BUILD_TILES_TIMEOUT_SECS/3600))h)..."
log "      Sistema target: i5-14400, 96 GB RAM, ${MJOLNIR_CONCURRENCY} thread mjolnir."
timeout "${BUILD_TILES_TIMEOUT_SECS}" \
  $COMPOSE run --rm -T valhalla \
    valhalla_build_tiles \
    -c "${CONTAINER_JSON}" \
    "${CONTAINER_PBF}" \
  || {
    rc=$?
    if [[ $rc -eq 124 ]]; then
      die "valhalla_build_tiles ha superato il timeout di ${BUILD_TILES_TIMEOUT_SECS}s.
  Puoi aumentarlo con: BUILD_TILES_TIMEOUT_SECS=43200 ./build-valhalla-tiles.sh"
    else
      die "valhalla_build_tiles ha restituito exit code ${rc}. Controlla i log sopra."
    fi
  }
log "[5/5] tile build ✓"

# ── 6. Crea il tile extract (.tar) ────────────────────────────────────────────
log "[extra] Creo il tile extract (valhalla_build_extract)..."
compose_run \
  valhalla_build_extract \
  -c "${CONTAINER_JSON}" \
  -v
log "[extra] tile extract ✓"

# ── 7. Verifica che i file chiave esistano nel volume ─────────────────────────
log "[check] Verifico che i file chiave siano presenti nel volume..."
CHECK_ERRORS=()
for artifact in "${CONTAINER_ADMINS}" "${CONTAINER_TIMEZONES}"; do
  if ! compose_run test -f "$artifact" 2>/dev/null; then
    CHECK_ERRORS+=("$artifact")
  fi
done
# Verifica che ci siano file .gph o .bin nella cartella tile (presenza tile).
TILE_COUNT=$(compose_run sh -c "find ${CONTAINER_TILES_DIR} -name '*.gph' -o -name '*.bin' 2>/dev/null | wc -l" 2>/dev/null || echo "0")
if [[ "${TILE_COUNT:-0}" -eq 0 ]]; then
  CHECK_ERRORS+=("${CONTAINER_TILES_DIR} (nessun file tile trovato)")
fi

if [[ ${#CHECK_ERRORS[@]} -gt 0 ]]; then
  die "Build completato ma file mancanti nel volume:
  ${CHECK_ERRORS[*]}
  Controlla i log sopra per errori nelle fasi di build."
fi
log "[check] Verifica ✓ — admins, timezones e tile presenti nel volume."

echo "------------------------------------------------------------"
echo " Build completato. Avvio container serve..."
echo "------------------------------------------------------------"

# ── 8. Avvia il container in modalità serve ───────────────────────────────────
log "[Serve] avvio container Valhalla (valhalla_service)..."
$COMPOSE up -d valhalla

# ── 9. Attendi che /status risponda ───────────────────────────────────────────
log "[Serve] attendo che /status risponda (polling ogni ${POLL_INTERVAL_SECS}s, timeout ${SERVE_TIMEOUT_SECS}s)..."
elapsed=0
serve_ok=false
while (( elapsed < SERVE_TIMEOUT_SECS )); do
  if curl -fsS --max-time 10 "$STATUS_URL" >/dev/null 2>&1; then
    serve_ok=true
    break
  fi
  sleep "$POLL_INTERVAL_SECS"
  elapsed=$((elapsed + POLL_INTERVAL_SECS))
done

if [[ "$serve_ok" != "true" ]]; then
  die "[Serve] /status non ha risposto entro ${SERVE_TIMEOUT_SECS}s. Controlla: $COMPOSE logs -f valhalla"
fi

# ── 10. Verifica e stampa lo stato finale ──────────────────────────────────────
log "[Serve] Valhalla online ✓ — verifico ${STATUS_URL}"
STATUS_JSON="$(curl -fsS --max-time 10 "$STATUS_URL" || true)"
echo "------------------------------------------------------------"
echo " Risposta /status:"
echo "$STATUS_JSON"
echo "------------------------------------------------------------"

echo "============================================================"
echo " ✓ Tile Valhalla pronti e server in ascolto su :${VALHALLA_PORT}"
echo ""
echo "   Verifica:  curl ${STATUS_URL}"
echo "   Imposta nei Secrets Replit:"
echo "     VALHALLA_URL=http://<IP-ThinkCentre>:${VALHALLA_PORT}"
echo "   Poi: pannello Admin → Mappe → Test routing"
echo "============================================================"
