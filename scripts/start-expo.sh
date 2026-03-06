#!/bin/bash

echo "=== Massacro processi zombie sulla porta 8081 ==="

for attempt in 1 2 3; do
  fuser -k -9 8081/tcp 2>/dev/null || true
  pkill -9 -f "expo start|metro|react-native start" 2>/dev/null || true
  lsof -ti:8081 2>/dev/null | xargs kill -9 2>/dev/null || true

  sleep 1

  if ! fuser 8081/tcp 2>/dev/null; then
    echo "Porta 8081 libera (tentativo $attempt)"
    break
  fi

  echo "Porta 8081 ancora occupata, ritento... ($attempt/3)"
  sleep 2
done

if fuser 8081/tcp 2>/dev/null; then
  echo "ERRORE: impossibile liberare la porta 8081 dopo 3 tentativi"
  fuser -v 8081/tcp 2>/dev/null
  exit 1
fi

echo "=== Avvio Metro ==="
exec npm run expo:dev
