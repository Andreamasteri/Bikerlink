#!/usr/bin/env bash
# 04 — PRE-FLIGHT HULK ThinkCentre + verifica pre-build Valhalla
#
# Sola lettura. Nessun install, restart, repair, deploy o modifica persistente.
# Ogni check è isolato: un comando assente/non applicabile non può saltare le
# sezioni successive. Il risultato finale è sempre esplicito: READY, WARNINGS
# oppure BLOCKED.
set -u
set -o pipefail

PBF="${VALHALLA_DATA_DIR:-$HOME/valhalla/data}/europe-latest.osm.pbf"
TILES="${VALHALLA_TILES_DIR:-${VALHALLA_DATA_DIR:-$HOME/valhalla/data}/valhalla_tiles}"
MIN_PBF_GB="${MIN_PBF_GB:-1}"
MIN_DISK_GB="${MIN_DISK_GB:-80}"
MIN_SWAP_GB="${MIN_SWAP_GB:-8}"
EXPECT_NVIDIA="${PREFLIGHT_EXPECT_NVIDIA:-1}"
EXPECTED_SERVICES="${PREFLIGHT_SERVICES:-docker ollama cloudflared tailscaled}"
LIVE_NETWORK="${PREFLIGHT_LIVE_NETWORK:-1}"

FAILURES=0
WARNINGS=0
SKIPS=0
CHECKS=0

ok() { CHECKS=$((CHECKS + 1)); echo "[OK]   $1"; }
warn() { CHECKS=$((CHECKS + 1)); WARNINGS=$((WARNINGS + 1)); echo "[WARN] $1"; }
fail() { CHECKS=$((CHECKS + 1)); FAILURES=$((FAILURES + 1)); echo "[FAIL] $1"; }
skip() { CHECKS=$((CHECKS + 1)); SKIPS=$((SKIPS + 1)); echo "[SKIP] $1"; }
info() { echo "[INFO] $1"; }
has_cmd() { command -v "$1" >/dev/null 2>&1; }

section() {
  echo ""
  echo "======================================================"
  echo "  $1"
  echo "======================================================"
}

# Non stampare mai segreti se un comando di sistema li include accidentalmente.
redact() {
  sed -E \
    -e 's/(Bearer[[:space:]]+)[^[:space:]]+/\1[REDACTED]/Ig' \
    -e 's/((token|secret|password|passwd|api[_-]?key|authorization)[[:space:]=:]+)[^[:space:]]+/\1[REDACTED]/Ig' \
    -e 's#([?&](token|secret|password|passwd|api[_-]?key|sig)=)[^&[:space:]]+#\1[REDACTED]#Ig'
}

show_safe() {
  [ -n "${1:-}" ] || return 0
  printf '%s\n' "$1" | redact | sed -n '1,24p' | sed 's/^/       /'
}

human_kb() {
  awk -v kb="${1:-0}" 'BEGIN {
    if (kb >= 1048576) printf "%.1f GiB", kb / 1048576;
    else if (kb >= 1024) printf "%.0f MiB", kb / 1024;
    else printf "%d KiB", kb;
  }'
}

echo "======================================================"
echo "  BikerLink — PRE-FLIGHT HULK ThinkCentre"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "  modalità: sola lettura / no production / no deploy"
echo "======================================================"

# 1 — HARDWARE
section "1/5 HARDWARE — CPU / RAM / DISCHI / TEMP / FAN / SMART / NVMe"

if has_cmd lscpu; then
  CPU_MODEL="$(lscpu 2>/dev/null | awk -F: '/^Model name:/ {sub(/^[[:space:]]+/, "", $2); print $2; exit}')"
  CPU_THREADS="$(lscpu 2>/dev/null | awk -F: '/^CPU\(s\):/ {gsub(/[[:space:]]/, "", $2); print $2; exit}')"
  if [ -n "$CPU_MODEL" ] && [ -n "$CPU_THREADS" ]; then ok "CPU: $CPU_MODEL ($CPU_THREADS thread)"; else fail "CPU non leggibile tramite lscpu"; fi
