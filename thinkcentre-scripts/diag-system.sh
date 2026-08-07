#!/usr/bin/env bash
# diag-system.sh — fotografia dello stato del sistema dopo un crash Valhalla
# Uso: ./diag-system.sh   (nessun argomento richiesto)

ok()   { echo "[OK]   $1"; }
warn() { echo "[WARN] $1"; }
fail() { echo "[FAIL] $1"; }
info() { echo "[INFO] $1"; }

echo "=== DIAGNOSTICA SISTEMA — $(date '+%Y-%m-%d %H:%M:%S') ==="
echo ""

# ── 1. RAM ───────────────────────────────────────────────────────────────────
echo "--- Memoria RAM ---"
free -h
echo ""

RAM_TOTAL_GB=$(awk '/MemTotal/{printf "%d", $2/1048576}' /proc/meminfo)
RAM_AVAIL_GB=$(awk '/MemAvailable/{printf "%d", $2/1048576}' /proc/meminfo)
RAM_USED_GB=$(( RAM_TOTAL_GB - RAM_AVAIL_GB ))

if [ "$RAM_AVAIL_GB" -lt 1 ]; then
  fail "RAM disponibile critica: ${RAM_AVAIL_GB} GB — probabile causa del crash OOM"
elif [ "$RAM_AVAIL_GB" -lt 2 ]; then
  warn "RAM disponibile bassa: ${RAM_AVAIL_GB} GB / ${RAM_TOTAL_GB} GB totali"
else
  ok "RAM: ${RAM_USED_GB} GB usata, ${RAM_AVAIL_GB} GB disponibile, ${RAM_TOTAL_GB} GB totale"
fi
echo ""

# ── 2. Swap ──────────────────────────────────────────────────────────────────
echo "--- Swap ---"
if command -v swapon &>/dev/null; then
  SWAP_OUTPUT=$(swapon --show 2>/dev/null)
  if [ -n "$SWAP_OUTPUT" ]; then
    echo "$SWAP_OUTPUT"
    echo ""
    SWAP_TOTAL_GB=$(awk '/SwapTotal/{printf "%d", $2/1048576}' /proc/meminfo)
    SWAP_FREE_GB=$(awk '/SwapFree/{printf "%d",  $2/1048576}' /proc/meminfo)
    SWAP_USED_GB=$(( SWAP_TOTAL_GB - SWAP_FREE_GB ))
    if [ "$SWAP_TOTAL_GB" -eq 0 ]; then
      fail "Nessuno swap attivo — su 16 GB RAM la build Europa viene uccisa dall'OOM-killer; esegui ./swap.sh"
    elif [ "$SWAP_TOTAL_GB" -lt 32 ]; then
      warn "Swap attivo ma piccolo: ${SWAP_TOTAL_GB} GB totale (usato: ${SWAP_USED_GB} GB); consigliati >= 32 GB"
    else
      ok "Swap: ${SWAP_USED_GB} GB usato / ${SWAP_TOTAL_GB} GB totale"
    fi
  else
    fail "Nessuno swap attivo — esegui ./swap.sh prima della prossima build"
  fi
else
  warn "Comando 'swapon' non disponibile — impossibile verificare lo swap"
  grep -E "^SwapTotal|^SwapFree" /proc/meminfo | sed 's/^/         /'
fi
echo ""

# ── 3. Spazio disco ──────────────────────────────────────────────────────────
echo "--- Spazio disco: \$HOME (${HOME}) ---"
df -h "$HOME"
echo ""

DISK_FREE_GB=$(df "$HOME" | tail -1 | awk '{print $4}')
DISK_FREE_GB=$(( DISK_FREE_GB / 1048576 ))
if [ "$DISK_FREE_GB" -lt 10 ]; then
  fail "Spazio disco \$HOME critico: ${DISK_FREE_GB} GB liberi — possibile causa del crash"
elif [ "$DISK_FREE_GB" -lt 30 ]; then
  warn "Spazio disco \$HOME basso: ${DISK_FREE_GB} GB liberi (consigliati >= 80 GB per la build Europa)"
else
  ok "Spazio disco \$HOME: ${DISK_FREE_GB} GB liberi"
fi
echo ""

echo "--- Spazio disco: /tmp ---"
df -h /tmp
echo ""

TMP_FREE_GB=$(df /tmp | tail -1 | awk '{print $4}')
TMP_FREE_GB=$(( TMP_FREE_GB / 1048576 ))
if [ "$TMP_FREE_GB" -lt 1 ]; then
  warn "/tmp quasi pieno: ${TMP_FREE_GB} GB liberi — potrebbe aver causato problemi di log/temp"
