#!/usr/bin/env bash
# usb — copia europe-latest.osm.pbf dalla pennetta USB a ~/valhalla/data/
#
# Rileva automaticamente il mount point della USB.
# Se più drive sono montati chiede quale scegliere.
# Crea ~/valhalla/data/ se non esiste.
# Copia con rsync --progress (o cp come fallback) e verifica l'integrità per dimensione.
set -euo pipefail

DEST_DIR="$HOME/valhalla/data"
PBF_NAME="europe-latest.osm.pbf"
DEST_FILE="$DEST_DIR/$PBF_NAME"

ok()   { echo "[OK]   $1"; }
warn() { echo "[WARN] $1"; }
fail() { echo "[FAIL] $1"; }

echo "=== COPIA PBF DA PENNETTA USB ==="
echo ""

# --- 1. Rileva mount point USB ---
SEARCH_PATHS=()
[ -d "/media/$USER" ]        && SEARCH_PATHS+=("/media/$USER")
[ -d "/run/media/$USER" ]    && SEARCH_PATHS+=("/run/media/$USER")
[ -d "/mnt" ]                && SEARCH_PATHS+=("/mnt")

DRIVES=()
for BASE in "${SEARCH_PATHS[@]}"; do
  while IFS= read -r -d '' MP; do
    # Esclude mount point vuoti o non accessibili
    [ -r "$MP" ] && DRIVES+=("$MP")
  done < <(find "$BASE" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null)
done

if [ "${#DRIVES[@]}" -eq 0 ]; then
  fail "Nessun dispositivo rimovibile trovato in /media/$USER, /run/media/$USER, /mnt."
  echo ""
  echo "Verifica che la USB sia inserita e montata:"
  echo "  lsblk -o NAME,MOUNTPOINT,LABEL,SIZE"
  exit 1
fi

# --- 2. Seleziona il drive ---
USB_MP=""
if [ "${#DRIVES[@]}" -eq 1 ]; then
  USB_MP="${DRIVES[0]}"
  ok "Drive rilevato: $USB_MP"
else
  echo "Più drive rimovibili trovati. Seleziona quello che contiene il PBF:"
  echo ""
  for i in "${!DRIVES[@]}"; do
    MP="${DRIVES[$i]}"
    SIZE=$(df -h "$MP" 2>/dev/null | tail -1 | awk '{print $2}' || echo "?")
    echo "  $((i+1))) $MP  [${SIZE}]"
  done
  echo ""
  read -rp "Scelta [1-${#DRIVES[@]}]: " CHOICE
  if ! [[ "$CHOICE" =~ ^[0-9]+$ ]] || [ "$CHOICE" -lt 1 ] || [ "$CHOICE" -gt "${#DRIVES[@]}" ]; then
    fail "Scelta non valida."
    exit 1
  fi
  USB_MP="${DRIVES[$((CHOICE-1))]}"
  ok "Drive selezionato: $USB_MP"
fi

# --- 3. Trova il PBF nella radice del drive ---
echo ""
echo "[>] Cerco $PBF_NAME in $USB_MP ..."
SRC_FILE="$USB_MP/$PBF_NAME"

if [ ! -f "$SRC_FILE" ]; then
  fail "File non trovato: $SRC_FILE"
  echo ""
  echo "Verifica che il PBF si trovi nella cartella principale della USB."
  echo "Contenuto di $USB_MP:"
  ls -lh "$USB_MP" 2>/dev/null || echo "  (impossibile listare)"
  exit 1
fi

SRC_SIZE=$(stat -c%s "$SRC_FILE" 2>/dev/null || stat -f%z "$SRC_FILE" 2>/dev/null || echo 0)
SRC_GB=$(awk "BEGIN{printf \"%.1f\", $SRC_SIZE/1073741824}")
ok "PBF trovato: $SRC_FILE (${SRC_GB} GB)"