else
  CPU_MODEL="$(awk -F: '/model name/ {sub(/^[[:space:]]+/, "", $2); print $2; exit}' /proc/cpuinfo 2>/dev/null || true)"
  [ -n "$CPU_MODEL" ] && ok "CPU: $CPU_MODEL (fallback /proc/cpuinfo)" || fail "CPU non leggibile"
fi

if [ -r /proc/loadavg ] && [ "${CPU_THREADS:-0}" -gt 0 ] 2>/dev/null; then
  LOAD_1M="$(awk '{print $1}' /proc/loadavg 2>/dev/null || true)"
  if [ -n "$LOAD_1M" ]; then
    if awk -v load="$LOAD_1M" -v threads="$CPU_THREADS" 'BEGIN {exit !(load > threads * 1.5)}'; then
      warn "Load CPU 1m: $LOAD_1M su $CPU_THREADS thread (oltre 150% della capacità nominale)"
    else
      ok "Load CPU 1m: $LOAD_1M su $CPU_THREADS thread"
    fi
  else
    warn "Load CPU non leggibile"
  fi
else
  skip "Load CPU: /proc/loadavg o numero thread non disponibile"
fi

if [ -r /proc/meminfo ]; then
  MEM_TOTAL_KB="$(awk '/^MemTotal:/ {print $2; exit}' /proc/meminfo)"
  MEM_AVAILABLE_KB="$(awk '/^MemAvailable:/ {print $2; exit}' /proc/meminfo)"
  SWAP_TOTAL_KB="$(awk '/^SwapTotal:/ {print $2; exit}' /proc/meminfo)"
  MEM_TOTAL_KB="${MEM_TOTAL_KB:-0}"; MEM_AVAILABLE_KB="${MEM_AVAILABLE_KB:-0}"; SWAP_TOTAL_KB="${SWAP_TOTAL_KB:-0}"
  RAM_GB=$((MEM_TOTAL_KB / 1048576)); SWAP_GB=$((SWAP_TOTAL_KB / 1048576))
  if [ "$MEM_TOTAL_KB" -gt 0 ]; then
    AVAILABLE_PCT=$((MEM_AVAILABLE_KB * 100 / MEM_TOTAL_KB))
    ok "RAM: $(human_kb "$MEM_TOTAL_KB") totale, $(human_kb "$MEM_AVAILABLE_KB") disponibile (${AVAILABLE_PCT}%)"
    [ "$AVAILABLE_PCT" -lt 10 ] && warn "RAM disponibile sotto il 10%: pressione memoria elevata"
  else
    fail "RAM non leggibile da /proc/meminfo"
  fi
  if [ "$SWAP_GB" -ge "$MIN_SWAP_GB" ]; then
    ok "Swap: ${SWAP_GB} GiB attivi (>= ${MIN_SWAP_GB} GiB)"
  elif [ "$SWAP_GB" -gt 0 ] && [ "$RAM_GB" -ge 30 ]; then
    warn "Swap: ${SWAP_GB} GiB; con ${RAM_GB} GiB RAM non blocca, ma è sotto il target ${MIN_SWAP_GB} GiB"
  elif [ "$SWAP_GB" -gt 0 ]; then
    fail "Swap: ${SWAP_GB} GiB; insufficiente con ${RAM_GB} GiB RAM"
  elif [ "$RAM_GB" -ge 30 ]; then
    warn "Swap assente; con ${RAM_GB} GiB RAM non blocca ma manca la rete di sicurezza OOM"
  else
    fail "Swap assente con ${RAM_GB} GiB RAM: rischio OOM durante la build"
  fi
else
  fail "/proc/meminfo assente: RAM/swap non verificabili"
  RAM_GB=0
fi

DISKS=""
if has_cmd lsblk; then
  # Escludi pseudo-device del container/host (ram*, zram*, loop*) dal controllo
  # SMART: non sono dischi fisici e altrimenti generano falsi FAIL.
  DISKS="$(lsblk -dn -e 7 -o NAME,TYPE 2>/dev/null | awk '$2 == "disk" && $1 !~ /^(ram|zram|loop)/ {print $1}')"
  if [ -n "$DISKS" ]; then
    ok "Dischi rilevati: $(printf '%s' "$DISKS" | tr '\n' ' ')"
    info "Inventario storage:"; show_safe "$(lsblk -e 7 -o NAME,TYPE,SIZE,MODEL,RO,FSTYPE,MOUNTPOINTS 2>/dev/null || true)"
  else
    fail "Nessun disco di tipo disk rilevato"
  fi
