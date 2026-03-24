#!/bin/bash

PORT=8081
BACKEND_PORT=5000
MAX_RETRIES=3
BACKEND_WAIT_SECONDS=120
FLOCK_FILE="/tmp/start-expo.flock"
LOCK_FILE="/tmp/start-expo.lock"
PID_FILE="/tmp/metro.pid"

# PID globali per i curl di pre-warm (cleanup/retry)
PREWARM_ANDROID_PID=0
PREWARM_IOS_PID=0

# ── Pulizia temp orfani da sessioni precedenti ────────────────────────────────
find /tmp -maxdepth 1 -name "metro-opt-cycle*" -mmin +120 -delete 2>/dev/null || true

# ── Lock atomico con flock (kernel-level, nessuna race condition) ──────────────
exec 9>>"$FLOCK_FILE"
if ! flock -n 9; then
  echo "Un'altra istanza di start-expo.sh e' gia' in esecuzione. Uscita."
  exit 0
fi

echo $$ > "$LOCK_FILE"

cleanup() {
  rm -f "$LOCK_FILE"
  if [ "$PREWARM_ANDROID_PID" -gt 0 ]; then
    kill "$PREWARM_ANDROID_PID" 2>/dev/null || true
  fi
  if [ "$PREWARM_IOS_PID" -gt 0 ]; then
    kill "$PREWARM_IOS_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── Configurazione Node.js ─────────────────────────────────────────────────────
# cgroup limit: 8192MB. maxWorkers=1 (metro.config.js) = 2 processi Node totali.
# 2 x 1024MB = 2048MB per Metro + ~3GB backend+OS = ~5GB < 8GB limite cgroup.
export NODE_OPTIONS="--max-old-space-size=1024"

# ── Funzioni di utilita' ────────────────────────────────────────────────────────

# Usato durante l'avvio (breve timeout).
port_is_open() {
  curl -s --max-time 2 --connect-timeout 1 -o /dev/null "http://localhost:$1/" 2>/dev/null
}

# Usato durante il monitoring: timeout lungo (60s) perche' Metro puo' essere
# impegnato nella compilazione del bundle (~28s per 1635 moduli) e non rispondere
# immediatamente. Se Metro e' morto, curl riceve connection refused istantaneamente.
port_is_alive() {
  curl -s --max-time 60 --connect-timeout 3 -o /dev/null "http://localhost:$1/" 2>/dev/null
}

kill_port() {
  echo "Killing processi su porta $PORT..."
  fuser -k -9 ${PORT}/tcp 2>/dev/null || true
  lsof -ti:${PORT} 2>/dev/null | xargs kill -9 2>/dev/null || true
  pkill -9 -f "expo start --localhost" 2>/dev/null || true
  pkill -9 -f "node_modules/.bin/expo" 2>/dev/null || true
  pkill -9 -f "node_modules/expo/build/cli" 2>/dev/null || true
  pkill -9 -f "@expo/cli" 2>/dev/null || true

  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$OLD_PID" ]; then
      kill -9 "$OLD_PID" 2>/dev/null || true
      pkill -9 -P "$OLD_PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi

  for i in $(seq 1 20); do
    if ! port_is_open $PORT; then
      echo "Porta $PORT libera dopo ${i}s"
      return 0
    fi
    if [ $((i % 3)) -eq 0 ]; then
      fuser -k -9 ${PORT}/tcp 2>/dev/null || true
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

# ── Pre-warm bundle Android + iOS (paralleli) ─────────────────────────────────
# Lancia entrambe le richieste di bundle in background simultaneamente.
# Attende che ALMENO UNA delle due si completi (o raggiunga il timeout globale
# di 300s) prima di entrare nel monitoring loop.
# Restituisce sempre 0: qualsiasi esito del pre-warm e' un fallback graceful,
# il monitoring inizia comunque e l'avvio non viene bloccato.
#
# Perche' non usiamo HTTP check durante l'attesa:
#   Durante la compilazione (~28-31s per 1635 moduli) Metro e' occupato e
#   non risponde entro 2s → falso positivo. Polling sui PID dei curl evita
#   questo problema senza dipendere dalla reattivita' HTTP di Metro.
prewarm_bundles() {
  local log_file="$1"
  local BUNDLE_BASE="http://localhost:${PORT}/node_modules/expo-router/entry.bundle"
  local BUNDLE_PARAMS="dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable"
  local PW_TIMEOUT=300

  # Avvia Android e iOS in parallelo
  echo "Pre-warm bundle Android avviato (max ${PW_TIMEOUT}s)..." | tee -a "$log_file"
  curl -s --max-time "$PW_TIMEOUT" --connect-timeout 10 \
    -o /dev/null \
    "${BUNDLE_BASE}?platform=android&${BUNDLE_PARAMS}" 2>/dev/null &
  PREWARM_ANDROID_PID=$!

  echo "Pre-warm bundle iOS avviato (max ${PW_TIMEOUT}s)..." | tee -a "$log_file"
  curl -s --max-time "$PW_TIMEOUT" --connect-timeout 10 \
    -o /dev/null \
    "${BUNDLE_BASE}?platform=ios&${BUNDLE_PARAMS}" 2>/dev/null &
  PREWARM_IOS_PID=$!

  # Polling sui PID — attendi il primo completamento (no HTTP check)
  local PW_START=$(date +%s)
  local first_done=0

  for i in $(seq 1 $((PW_TIMEOUT + 10))); do
    local android_alive=0
    local ios_alive=0
    kill -0 "$PREWARM_ANDROID_PID" 2>/dev/null && android_alive=1
    kill -0 "$PREWARM_IOS_PID" 2>/dev/null && ios_alive=1

    if [ $android_alive -eq 0 ] || [ $ios_alive -eq 0 ]; then
      first_done=1
      break
    fi

    if [ $((i % 30)) -eq 0 ]; then
      echo "  ...pre-warm in corso (${i}s / ${PW_TIMEOUT}s)..." | tee -a "$log_file"
    fi
    sleep 1
  done

  local PW_END=$(date +%s)
  local PW_ELAPSED=$((PW_END - PW_START))

  if [ "$first_done" -eq 1 ]; then
    echo "Pre-warm bundle completato in ${PW_ELAPSED}s — Expo Go servira' dalla cache" | tee -a "$log_file"
  else
    echo "Pre-warm bundle completato (timeout ${PW_ELAPSED}s) — Expo Go servira' alla prima richiesta" | tee -a "$log_file"
  fi

  # I curl ancora in esecuzione restano attivi in background.
  # Il monitoring loop li terminera' se Metro cade; cleanup li termina all'uscita.
  return 0
}

# Ferma i curl di pre-warm se in esecuzione
kill_prewarm() {
  if [ "$PREWARM_ANDROID_PID" -gt 0 ]; then
    kill "$PREWARM_ANDROID_PID" 2>/dev/null || true
  fi
  if [ "$PREWARM_IOS_PID" -gt 0 ]; then
    kill "$PREWARM_IOS_PID" 2>/dev/null || true
  fi
  PREWARM_ANDROID_PID=0
  PREWARM_IOS_PID=0
}

wait_for_backend

SESSION_TS=$(date +%Y%m%d-%H%M%S)

for retry in $(seq 1 $MAX_RETRIES); do
  LOG_FILE="/tmp/metro-opt-cycle${retry}-${SESSION_TS}.log"
  echo "=== Tentativo $retry/$MAX_RETRIES ===" | tee -a "$LOG_FILE"
  echo "Log ciclo: $LOG_FILE"
  echo "NODE_OPTIONS: $NODE_OPTIONS" | tee -a "$LOG_FILE"
  echo "Orario avvio: $(date)" | tee -a "$LOG_FILE"

  # Ferma pre-warm dell'eventuale ciclo precedente (kill guard: solo se PID > 0)
  kill_prewarm

  METRO_STARTED=0
  METRO_PID=0

  # Se Metro e' gia' attivo su porta $PORT, adottalo senza ucciderlo
  if port_is_open $PORT; then
    echo "Metro gia' attivo su porta $PORT — adotto senza restart" | tee -a "$LOG_FILE"
    METRO_STARTED=1
  else
    echo "Pulizia porta $PORT..." | tee -a "$LOG_FILE"
    kill_port

    if port_is_open $PORT; then
      echo "Porta $PORT ancora occupata dopo kill completo, salto tentativo $retry" | tee -a "$LOG_FILE"
      if [ $retry -lt $MAX_RETRIES ]; then
        sleep 3
      fi
      continue
    fi

    echo "Porta $PORT libera, avvio Metro..." | tee -a "$LOG_FILE"
    echo "EXPO_PACKAGER_PROXY_URL=https://$REPLIT_EXPO_DEV_DOMAIN EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN" | tee -a "$LOG_FILE"
    START_TIME=$(date +%s)
    # Nota: usiamo il comando diretto invece di `npm run expo:dev` perche' dobbiamo
    # passare REPLIT_EXPO_DEV_DOMAIN (porta 8081, Metro) invece di REPLIT_DEV_DOMAIN
    # (porta 5000, backend) per EXPO_PACKAGER_PROXY_URL e REACT_NATIVE_PACKAGER_HOSTNAME.
    # Il comando e' identico allo script expo:dev (npx expo start --localhost),
    # senza pre/post hook (solo postinstall esiste in package.json).
    EXPO_PACKAGER_PROXY_URL="https://$REPLIT_EXPO_DEV_DOMAIN" \
    REACT_NATIVE_PACKAGER_HOSTNAME="$REPLIT_EXPO_DEV_DOMAIN" \
    EXPO_PUBLIC_DOMAIN="$REPLIT_DEV_DOMAIN" \
    npx expo start --localhost >> "$LOG_FILE" 2>&1 &
    METRO_PID=$!
    echo $METRO_PID > "$PID_FILE"

    # Aspetta fino a 300s che Metro binds su porta 8081
    echo "Attendo che Metro si avvii sulla porta $PORT (max 300s)..." | tee -a "$LOG_FILE"
    for i in $(seq 1 300); do
      if port_is_open $PORT; then
        END_TIME=$(date +%s)
        ELAPSED=$((END_TIME - START_TIME))
        echo "Metro avviato con successo sulla porta $PORT dopo ${ELAPSED}s" | tee -a "$LOG_FILE"
        METRO_STARTED=1
        break
      fi
      # npm e' uscito (launcher): aspetta fino a 120s che il processo Metro orphan apra la porta
      if ! kill -0 $METRO_PID 2>/dev/null; then
        echo "npm (PID $METRO_PID) uscito al secondo $i, attendo 120s per il processo Metro..." | tee -a "$LOG_FILE"
        for j in $(seq 1 120); do
          if port_is_open $PORT; then
            END_TIME=$(date +%s)
            ELAPSED=$((END_TIME - START_TIME))
            echo "Metro avviato (come processo orphan) dopo ${ELAPSED}s" | tee -a "$LOG_FILE"
            METRO_STARTED=1
            break
          fi
          sleep 1
        done
        break
      fi
      if [ $((i % 30)) -eq 0 ]; then
        echo "  ...ancora in attesa di Metro (${i}s / 300s)..." | tee -a "$LOG_FILE"
      fi
      sleep 1
    done
  fi

  if [ $METRO_STARTED -eq 1 ]; then
    # ── Pre-warm Android+iOS in parallelo — attende il primo completamento ───
    # prewarm_bundles() restituisce sempre 0: il monitoring inizia comunque
    # qualunque sia l'esito del pre-warm (graceful fallback totale).
    # Log garantito: "Pre-warm bundle completato in Xs" appare PRIMA di
    # "Metro in esecuzione, monitoraggio".
    prewarm_bundles "$LOG_FILE"

    # ── Monitoring loop: usa port_is_alive (60s) per tollerare la            ─
    # compilazione del secondo bundle in background senza falsi positivi.     ─
    echo "Metro in esecuzione, monitoraggio porta $PORT..." | tee -a "$LOG_FILE"
    while true; do
      sleep 15
      if ! port_is_alive $PORT; then
        echo "Metro giu': porta $PORT non risponde — $(date)" | tee -a "$LOG_FILE"
        kill_prewarm
        break
      fi
    done
    echo "Metro terminato su porta $PORT" | tee -a "$LOG_FILE"
    if [ $METRO_PID -ne 0 ]; then
      kill $METRO_PID 2>/dev/null || true
    fi
    if [ $retry -lt $MAX_RETRIES ]; then
      echo "Riavvio in corso..." | tee -a "$LOG_FILE"
      sleep 5
    fi
  else
    echo "Metro crashato al tentativo $retry — $(date)" | tee -a "$LOG_FILE"
    if [ $METRO_PID -ne 0 ]; then
      kill $METRO_PID 2>/dev/null || true
    fi
    if [ $retry -lt $MAX_RETRIES ]; then
      echo "Riprovo tra 5 secondi..." | tee -a "$LOG_FILE"
      sleep 5
    fi
  fi
done

echo "ERRORE: impossibile avviare Metro dopo $MAX_RETRIES tentativi"
exit 1
