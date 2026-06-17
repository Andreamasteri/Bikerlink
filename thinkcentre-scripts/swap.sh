#!/usr/bin/env bash
# swap — crea/verifica uno swapfile capiente su SSD per la build Valhalla Europa su 16 GB
#
# La build Europa (blocco unico) ha picchi RAM oltre i 16 GB nelle fasi di parsing
# iniziale e graphenhancer: senza swap il kernel uccide il container (OOM-kill) a
# metà build. Valhalla usa file memory-mapped, quindi su SSD lo swap degrada in modo
# graceful: la build completa, accettando un rallentamento tollerabile.
#
# Idempotente: se lo swapfile esiste già della dimensione giusta non lo ricrea.
set -euo pipefail

SWAP_FILE="${SWAP_FILE:-/swapfile}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-40}"   # target consigliato 32–48 GB
MIN_SWAP_GB="${MIN_SWAP_GB:-32}"

ok()   { echo "[OK]   $1"; }
warn() { echo "[WARN] $1"; }
fail() { echo "[FAIL] $1"; }

echo "=== SWAPFILE PER BUILD VALHALLA EUROPA (scenario 16 GB) ==="
echo ""

# sudo helper (gli altri script usano sudo inline; qui idem)
if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi

# Valida la dimensione richiesta (32–48 GB)
if [ "$SWAP_SIZE_GB" -lt "$MIN_SWAP_GB" ]; then
  warn "SWAP_SIZE_GB=${SWAP_SIZE_GB} è sotto il minimo consigliato (${MIN_SWAP_GB} GB). Lo alzo a ${MIN_SWAP_GB} GB."
  SWAP_SIZE_GB="$MIN_SWAP_GB"
fi
if [ "$SWAP_SIZE_GB" -gt 48 ]; then
  warn "SWAP_SIZE_GB=${SWAP_SIZE_GB} è oltre i 48 GB consigliati: spreco di spazio su disco. Procedo comunque."
fi

# RAM totale (solo informativo)
RAM_GB=$(awk '/MemTotal/{printf "%d", $2/1048576}' /proc/meminfo)
echo "[i] RAM totale rilevata: ${RAM_GB} GB"
if [ "$RAM_GB" -ge 30 ]; then
  echo "[i] Con 32+ GB lo swap è una rete di sicurezza (consigliato ma non critico)."
else
  echo "[i] Scenario 16 GB: lo swap è OBBLIGATORIO per portare a termine la build Europa."
fi
echo ""

# Avviso filesystem: gli swapfile su btrfs richiedono attributi speciali (no-COW)
TARGET_DIR="$(dirname "$SWAP_FILE")"
FSTYPE=$(df --output=fstype "$TARGET_DIR" 2>/dev/null | tail -1 | tr -d ' ' || echo "")
if [ "$FSTYPE" = "btrfs" ] || [ "$FSTYPE" = "zfs" ]; then
  warn "Filesystem '$FSTYPE' su $TARGET_DIR: gli swapfile richiedono passaggi specifici (chattr +C / zvol)."
  warn "Su ext4/xfs (SSD del ThinkCentre) non serve nulla di speciale. Verifica manualmente se usi $FSTYPE."
fi

# Spazio libero sufficiente per lo swapfile
FREE_GB=$(df --output=avail -BG "$TARGET_DIR" 2>/dev/null | tail -1 | tr -dc '0-9' || echo 0)
if [ -n "$FREE_GB" ] && [ "$FREE_GB" -lt "$SWAP_SIZE_GB" ]; then
  fail "Spazio libero in $TARGET_DIR insufficiente: ${FREE_GB} GB liberi, servono ${SWAP_SIZE_GB} GB per lo swapfile."
  exit 1
fi