else
  fail "lsblk non disponibile: dischi non verificabili"
fi

if has_cmd df; then
  ROOT_FREE_KB="$(df -Pk / 2>/dev/null | awk 'NR == 2 {print $4}')"; ROOT_FREE_KB="${ROOT_FREE_KB:-0}"
  ROOT_FREE_GB=$((ROOT_FREE_KB / 1048576))
  if [ "$ROOT_FREE_GB" -lt 2 ]; then fail "Spazio libero su /: ${ROOT_FREE_GB} GiB (<2 GiB)";
  elif [ "$ROOT_FREE_GB" -lt "$MIN_DISK_GB" ]; then warn "Spazio libero su /: ${ROOT_FREE_GB} GiB (<${MIN_DISK_GB} GiB consigliati)";
  else ok "Spazio libero su /: ${ROOT_FREE_GB} GiB (>=${MIN_DISK_GB} GiB)"; fi
else
  fail "df non disponibile: spazio disco non verificabile"
fi

SENSOR_OUTPUT=""
if has_cmd sensors; then
  SENSOR_OUTPUT="$(sensors 2>&1 || true)"
  if printf '%s\n' "$SENSOR_OUTPUT" | grep -Eiq '°C|temp|fan|rpm'; then
    ok "Sensori hardware interrogabili"; show_safe "$(printf '%s\n' "$SENSOR_OUTPUT" | grep -Ei '°C|temp|fan|rpm' || true)"
    TEMP_VALUES="$(printf '%s\n' "$SENSOR_OUTPUT" | grep -Eo '[+-]?[0-9]+(\.[0-9]+)?°C' | tr -d '°C' || true)"
    if [ -n "$TEMP_VALUES" ]; then
      HOT_COUNT=0
      CRITICAL_TEMP_COUNT=0
      while IFS= read -r temp_value; do
        [ -n "$temp_value" ] || continue
        if awk -v t="$temp_value" 'BEGIN {exit !(t >= 95)}'; then CRITICAL_TEMP_COUNT=$((CRITICAL_TEMP_COUNT + 1));
        elif awk -v t="$temp_value" 'BEGIN {exit !(t >= 85)}'; then HOT_COUNT=$((HOT_COUNT + 1)); fi
      done <<< "$TEMP_VALUES"
      [ "$CRITICAL_TEMP_COUNT" -gt 0 ] && fail "Temperature hardware critica: ${CRITICAL_TEMP_COUNT} lettura/e >=95°C"
      [ "$HOT_COUNT" -gt 0 ] && warn "Temperature hardware alta: ${HOT_COUNT} lettura/e >=85°C"
      [ "$CRITICAL_TEMP_COUNT" -eq 0 ] && [ "$HOT_COUNT" -eq 0 ] && ok "Temperature hardware sotto 85°C"
    else
      warn "Temperature esposte ma valori numerici non leggibili"
    fi
    if printf '%s\n' "$SENSOR_OUTPUT" | grep -Eiq 'fan|rpm'; then
      if printf '%s\n' "$SENSOR_OUTPUT" | grep -Eiq '0[[:space:]]*RPM|fan[[:space:]]*:[[:space:]]*0'; then warn "Ventole: almeno una lettura a 0 RPM (verificare carico/sonda)"; else ok "Ventole: letture RPM presenti"; fi
    else skip "Ventole: nessuna lettura RPM esposta"; fi
  else
    warn "sensors presente ma non restituisce temperature/ventole utili"
  fi
elif compgen -G '/sys/class/thermal/thermal_zone*/temp' >/dev/null; then
  THERMAL_COUNT=0
  for thermal_file in /sys/class/thermal/thermal_zone*/temp; do
    [ -r "$thermal_file" ] || continue
    thermal_raw="$(cat "$thermal_file" 2>/dev/null || true)"
    case "$thermal_raw" in ''|*[!0-9]*) continue ;; esac
    THERMAL_COUNT=$((THERMAL_COUNT + 1)); info "${thermal_file##*/}: $((thermal_raw / 1000))°C"
  done
  [ "$THERMAL_COUNT" -gt 0 ] && ok "Temperature sysfs: ${THERMAL_COUNT} zona/e" || fail "Temperature hardware non leggibili"
  skip "Ventole: lm-sensors non disponibile"