# --- 4. Verifica spazio disco disponibile ---
DEST_PARENT="$HOME"
FREE_KB=$(df "$DEST_PARENT" 2>/dev/null | tail -1 | awk '{print $4}')
FREE_BYTES=$((FREE_KB * 1024))
if [ "$FREE_BYTES" -lt "$SRC_SIZE" ]; then
  FREE_GB=$(awk "BEGIN{printf \"%.1f\", $FREE_BYTES/1073741824}")
  fail "Spazio insufficiente: ${FREE_GB} GB liberi, servono ${SRC_GB} GB."
  exit 1
fi

# --- 5. Crea ~/valhalla/data/ se non esiste ---
echo ""
if [ ! -d "$DEST_DIR" ]; then
  echo "[>] Creo $DEST_DIR ..."
  mkdir -p "$DEST_DIR"
  ok "Cartella creata: $DEST_DIR"
else
  ok "Cartella già presente: $DEST_DIR"
fi

# --- 6. Avvisa se il PBF di destinazione esiste già ---
if [ -f "$DEST_FILE" ]; then
  EXIST_SIZE=$(stat -c%s "$DEST_FILE" 2>/dev/null || stat -f%z "$DEST_FILE" 2>/dev/null || echo 0)
  EXIST_GB=$(awk "BEGIN{printf \"%.1f\", $EXIST_SIZE/1073741824}")
  warn "File già presente in destinazione: $DEST_FILE (${EXIST_GB} GB)"
  echo ""
  read -rp "Sovrascrivere? [s/N] " OW
  if [[ "$OW" != "s" && "$OW" != "S" ]]; then
    echo "Annullato."
    exit 0
  fi
fi

# --- 7. Copia con rsync (fallback cp) ---
echo ""
echo "[>] Copia in corso: $SRC_FILE → $DEST_FILE"
echo "    Dimensione: ${SRC_GB} GB — potrebbe richiedere diversi minuti."
echo ""

if command -v rsync &>/dev/null; then
  rsync --progress --no-perms --no-owner --no-group "$SRC_FILE" "$DEST_FILE"
  COPY_OK=$?
else
  warn "rsync non disponibile — uso cp (nessun progress bar)."
  cp "$SRC_FILE" "$DEST_FILE"
  COPY_OK=$?
fi

if [ "$COPY_OK" -ne 0 ]; then
  fail "La copia è fallita (codice $COPY_OK)."
  exit 1
fi

# --- 8. Verifica integrità: confronta dimensioni ---
echo ""
echo "[>] Verifica integrità (confronto dimensioni)..."
DEST_SIZE=$(stat -c%s "$DEST_FILE" 2>/dev/null || stat -f%z "$DEST_FILE" 2>/dev/null || echo 0)

if [ "$DEST_SIZE" -eq "$SRC_SIZE" ]; then
  DEST_GB=$(awk "BEGIN{printf \"%.1f\", $DEST_SIZE/1073741824}")
  ok "Integrità verificata: sorgente e copia coincidono (${DEST_GB} GB)."
else
  SRC_GB_FMT=$(awk "BEGIN{printf \"%.3f\", $SRC_SIZE/1073741824}")
  DEST_GB_FMT=$(awk "BEGIN{printf \"%.3f\", $DEST_SIZE/1073741824}")
  fail "Dimensioni non coincidono: sorgente ${SRC_GB_FMT} GB ≠ copia ${DEST_GB_FMT} GB."
  fail "Il file potrebbe essere corrotto. Rimuovilo e riprova."
  rm -f "$DEST_FILE"
  exit 1
fi

# --- 9. Riepilogo ---
echo ""
echo "=== Copia completata con successo ==="
echo ""
echo "PBF disponibile in: $DEST_FILE"
echo ""
echo "Prossimi passi:"
echo "  ./swap.sh   ← swapfile 32–48 GB (OBBLIGATORIO su 16 GB)"
echo "  ./cpu.sh    ← governor performance (opzionale)"
echo "  ./04.sh     ← check pre-build"
echo "  ./05.sh     ← avvia build"
