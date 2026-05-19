#!/bin/bash
# clean-metro-restart.sh — Pulizia on-demand della cache Metro + riavvio del dev server.
# Uso: eseguire dal workflow "Clean Metro" nel pannello Replit oppure
#      manualmente con: bash scripts/clean-metro-restart.sh
#
# Effetti:
#   1. Termina il processo Metro/Expo attivo (porta 8081)
#   2. Esegue clean-metro.sh per rimuovere tutta la cache
#   3. Riavvia il dev server tramite start-expo.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
METRO_PORT=8081

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "=== Clean Metro: avvio pulizia on-demand ==="

log "Terminazione Metro in ascolto su porta $METRO_PORT..."
lsof -ti:"$METRO_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
pkill -f "expo start" 2>/dev/null || true
pkill -f "react-native/cli" 2>/dev/null || true
sleep 2

log "Esecuzione pulizia profonda Metro..."
bash "$SCRIPT_DIR/clean-metro.sh"

log "Riavvio dev server Expo..."
exec bash "$SCRIPT_DIR/start-expo.sh"
