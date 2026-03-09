#!/bin/bash

echo "=== Massacro processi zombie sulla porta 8081 ==="

pkill -9 -f "metro" 2>/dev/null || true
pkill -9 -f "expo start" 2>/dev/null || true
pkill -9 -f "react-native start" 2>/dev/null || true
sleep 1

for attempt in 1 2 3 4 5; do
  PIDS=$(lsof -ti:8081 2>/dev/null)
  if [ -z "$PIDS" ]; then
    echo "Porta 8081 libera (tentativo $attempt)"
    break
  fi

  echo "Porta 8081 occupata da PID: $PIDS - killing... (tentativo $attempt/5)"
  echo "$PIDS" | xargs kill -9 2>/dev/null || true
  fuser -k -9 8081/tcp 2>/dev/null || true
  sleep 2
done

PIDS=$(lsof -ti:8081 2>/dev/null)
if [ -n "$PIDS" ]; then
  echo "ERRORE: impossibile liberare la porta 8081 dopo 5 tentativi"
  echo "Processi rimasti:"
  lsof -i:8081 2>/dev/null
  exit 1
fi

echo "=== Avvio Metro ==="
exec npm run expo:dev
