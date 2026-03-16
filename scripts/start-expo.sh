#!/bin/bash

PORT=8081
BACKEND_PORT=5000
MAX_RETRIES=3
BACKEND_WAIT_SECONDS=120

kill_port() {
  pkill -9 -f "metro" 2>/dev/null || true
  pkill -9 -f "expo start" 2>/dev/null || true
  pkill -9 -f "react-native start" 2>/dev/null || true
  pkill -9 -f "node.*8081" 2>/dev/null || true
  lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
  fuser -k -9 ${PORT}/tcp 2>/dev/null || true

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

  PIDS=$(lsof -ti:$PORT 2>/dev/null)
  if [ -n "$PIDS" ]; then
    echo "Porta $PORT ancora occupata da PID: $PIDS, riprovo..."
    continue
  fi

  echo "Porta $PORT libera, avvio Metro..."
  npm run expo:dev &
  METRO_PID=$!

  sleep 8

  if kill -0 $METRO_PID 2>/dev/null; then
    echo "Metro avviato con successo (PID: $METRO_PID)"
    wait $METRO_PID
    EXIT_CODE=$?
    echo "Metro terminato con codice: $EXIT_CODE"
    if [ $EXIT_CODE -eq 137 ] || [ $EXIT_CODE -eq 143 ]; then
      echo "Metro fermato dal sistema (signal kill/term), uscita pulita."
      exit 0
    fi
    if [ $retry -lt $MAX_RETRIES ]; then
      echo "Riavvio in corso..."
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
