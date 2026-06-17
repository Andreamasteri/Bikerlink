#!/usr/bin/env bash
# cpu — porta lo scaling governor della CPU a 'performance' e lo rende persistente al reboot.
#
# Riusa la unit systemd esistente scripts/thinkcentre/cpu-performance.service
# (governor performance + THP madvise): NON duplica la logica del governor.
# Causa tipica del "non sopravvive al riavvio": la unit non era mai stata abilitata
# sul nuovo PC fisso, oppure il governor era stato impostato a mano (volatile).
#
# Idempotente: ri-eseguirlo non causa danni.
set -euo pipefail

ok()   { echo "[OK]   $1"; }
warn() { echo "[WARN] $1"; }
fail() { echo "[FAIL] $1"; }

echo "=== CPU GOVERNOR → performance (persistente al reboot) ==="
echo ""

# sudo helper
if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_SRC="$REPO_ROOT/scripts/thinkcentre/cpu-performance.service"
SERVICE_DST="/etc/systemd/system/cpu-performance.service"

# 1. Diagnostica driver/governor (i5-14400 usa intel_pstate: solo performance/powersave)
DRIVER_FILE=/sys/devices/system/cpu/cpu0/cpufreq/scaling_driver
GOV_AVAIL_FILE=/sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors

if [ -r "$DRIVER_FILE" ]; then
  DRIVER=$(cat "$DRIVER_FILE")
  echo "[i] Driver cpufreq: $DRIVER"
else
  DRIVER="sconosciuto"
  warn "Driver cpufreq non leggibile ($DRIVER_FILE). Probabile VM o frequenza gestita dal BIOS."
fi

if [ -r "$GOV_AVAIL_FILE" ]; then
  AVAIL=$(cat "$GOV_AVAIL_FILE")
  echo "[i] Governor disponibili: $AVAIL"
  if ! echo "$AVAIL" | grep -qw performance; then
    fail "Governor 'performance' non disponibile (driver $DRIVER)."
    echo "       Su intel_pstate sono validi solo 'performance' e 'powersave'."
    echo "       Verifica BIOS (no power-saving forzato) o il kernel."
    exit 1
  fi
else
  warn "cpufreq non disponibile (manca $GOV_AVAIL_FILE) — installo comunque la unit, ma la sessione corrente potrebbe non cambiare."
fi
echo ""

# 2. Installa/abilita la unit systemd (persistenza al reboot) — riusa il service esistente
if [ ! -f "$SERVICE_SRC" ]; then
  fail "Service non trovato: $SERVICE_SRC"
  echo "       Assicurati che il repo sia aggiornato (00.sh)."
  exit 1
fi

echo "[>] Installo cpu-performance.service in $SERVICE_DST ..."
$SUDO cp "$SERVICE_SRC" "$SERVICE_DST"
$SUDO systemctl daemon-reload
$SUDO systemctl enable --now cpu-performance.service
ok "cpu-performance.service installato e abilitato (enable --now): sopravvive al reboot."
echo ""

# 3. Imposta subito il governor sulla sessione corrente (oltre a quanto fa la unit)
CORES=0
for g in /sys/devices/system/cpu/cpu[0-9]*/cpufreq/scaling_governor; do
  [ -f "$g" ] || continue
  echo performance | $SUDO tee "$g" >/dev/null 2>&1 || true
  CORES=$((CORES + 1))
done
if [ "$CORES" -gt 0 ]; then
  ok "Governor 'performance' impostato su $CORES core (sessione corrente)."
else
  warn "Nessun core cpufreq trovato — niente da impostare sulla sessione corrente."
fi
echo ""

# 4. Verifica finale
echo "=== VERIFICA ==="
if [ -r /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor ]; then
  CUR=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor)
  echo "    cat .../cpu0/cpufreq/scaling_governor → $CUR (atteso: performance)"
  if [ "$CUR" = "performance" ]; then
    ok "Governor attivo: performance"
  else
    warn "Governor attivo: $CUR (atteso performance). Riavvia e ricontrolla; la unit lo riapplica al boot."
  fi
fi
echo "    systemctl is-enabled cpu-performance.service → $($SUDO systemctl is-enabled cpu-performance.service 2>/dev/null || echo n/d)"
echo ""
echo "=== Fatto. Il governor 'performance' è ora persistente al reboot. ==="