# Verifica swapfile esistente
RECREATE=0
if [ -f "$SWAP_FILE" ]; then
  CUR_BYTES=$(stat -c%s "$SWAP_FILE" 2>/dev/null || echo 0)
  CUR_GB=$((CUR_BYTES / 1073741824))
  if [ "$CUR_GB" -ge "$MIN_SWAP_GB" ]; then
    ok "Swapfile già presente: $SWAP_FILE (${CUR_GB} GB >= ${MIN_SWAP_GB} GB) — non lo ricreo."
    # Assicura che sia attivo
    if swapon --show=NAME --noheadings 2>/dev/null | grep -qx "$SWAP_FILE"; then
      ok "Swapfile già attivo."
    else
      echo "[>] Attivo lo swapfile esistente..."
      $SUDO chmod 600 "$SWAP_FILE"
      # Se manca la firma swap, la creo (mkswap è idempotente sul contenuto)
      if ! $SUDO file "$SWAP_FILE" 2>/dev/null | grep -qi "swap"; then
        $SUDO mkswap "$SWAP_FILE" >/dev/null
      fi
      $SUDO swapon "$SWAP_FILE"
      ok "Swapfile attivato."
    fi
  else
    warn "Swapfile presente ma troppo piccolo: ${CUR_GB} GB (< ${MIN_SWAP_GB} GB). Lo ricreo a ${SWAP_SIZE_GB} GB."
    RECREATE=1
  fi
else
  RECREATE=1
fi

# Crea (o ricrea) lo swapfile
if [ "$RECREATE" -eq 1 ]; then
  if swapon --show=NAME --noheadings 2>/dev/null | grep -qx "$SWAP_FILE"; then
    echo "[>] Disattivo lo swapfile esistente prima di ricrearlo..."
    $SUDO swapoff "$SWAP_FILE" || true
  fi
  [ -f "$SWAP_FILE" ] && $SUDO rm -f "$SWAP_FILE"

  echo "[>] Creo swapfile da ${SWAP_SIZE_GB} GB in $SWAP_FILE ..."
  if $SUDO fallocate -l "${SWAP_SIZE_GB}G" "$SWAP_FILE" 2>/dev/null; then
    ok "Spazio allocato con fallocate."
  else
    warn "fallocate non supportato su questo filesystem — uso dd (più lento)..."
    $SUDO dd if=/dev/zero of="$SWAP_FILE" bs=1M count=$((SWAP_SIZE_GB * 1024)) status=progress
  fi
  $SUDO chmod 600 "$SWAP_FILE"
  $SUDO mkswap "$SWAP_FILE" >/dev/null
  $SUDO swapon "$SWAP_FILE"
  ok "Swapfile creato e attivato (${SWAP_SIZE_GB} GB)."
fi

# Persistenza al reboot via /etc/fstab
FSTAB_LINE="$SWAP_FILE none swap sw 0 0"
if grep -qsE "^[^#]*[[:space:]]+${SWAP_FILE}[[:space:]]+swap" /etc/fstab || \
   grep -qsE "^${SWAP_FILE}[[:space:]]" /etc/fstab; then
  ok "Voce in /etc/fstab già presente (swap persistente al reboot)."
else
  echo "$FSTAB_LINE" | $SUDO tee -a /etc/fstab >/dev/null
  ok "Aggiunta voce a /etc/fstab — lo swap si riattiva automaticamente al reboot."
fi

# Verifica finale
echo ""
echo "=== VERIFICA ==="
swapon --show 2>/dev/null || true
echo ""
free -h 2>/dev/null || true
echo ""

SWAP_GB_NOW=$(awk '/SwapTotal/{printf "%d", $2/1048576}' /proc/meminfo)
if [ "$SWAP_GB_NOW" -ge "$MIN_SWAP_GB" ]; then
  echo "=== Swap attivo: ${SWAP_GB_NOW} GB — puoi procedere con 04.sh ==="
else
  fail "Swap attivo solo ${SWAP_GB_NOW} GB (< ${MIN_SWAP_GB} GB). Controlla gli errori sopra."
  exit 1
fi
