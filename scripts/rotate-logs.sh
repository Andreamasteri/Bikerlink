#!/bin/bash
# rotate-logs.sh — Rotazione automatica log di sistema in logs/
# Tronca i file .log che superano MAX_SIZE_BYTES conservando gli ultimi KEEP_BYTES.
# Non tocca: cleanup-cache.log (ha propria rotazione), rotate-logs.log (sé stesso),
#            backend-uptime-state.json (JSON di stato, non un log).
# Scrive un registro delle azioni in logs/rotate-logs.log (ultimi 30 record).
#
# Configurazione tramite variabili d'ambiente (opzionali):
#   LOG_ROTATE_MAX_BYTES  — soglia in byte (default: 1048576 = 1MB)
#   LOG_ROTATE_KEEP_BYTES — byte da conservare con tail -c (default: 204800 = 200KB)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOGS_DIR="$PROJECT_ROOT/logs"
SELF_LOG="$LOGS_DIR/rotate-logs.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Soglia: tronca se il file supera MAX_SIZE_BYTES (default 1MB)
MAX_SIZE_BYTES="${LOG_ROTATE_MAX_BYTES:-1048576}"

# Conserva gli ultimi KEEP_BYTES di ogni file troncato (default 200KB)
KEEP_BYTES="${LOG_ROTATE_KEEP_BYTES:-204800}"

# Numero massimo di record da mantenere nel log di questa utility
LOG_KEEP=30

SEPARATOR="---RUN---"

# ── Assicura che la dir dei log esista ───────────────────────────────────────
mkdir -p "$LOGS_DIR"

# ── Guardia anti-build ───────────────────────────────────────────────────────
if pgrep -f "[b]uild-apk\.sh|[e]as build|[g]radlew|[c]om\.android\.build" > /dev/null 2>&1; then
  {
    echo "$SEPARATOR"
    echo "[$TIMESTAMP] SKIP — build APK in corso. Log NON ruotati."
  } >> "$SELF_LOG"
  echo "[LOG-ROTATE] SKIP — build in corso, log non toccati."
  exit 0
fi

# ── File da escludere dalla rotazione ────────────────────────────────────────
is_excluded() {
  local f
  f="$(basename "$1")"
  case "$f" in
    cleanup-cache.log)      return 0 ;;  # ha propria rotazione
    rotate-logs.log)        return 0 ;;  # questo stesso log
    backend-uptime-state.*) return 0 ;;  # JSON di stato, non un log
    apk-build-history.log)  return 0 ;;  # storico build APK — accumulato intenzionalmente
    ota-timing.log)         return 0 ;;  # storico timing OTA — accumulato intenzionalmente
    *)                      return 1 ;;
  esac
}

# ── Rotazione di un singolo file; return 0 se troncato, 1 se errore/skip ─────
rotate_file() {
  local file="$1"
  local size
  size=$(stat -c%s "$file" 2>/dev/null || echo "0")

  if [ "$size" -le "$MAX_SIZE_BYTES" ]; then
    return 1
  fi

  local size_kb=$(( size / 1024 ))
  local tmp="${file}.rot.tmp"

  if tail -c "$KEEP_BYTES" "$file" > "$tmp" 2>/dev/null && mv "$tmp" "$file"; then
    local new_size
    new_size=$(stat -c%s "$file" 2>/dev/null || echo "0")
    local new_kb=$(( new_size / 1024 ))
    echo "  ROTATO  $(basename "$file"): ${size_kb}KB → ${new_kb}KB" >> "$SELF_LOG"
    echo "[LOG-ROTATE] $(basename "$file") ${size_kb}KB → ${new_kb}KB"
    return 0
  else
    rm -f "$tmp"
    echo "  ERRORE  $(basename "$file"): tail/mv fallito" >> "$SELF_LOG"
    return 1
  fi
}

# ── Intestazione record ───────────────────────────────────────────────────────
{
  echo "$SEPARATOR"
  printf "[$TIMESTAMP] Avvio rotazione log (soglia %dKB, keep %dKB)\n" \
    "$(( MAX_SIZE_BYTES / 1024 ))" "$(( KEEP_BYTES / 1024 ))"
} >> "$SELF_LOG"

# ── Scansione tutti i .log in logs/ ──────────────────────────────────────────
ROTATED=0
CHECKED=0

for logfile in "$LOGS_DIR"/*.log; do
  [ -f "$logfile" ] || continue
  is_excluded "$logfile" && continue
  CHECKED=$(( CHECKED + 1 ))
  if rotate_file "$logfile"; then
    ROTATED=$(( ROTATED + 1 ))
  fi
done

if [ "$ROTATED" -eq 0 ]; then
  echo "  Nessun file oltre soglia (${CHECKED} controllati, soglia $(( MAX_SIZE_BYTES / 1024 ))KB)" >> "$SELF_LOG"
  echo "[LOG-ROTATE] Nessun log oltre soglia (${CHECKED} controllati)"
else
  echo "  Totale ruotati: ${ROTATED}/${CHECKED}" >> "$SELF_LOG"
fi

# ── Rotazione del log di questa utility (mantieni ultimi LOG_KEEP record) ────
if [ -f "$SELF_LOG" ]; then
  RUN_COUNT=$(grep -c "^$SEPARATOR" "$SELF_LOG" 2>/dev/null || echo "0")
  if [ "$RUN_COUNT" -gt "$LOG_KEEP" ]; then
    EXCESS=$(( RUN_COUNT - LOG_KEEP ))
    KEEP_LINE=$(grep -n "^$SEPARATOR" "$SELF_LOG" | awk -F: "NR==$((EXCESS + 1)){print \$1}")
    if [ -n "$KEEP_LINE" ] && [ "$KEEP_LINE" -gt 1 ]; then
      tail -n "+$KEEP_LINE" "$SELF_LOG" > "$SELF_LOG.tmp" && mv "$SELF_LOG.tmp" "$SELF_LOG"
    fi
  fi
fi
