#!/bin/bash

PORT=5000
MAX_RETRIES=3

kill_port() {
  pkill -9 -f "tsx server" 2>/dev/null || true
  pkill -9 -f "node.*server" 2>/dev/null || true
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

echo "Fermando Metro/Expo per liberare RAM prima della compilazione..."
pkill -f "expo start" 2>/dev/null || true
pkill -f "react-native start" 2>/dev/null || true
pkill -f "metro" 2>/dev/null || true
lsof -ti:8081 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 3
echo "Processi Metro terminati. Avvio compilazione esbuild..."

BUILD_MAX_RETRIES=3
BUILD_OK=0
for build_try in $(seq 1 $BUILD_MAX_RETRIES); do
  echo "Compilazione TypeScript server (tentativo $build_try/$BUILD_MAX_RETRIES)..."
  npm run server:build
  if [ $? -eq 0 ]; then
    BUILD_OK=1
    break
  fi
  echo "Compilazione fallita al tentativo $build_try"
  if [ $build_try -lt $BUILD_MAX_RETRIES ]; then
    echo "Attendo 5 secondi per liberare RAM prima di riprovare..."
    sleep 5
  fi
done
if [ $BUILD_OK -ne 1 ]; then
  echo "ERRORE: compilazione server fallita dopo $BUILD_MAX_RETRIES tentativi"
  exit 1
fi
echo "Compilazione completata."

for retry in $(seq 1 $MAX_RETRIES); do
  echo "=== Tentativo $retry/$MAX_RETRIES ==="
  echo "Pulizia porta $PORT..."
  kill_port

  PIDS=$(lsof -ti:$PORT 2>/dev/null)
  if [ -n "$PIDS" ]; then
    echo "Porta $PORT ancora occupata da PID: $PIDS, riprovo..."
    continue
  fi

  echo "Porta $PORT libera, avvio backend..."
  NODE_ENV=production node server_dist/index.js &
  SERVER_PID=$!

  sleep 5

  if kill -0 $SERVER_PID 2>/dev/null; then
    echo "Backend avviato con successo (PID: $SERVER_PID)"
    wait $SERVER_PID
    EXIT_CODE=$?
    echo "Backend terminato con codice: $EXIT_CODE"
    if [ $EXIT_CODE -eq 137 ] || [ $EXIT_CODE -eq 143 ]; then
      echo "Backend fermato dal sistema (signal kill/term), uscita pulita."
      exit 0
    fi
    if [ $retry -lt $MAX_RETRIES ]; then
      echo "Riavvio in corso..."
      continue
    fi
    exit $EXIT_CODE
  else
    echo "Backend crashato al tentativo $retry"
    if [ $retry -lt $MAX_RETRIES ]; then
      echo "Riprovo tra 3 secondi..."
      sleep 3
    fi
  fi
done

echo "ERRORE: impossibile avviare il backend dopo $MAX_RETRIES tentativi"
exit 1
