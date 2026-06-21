#!/usr/bin/env bash
# =============================================================================
# BikerLink — build-valhalla-tiles.sh  (thinkcentre-scripts/)
# Builda (o ricostruisce) i tile Valhalla a partire dai PBF per area in ./data,
# con pre-filtraggio OSM per rimuovere dati malformati e limiti RAM/CPU Docker.
#
# Cosa fa:
#   1. Verifica i prerequisiti (Docker, curl, osmium).
#   2. Unisce i PBF delle aree core in valhalla-merged.osm.pbf (se necessario).
#   3. Filtra il PBF merged con osmium tags-filter per rimuovere way con valori
#      access/level non standard che causano "Invalid level" / heap corruption.
#   4. Avvia il container Docker con force_rebuild=True, limiti RAM/CPU e il
#      valhalla.json custom (max_concurrent_reader_threads: 2).
#   5. Segue i log in tempo reale; rileva crash anticipati e li segnala subito.
#   6. Verifica GET http://localhost:PORT/status e stampa version + tile date.
#   7. Riavvia il container in modalità serve (senza force_rebuild).
#
# Uso:
#   ./build-valhalla-tiles.sh
#   DATA_DIR=/mnt/osm ./build-valhalla-tiles.sh
#   VALHALLA_BUILD_MEMORY=8g VALHALLA_BUILD_CPUS=6 ./build-valhalla-tiles.sh
#
# Variabili d'ambiente override:
#   DATA_DIR               cartella PBF + tiles    (default: ~/valhalla/data)
#   VALHALLA_PORT          porta Valhalla           (default: 8002)
#   VALHALLA_IMAGE         immagine Docker          (default: da config-valhalla.sh)
#   VALHALLA_BUILD_MEMORY  RAM cap del container    (default: 6g)
#   VALHALLA_BUILD_CPUS    CPU cap del container    (default: 4)
#   BUILD_TIMEOUT_SECS     timeout build in secondi (default: 10800 = 3h)
#   POLL_INTERVAL_SECS     secondi tra i poll       (default: 30)
#
# NOTA: il build dei tile può richiedere fino a 3h e molta RAM.
#       Se i PBF per area mancano, lancia prima: ./download-osm.sh
#       Se la RAM è < 16 GB, esegui prima ./swap.sh (swapfile 32-48 GB).
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Config condivisa (porta, immagine, data dir) ──────────────────────────────
CONFIG_FILE="$SCRIPT_DIR/config-valhalla.sh"
if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
fi
# Fallback se config manca
VALHALLA_DATA_DIR="${VALHALLA_DATA_DIR:-$HOME/valhalla/data}"
VALHALLA_PORT="${VALHALLA_PORT:-8002}"
VALHALLA_IMAGE="${VALHALLA_IMAGE:-ghcr.io/gis-ops/docker-valhalla/valhalla:latest}"

DATA_DIR="${DATA_DIR:-${VALHALLA_DATA_DIR}}"

# ── Parametri build ───────────────────────────────────────────────────────────
# RAM e CPU applicati SOLO durante il build (non durante il serve).
# Riduci VALHALLA_BUILD_MEMORY se il ThinkCentre ha meno di 8 GB liberi.
VALHALLA_BUILD_MEMORY="${VALHALLA_BUILD_MEMORY:-6g}"
VALHALLA_BUILD_CPUS="${VALHALLA_BUILD_CPUS:-4}"

MERGED_PBF="${DATA_DIR}/valhalla-merged.osm.pbf"
FILTERED_PBF="${DATA_DIR}/valhalla-filtered.osm.pbf"

# valhalla.json custom con max_concurrent_reader_threads: 2.
# Montato in /custom_files/valhalla.json nel container durante il build.
VALHALLA_JSON="${SCRIPT_DIR}/valhalla.json"

STATUS_URL="http://localhost:${VALHALLA_PORT}/status"
BUILD_CONTAINER="bikerlink-valhalla-build"
SERVE_CONTAINER="bikerlink-valhalla"

BUILD_TIMEOUT_SECS="${BUILD_TIMEOUT_SECS:-10800}"
POLL_INTERVAL_SECS="${POLL_INTERVAL_SECS:-30}"

# Aree core da unire per Valhalla (modifica se vuoi coprire aree diverse).
VALHALLA_AREAS=(grecia balcani iberia arco-alpino)

log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRORE: $*" >&2; exit 1; }

DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"

