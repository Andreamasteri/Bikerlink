#!/usr/bin/env bash
# diag-build.sh — analizza il log di build Valhalla dopo un crash
# Uso: ./diag-build.sh [/path/al/log]   (default: /tmp/valhalla-build.log)

LOG="${1:-/tmp/valhalla-build.log}"

ok()   { echo "[OK]   $1"; }
warn() { echo "[WARN] $1"; }
fail() { echo "[FAIL] $1"; }
info() { echo "[INFO] $1"; }

echo "=== DIAGNOSTICA BUILD VALHALLA — $(date '+%Y-%m-%d %H:%M:%S') ==="
echo ""

# ── 1. Log presente ──────────────────────────────────────────────────────────
echo "--- File di log ---"
if [ ! -f "$LOG" ]; then
  fail "Log non trovato: $LOG"
  echo ""
  echo "Specifica un percorso alternativo: ./diag-build.sh /path/al/log"
  exit 1
fi

LOG_SIZE=$(du -sh "$LOG" 2>/dev/null | cut -f1)
LOG_LINES=$(wc -l < "$LOG")
ok "Log trovato: $LOG  (${LOG_SIZE}, ${LOG_LINES} righe)"
echo ""

# ── 2. Causa del crash ───────────────────────────────────────────────────────
echo "--- Causa crash rilevata ---"
CRASH_FOUND=0

if grep -qi "double free or corruption" "$LOG"; then
  fail "double free or corruption — heap corrotto (tipico di uso eccessivo di RAM/swap)"
  CRASH_FOUND=1
fi

if grep -qi "Aborted" "$LOG"; then
  fail "Aborted — il processo è stato terminato da SIGABRT"
  CRASH_FOUND=1
fi

# OOM-kill: il kernel logga "Killed" o "Out of memory" nel syslog; nel log
# Valhalla appare tipicamente come riga troncata o "Killed"
if grep -qiE "^Killed$|OOM|Out of memory|memory allocation failed" "$LOG"; then
  fail "OOM-kill / memoria esaurita — esegui ./swap.sh e aumenta lo swap prima di ritentare"
  CRASH_FOUND=1
fi

# Segnali generici (SIGSEGV, SIGBUS, SIGFPE, ecc.)
if grep -qiE "signal [0-9]+|Segmentation fault|Bus error|Floating point" "$LOG"; then
  fail "Segnale fatale rilevato (SIGSEGV/SIGBUS/SIGFPE) — possibile corruzione memoria o bug"
  CRASH_FOUND=1
fi

if grep -qiE "error.*docker|cannot connect|no such container" "$LOG"; then
  warn "Errori Docker nel log — il container potrebbe essersi fermato inaspettatamente"
fi

if [ "$CRASH_FOUND" -eq 0 ]; then
  # Controlla se la build è terminata normalmente
  if grep -qiE "valhalla_tiles.*created|build.*complete|serving|Done" "$LOG"; then
    ok "Nessun crash rilevato — la build sembra terminata normalmente"
  else
    warn "Nessun pattern di crash esplicito trovato — la build potrebbe essere incompleta o ancora in corso"
  fi
fi
echo ""

# ── 3. Conteggio errori per categoria ───────────────────────────────────────
echo "--- Conteggio errori per categoria ---"

COUNT_INVALID=$(grep -c "Invalid level" "$LOG" 2>/dev/null || true)
COUNT_RESTRICT=$(grep -c "Restrictions mask" "$LOG" 2>/dev/null || true)
COUNT_ERROR=$(grep -cE "\[ERROR\]" "$LOG" 2>/dev/null || true)
COUNT_WARN=$(grep -cE "\[WARN\]|WARNING" "$LOG" 2>/dev/null || true)

# Assicura che i valori siano numerici (grep -c restituisce già 0 su no-match;
# || true garantisce che set -e non interrompa lo script)
COUNT_INVALID=${COUNT_INVALID:-0}
COUNT_RESTRICT=${COUNT_RESTRICT:-0}
COUNT_ERROR=${COUNT_ERROR:-0}
COUNT_WARN=${COUNT_WARN:-0}

