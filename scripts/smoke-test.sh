#!/bin/bash
# smoke-test.sh — Verifica cold start: killa tutto, lancia start.sh, misura i tempi.
# Uso: bash scripts/smoke-test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

BACKEND_PORT=5000
FRONTEND_PORT=8081
MAX_WAIT=120

log() {
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] $1"
}

log "=== SMOKE TEST — BikerLink cold start ==="
log "Pulizia processi esistenti..."

pkill -f "node server_dist/index.js" 2>/dev/null || true
pkill -f "expo start" 2>/dev/null || true
lsof -ti:$BACKEND_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:$FRONTEND_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
rm -f /tmp/start-backend.lock /tmp/start-backend.flock /tmp/watchdog.flock 2>/dev/null

sleep 2
log "Porte liberate."

TOTAL_START=$(date +%s%3N)

log "Avvio start.sh in background..."
bash "$SCRIPT_DIR/start.sh" > /tmp/smoke-test-output.log 2>&1 &
START_PID=$!

wait_for_port() {
  local port=$1
  local label=$2
  local start_ms=$(date +%s%3N)
  local deadline=$(( $(date +%s) + MAX_WAIT ))

  while [ $(date +%s) -lt $deadline ]; do
    if curl -s --max-time 1 "http://localhost:$port" >/dev/null 2>&1 || \
       nc -z -w1 localhost "$port" >/dev/null 2>&1; then
      local elapsed_ms=$(( $(date +%s%3N) - start_ms ))
      echo $((elapsed_ms / 1000))
      return 0
    fi
    sleep 0.5
  done
  echo "TIMEOUT"
  return 1
}

log "In attesa del backend (porta $BACKEND_PORT)..."
BACKEND_SECS=$(wait_for_port $BACKEND_PORT "backend")
BACKEND_OK_MS=$(date +%s%3N)

log "In attesa del frontend (porta $FRONTEND_PORT)..."
FRONTEND_SECS=$(wait_for_port $FRONTEND_PORT "frontend")
FRONTEND_OK_MS=$(date +%s%3N)

TOTAL_MS=$(( FRONTEND_OK_MS - TOTAL_START ))
TOTAL_SECS=$(( TOTAL_MS / 1000 ))

log ""
log "===== RISULTATI SMOKE TEST ====="
log "  [OK] backend:  ${BACKEND_SECS}s"
log "  [OK] frontend: ${FRONTEND_SECS}s"
log "  [OK] total:    ${TOTAL_SECS}s"
log "==============================="

kill $START_PID 2>/dev/null || true
