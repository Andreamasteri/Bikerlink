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
METRO_LOCK_FILE="/tmp/start-metro.lock"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Restituisce 0 (true) se un avvio Metro è in corso: processo start-expo.sh
# attivo OPPURE lock /tmp/start-metro.lock ancora detenuto. Identico al gate del
# watchdog. fd dedicato (200), MAI fd 9 di start-expo.sh; il lock viene solo
# sondato e rilasciato subito, mai detenuto né rimosso qui.
metro_starting() {
  if pgrep -f "scripts/start-expo.sh" >/dev/null 2>&1; then
    return 0
  fi
  if [ -f "$METRO_LOCK_FILE" ]; then
    exec 200>>"$METRO_LOCK_FILE"
    if ! flock -n 200; then
      exec 200>&-
      return 0
    fi
    flock -u 200 2>/dev/null || true
    exec 200>&-
  fi
  return 1
}

log "=== Clean Metro: avvio pulizia on-demand ==="

# On-demand: se un avvio è già in corso, uscire pulito senza interferire.
if metro_starting; then
  log "skip — avvio già in corso. Riprova tra qualche secondo."
  exit 0
fi

log "Terminazione Metro in ascolto su porta $METRO_PORT..."
lsof -ti:"$METRO_PORT" 2>/dev/null | xargs -r kill -TERM 2>/dev/null || true
sleep 2
lsof -ti:"$METRO_PORT" 2>/dev/null | xargs -r kill -KILL 2>/dev/null || true

log "Esecuzione pulizia profonda Metro..."
bash "$SCRIPT_DIR/clean-metro.sh"

log "Riavvio dev server Expo..."
exec bash "$SCRIPT_DIR/start-expo.sh"