# ── Prerequisiti ───────────────────────────────────────────────────────────────
command -v curl   >/dev/null 2>&1 || die "curl non installato (sudo apt install -y curl)"
command -v osmium >/dev/null 2>&1 || die "osmium non installato (sudo apt install -y osmium-tool)"

[[ -f "$VALHALLA_JSON" ]] || die "valhalla.json non trovato in ${SCRIPT_DIR}. Verificare che build-valhalla-tiles.sh e valhalla.json siano nella stessa cartella."

mkdir -p "$DATA_DIR"

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

# ── Pre-filter OSM: rimuovi way con tag problematici ─────────────────────────
# Valhalla crasha con "double free or corruption" / "Invalid level" su way con
# valori access o level non standard (B, roof, LG, G, P, K, E, T e simili).
# osmium tags-filter --invert-match rimuove i way che CORRISPONDONO al filtro,
# producendo un PBF pulito come input al builder.
#
# NOTA su 'w/access=*' (asterisco letterale come valore):
#   osmium interpreta * come wildcard in posizione value → 'w/access=*' matcherebbe
#   TUTTI i way con qualsiasi valore access. Per matchare il valore letterale "*"
#   non esiste escape in osmium tags-filter; il valore è però rarissimo in OSM
#   e non costituisce la causa principale del crash. Si esclude consapevolmente.
#
# NOTA su maxspeed non standard:
#   Il task menziona maxspeed come possibile fonte di "Invalid level". In Valhalla
#   il parser maxspeed fallisce su stringhe non numeriche (es. "walk", "none", "IT:urban")
#   ma il crash è gestito internamente come warning, NON come heap corruption.
#   Filtrare on maxspeed rimuoverebbe migliaia di way validi (ogni paese usa prefissi
#   country:class): il rischio di degradare la qualità del routing supera il beneficio.
#   Se futuri log mostrano maxspeed come causa di crash, aggiungere qui:
#     'w/maxspeed=walk' 'w/maxspeed=none' ecc. (solo i valori che crashano)
#
# Filtro attivo:
#   - access non standard: B, roof, LG, G, P, K, E, T
#   - level non standard (designazioni indoor): B, LG, UG, G, M, -1, roof
#     (Valhalla non gestisce livelli indoor come basement / lower-ground / mezzanine)

needs_filter=false
if [[ ! -f "$FILTERED_PBF" ]]; then
  needs_filter=true
elif [[ "$MERGED_PBF" -nt "$FILTERED_PBF" ]]; then
  needs_filter=true
fi

if [[ "$needs_filter" == "true" ]]; then
  log "[OSM] Pre-filtraggio way con tag non standard (access/level)..."
  log "[OSM] Input:  ${MERGED_PBF} ($(du -h "$MERGED_PBF" | cut -f1))"

  osmium tags-filter \
    --invert-match \
    --overwrite \
    -o "$FILTERED_PBF" \
    "$MERGED_PBF" \
    'w/access=B'    \
    'w/access=roof' \
    'w/access=LG'   \
    'w/access=G'    \
    'w/access=P'    \
    'w/access=K'    \
    'w/access=E'    \
    'w/access=T'    \
    'w/level=B'     \
    'w/level=LG'    \
    'w/level=UG'    \
    'w/level=G'     \
    'w/level=M'     \
    'w/level=-1'    \
    'w/level=roof'

  # Verifica efficacia del filtro: confronta il conteggio way prima e dopo.
  # osmium fileinfo -e conta gli oggetti; usa || true per non bloccare se manca.
  WAYS_BEFORE=$(osmium fileinfo -e -g data.ways "$MERGED_PBF"  2>/dev/null || echo "?")
  WAYS_AFTER=$(osmium fileinfo -e -g data.ways "$FILTERED_PBF" 2>/dev/null || echo "?")
  if [[ "$WAYS_BEFORE" != "?" && "$WAYS_AFTER" != "?" ]]; then
    REMOVED=$(( WAYS_BEFORE - WAYS_AFTER ))
    log "[OSM] Filtro completato ✓ — way rimossi: ${REMOVED} (${WAYS_BEFORE} → ${WAYS_AFTER})"
  else
    log "[OSM] Filtro completato ✓"
  fi
  log "[OSM] Input:    $(du -h "$MERGED_PBF" | cut -f1)"
  log "[OSM] Filtrato: $(du -h "$FILTERED_PBF" | cut -f1)"
else
  log "[OSM] ${FILTERED_PBF} già aggiornato ($(du -h "$FILTERED_PBF" | cut -f1)) — skip filter"
fi

