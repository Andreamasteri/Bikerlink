#!/usr/bin/env bash
# =============================================================================
# BikerLink — download-osm.sh
# Scarica i file OSM per ogni area regionale GraphHopper e li unisce per area.
#
# Aree (sincronizzate con shared/routing-areas.ts):
#   grecia          → greece + albania
#   balcani         → croatia + bosnia-herzegovina + montenegro + serbia +
#                     macedonia + albania
#   est             → romania + hungary + bulgaria
#   iberia          → spain + portugal
#   arco-alpino     → italy + austria + switzerland + slovenia
#   germania-centro → germany + czech-republic
#   francia-benelux → france + belgium + netherlands + luxembourg
#
# Uso:
#   ./download-osm.sh                      # scarica tutte le aree
#   AREAS="grecia iberia" ./download-osm.sh  # solo le aree elencate
#   DATA_DIR=/mnt/osm ./download-osm.sh
#
# Idempotente: se un file esiste già ed è valido (checksum OK) NON lo riscarica.
# Sicuro da rilanciare dopo un'interruzione (wget -c riprende il download).
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${DATA_DIR:-${SCRIPT_DIR}/data}"
GEOFABRIK="https://download.geofabrik.de/europe"

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
err()  { echo "[$(date '+%H:%M:%S')] ERRORE: $*" >&2; }
die()  { err "$*"; exit 1; }

# ── Prerequisiti ──────────────────────────────────────────────────────────────
for bin in wget md5sum; do
  command -v "$bin" >/dev/null 2>&1 || die "'$bin' non installato. Installa con: sudo apt install -y wget coreutils"
done
OSMIUM_BIN="$(command -v osmium || true)"
[[ -n "$OSMIUM_BIN" ]] || die "'osmium' non installato. Installa con: sudo apt install -y osmium-tool"

mkdir -p "$DATA_DIR"

# ── Helper: verifica MD5 di un file contro l'md5 remoto Geofabrik ─────────────
verify_md5() {
  local file="$1" md5_url="$2"
  local expected
  expected="$(wget -qO- "$md5_url" | awk '{print $1}')" || return 1
  [[ -n "$expected" ]] || return 1
  local actual
  actual="$(md5sum "$file" | awk '{print $1}')"
  [[ "$actual" == "$expected" ]]
}

# ── Helper: scarica un singolo PBF con resume + verifica dimensione + MD5 ─────
download_country() {
  local slug="$1" min_mb="${2:-50}"
  local url="${GEOFABRIK}/${slug}-latest.osm.pbf"
  local md5_url="${url}.md5"
  local dest="${DATA_DIR}/${slug}-latest.osm.pbf"
  local min_bytes=$(( min_mb * 1024 * 1024 ))

  if [[ -f "$dest" ]]; then
    local size; size="$(stat -c%s "$dest")"
    if (( size >= min_bytes )) && verify_md5 "$dest" "$md5_url" 2>/dev/null; then
      log "  [${slug}] già presente e verificato ($(du -h "$dest" | cut -f1)) — skip"
      return 0
    fi
    log "  [${slug}] file non valido o incompleto — riprendo il download"
  fi

  log "  [${slug}] download da ${url}"
  wget --continue --progress=bar:force:noscroll -O "$dest" "$url"

  local size; size="$(stat -c%s "$dest")"
  (( size >= min_bytes )) || die "[${slug}] file troppo piccolo (${size} byte) — download corrotto"

  log "  [${slug}] verifica checksum MD5..."
  if verify_md5 "$dest" "$md5_url" 2>/dev/null; then
    log "  [${slug}] checksum OK ✓ ($(du -h "$dest" | cut -f1))"
  else
    log "  [${slug}] ⚠ checksum non verificabile (MD5 assente o rete) — continuo"
  fi
}

# ── Helper: merge osmium + check idempotenza ─────────────────────────────────
merge_area() {
  local area="$1"; shift
  local sources=("$@")
  local dest="${DATA_DIR}/${area}.osm.pbf"

  # Controlla se il merge è già aggiornato
  local needs_rebuild=false
  if [[ ! -f "$dest" ]]; then
    needs_rebuild=true
  else
    for src in "${sources[@]}"; do
      if [[ "$src" -nt "$dest" ]]; then
        needs_rebuild=true; break
      fi
    done
  fi

  if [[ "$needs_rebuild" == "false" ]]; then
    log "  [merge:${area}] ${dest} già aggiornato ($(du -h "$dest" | cut -f1)) — skip"
    return 0
  fi

  log "  [merge:${area}] unione con osmium: $(basename "${sources[@]}")"
  "$OSMIUM_BIN" merge "${sources[@]}" -o "$dest" --overwrite
  log "  [merge:${area}] ✓ → ${dest} ($(du -h "$dest" | cut -f1))"
}