else
  fail "Temperature hardware non leggibili: sensors e thermal sysfs assenti"
  skip "Ventole: nessuna sorgente sensori disponibile"
fi

SMARTCTL=()
if has_cmd smartctl; then
  if [ "$(id -u)" -eq 0 ]; then SMARTCTL=(smartctl)
  elif has_cmd sudo && sudo -n -v >/dev/null 2>&1; then SMARTCTL=(sudo -n smartctl)
  else skip "SMART: smartctl richiede privilegi non disponibili"; fi
  if [ "${#SMARTCTL[@]}" -gt 0 ] && [ -n "$DISKS" ]; then
    while IFS= read -r disk; do
      [ -n "$disk" ] || continue
      SMART_OUTPUT="$("${SMARTCTL[@]}" -H "/dev/$disk" 2>&1 || true)"
      SMART_STATUS="$(printf '%s\n' "$SMART_OUTPUT" | awk -F: '/SMART overall-health|SMART Health Status/ {gsub(/[[:space:]]/, "", $2); print $2; exit}')"
      if printf '%s\n' "$SMART_OUTPUT" | grep -Eiq 'PASSED|OK'; then ok "SMART /dev/$disk: ${SMART_STATUS:-PASSED}"
      elif printf '%s\n' "$SMART_OUTPUT" | grep -Eiq 'not supported|unavailable|permission|cannot open'; then warn "SMART /dev/$disk: non interrogabile"
      else fail "SMART /dev/$disk: salute non confermata (${SMART_STATUS:-stato ignoto})"; fi
    done <<< "$DISKS"
  elif [ -z "$DISKS" ]; then skip "SMART: nessun disco rilevato"; fi
else
  if [ -n "$DISKS" ]; then fail "SMART: smartctl non installato con dischi presenti"; else skip "SMART: smartctl non installato e nessun disco"; fi
fi

NVME_DEVICES=""
if has_cmd nvme; then
  NVME_DEVICES="$(nvme list 2>/dev/null | awk '/^\/dev\/nvme/ {print $1}')"
  [ -n "$NVME_DEVICES" ] || NVME_DEVICES="$(printf '%s\n' "$DISKS" | awk '/^nvme/ {print "/dev/" $1}')"
  if [ -n "$NVME_DEVICES" ]; then
    while IFS= read -r nvme_device; do
      [ -n "$nvme_device" ] || continue
      NVME_OUTPUT="$(nvme smart-log "$nvme_device" 2>&1 || true)"
      CRITICAL="$(printf '%s\n' "$NVME_OUTPUT" | awk -F: '/critical_warning/ {gsub(/[[:space:]]/, "", $2); print $2; exit}')"
      MEDIA_ERRORS="$(printf '%s\n' "$NVME_OUTPUT" | awk -F: '/media_errors/ {gsub(/[[:space:]]/, "", $2); print $2; exit}')"
      NVME_TEMP="$(printf '%s\n' "$NVME_OUTPUT" | awk -F: '/^temperature/ {gsub(/[[:space:]]/, "", $2); print $2; exit}')"
      if [ -n "$CRITICAL" ] && [ "$CRITICAL" != "0" ]; then fail "NVMe $nvme_device: critical_warning=$CRITICAL";
      elif printf '%s\n' "$NVME_OUTPUT" | grep -Eqi 'failed|error opening|permission denied'; then warn "NVMe $nvme_device: interrogazione fallita";
      else ok "NVMe $nvme_device: critical_warning=${CRITICAL:-0}, media_errors=${MEDIA_ERRORS:-0}${NVME_TEMP:+, temp=$NVME_TEMP}"; fi
    done <<< "$NVME_DEVICES"
  else skip "NVMe: nessun dispositivo rilevato"; fi
else
  if printf '%s\n' "$DISKS" | grep -q '^nvme'; then fail "NVMe presente ma comando nvme non installato"; else skip "NVMe: nessun device NVMe rilevato"; fi
