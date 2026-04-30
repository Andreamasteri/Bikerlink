#!/bin/bash

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
  if kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "Un'altra istanza di start-backend.sh è già in esecuzione (PID: $LOCK_PID). Uscita."
    exit 0
  else
    echo "Lock file obsoleto trovato (PID $LOCK_PID morto), rimuovo."
    rm -f "$LOCK_FILE"
  fi
fi

echo $$ > "$LOCK_FILE"

rm -f /tmp/start-backend.flock 2>/dev/null

kill_port() {
  pkill -9 -f "node.*server_dist" 2>/dev/null || true
  pkill -9 -f "tsx server" 2>/dev/null || true

  local pids
  pids=$(lsof -ti:$PORT 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "Kill SIGKILL PID(s) su porta $PORT: $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
  fuser -k -9 ${PORT}/tcp 2>/dev/null || true

  for i in $(seq 1 15); do
    if ! fuser ${PORT}/tcp >/dev/null 2>&1 && ! lsof -ti:$PORT >/dev/null 2>&1; then
      echo "Porta $PORT libera dopo ${i}s"
      return 0
    fi
    sleep 1
  done
  echo "Attenzione: porta $PORT ancora occupata dopo 15s"
}

needs_rebuild() {
  if [ ! -f "server_dist/index.js" ]; then
    return 0
  fi
  local newest_src
  newest_src=$(find server/ shared/ -name '*.ts' -newer server_dist/index.js 2>/dev/null | head -1)
  if [ -n "$newest_src" ]; then
    return 0
  fi
  return 1
}

if needs_rebuild; then
  BUILD_MAX_RETRIES=3
  BUILD_OK=0
  for build_try in $(seq 1 $BUILD_MAX_RETRIES); do
    echo "Compilazione TypeScript server (tentativo $build_try/$BUILD_MAX_RETRIES)..."
    npx esbuild server/index.ts --platform=node --packages=external --bundle --format=cjs --outdir=server_dist --alias:@shared/schema=./shared/schema --alias:@shared/privacy-policy-it=./shared/privacy-policy-it
    if [ $? -eq 0 ]; then
      BUILD_OK=1
      break
    fi
    echo "Compilazione fallita al tentativo $build_try"
    if [ $build_try -lt $BUILD_MAX_RETRIES ]; then
      echo "Attendo 5 secondi prima di riprovare..."
      sleep 5
    fi
  done
  if [ $BUILD_OK -ne 1 ]; then
    echo "ERRORE: compilazione server fallita dopo $BUILD_MAX_RETRIES tentativi"
    exit 1
  fi
  echo "Compilazione completata."
else
  echo "server_dist/index.js aggiornato — skip rebuild (risparmio ~3-5s)"
fi

for retry in $(seq 1 $MAX_RETRIES); do
  echo "=== Tentativo $retry/$MAX_RETRIES ==="
  echo "Pulizia porta $PORT..."
  kill_port

  sleep 3

  echo "Porta $PORT libera, avvio backend..."
  START_TIME=$(date +%s)
  NODE_ENV=production REPLIT_DEV=1 node --max-old-space-size=512 server_dist/index.js &
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

  echo "Backend avviato con successo (PID: $SERVER_PID)"

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
