#!/usr/bin/env bash
# =============================================================================
# BikerLink — build-graphs-sequential.sh
# Costruisce i grafi GraphHopper per TUTTE le aree UNA ALLA VOLTA, in serie.
#
# Procedura GH 12 ufficiale: --import (crea la graph-cache), poi il server
# riusa la cache. A import riuscito la graph-cache contiene:
#   properties, nodes, edges, geometry, location_index
# Il file `properties` è il marcatore di completamento (contiene i fingerprint
# dei profili).
#
# Profili costruiti: motorcycle (LM+curvature), motorcycle_fast (CH), car (CH).
#
# Ordine di build: dalla zona PIÙ PICCOLA alla più grande (crescente per .pbf)
# così le due aree più pesanti (germania-centro, francia-benelux) vengono ultime
# e beneficiano di swap attivato se necessario.
#
# Uso:
#   ./build-graphs-sequential.sh                     # tutte le aree in ordine
#   ./build-graphs-sequential.sh grecia balcani      # solo alcune aree
#   MAX_RETRIES=2 ./build-graphs-sequential.sh       # max tentativi per area
#   GRAPHS_DIR=/mnt/nvme/graphs ./build-graphs-sequential.sh
#   BACKUP_DIR=/mnt/nvme/GRAFIGH ./build-graphs-sequential.sh
#   SWAP_FILE=/mnt/nvme/build.swap SWAP_SIZE_GB=64 ./build-graphs-sequential.sh
#
# ⚠️ PREREQUISITI:
#   - Docker installato e demone attivo
#   - Immagine bikerlink/graphhopper:latest presente localmente (vedi README.md)
#   - File .pbf merged in DATA_DIR/<area>.osm.pbf (vedi download-regions.sh)
#   - Permessi sudo per creare/rimuovere lo swap (solo per grandi aree)
#
# ⚠️ NOTA CARTELLE GRAFI ROOT-OWNED:
#   Docker crea le cartelle graph-cache come root. Per ripulirle prima di
#   questo script occorre:
#       sudo rm -rf graphs/<area>
#   Questo script usa sudo rm -rf per il cleanup interno (necessario per retry).
#   Se il sistema non supporta sudo, rimuovere manualmente prima di lanciare.
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Configurazione ──────────────────────────────────────────────────────────
DATA_DIR="${DATA_DIR:-${SCRIPT_DIR}/data}"
GRAPHS_DIR="${GRAPHS_DIR:-${SCRIPT_DIR}/graphs}"
CONFIG_FILE="${CONFIG_FILE:-${SCRIPT_DIR}/graphhopper/config.yml}"
GH_IMAGE="${GRAPHHOPPER_IMAGE:-bikerlink/graphhopper:latest}"
BACKUP_DIR="${BACKUP_DIR:-/mnt/nvme/GRAFIGH}"
STATE_FILE="${STATE_FILE:-/tmp/bk-build-graphs-state.txt}"
LOG_FILE="${LOG_FILE:-/tmp/bk-build-graphs.log}"

# Max tentativi per area (incluso il primo). Se un build fallisce per OOM o
# altri motivi recuperabili, viene ripulito e rigrafato.
MAX_RETRIES="${MAX_RETRIES:-2}"

# Swap per le aree grandi (germania-centro, francia-benelux).
SWAP_FILE="${SWAP_FILE:-/mnt/nvme/build.swap}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-64}"

# Profili attesi nel file properties (per la verifica del grafo).
EXPECTED_PROFILES="motorcycle motorcycle_fast car"

# Env file (opzionale, per variabili docker compose)
ENV_FILE="${SCRIPT_DIR}/.env"

# Costruisci il comando docker compose (con env-file se disponibile)
DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"
COMPOSE="$DOCKER compose"
[[ -f "$ENV_FILE" ]] && COMPOSE="$DOCKER compose --env-file $ENV_FILE"

