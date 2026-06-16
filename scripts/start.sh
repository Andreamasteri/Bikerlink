#!/bin/bash
# start.sh — Orchestratore BikerLink.
# Sequenza: [1/4] build → [2/4] backend + frontend in parallelo → [3/4] health check → [4/4] verifica Metro vivo → done
# Metro parte subito dopo il backend, senza attendere il health check: riduce il blackout totale.
# EXPO_PID è catturato al lancio di start-expo.sh; check_metro_alive() verifica che sia ancora
# vivo ogni ~10 tentativi di health check e obbligatoriamente prima di dichiarare "Avvio completato".

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TOTAL_START=$(date +%s)

log() {
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] $1"
}

elapsed_since() {
  echo $(( $(date +%s) - $1 ))
}

fail() {
  local step=$1
  local msg=$2
  local elapsed=$(elapsed_since $TOTAL_START)
  log "[FAILED at step $step: $msg] — ${elapsed}s dall'avvio"
  exit 1
}

cd "$PROJECT_ROOT"

# ── Step 1/4: Build server ────────────────────────────────────────────────────
STEP_START=$(date +%s)
log "[1/4] Build server — avvio..."
if ! bash "$SCRIPT_DIR/build-server.sh"; then
  fail "1/4" "build-server.sh fallito"
fi
log "[1/4] Build server — completato in $(elapsed_since $STEP_START)s"

# ── Step 2/4: Avvio backend + frontend in parallelo ───────────────────────────
STEP_START=$(date +%s)
log "[2/4] Avvio backend — avvio..."
bash "$SCRIPT_DIR/start-backend.sh" &
BACKEND_PID=$!
log "[2/4] Backend avviato in background (PID: $BACKEND_PID)"

# Metro parte subito in background: non aspettiamo il health check.
# Metro è progettato per gestire una finestra senza backend disponibile.
log "[2/4] Avvio frontend (Metro/Expo) in parallelo..."
bash "$SCRIPT_DIR/start-expo.sh" &
EXPO_PID=$!
log "[2/4] Frontend avviato in background (PID: $EXPO_PID)"

# ── Step 3/4: Health check polling ───────────────────────────────────────────
STEP_START=$(date +%s)
log "[3/4] Health check polling su /api/health — inizio..."

HEALTH_URL="http://localhost:5000/api/health"
MAX_HEALTH_SECS=120
ATTEMPT=0
HEALTHY=0

# Backoff aggressivo: 300ms → 500ms → 1s fisso
# Max 120s per attendere anche il completamento del boot (seed, engine, scheduler)
DELAYS=(0.3 0.5 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1)

# Helper: controlla che Metro (EXPO_PID) sia ancora vivo; in caso contrario fail esplicito.
check_metro_alive() {
  if [ -n "${EXPO_PID:-}" ] && ! kill -0 "$EXPO_PID" 2>/dev/null; then
    # Il processo è già terminato: wait ne recupera l'exit code (ritorna subito).
    wait "$EXPO_PID" 2>/dev/null; local EXPO_EXIT=$?
    fail "2/4" "Metro/Expo (PID $EXPO_PID) è terminato durante il boot (exit code: $EXPO_EXIT)"
  fi
}

while [ $ATTEMPT -lt ${#DELAYS[@]} ]; do
  DELAY=${DELAYS[$ATTEMPT]}
  sleep "$DELAY"

  ELAPSED=$(elapsed_since $STEP_START)
  if [ "$ELAPSED" -ge "$MAX_HEALTH_SECS" ]; then
    break
  fi

  # Ogni ~10 tentativi controlla che Metro non sia già crashato durante il boot.
  if [ $(( ATTEMPT % 10 )) -eq 0 ] && [ "$ATTEMPT" -gt 0 ]; then
    check_metro_alive
  fi

  # Controlla sia lo status HTTP (deve essere 200) sia il body (status:ok, initializing:false)
  HTTP_CODE=$(curl -s -o /tmp/health_body.txt -w "%{http_code}" --max-time 3 "$HEALTH_URL" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ] && grep -q '"status":"ok"' /tmp/health_body.txt 2>/dev/null; then
    HEALTHY=1
    break
  fi

  ATTEMPT=$((ATTEMPT + 1))
done

if [ "$HEALTHY" -ne 1 ]; then
  fail "3/4" "backend non è healthy (HTTP 200 + status:ok) dopo ${MAX_HEALTH_SECS}s"
fi

log "[3/4] Backend healthy in $(elapsed_since $STEP_START)s"

# ── Step 4/4: Verifica finale che Metro sia ancora vivo ───────────────────────
# Prima di dichiarare l'avvio completato, verifica che il PID di Metro (EXPO_PID)
# sia ancora attivo. Se è crashato durante il boot del backend (es. porta già in
# uso, errore Node, dipendenza mancante), il messaggio di errore include l'exit
# code per rendere il debug immediato.
check_metro_alive
log "[4/4] Metro (PID $EXPO_PID) attivo — OK"

TOTAL_ELAPSED=$(elapsed_since $TOTAL_START)
log "=== Avvio completato in ${TOTAL_ELAPSED}s (Metro in parallelo su porta 8081) ==="

# Mantieni lo script attivo per propagare i segnali
wait
