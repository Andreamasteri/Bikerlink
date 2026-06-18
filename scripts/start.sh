#!/bin/bash
# start.sh — Orchestratore BikerLink.
# Sequenza: [1/4] build → [2/4] backend + frontend in parallelo → [3/4] health check → [4/4] verifica Metro vivo → done
# Metro parte subito dopo il backend, senza attendere il health check: riduce il blackout totale.
# EXPO_PID è catturato al lancio di start-expo.sh; check_metro_alive() verifica che sia ancora
# vivo ogni ~3 tentativi di health check e obbligatoriamente prima di dichiarare "Avvio completato".

set -uo pipefail

# ── LOCK PORTE .replit (merge=ours driver) ───────────────────
# Garantisce che il merge driver "ours" sia sempre configurato,
# anche dopo restart Replit. Necessario per far funzionare
# .gitattributes → .replit merge=ours (blocca sovrascrittura da task agent).
git config --global merge.ours.driver true 2>/dev/null || true
# ─────────────────────────────────────────────────────────────

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
BACKEND_LOG="/tmp/backend.log"
bash "$SCRIPT_DIR/start-backend.sh" > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
log "[2/4] Backend avviato in background (PID: $BACKEND_PID)"

# Metro parte subito in background: non aspettiamo il health check.
# Metro è progettato per gestire una finestra senza backend disponibile.
log "[2/4] Avvio frontend (Metro/Expo) in parallelo..."
METRO_LOG="/tmp/metro.log"
METRO_SKIPPED=0
bash "$SCRIPT_DIR/start-expo.sh" > "$METRO_LOG" 2>&1 &
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
# Se il crash è rilevato, stampa le ultime righe del log Metro per diagnostica immediata.
#
# Exit code 2 = skip "già in esecuzione" (NON un crash):
#   → verifica se la porta 8081 risponde.
#   → se risponde: Metro è già up, ritorna 0 (OK).
#   → se non risponde: fail esplicito "skip ma porta 8081 non risponde".
check_metro_alive() {
  # Idempotente: se lo skip è già stato confermato, evita di rifare wait su un
  # PID già raccolto (wait su figlio già reaped ritorna 127, falsamente "crash").
  if [ "$METRO_SKIPPED" -eq 1 ]; then
    return 0
  fi

  if [ -n "${EXPO_PID:-}" ] && ! kill -0 "$EXPO_PID" 2>/dev/null; then
    # Il processo è già terminato: wait ne recupera l'exit code (ritorna subito).
    wait "$EXPO_PID" 2>/dev/null; local EXPO_EXIT=$?

    # Exit 2   = start-expo.sh ha saltato l'avvio (lock detenuto, Metro già up).
    # Exit 143 = Metro interrotto da segnale esterno (SIGTERM = 128+15). NON è un
    #            crash né un guasto: è un'interruzione. Va trattato esattamente
    #            come exit 2 — niente "METRO CRASH", niente restart loop/backoff.
    if [ "$EXPO_EXIT" -eq 2 ] || [ "$EXPO_EXIT" -eq 143 ]; then
      # Non è un crash: verifica che la porta 8081 risponda davvero.
      if nc -z 127.0.0.1 8081 2>/dev/null || \
         curl -s --max-time 3 http://localhost:8081 >/dev/null 2>&1; then
        if [ "$EXPO_EXIT" -eq 143 ]; then
          log "[check_metro] Metro interrotto da segnale esterno (SIGTERM, exit 143) — porta 8081 risponde → OK (nessun restart loop)"
        else
          log "[check_metro] Metro già in esecuzione (skip exit 2) — porta 8081 risponde → OK"
        fi
        METRO_SKIPPED=1
        EXPO_PID=""   # azzera per sicurezza: evita wait ripetuti su PID già raccolto
        return 0
      else
        if [ "$EXPO_EXIT" -eq 143 ]; then
          fail "2/4" "Metro interrotto da segnale esterno (SIGTERM, exit 143) ma porta 8081 non risponde — Metro non è attivo"
        else
          fail "2/4" "Metro skippato (già in esecuzione, exit 2) ma porta 8081 non risponde — Metro non è attivo"
        fi
      fi
    fi

    local CRASH_TS
    CRASH_TS=$(date '+%Y-%m-%dT%H:%M:%S')
    log "━━━ METRO CRASH — timestamp: $CRASH_TS — exit code: $EXPO_EXIT ━━━"
    log "━━━ Ultime righe log Metro (${METRO_LOG:-/tmp/metro.log}): ━━━"
    if [ -f "${METRO_LOG:-/tmp/metro.log}" ] && [ -s "${METRO_LOG:-/tmp/metro.log}" ]; then
      tail -n 20 "${METRO_LOG:-/tmp/metro.log}" | while IFS= read -r line; do
        log "  │ $line"
      done
    else
      log "  │ (log Metro non disponibile o vuoto)"
    fi
    log "━━━ Fine log Metro ━━━"
    log "━━━ Ultime righe log Backend (${BACKEND_LOG:-/tmp/backend.log}): ━━━"
    if [ -f "${BACKEND_LOG:-/tmp/backend.log}" ] && [ -s "${BACKEND_LOG:-/tmp/backend.log}" ]; then
      tail -n 20 "${BACKEND_LOG:-/tmp/backend.log}" | while IFS= read -r line; do
        log "  │ $line"
      done
    else
      log "  │ (log backend non disponibile o vuoto)"
    fi
    log "━━━ Fine log Backend ━━━"
    fail "2/4" "Metro/Expo (PID $EXPO_PID) è terminato durante il boot — vedi log sopra"
  fi
}

