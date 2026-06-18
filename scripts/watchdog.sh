#!/bin/bash
# Watchdog — monitora backend (porta 5000) e Metro/frontend (porta 8081).
# Backup originale in: scripts/backup/watchdog.sh.bak

BACKEND_PORT=5000
METRO_PORT=8081
LOG_FILE="/home/runner/workspace/logs/watchdog.log"
HEALTH_CHECK_INTERVAL=60
CHECK_INTERVAL=10
RESTART_COOLDOWN=60
METRO_RESTART_COOLDOWN=90
LOG_MAX_BYTES=1048576

MAX_CRASHES_IN_WINDOW=3
CRASH_WINDOW_SECS=300
BACKOFF_STEPS=(300 600 1200)

mkdir -p "$(dirname "$LOG_FILE")"

exec 9>>"/tmp/watchdog.flock"
if ! flock -n 9; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Altra istanza Watchdog gia' in esecuzione. Uscita." >> "$LOG_FILE"
  exit 0
fi

RUNNING=1

graceful_shutdown() {
  log "WATCHDOG: ricevuto segnale di arresto, uscita pulita..."
  RUNNING=0
}
trap graceful_shutdown SIGTERM SIGINT

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"
}

rotate_log() {
  if [ -f "$LOG_FILE" ]; then
    local size
    size=$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
    if [ "$size" -gt "$LOG_MAX_BYTES" ]; then
      local lines
      lines=$(wc -l < "$LOG_FILE")
      local keep=$((lines / 2))
      tail -n "$keep" "$LOG_FILE" > "${LOG_FILE}.tmp" 2>/dev/null
      mv "${LOG_FILE}.tmp" "$LOG_FILE" 2>/dev/null
      log "LOG ROTAZIONE: file troncato da ${size} bytes (mantenute ultime $keep righe)"
    fi
  fi
}

is_port_open() {
  local port=$1
  curl -s --max-time 2 "http://localhost:$port" >/dev/null 2>&1 || \
  nc -z -w2 localhost "$port" >/dev/null 2>&1
}

# ── Backend crash tracking ────────────────────────────────────────────────────
declare -a BACKEND_CRASH_TIMES=()
BACKEND_BACKOFF_UNTIL=0
CONSECUTIVE_CRASH_SESSIONS=0
backend_healthy_since=0

