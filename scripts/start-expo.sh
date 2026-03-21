#!/bin/bash

PORT=8081
BACKEND_PORT=5000
MAX_RETRIES=3
BACKEND_WAIT_SECONDS=120
FLOCK_FILE="/tmp/start-expo.flock"
LOCK_FILE="/tmp/start-expo.lock"
PID_FILE="/tmp/metro.pid"
PREWARM_PID=0

# ── Lock atomico con flock (kernel-level, nessuna race condition) ──────────────
exec 9>>"$FLOCK_FILE"
if ! flock -n 9; then
  echo "Un'altra istanza di start-expo.sh e' gia' in esecuzione. Uscita."
  exit 0
fi

# Scrivi il PID per compatibilita' con Watchdog (che controlla kill -0 sul PID)
echo $$ > "$LOCK_FILE"

cleanup() {
  rm -f "$LOCK_FILE"
  if [ "$PREWARM_PID" -gt 0 ]; then
    kill "$PREWARM_PID" 2>/dev/null || true
  fi
  # Il flock viene rilasciato automaticamente alla chiusura del fd 9 (quando bash esce)
}
trap cleanup EXIT

# ── Configurazione Node.js ─────────────────────────────────────────────────────
# cgroup limit: 8192MB. maxWorkers=1 (metro.config.js) = 2 processi Node totali.
# 2 x 1024MB = 2048MB per Metro + ~3GB backend+OS = ~5GB < 8GB limite cgroup.
export NODE_OPTIONS="--max-old-space-size=1024"

# ── Funzioni di utilita' ────────────────────────────────────────────────────────

# Usato durante l'avvio (breve timeout).
port_is_open() {
  curl -s --max-time 2 --connect-timeout 1 -o /dev/null "http://localhost:$1/" 2>/dev/null
}

# Usato durante il monitoring: timeout lungo (60s) perche' Metro puo' essere
# impegnato nella compilazione del bundle Android (~28s per 1635 moduli) e
# non rispondere immediatamente. Se Metro e' morto, curl riceve connection
# refused istantaneamente (non aspetta il timeout).
port_is_alive() {
  curl -s --max-time 60 --connect-timeout 3 -o /dev/null "http://localhost:$1/" 2>/dev/null
}

kill_port() {
  echo "Killing processi su porta $PORT..."
  fuser -k -9 ${PORT}/tcp 2>/dev/null || true
  lsof -ti:${PORT} 2>/dev/null | xargs kill -9 2>/dev/null || true
  pkill -9 -f "expo start --localhost" 2>/dev/null || true
  pkill -9 -f "node_modules/.bin/expo" 2>/dev/null || true
  pkill -9 -f "node_modules/expo/build/cli" 2>/dev/null || true
  pkill -9 -f "@expo/cli" 2>/dev/null || true

  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$OLD_PID" ]; then
      kill -9 "$OLD_PID" 2>/dev/null || true
      pkill -9 -P "$OLD_PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi

  for i in $(seq 1 20); do
    if ! port_is_open $PORT; then
      echo "Porta $PORT libera dopo ${i}s"
      return 0
    fi
    if [ $((i % 3)) -eq 0 ]; then
      fuser -k -9 ${PORT}/tcp 2>/dev/null || true
    fi
    sleep 1
  done
  echo "Attenzione: porta $PORT ancora occupata dopo 20s"
}

wait_for_backend() {
  echo "Attendo che il backend sia pronto sulla porta $BACKEND_PORT..."
  for i in $(seq 1 $BACKEND_WAIT_SECONDS); do
    if curl -s --max-time 1 "http://localhost:$BACKEND_PORT/api/auth/me" >/dev/null 2>&1; then
      echo "Backend pronto dopo ${i}s."
      return 0
    fi
    if [ $((i % 10)) -eq 0 ]; then
      echo "  ...ancora in attesa del backend (${i}s / ${BACKEND_WAIT_SECONDS}s)..."
    fi
    sleep 1
  done
  echo "Attenzione: backend non risponde dopo ${BACKEND_WAIT_SECONDS}s, avvio Metro comunque."
}

# ── Pre-warm bundle in background (fire-and-forget) ───────────────────────────
# Avvia la compilazione del bundle Android PRIMA che Expo Go si connetta.
# Gira in background in parallelo con il monitoring loop.
# Una volta compilato, Metro lo mette in cache su disco: le connessioni
# successive di Expo Go ricevono il bundle in pochi secondi.
start_prewarm() {
  local log_file="$1"
  local BUNDLE_BASE="http://localhost:${PORT}/node_modules/expo-router/entry.bundle"
  local BUNDLE_PARAMS="dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable"

  echo "Pre-warm bundle Android avviato in background (max 300s)..." | tee -a "$log_file"
  (
    PW_START=$(date +%s)
    curl -s --max-time 300 --connect-timeout 10 \
      -o /dev/null \
      "${BUNDLE_BASE}?platform=android&${BUNDLE_PARAMS}" 2>/dev/null
    EXIT_CODE=$?
    PW_END=$(date +%s)
    PW_ELAPSED=$((PW_END - PW_START))
    if [ "$EXIT_CODE" -eq 0 ]; then
      echo "Pre-warm bundle completato in ${PW_ELAPSED}s — Expo Go servira' dalla cache" >> "$log_file"
    else
      echo "Pre-warm bundle terminato (exit ${EXIT_CODE}) dopo ${PW_ELAPSED}s" >> "$log_file"
    fi
  ) &
  PREWARM_PID=$!
}

