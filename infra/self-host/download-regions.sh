#!/usr/bin/env bash
# =============================================================================
# BikerLink — download-regions.sh
# Scarica i singoli .pbf nazionali da Geofabrik e li UNISCE per gruppo-area
# (sistema di routing "ad aree regionali"). Produce un file <codice>.osm.pbf
# per ogni gruppo, pronto per build-regions.sh.
#
# Gruppi e nazioni: vedi shared/routing-areas.ts (FONTE DI VERITÀ). Le mappe
# qui sotto sono una COPIA PARALLELA che deve restare sincronizzata con quel file.
#
# Uso:
#   ./download-regions.sh                       # tutti i gruppi → ./data
#   ./download-regions.sh grecia balcani        # solo alcuni gruppi
#   DATA_DIR=/mnt/nvme/osm ./download-regions.sh
#
# Idempotente: file nazionali e merge già validi NON vengono rifatti.
# Sicuro da rilanciare dopo un'interruzione (wget -c riprende il download).
#
# NOTA: alcune nazioni (es. Albania) appartengono a più gruppi: il file
# nazionale viene scaricato UNA volta sola e riusato in tutti i merge.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${DATA_DIR:-${SCRIPT_DIR}/data}"
# Cartella per i singoli .pbf nazionali (cache condivisa fra i gruppi).
COUNTRIES_DIR="${COUNTRIES_DIR:-${DATA_DIR}/countries}"

GEOFABRIK="https://download.geofabrik.de/europe"
GEOFABRIK_SA="https://download.geofabrik.de/south-america"

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
err()  { echo "[$(date '+%H:%M:%S')] ERRORE: $*" >&2; }
die()  { err "$*"; exit 1; }

# ── Registro gruppi → slug Geofabrik (sync con shared/routing-areas.ts) ───────
# Niente array associativi annidati: una funzione che mappa codice → slug.
# Per gruppi fuori Europa (es. ecuador) il prefisso URL è diverso: viene
# gestito in download_country() tramite group_base_url().
group_slugs() {
  case "$1" in
    grecia)          echo "greece albania" ;;
    balcani)         echo "croatia bosnia-herzegovina montenegro serbia macedonia albania" ;;
    est)             echo "romania hungary bulgaria" ;;
    iberia)          echo "spain portugal" ;;
    arco-alpino)     echo "italy austria switzerland slovenia" ;;
    germania-centro) echo "germany czech-republic" ;;
    francia-benelux) echo "france belgium netherlands luxembourg" ;;
    ecuador)         echo "ecuador" ;;
    *)               return 1 ;;
  esac
}

# Restituisce l'URL base Geofabrik per il singolo slug.
# Per gli slug del Sud America usa GEOFABRIK_SA, altrimenti GEOFABRIK (Europa).
slug_base_url() {
  case "$1" in
    ecuador) echo "$GEOFABRIK_SA" ;;
    *)       echo "$GEOFABRIK" ;;
  esac
}

ALL_GROUPS="grecia balcani est iberia arco-alpino germania-centro francia-benelux ecuador"

# Gruppi richiesti (argomenti) o tutti.
GROUPS=("$@")
if [[ ${#GROUPS[@]} -eq 0 ]]; then
  read -r -a GROUPS <<< "$ALL_GROUPS"
fi

# ── Prerequisiti ──────────────────────────────────────────────────────────────
for bin in wget md5sum osmium; do
  command -v "$bin" >/dev/null 2>&1 \
    || die "'$bin' non installato. Installa con: sudo apt install -y wget coreutils osmium-tool"
done

mkdir -p "$DATA_DIR" "$COUNTRIES_DIR"

# ── Helper: verifica MD5 contro l'md5 remoto Geofabrik ────────────────────────
verify_md5() {
  local file="$1" md5_url="$2" expected actual
  expected="$(wget -qO- "$md5_url" | awk '{print $1}')" || return 1
  [[ -n "$expected" ]] || return 1
  actual="$(md5sum "$file" | awk '{print $1}')"
  [[ "$actual" == "$expected" ]]
}

# ── Helper: scarica un singolo .pbf nazionale (con cache + checksum) ──────────
download_country() {
  local slug="$1"
  local dest="${COUNTRIES_DIR}/${slug}-latest.osm.pbf"
  local base_url; base_url="$(slug_base_url "$slug")"
  local url="${base_url}/${slug}-latest.osm.pbf"
  local md5_url="${url}.md5"

  if [[ -f "$dest" ]] && verify_md5 "$dest" "$md5_url"; then
    log "  [${slug}] già presente e verificato ($(du -h "$dest" | cut -f1)) — skip"
    return 0
  fi

  log "  [${slug}] download da ${url}"
  wget --continue --progress=bar:force:noscroll -O "$dest" "$url" \
    || die "[${slug}] download fallito"

  log "  [${slug}] verifica checksum MD5..."
  verify_md5 "$dest" "$md5_url" \
    || die "[${slug}] checksum MD5 NON corrisponde — file corrotto. Rilancia lo script."
  log "  [${slug}] OK ✓ ($(du -h "$dest" | cut -f1))"
}

# ── Helper: scarica + unisce un gruppo ───────────────────────────────────────
process_group() {
  local group="$1"
  local slugs merged
  slugs="$(group_slugs "$group")" || die "Gruppo sconosciuto: '$group' (validi: $ALL_GROUPS)"
  merged="${DATA_DIR}/${group}.osm.pbf"

  echo "------------------------------------------------------------"
  log "[${group}] nazioni: ${slugs}"

  # 1) Scarica tutti i .pbf nazionali del gruppo (cache condivisa).
  local files=()
  for slug in $slugs; do
    download_country "$slug"
    files+=("${COUNTRIES_DIR}/${slug}-latest.osm.pbf")
  done

  # 2) Merge: rigenera solo se manca o è più vecchio di una delle sorgenti.
  local need_merge=0
  if [[ ! -f "$merged" ]]; then
    need_merge=1
  else
    for f in "${files[@]}"; do
      [[ "$f" -nt "$merged" ]] && need_merge=1
    done
  fi

  if [[ "$need_merge" -eq 0 ]]; then
    log "[${group}] merge già aggiornato ($(du -h "$merged" | cut -f1)) — skip"
    return 0
  fi

  if [[ ${#files[@]} -eq 1 ]]; then
    log "[${group}] gruppo mono-nazione: copia diretta"
    cp -f "${files[0]}" "$merged"
  else
    log "[${group}] merge di ${#files[@]} nazioni con osmium..."
    osmium merge "${files[@]}" -o "$merged" --overwrite
  fi
  log "[${group}] merge completato ✓ → ${merged} ($(du -h "$merged" | cut -f1))"
}

echo "============================================================"
echo " BikerLink — Download dati OSM per gruppi-area"
echo " Gruppi    : ${GROUPS[*]}"
echo " Dati      : ${DATA_DIR}"
echo " Nazionali : ${COUNTRIES_DIR}"
echo "============================================================"

for group in "${GROUPS[@]}"; do
  process_group "$group"
done

echo "============================================================"
echo " ✓ Download/merge completato per: ${GROUPS[*]}"
echo ""
echo " Prossimo passo: builda i grafi con"
echo "   ./build-regions.sh ${GROUPS[*]}"
echo "============================================================"