fi

# 2 — NVIDIA
section "2/5 NVIDIA — PRESENZA / DRIVER / SMI / VRAM / PERSISTENCE"
NVIDIA_PCI=""
if has_cmd lspci; then NVIDIA_PCI="$(lspci -nn 2>/dev/null | grep -i nvidia || true)";
elif compgen -G '/sys/bus/pci/devices/*/vendor' >/dev/null; then
  for vendor_file in /sys/bus/pci/devices/*/vendor; do
    [ "$(cat "$vendor_file" 2>/dev/null || true)" = "0x10de" ] && NVIDIA_PCI="device ${vendor_file%/vendor}" && break
  done
fi

if [ "$EXPECT_NVIDIA" = "0" ]; then
  [ -n "$NVIDIA_PCI" ] && ok "GPU NVIDIA presente ma non richiesta" || skip "GPU NVIDIA non richiesta (PREFLIGHT_EXPECT_NVIDIA=0)"
elif [ -n "$NVIDIA_PCI" ]; then
  ok "GPU NVIDIA enumerata sul bus PCI"; show_safe "$NVIDIA_PCI"
else
  fail "GPU NVIDIA NON enumerata sul bus PCI"
fi

if [ -n "$NVIDIA_PCI" ]; then
  if has_cmd nvidia-smi; then
    NVIDIA_INFO="$(nvidia-smi --query-gpu=name,driver_version,memory.total,memory.used,memory.free,temperature.gpu,persistence_mode --format=csv,noheader,nounits 2>&1 || true)"
    if printf '%s\n' "$NVIDIA_INFO" | grep -Eiq 'failed|couldn.t communicate|error'; then
      fail "nvidia-smi FALLITO: $(printf '%s\n' "$NVIDIA_INFO" | head -1)"
    elif [ -n "$NVIDIA_INFO" ]; then
      ok "nvidia-smi operativo"; show_safe "$NVIDIA_INFO"
      DRIVER="$(printf '%s\n' "$NVIDIA_INFO" | awk -F, 'NR==1 {gsub(/[[:space:]]/, "", $2); print $2}')"
      VRAM="$(printf '%s\n' "$NVIDIA_INFO" | awk -F, 'NR==1 {gsub(/[[:space:]]/, "", $3); print $3}')"
      PERSISTENCE="$(printf '%s\n' "$NVIDIA_INFO" | awk -F, 'NR==1 {gsub(/[[:space:]]/, "", $7); print $7}')"
      [ -n "$DRIVER" ] && ok "Driver NVIDIA: $DRIVER" || fail "Versione driver NVIDIA non leggibile"
      [ -n "$VRAM" ] && [ "$VRAM" != "0" ] && ok "VRAM totale: ${VRAM} MiB" || fail "VRAM NVIDIA non leggibile/zero"
      case "$PERSISTENCE" in Enabled|On|ON|1) ok "Persistence mode: ON" ;; Disabled|Off|OFF|0) warn "Persistence mode: OFF" ;; *) warn "Persistence mode: non determinabile" ;; esac
    else fail "nvidia-smi non ha restituito dati"; fi
  else
    fail "GPU NVIDIA presente ma nvidia-smi non installato"
  fi
elif [ "$EXPECT_NVIDIA" != "0" ]; then
  skip "Driver/VRAM/persistence non valutabili: nessuna GPU PCI"
fi

# 3 — RETE
section "3/5 RETE — INTERFACCE / IP / ROUTE / DNS / INTERNET / LATENZA"
if has_cmd ip; then
  INTERFACES="$(ip -o link show up 2>/dev/null | awk -F': ' '$2 !~ /^lo([:@]|$)/ {sub(/@.*/, "", $2); print $2}' | sort -u)"
  if [ -n "$INTERFACES" ]; then
    ok "Interfacce UP: $(printf '%s' "$INTERFACES" | tr '\n' ' ')"
    IPS="$(ip -o -4 addr show scope global 2>/dev/null | awk '{print $2, $4}' | sort -u)"
    [ -n "$IPS" ] && { ok "IP globali assegnati"; show_safe "$IPS"; } || fail "Nessun IP globale assegnato"
  else fail "Nessuna interfaccia non-loopback UP"; fi
  DEFAULT_ROUTE="$(ip route show default 2>/dev/null | head -1)"
  [ -n "$DEFAULT_ROUTE" ] && ok "Route/default gateway: $DEFAULT_ROUTE" || fail "Route di default assente"