wait_for_backend

SESSION_TS=$(date +%Y%m%d-%H%M%S)

for retry in $(seq 1 $MAX_RETRIES); do
  LOG_FILE="/tmp/metro-opt-cycle${retry}-${SESSION_TS}.log"
  echo "=== Tentativo $retry/$MAX_RETRIES ===" | tee -a "$LOG_FILE"
  echo "Log ciclo: $LOG_FILE"
  echo "NODE_OPTIONS: $NODE_OPTIONS" | tee -a "$LOG_FILE"
  echo "Orario avvio: $(date)" | tee -a "$LOG_FILE"

  # Ferma un eventuale pre-warm precedente prima del retry
  if [ "$PREWARM_PID" -gt 0 ]; then
    kill "$PREWARM_PID" 2>/dev/null || true
  fi
  PREWARM_PID=0

  METRO_STARTED=0
  METRO_PID=0

  # Se Metro e' gia' attivo su porta $PORT, adottalo senza ucciderlo
  if port_is_open $PORT; then
    echo "Metro gia' attivo su porta $PORT — adotto senza restart" | tee -a "$LOG_FILE"
    METRO_STARTED=1
  else
    echo "Pulizia porta $PORT..." | tee -a "$LOG_FILE"
    kill_port

    if port_is_open $PORT; then
      echo "Porta $PORT ancora occupata dopo kill completo, salto tentativo $retry" | tee -a "$LOG_FILE"
      if [ $retry -lt $MAX_RETRIES ]; then
        sleep 3
      fi
      continue
    fi

    echo "Porta $PORT libera, avvio Metro..." | tee -a "$LOG_FILE"
    START_TIME=$(date +%s)
    npm run expo:dev >> "$LOG_FILE" 2>&1 &
    METRO_PID=$!
    echo $METRO_PID > "$PID_FILE"

    # Aspetta fino a 300s che Metro binds su porta 8081
    echo "Attendo che Metro si avvii sulla porta $PORT (max 300s)..." | tee -a "$LOG_FILE"
    for i in $(seq 1 300); do
      if port_is_open $PORT; then
        END_TIME=$(date +%s)
        ELAPSED=$((END_TIME - START_TIME))
        echo "Metro avviato con successo sulla porta $PORT dopo ${ELAPSED}s" | tee -a "$LOG_FILE"
        METRO_STARTED=1
        break
      fi
      # npm e' uscito (launcher): aspetta fino a 120s che il processo Metro orphan apra la porta
      if ! kill -0 $METRO_PID 2>/dev/null; then
        echo "npm (PID $METRO_PID) uscito al secondo $i, attendo 120s per il processo Metro..." | tee -a "$LOG_FILE"
        for j in $(seq 1 120); do
          if port_is_open $PORT; then
            END_TIME=$(date +%s)
            ELAPSED=$((END_TIME - START_TIME))
            echo "Metro avviato (come processo orphan) dopo ${ELAPSED}s" | tee -a "$LOG_FILE"
            METRO_STARTED=1
            break
          fi
          sleep 1
        done
        break
      fi
      if [ $((i % 30)) -eq 0 ]; then
        echo "  ...ancora in attesa di Metro (${i}s / 300s)..." | tee -a "$LOG_FILE"
      fi
      sleep 1
    done
  fi

  if [ $METRO_STARTED -eq 1 ]; then
    # ── Avvia pre-warm in background, poi entra nel monitoring loop ──────────
    # Il pre-warm gira in parallelo: Metro resta disponibile durante la
    # compilazione. Il monitoring usa port_is_alive (timeout 8s) per evitare
    # falsi positivi quando Metro e' impegnato nella compilazione del bundle.
    start_prewarm "$LOG_FILE"

    echo "Metro in esecuzione, monitoraggio porta $PORT..." | tee -a "$LOG_FILE"
    while true; do
      sleep 15
      if ! port_is_alive $PORT; then
        echo "Metro giu': porta $PORT non risponde — $(date)" | tee -a "$LOG_FILE"
        if [ "$PREWARM_PID" -gt 0 ]; then
          kill "$PREWARM_PID" 2>/dev/null || true
        fi
        PREWARM_PID=0
        break
      fi
    done
    echo "Metro terminato su porta $PORT" | tee -a "$LOG_FILE"
    if [ $METRO_PID -ne 0 ]; then
      kill $METRO_PID 2>/dev/null || true
    fi
    if [ $retry -lt $MAX_RETRIES ]; then
      echo "Riavvio in corso..." | tee -a "$LOG_FILE"
      sleep 5
    fi
  else
    echo "Metro crashato al tentativo $retry — $(date)" | tee -a "$LOG_FILE"
    if [ $METRO_PID -ne 0 ]; then
      kill $METRO_PID 2>/dev/null || true
    fi
    if [ $retry -lt $MAX_RETRIES ]; then
      echo "Riprovo tra 5 secondi..." | tee -a "$LOG_FILE"
      sleep 5
    fi
  fi
done

echo "ERRORE: impossibile avviare Metro dopo $MAX_RETRIES tentativi"
exit 1