# ── Definizione aree ──────────────────────────────────────────────────────────
build_area_grecia() {
  log "[grecia] download paesi..."
  download_country "greece"  300
  download_country "albania"  50
  merge_area "grecia" \
    "${DATA_DIR}/greece-latest.osm.pbf" \
    "${DATA_DIR}/albania-latest.osm.pbf"
}

build_area_balcani() {
  log "[balcani] download paesi..."
  download_country "croatia"           200
  download_country "bosnia-herzegovina" 100
  download_country "montenegro"         30
  download_country "serbia"            200
  download_country "macedonia"          80
  download_country "albania"            50
  merge_area "balcani" \
    "${DATA_DIR}/croatia-latest.osm.pbf" \
    "${DATA_DIR}/bosnia-herzegovina-latest.osm.pbf" \
    "${DATA_DIR}/montenegro-latest.osm.pbf" \
    "${DATA_DIR}/serbia-latest.osm.pbf" \
    "${DATA_DIR}/macedonia-latest.osm.pbf" \
    "${DATA_DIR}/albania-latest.osm.pbf"
}

build_area_est() {
  log "[est] download paesi..."
  download_country "romania"  500
  download_country "hungary"  200
  download_country "bulgaria" 300
  merge_area "est" \
    "${DATA_DIR}/romania-latest.osm.pbf" \
    "${DATA_DIR}/hungary-latest.osm.pbf" \
    "${DATA_DIR}/bulgaria-latest.osm.pbf"
}

build_area_iberia() {
  log "[iberia] download paesi..."
  download_country "spain"    500
  download_country "portugal" 150
  merge_area "iberia" \
    "${DATA_DIR}/spain-latest.osm.pbf" \
    "${DATA_DIR}/portugal-latest.osm.pbf"
}

build_area_arco_alpino() {
  log "[arco-alpino] download paesi..."
  download_country "italy"       2000
  download_country "austria"      400
  download_country "switzerland"  300
  download_country "slovenia"      80
  merge_area "arco-alpino" \
    "${DATA_DIR}/italy-latest.osm.pbf" \
    "${DATA_DIR}/austria-latest.osm.pbf" \
    "${DATA_DIR}/switzerland-latest.osm.pbf" \
    "${DATA_DIR}/slovenia-latest.osm.pbf"
}

build_area_germania_centro() {
  log "[germania-centro] download paesi..."
  download_country "germany"        3000
  download_country "czech-republic"  500
  merge_area "germania-centro" \
    "${DATA_DIR}/germany-latest.osm.pbf" \
    "${DATA_DIR}/czech-republic-latest.osm.pbf"
}

build_area_francia_benelux() {
  log "[francia-benelux] download paesi..."
  download_country "france"       3000
  download_country "belgium"       300
  download_country "netherlands"   300
  download_country "luxembourg"     20
  merge_area "francia-benelux" \
    "${DATA_DIR}/france-latest.osm.pbf" \
    "${DATA_DIR}/belgium-latest.osm.pbf" \
    "${DATA_DIR}/netherlands-latest.osm.pbf" \
    "${DATA_DIR}/luxembourg-latest.osm.pbf"
}

# ── Main ──────────────────────────────────────────────────────────────────────
ALL_AREAS=(grecia balcani est iberia arco-alpino germania-centro francia-benelux)
TARGET_AREAS=(${AREAS:-${ALL_AREAS[@]}})

echo "============================================================"
echo " BikerLink — Download dati OSM per area"
echo " Destinazione : ${DATA_DIR}"
echo " Aree target  : ${TARGET_AREAS[*]}"
echo "============================================================"

for area in "${TARGET_AREAS[@]}"; do
  case "$area" in
    grecia)           build_area_grecia ;;
    balcani)          build_area_balcani ;;
    est)              build_area_est ;;
    iberia)           build_area_iberia ;;
    arco-alpino)      build_area_arco_alpino ;;
    germania-centro)  build_area_germania_centro ;;
    francia-benelux)  build_area_francia_benelux ;;
    *) err "Area sconosciuta: '${area}'. Valori ammessi: ${ALL_AREAS[*]}"; exit 1 ;;
  esac
done

echo "============================================================"
echo " ✓ Download OSM completato."
echo " File pronti in: ${DATA_DIR}"
for area in "${TARGET_AREAS[@]}"; do
  pbf="${DATA_DIR}/${area}.osm.pbf"
  [[ -f "$pbf" ]] && echo "   ${area}.osm.pbf: $(du -h "$pbf" | cut -f1)" || echo "   ${area}.osm.pbf: MANCANTE"
done
echo ""
echo " Prossimo passo: build grafi GraphHopper per ogni area:"
echo "   ./build-regions.sh"
echo "============================================================"
