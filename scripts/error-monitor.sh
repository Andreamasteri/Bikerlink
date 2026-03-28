#!/bin/bash

METRO_PORT=8081
BACKEND_PORT=5000
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
      log "LOG ROTAZIONE: troncato a $((LOG_MAX_LINES / 2)) righe"
    fi
  fi
}

check_metro() {
  local status_code
  status_code=$(curl -s --max-time 5 --connect-timeout 3 \
    -o /dev/null -w "%{http_code}" "http://localhost:$METRO_PORT/status" 2>/dev/null)

  if [ "$status_code" != "200" ]; then
    log "METRO_DOWN: /status risponde $status_code (packager non in esecuzione)"
    return 1
  fi

  local status_body
  status_body=$(curl -s --max-time 5 "http://localhost:$METRO_PORT/status" 2>/dev/null)
  if ! echo "$status_body" | grep -q "packager-status:running"; then
    log "METRO_WARN: /status risponde ma packager non running — body: $status_body"
    return 1
  fi

  return 0
}

check_web_bundle() {
  local http_code body

  # Richiesta rapida: solo headers per sapere se è 200 o 500
  http_code=$(curl -s --max-time 10 --connect-timeout 3 \
    -o /tmp/em_bundle_web.json -w "%{http_code}" \
    "http://localhost:$METRO_PORT/node_modules/expo-router/entry.bundle?platform=web&dev=true&hot=false&lazy=true&minify=false" \
    2>/dev/null)

  if [ "$http_code" = "200" ]; then
    local size
    size=$(wc -c < /tmp/em_bundle_web.json 2>/dev/null || echo 0)
    log "BUNDLE_WEB_OK: HTTP 200 — dimensione: ${size}B"
  elif [ "$http_code" = "500" ]; then
    local error_msg
    error_msg=$(node -e "
      try {
        const d = require('fs').readFileSync('/tmp/em_bundle_web.json','utf8');
        const j = JSON.parse(d);
        console.log(j.message || j.errors?.[0]?.message || d.slice(0,300));
      } catch(e) {
        const d = require('fs').readFileSync('/tmp/em_bundle_web.json','utf8');
        console.log(d.slice(0,300));
      }
    " 2>/dev/null | head -1)
    log "BUNDLE_WEB_ERROR: HTTP 500 — $error_msg"
  elif [ "$http_code" = "000" ] || [ -z "$http_code" ]; then
    log "BUNDLE_WEB_DOWN: nessuna risposta da Metro (timeout o crash)"
  else
    log "BUNDLE_WEB_WARN: HTTP $http_code inatteso"
  fi
}

check_backend() {
  local start_time end_time elapsed http_code body

  start_time=$(date +%s%3N)
  body=$(curl -s --max-time 5 --connect-timeout 3 \
    "http://localhost:$BACKEND_PORT/api/health" 2>/dev/null)
  end_time=$(date +%s%3N)
  elapsed=$((end_time - start_time))
  http_code=$(curl -s --max-time 5 --connect-timeout 3 \
    -o /dev/null -w "%{http_code}" \
    "http://localhost:$BACKEND_PORT/api/health" 2>/dev/null)

  if [ "$http_code" = "200" ]; then
    local initializing
    initializing=$(echo "$body" | grep -o '"initializing":[a-z]*' | cut -d: -f2)
    if [ "$initializing" = "true" ]; then
      log "BACKEND_INIT: /api/health 200 — ancora in inizializzazione (${elapsed}ms)"
    else
      log "BACKEND_OK: /api/health 200 — ${elapsed}ms"
    fi
  elif [ -z "$http_code" ] || [ "$http_code" = "000" ]; then
    log "BACKEND_DOWN: /api/health non risponde (timeout o crash)"
  else
    log "BACKEND_ERROR: /api/health HTTP $http_code — ${elapsed}ms — $body"
  fi
}

check_metro_cycle_errors() {
  # Legge il log ciclo Metro più recente e cerca errori
  local latest_log
  latest_log=$(ls -t /tmp/metro-opt-cycle*.log 2>/dev/null | head -1)

  if [ -z "$latest_log" ]; then
    return 0
  fi

  # Cerca righe di errore aggiunte nell'ultimo minuto
  local errors
  errors=$(find "$latest_log" -newer /tmp/em_last_cycle_check 2>/dev/null \
    | xargs grep -i "error\|crash\|failed\|exception\|SIGKILL\|exit.*137" 2>/dev/null | head -3)

  if [ -n "$errors" ]; then
    while IFS= read -r line; do
      log "METRO_CYCLE_ERROR: $line"
    done <<< "$errors"
  fi

  touch /tmp/em_last_cycle_check 2>/dev/null
}

check_recent_crashes() {
  # Segnala se ci sono stati crash nelle ultime 2 min
  local recent_crashes
  recent_crashes=$(find logs/backend-crashes.log -newer /tmp/em_last_crash_check 2>/dev/null \
    | xargs tail -3 2>/dev/null)

  if [ -n "$recent_crashes" ]; then
    while IFS= read -r line; do
      [ -n "$line" ] && log "BACKEND_CRASH: $line"
    done <<< "$recent_crashes"
  fi

  touch /tmp/em_last_crash_check 2>/dev/null
}

# ── Avvio ───────────────────────────────────────────────────────────────────
touch /tmp/em_last_cycle_check /tmp/em_last_crash_check 2>/dev/null

log "============================================"
log "ERROR MONITOR AVVIATO"
log "  Metro port: $METRO_PORT"
log "  Backend port: $BACKEND_PORT"
log "  Intervallo check: ${CHECK_INTERVAL}s"
log "  Log: $LOG_FILE"
log "============================================"

# Prima esecuzione immediata
check_metro
check_backend
check_web_bundle
check_metro_cycle_errors
check_recent_crashes

CYCLE=0
while true; do
  sleep "$CHECK_INTERVAL"
  CYCLE=$((CYCLE + 1))

  check_metro
  check_backend

  # Bundle web check ogni 3 cicli (90s) per non sovraccaricare Metro
  if [ $((CYCLE % 3)) -eq 0 ]; then
    if check_metro 2>/dev/null; then
      check_web_bundle
    fi
  fi

  check_metro_cycle_errors
  check_recent_crashes

  # Rotazione log ogni 20 cicli (~10 min)
  if [ $((CYCLE % 20)) -eq 0 ]; then
    rotate_log
  fi
done