# ── Pulizia eventuale container precedente ────────────────────────────────────
if $DOCKER ps -a --format '{{.Names}}' | grep -q "^${BUILD_CONTAINER}$"; then
  log "[Docker] Rimuovo container build precedente (${BUILD_CONTAINER})..."
  $DOCKER rm -f "$BUILD_CONTAINER" >/dev/null 2>&1 || true
fi
if $DOCKER ps -a --format '{{.Names}}' | grep -q "^${SERVE_CONTAINER}$"; then
  log "[Docker] Fermo container serve esistente (${SERVE_CONTAINER})..."
  $DOCKER stop "$SERVE_CONTAINER" >/dev/null 2>&1 || true
  $DOCKER rm   "$SERVE_CONTAINER" >/dev/null 2>&1 || true
fi

echo "============================================================"
echo " BikerLink — Build tile Valhalla"
echo " PBF sorgente  : ${FILTERED_PBF} ($(du -h "$FILTERED_PBF" | cut -f1))"
echo " Aree incluse  : ${VALHALLA_AREAS[*]}"
echo " RAM cap build : ${VALHALLA_BUILD_MEMORY}  (override: VALHALLA_BUILD_MEMORY=8g)"
echo " CPU cap build : ${VALHALLA_BUILD_CPUS}    (override: VALHALLA_BUILD_CPUS=6)"
echo " Config JSON   : ${VALHALLA_JSON}"
echo " Status URL    : ${STATUS_URL}"
echo " Timeout build : $((BUILD_TIMEOUT_SECS / 3600))h (${BUILD_TIMEOUT_SECS}s)"
echo "============================================================"

# ── Avvio container in modalità build ────────────────────────────────────────
# Limiti RAM e CPU applicati SOLO qui (non nel container di serve).
# --memory-swap uguale a --memory → niente swap OS per il container (più prevedibile).
# --shm-size=4g: Valhalla usa /dev/shm per file temporanei nelle fasi di enhancing.
# Il valhalla.json custom viene montato per ridurre i reader thread (meno pressione RAM).
# Il PBF filtrato viene mappato su /custom_files come valhalla-merged.osm.pbf
# (Valhalla cerca il file merged in quella posizione).
log "[Valhalla] avvio container in modalità build (force_rebuild=True)..."
log "[Valhalla] RAM=${VALHALLA_BUILD_MEMORY}, CPU=${VALHALLA_BUILD_CPUS}, reader_threads=2"

$DOCKER run -d \
  --name "$BUILD_CONTAINER" \
  --memory="${VALHALLA_BUILD_MEMORY}" \
  --memory-swap="${VALHALLA_BUILD_MEMORY}" \
  --cpus="${VALHALLA_BUILD_CPUS}" \
  --shm-size=4g \
  -p "${VALHALLA_PORT}:8002" \
  -v "${DATA_DIR}:/custom_files" \
  -v "${FILTERED_PBF}:/custom_files/valhalla-merged.osm.pbf:ro" \
  -v "${VALHALLA_JSON}:/custom_files/valhalla.json:ro" \
  -e use_tiles_ignore_pbf=False \
  -e serve_tiles=True \
  -e build_admins=True \
  -e build_time_zones=True \
  -e build_elevation=False \
  -e force_rebuild=True \
  "$VALHALLA_IMAGE"

# ── Segui i log in background ─────────────────────────────────────────────────
log "[Valhalla] log in tempo reale (Ctrl-C interrompe SOLO il tail, non il build):"
$DOCKER logs -f "$BUILD_CONTAINER" &
LOGS_PID=$!
cleanup_logs() { kill "$LOGS_PID" >/dev/null 2>&1 || true; }
trap cleanup_logs EXIT

# ── Poll /status con rilevamento crash anticipato ─────────────────────────────
log "[Valhalla] attendo il completamento del build (polling /status ogni ${POLL_INTERVAL_SECS}s)..."
elapsed=0
status_ok=false

