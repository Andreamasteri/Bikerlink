#!/bin/bash

PORT=5000
echo "=== Pulizia processi sulla porta $PORT ==="

pkill -9 -f "tsx server/index" 2>/dev/null || true
pkill -9 -f "node.*server" 2>/dev/null || true
sleep 1

for attempt in 1 2 3 4 5; do
  PIDS=$(lsof -ti:$PORT 2>/dev/null)
  if [ -z "$PIDS" ]; then
    echo "Porta $PORT libera (tentativo $attempt)"
    break
  fi

  echo "Porta $PORT occupata da PID: $PIDS - killing... (tentativo $attempt/5)"
  echo "$PIDS" | xargs kill -9 2>/dev/null || true
  fuser -k -9 ${PORT}/tcp 2>/dev/null || true
  sleep 2
done

PIDS=$(lsof -ti:$PORT 2>/dev/null)
if [ -n "$PIDS" ]; then
  echo "ERRORE: impossibile liberare la porta $PORT dopo 5 tentativi"
  lsof -i:$PORT 2>/dev/null
  exit 1
fi

echo "=== Avvio Backend ==="
exec npm run server:dev
