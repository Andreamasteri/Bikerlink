#!/usr/bin/env bash
# =============================================================================
# BikerLink — build-regions.sh
# Builda i grafi GraphHopper (import-only) per ogni gruppo-area, UNO ALLA VOLTA.
# Codifica la ricetta verificata manualmente sul ThinkCentre (vedi
# .local/tasks/routing-mappe-checklist.md e README.md).
#
# Cosa fa, per ogni gruppo:
#   docker run --rm <immagine pinnata> --import -c config.yml -o graph-cache
#   con env FILE=<pbf del gruppo>, GRAPH=/graphhopper/graph-cache e
#   JAVA_OPTS che forza RAM_STORE (-Xmx25g) per un import veloce.
#
# Uso:
#   ./build-regions.sh                       # tutti i gruppi (vedi ALL_GROUPS)
#   ./build-regions.sh grecia balcani        # solo alcuni gruppi
#   GRAPHS_DIR=/mnt/nvme/graphs ./build-regions.sh
#
# ⚠️ PRIMA del primo run: le cartelle dei grafi sono root-owned (le crea Docker).
# Per ripulirle serve sudo INTERATTIVO una volta:
#     sudo rm -rf graphs/{grecia,balcani,est,iberia,arco-alpino,germania-centro,francia-benelux}
# Questo script NON usa sudo internamente, così gira unattended senza prompt.
#
# Robustezza: ogni gruppo logga ✓/✗ e lo script CONTINUA anche se uno fallisce
# (riepilogo finale + exit code != 0 se almeno un gruppo è fallito).
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${DATA_DIR:-${SCRIPT_DIR}/data}"
# Cartelle dei grafi (idealmente su NVMe). Una sottocartella per gruppo.
GRAPHS_DIR="${GRAPHS_DIR:-${SCRIPT_DIR}/graphs}"
CONFIG_FILE="${CONFIG_FILE:-${SCRIPT_DIR}/graphhopper/config.yml}"

# Immagine GraphHopper CUSTOM compilata da sorgente (master HEAD, GH 12.x) su
# Java 25 — deve combaciare con docker-compose.yml (anchor x-gh-area). Vive solo
# nell'image store locale del ThinkCentre. Rigenerare l'immagine: vedi README.md.
GH_IMAGE="${GRAPHHOPPER_IMAGE:-bikerlink/graphhopper:latest}"

# Heap/GC per il BUILD (RAM-hungry): import in RAM, poi una sola volta su disco.
# RAM_STORE forzato via sysprop perché il config.yml condiviso ha MMAP (serving).
BUILD_JAVA_OPTS="${BUILD_JAVA_OPTS:--Xmx25g -Xms6g -XX:+UseParallelGC -XX:ParallelGCThreads=4 -XX:MaxMetaspaceSize=512m -server -Ddw.graphhopper.graph.dataaccess.default_type=RAM_STORE}"

ALL_GROUPS="grecia balcani est iberia arco-alpino germania-centro francia-benelux"

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
err()  { echo "[$(date '+%H:%M:%S')] ERRORE: $*" >&2; }
die()  { err "$*"; exit 1; }

command -v docker >/dev/null 2>&1 || die "'docker' non installato."
[[ -f "$CONFIG_FILE" ]] || die "config.yml non trovato: $CONFIG_FILE"

# Gruppi richiesti o tutti.
GROUPS=("$@")
if [[ ${#GROUPS[@]} -eq 0 ]]; then
  read -r -a GROUPS <<< "$ALL_GROUPS"
fi

# ── Build di un singolo gruppo (import-only, esce a fine build) ───────────────
build_group() {
  local group="$1"
  local pbf="${DATA_DIR}/${group}.osm.pbf"
  local graph_dir="${GRAPHS_DIR}/${group}"

  echo "------------------------------------------------------------"
  log "[${group}] avvio build"

  if [[ ! -f "$pbf" ]]; then
    err "[${group}] .pbf mancante: ${pbf} — esegui prima ./download-regions.sh ${group}"
    return 1
  fi

  mkdir -p "$graph_dir"

  # --import: builda grafo + CH + LM ed ESCE (non serve all'infinito).
  # GRAPH/FILE via env sovrascrivono graph.location/datareader.file del config.
  if docker run --rm \
      -v "${DATA_DIR}:/data:ro" \
      -v "${graph_dir}:/graphhopper/graph-cache" \
      -v "${CONFIG_FILE}:/graphhopper/config.yml:ro" \
      -e GRAPH="/graphhopper/graph-cache" \
      -e FILE="/data/${group}.osm.pbf" \
      -e JAVA_OPTS="${BUILD_JAVA_OPTS}" \
      "$GH_IMAGE" \
      --import -c /graphhopper/config.yml -o /graphhopper/graph-cache; then
    log "[${group}] build OK ✓ ($(du -sh "$graph_dir" 2>/dev/null | cut -f1))"
    return 0
  else
    err "[${group}] build FALLITO ✗"
    return 1
  fi
}

echo "============================================================"
echo " BikerLink — Build grafi GraphHopper per gruppi-area"
echo " Gruppi   : ${GROUPS[*]}"
echo " Immagine : ${GH_IMAGE}"
echo " Grafi    : ${GRAPHS_DIR}"
echo "============================================================"

OK_GROUPS=()
FAIL_GROUPS=()
for group in "${GROUPS[@]}"; do
  if ! echo "$ALL_GROUPS" | grep -qw "$group"; then
    err "Gruppo sconosciuto: '$group' (validi: $ALL_GROUPS)"
    FAIL_GROUPS+=("$group")
    continue
  fi
  if build_group "$group"; then
    OK_GROUPS+=("$group")
  else
    FAIL_GROUPS+=("$group")
  fi
done

echo "============================================================"
echo " Riepilogo build"
echo "   ✓ riusciti: ${OK_GROUPS[*]:-(nessuno)}"
echo "   ✗ falliti : ${FAIL_GROUPS[*]:-(nessuno)}"
echo ""
echo " Prossimo passo: avvia i servizi abilitati con"
echo "   docker compose up -d graphhopper-<codice>"
echo "============================================================"

# Exit != 0 se almeno un gruppo è fallito (utile in CI/cron).
[[ ${#FAIL_GROUPS[@]} -eq 0 ]]