else
  ok "/tmp: ${TMP_FREE_GB} GB liberi"
fi
echo ""

# ── 4. Carico CPU ────────────────────────────────────────────────────────────
echo "--- Carico CPU ---"
uptime
echo ""

LOAD1=$(awk '{print $1}' /proc/loadavg)
NCPU=$(nproc 2>/dev/null || echo 1)
# Confronto intero (load * 100 vs ncpu * 100) per evitare dipendenza da bc/awk float
LOAD_INT=$(echo "$LOAD1" | awk '{printf "%d", $1 * 100}')
NCPU_INT=$(( NCPU * 100 ))

if [ "$LOAD_INT" -gt $(( NCPU_INT * 2 )) ]; then
  warn "Carico CPU molto elevato: load=${LOAD1} su ${NCPU} core — sistema ancora sotto pressione"
elif [ "$LOAD_INT" -gt "$NCPU_INT" ]; then
  warn "Carico CPU elevato: load=${LOAD1} su ${NCPU} core"
else
  ok "Carico CPU: load=${LOAD1} su ${NCPU} core"
fi
echo ""

# ── 5. Container Docker (Valhalla) ─────────────────────────────────────────
echo "--- Container Docker (Valhalla) ---"
if docker info &>/dev/null 2>&1; then
  VALHALLA_OUT=$(docker ps -a --filter "name=valhalla" \
    --format "table {{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}" 2>/dev/null)
  NOMINATIM_OUT=$(docker ps -a --filter "name=nominatim" \
    --format "table {{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}" 2>/dev/null)

  if [ -n "$VALHALLA_OUT" ] && [ "$(echo "$VALHALLA_OUT" | wc -l)" -gt 1 ]; then
    echo "Valhalla:"
    echo "$VALHALLA_OUT"

    VALHALLA_STATUS=$(docker ps -a --filter "name=valhalla" --format "{{.Status}}" 2>/dev/null | head -1)
    if echo "$VALHALLA_STATUS" | grep -qi "^Up"; then
      ok "Container Valhalla attivo: $VALHALLA_STATUS"
    elif echo "$VALHALLA_STATUS" | grep -qi "Exited"; then
      EXIT_CODE=$(echo "$VALHALLA_STATUS" | grep -oE '\([0-9]+\)' | tr -d '()')
      if [ "$EXIT_CODE" = "0" ]; then
        info "Container Valhalla terminato normalmente (exit 0)"
      else
        fail "Container Valhalla terminato con errore (exit ${EXIT_CODE}) — vedi diag-build.sh per dettagli"
      fi
    else
      warn "Stato container Valhalla: $VALHALLA_STATUS"
    fi
  else
    warn "Nessun container 'valhalla' trovato in docker ps -a"
  fi
  echo ""

else
  warn "Docker non raggiungibile — impossibile interrogare i container"
fi
echo ""

# ── 6. Temperatura CPU ───────────────────────────────────────────────────────
echo "--- Temperatura CPU ---"
if command -v sensors &>/dev/null; then
  TEMP_OUT=$(sensors 2>/dev/null)
  if [ -n "$TEMP_OUT" ]; then
    echo "$TEMP_OUT"

    MAX_TEMP=$(echo "$TEMP_OUT" | grep -oE '\+[0-9]+\.[0-9]+°C' | grep -oE '[0-9]+' | sort -n | tail -1)
    if [ -n "$MAX_TEMP" ]; then
      if [ "$MAX_TEMP" -gt 90 ]; then
        fail "Temperatura massima rilevata: ${MAX_TEMP}°C — possibile thermal throttling durante la build"
      elif [ "$MAX_TEMP" -gt 80 ]; then
        warn "Temperatura elevata: ${MAX_TEMP}°C — verifica il raffreddamento"
      else
        ok "Temperatura CPU: ${MAX_TEMP}°C (nella norma)"
      fi
    fi
  else
    warn "'sensors' disponibile ma nessun output — driver lm-sensors potrebbe non essere configurato (sudo sensors-detect)"
  fi
else
  warn "'sensors' non disponibile — installa lm-sensors per monitorare la temperatura CPU (sudo apt install lm-sensors)"
fi
echo ""

echo "=== Fine diagnostica sistema ==="
echo ""
echo "Passo successivo: ./diag-build.sh   per analizzare il log di build"