else
  fail "iproute2/ip non disponibile"; DEFAULT_ROUTE=""
fi

DNS_SERVERS=""
if has_cmd resolvectl; then DNS_SERVERS="$(resolvectl dns 2>/dev/null | awk '/^[[:alnum:]_.-]+[[:space:]]/ {for (i=2;i<=NF;i++) print $i}' | sort -u | tr '\n' ' ')"; fi
[ -n "$DNS_SERVERS" ] || [ ! -r /etc/resolv.conf ] || DNS_SERVERS="$(awk '$1=="nameserver" {print $2}' /etc/resolv.conf | sort -u | tr '\n' ' ')"
[ -n "$DNS_SERVERS" ] && ok "DNS: $DNS_SERVERS" || fail "Nessun DNS configurato"

if [ "$LIVE_NETWORK" = "1" ]; then
  if has_cmd getent; then
    if DNS_RESULT="$(getent ahosts example.com 2>&1)"; then ok "DNS risolve example.com"; else fail "DNS resolution FALLITA"; show_safe "$DNS_RESULT"; fi
  else skip "DNS runtime: getent non disponibile"; fi

  if has_cmd curl; then
    if INTERNET_RESULT="$(curl -fsS -o /dev/null -w '%{http_code} %{time_total}s' --connect-timeout 4 --max-time 8 https://example.com 2>&1)"; then ok "Internet HTTPS: $INTERNET_RESULT"; else warn "Internet HTTPS non raggiungibile"; show_safe "$INTERNET_RESULT"; fi
  else skip "Internet HTTPS: curl non disponibile"; fi

  if has_cmd ping; then
    if PING_RESULT="$(ping -c 1 -W 2 1.1.1.1 2>&1)"; then LATENCY="$(printf '%s\n' "$PING_RESULT" | sed -n 's/.*time=\([^ ]*\).*/\1/p' | head -1)"; ok "Latenza Internet: ${LATENCY:-risposta ricevuta}"; else warn "Latenza ICMP non verificabile (ICMP potrebbe essere filtrato)"; fi
  else skip "Latenza: ping non disponibile"; fi
else
  skip "Probe live DNS/HTTPS/ICMP disabilitati (PREFLIGHT_LIVE_NETWORK=0; solo test offline)"
fi

# 4 — OS / SYSTEMD / LOG
section "4/5 SISTEMA OPERATIVO — DISTRO / KERNEL / UPTIME / PSI / SERVIZI / LOG"
if [ -r /etc/os-release ]; then
  OS_NAME="$(awk -F= '/^PRETTY_NAME=/ {gsub(/^"|"$/, "", $2); print $2; exit}' /etc/os-release)"
  [ -n "$OS_NAME" ] && ok "Distro: $OS_NAME" || fail "Distro non leggibile"
else fail "/etc/os-release assente"; fi
KERNEL="$(uname -r 2>/dev/null || true)"; [ -n "$KERNEL" ] && ok "Kernel: $KERNEL" || fail "Kernel non leggibile"
UPTIME="$(uptime -p 2>/dev/null || true)"; [ -n "$UPTIME" ] && ok "Uptime: $UPTIME" || warn "Uptime non leggibile"

if [ -r /proc/pressure/memory ]; then
  PSI="$(cat /proc/pressure/memory 2>/dev/null || true)"; PSI_AVG10="$(printf '%s\n' "$PSI" | awk '/^some/ {for(i=1;i<=NF;i++) if($i ~ /^avg10=/) {split($i,a,"="); print a[2]; exit}}')"
  if [ -n "$PSI_AVG10" ]; then
    if awk -v v="$PSI_AVG10" 'BEGIN {exit !(v >= 10)}'; then warn "Pressione memoria PSI alta: some.avg10=${PSI_AVG10}%"; else ok "Pressione memoria PSI: some.avg10=${PSI_AVG10}%"; fi
  else warn "PSI memoria presente ma avg10 non leggibile"; fi
  show_safe "$PSI"
