#!/bin/bash

BACKEND_PORT=5000
FRONTEND_PORT=8081
LOG_FILE="/home/runner/workspace/logs/watchdog.log"
HEALTH_CHECK_INTERVAL=60
CHECK_INTERVAL=10
RESTART_COOLDOWN=60
FRONTEND_RESTART_COOLDOWN=120

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"
}

is_port_open() {
  local port=$1
  curl -s --max-time 2 "http://localhost:$port" >/dev/null 2>&1 || \
  nc -z -w2 localhost "$port" >/dev/null 2>&1
}

restart_backend() {
  log "CRASH RILEVATO: backend (porta $BACKEND_PORT) non risponde. Avvio riavvio..."

  BACKEND_LOCK_FILE="/tmp/start-backend.lock"
  if [ -f "$BACKEND_LOCK_FILE" ]; then
    LOCK_PID=$(cat "$BACKEND_LOCK_FILE" 2>/dev/null)
    if kill -0 "$LOCK_PID" 2>/dev/null; then
      log "Start-backend già in esecuzione (PID: $LOCK_PID), attendo che il backend si avvii..."
      return 0
    fi
    rm -f "$BACKEND_LOCK_FILE"
  fi

  pkill -f "node server_dist/index.js" 2>/dev/null || true
  pkill -f "tsx server" 2>/dev/null || true
  lsof -ti:"$BACKEND_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
  sleep 2
  log "RIAVVIO AVVIATO: backend (porta $BACKEND_PORT)..."
  bash /home/runner/workspace/scripts/start-backend.sh >> "$LOG_FILE" 2>&1 &
  log "RIAVVIO COMPLETATO: processo backend avviato in background"
}

restart_frontend() {
  log "CRASH RILEVATO: frontend (porta $FRONTEND_PORT) non risponde. Avvio riavvio..."

  LOCK_FILE="/tmp/start-expo.lock"
  if [ -f "$LOCK_FILE" ]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    if kill -0 "$LOCK_PID" 2>/dev/null; then
      log "Start-expo già in esecuzione (PID: $LOCK_PID), attendo che Metro si avvii..."
      return 0
    fi
    rm -f "$LOCK_FILE"
  fi

  pkill -f "metro" 2>/dev/null || true
  pkill -f "expo start" 2>/dev/null || true
  pkill -f "react-native start" 2>/dev/null || true
  lsof -ti:"$FRONTEND_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
  sleep 2
  log "RIAVVIO AVVIATO: frontend (porta $FRONTEND_PORT)..."
  bash /home/runner/workspace/scripts/start-expo.sh >> "$LOG_FILE" 2>&1 &
  log "RIAVVIO COMPLETATO: processo frontend avviato in background"
}

health_check() {
  local response
  response=$(curl -s --max-time 5 "http://localhost:$BACKEND_PORT/api/health" 2>&1)
  if echo "$response" | grep -q '"status":"ok"'; then
    log "HEALTH CHECK OK: /api/health risponde correttamente"
  else
    log "HEALTH CHECK FAIL: /api/health non risponde o risposta non valida (risposta: $response)"
  fi
}

log "========================================="
log "WATCHDOG AVVIATO"
log "  Backend port: $BACKEND_PORT"
log "  Frontend port: $FRONTEND_PORT"
log "  Health check interval: ${HEALTH_CHECK_INTERVAL}s"
log "  Check interval: ${CHECK_INTERVAL}s"
log "  Restart cooldown: ${RESTART_COOLDOWN}s (riprova ogni ${RESTART_COOLDOWN}s se il servizio resta giu')"
log "========================================="

last_health_check=0
last_backend_restart=0
last_frontend_restart=0
backend_down_since=0
frontend_down_since=0

while true; do
  now=$(date +%s)

  if is_port_open "$BACKEND_PORT"; then
    if [ "$backend_down_since" -gt 0 ]; then
      log "BACKEND RECUPERATO: porta $BACKEND_PORT risponde di nuovo"
      backend_down_since=0
    fi
  else
    if [ "$backend_down_since" -eq 0 ]; then
      backend_down_since=$now
    fi
    time_since_last_restart=$((now - last_backend_restart))
    if [ "$time_since_last_restart" -ge "$RESTART_COOLDOWN" ]; then
      restart_backend
      last_backend_restart=$now
    else
      log "BACKEND ANCORA GIU': prossimo tentativo di riavvio tra $((RESTART_COOLDOWN - time_since_last_restart))s"
    fi
  fi

  if is_port_open "$FRONTEND_PORT"; then
    if [ "$frontend_down_since" -gt 0 ]; then
      log "FRONTEND RECUPERATO: porta $FRONTEND_PORT risponde di nuovo"
      frontend_down_since=0
    fi
  else
    if [ "$frontend_down_since" -eq 0 ]; then
      frontend_down_since=$now
    fi
    time_since_last_restart=$((now - last_frontend_restart))
    if [ "$time_since_last_restart" -ge "$FRONTEND_RESTART_COOLDOWN" ]; then
      restart_frontend
      last_frontend_restart=$now
    else
      log "FRONTEND ANCORA GIU': prossimo tentativo di riavvio tra $((FRONTEND_RESTART_COOLDOWN - time_since_last_restart))s"
    fi
  fi

  if [ $((now - last_health_check)) -ge "$HEALTH_CHECK_INTERVAL" ]; then
    health_check
    last_health_check=$now
  fi

  sleep "$CHECK_INTERVAL"
done
