#!/usr/bin/env bash
# Step 6 — Monta l'NVMe NTFS di Windows come magazzino OUTPUT (driver ntfs3, r/w).
# Prerequisito: Fast Startup/ibernazione di Windows OFF (ares-windows-powercfg
# via SSH) — altrimenti ntfs3 monta in sola lettura o rifiuta il mount.
# Idempotente.
#
#   ARES_NTFS_DEV    device NTFS (es. /dev/nvme0n1p3). Se vuoto, autodetect.
#   ARES_NTFS_MOUNT  mountpoint (default /mnt/ares-output)
set -euo pipefail
ARES_NTFS_MOUNT="${ARES_NTFS_MOUNT:-/mnt/ares-output}"
DEV="${ARES_NTFS_DEV:-}"

if [[ -z "$DEV" ]]; then
  echo "==> Autodetect partizione NTFS più grande"
  DEV=$(lsblk -rno NAME,FSTYPE,SIZE | awk '$2=="ntfs"{print "/dev/"$1" "$3}' \
        | sort -k2 -h | tail -1 | awk '{print $1}')
fi
[[ -n "$DEV" ]] || { echo "ERRORE: nessuna partizione NTFS trovata (passa ARES_NTFS_DEV)"; exit 1; }
echo "==> NTFS device: $DEV"

UUID=$(blkid -s UUID -o value "$DEV")
[[ -n "$UUID" ]] || { echo "ERRORE: UUID non leggibile per $DEV"; exit 1; }

install -d -m 755 "$ARES_NTFS_MOUNT"
AGENT_UID=$(id -u ares-agent 2>/dev/null || echo 0)
AGENT_GID=$(id -g ares-agent 2>/dev/null || echo 0)
OPTS="defaults,rw,uid=${AGENT_UID},gid=${AGENT_GID},windows_names,nofail,x-systemd.device-timeout=10"

echo "==> /etc/fstab (by UUID, ntfs3)"
sed -i "\#[[:space:]]${ARES_NTFS_MOUNT}[[:space:]]#d" /etc/fstab
echo "UUID=$UUID  $ARES_NTFS_MOUNT  ntfs3  $OPTS  0 0" >> /etc/fstab

systemctl daemon-reload
mountpoint -q "$ARES_NTFS_MOUNT" && umount "$ARES_NTFS_MOUNT" || true
mount "$ARES_NTFS_MOUNT"

echo "==> Verifica scrittura"
TESTF="$ARES_NTFS_MOUNT/.ares-write-test"
if touch "$TESTF" 2>/dev/null; then rm -f "$TESTF"; echo "OK: scrivibile r/w"; else
  echo "ATTENZIONE: NON scrivibile. Probabile Fast Startup/ibernazione Windows ancora attiva."
  echo "Esegui prima: powercfg /h off  (su Windows, via SSH) e rifai il boot di Windows una volta."
  exit 1
fi
df -h "$ARES_NTFS_MOUNT"
