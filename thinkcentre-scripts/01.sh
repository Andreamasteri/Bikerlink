#!/usr/bin/env bash
# 01 — monitor CPU e RAM (aggiorna ogni 2 secondi, Ctrl+C per uscire)
set -euo pipefail

echo "=== Monitor CPU + RAM — aggiorna ogni 2s (Ctrl+C per uscire) ==="
echo ""

while true; do
  clear
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') ==="
  echo ""

  echo "--- MEMORIA ---"
  free -h
  echo ""

  echo "--- CPU (top processi) ---"
  top -bn1 | head -20

  echo ""
  echo "--- DISCO ---"
  df -h / ~/valhalla/data 2>/dev/null || df -h /

  sleep 2
done
