#!/bin/bash
# metro-crash-diag.sh — Libreria diagnostica crash Metro (sola lettura/osservazione).
#
# Caricato con `source` da start-expo.sh e cerbero.sh.
# NON modifica il comportamento di recovery, non previene crash, non sopprime log.
#
# Funzioni esportate:
#   metro_diag_new_session    — avvio Metro: genera session_id per la sessione corrente
#   metro_diag_record_crash   — fine Metro: registra exit/segnale/uptime/last_lines
#   metro_diag_snapshot       — Cerbero pre-kill: cattura snapshot sistema
#
# ── Correlazione corretta degli eventi ────────────────────────────────────────
# Il ciclo temporale reale è:
#   1. start-expo.sh: metro_diag_new_session() → genera session_id, lo scrive in
#      METRO_SESSION_ID_FILE (/tmp/metro-session-id).
#   2. npx expo start gira…
#   3. npx expo start esce (crash/SIGTERM) → metro_diag_record_crash() legge
#      session_id dal file e lo include nel record crash.
#   4. Cerbero rileva 8081 giù (ciclo successivo, ~10s dopo) → metro_diag_snapshot()
#      legge lo STESSO session_id dal file → snapshot e crash hanno lo stesso id.
#
# Questo garantisce che crash record e snapshot appartengano alla stessa sessione
# Metro, indipendentemente dal timing tra la morte di Expo e il check di Cerbero.
#
# File di output:
#   /tmp/metro-crash-diag.jsonl  — rolling JSONL, max METRO_DIAG_MAX_LINES record.
#   /tmp/metro-session-id        — session_id della sessione Metro corrente.
#   /tmp/metro-session.log       — output rolling di Expo (tee in start-expo.sh).
#
# Locking: tutte le scritture JSONL usano flock in subshell isolata (fd 202),
# mai in conflitto con fd 9 (start-expo lock), fd 200 (cerbero restart_metro),
# fd 201 (metro-cache-nightly), né fd 9 cerbero (single-instance).

METRO_DIAG_LOG="${METRO_DIAG_LOG:-/tmp/metro-crash-diag.jsonl}"
METRO_DIAG_MAX_LINES="${METRO_DIAG_MAX_LINES:-100}"
METRO_DIAG_LOCK="${METRO_DIAG_LOCK:-/tmp/metro-crash-diag.lock}"
METRO_SESSION_ID_FILE="${METRO_SESSION_ID_FILE:-/tmp/metro-session-id}"
METRO_SESSION_LOG="${METRO_SESSION_LOG:-/tmp/metro-session.log}"
METRO_SESSION_LOG_MAX_LINES="${METRO_SESSION_LOG_MAX_LINES:-500}"

# ── Helper: escape stringa per JSON ──────────────────────────────────────────
_metro_diag_json_escape() {
  printf '%s' "$1" \
    | tr '\n' '|' \
    | sed 's/\\/\\\\/g; s/"/\\"/g; s/   / /g'
}

# ── Helper: scrivi JSONL con flock (subshell isolata, fd 202) ─────────────────
_metro_diag_write() {
  local record="$1"
  (
    exec 202>"$METRO_DIAG_LOCK"
    flock -x 202
    if [ -f "$METRO_DIAG_LOG" ]; then
      local lines
      lines=$(wc -l < "$METRO_DIAG_LOG" 2>/dev/null || echo 0)
      if [ "$lines" -ge "$METRO_DIAG_MAX_LINES" ]; then
        local keep
        keep=$(( METRO_DIAG_MAX_LINES / 2 ))
        tail -n "$keep" "$METRO_DIAG_LOG" > "${METRO_DIAG_LOG}.tmp" 2>/dev/null && \
          mv "${METRO_DIAG_LOG}.tmp" "$METRO_DIAG_LOG" 2>/dev/null || true
      fi
    fi
    printf '%s\n' "$record" >> "$METRO_DIAG_LOG"
  ) 2>/dev/null || true
}

# ── metro_diag_new_session ────────────────────────────────────────────────────
# Chiamato da start-expo.sh PRIMA di `npx expo start`.
# Genera un session_id univoco e lo persiste in METRO_SESSION_ID_FILE.
# Il session_id identifica questa sessione Metro: sia il crash record (al termine)
# sia lo snapshot Cerbero (al rilevamento) leggono lo stesso id.
metro_diag_new_session() {
  local ts_ns
  ts_ns=$(date +%s%N 2>/dev/null || date +%s)
  local session_id="${ts_ns}_$$"
  printf '%s' "$session_id" > "$METRO_SESSION_ID_FILE" 2>/dev/null || true
  echo "$session_id"
}

