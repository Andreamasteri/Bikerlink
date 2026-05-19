#!/bin/bash
# start-expo.sh — Avvia il dev server Expo con pulizia profonda Metro preventiva.
# Esegue clean-metro.sh prima di lanciare expo start --reset-cache,
# garantendo che ogni avvio parta da uno stato completamente pulito.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Avvio frontend — pulizia Metro in corso..."

bash "$SCRIPT_DIR/clean-metro.sh"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Avvio Expo dev server..."
cd "$PROJECT_ROOT"
exec npx expo start --reset-cache
