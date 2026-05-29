#!/usr/bin/env bash
# =============================================================================
# BikerLink — download-osm.sh
# Scarica TUTTI i file dati OSM necessari allo stack self-host:
#   - Europa completa   (europe-latest.osm.pbf      ~30 GB)
#   - Ecuador           (ecuador-latest.osm.pbf     ~300 MB)
# Verifica i checksum MD5 pubblicati da Geofabrik e unisce i due PBF in un
# unico file `europe-ecuador-merged.osm.pbf` usato da GraphHopper e Valhalla.
#
# Uso:
#   ./download-osm.sh                 # scarica nella cartella ./data
#   DATA_DIR=/mnt/osm ./download-osm.sh
#
# Idempotente: se un file esiste già ed è valido (checksum OK) NON lo riscarica.
# Sicuro da rilanciare dopo un'interruzione (wget -c riprende il download).
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${DATA_DIR:-${SCRIPT_DIR}/data}"

GEOFABRIK="https://download.geofabrik.de"
EUROPE_URL="${GEOFABRIK}/europe-latest.osm.pbf"
EUROPE_MD5_URL="${EUROPE_URL}.md5"
ECUADOR_URL="${GEOFABRIK}/south-america/ecuador-latest.osm.pbf"
ECUADOR_MD5_URL="${ECUADOR_URL}.md5"

EUROPE_PBF="${DATA_DIR}/europe-latest.osm.pbf"
ECUADOR_PBF="${DATA_DIR}/ecuador-latest.osm.pbf"
MERGED_PBF="${DATA_DIR}/europe-ecuador-merged.osm.pbf"

# Soglie minime di plausibilità (byte) per scartare download corrotti/parziali.
EUROPE_MIN_BYTES=$((20 * 1024 * 1024 * 1024))   # 20 GB
ECUADOR_MIN_BYTES=$((100 * 1024 * 1024))        # 100 MB

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
err()  { echo "[$(date '+%H:%M:%S')] ERRORE: $*" >&2; }
die()  { err "$*"; exit 1; }

# ── Prerequisiti ──────────────────────────────────────────────────────────────
for bin in wget md5sum; do
  command -v "$bin" >/dev/null 2>&1 || die "'$bin' non installato. Installa con: sudo apt install -y wget coreutils"
done

OSMIUM_BIN="$(command -v osmium || true)"
if [[ -z "$OSMIUM_BIN" ]]; then
  die "'osmium' non installato. Installa con: sudo apt install -y osmium-tool"
fi

mkdir -p "$DATA_DIR"

# ── Helper: verifica MD5 di un file contro l'md5 remoto Geofabrik ─────────────
# Geofabrik pubblica i .md5 nel formato: "<hash>  <nomefile>"
verify_md5() {
  local file="$1" md5_url="$2"
  local expected
  expected="$(wget -qO- "$md5_url" | awk '{print $1}')" || return 1
  [[ -n "$expected" ]] || return 1
  local actual
  actual="$(md5sum "$file" | awk '{print $1}')"
  [[ "$actual" == "$expected" ]]
}

# ── Helper: scarica un PBF con resume + verifica dimensione + checksum ────────
download_pbf() {
  local name="$1" url="$2" md5_url="$3" dest="$4" min_bytes="$5"

  if [[ -f "$dest" ]]; then
    local size; size="$(stat -c%s "$dest")"
    if (( size >= min_bytes )) && verify_md5 "$dest" "$md5_url"; then
      log "[$name] già presente e verificato ($(du -h "$dest" | cut -f1)) — skip"
      return 0
    fi
    log "[$name] file esistente non valido o incompleto — riprendo il download"
  fi

  log "[$name] download da ${url}"
  log "[$name] (puoi interrompere con Ctrl-C e rilanciare: il download riprende da dove era)"
  wget --continue --progress=bar:force:noscroll -O "$dest" "$url"

  local size; size="$(stat -c%s "$dest")"
  (( size >= min_bytes )) || die "[$name] file troppo piccolo (${size} byte) — download corrotto"

  log "[$name] verifica checksum MD5..."
  if verify_md5 "$dest" "$md5_url"; then
    log "[$name] checksum OK ✓ ($(du -h "$dest" | cut -f1))"
  else
    die "[$name] checksum MD5 NON corrisponde — file corrotto. Rilancia lo script per riscaricare."
  fi
}

echo "============================================================"
echo " BikerLink — Download dati OSM (Europa + Ecuador)"
echo " Destinazione: ${DATA_DIR}"
echo " Spazio necessario: ~35 GB download + ~35 GB merge = ~70 GB"
echo "============================================================"

# ── 1. Europa ─────────────────────────────────────────────────────────────────
download_pbf "Europa" "$EUROPE_URL" "$EUROPE_MD5_URL" "$EUROPE_PBF" "$EUROPE_MIN_BYTES"

# ── 2. Ecuador ────────────────────────────────────────────────────────────────
download_pbf "Ecuador" "$ECUADOR_URL" "$ECUADOR_MD5_URL" "$ECUADOR_PBF" "$ECUADOR_MIN_BYTES"

# ── 3. Merge in un unico PBF ──────────────────────────────────────────────────
# Rigenera il merge solo se manca o se è più vecchio di una delle sorgenti.
if [[ -f "$MERGED_PBF" && "$MERGED_PBF" -nt "$EUROPE_PBF" && "$MERGED_PBF" -nt "$ECUADOR_PBF" ]]; then
  log "[Merge] ${MERGED_PBF} già aggiornato ($(du -h "$MERGED_PBF" | cut -f1)) — skip"
else
  log "[Merge] unione Europa + Ecuador con osmium (può richiedere diversi minuti)..."
  "$OSMIUM_BIN" merge "$EUROPE_PBF" "$ECUADOR_PBF" -o "$MERGED_PBF" --overwrite
  log "[Merge] completato ✓ → ${MERGED_PBF} ($(du -h "$MERGED_PBF" | cut -f1))"
fi

echo "============================================================"
echo " ✓ Download dati OSM completato."
echo "   Europa : ${EUROPE_PBF}"
echo "   Ecuador: ${ECUADOR_PBF}"
echo "   Merge  : ${MERGED_PBF}"
echo ""
echo " Prossimo passo: avvia lo stack con"
echo "   docker compose up -d"
echo "============================================================"
