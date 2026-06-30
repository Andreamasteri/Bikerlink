#!/usr/bin/env bash
# Step 7 — GRUB dual-boot: default = Ares/Linux, Windows seconda voce, timeout 8s.
# Il default Linux è ciò che fa atterrare su Ares ogni reboot non presidiato
# (Task #5255). Idempotente.
#
#   ARES_GRUB_TIMEOUT  secondi (default 8)
set -euo pipefail
TIMEOUT="${ARES_GRUB_TIMEOUT:-8}"
GCFG=/etc/default/grub

set_kv() { # set_kv KEY VALUE  → imposta o aggiorna KEY=VALUE in /etc/default/grub
  local k="$1" v="$2"
  if grep -qE "^[#[:space:]]*${k}=" "$GCFG"; then
    sed -i -E "s|^[#[:space:]]*${k}=.*|${k}=${v}|" "$GCFG"
  else
    echo "${k}=${v}" >> "$GCFG"
  fi
}

cp -n "$GCFG" "${GCFG}.bak-ares" || true

# Default = prima voce del menu (il kernel Linux). saved+os-prober per vedere Windows.
set_kv GRUB_DEFAULT 0
set_kv GRUB_TIMEOUT "$TIMEOUT"
set_kv GRUB_TIMEOUT_STYLE menu
set_kv GRUB_DISABLE_OS_PROBER false

if ! command -v os-prober >/dev/null 2>&1; then
  echo "==> Installo os-prober (per rilevare Windows)"
  DEBIAN_FRONTEND=noninteractive apt-get install -y os-prober || true
fi

echo "==> update-grub"
if command -v update-grub >/dev/null 2>&1; then update-grub; else grub-mkconfig -o /boot/grub/grub.cfg; fi

echo
echo "Voci di boot rilevate:"
awk -F"'" '/menuentry /{print "  - "$2}' /boot/grub/grub.cfg 2>/dev/null | head -20
echo
echo "Default = voce 0 (Linux). Verifica che Windows compaia nell'elenco sopra."
