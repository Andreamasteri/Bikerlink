#!/bin/bash
# error-monitor.sh — Monitora solo il backend (porta 5000).
# Metro/frontend non più in uso (EAS build + OTA).

BACKEND_PORT=5000
PROD_HOST="https://biker-link.replit.app"
LOG_FILE="logs/error-monitor.log"
CHECK_INTERVAL=30
LOG_MAX_LINES=2000

mkdir -p logs

# ── Unica istanza ────────────────────────────────────────────────────────────
exec 9>>"/tmp/error-monitor.flock"
if ! flock -n 9; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Altra istanza gia' in esecuzione. Uscita."
  exit 0
fi

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"
}

rotate_log() {
  if [ -f "$LOG_FILE" ]; then
    local lines
    lines=$(wc -l < "$LOG_FILE" 2>/dev/null || echo 0)
    if [ "$lines" -gt "$LOG_MAX_LINES" ]; then
      tail -n $((LOG_MAX_LINES / 2)) "$LOG_FILE" > "${LOG_FILE}.tmp" 2>/dev/null
      mv "${LOG_FILE}.tmp" "$LOG_FILE" 2>/dev/null
      log "LOG_ROTATE: troncato a $((LOG_MAX_LINES / 2)) righe"
    fi
  fi
}

# ── Check 1: Backend /api/health ─────────────────────────────────────────────
check_backend() {
  local http_code start_time end_time elapsed

  start_time=$(date +%s%3N)
  http_code=$(curl -s --max-time 5 --connect-timeout 3 \
    -o /tmp/em_backend_health.txt -w "%{http_code}" \
    "http://localhost:$BACKEND_PORT/api/health" 2>/dev/null)
  end_time=$(date +%s%3N)
  elapsed=$((end_time - start_time))

  local body
  body=$(cat /tmp/em_backend_health.txt 2>/dev/null)

  if [ "$http_code" = "200" ]; then
    local initializing
    initializing=$(echo "$body" | grep -o '"initializing":[a-z]*' | cut -d: -f2)
    if [ "$initializing" = "true" ]; then
      log "BACKEND_INIT: /api/health 200 — ancora in inizializzazione (${elapsed}ms)"
    else
      log "BACKEND_OK: /api/health 200 — ${elapsed}ms"
    fi
  elif [ "$http_code" = "000" ] || [ -z "$http_code" ]; then
    log "BACKEND_DOWN: /api/health non risponde (timeout/crash)"
  else
    local trimmed
    trimmed=$(echo "$body" | head -c 150)
    log "BACKEND_ERROR: /api/health HTTP $http_code — ${elapsed}ms — $trimmed"
  fi
}

# ── Check 2: Crash backend recenti ───────────────────────────────────────────
check_recent_crashes() {
  [ -f "logs/backend-crashes.log" ] || return 0

  local recent_crashes
  recent_crashes=$(find logs/backend-crashes.log -newer /tmp/em_last_crash_check 2>/dev/null \
    | xargs tail -3 2>/dev/null)

  if [ -n "$recent_crashes" ]; then
    while IFS= read -r line; do
      [ -n "$line" ] && log "BACKEND_CRASH: $(echo "$line" | head -c 200)"
    done <<< "$recent_crashes"
  fi

  touch /tmp/em_last_crash_check 2>/dev/null
}

# ── Ciclo principale ─────────────────────────────────────────────────────────
run_all_checks() {
  check_backend
  check_recent_crashes
}

touch /tmp/em_last_crash_check 2>/dev/null

log "============================================"
log "ERROR MONITOR AVVIATO"
log "  Backend port: $BACKEND_PORT"
log "  Produzione:   $PROD_HOST"
log "  Intervallo:   ${CHECK_INTERVAL}s"
log "  Log:          $LOG_FILE"
log "  Checks/ciclo: backend, backend-crashes"
log "============================================"

run_all_checks

CYCLE=0
while true; do
  sleep "$CHECK_INTERVAL"
  CYCLE=$((CYCLE + 1))

  run_all_checks

  if [ $((CYCLE % 20)) -eq 0 ]; then
    rotate_log
  fi
done