while [ $ATTEMPT -lt ${#DELAYS[@]} ]; do
  DELAY=${DELAYS[$ATTEMPT]}
  sleep "$DELAY"

  ELAPSED=$(elapsed_since $STEP_START)
  if [ "$ELAPSED" -ge "$MAX_HEALTH_SECS" ]; then
    break
  fi

  # Ogni ~3 tentativi controlla che Metro non sia già crashato durante il boot.
  if [ $(( ATTEMPT % 3 )) -eq 0 ] && [ "$ATTEMPT" -gt 0 ]; then
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
  check_metro_alive
  log "━━━ Log Backend al timeout (${BACKEND_LOG:-/tmp/backend.log}): ━━━"
  if [ -f "${BACKEND_LOG:-/tmp/backend.log}" ] && [ -s "${BACKEND_LOG:-/tmp/backend.log}" ]; then
    tail -n 30 "${BACKEND_LOG:-/tmp/backend.log}" | while IFS= read -r line; do
      log "  │ $line"
    done
  else
    log "  │ (log backend non disponibile o vuoto)"
  fi
  log "━━━ Fine log Backend ━━━"
  log "━━━ Log Metro al timeout backend (${METRO_LOG:-/tmp/metro.log}): ━━━"
  if [ -f "${METRO_LOG:-/tmp/metro.log}" ] && [ -s "${METRO_LOG:-/tmp/metro.log}" ]; then
    tail -n 20 "${METRO_LOG:-/tmp/metro.log}" | while IFS= read -r line; do
      log "  │ $line"
    done
  else
    log "  │ (log Metro non disponibile o vuoto)"
  fi
  log "━━━ Fine log Metro ━━━"
  fail "3/4" "backend non è healthy (HTTP 200 + status:ok) dopo ${MAX_HEALTH_SECS}s"
fi

log "[3/4] Backend healthy in $(elapsed_since $STEP_START)s"

# ── Step 4/4: Verifica finale che Metro sia ancora vivo ───────────────────────
# Prima di dichiarare l'avvio completato, verifica che il PID di Metro (EXPO_PID)
# sia ancora attivo. Se è crashato durante il boot del backend (es. porta già in
# uso, errore Node, dipendenza mancante), il messaggio di errore include l'exit
# code per rendere il debug immediato.
# Se METRO_SKIPPED=1 (start-expo.sh ha saltato l'avvio perché Metro era già up),
# check_metro_alive ha già verificato che la porta 8081 risponde → OK.
check_metro_alive
if [ "$METRO_SKIPPED" -eq 1 ]; then
  log "[4/4] Metro già in esecuzione (porta 8081 attiva) — OK"
else
  log "[4/4] Metro (PID $EXPO_PID) attivo — OK"
fi

TOTAL_ELAPSED=$(elapsed_since $TOTAL_START)
log "=== Avvio completato in ${TOTAL_ELAPSED}s (Metro in parallelo su porta 8081) ==="

# Mantieni lo script attivo per propagare i segnali
wait
