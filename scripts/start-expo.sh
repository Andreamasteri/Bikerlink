#!/bin/bash

PORT=8081
MAX_RETRIES=3

kill_port() {
  pkill -9 -f "metro" 2>/dev/null || true
  pkill -9 -f "expo start" 2>/dev/null || true
  pkill -9 -f "react-native start" 2>/dev/null || true
  pkill -9 -f "node.*8081" 2>/dev/null || true
  lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
  fuser -k -9 ${PORT}/tcp 2>/dev/null || true
  sleep 3
}

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
