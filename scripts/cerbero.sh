#!/bin/bash
# cerbero.sh — Cerbero, il guardiano a tre teste delle porte 5000 e 8081.
#
#   TESTA 1 — Backend (porta 5000): health via /api/health, restart mirato con
#             cooldown e counter crash PROPRI.
#   TESTA 2 — Metro (porta 8081): restart solo se davvero giù E nessun avvio in
#             corso, con cooldown e counter crash PROPRI (indipendenti dal backend).
#   TESTA 3 — Cancello (lock gate): cerbero_metro_starting() = lock tenuto OR
#             pgrep start-expo.sh → se vero, osserva senza toccare nulla.
#
# Caratteristiche: grace window 180s all'avvio (Metro), crash-loop backoff
# esponenziale con counter SEPARATI per backend e Metro (300/600/1200s), kill
# solo per porta-PID (mai per nome), single-instance via flock, log con rotazione.
#
# Sostituisce il vecchio watchdog. watchdog.sh è ora uno shim verso questo file.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# ── Configurazione ────────────────────────────────────────────────────────────
BACKEND_PORT=5000
METRO_PORT=8081
METRO_LOCK_FILE="/tmp/start-metro.lock"
CERBERO_LOG_FILE="$PROJECT_ROOT/logs/cerbero.log"
CERBERO_LOG_MAX_BYTES=1048576

CHECK_INTERVAL=10
HEALTH_LOG_INTERVAL=60
BACKEND_RESTART_COOLDOWN=60
METRO_RESTART_COOLDOWN=90
GRACE_SECS=180

MAX_CRASHES_IN_WINDOW=3
CRASH_WINDOW_SECS=300
BACKOFF_STEPS=(300 600 1200)

# Esporta le variabili lette dalla libreria, poi caricala.
export CERBERO_LOG_FILE CERBERO_LOG_MAX_BYTES METRO_LOCK_FILE BACKEND_PORT
mkdir -p "$(dirname "$CERBERO_LOG_FILE")"
# shellcheck source=scripts/cerbero-lib.sh
source "$SCRIPT_DIR/cerbero-lib.sh"
# Libreria diagnostica crash (sola osservazione — nessun side-effect su recovery).
# shellcheck source=scripts/metro-crash-diag.sh
source "$SCRIPT_DIR/metro-crash-diag.sh"

# ── Single instance (flock fd 9) ──────────────────────────────────────────────
exec 9>>"/tmp/cerbero.flock"
if ! flock -n 9; then
  cerbero_log "Altra istanza Cerbero già in esecuzione. Uscita."
  exit 0
fi

RUNNING=1
NIGHTLY_PID=""
graceful_shutdown() {
  cerbero_log "CERBERO: ricevuto segnale di arresto, uscita pulita..."
  RUNNING=0
  if [ -n "$NIGHTLY_PID" ] && kill -0 "$NIGHTLY_PID" 2>/dev/null; then
    kill -TERM "$NIGHTLY_PID" 2>/dev/null || true
  fi
}
trap graceful_shutdown SIGTERM SIGINT

# ── Job notturno pulizia .metro-cache/ ────────────────────────────────────────
# Lanciato una sola volta all'avvio di Cerbero. Il loop interno dorme fino alle
# 01:00 UTC ogni notte, cancella .metro-cache/ e scrive il flag
# /tmp/.metro-cache-purged che start-expo.sh legge al prossimo avvio.
# Deve vivere in Cerbero (non in start-expo.sh) per sopravvivere ai riavvii
# di Metro e girare indipendentemente dal ciclo di vita del dev server.
bash "$SCRIPT_DIR/metro-cache-nightly.sh" &
NIGHTLY_PID=$!
cerbero_log "Job notturno Metro cache avviato (PID: $NIGHTLY_PID)"

# ══ TESTA 1 — Backend: crash tracking + restart ═══════════════════════════════
declare -a BACKEND_CRASH_TIMES=()
BACKEND_BACKOFF_UNTIL=0
BACKEND_CRASH_SESSIONS=0
backend_healthy_since=0