# ── Ordine di build: dalla zona più PICCOLA alla più grande ─────────────────
# Dimensioni approximate .pbf (da shared/routing-areas.ts, pbfApproxGb):
#   ecuador: 0.1   grecia: 0.6   balcani: 1.5   est: 1.5
#   iberia: 1.8   arco-alpino: 3.6   germania-centro: 5.2   francia-benelux: 6.7
BUILD_ORDER="ecuador grecia balcani est iberia arco-alpino germania-centro francia-benelux"

# Aree che richiedono swap attivato (> 4 GB pbf → CH può superare 32 GB RAM)
LARGE_AREAS="germania-centro francia-benelux"

# Porte dei container per-area (sync con shared/routing-areas.ts)
declare -A AREA_PORT=(
  [grecia]=8990
  [balcani]=8991
  [est]=8992
  [iberia]=8993
  [arco-alpino]=8994
  [germania-centro]=8995
  [francia-benelux]=8996
  [ecuador]=8997
)

# Heap -Xmx per-area calibrato sulla dimensione del .pbf (32 GB tot, lascia
# ~4 GB al SO + postgres/redis + margine per il GC overhead)
declare -A AREA_HEAP=(
  [ecuador]="-Xmx8g  -Xms2g"
  [grecia]="-Xmx12g -Xms3g"
  [balcani]="-Xmx16g -Xms4g"
  [est]="-Xmx16g -Xms4g"
  [iberia]="-Xmx18g -Xms4g"
  [arco-alpino]="-Xmx22g -Xms5g"
  [germania-centro]="-Xmx28g -Xms6g"
  [francia-benelux]="-Xmx28g -Xms6g"
)

# Coordinate test /route per-area (due punti dentro il bbox, ~30-50 km apart)
# Formato: "lon1,lat1 lon2,lat2"
declare -A AREA_TEST_COORDS=(
  [ecuador]="-78.5215,-0.2295 -78.6143,-1.8312"
  [grecia]="22.9444,40.6401 23.7362,37.9755"
  [balcani]="16.4402,43.5081 18.4131,43.8564"
  [est]="26.0996,44.4268 23.5905,46.7712"
  [iberia]="-3.7038,40.4168 -0.3763,39.4697"
  [arco-alpino]="11.3493,46.4983 9.1896,45.4654"
  [germania-centro]="13.4050,52.5200 11.5820,48.1351"
  [francia-benelux]="2.3522,48.8566 4.8951,52.3702"
)

# ── Colori e logging ────────────────────────────────────────────────────────
bold()    { echo -e "\033[1m$*\033[0m"; }
green()   { echo -e "\033[32m✓\033[0m $*"; }
red()     { echo -e "\033[31m✗\033[0m $*"; }
yellow()  { echo -e "\033[33m!\033[0m $*"; }
info()    { echo -e "\033[36m→\033[0m $*"; }

log() {
  local ts; ts="$(date '+%Y-%m-%d %H:%M:%S')"
  echo "[$ts] $*"
  echo "[$ts] $*" >> "$LOG_FILE"
}
err() {
  local ts; ts="$(date '+%Y-%m-%d %H:%M:%S')"
  echo "[$ts] ERRORE: $*" >&2
  echo "[$ts] ERRORE: $*" >> "$LOG_FILE"
}

# ── Stato per il monitor ────────────────────────────────────────────────────
state_write() {
  # Scrive atomicamente il file di stato (letto da monitor-build-graphs.sh)
  local tmpf; tmpf="$(mktemp)"
  {
    echo "STATUS=${BUILD_STATUS:-running}"
    echo "STARTED=${BUILD_START_TS:-$(date '+%s')}"
    echo "CURRENT_AREA=${CURRENT_AREA:-}"
    echo "CURRENT_PHASE=${CURRENT_PHASE:-}"
    echo "TOTAL_AREAS=${#BUILD_AREAS[@]}"
    echo "DONE_COUNT=${DONE_COUNT:-0}"
    for area in "${BUILD_AREAS[@]}"; do
      local st="${AREA_STATUS[$area]:-pending}"
      local sz="${AREA_SIZE[$area]:-}"
      echo "AREA_${area//-/_}=${st}${sz:+|${sz}}"
    done
  } > "$tmpf"
  mv -f "$tmpf" "$STATE_FILE"
}

