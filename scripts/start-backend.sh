#!/bin/bash
# start-backend.sh — Avvia il backend Node.js con supervisione e crash recovery.
# Esegue build-server.sh prima di avviare il server (cache-aware, veloce su no-op).
# Questo garantisce che server_dist/index.js sia sempre aggiornato dopo uno split
# o qualsiasi modifica ai sorgenti server/ o shared/.

PORT=5000
MAX_RETRIES=10
LOCK_FILE="/tmp/start-backend.lock"
CRASH_LOG="logs/backend-crashes.log"
SERVER_PID=0
START_TIME=0

mkdir -p logs

log_crash() {
  local pid=$1
  local exit_code=$2
  local uptime_secs=$3
  local ts
  ts=$(date '+%Y-%m-%dT%H:%M:%S')
  local line="$ts EXIT_CODE=$exit_code PID=$pid UPTIME=${uptime_secs}s"
  echo "$line"
  echo "$line" >> "$CRASH_LOG"
}

sigterm_handler() {
  local ts
  ts=$(date '+%Y-%m-%dT%H:%M:%S')
  echo "$ts [start-backend] SIGTERM ricevuto — propagazione a Node PID $SERVER_PID"
  if [ "$SERVER_PID" -gt 0 ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -TERM "$SERVER_PID"
    wait "$SERVER_PID" 2>/dev/null
  fi
  exit 0
}
trap sigterm_handler SIGTERM

cleanup() {
  rm -f "$LOCK_FILE"
}
trap cleanup EXIT

if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
  # Tratta un PID vuoto o non numerico come lock valido: un'altra istanza
  # potrebbe aver appena creato il file ma non aver ancora scritto il proprio PID.
  # NON rimuovere il lock in quel caso — altrimenti si genera la race EADDRINUSE.
  if [ -z "$LOCK_PID" ] || ! [[ "$LOCK_PID" =~ ^[0-9]+$ ]]; then
    echo "Lock file trovato con PID vuoto/non numerico ('$LOCK_PID') — un'altra istanza sta partendo. Uscita."
    trap - EXIT
    exit 0
  fi
  if kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "Un'altra istanza di start-backend.sh è già in esecuzione (PID: $LOCK_PID). Uscita."
    trap - EXIT
    exit 0
  else
    echo "Lock file obsoleto trovato (PID $LOCK_PID morto), rimuovo."
    rm -f "$LOCK_FILE"
  fi
fi

echo $$ > "$LOCK_FILE"

# ── Build server_dist/index.js (cache-aware: veloce se nessun file è cambiato) ──
echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Build server in corso (cache-aware)..."
if ! bash "$(dirname "$0")/build-server.sh"; then
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] ERRORE: build-server.sh fallita — impossibile avviare il backend"
  exit 1
fi

# ── kill_port: SIGTERM → attesa 2s → SIGKILL → verifica porta libera ─────────
kill_port() {
  local pids
  pids=$(lsof -ti:$PORT 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "kill_port: SIGTERM a PID(s) $pids su porta $PORT..."
    echo "$pids" | xargs kill -TERM 2>/dev/null || true
    sleep 2
    pids=$(lsof -ti:$PORT 2>/dev/null)
    if [ -n "$pids" ]; then
      echo "kill_port: SIGKILL a PID(s) $pids (non hanno risposto a SIGTERM)"
      echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
  fi

  for i in $(seq 1 10); do
    if ! lsof -ti:$PORT >/dev/null 2>&1; then
      echo "kill_port: porta $PORT libera dopo ${i}s"
      return 0
    fi
    sleep 1
  done
  echo "kill_port: attenzione — porta $PORT ancora occupata dopo 10s"
}

for retry in $(seq 1 $MAX_RETRIES); do
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] === Tentativo $retry/$MAX_RETRIES ==="
  echo "Pulizia porta $PORT..."
  kill_port

  echo "Porta $PORT libera, avvio backend..."
  if [ ! -f "server_dist/index.js" ]; then
    echo "server_dist/index.js non trovato — build in corso..."
    bash scripts/build-server.sh
    if [ $? -ne 0 ]; then
      echo "Build fallita — impossibile avviare il backend."
      exit 1
    fi
    echo "Build completata."
  fi
  START_TIME=$(date +%s)
  NODE_ENV=production node --max-old-space-size=512 server_dist/index.js &
  SERVER_PID=$!

  sleep 8

  if ! kill -0 $SERVER_PID 2>/dev/null; then
    wait $SERVER_PID 2>/dev/null
    REAL_EXIT=$?
    UPTIME_SECS=$(( $(date +%s) - START_TIME ))
    log_crash "$SERVER_PID" "$REAL_EXIT" "$UPTIME_SECS"
    echo "Backend crashato subito al tentativo $retry (exit $REAL_EXIT)"
    if [ $retry -lt $MAX_RETRIES ]; then
      echo "Riprovo tra 8 secondi..."
      sleep 8
    fi
    continue
  fi

  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Backend avviato con successo (PID: $SERVER_PID)"

  while true; do
    sleep 10
    if ! kill -0 $SERVER_PID 2>/dev/null; then
      wait $SERVER_PID 2>/dev/null
      REAL_EXIT=$?
      UPTIME_SECS=$(( $(date +%s) - START_TIME ))
      log_crash "$SERVER_PID" "$REAL_EXIT" "$UPTIME_SECS"

      if [ $REAL_EXIT -eq 137 ] || [ $REAL_EXIT -eq 143 ] || [ $REAL_EXIT -eq 0 ]; then
        echo "Backend fermato dal sistema (exit $REAL_EXIT), uscita pulita."
        exit 0
      fi

      echo "Backend terminato inaspettatamente (exit $REAL_EXIT, uptime: ${UPTIME_SECS}s) — tentativo $retry/$MAX_RETRIES"
      break
    fi
  done

  if [ $retry -lt $MAX_RETRIES ]; then
    echo "Riavvio in corso (tentativo $((retry+1))/$MAX_RETRIES)..."
    sleep 5
  fi
done

echo "ERRORE: impossibile avviare il backend dopo $MAX_RETRIES tentativi"
exit 1
