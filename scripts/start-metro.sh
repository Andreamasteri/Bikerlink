#!/bin/bash
PORT=8081
HEX_PORT=$(printf '%04X' $PORT)

echo "=== Cleaning up port $PORT ==="

pkill -9 -f "expo start" 2>/dev/null
pkill -9 -f "npx expo" 2>/dev/null
pkill -9 -f "npm exec expo" 2>/dev/null

sleep 3

for i in $(seq 1 15); do
  LISTEN=$(grep ":${HEX_PORT} " /proc/net/tcp6 2>/dev/null | grep " 0A " | wc -l)
  if [ "$LISTEN" -eq 0 ]; then
    echo "Port $PORT is free (attempt $i)"
    break
  fi
  echo "Port $PORT still in use (LISTEN), killing again... (attempt $i/15)"
  pkill -9 -f "expo start" 2>/dev/null
  pkill -9 -f "npx expo" 2>/dev/null
  sleep 2
done

sleep 2

echo "Starting Metro on port $PORT..."
exec npx expo start --localhost --port $PORT
