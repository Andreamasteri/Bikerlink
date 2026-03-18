#!/bin/bash

PORT=8081
BACKEND_PORT=5000
MAX_RETRIES=3
BACKEND_WAIT_SECONDS=120
LOCK_FILE="/tmp/start-expo.lock"
PID_FILE="/tmp/metro.pid"

cleanup() {
  rm -f "$LOCK_FILE"
}
trap cleanup EXIT

if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
  if kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "Un'altra istanza di start-expo.sh è già in esecuzione (PID: $LOCK_PID). Uscita."
    exit 0
  else
    echo "Lock file obsoleto trovato, continuo."
    rm -f "$LOCK_FILE"
  fi
fi

echo $$ > "$LOCK_FILE"

# nc è sempre disponibile — usa solo nc per verificare lo stato della porta
port_is_open() {
  nc -z -w1 localhost "$1" >/dev/null 2>&1
}

kill_port() {
  echo "Killing processi su porta $PORT..."

  # Kill per porta (fuser e lsof potrebbero non essere disponibili, ignora errori)
  fuser -k -9 ${PORT}/tcp 2>/dev/null || true
  lsof -ti:${PORT} 2>/dev/null | xargs kill -9 2>/dev/null || true

  # Kill per pattern (il processo Metro reale)
  pkill -9 -f "expo start --localhost" 2>/dev/null || true
  pkill -9 -f "node_modules/.bin/expo" 2>/dev/null || true
  pkill -9 -f "node_modules/expo/build/cli" 2>/dev/null || true
  pkill -9 -f "@expo/cli" 2>/dev/null || true

  # Kill PID Metro noto dal file
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$OLD_PID" ]; then
      kill -9 "$OLD_PID" 2>/dev/null || true
      # Killa anche i figli del processo npm
      pkill -9 -P "$OLD_PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi

  # Attendi con nc (affidabile su tutti i sistemi) che la porta sia libera
  for i in $(seq 1 20); do
    if ! port_is_open $PORT; then
      echo "Porta $PORT libera dopo ${i}s"
      return 0
    fi
    # Ri-prova kill ogni 3 secondi se la porta è ancora occupata
    if [ $((i % 3)) -eq 0 ]; then
      fuser -k -9 ${PORT}/tcp 2>/dev/null || true
      pkill -9 -f "expo start --localhost" 2>/dev/null || true
      pkill -9 -f "node_modules/.bin/expo" 2>/dev/null || true
    fi
    sleep 1
  done
  echo "Attenzione: porta $PORT ancora occupata dopo 20s"
}

wait_for_backend() {
  echo "Attendo che il backend sia pronto sulla porta $BACKEND_PORT..."
  for i in $(seq 1 $BACKEND_WAIT_SECONDS); do
    if curl -s --max-time 1 "http://localhost:$BACKEND_PORT/api/auth/me" >/dev/null 2>&1; then
      echo "Backend pronto dopo ${i}s."
      return 0
    fi
    if [ $((i % 10)) -eq 0 ]; then
      echo "  ...ancora in attesa del backend (${i}s / ${BACKEND_WAIT_SECONDS}s)..."
    fi
    sleep 1
  done
  echo "Attenzione: backend non risponde dopo ${BACKEND_WAIT_SECONDS}s, avvio Metro comunque."
}

wait_for_backend

for retry in $(seq 1 $MAX_RETRIES); do
  echo "=== Tentativo $retry/$MAX_RETRIES ==="
  echo "Pulizia porta $PORT..."
  kill_port

  # Verifica con nc che la porta sia davvero libera
  if port_is_open $PORT; then
    echo "Porta $PORT ancora occupata dopo kill completo, salto tentativo $retry"
    if [ $retry -lt $MAX_RETRIES ]; then
      sleep 3
    fi
    continue
  fi

  echo "Porta $PORT libera, avvio Metro..."
  npm run expo:dev &
  METRO_PID=$!
  echo $METRO_PID > "$PID_FILE"

  # Aspetta fino a 90s che Metro binds su port 8081 — usa nc per il check
  echo "Attendo che Metro si avvii sulla porta $PORT (max 90s)..."
  METRO_STARTED=0
  for i in $(seq 1 90); do
    if port_is_open $PORT; then
      echo "Metro avviato con successo sulla porta $PORT dopo ${i}s"
      METRO_STARTED=1
      break
    fi
    # Se npm è morto E la porta non è ancora aperta, aspetta altri 5s per l'orphan
    if ! kill -0 $METRO_PID 2>/dev/null; then
      sleep 5
      if port_is_open $PORT; then
        echo "Metro avviato (come processo orphan) dopo ${i}s"
        METRO_STARTED=1
      else
        echo "npm (PID $METRO_PID) morto e porta $PORT non aperta al secondo $i"
      fi
      break
    fi
    sleep 1
  done

  if [ $METRO_STARTED -eq 1 ]; then
    echo "Metro in esecuzione, monitoraggio porta $PORT..."
    # Mantieni il workflow vivo monitorando la porta con nc
    while true; do
      sleep 15
      if ! port_is_open $PORT; then
        echo "Metro giù: porta $PORT non risponde"
        break
      fi
    done
    echo "Metro terminato su porta $PORT"
    kill $METRO_PID 2>/dev/null || true
    if [ $retry -lt $MAX_RETRIES ]; then
      echo "Riavvio in corso..."
      sleep 5
    fi
  else
    echo "Metro crashato al tentativo $retry"
    kill $METRO_PID 2>/dev/null || true
    if [ $retry -lt $MAX_RETRIES ]; then
      echo "Riprovo tra 5 secondi..."
      sleep 5
    fi
  fi
done

echo "ERRORE: impossibile avviare Metro dopo $MAX_RETRIES tentativi"
exit 1
