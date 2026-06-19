#!/usr/bin/env bash
# usb — monta la pennetta USB raw, copia europe-latest.osm.pbf in ~/valhalla/data/, smonta
#
# Pensato per server headless senza auto-mount (Ubuntu Server via SSH):
#   1. Rileva i device USB raw rimovibili via `lsblk` (scelta interattiva se più dischi).
#   2. Li monta su un mountpoint dedicato (creato se assente).
#   3. Copia il PBF con verifica integrità per dimensione.
#   4. SMONTA sempre il device a fine corsa (anche su errore/interruzione, via trap).
#
# Idempotente e con messaggi chiari [OK]/[WARN]/[FAIL].
set -euo pipefail

# Config condivisa: VALHALLA_DATA_DIR (fonte unica del path tiles/data)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config-valhalla.sh"
if [ -f "$CONFIG_FILE" ]; then
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
fi
DEST_DIR="${VALHALLA_DATA_DIR:-$HOME/valhalla/data}"

PBF_NAME="europe-latest.osm.pbf"
DEST_FILE="$DEST_DIR/$PBF_NAME"
MOUNT_BASE="${USB_MOUNT:-/mnt/bikerlink-usb}"

ok()   { echo "[OK]   $1"; }
warn() { echo "[WARN] $1"; }
fail() { echo "[FAIL] $1"; }

# sudo helper (coerente con gli altri script)
if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi

# --- Cleanup: smonta SEMPRE ciò che abbiamo montato noi ---
WE_MOUNTED=0
cleanup() {
  if [ "$WE_MOUNTED" -eq 1 ] && mountpoint -q "$MOUNT_BASE" 2>/dev/null; then
    echo ""
    echo "[>] Smonto $MOUNT_BASE ..."
    if $SUDO umount "$MOUNT_BASE" 2>/dev/null; then
      ok "Device smontato."
    else
      sync
      if $SUDO umount -l "$MOUNT_BASE" 2>/dev/null; then
        warn "Smontaggio differito (lazy) eseguito: $MOUNT_BASE."
      else
        warn "Impossibile smontare $MOUNT_BASE — smontalo a mano: sudo umount $MOUNT_BASE"
      fi
    fi
  fi
}
trap cleanup EXIT INT TERM

echo "=== USB → COPIA PBF (monta + copia + smonta) ==="
echo ""

# --- 1. Rileva i device USB raw rimovibili via lsblk ---
echo "[>] Cerco device USB rimovibili (lsblk)..."
DEV_NAMES=()
DEV_LABELS=()
while IFS= read -r line; do
  # lsblk -P quota i valori: eval popola NAME/TYPE/RM/SIZE/FSTYPE/MOUNTPOINT/LABEL
  NAME=""; TYPE=""; RM=""; SIZE=""; FSTYPE=""; MOUNTPOINT=""; LABEL=""
  eval "$line"
  # Solo partizioni/dischi RIMOVIBILI (RM=1) con un filesystem montabile
  [ "$RM" = "1" ] || continue
  case "$TYPE" in part|disk) ;; *) continue ;; esac
  [ -n "$FSTYPE" ] || continue
  DESC="$NAME  [${SIZE}, ${FSTYPE}"
  [ -n "$LABEL" ] && DESC="$DESC, \"$LABEL\""
  if [ -n "$MOUNTPOINT" ]; then
    DESC="$DESC, già montato su $MOUNTPOINT"
  fi
  DESC="$DESC]"
  DEV_NAMES+=("$NAME")
  DEV_LABELS+=("$DESC")
done < <($SUDO lsblk -Ppo NAME,TYPE,RM,SIZE,FSTYPE,MOUNTPOINT,LABEL 2>/dev/null)

if [ "${#DEV_NAMES[@]}" -eq 0 ]; then
  fail "Nessun device USB rimovibile con filesystem trovato."
  echo ""
  echo "Verifica che la USB sia inserita:"
  echo "  lsblk -o NAME,TYPE,RM,SIZE,FSTYPE,MOUNTPOINT,LABEL"
  exit 1
fi

# --- 2. Seleziona il device ---
USB_DEV=""
if [ "${#DEV_NAMES[@]}" -eq 1 ]; then
  USB_DEV="${DEV_NAMES[0]}"
  ok "Device rilevato: ${DEV_LABELS[0]}"
else
  echo "Più device rimovibili trovati. Seleziona quello che contiene il PBF:"
  echo ""
  for i in "${!DEV_NAMES[@]}"; do
    echo "  $((i+1))) ${DEV_LABELS[$i]}"
  done
  echo ""
  read -rp "Scelta [1-${#DEV_NAMES[@]}]: " CHOICE
  if ! [[ "$CHOICE" =~ ^[0-9]+$ ]] || [ "$CHOICE" -lt 1 ] || [ "$CHOICE" -gt "${#DEV_NAMES[@]}" ]; then
    fail "Scelta non valida."
    exit 1
  fi
  USB_DEV="${DEV_NAMES[$((CHOICE-1))]}"
  ok "Device selezionato: $USB_DEV"
fi

# --- 3. Monta il device (o riusa il mount esistente) ---
echo ""
EXISTING_MP="$(lsblk -no MOUNTPOINT "$USB_DEV" 2>/dev/null | head -1 | tr -d ' ')"
if [ -n "$EXISTING_MP" ]; then
  MOUNT_BASE="$EXISTING_MP"
  WE_MOUNTED=0
  ok "Device già montato su $MOUNT_BASE — riuso il mount esistente (non lo smonto)."
