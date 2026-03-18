#!/bin/bash

PORT=8081
BACKEND_PORT=5000
MAX_RETRIES=3
BACKEND_WAIT_SECONDS=120
LOCK_FILE="/tmp/start-expo.lock"
PID_FILE="/tmp/metro.pid"

cleanup() {
  rm -f "$LOCK_FILE"
}
trap cleanup EXIT

if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
  if kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "Un'altra istanza di start-expo.sh è già in esecuzione (PID: $LOCK_PID). Uscita."
    exit 0
  else
    echo "Lock file obsoleto trovato, continuo."
    rm -f "$LOCK_FILE"
  fi
fi

echo $$ > "$LOCK_FILE"

kill_port() {
  # Kill only the process listening on port 8081, not all metro globally
  local pid_on_port
  pid_on_port=$(lsof -ti:$PORT 2>/dev/null)
  if [ -n "$pid_on_port" ]; then
    echo "Terminating PID(s) on port $PORT: $pid_on_port"
    echo "$pid_on_port" | xargs kill -15 2>/dev/null || true
    sleep 3
    # Force kill if still running
    pid_on_port=$(lsof -ti:$PORT 2>/dev/null)
    if [ -n "$pid_on_port" ]; then
      echo "$pid_on_port" | xargs kill -9 2>/dev/null || true
    fi
  fi

  # Also kill any previous Metro PID we know about
  if [ -f "$PID_FILE" ]; then
    OLD_METRO_PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$OLD_METRO_PID" ] && kill -0 "$OLD_METRO_PID" 2>/dev/null; then
      kill -9 "$OLD_METRO_PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi

  for i in $(seq 1 10); do
    if ! lsof -ti:$PORT >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Attenzione: porta $PORT ancora occupata dopo 10s"
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

wait_for_backend

for retry in $(seq 1 $MAX_RETRIES); do
  echo "=== Tentativo $retry/$MAX_RETRIES ==="
  echo "Pulizia porta $PORT..."
  kill_port
  sleep 2

  PIDS=$(lsof -ti:$PORT 2>/dev/null)
  if [ -n "$PIDS" ]; then
    echo "Porta $PORT ancora occupata da PID: $PIDS, riprovo..."
    continue
  fi

  echo "Porta $PORT libera, avvio Metro..."
  npm run expo:dev &
  METRO_PID=$!
  echo $METRO_PID > "$PID_FILE"

  # Wait up to 60s for Metro to actually bind to port 8081
  echo "Attendo che Metro si avvii sulla porta $PORT (max 60s)..."
  for i in $(seq 1 60); do
    if ! kill -0 $METRO_PID 2>/dev/null; then
      echo "Metro (PID $METRO_PID) è terminato durante l'avvio al secondo $i"
      break
    fi
    if lsof -ti:$PORT >/dev/null 2>&1; then
      echo "Metro avviato con successo (PID: $METRO_PID) dopo ${i}s"
      break
    fi
    sleep 1
  done

  if kill -0 $METRO_PID 2>/dev/null; then
    echo "Metro in esecuzione, attendo..."
    wait $METRO_PID
    EXIT_CODE=$?
    echo "Metro terminato con codice: $EXIT_CODE"
    if [ $EXIT_CODE -eq 137 ] || [ $EXIT_CODE -eq 143 ]; then
      echo "Metro fermato dal sistema (signal kill/term), uscita pulita."
      exit 0
    fi
    if [ $retry -lt $MAX_RETRIES ]; then
      echo "Riavvio in corso..."
      sleep 3
      continue
    fi
    exit $EXIT_CODE
  else
    echo "Metro crashato al tentativo $retry"
    if [ $retry -lt $MAX_RETRIES ]; then
      echo "Riprovo tra 3 secondi..."
      sleep 3
    fi
  fi
done

echo "ERRORE: impossibile avviare Metro dopo $MAX_RETRIES tentativi"
exit 1