# ── metro_diag_record_crash ───────────────────────────────────────────────────
# Chiamato da start-expo.sh DOPO che `npx expo start` termina con exit ≠ 0 e ≠ 2.
#
# Legge il session_id corrente da METRO_SESSION_ID_FILE (scritto da
# metro_diag_new_session all'avvio della stessa istanza). Se il file non esiste
# (avvio precedente a questa versione) session_id è vuoto — il record è comunque
# utile per exit/signal/uptime ma non correlato a uno snapshot.
#
# Args:
#   $1  exit_code     — exit code di `npx expo start`
#   $2  uptime_secs   — secondi dall'avvio di start-expo.sh
#   $3  last_lines    — ultime ~20 righe di output (stringa, opzionale)
#
# Verdetti:
#   SIGTERM (15)  → "platform_recycle"  (riciclo Replit previsto)
#   SIGKILL (9)   → "sigkill_oom"       (kill forzato, possibile OOM)
#   SIGINT (2)    → "platform_recycle"
#   exit 0        → "clean_exit"
#   altro         → "internal_crash"    (crash JS interno)
metro_diag_record_crash() {
  local exit_code="${1:-0}"
  local uptime_secs="${2:-0}"
  local last_lines="${3:-}"
  local ts
  ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

  local session_id=""
  session_id=$(cat "$METRO_SESSION_ID_FILE" 2>/dev/null || true)

  local signal_num=0
  local signal_name="none"
  local verdict="internal_crash"
  if [ "$exit_code" -gt 128 ] 2>/dev/null; then
    signal_num=$(( exit_code - 128 ))
    case "$signal_num" in
      1)  signal_name="SIGHUP";  verdict="internal_crash" ;;
      2)  signal_name="SIGINT";  verdict="platform_recycle" ;;
      9)  signal_name="SIGKILL"; verdict="sigkill_oom" ;;
      15) signal_name="SIGTERM"; verdict="platform_recycle" ;;
      *)  signal_name="SIG${signal_num}"; verdict="internal_crash" ;;
    esac
  elif [ "$exit_code" -eq 0 ]; then
    verdict="clean_exit"
  fi

  local last_escaped
  last_escaped=$(_metro_diag_json_escape "$last_lines")

  local record
  record=$(printf '{"ts":"%s","type":"crash","session_id":"%s","exit_code":%d,"signal_num":%d,"signal_name":"%s","verdict":"%s","uptime_secs":%d,"last_lines":"%s"}' \
    "$ts" "$session_id" "$exit_code" "$signal_num" "$signal_name" "$verdict" "$uptime_secs" "$last_escaped")
  _metro_diag_write "$record"
}

# ── metro_diag_snapshot ───────────────────────────────────────────────────────
# Chiamato da cerbero.sh nel ramo "Metro giù" PRIMA di qualsiasi kill/restart.
# Legge il session_id della sessione Metro appena terminata da METRO_SESSION_ID_FILE
# (scritto da metro_diag_new_session all'ultimo avvio di start-expo.sh) — stesso id
# usato dal corrispondente crash record → correlazione affidabile.
#
# Cattura: PID su METRO_PORT, stato /proc, memoria, load, OOM kernel (dmesg).
# Non accetta argomenti. Usa $METRO_PORT dall'ambiente (default: 8081).
metro_diag_snapshot() {
  local ts
  ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  local metro_port="${METRO_PORT:-8081}"

  # Leggi session_id dalla sessione Metro appena morta — NON generarne uno nuovo.
  local session_id=""
  session_id=$(cat "$METRO_SESSION_ID_FILE" 2>/dev/null || true)

  # PID in ascolto sulla porta (può essere vuoto se già uscito)
  local metro_pid=""
  metro_pid=$(lsof -ti:"$metro_port" 2>/dev/null | head -1 || true)

  # Stato PID da /proc
  local pid_state="gone"
  if [ -n "$metro_pid" ]; then
    if [ -f "/proc/$metro_pid/status" ]; then
      pid_state=$(grep '^State:' "/proc/$metro_pid/status" 2>/dev/null \
        | awk '{print $2}' || echo "unknown")
    else
      pid_state="no_proc"
    fi
  fi

  # Memoria in MB
  local mem_total_mb=0 mem_used_mb=0 mem_free_mb=0
  if command -v free >/dev/null 2>&1; then
    local free_line
    free_line=$(free -m 2>/dev/null | grep '^Mem:' || true)
    if [ -n "$free_line" ]; then
      mem_total_mb=$(echo "$free_line" | awk '{print $2}')
      mem_used_mb=$(echo "$free_line" | awk '{print $3}')
      mem_free_mb=$(echo "$free_line" | awk '{print $4}')
    fi
  fi

  # Load average a 1 minuto
  local load_1min="0.0"
  [ -f /proc/loadavg ] && load_1min=$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo "0.0")

  # Evidenze OOM dal kernel — SOLO negli ultimi 120 secondi (time-bounded).
  # dmesg usa timestamp relativi al boot ([NNNNN.NNNNNN]); /proc/uptime dà
  # l'uptime corrente. Ignoriamo righe con timestamp < (uptime - 120) così
  # un OOM storico non contagia le sessioni successive.
  local oom_found=0
  local oom_evidence="none"
  if command -v dmesg >/dev/null 2>&1; then
    local oom_raw uptime_secs window_start
    uptime_secs=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo "999999")
    window_start=$(( uptime_secs - 120 ))
    [ "$window_start" -lt 0 ] && window_start=0
    oom_raw=$(dmesg 2>/dev/null | awk -v ws="$window_start" '
      {
        ts_field = $1
        gsub(/[\[\]]/, "", ts_field)
        ts_secs = int(ts_field + 0)
        line_lc = tolower($0)
        if (ts_secs >= ws && (line_lc ~ /out of memory/ || line_lc ~ /killed process/ || line_lc ~ /oom.killer/))
          print
      }
    ' 2>/dev/null | tail -3 || true)
    if [ -n "$oom_raw" ]; then
      oom_found=1
      oom_evidence=$(_metro_diag_json_escape "$oom_raw")
    fi
  fi

  local record
  record=$(printf '{"ts":"%s","type":"snapshot","session_id":"%s","metro_pid":"%s","pid_state":"%s","mem_total_mb":%d,"mem_used_mb":%d,"mem_free_mb":%d,"load_1min":"%s","oom_found":%d,"oom_evidence":"%s"}' \
    "$ts" "$session_id" "$metro_pid" "$pid_state" \
    "$mem_total_mb" "$mem_used_mb" "$mem_free_mb" \
    "$load_1min" "$oom_found" "$oom_evidence")
  _metro_diag_write "$record"
}
