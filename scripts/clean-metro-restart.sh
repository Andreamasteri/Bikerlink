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
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
METRO_PORT=8081
METRO_LOCK_FILE="/tmp/start-metro.lock"
METRO_CACHE_KEY_FILE="/tmp/.metro-cache-key"
# FORCE_RESET=1 → pulizia profonda + expo --reset-cache (lento, ~minuti).
# Default (0) → fast clean: solo .expo/ e .metro-cache/ (~3s), riuso cache Metro
# → la porta 8081 si apre in fretta e il workflow non scade in DIDNT_OPEN_A_PORT.
FORCE_RESET="${FORCE_RESET:-0}"

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

# Restituisce 0 (true) se la porta Metro risponde già (Metro su e funzionante).
# Stesso metodo usato da watchdog/start.sh (curl, fallback nc).
metro_port_healthy() {
  curl -s --max-time 2 "http://localhost:$METRO_PORT" >/dev/null 2>&1 || \
  nc -z -w2 localhost "$METRO_PORT" >/dev/null 2>&1
}

log "=== Clean Metro: avvio pulizia on-demand ==="

# Gate anti-race: saltare SOLO se un avvio è davvero in corso E la porta non è
# ancora pronta (cold boot, start-expo sta avviando Metro). Nota: start-expo.sh
# resta vivo e tiene il lock per tutta la vita di Metro, quindi metro_starting
# è vero anche a regime — da solo bloccherebbe ogni clean manuale. La porta sana
# distingue "avvio in corso" (porta giù → skip) da "Metro già su" (porta su →
# clean+restart manuale legittimo).
if metro_starting && ! metro_port_healthy; then
  log "skip — avvio in corso e porta $METRO_PORT non ancora pronta. Riprova tra qualche secondo."
  exit 0
fi

log "Terminazione Metro in ascolto su porta $METRO_PORT..."
lsof -ti:"$METRO_PORT" 2>/dev/null | xargs -r kill -TERM 2>/dev/null || true
sleep 2
lsof -ti:"$METRO_PORT" 2>/dev/null | xargs -r kill -KILL 2>/dev/null || true

if [ "$FORCE_RESET" = "1" ]; then
  # Reset completo: pulizia profonda + invalidazione della cache key così che
  # start-expo.sh esegua `expo start --reset-cache`. Più lento, ma azzera tutto.
  log "FORCE_RESET=1 — pulizia profonda + reset cache Metro completo..."
  bash "$SCRIPT_DIR/clean-metro.sh"
  rm -f "$METRO_CACHE_KEY_FILE"
else
  # Fast clean (default): solo .expo/ (preservando types/) e .metro-cache/.
  # NON tocca la cache transformer in node_modules/.cache → start-expo riusa la
  # cache (nessun --reset-cache) e la porta 8081 si apre in pochi secondi.
  log "Fast clean (default) — solo .expo/ e .metro-cache/. Usa FORCE_RESET=1 per il reset completo."
  if [ -d "$PROJECT_ROOT/.expo" ]; then
    if [ -d "$PROJECT_ROOT/.expo/types" ]; then
      cp -r "$PROJECT_ROOT/.expo/types" /tmp/_expo_types_backup 2>/dev/null || true
    fi
    rm -rf "$PROJECT_ROOT/.expo"
    if [ -d /tmp/_expo_types_backup ]; then
      mkdir -p "$PROJECT_ROOT/.expo/types"
      cp -r /tmp/_expo_types_backup/. "$PROJECT_ROOT/.expo/types/" 2>/dev/null || true
      rm -rf /tmp/_expo_types_backup "$PROJECT_ROOT/.expo/types/types"
    fi
    log "  [OK]   .expo/ (router.d.ts preservato)"
  fi
  rm -rf "$PROJECT_ROOT/.metro-cache"
  log "  [OK]   .metro-cache/"
fi

log "Riavvio dev server Expo..."
exec bash "$SCRIPT_DIR/start-expo.sh"
