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

# ── Check 3: OTA mismatch produzione (ogni 10 cicli, ~5 min) ────────────────
check_ota_mismatch() {
  local OTA_JSON="ota-updates.json"
  [ -f "$OTA_JSON" ] || return 0
  [ -f "app.json" ] || return 0

  # Legge runtimeVersion corrente da app.json e l'ultima entry published da
  # ota-updates.json (array piatto, filtrato per runtimeVersion + status=published).
  local EXPECTED_RV EXPECTED_ID EXPECTED_OTA
  local META
  META=$(node -e "
    try {
      const fs = require('fs');
      const rv = JSON.parse(fs.readFileSync('app.json','utf8'))?.expo?.runtimeVersion ?? '';
      if (!rv) { console.log('ERROR:no_rv'); process.exit(0); }
      const data = JSON.parse(fs.readFileSync('$OTA_JSON','utf8'));
      const published = data.filter(e =>
        typeof e.updateNumber === 'number' &&
        e.runtimeVersion === rv &&
        e.status === 'published'
      );
      if (published.length === 0) { console.log('NO_PUBLISHED:rv=' + rv); process.exit(0); }
      const last = published[published.length - 1];
      console.log('OK:rv=' + rv + ':ota=' + last.updateNumber + ':id=' + (last.releaseId ?? ''));
    } catch(e) { console.log('ERROR:' + e.message.replace(/\n/g,' ')); }
  " 2>/dev/null || echo "ERROR:node_failed")

  if [[ "$META" == ERROR:* ]]; then
    return 0
  fi
  if [[ "$META" == NO_PUBLISHED:* ]]; then
    return 0
  fi

  EXPECTED_RV=$(echo "$META" | grep -o 'rv=[^:]*' | head -1 | cut -d= -f2)
  EXPECTED_OTA=$(echo "$META" | grep -o 'ota=[^:]*' | head -1 | cut -d= -f2)
  EXPECTED_ID=$(echo "$META" | grep -o 'id=.*' | head -1 | cut -d= -f2)

  [ -z "$EXPECTED_RV" ] && return 0

  local HTTP_RESPONSE HTTP_BODY HTTP_CODE SERVED_ID
  HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "expo-runtime-version: $EXPECTED_RV" \
    -H "expo-platform: android" \
    -H "expo-protocol-version: 1" \
    --max-time 10 \
    "$PROD_HOST/api/expo-updates" 2>/dev/null || echo -e "\nCURL_FAILED")
  HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
  HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -1)

  if [ "$HTTP_CODE" = "CURL_FAILED" ] || [ -z "$HTTP_CODE" ]; then
    return 0
  fi

  if [ "$HTTP_CODE" != "200" ]; then
    # 204/304 = no update available; altri codici = errore transiente
    return 0
  fi

  # Estrae il releaseId (UUID) dal body — funziona sia con JSON puro che con
  # multipart/mixed (Expo Protocol v1)
  SERVED_ID=$(echo "$HTTP_BODY" \
    | grep -oE '"id"[[:space:]]*:[[:space:]]*"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"' \
    | head -1 \
    | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' \
    || echo "")

  if [ -z "$SERVED_ID" ]; then
    return 0
  fi

  if [ -n "$EXPECTED_ID" ] && [ "$SERVED_ID" != "$EXPECTED_ID" ]; then
    log "WARN_OTA_MISMATCH: produzione serve id=$SERVED_ID, atteso OTA-${EXPECTED_OTA} id=$EXPECTED_ID (rv=$EXPECTED_RV)"
  else
    log "OTA_OK: produzione serve OTA-${EXPECTED_OTA} rv=$EXPECTED_RV id=$SERVED_ID"
  fi
}

# ── Check 4: Last.fm route produzione (ogni 10 cicli, ~5 min) ─────────────────
check_lastfm_prod() {
  local http_code
  http_code=$(curl -s --max-time 8 --connect-timeout 5 \
    -o /dev/null -w "%{http_code}" \
    "$PROD_HOST/api/lastfm/status" 2>/dev/null)

  # 401 = route viva, auth richiesta (atteso per chiamata non autenticata)
  # 200 = route viva (non dovrebbe succedere senza session ma accettabile)
  if [ "$http_code" = "401" ] || [ "$http_code" = "200" ]; then
    log "LASTFM_OK: GET $PROD_HOST/api/lastfm/status → $http_code"
  elif [ "$http_code" = "000" ] || [ -z "$http_code" ]; then
    log "LASTFM_WARN: GET $PROD_HOST/api/lastfm/status → timeout/non raggiungibile"
  else
    log "LASTFM_WARN: GET $PROD_HOST/api/lastfm/status → $http_code (inatteso)"
  fi
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
log "  Check Last.fm produzione: ogni 10 cicli (~5 min)"
log "  Check OTA mismatch produzione: ogni 10 cicli (~5 min)"
log "============================================"

run_all_checks

CYCLE=0
while true; do
  sleep "$CHECK_INTERVAL"
  CYCLE=$((CYCLE + 1))

  run_all_checks

  if [ $((CYCLE % 10)) -eq 0 ]; then
    check_lastfm_prod
  fi

  if [ $((CYCLE % 10)) -eq 0 ]; then
    check_ota_mismatch
  fi

  if [ $((CYCLE % 20)) -eq 0 ]; then
    rotate_log
  fi
done