else
  if [ ! -d "$MOUNT_BASE" ]; then
    echo "[>] Creo il mountpoint $MOUNT_BASE ..."
    $SUDO mkdir -p "$MOUNT_BASE"
  fi
  echo "[>] Monto $USB_DEV su $MOUNT_BASE ..."
  if $SUDO mount "$USB_DEV" "$MOUNT_BASE"; then
    WE_MOUNTED=1
    ok "Device montato su $MOUNT_BASE."
  else
    fail "Mount fallito per $USB_DEV."
    exit 1
  fi
fi

# --- 4. Trova il PBF sul device ---
echo ""
echo "[>] Cerco $PBF_NAME in $MOUNT_BASE ..."
SRC_FILE="$MOUNT_BASE/$PBF_NAME"
if [ ! -f "$SRC_FILE" ]; then
  # Fallback: cerca fino a 2 livelli di profondità
  FOUND="$($SUDO find "$MOUNT_BASE" -maxdepth 2 -type f -name "$PBF_NAME" 2>/dev/null | head -1 || true)"
  if [ -n "$FOUND" ]; then
    SRC_FILE="$FOUND"
  else
    fail "File non trovato: $PBF_NAME su $MOUNT_BASE"
    echo ""
    echo "Contenuto di $MOUNT_BASE:"
    ls -lh "$MOUNT_BASE" 2>/dev/null || echo "  (impossibile listare)"
    exit 1
  fi
fi

SRC_SIZE=$(stat -c%s "$SRC_FILE" 2>/dev/null || stat -f%z "$SRC_FILE" 2>/dev/null || echo 0)
SRC_GB=$(awk "BEGIN{printf \"%.1f\", $SRC_SIZE/1073741824}")
ok "PBF trovato: $SRC_FILE (${SRC_GB} GB)"

# --- 5. Verifica spazio disco disponibile a destinazione ---
FREE_KB=$(df "$HOME" 2>/dev/null | tail -1 | awk '{print $4}')
FREE_BYTES=$((FREE_KB * 1024))
if [ "$FREE_BYTES" -lt "$SRC_SIZE" ]; then
  FREE_GB=$(awk "BEGIN{printf \"%.1f\", $FREE_BYTES/1073741824}")
  fail "Spazio insufficiente in $HOME: ${FREE_GB} GB liberi, servono ${SRC_GB} GB."
  exit 1
fi

# --- 6. Crea la cartella di destinazione se non esiste ---
echo ""
if [ ! -d "$DEST_DIR" ]; then
  echo "[>] Creo $DEST_DIR ..."
  mkdir -p "$DEST_DIR"
  ok "Cartella creata: $DEST_DIR"
else
  ok "Cartella già presente: $DEST_DIR"
fi

# --- 7. Avvisa se il PBF di destinazione esiste già ---
if [ -f "$DEST_FILE" ]; then
  EXIST_SIZE=$(stat -c%s "$DEST_FILE" 2>/dev/null || stat -f%z "$DEST_FILE" 2>/dev/null || echo 0)
  EXIST_GB=$(awk "BEGIN{printf \"%.1f\", $EXIST_SIZE/1073741824}")
  warn "File già presente in destinazione: $DEST_FILE (${EXIST_GB} GB)"
  echo ""
  read -rp "Sovrascrivere? [s/N] " OW
  if [[ "$OW" != "s" && "$OW" != "S" ]]; then
    echo "Annullato (il device verrà smontato)."
    exit 0
  fi
fi

# --- 8. Copia con rsync (fallback cp) ---
echo ""
echo "[>] Copia in corso: $SRC_FILE → $DEST_FILE"
echo "    Dimensione: ${SRC_GB} GB — potrebbe richiedere diversi minuti."
echo ""

COPY_OK=0
if command -v rsync &>/dev/null; then
  $SUDO rsync --progress --no-perms --no-owner --no-group "$SRC_FILE" "$DEST_FILE" || COPY_OK=$?
else
  warn "rsync non disponibile — uso cp (nessuna progress bar)."
  $SUDO cp "$SRC_FILE" "$DEST_FILE" || COPY_OK=$?
fi

if [ "$COPY_OK" -ne 0 ]; then
  fail "La copia è fallita (codice $COPY_OK)."
  exit 1
fi

# La copia via sudo può lasciare il file di root: riallinea l'owner all'utente.
if [ "$(id -u)" -ne 0 ]; then
  $SUDO chown "$(id -u):$(id -g)" "$DEST_FILE" 2>/dev/null || true
fi

# --- 9. Verifica integrità: confronta dimensioni ---
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
  fail "Il file potrebbe essere corrotto. Lo rimuovo."
  rm -f "$DEST_FILE"
  exit 1
fi

# --- 10. Riepilogo (lo smontaggio avviene nel trap di uscita) ---
echo ""
echo "=== Copia completata con successo ==="
echo ""
echo "PBF disponibile in: $DEST_FILE"
echo ""
echo "Prossimi passi:"
echo "  ./swap.sh   ← swapfile 32–48 GB (consigliato anche su 32 GB)"
echo "  ./cpu.sh    ← governor performance (opzionale)"
echo "  ./04.sh     ← check pre-build"
echo "  ./05.sh     ← avvia build"