record_backend_crash_session() {
  local now=$1
  local new_times=()
  for t in "${BACKEND_CRASH_TIMES[@]}"; do
    if [ $((now - t)) -lt $CRASH_WINDOW_SECS ]; then
      new_times+=("$t")
    fi
  done
  BACKEND_CRASH_TIMES=("${new_times[@]}" "$now")

  local count=${#BACKEND_CRASH_TIMES[@]}
  if [ "$count" -gt "$MAX_CRASHES_IN_WINDOW" ]; then
    CONSECUTIVE_CRASH_SESSIONS=$((CONSECUTIVE_CRASH_SESSIONS + 1))
    local step=$((CONSECUTIVE_CRASH_SESSIONS - 1))
    local max_step=$(( ${#BACKOFF_STEPS[@]} - 1 ))
    if [ "$step" -gt "$max_step" ]; then step=$max_step; fi
    local backoff_secs=${BACKOFF_STEPS[$step]}
    BACKEND_BACKOFF_UNTIL=$((now + backoff_secs))
    local backoff_until_str
    backoff_until_str=$(date -d "@$BACKEND_BACKOFF_UNTIL" '+%H:%M:%S' 2>/dev/null || echo "${backoff_secs}s da ora")
    log "CRASH LOOP RILEVATO: $count crash negli ultimi ${CRASH_WINDOW_SECS}s (sessione #${CONSECUTIVE_CRASH_SESSIONS}) — backoff ${backoff_secs}s fino alle $backoff_until_str"
    BACKEND_CRASH_TIMES=()
    return 1
  fi
  return 0
}

WATCHDOG_RESTART_LOCK="/tmp/watchdog-backend-restart.lock"

restart_backend() {
  log "CRASH RILEVATO: backend (porta $BACKEND_PORT) non risponde. Avvio riavvio..."

  # Lock atomico: usa mkdir (atomico su Linux) per evitare doppio restart
  if ! mkdir "$WATCHDOG_RESTART_LOCK" 2>/dev/null; then
    log "[WATCHDOG] restart in progress, skipping"
    return 0
  fi
  # Rimuovi il lock quando la funzione termina
  trap 'rmdir "$WATCHDOG_RESTART_LOCK" 2>/dev/null || true' RETURN

  BACKEND_LOCK_FILE="/tmp/start-backend.lock"
  if [ -f "$BACKEND_LOCK_FILE" ]; then
    LOCK_PID=$(cat "$BACKEND_LOCK_FILE" 2>/dev/null)
    # PID vuoto o non numerico: start-backend.sh ha appena creato il lock
    # ma non ha ancora scritto il PID. Trattare come lock attivo per evitare
    # la race EADDRINUSE tra Start App e Watchdog.
    if [ -z "$LOCK_PID" ] || ! [[ "$LOCK_PID" =~ ^[0-9]+$ ]]; then
      log "Start-backend in avvio (lock con PID vuoto/non numerico: '$LOCK_PID') — skip restart"
      return 0
    fi
    if kill -0 "$LOCK_PID" 2>/dev/null; then
      log "Start-backend già in esecuzione (PID: $LOCK_PID), attendo che il backend si avvii..."
      return 0
    fi
    # Verifica simmetrica: c'è già un processo start-backend.sh in giro?
    if pgrep -f "bash .*scripts/start-backend.sh" >/dev/null 2>&1; then
      log "Start-backend.sh rilevato attivo (pgrep) — skip restart"
      return 0
    fi
    rm -f "$BACKEND_LOCK_FILE"
  fi

  log "RIAVVIO AVVIATO: backend (porta $BACKEND_PORT)..."
  bash /home/runner/workspace/scripts/start-backend.sh >> "$LOG_FILE" 2>&1 &
  log "RIAVVIO COMPLETATO: processo backend avviato in background (PID: $!)"
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

# ── Metro crash tracking ──────────────────────────────────────────────────────
declare -a METRO_CRASH_TIMES=()
METRO_BACKOFF_UNTIL=0
CONSECUTIVE_METRO_CRASH_SESSIONS=0
metro_healthy_since=0

record_metro_crash_session() {
  local now=$1
  local new_times=()
  for t in "${METRO_CRASH_TIMES[@]}"; do
    if [ $((now - t)) -lt $CRASH_WINDOW_SECS ]; then
      new_times+=("$t")
    fi
  done
  METRO_CRASH_TIMES=("${new_times[@]}" "$now")

  local count=${#METRO_CRASH_TIMES[@]}
  if [ "$count" -gt "$MAX_CRASHES_IN_WINDOW" ]; then
    CONSECUTIVE_METRO_CRASH_SESSIONS=$((CONSECUTIVE_METRO_CRASH_SESSIONS + 1))
    local step=$((CONSECUTIVE_METRO_CRASH_SESSIONS - 1))
    local max_step=$(( ${#BACKOFF_STEPS[@]} - 1 ))
    if [ "$step" -gt "$max_step" ]; then step=$max_step; fi
    local backoff_secs=${BACKOFF_STEPS[$step]}
    METRO_BACKOFF_UNTIL=$((now + backoff_secs))
    local backoff_until_str
    backoff_until_str=$(date -d "@$METRO_BACKOFF_UNTIL" '+%H:%M:%S' 2>/dev/null || echo "${backoff_secs}s da ora")
    log "METRO CRASH LOOP RILEVATO: $count crash negli ultimi ${CRASH_WINDOW_SECS}s (sessione #${CONSECUTIVE_METRO_CRASH_SESSIONS}) — backoff ${backoff_secs}s fino alle $backoff_until_str"
    METRO_CRASH_TIMES=()
    return 1
  fi
  return 0
}

METRO_LOCK_FILE="/tmp/start-metro.lock"

# Restituisce 0 (true) se un avvio Metro è realmente in corso:
#   - processo scripts/start-expo.sh attivo (pgrep), OPPURE
#   - lock /tmp/start-metro.lock ancora detenuto (flock -n fallisce).
# Usa un fd dedicato (200), MAI fd 9 che appartiene a start-expo.sh. Il lock
# viene solo sondato e rilasciato subito: non lo deteniamo né lo rimuoviamo qui.
metro_starting() {
  if pgrep -f "scripts/start-expo.sh" >/dev/null 2>&1; then
    return 0
  fi
  if [ -f "$METRO_LOCK_FILE" ]; then
    exec 200>>"$METRO_LOCK_FILE"
    if ! flock -n 200; then
      exec 200>&-
      return 0
    fi
    flock -u 200 2>/dev/null || true
    exec 200>&-
  fi
  return 1
}

# Kill mirato della SOLA porta Metro: SIGTERM → attesa → SIGKILL se ancora viva.
# Mai pkill per nome (colpirebbe processi non correlati).
kill_metro_port() {
  lsof -ti:"$METRO_PORT" 2>/dev/null | xargs -r kill -TERM 2>/dev/null || true
  sleep 2
  lsof -ti:"$METRO_PORT" 2>/dev/null | xargs -r kill -KILL 2>/dev/null || true
}

restart_metro() {
  # Doppio cancello PRIMA di qualsiasi kill: se un avvio è in corso (lock tenuto
  # o start-expo.sh attivo) non toccare nulla. Un blind kill qui ucciderebbe il
  # Metro in fase di boot → exit 143 → start.sh lo classifica come crash → loop.
  if metro_starting; then
    log "METRO: skip — avvio in corso (lock/start-expo attivo), nessun kill"
    return 0
  fi

  log "METRO CRASH: porta $METRO_PORT non risponde. Pulizia cache e riavvio..."

  # Rimozione lock SOLO se davvero stale. Tra il gate metro_starting e questo
  # punto un start-expo.sh potrebbe essere appena partito e aver acquisito il
  # lock (finestra TOCTOU): se rimuovessimo il file alla cieca cancelleremmo un
  # lock attivo → due Metro in avvio concorrente. Riacquisiamo con flock -n su
  # fd 200: se riesce il lock NON è detenuto → stale → lo rimuoviamo mentre lo
  # teniamo; se fallisce qualcuno ha appena avviato Metro → bail senza toccare.
  if [ -f "$METRO_LOCK_FILE" ]; then
    exec 200>>"$METRO_LOCK_FILE"
    if flock -n 200; then
      rm -f "$METRO_LOCK_FILE"
      flock -u 200 2>/dev/null || true
      exec 200>&-
    else
      exec 200>&-
      log "METRO: skip — lock acquisito durante il restart (avvio appena partito), nessun kill"
      return 0
    fi
  fi

  # Doppio controllo immediatamente prima del kill: restringe ulteriormente la
  # finestra TOCTOU se un avvio è partito dopo la verifica/rimozione del lock.
  if metro_starting; then
    log "METRO: skip — avvio rilevato prima del kill, nessun kill"
    return 0
  fi

  kill_metro_port

  log "METRO CLEAN: esecuzione clean-metro.sh prima del riavvio..."
  if bash /home/runner/workspace/scripts/clean-metro.sh >> "$LOG_FILE" 2>&1; then
    log "METRO CLEAN: completata con successo"
  else
    log "METRO CLEAN: errore durante la pulizia (continuando comunque con il riavvio)"
  fi

  log "METRO RIAVVIO: avvio start-expo.sh in background..."
  bash /home/runner/workspace/scripts/start-expo.sh >> "$LOG_FILE" 2>&1 &
  log "METRO RIAVVIO: processo frontend avviato in background (PID: $!)"
}

# ── Main loop ─────────────────────────────────────────────────────────────────
log "========================================="
log "WATCHDOG AVVIATO"
log "  Backend port: $BACKEND_PORT"
log "  Metro port:   $METRO_PORT"
log "  Health check interval: ${HEALTH_CHECK_INTERVAL}s"
log "  Check interval: ${CHECK_INTERVAL}s"
log "  Restart cooldown backend: ${RESTART_COOLDOWN}s"
log "  Restart cooldown Metro:   ${METRO_RESTART_COOLDOWN}s"
log "  Crash loop: max ${MAX_CRASHES_IN_WINDOW} crash in ${CRASH_WINDOW_SECS}s → backoff ${BACKOFF_STEPS[*]}s (esponenziale)"
log "  Log max size: $((LOG_MAX_BYTES / 1024))KB (rotazione automatica)"
log "========================================="

last_health_check=0
last_backend_restart=0
backend_down_since=0
check_count=0
backend_crash_session_counted=0

last_metro_restart=0
metro_down_since=0
metro_crash_session_counted=0

# Grace window: nei primi METRO_GRACE_SECS dal boot un Metro non ancora su è
# normale (cache rebuild, avvio lento). In questa finestra: solo warning, mai
# restart/backoff — evita di uccidere il Metro in boot e innescare crash loop.
METRO_GRACE_SECS=180
BOOT_TS=$(date +%s)

while [ "$RUNNING" -eq 1 ]; do
  now=$(date +%s)

  # ── Backend monitor ────────────────────────────────────────────────────────
  if is_port_open "$BACKEND_PORT"; then
    if [ "$backend_down_since" -gt 0 ]; then
      log "BACKEND RECUPERATO: porta $BACKEND_PORT risponde di nuovo"
      backend_down_since=0
      backend_crash_session_counted=0
      backend_healthy_since=$now
    fi
    if [ "$backend_healthy_since" -gt 0 ] && [ $((now - backend_healthy_since)) -ge 600 ] && [ "$CONSECUTIVE_CRASH_SESSIONS" -gt 0 ]; then
      log "BACKEND STABILE: 10+ min uptime — reset contatore sessioni crash (era $CONSECUTIVE_CRASH_SESSIONS)"
      CONSECUTIVE_CRASH_SESSIONS=0
    fi
  else
    if [ "$backend_down_since" -eq 0 ]; then
      backend_down_since=$now
      backend_healthy_since=0
    fi
    time_since_last_restart=$((now - last_backend_restart))
    if [ "$time_since_last_restart" -ge "$RESTART_COOLDOWN" ]; then
      if [ "$BACKEND_BACKOFF_UNTIL" -gt "$now" ]; then
        remaining=$((BACKEND_BACKOFF_UNTIL - now))
        log "BACKEND GIU': crash loop backoff attivo — attendo ancora ${remaining}s"
      else
        if [ "$backend_crash_session_counted" -eq 0 ]; then
          backend_crash_session_counted=1
          if ! record_backend_crash_session "$now"; then
            log "BACKEND GIU': backoff appena attivato — skip restart questo ciclo"
            last_backend_restart=$now
            sleep "$CHECK_INTERVAL"
            continue
          fi
        fi
        restart_backend
        last_backend_restart=$now
      fi
    else
      log "BACKEND ANCORA GIU': prossimo tentativo di riavvio tra $((RESTART_COOLDOWN - time_since_last_restart))s"
    fi
  fi

  # ── Metro monitor ──────────────────────────────────────────────────────────
  if is_port_open "$METRO_PORT"; then
    if [ "$metro_down_since" -gt 0 ]; then
      log "METRO RECUPERATO: porta $METRO_PORT risponde di nuovo"
      metro_down_since=0
      metro_crash_session_counted=0
      metro_healthy_since=$now
    fi
    if [ "$metro_healthy_since" -gt 0 ] && [ $((now - metro_healthy_since)) -ge 600 ] && [ "$CONSECUTIVE_METRO_CRASH_SESSIONS" -gt 0 ]; then
      log "METRO STABILE: 10+ min uptime — reset contatore sessioni crash (era $CONSECUTIVE_METRO_CRASH_SESSIONS)"
      CONSECUTIVE_METRO_CRASH_SESSIONS=0
    fi
  else
    if [ "$metro_down_since" -eq 0 ]; then
      metro_down_since=$now
      metro_healthy_since=0
    fi
    metro_uptime=$((now - BOOT_TS))
    if [ "$metro_uptime" -lt "$METRO_GRACE_SECS" ]; then
      log "METRO non ancora attivo — in grace window (${metro_uptime}s/${METRO_GRACE_SECS}s), nessun restart"
    else
      time_since_last_metro_restart=$((now - last_metro_restart))
      if [ "$time_since_last_metro_restart" -ge "$METRO_RESTART_COOLDOWN" ]; then
        if [ "$METRO_BACKOFF_UNTIL" -gt "$now" ]; then
          remaining=$((METRO_BACKOFF_UNTIL - now))
          log "METRO GIU': crash loop backoff attivo — attendo ancora ${remaining}s"
        else
          if [ "$metro_crash_session_counted" -eq 0 ]; then
            metro_crash_session_counted=1
            if ! record_metro_crash_session "$now"; then
              log "METRO GIU': backoff appena attivato — skip restart questo ciclo"
              last_metro_restart=$now
              sleep "$CHECK_INTERVAL"
              continue
            fi
          fi
          restart_metro
          last_metro_restart=$now
        fi
      else
        log "METRO ANCORA GIU': prossimo tentativo di riavvio tra $((METRO_RESTART_COOLDOWN - time_since_last_metro_restart))s"
      fi
    fi
  fi

  # ── Health check & log rotation ────────────────────────────────────────────
  if [ $((now - last_health_check)) -ge "$HEALTH_CHECK_INTERVAL" ]; then
    health_check
    last_health_check=$now
  fi

  check_count=$((check_count + 1))
  if [ $((check_count % 60)) -eq 0 ]; then
    rotate_log
  fi

  sleep "$CHECK_INTERVAL"
done

log "WATCHDOG: arresto completato."
