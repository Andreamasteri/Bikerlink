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
      log "LOG_ROTATE: troncato a $((LOG_MAX_LINES / 2)) righe"
    fi
  fi
}

parse_metro_error() {
  local file="$1"
  node -e "
    try {
      const d = require('fs').readFileSync('$file','utf8');
      const j = JSON.parse(d);
      process.stdout.write((j.message || j.errors?.[0]?.message || d).slice(0,250));
    } catch(e) {
      const d = require('fs').readFileSync('$file','utf8');
      process.stdout.write(d.slice(0,250));
    }
  " 2>/dev/null
}

# ── Check 1: Metro /status ────────────────────────────────────────────────────
check_metro() {
  local http_code status_body

  http_code=$(curl -s --max-time 5 --connect-timeout 3 \
    -o /tmp/em_metro_status.txt -w "%{http_code}" \
    "http://localhost:$METRO_PORT/status" 2>/dev/null)

  if [ "$http_code" != "200" ]; then
    log "METRO_DOWN: /status HTTP $http_code (packager non in esecuzione)"
    return 1
  fi

  status_body=$(cat /tmp/em_metro_status.txt 2>/dev/null)
  if ! echo "$status_body" | grep -q "packager-status:running"; then
    log "METRO_WARN: /status 200 ma packager non running — body: $(echo "$status_body" | head -c 100)"
    return 1
  fi

  return 0
}

# ── Check 2: Metro /symbolicate ───────────────────────────────────────────────
check_symbolicate() {
  local http_code

  http_code=$(curl -s --max-time 8 --connect-timeout 3 \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"stack":[]}' \
    -o /tmp/em_symbolicate.txt -w "%{http_code}" \
    "http://localhost:$METRO_PORT/symbolicate" 2>/dev/null)

  if [ "$http_code" = "200" ] || [ "$http_code" = "400" ] || [ "$http_code" = "422" ]; then
    log "SYMBOLICATE_OK: /symbolicate risponde HTTP $http_code"
  elif [ "$http_code" = "000" ] || [ -z "$http_code" ]; then
    log "SYMBOLICATE_DOWN: /symbolicate non risponde (Metro non pronto)"
  else
    local body
    body=$(head -c 200 /tmp/em_symbolicate.txt 2>/dev/null)
    log "SYMBOLICATE_ERROR: /symbolicate HTTP $http_code — $body"
  fi
}

# ── Check 3: Bundle web ───────────────────────────────────────────────────────
check_web_bundle() {
  local http_code

  http_code=$(curl -s --max-time 20 --connect-timeout 3 \
    -o /tmp/em_bundle_web.txt -w "%{http_code}" \
    "http://localhost:$METRO_PORT/node_modules/expo-router/entry.bundle?platform=web&dev=true&hot=false&lazy=true&minify=false" \
    2>/dev/null)

  if [ "$http_code" = "200" ]; then
    local size
    size=$(wc -c < /tmp/em_bundle_web.txt 2>/dev/null || echo 0)
    log "BUNDLE_WEB_OK: HTTP 200 — ${size}B"
  elif [ "$http_code" = "500" ]; then
    local err
    err=$(parse_metro_error /tmp/em_bundle_web.txt)
    log "BUNDLE_WEB_ERROR: HTTP 500 — $err"
  elif [ "$http_code" = "000" ] || [ -z "$http_code" ]; then
    log "BUNDLE_WEB_DOWN: nessuna risposta da Metro (timeout/crash)"
  else
    log "BUNDLE_WEB_WARN: HTTP $http_code inatteso"
  fi
}

# ── Check 4: Bundle Android (asincrono, non blocca ciclo) ─────────────────────
# Lancia il check in background e scrive il risultato nel log
# Il check Android può richiedere 30-90s la prima volta (compilazione cold)
android_bundle_check_bg() {
  local http_code ts
  http_code=$(curl -s --max-time 90 --connect-timeout 3 \
    -o /tmp/em_bundle_android.txt -w "%{http_code}" \
    "http://localhost:$METRO_PORT/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&minify=false" \
    2>/dev/null)

  ts="[$(date '+%Y-%m-%d %H:%M:%S')]"

  if [ "$http_code" = "200" ]; then
    local size
    size=$(wc -c < /tmp/em_bundle_android.txt 2>/dev/null || echo 0)
    echo "$ts BUNDLE_ANDROID_OK: HTTP 200 — ${size}B" | tee -a "$LOG_FILE"
  elif [ "$http_code" = "500" ]; then
    local err
    err=$(parse_metro_error /tmp/em_bundle_android.txt)
    echo "$ts BUNDLE_ANDROID_ERROR: HTTP 500 — $err" | tee -a "$LOG_FILE"
  elif [ "$http_code" = "000" ] || [ -z "$http_code" ]; then
    echo "$ts BUNDLE_ANDROID_DOWN: timeout o crash Metro" | tee -a "$LOG_FILE"
  else
    echo "$ts BUNDLE_ANDROID_WARN: HTTP $http_code" | tee -a "$LOG_FILE"
  fi
  rm -f /tmp/em_android_running
}

check_android_bundle() {
  # Evita lanci paralleli del check Android
  if [ -f /tmp/em_android_running ]; then
    return 0
  fi
  touch /tmp/em_android_running
  android_bundle_check_bg &
}

# ── Check 5: Backend /api/health ─────────────────────────────────────────────
check_backend() {
  local http_code start_time end_time elapsed

  start_time=$(date +%s%3N)
  # Singola chiamata: body su file, status code via -w
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

# ── Check 6: Errori nei log ciclo Metro ──────────────────────────────────────
check_metro_cycle_errors() {
  local latest_log errors
  latest_log=$(ls -t /tmp/metro-opt-cycle*.log 2>/dev/null | head -1)
  [ -z "$latest_log" ] && return 0

  errors=$(find "$latest_log" -newer /tmp/em_last_cycle_check 2>/dev/null \
    | xargs grep -i "error\|crash\|failed\|exception\|SIGKILL\|exit.*137" 2>/dev/null | head -3)

  if [ -n "$errors" ]; then
    while IFS= read -r line; do
      [ -n "$line" ] && log "METRO_CYCLE_ERROR: $(echo "$line" | head -c 200)"
    done <<< "$errors"
  fi

  touch /tmp/em_last_cycle_check 2>/dev/null
}

# ── Check 7: Crash backend recenti ───────────────────────────────────────────
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
  check_metro
  check_backend
  check_symbolicate
  check_web_bundle
  check_android_bundle    # non-blocking, gira in background
  check_metro_cycle_errors
  check_recent_crashes
}

touch /tmp/em_last_cycle_check /tmp/em_last_crash_check 2>/dev/null
rm -f /tmp/em_android_running

log "============================================"
log "ERROR MONITOR AVVIATO"
log "  Metro port:   $METRO_PORT"
log "  Backend port: $BACKEND_PORT"
log "  Intervallo:   ${CHECK_INTERVAL}s"
log "  Log:          $LOG_FILE"
log "  Checks/ciclo: metro, backend, symbolicate, bundle-web, bundle-android(async)"
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
