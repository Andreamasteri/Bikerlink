#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  BikerLink — Responsive Image Variant Generator
#
#  Genera automaticamente le varianti *-sm.webp (50% di larghezza) per ogni
#  immagine *.webp presente in assets/images/ che non abbia già il suo
#  corrispettivo -sm.webp.
#
#  Requisiti: ImageMagick (comando `convert`) — già presente nell'ambiente
#             Replit/NixOS.
#
#  Uso:
#    bash scripts/gen-responsive-images.sh            # genera solo i mancanti
#    bash scripts/gen-responsive-images.sh --force    # rigenera tutti
#
#  Quando eseguire:
#    - Ogni volta che si aggiunge una nuova immagine in assets/images/
#    - Come step pre-build (già integrato in build-apk.sh se desiderato)
#    - Manualmente: `bash scripts/gen-responsive-images.sh`
#
#  Convenzione srcset:
#    hero-handlebar.webp → hero-handlebar-sm.webp (50% width)
#    Usata da server/site/pages.ts per le direttive <picture srcset=...>
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

IMAGES_DIR="assets/images"
FORCE=false
[[ "${1:-}" == "--force" ]] && FORCE=true

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✔${RESET}  $1"; }
skip() { echo -e "  ${CYAN}–${RESET}  $1"; }
gen()  { echo -e "  ${YELLOW}↓${RESET}  $1"; }

GENERATED=0
SKIPPED=0
ALREADY_OK=0

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║     BikerLink — Responsive Image Variant Generator          ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""

if command -v magick &>/dev/null; then
  IM_CMD="magick"
elif command -v convert &>/dev/null; then
  IM_CMD="convert"
else
  echo "  ✖  ImageMagick non trovato ('magick' o 'convert'). Installa ImageMagick e riprova."
  exit 1
fi

shopt -s nullglob
for src in "$IMAGES_DIR"/*.webp; do
  filename="$(basename "$src")"

  # Salta i file che sono già una variante -sm
  if [[ "$filename" == *-sm.webp ]]; then
    continue
  fi

  base="${filename%.webp}"
  dest="$IMAGES_DIR/${base}-sm.webp"

  if [[ -f "$dest" ]] && [[ "$FORCE" == false ]]; then
    skip "$filename → ${base}-sm.webp (già esistente)"
    ALREADY_OK=$((ALREADY_OK + 1))
    continue
  fi

  gen "Generazione ${base}-sm.webp (50% width)…"
  "$IM_CMD" "$src" -resize '50%' "$dest"
  ok "Creato: $dest"
  GENERATED=$((GENERATED + 1))
done

echo ""
echo -e "  ${BOLD}────────────────────────────────────────────────────────────${RESET}"
echo -e "  Generati:      ${GREEN}${GENERATED}${RESET}"
echo -e "  Già presenti:  ${CYAN}${ALREADY_OK}${RESET}"
echo ""

if [[ $GENERATED -eq 0 ]]; then
  echo -e "  ${GREEN}Tutte le varianti -sm.webp sono già aggiornate.${RESET}"
else
  echo -e "  ${GREEN}${BOLD}Fatto!${RESET} ${GENERATED} nuova/e variante/i generate in ${IMAGES_DIR}/"
fi
echo ""