while (( elapsed < BUILD_TIMEOUT_SECS )); do
  # Controlla prima se il container è ancora in esecuzione.
  # Se non lo è, probabilmente è crashato — non aspettare il timeout.
  if ! $DOCKER ps --format '{{.Names}}' | grep -q "^${BUILD_CONTAINER}$"; then
    cleanup_logs
    trap - EXIT

    EXIT_CODE=$($DOCKER inspect --format='{{.State.ExitCode}}' "$BUILD_CONTAINER" 2>/dev/null || echo "?")
    log "[Valhalla] Il container si è fermato anticipatamente (exit code: ${EXIT_CODE})"
    log "[Valhalla] Ultimi 50 righe di log:"
    $DOCKER logs --tail 50 "$BUILD_CONTAINER" 2>&1 || true
    $DOCKER rm "$BUILD_CONTAINER" >/dev/null 2>&1 || true

    if [[ "$EXIT_CODE" == "0" ]]; then
      # Exit 0 con /status non ancora risposto = container avviato e pronto
      # (il container gis-ops può uscire con 0 dopo il build e riaprire in serve)
      log "[Valhalla] Container uscito con codice 0 — verifico /status..."
      if curl -fsS --max-time 15 "$STATUS_URL" >/dev/null 2>&1; then
        status_ok=true
      fi
    else
      die "Build fallita (exit code ${EXIT_CODE}) — vedi i log sopra. Possibili cause:
  - OOM: prova VALHALLA_BUILD_MEMORY=8g o aggiungi swap (./swap.sh)
  - PBF corrotto: ricarica con ./download-osm.sh
  - Heap corruption: il pre-filter OSM dovrebbe averla mitigata; se persiste
    prova VALHALLA_BUILD_CPUS=2 per ridurre ulteriormente la concorrenza."
    fi
    break
  fi

  # Controlla se /status risponde (build completato, serve attivo)
  if curl -fsS --max-time 10 "$STATUS_URL" >/dev/null 2>&1; then
    status_ok=true
    break
  fi

  sleep "$POLL_INTERVAL_SECS"
  elapsed=$((elapsed + POLL_INTERVAL_SECS))
done

cleanup_logs
trap - EXIT

if [[ "$status_ok" != "true" ]]; then
  # Dump log del container prima di uscire
  log "[Valhalla] Timeout build (${BUILD_TIMEOUT_SECS}s). Ultimi 50 righe di log:"
  $DOCKER logs --tail 50 "$BUILD_CONTAINER" 2>&1 || true
  $DOCKER rm -f "$BUILD_CONTAINER" >/dev/null 2>&1 || true
  die "/status non ha risposto entro $((BUILD_TIMEOUT_SECS / 3600))h. Controlla lo swap e la RAM disponibile."
fi

# ── Verifica e stampa lo stato ────────────────────────────────────────────────
log "[Valhalla] build completato ✓ — verifico ${STATUS_URL}"
STATUS_JSON="$(curl -fsS --max-time 10 "$STATUS_URL" || true)"
echo "------------------------------------------------------------"
echo " Risposta /status:"
echo "$STATUS_JSON"
echo "------------------------------------------------------------"

# ── Ripristina il container in modalità serve (senza force_rebuild) ───────────
# Il container build viene fermato/rimosso; il container serve parte senza limiti
# di RAM/CPU (usa tutta la RAM disponibile per il routing in produzione).
log "[Valhalla] pulizia container build e riavvio in modalità serve..."
$DOCKER stop "$BUILD_CONTAINER"  >/dev/null 2>&1 || true
$DOCKER rm   "$BUILD_CONTAINER"  >/dev/null 2>&1 || true

$DOCKER run -d \
  --name "$SERVE_CONTAINER" \
  --restart unless-stopped \
  --shm-size=2g \
  -p "${VALHALLA_PORT}:8002" \
  -v "${DATA_DIR}:/custom_files" \
  -e use_tiles_ignore_pbf=True \
  -e serve_tiles=True \
  -e build_admins=False \
  -e build_time_zones=False \
  -e build_elevation=False \
  -e force_rebuild=False \
  "$VALHALLA_IMAGE"

log "[Valhalla] attendo che /status torni online dopo il riavvio serve..."
elapsed=0
serve_ok=false
while (( elapsed < 300 )); do
  if curl -fsS --max-time 10 "$STATUS_URL" >/dev/null 2>&1; then
    serve_ok=true
    log "[Valhalla] online ✓ — tile serviti correttamente."
    break
  fi
  sleep 5
  elapsed=$((elapsed + 5))
done

[[ "$serve_ok" == "true" ]] || die "/status non è tornato online entro 5 min. Controlla: $DOCKER logs -f ${SERVE_CONTAINER}"

echo "============================================================"
echo " ✓ Tile Valhalla pronti."
echo "   - Verifica:  curl ${STATUS_URL}"
echo "   - Imposta nei Secrets Replit:  VALHALLA_URL=http://<IP-ThinkCentre>:${VALHALLA_PORT}"
echo "   - Poi: pannello Admin → Mappe → Test routing"
echo "============================================================"
