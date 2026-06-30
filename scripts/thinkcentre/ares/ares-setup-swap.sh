#!/usr/bin/env bash
# Step 4 — Swapfile sul disco da 120GB (root) come RETE DI SICUREZZA anti-OOM.
# NON è il runtime del modello (quello sta in RAM). NIENTE swap su NTFS.
# Idempotente.
#
#   ARES_SWAP_GB  dimensione swap in GB (default 16)
#   ARES_SWAPFILE percorso swapfile (default /swapfile, deve stare su ext4/xfs)
set -euo pipefail
ARES_SWAP_GB="${ARES_SWAP_GB:-16}"
ARES_SWAPFILE="${ARES_SWAPFILE:-/swapfile}"

FSTYPE=$(stat -f -c %T "$(dirname "$ARES_SWAPFILE")")
case "$FSTYPE" in
  ext2/ext3|ext4|xfs|btrfs) : ;;
  *) echo "ERRORE: $ARES_SWAPFILE è su filesystem '$FSTYPE' (no swap su NTFS/altro)"; exit 1 ;;
esac

if swapon --show=NAME --noheadings | grep -qx "$ARES_SWAPFILE"; then
  echo "==> Swap già attivo su $ARES_SWAPFILE"
else
  if [[ ! -f "$ARES_SWAPFILE" ]]; then
    echo "==> Creo swapfile ${ARES_SWAP_GB}G in $ARES_SWAPFILE"
    fallocate -l "${ARES_SWAP_GB}G" "$ARES_SWAPFILE" 2>/dev/null \
      || dd if=/dev/zero of="$ARES_SWAPFILE" bs=1M count=$((ARES_SWAP_GB*1024)) status=progress
  fi
  chmod 600 "$ARES_SWAPFILE"
  mkswap "$ARES_SWAPFILE" >/dev/null 2>&1 || true
  swapon "$ARES_SWAPFILE"
fi

echo "==> Persistenza in /etc/fstab"
grep -qxF "$ARES_SWAPFILE none swap sw 0 0" /etc/fstab \
  || echo "$ARES_SWAPFILE none swap sw 0 0" >> /etc/fstab

echo "==> swappiness basso (10): la swap è rete di sicurezza, non runtime"
echo "vm.swappiness=10" > /etc/sysctl.d/99-ares-swappiness.conf
sysctl -p /etc/sysctl.d/99-ares-swappiness.conf >/dev/null

swapon --show
free -h