info "Invalid level          : $COUNT_INVALID"
info "Restrictions mask      : $COUNT_RESTRICT"
info "[ERROR] generici       : $COUNT_ERROR"
info "[WARN] / WARNING       : $COUNT_WARN"

if [ "$COUNT_ERROR" -gt 0 ]; then
  echo ""
  warn "Ultime righe [ERROR] nel log:"
  grep -iE "\[ERROR\]" "$LOG" | tail -5 | sed 's/^/         /'
fi
echo ""

# ── 4. Durata stimata della build ────────────────────────────────────────────
echo "--- Durata build stimata ---"

# Cerca il primo e l'ultimo timestamp nel formato ISO (YYYY-MM-DDTHH:MM:SS)
# o nel formato comune dei log Valhalla ([YYYY/MM/DD HH:MM:SS])
FIRST_TS=$(grep -oE '[0-9]{4}[-/][0-9]{2}[-/][0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}' "$LOG" 2>/dev/null | head -1)
LAST_TS=$(grep -oE '[0-9]{4}[-/][0-9]{2}[-/][0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}' "$LOG" 2>/dev/null | tail -1)

if [ -n "$FIRST_TS" ] && [ -n "$LAST_TS" ]; then
  # Normalizza i separatori per date
  FIRST_NORM=$(echo "$FIRST_TS" | tr '/' '-' | tr 'T' ' ')
  LAST_NORM=$(echo "$LAST_TS"  | tr '/' '-' | tr 'T' ' ')

  TS_START=$(date -d "$FIRST_NORM" +%s 2>/dev/null || date -j -f "%Y-%m-%d %H:%M:%S" "$FIRST_NORM" +%s 2>/dev/null || echo "")
  TS_END=$(date   -d "$LAST_NORM"  +%s 2>/dev/null || date -j -f "%Y-%m-%d %H:%M:%S" "$LAST_NORM"  +%s 2>/dev/null || echo "")

  if [ -n "$TS_START" ] && [ -n "$TS_END" ]; then
    DURATION=$(( TS_END - TS_START ))
    HOURS=$(( DURATION / 3600 ))
    MINS=$(( (DURATION % 3600) / 60 ))
    info "Inizio  : $FIRST_NORM"
    info "Fine    : $LAST_NORM"
    info "Durata  : ${HOURS}h ${MINS}m"
  else
    info "Inizio  : $FIRST_TS"
    info "Fine    : $LAST_TS"
    warn "Calcolo durata non disponibile (date non parsabile su questo sistema)"
  fi
else
  warn "Nessun timestamp trovato nel log — impossibile stimare la durata"
fi
echo ""

# ── 5. Prime righe del log ───────────────────────────────────────────────────
echo "--- Prime 10 righe del log ---"
head -10 "$LOG"
echo ""

# ── 6. Ultime righe del log ──────────────────────────────────────────────────
echo "--- Ultime 40 righe del log ---"
tail -40 "$LOG"
echo ""

# ── 7. Stato container Docker ────────────────────────────────────────────────
echo "--- Stato container Docker (build/serve Valhalla) ---"
if docker info &>/dev/null 2>&1; then
  RESULT=$(docker ps -a --filter "name=valhalla" \
    --format "table {{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}" 2>/dev/null)
  if [ -n "$RESULT" ] && [ "$(echo "$RESULT" | wc -l)" -gt 1 ]; then
    echo "$RESULT"
  else
    warn "Nessun container con 'valhalla' nel nome trovato in docker ps -a"
    info "Container attivi (tutti):"
    docker ps -a --format "table {{.Names}}\t{{.Status}}" 2>/dev/null | head -10
  fi
else
  warn "Docker non raggiungibile — impossibile interrogare lo stato dei container"
fi

echo ""
echo "=== Fine diagnostica build ==="