else skip "PSI memoria non disponibile su questo kernel"; fi

if has_cmd systemctl; then
  FAILED_UNITS="$(systemctl --failed --type=service --no-legend --no-pager 2>/dev/null || true)"
  if [ -n "$FAILED_UNITS" ]; then fail "Servizi systemd FAILED presenti"; printf '%s\n' "$FAILED_UNITS" | awk '{print "       " $1}' | sed -n '1,24p'; else ok "Nessun servizio systemd FAILED"; fi
  for service in $EXPECTED_SERVICES; do
    if systemctl list-unit-files "${service}.service" --no-legend --no-pager 2>/dev/null | grep -q "^${service}\.service"; then
      STATE="$(systemctl is-active "${service}.service" 2>/dev/null || true)"; ENABLED="$(systemctl is-enabled "${service}.service" 2>/dev/null || true)"
      if [ "$STATE" = active ]; then
        case "$ENABLED" in enabled|static) ok "Servizio $service: active/$ENABLED" ;; *) warn "Servizio $service: active ma ${ENABLED:-enablement ignoto}" ;; esac
      else fail "Servizio $service: ${STATE:-stato ignoto}"; fi
    else
      fail "Servizio richiesto $service non installato"
    fi
  done
  if has_cmd journalctl; then
    RECENT_LOGS="$(journalctl -b --since '2 hours ago' -p warning..alert -n 20 --no-pager 2>/dev/null || true)"
    [ -n "$RECENT_LOGS" ] && { warn "Warning/errori nei log ultime 2 ore"; show_safe "$RECENT_LOGS"; } || ok "Nessun warning/errori nei log ultime 2 ore"
    KERNEL_LOGS="$(journalctl -k -b -p err..alert -n 20 --no-pager 2>/dev/null || true)"
    [ -n "$KERNEL_LOGS" ] && { warn "Errori kernel nel boot corrente"; show_safe "$KERNEL_LOGS"; } || ok "Nessun errore kernel nel boot corrente"
  else skip "journalctl non disponibile"; fi
else skip "systemd non disponibile: servizi e log non applicabili"; fi

# 5 — VALHALLA (check esistente, ora parte sempre dopo l'hardware)
section "5/5 VALHALLA — PBF / TILES / DOCKER"
if [ -f "$PBF" ]; then ok "PBF trovato: $PBF"; else fail "PBF non trovato: $PBF"; fi
if [ -f "$PBF" ]; then
  PBF_SIZE="$(stat -c%s "$PBF" 2>/dev/null || stat -f%z "$PBF" 2>/dev/null || echo 0)"; PBF_GB="$(awk -v b="$PBF_SIZE" 'BEGIN {printf "%.1f", b/1073741824}')"
  [ "$PBF_SIZE" -ge $((MIN_PBF_GB * 1073741824)) ] && ok "PBF: ${PBF_GB} GiB" || fail "PBF troppo piccolo: ${PBF_GB} GiB"
fi
if [ -d "$TILES" ]; then TILES_SIZE="$(du -sh "$TILES" 2>/dev/null | cut -f1)"; warn "Tiles già presenti (${TILES_SIZE:-dimensione ignota}); verificare eventuale build incompleta"; else ok "Tiles assenti: workspace pulito"; fi
if has_cmd docker && docker info >/dev/null 2>&1; then ok "Docker disponibile e attivo"; elif has_cmd docker; then fail "Docker installato ma non attivo"; else fail "Docker non installato"; fi

echo ""
echo "======================================================"
echo "  RISULTATO PRE-FLIGHT HULK"
echo "  CHECK=$CHECKS  WARN=$WARNINGS  SKIP=$SKIPS  FAIL=$FAILURES"
if [ "$FAILURES" -eq 0 ]; then
  echo "  STATO=READY_WITH_WARNINGS"
  echo "  Nessun blocco. WARN e SKIP restano visibili e vanno letti."
  echo "======================================================"
  exit 0
else
  echo "  STATO=BLOCKED"
  echo "  Risolvere ogni FAIL prima di avviare 05.sh."
  echo "======================================================"
  exit 1
fi