# ── Prerequisiti ─────────────────────────────────────────────────────────────
check_prereqs() {
  command -v docker >/dev/null 2>&1 || { err "'docker' non trovato."; exit 1; }
  [[ -f "$CONFIG_FILE" ]] || { err "config.yml non trovato: $CONFIG_FILE"; exit 1; }
  command -v curl >/dev/null 2>&1 || { err "'curl' non trovato. Installa con: sudo apt install -y curl"; exit 1; }
}

# ── Guard pre-build ──────────────────────────────────────────────────────────
# Controlla RAM libera, swap (per le aree grandi) e spazio disco.
check_resources() {
  local area="$1"
  local is_large=0
  echo "$LARGE_AREAS" | grep -qw "$area" && is_large=1

  # RAM libera (in MB)
  local free_ram_mb
  free_ram_mb=$(awk '/MemAvailable/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)

  # Per le aree piccole vogliamo almeno 6 GB liberi; per le grandi 10 GB
  local min_ram_mb=$(( is_large ? 10240 : 6144 ))
  if (( free_ram_mb < min_ram_mb )); then
    err "[${area}] RAM libera insufficiente: ${free_ram_mb} MB < ${min_ram_mb} MB richiesti."
    err "Ferma altri processi e riprova, oppure riduci i servizi attivi."
    return 1
  fi

  # Per le aree grandi: verifica swap attivo
  if (( is_large )); then
    local swap_total_mb
    swap_total_mb=$(awk '/SwapTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)
    if (( swap_total_mb < 16384 )); then
      err "[${area}] AREA GRANDE ma swap insufficiente (${swap_total_mb} MB). Lo script avrebbe dovuto attivare lo swap."
      err "Verifica che lo swap NVMe sia attivo: swapon --show"
      return 1
    fi
    log "[${area}] Swap attivo: ${swap_total_mb} MB ✓"
  fi

  # Spazio disco (in GB, stima: il grafo prodotto è ~3-10× il .pbf)
  local free_disk_gb
  free_disk_gb=$(df -BG "$GRAPHS_DIR" 2>/dev/null | awk 'NR==2 {gsub("G",""); print $4}' || echo 0)
  if (( free_disk_gb < 50 )); then
    err "[${area}] Spazio disco libero basso: ${free_disk_gb} GB in ${GRAPHS_DIR}. Minimo consigliato: 50 GB."
    return 1
  fi

  log "[${area}] Risorse OK — RAM libera: ${free_ram_mb} MB, Disco libero: ${free_disk_gb} GB"
  return 0
}

# ── Gestione swap NVMe ────────────────────────────────────────────────────────
swap_activate() {
  log "Attivazione swap NVMe su ${SWAP_FILE} (${SWAP_SIZE_GB} GB) per le aree grandi..."
  if swapon --show | grep -q "$SWAP_FILE"; then
    log "Swap ${SWAP_FILE} già attivo — skip."
    return 0
  fi
  if [[ ! -f "$SWAP_FILE" ]]; then
    local swap_dir; swap_dir="$(dirname "$SWAP_FILE")"
    if [[ ! -d "$swap_dir" ]]; then
      err "Directory swap non trovata: ${swap_dir}. Imposta SWAP_FILE su un percorso NVMe valido."
      return 1
    fi
    log "Creazione file swap: ${SWAP_FILE} (${SWAP_SIZE_GB} GB)..."
    if ! sudo fallocate -l "${SWAP_SIZE_GB}G" "$SWAP_FILE" 2>/dev/null; then
      log "fallocate non disponibile, uso dd (più lento)..."
      sudo dd if=/dev/zero of="$SWAP_FILE" bs=1G count="${SWAP_SIZE_GB}" status=progress 2>&1 | tee -a "$LOG_FILE"
    fi
    sudo chmod 600 "$SWAP_FILE"
    sudo mkswap "$SWAP_FILE"
  fi
  sudo swapon "$SWAP_FILE"
  log "Swap attivato ✓ ($(swapon --show --bytes | awk -v f="$SWAP_FILE" '$1==f {printf "%.0f GB", $3/1024/1024/1024}'))"
}

swap_deactivate() {
  if swapon --show | grep -q "$SWAP_FILE"; then
    log "Disattivazione swap ${SWAP_FILE}..."
    sudo swapoff "$SWAP_FILE" 2>/dev/null || true
    log "Swap disattivato."
  fi
}

# ── Ferma TUTTE le istanze GH ────────────────────────────────────────────────
stop_all_gh() {
  log "Arresto di tutte le istanze GraphHopper (docker compose stop)..."
  local services=""
  for area in $BUILD_ORDER; do
    services="${services} graphhopper-${area}"
  done
  # stop esplicito per ogni servizio (non basta "down": il compose ha restart: unless-stopped)
  # shellcheck disable=SC2086
  $COMPOSE stop $services 2>&1 | tee -a "$LOG_FILE" || true
  log "Tutte le istanze GH fermate ✓"
}

# ── Verifica grafo GH 12 ─────────────────────────────────────────────────────
# Controlla che i file attesi dalla procedura GH 12 siano presenti e non vuoti.
# properties è il marcatore di completamento (contiene i fingerprint dei profili).
# NON cercare edges/ come directory (diverso da GH <12).
verify_graph() {
  local area="$1"
  local graph_dir="${GRAPHS_DIR}/${area}"

  # 1. Il file `properties` deve esistere (marcatore principale GH 12)
  if [[ ! -f "${graph_dir}/properties" ]]; then
    err "[${area}] Verifica grafo FALLITA: file 'properties' non trovato in ${graph_dir}"
    return 1
  fi

  # 2. Controlla che properties contenga i profili attesi
  local props_content
  props_content=$(cat "${graph_dir}/properties" 2>/dev/null || true)
  for prof in $EXPECTED_PROFILES; do
    if ! echo "$props_content" | grep -q "$prof"; then
      err "[${area}] Verifica grafo FALLITA: profilo '${prof}' non trovato in properties"
      err "Contenuto properties: ${props_content}"
      return 1
    fi
  done

  # 3. Gli altri artefatti principali devono esistere e non essere vuoti
  #    (possono essere file o directory a seconda della versione GH 12)
  for artifact in nodes edges geometry location_index; do
    local apath="${graph_dir}/${artifact}"
    if [[ ! -e "$apath" ]]; then
      err "[${area}] Verifica grafo FALLITA: artefatto '${artifact}' non trovato in ${graph_dir}"
      return 1
    fi
    if [[ -f "$apath" ]]; then
      # File: non deve essere da 0 byte
      local sz; sz=$(stat -c%s "$apath" 2>/dev/null || echo 0)
      if (( sz == 0 )); then
        err "[${area}] Verifica grafo FALLITA: artefatto '${artifact}' è un file vuoto (0 byte)"
        return 1
      fi
    elif [[ -d "$apath" ]]; then
      # Directory: non deve essere vuota
      if [[ -z "$(ls -A "$apath" 2>/dev/null)" ]]; then
        err "[${area}] Verifica grafo FALLITA: artefatto '${artifact}' è una directory vuota"
        return 1
      fi
    fi
  done

  local graph_size; graph_size=$(du -sh "$graph_dir" 2>/dev/null | cut -f1 || echo "?")
  log "[${area}] Verifica grafo OK ✓ (dimensione: ${graph_size})"
  AREA_SIZE[$area]="$graph_size"
  return 0
}

# ── Cleanup graph-cache corrotta ──────────────────────────────────────────────
cleanup_graph() {
  local area="$1"
  local graph_dir="${GRAPHS_DIR}/${area}"
  log "[${area}] Cleanup graph-cache: ${graph_dir}"
  if [[ -d "$graph_dir" ]]; then
    # Le cartelle GH sono root-owned (create da Docker): serve sudo
    if sudo rm -rf "$graph_dir" 2>/dev/null; then
      log "[${area}] Graph-cache rimossa ✓"
    else
      err "[${area}] Impossibile rimuovere ${graph_dir} (serve sudo). Rimuovere manualmente e riprovare."
      return 1
    fi
  fi
  mkdir -p "$graph_dir"
  return 0
}

# ── Avvia container e attende /health ─────────────────────────────────────────
start_container() {
  local area="$1"
  local port="${AREA_PORT[$area]}"
  local svc="graphhopper-${area}"

  log "[${area}] Avvio container ${svc} su porta ${port}..."
  $COMPOSE up -d "$svc" 2>&1 | tee -a "$LOG_FILE"

  # Attende che /health risponda (max 5 minuti)
  local max_wait=300
  local waited=0
  local interval=5
  log "[${area}] Attesa /health su 127.0.0.1:${port}/health (max ${max_wait}s)..."
  while (( waited < max_wait )); do
    if curl -fsS --max-time 5 "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
      log "[${area}] /health OK ✓ (${waited}s)"
      return 0
    fi
    sleep "$interval"
    (( waited += interval ))
  done

  err "[${area}] /health non risponde dopo ${max_wait}s."
  log "[${area}] Log container (ultime 30 righe):"
  $COMPOSE logs --tail=30 "$svc" 2>&1 | tee -a "$LOG_FILE" || true
  return 1
}

# ── Ferma un singolo container ────────────────────────────────────────────────
stop_container() {
  local area="$1"
  local svc="graphhopper-${area}"
  log "[${area}] Arresto container ${svc}..."
  $COMPOSE stop "$svc" 2>&1 | tee -a "$LOG_FILE" || true
  log "[${area}] Container fermato ✓"
}

# ── Test funzionale /route ─────────────────────────────────────────────────────
# Richiede una rotta profile=motorcycle tra due punti dentro il bbox dell'area.
# Verifica: risposta HTTP 200 con un percorso valido (paths[0].distance > 0).
functional_test() {
  local area="$1"
  local port="${AREA_PORT[$area]}"
  local coords="${AREA_TEST_COORDS[$area]:-}"

  if [[ -z "$coords" ]]; then
    err "[${area}] Coordinate test non definite. Saltando test funzionale."
    return 1
  fi

  # Parsea le coordinate
  local p1; p1=$(echo "$coords" | awk '{print $1}')
  local p2; p2=$(echo "$coords" | awk '{print $2}')
  local lon1; lon1=$(echo "$p1" | cut -d, -f1)
  local lat1; lat1=$(echo "$p1" | cut -d, -f2)
  local lon2; lon2=$(echo "$p2" | cut -d, -f1)
  local lat2; lat2=$(echo "$p2" | cut -d, -f2)

  local url="http://127.0.0.1:${port}/route"
  local payload
  payload=$(printf '{"points":[[%s,%s],[%s,%s]],"profile":"motorcycle","locale":"it","instructions":false,"calc_points":false}' \
    "$lon1" "$lat1" "$lon2" "$lat2")

  log "[${area}] Test funzionale /route con profile=motorcycle..."
  log "[${area}]   POST ${url}"

  local response http_code
  response=$(curl -fsS --max-time 60 -w "\n__HTTP_CODE__:%{http_code}" \
    -H "Content-Type: application/json" \
    -d "$payload" "$url" 2>/dev/null || true)

  http_code=$(echo "$response" | grep "__HTTP_CODE__:" | sed 's/.*__HTTP_CODE__://')
  local body; body=$(echo "$response" | grep -v "__HTTP_CODE__:")

  if [[ "$http_code" != "200" ]]; then
    err "[${area}] Test funzionale FALLITO: HTTP ${http_code:-0}"
    err "[${area}] Body: ${body:0:300}"
    return 1
  fi

  # Verifica che ci sia un percorso con distance > 0.
  # Usa awk (stdlib, sempre disponibile) per il confronto float — evita dipendenza da bc.
  local distance
  distance=$(echo "$body" | grep -o '"distance":[0-9.]*' | head -1 | sed 's/"distance"://' || echo "")
  if [[ -z "$distance" ]] || ! awk "BEGIN{exit !($distance > 0)}" 2>/dev/null; then
    err "[${area}] Test funzionale FALLITO: percorso vuoto o distanza 0 (distance='${distance}')"
    err "[${area}] Body: ${body:0:300}"
    return 1
  fi

  log "[${area}] Test funzionale OK ✓ (distanza percorso: ${distance} m)"
  return 0
}

# ── Build di una singola area con retry ───────────────────────────────────────
build_area() {
  local area="$1"
  local pbf="${DATA_DIR}/${area}.osm.pbf"
  local graph_dir="${GRAPHS_DIR}/${area}"
  local attempt=0

  AREA_STATUS[$area]="running"
  CURRENT_AREA="$area"
  state_write

  # Controlla .pbf
  if [[ ! -f "$pbf" ]]; then
    err "[${area}] .pbf mancante: ${pbf}"
    err "[${area}] Esegui prima: ./download-regions.sh ${area}"
    AREA_STATUS[$area]="fail|pbf-mancante"
    state_write
    return 1
  fi

  # Attiva swap per le aree grandi (prima del primo tentativo)
  if echo "$LARGE_AREAS" | grep -qw "$area"; then
    CURRENT_PHASE="swap"
    state_write
    if ! swap_activate; then
      log "[${area}] WARNING: attivazione swap fallita. Tentativo build senza swap aggiuntivo."
    fi
  fi

  while (( attempt < MAX_RETRIES )); do
    (( attempt++ )) || true
    log "------------------------------------------------------------"
    log "[${area}] Tentativo ${attempt}/${MAX_RETRIES}"

    # 1. Cleanup graph-cache (start pulito)
    CURRENT_PHASE="cleanup"
    state_write
    if ! cleanup_graph "$area"; then
      AREA_STATUS[$area]="fail|cleanup"
      state_write
      return 1
    fi

    # 2. Guard risorse
    CURRENT_PHASE="check-risorse"
    state_write
    if ! check_resources "$area"; then
      err "[${area}] Guard risorse fallito — abort."
      AREA_STATUS[$area]="fail|risorse"
      state_write
      return 1
    fi

    # 3. Import GH (build grafo)
    CURRENT_PHASE="import"
    state_write
    local heap="${AREA_HEAP[$area]:--Xmx20g -Xms4g}"
    local java_opts="${heap} -XX:+UseParallelGC -XX:ParallelGCThreads=4 -XX:MaxMetaspaceSize=512m -server -Ddw.graphhopper.graph.dataaccess.default_type=RAM_STORE"

    log "[${area}] Avvio --import (heap: ${heap})..."
    # Usa PIPESTATUS[0] per catturare il codice di uscita di docker (non di tee).
    # NON usare "if ! cmd | tee": dentro il then, $? è 0 (status della negazione).
    $DOCKER run --rm \
        --name "bk-build-${area}" \
        -v "${DATA_DIR}:/data:ro" \
        -v "${graph_dir}:/graphhopper/graph-cache" \
        -v "${CONFIG_FILE}:/graphhopper/config.yml:ro" \
        -e GRAPH="/graphhopper/graph-cache" \
        -e FILE="/data/${area}.osm.pbf" \
        -e JAVA_OPTS="${java_opts}" \
        "$GH_IMAGE" \
        --import -c /graphhopper/config.yml -o /graphhopper/graph-cache \
        2>&1 | tee -a "$LOG_FILE"
    local import_exit=${PIPESTATUS[0]}

    if (( import_exit != 0 )); then
      # OOM: exit 137 (SIGKILL). Trattato come recuperabile (cleanup + retry con swap).
      if (( import_exit == 137 )); then
        err "[${area}] Import terminato per OOM (exit 137). Cleanup e retry..."
        if echo "$LARGE_AREAS" | grep -qw "$area" && ! swapon --show | grep -q "$SWAP_FILE"; then
          log "[${area}] Tentativo attivazione swap prima del retry..."
          swap_activate || true
        fi
      else
        err "[${area}] Import FALLITO (exit ${import_exit})."
      fi
      if (( attempt < MAX_RETRIES )); then
        log "[${area}] Retry (${attempt}/${MAX_RETRIES}) tra 5s..."
        sleep 5
      fi
      continue
    fi

    log "[${area}] --import completato ✓"

    # 4. Verifica grafo
    CURRENT_PHASE="verifica"
    state_write
    if ! verify_graph "$area"; then
      err "[${area}] Verifica grafo fallita. Cleanup e retry..."
      if (( attempt < MAX_RETRIES )); then sleep 5; fi
      continue
    fi

    # 5. Avvio container
    CURRENT_PHASE="avvio-container"
    state_write
    if ! start_container "$area"; then
      err "[${area}] Avvio container fallito. Arresto e retry..."
      stop_container "$area"
      if (( attempt < MAX_RETRIES )); then sleep 5; fi
      continue
    fi

    # 6. Test funzionale
    CURRENT_PHASE="test-funzionale"
    state_write
    if ! functional_test "$area"; then
      err "[${area}] Test funzionale fallito. Arresto container e retry..."
      stop_container "$area"
      if (( attempt < MAX_RETRIES )); then sleep 5; fi
      continue
    fi

    # 7. Ferma container — pronto per l'area successiva
    CURRENT_PHASE="stop-container"
    state_write
    stop_container "$area"

    # Successo!
    local graph_size="${AREA_SIZE[$area]:-$(du -sh "$graph_dir" 2>/dev/null | cut -f1)}"
    AREA_STATUS[$area]="ok|${graph_size}"
    CURRENT_PHASE="completato"
    (( DONE_COUNT++ )) || true
    state_write
    log "[${area}] BUILD COMPLETO ✓ (${graph_size})"
    return 0
  done

  err "[${area}] FALLITO dopo ${MAX_RETRIES} tentativi."
  AREA_STATUS[$area]="fail|max-retry"
  state_write
  return 1
}

# ── Backup finale dei grafi ───────────────────────────────────────────────────
backup_graphs() {
  log "============================================================"
  log "Backup finale dei grafi in ${BACKUP_DIR}/"
  log "============================================================"

  mkdir -p "$BACKUP_DIR" || { err "Impossibile creare ${BACKUP_DIR}"; return 1; }

  local ok=0
  for area in "${BUILD_AREAS[@]}"; do
    local status="${AREA_STATUS[$area]:-}"
    if [[ "$status" != ok* ]]; then
      log "[backup] Saltata area ${area} (status: ${status})"
      continue
    fi
    local src="${GRAPHS_DIR}/${area}"
    local dst="${BACKUP_DIR}/${area}"
    log "[backup] ${src} → ${dst}"
    # Rimuovi destinazione precedente per garantire idempotenza (nessuna cartella annidata).
    if [[ -d "$dst" ]]; then
      sudo rm -rf "$dst" 2>/dev/null || rm -rf "$dst" 2>/dev/null || true
    fi
    if cp -r "$src" "$dst"; then
      log "[backup] ${area} OK ✓"
      (( ok++ )) || true
    else
      err "[backup] ${area} FALLITO"
    fi
  done

  log "[backup] Completato: ${ok}/${#BUILD_AREAS[@]} aree copiate in ${BACKUP_DIR}/"
}

# ── Main ─────────────────────────────────────────────────────────────────────
check_prereqs

# Aree da costruire (argomenti o tutte in ordine)
BUILD_AREAS=()
if [[ $# -gt 0 ]]; then
  for arg in "$@"; do
    if echo "$BUILD_ORDER" | grep -qw "$arg"; then
      BUILD_AREAS+=("$arg")
    else
      err "Area sconosciuta: '${arg}' (valide: ${BUILD_ORDER})"
      exit 1
    fi
  done
else
  for area in $BUILD_ORDER; do
    BUILD_AREAS+=("$area")
  done
fi

# Inizializza stato
BUILD_STATUS="running"
BUILD_START_TS="$(date '+%s')"
CURRENT_AREA=""
CURRENT_PHASE=""
DONE_COUNT=0
declare -A AREA_STATUS
declare -A AREA_SIZE
for area in "${BUILD_AREAS[@]}"; do
  AREA_STATUS[$area]="pending"
done

# Pulisci log precedente
> "$LOG_FILE"
state_write

bold "============================================================"
bold " BikerLink — Build sequenziale grafi GraphHopper"
bold "   Aree     : ${BUILD_AREAS[*]}"
bold "   Ordine   : ${#BUILD_AREAS[@]} aree (dalla più piccola)"
bold "   Immagine : ${GH_IMAGE}"
bold "   Grafi    : ${GRAPHS_DIR}"
bold "   Backup   : ${BACKUP_DIR}"
bold "   Log      : ${LOG_FILE}"
bold "   Stato    : ${STATE_FILE}"
bold "============================================================"
echo ""

log "Inizio build — $(date)"
log "Aree: ${BUILD_AREAS[*]}"

# Ferma tutte le istanze GH prima di iniziare (evita crash-loop e libera RAM)
CURRENT_PHASE="stop-all"
state_write
stop_all_gh

mkdir -p "$GRAPHS_DIR"

# Build area per area in sequenza
OK_AREAS=()
FAIL_AREAS=()
for area in "${BUILD_AREAS[@]}"; do
  echo ""
  bold "============================================================"
  bold " Area: ${area}"
  bold "============================================================"
  if build_area "$area"; then
    OK_AREAS+=("$area")
    green "[${area}] BUILD OK ✓"
  else
    FAIL_AREAS+=("$area")
    red "[${area}] BUILD FALLITO ✗"
    log "[${area}] Continuo con le aree successive..."
  fi
done

# Deattiva swap al termine
swap_deactivate || true

# ── Riepilogo finale ─────────────────────────────────────────────────────────
echo ""
bold "============================================================"
bold " RIEPILOGO FINALE"
bold "============================================================"
echo ""

for area in "${BUILD_AREAS[@]}"; do
  local_status="${AREA_STATUS[$area]:-?}"
  local_size="${AREA_SIZE[$area]:-}"
  if [[ "$local_status" == ok* ]]; then
    green "${area} — OK ✓  ${local_size}"
  else
    red "${area} — FALLITO ✗  (${local_status#*|})"
  fi
done

echo ""
info "✓ riusciti: ${OK_AREAS[*]:-(nessuno)}"
info "✗ falliti : ${FAIL_AREAS[*]:-(nessuno)}"
echo ""

# Backup SOLO se tutte le aree sono OK
if [[ ${#FAIL_AREAS[@]} -eq 0 ]]; then
  BUILD_STATUS="done"
  state_write
  backup_graphs
  echo ""
  bold "✅ BUILD COMPLETO — tutti i grafi costruiti e backup in ${BACKUP_DIR}/"
  bold ""
  bold "Prossimo passo: avvia le istanze con"
  bold "   docker compose --profile areas up -d"
  bold "   oppure singolarmente: docker compose up -d graphhopper-<area>"
else
  BUILD_STATUS="error"
  state_write
  bold "⚠ BUILD PARZIALE — ${#FAIL_AREAS[@]} aree fallite: ${FAIL_AREAS[*]}"
  bold "Per le aree fallite: verifica il log ${LOG_FILE} e rilancia"
  bold "   ./build-graphs-sequential.sh ${FAIL_AREAS[*]}"
fi

echo ""
info "Log completo: ${LOG_FILE}"
info "Stato monitor: ${STATE_FILE}"
log "Fine build — $(date)"

# Exit code != 0 se almeno un'area è fallita
[[ ${#FAIL_AREAS[@]} -eq 0 ]]