record_backend_crash_session() {
  local now=$1
  local new_times=()
  for t in "${BACKEND_CRASH_TIMES[@]}"; do
    if [ $((now - t)) -lt $CRASH_WINDOW_SECS ]; then new_times+=("$t"); fi
  done
  BACKEND_CRASH_TIMES=("${new_times[@]}" "$now")

  local count=${#BACKEND_CRASH_TIMES[@]}
  if [ "$count" -ge "$MAX_CRASHES_IN_WINDOW" ]; then
    BACKEND_CRASH_SESSIONS=$((BACKEND_CRASH_SESSIONS + 1))
    local step=$((BACKEND_CRASH_SESSIONS - 1))
    local max_step=$(( ${#BACKOFF_STEPS[@]} - 1 ))
    [ "$step" -gt "$max_step" ] && step=$max_step
    local secs=${BACKOFF_STEPS[$step]}
    BACKEND_BACKOFF_UNTIL=$((now + secs))
    local until_str
    until_str=$(date -d "@$BACKEND_BACKOFF_UNTIL" '+%H:%M:%S' 2>/dev/null || echo "${secs}s da ora")
    cerbero_log "[TESTA 1] CRASH LOOP: $count crash in ${CRASH_WINDOW_SECS}s (sessione #${BACKEND_CRASH_SESSIONS}) — backoff ${secs}s fino alle $until_str"
    BACKEND_CRASH_TIMES=()
    return 1
  fi
  return 0
}

BACKEND_RESTART_LOCK="/tmp/cerbero-backend-restart.lock"

restart_backend() {
  cerbero_log "[TESTA 1] CRASH: backend (porta $BACKEND_PORT) irraggiungibile. Avvio riavvio..."

  # Lock atomico via mkdir per evitare doppio restart concorrente.
  if ! mkdir "$BACKEND_RESTART_LOCK" 2>/dev/null; then
    cerbero_log "[TESTA 1] restart già in corso, skip"
    return 0
  fi
  trap 'rmdir "$BACKEND_RESTART_LOCK" 2>/dev/null || true' RETURN

  local backend_lock="/tmp/start-backend.lock"
  if [ -f "$backend_lock" ]; then
    local lock_pid
    lock_pid=$(cat "$backend_lock" 2>/dev/null)
    if [ -z "$lock_pid" ] || ! [[ "$lock_pid" =~ ^[0-9]+$ ]]; then
      cerbero_log "[TESTA 1] start-backend in avvio (lock PID vuoto/non valido: '$lock_pid') — skip restart"
      return 0
    fi
    if kill -0 "$lock_pid" 2>/dev/null; then
      cerbero_log "[TESTA 1] start-backend già in esecuzione (PID: $lock_pid) — attendo"
      return 0
    fi
    if pgrep -f "bash .*scripts/start-backend.sh" >/dev/null 2>&1; then
      cerbero_log "[TESTA 1] start-backend.sh attivo (pgrep) — skip restart"
      return 0
    fi
    rm -f "$backend_lock"
  fi

  cerbero_log "[TESTA 1] RIAVVIO: start-backend.sh in background..."
  # Prefissa ogni riga di output di start-backend.sh (incluso l'stderr di Node.js,
  # es. ERR_STREAM_PREMATURE_CLOSE) con "[TESTA 1]" + timestamp per rendere i log
  # immediatamente attribuibili alla testa backend senza dover disambiguare.
  bash "$SCRIPT_DIR/start-backend.sh" 2>&1 | \
    while IFS= read -r _cerbero_be_line; do
      printf '[%s] [TESTA 1] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$_cerbero_be_line" >> "$CERBERO_LOG_FILE"
    done &
  cerbero_log "[TESTA 1] RIAVVIO avviato (pipeline PID: $!)"
}

# ══ TESTA 2 — Metro: crash tracking + restart ═════════════════════════════════
declare -a METRO_CRASH_TIMES=()
METRO_BACKOFF_UNTIL=0
METRO_CRASH_SESSIONS=0
metro_healthy_since=0

record_metro_crash_session() {
  local now=$1
  local new_times=()
  for t in "${METRO_CRASH_TIMES[@]}"; do
    if [ $((now - t)) -lt $CRASH_WINDOW_SECS ]; then new_times+=("$t"); fi
  done
  METRO_CRASH_TIMES=("${new_times[@]}" "$now")

  local count=${#METRO_CRASH_TIMES[@]}
  if [ "$count" -ge "$MAX_CRASHES_IN_WINDOW" ]; then
    METRO_CRASH_SESSIONS=$((METRO_CRASH_SESSIONS + 1))
    local step=$((METRO_CRASH_SESSIONS - 1))
    local max_step=$(( ${#BACKOFF_STEPS[@]} - 1 ))
    [ "$step" -gt "$max_step" ] && step=$max_step
    local secs=${BACKOFF_STEPS[$step]}
    METRO_BACKOFF_UNTIL=$((now + secs))
    local until_str
    until_str=$(date -d "@$METRO_BACKOFF_UNTIL" '+%H:%M:%S' 2>/dev/null || echo "${secs}s da ora")
    cerbero_log "[TESTA 2] CRASH LOOP: $count crash in ${CRASH_WINDOW_SECS}s (sessione #${METRO_CRASH_SESSIONS}) — backoff ${secs}s fino alle $until_str"
    METRO_CRASH_TIMES=()
    return 1
  fi
  return 0
}

restart_metro() {
  # Doppio cancello (TESTA 3) PRIMA di qualsiasi kill: se un avvio è in corso non
  # toccare nulla — un blind kill ucciderebbe il Metro in boot → exit 143 →
  # start.sh lo classifica come crash → loop.
  if cerbero_metro_starting; then
    cerbero_log "[TESTA 3] Metro in avvio (lock/start-expo attivo) — skip, nessun kill"
    return 0
  fi

  cerbero_log "[TESTA 2] CRASH: porta $METRO_PORT non risponde. Pulizia cache e riavvio..."

  # ── Snapshot diagnostico (sola osservazione, nessun side-effect) ────────────
  # Cattura PID/stato, memoria e OOM del kernel PRIMA di qualsiasi kill, così da
  # avere la fotografia del processo morente (o già scomparso).
  metro_diag_snapshot 2>/dev/null || true

  # Rimozione lock SOLO se davvero stale (finestra TOCTOU): riacquisiamo con
  # flock -n su fd 200; se riesce il lock NON è detenuto → stale → lo rimuoviamo
  # mentre lo teniamo; se fallisce qualcuno ha appena avviato Metro → bail.
  if [ -f "$METRO_LOCK_FILE" ]; then
    exec 200>>"$METRO_LOCK_FILE"
    if flock -n 200; then
      rm -f "$METRO_LOCK_FILE"
      flock -u 200 2>/dev/null || true
      exec 200>&-
    else
      exec 200>&-
      cerbero_log "[TESTA 3] lock acquisito durante il restart (avvio appena partito) — skip, nessun kill"
      return 0
    fi
  fi

  # Doppio controllo immediatamente prima del kill: restringe la finestra TOCTOU.
  if cerbero_metro_starting; then
    cerbero_log "[TESTA 3] avvio rilevato prima del kill — skip, nessun kill"
    return 0
  fi

  kill_port_pid "$METRO_PORT"

  cerbero_log "[TESTA 2] CLEAN: esecuzione clean-metro.sh prima del riavvio..."
  if bash "$SCRIPT_DIR/clean-metro.sh" >> "$CERBERO_LOG_FILE" 2>&1; then
    cerbero_log "[TESTA 2] CLEAN completata"
  else
    cerbero_log "[TESTA 2] CLEAN errore (continuo comunque con il riavvio)"
  fi

  cerbero_log "[TESTA 2] RIAVVIO: start-expo.sh in background..."
  # Prefissa ogni riga di output di start-expo.sh (incluso l'stderr di Metro,
  # es. OOM, bundler crash) con "[TESTA 2]" + timestamp per rendere i log
  # immediatamente attribuibili alla testa Metro senza dover disambiguare.
  bash "$SCRIPT_DIR/start-expo.sh" 2>&1 | \
    while IFS= read -r _cerbero_metro_line; do
      printf '[%s] [TESTA 2] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$_cerbero_metro_line" >> "$CERBERO_LOG_FILE"
    done &
  cerbero_log "[TESTA 2] RIAVVIO avviato (pipeline PID: $!)"
}

# ══ Avvio ═════════════════════════════════════════════════════════════════════
cerbero_log "========================================="
cerbero_log "CERBERO AVVIATO — guardiano a tre teste delle porte"
cerbero_log "  TESTA 1 Backend port: $BACKEND_PORT (health /api/health)"
cerbero_log "  TESTA 2 Metro port:   $METRO_PORT"
cerbero_log "  TESTA 3 Cancello: lock $METRO_LOCK_FILE + pgrep start-expo (kill mirati, no pkill cieco)"
cerbero_log "  Finestra di grazia avvio: ${GRACE_SECS}s (osserva, non riavvia Metro)"
cerbero_log "  Check interval: ${CHECK_INTERVAL}s — Health interval: ${HEALTH_LOG_INTERVAL}s"
cerbero_log "  Cooldown restart: backend ${BACKEND_RESTART_COOLDOWN}s / Metro ${METRO_RESTART_COOLDOWN}s"
cerbero_log "  Crash loop: max ${MAX_CRASHES_IN_WINDOW}/${CRASH_WINDOW_SECS}s → backoff ${BACKOFF_STEPS[*]}s (counter separati)"
cerbero_log "========================================="

last_health_log=0
check_count=0
BOOT_TS=$(date +%s)

last_backend_restart=0
backend_down_since=0
backend_crash_session_counted=0

last_metro_restart=0
metro_down_since=0
metro_crash_session_counted=0

while [ "$RUNNING" -eq 1 ]; do
  now=$(date +%s)

  # ── TESTA 1 — Backend ───────────────────────────────────────────────────────
  cerbero_health_backend
  backend_state=$?
  if [ "$backend_state" -ne 1 ]; then
    # Raggiungibile (pronto o in inizializzazione) → vivo, nessun restart.
    if [ "$backend_down_since" -gt 0 ]; then
      cerbero_log "[TESTA 1] BACKEND RECUPERATO: porta $BACKEND_PORT risponde di nuovo"
      backend_down_since=0
      backend_crash_session_counted=0
      backend_healthy_since=$now
    fi
    if [ "$backend_healthy_since" -gt 0 ] && [ $((now - backend_healthy_since)) -ge 600 ] && [ "$BACKEND_CRASH_SESSIONS" -gt 0 ]; then
      cerbero_log "[TESTA 1] BACKEND STABILE: 10+ min uptime — reset contatore crash (era $BACKEND_CRASH_SESSIONS)"
      BACKEND_CRASH_SESSIONS=0
    fi
  else
    # Irraggiungibile → da riavviare.
    if [ "$backend_down_since" -eq 0 ]; then
      backend_down_since=$now
      backend_healthy_since=0
    fi
    time_since_restart=$((now - last_backend_restart))
    if [ "$time_since_restart" -ge "$BACKEND_RESTART_COOLDOWN" ]; then
      if [ "$BACKEND_BACKOFF_UNTIL" -gt "$now" ]; then
        cerbero_log "[TESTA 1] BACKEND GIU': backoff attivo — attendo ancora $((BACKEND_BACKOFF_UNTIL - now))s"
      else
        if [ "$backend_crash_session_counted" -eq 0 ]; then
          backend_crash_session_counted=1
          if ! record_backend_crash_session "$now"; then
            cerbero_log "[TESTA 1] BACKEND GIU': backoff appena attivato — skip restart questo ciclo"
            last_backend_restart=$now
            sleep "$CHECK_INTERVAL"
            continue
          fi
        fi
        restart_backend
        last_backend_restart=$now
      fi
    else
      cerbero_log "[TESTA 1] BACKEND ANCORA GIU': prossimo tentativo tra $((BACKEND_RESTART_COOLDOWN - time_since_restart))s"
    fi
  fi

  # ── TESTA 2 + 3 — Metro ─────────────────────────────────────────────────────
  if cerbero_port_open "$METRO_PORT"; then
    if [ "$metro_down_since" -gt 0 ]; then
      cerbero_log "[TESTA 2] METRO RECUPERATO: porta $METRO_PORT risponde di nuovo"
      metro_down_since=0
      metro_crash_session_counted=0
      metro_healthy_since=$now
    fi
    if [ "$metro_healthy_since" -gt 0 ] && [ $((now - metro_healthy_since)) -ge 600 ] && [ "$METRO_CRASH_SESSIONS" -gt 0 ]; then
      cerbero_log "[TESTA 2] METRO STABILE: 10+ min uptime — reset contatore crash (era $METRO_CRASH_SESSIONS)"
      METRO_CRASH_SESSIONS=0
    fi
  elif cerbero_metro_starting; then
    # TESTA 3: avvio in corso → osserva, non toccare.
    cerbero_log "[TESTA 3] Metro in avvio — skip (lock/start-expo attivo)"
  else
    if [ "$metro_down_since" -eq 0 ]; then
      metro_down_since=$now
      metro_healthy_since=0
    fi
    metro_uptime=$((now - BOOT_TS))
    if [ "$metro_uptime" -lt "$GRACE_SECS" ]; then
      cerbero_log "[TESTA 2] METRO non ancora attivo — grace window (${metro_uptime}s/${GRACE_SECS}s), nessun restart"
    else
      time_since_restart=$((now - last_metro_restart))
      if [ "$time_since_restart" -ge "$METRO_RESTART_COOLDOWN" ]; then
        if [ "$METRO_BACKOFF_UNTIL" -gt "$now" ]; then
          cerbero_log "[TESTA 2] METRO GIU': backoff attivo — attendo ancora $((METRO_BACKOFF_UNTIL - now))s"
        else
          if [ "$metro_crash_session_counted" -eq 0 ]; then
            metro_crash_session_counted=1
            if ! record_metro_crash_session "$now"; then
              cerbero_log "[TESTA 2] METRO GIU': backoff appena attivato — skip restart questo ciclo"
              last_metro_restart=$now
              sleep "$CHECK_INTERVAL"
              continue
            fi
          fi
          restart_metro
          last_metro_restart=$now
        fi
      else
        cerbero_log "[TESTA 2] METRO ANCORA GIU': prossimo tentativo tra $((METRO_RESTART_COOLDOWN - time_since_restart))s"
      fi
    fi
  fi

  # ── Health log periodico + rotazione ────────────────────────────────────────
  if [ $((now - last_health_log)) -ge "$HEALTH_LOG_INTERVAL" ]; then
    case "$backend_state" in
      0) cerbero_log "[TESTA 1] HEALTH OK: /api/health risponde (status ok)." ;;
      2) cerbero_log "[TESTA 1] HEALTH: backend raggiungibile, in inizializzazione." ;;
      *) cerbero_log "[TESTA 1] HEALTH FAIL: /api/health irraggiungibile." ;;
    esac
    if cerbero_port_open "$METRO_PORT"; then
      cerbero_log "[TESTA 2] HEALTH OK: porta $METRO_PORT risponde."
    fi
    last_health_log=$now
  fi

  check_count=$((check_count + 1))
  if [ $((check_count % 60)) -eq 0 ]; then
    cerbero_rotate_log
  fi

  sleep "$CHECK_INTERVAL"
done

cerbero_log "CERBERO: arresto completato."
