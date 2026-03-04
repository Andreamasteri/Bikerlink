#!/bin/bash
PORT=8081
HEX_PORT=$(printf '%04X' $PORT)

LISTEN=$(grep ":${HEX_PORT} " /proc/net/tcp6 2>/dev/null | grep " 0A " | wc -l)
if [ "$LISTEN" -gt 0 ]; then
  echo "Metro is already running on port $PORT. Exiting duplicate instance."
  while true; do sleep 3600; done
fi

pkill -9 -f "expo start" 2>/dev/null
sleep 2

for i in $(seq 1 10); do
  LISTEN=$(grep ":${HEX_PORT} " /proc/net/tcp6 2>/dev/null | grep " 0A " | wc -l)
  if [ "$LISTEN" -eq 0 ]; then
    echo "Port $PORT is free (attempt $i)"
    break
  fi
  echo "Port $PORT still in use, waiting... (attempt $i/10)"
  sleep 2
done

echo "Starting Metro on port $PORT..."
exec npx expo start --port $PORT
