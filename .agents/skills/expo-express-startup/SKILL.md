---
name: expo-express-startup
description: Sistema di avvio robusto per app Expo + Express su Replit. Include 4 script shell (start-backend.sh, start-expo.sh, watchdog.sh, riavvia-tutto.sh) con lock atomico, retry loop, pre-warm bundle Android/iOS, watchdog con cooldown. Usa questa skill quando vuoi replicare questo sistema in un nuovo progetto Expo + Express su Replit.
---

# Sistema di Avvio Robusto — Expo + Express su Replit

Questo sistema garantisce che backend e frontend si avviino in ordine corretto, sopravvivano ai crash e vengano monitorati continuamente. È basato su 4 script bash + 4 workflow Replit.

---

## Architettura

```
┌─────────────────────────────────────────────────┐
│  Workflow Replit                                  │
│  ┌──────────────┐  ┌──────────────┐              │
│  │ Start Backend│  │Start Frontend│              │
│  │  porta 5000  │  │  porta 8081  │              │
│  └──────┬───────┘  └──────┬───────┘              │
│         │                 │ (attende backend)     │
│  ┌──────▼───────────────────────────────────┐    │
│  │             Watchdog                      │    │
│  │ controlla ogni 10s, riavvia se crash      │    │
│  │ graceful shutdown su SIGTERM/SIGINT        │    │
│  │ rotazione log automatica (>1MB)           │    │
│  └───────────────────────────────────────────┘    │
│  ┌───────────────────────────────────────────┐    │
│  │          riavvia-tutto.sh                 │    │
│  │ opzione nucleare: kill + pulisci cache    │    │
│  │ + rimuovi tutti i lock/flock/pid orfani   │    │
│  └───────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

---

## Pattern chiave

| Pattern | Script | Scopo |
|---------|--------|-------|
| Lock file PID | start-backend.sh | Impedisce avvii duplicati |
| flock kernel-level | start-expo.sh, watchdog.sh | Lock atomico senza race condition |
| Retry loop (MAX_RETRIES=3) | start-backend.sh, start-expo.sh | Auto-recovery su crash |
| Rebuild condizionale | start-backend.sh | Salta esbuild se i sorgenti non sono cambiati (~3-5s risparmiati) |
| Pre-warm bundle parallelo | start-expo.sh | Android+iOS compilati subito, Expo Go veloce |
| Pulizia temp orfani | start-expo.sh | Elimina log Metro vecchi >2h all'avvio |
| Cooldown riavvio | watchdog.sh | Evita restart loop (60s backend, 120s frontend) |
| Graceful shutdown | watchdog.sh | trap SIGTERM/SIGINT, uscita pulita senza zombie |
| Rotazione log automatica | watchdog.sh | Tronca watchdog.log quando >1MB (ogni ~10 min) |
| Monitoring porta (non PID) | start-expo.sh | Metro può essere orphan process |
| port_is_alive timeout=60s | start-expo.sh | Evita falsi positivi durante compilazione bundle |
| Pulizia lock/flock/pid completa | riavvia-tutto.sh | Rimuove tutti i file orfani da /tmp/ |

---

## Step-by-step: come replicarlo in un nuovo progetto

### 1. Crea la cartella scripts/
```bash
mkdir -p scripts
```

### 2. Copia i 4 script (personalizza i PLACEHOLDER)
Vedi sezioni sotto. Placeholder da sostituire:
- `NOME_APP` → nome della tua app (solo per messaggi)
- `BACKEND_CMD` → comando di avvio backend (es. `node server_dist/index.js`)
- `BUILD_CMD` → comando di build TypeScript (es. `npm run server:build`)
- `BACKEND_PORT` → porta backend (es. 5000)
- `FRONTEND_PORT` → porta Metro (es. 8081)
- `BACKEND_HEALTH_ENDPOINT` → endpoint health (es. `/api/auth/me` o `/api/health`)
- `WORKSPACE_PATH` → path assoluto del progetto (es. `/home/runner/workspace`)
- `EXPO_ENTRY_BUNDLE` → entry point bundle (es. `node_modules/expo-router/entry.bundle`)
- `SOURCE_DIRS` → directory sorgenti server (es. `server/ shared/`) per il rebuild condizionale
- `LOG_MAX_BYTES` → dimensione massima log watchdog (es. `1048576` = 1MB)

### 3. Rendi eseguibili gli script
```bash
chmod +x scripts/start-backend.sh scripts/start-expo.sh scripts/watchdog.sh scripts/riavvia-tutto.sh
```

### 4. Aggiungi gli script npm in package.json
```json
{
  "scripts": {
    "expo:dev": "EXPO_PACKAGER_PROXY_URL=https://$REPLIT_DEV_DOMAIN REACT_NATIVE_PACKAGER_HOSTNAME=$REPLIT_DEV_DOMAIN EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN:BACKEND_PORT npx expo start --localhost",
    "server:build": "esbuild server/index.ts --platform=node --packages=external --bundle --format=cjs --outdir=server_dist"
  }
}
```

### 5. Configura i workflow in .replit
```toml
[[workflows.workflow]]
name = "Start Backend"
author = "agent"
[[workflows.workflow.tasks]]
task = "shell.exec"
args = "bash scripts/start-backend.sh"
waitForPort = BACKEND_PORT

[[workflows.workflow]]
name = "Start Frontend"
author = "agent"
[[workflows.workflow.tasks]]
task = "shell.exec"
args = "bash scripts/start-expo.sh"
waitForPort = FRONTEND_PORT

[[workflows.workflow]]
name = "Watchdog"
author = "agent"
[[workflows.workflow.tasks]]
task = "shell.exec"
args = "bash scripts/watchdog.sh"

[[workflows.workflow]]
name = "Riavvia Tutto"
author = "agent"
[[workflows.workflow.tasks]]
task = "shell.exec"
args = "bash scripts/riavvia-tutto.sh"
```

### 6. Crea cartella logs/
```bash
mkdir -p logs
echo "logs/*.log" >> .gitignore
```

### 7. Aggiungi endpoint /api/health al backend
```typescript
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});
```

### 8. Avvio sequenza corretta
1. Start Backend prima
2. Start Frontend dopo (aspetta automaticamente il backend)
3. Watchdog in parallelo (può partire in qualsiasi momento)

---

## Script 1: start-backend.sh

```bash
#!/bin/bash

PORT=BACKEND_PORT
MAX_RETRIES=3
LOCK_FILE="/tmp/start-backend.lock"

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
  newest_src=$(find SOURCE_DIRS -name '*.ts' -newer server_dist/index.js 2>/dev/null | head -1)
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
    BUILD_CMD
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
  NODE_ENV=production BACKEND_CMD &
  SERVER_PID=$!

  sleep 8

  if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "Backend crashato al tentativo $retry"
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
      EXIT_CODE=$?
      echo "Backend terminato (PID: $SERVER_PID)"
      wait $SERVER_PID 2>/dev/null
      REAL_EXIT=$(( $? ))
      if [ $REAL_EXIT -eq 137 ] || [ $REAL_EXIT -eq 143 ] || [ $REAL_EXIT -eq 0 ]; then
        echo "Backend fermato dal sistema (signal kill/term), uscita pulita."
        exit 0
      fi
      echo "Backend crashato con codice: $REAL_EXIT"
      break
    fi
  done

  if [ $retry -lt $MAX_RETRIES ]; then
    echo "Riavvio in corso..."
    sleep 8
  fi
done

echo "ERRORE: impossibile avviare il backend dopo $MAX_RETRIES tentativi"
exit 1
```

---

## Script 2: start-expo.sh

```bash
#!/bin/bash

PORT=FRONTEND_PORT
BACKEND_PORT=BACKEND_PORT
MAX_RETRIES=3
BACKEND_WAIT_SECONDS=120
FLOCK_FILE="/tmp/start-expo.flock"
LOCK_FILE="/tmp/start-expo.lock"
PID_FILE="/tmp/metro.pid"

PREWARM_ANDROID_PID=0
PREWARM_IOS_PID=0

find /tmp -maxdepth 1 -name "metro-opt-cycle*" -mmin +120 -delete 2>/dev/null || true

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

export NODE_OPTIONS="--max-old-space-size=1024"

port_is_open() {
  curl -s --max-time 2 --connect-timeout 1 -o /dev/null "http://localhost:$1/" 2>/dev/null
}

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
    if curl -s --max-time 1 "http://localhost:$BACKEND_PORT/BACKEND_HEALTH_ENDPOINT" >/dev/null 2>&1; then
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

prewarm_bundles() {
  local log_file="$1"
  local BUNDLE_BASE="http://localhost:${PORT}/EXPO_ENTRY_BUNDLE"
  local BUNDLE_PARAMS="dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable"
  local PW_TIMEOUT=300

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
    echo "Pre-warm bundle completato (timeout ${PW_ELAPSED}s)" | tee -a "$log_file"
  fi
  return 0
}

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

  kill_prewarm

  METRO_STARTED=0
  METRO_PID=0

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
    START_TIME=$(date +%s)
    npm run expo:dev >> "$LOG_FILE" 2>&1 &
    METRO_PID=$!
    echo $METRO_PID > "$PID_FILE"

    echo "Attendo che Metro si avvii sulla porta $PORT (max 300s)..." | tee -a "$LOG_FILE"
    for i in $(seq 1 300); do
      if port_is_open $PORT; then
        END_TIME=$(date +%s)
        ELAPSED=$((END_TIME - START_TIME))
        echo "Metro avviato con successo sulla porta $PORT dopo ${ELAPSED}s" | tee -a "$LOG_FILE"
        METRO_STARTED=1
        break
      fi
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
    prewarm_bundles "$LOG_FILE"

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
```

---

## Script 3: watchdog.sh

```bash
#!/bin/bash

BACKEND_PORT=BACKEND_PORT
FRONTEND_PORT=FRONTEND_PORT
LOG_FILE="WORKSPACE_PATH/logs/watchdog.log"
HEALTH_CHECK_INTERVAL=60
CHECK_INTERVAL=10
RESTART_COOLDOWN=60
FRONTEND_RESTART_COOLDOWN=120
LOG_MAX_BYTES=LOG_MAX_BYTES

mkdir -p "$(dirname "$LOG_FILE")"

exec 9>>"/tmp/watchdog.flock"
if ! flock -n 9; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Altra istanza Watchdog gia' in esecuzione. Uscita." >> "$LOG_FILE"
  exit 0
fi

RUNNING=1

graceful_shutdown() {
  log "WATCHDOG: ricevuto segnale di arresto, uscita pulita..."
  RUNNING=0
}
trap graceful_shutdown SIGTERM SIGINT

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"
}

rotate_log() {
  if [ -f "$LOG_FILE" ]; then
    local size
    size=$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
    if [ "$size" -gt "$LOG_MAX_BYTES" ]; then
      local lines
      lines=$(wc -l < "$LOG_FILE")
      local keep=$((lines / 2))
      tail -n "$keep" "$LOG_FILE" > "${LOG_FILE}.tmp" 2>/dev/null
      mv "${LOG_FILE}.tmp" "$LOG_FILE" 2>/dev/null
      log "LOG ROTAZIONE: file troncato da ${size} bytes (mantenute ultime $keep righe)"
    fi
  fi
}

is_port_open() {
  local port=$1
  curl -s --max-time 2 "http://localhost:$port" >/dev/null 2>&1 || \
  nc -z -w2 localhost "$port" >/dev/null 2>&1
}

restart_backend() {
  log "CRASH RILEVATO: backend (porta $BACKEND_PORT) non risponde. Avvio riavvio..."

  BACKEND_LOCK_FILE="/tmp/start-backend.lock"
  if [ -f "$BACKEND_LOCK_FILE" ]; then
    LOCK_PID=$(cat "$BACKEND_LOCK_FILE" 2>/dev/null)
    if kill -0 "$LOCK_PID" 2>/dev/null; then
      log "Start-backend già in esecuzione (PID: $LOCK_PID), attendo che il backend si avvii..."
      return 0
    fi
    rm -f "$BACKEND_LOCK_FILE"
  fi

  pkill -f "node server_dist/index.js" 2>/dev/null || true
  pkill -f "tsx server" 2>/dev/null || true
  lsof -ti:"$BACKEND_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
  sleep 2
  log "RIAVVIO AVVIATO: backend (porta $BACKEND_PORT)..."
  bash WORKSPACE_PATH/scripts/start-backend.sh >> "$LOG_FILE" 2>&1 &
  log "RIAVVIO COMPLETATO: processo backend avviato in background"
}

restart_frontend() {
  log "CRASH RILEVATO: frontend (porta $FRONTEND_PORT) non risponde. Avvio riavvio..."

  LOCK_FILE="/tmp/start-expo.lock"
  if [ -f "$LOCK_FILE" ]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    if kill -0 "$LOCK_PID" 2>/dev/null; then
      log "Start-expo già in esecuzione (PID: $LOCK_PID), attendo che Metro si avvii..."
      return 0
    fi
    rm -f "$LOCK_FILE"
  fi

  pkill -f "metro" 2>/dev/null || true
  pkill -f "expo start" 2>/dev/null || true
  pkill -f "react-native start" 2>/dev/null || true
  lsof -ti:"$FRONTEND_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
  sleep 2
  log "RIAVVIO AVVIATO: frontend (porta $FRONTEND_PORT)..."
  bash WORKSPACE_PATH/scripts/start-expo.sh >> "$LOG_FILE" 2>&1 &
  log "RIAVVIO COMPLETATO: processo frontend avviato in background"
}

health_check() {
  local response
  response=$(curl -s --max-time 5 "http://localhost:$BACKEND_PORT/api/health" 2>&1)
  if echo "$response" | grep -q '"status":"ok"'; then
    log "HEALTH CHECK OK: /api/health risponde correttamente"
  else
    log "HEALTH CHECK FAIL: /api/health non risponde (risposta: $response)"
  fi
}

log "========================================="
log "WATCHDOG AVVIATO"
log "  Backend port: $BACKEND_PORT"
log "  Frontend port: $FRONTEND_PORT"
log "  Health check interval: ${HEALTH_CHECK_INTERVAL}s"
log "  Check interval: ${CHECK_INTERVAL}s"
log "  Restart cooldown backend: ${RESTART_COOLDOWN}s"
log "  Restart cooldown frontend: ${FRONTEND_RESTART_COOLDOWN}s"
log "  Log max size: $((LOG_MAX_BYTES / 1024))KB (rotazione automatica)"
log "========================================="

last_health_check=0
last_backend_restart=0
last_frontend_restart=0
backend_down_since=0
frontend_down_since=0
check_count=0

while [ "$RUNNING" -eq 1 ]; do
  now=$(date +%s)

  if is_port_open "$BACKEND_PORT"; then
    if [ "$backend_down_since" -gt 0 ]; then
      log "BACKEND RECUPERATO: porta $BACKEND_PORT risponde di nuovo"
      backend_down_since=0
    fi
  else
    if [ "$backend_down_since" -eq 0 ]; then
      backend_down_since=$now
    fi
    time_since_last_restart=$((now - last_backend_restart))
    if [ "$time_since_last_restart" -ge "$RESTART_COOLDOWN" ]; then
      restart_backend
      last_backend_restart=$now
    else
      log "BACKEND ANCORA GIU': prossimo riavvio tra $((RESTART_COOLDOWN - time_since_last_restart))s"
    fi
  fi

  if is_port_open "$FRONTEND_PORT"; then
    if [ "$frontend_down_since" -gt 0 ]; then
      log "FRONTEND RECUPERATO: porta $FRONTEND_PORT risponde di nuovo"
      frontend_down_since=0
    fi
  else
    if [ "$frontend_down_since" -eq 0 ]; then
      frontend_down_since=$now
    fi
    time_since_last_restart=$((now - last_frontend_restart))
    if [ "$time_since_last_restart" -ge "$FRONTEND_RESTART_COOLDOWN" ]; then
      restart_frontend
      last_frontend_restart=$now
    else
      log "FRONTEND ANCORA GIU': prossimo riavvio tra $((FRONTEND_RESTART_COOLDOWN - time_since_last_restart))s"
    fi
  fi

  if [ $((now - last_health_check)) -ge "$HEALTH_CHECK_INTERVAL" ]; then
    health_check
    last_health_check=$now
  fi

  check_count=$((check_count + 1))
  if [ $((check_count % 60)) -eq 0 ]; then
    rotate_log
  fi

  sleep "$CHECK_INTERVAL"
done

log "WATCHDOG: arresto completato."
```

---

## Script 4: riavvia-tutto.sh

```bash
#!/bin/bash
echo "============================================"
echo "  RIAVVIA TUTTO - NOME_APP"
echo "============================================"
echo ""

echo ">>> Massacro tutti i processi..."
fuser -k -9 FRONTEND_PORT/tcp 2>/dev/null || true
fuser -k -9 BACKEND_PORT/tcp 2>/dev/null || true
pkill -9 -f "expo start|metro|react-native start|tsx server" 2>/dev/null || true
sleep 1

echo ">>> Pulizia cache Metro e Expo..."
rm -rf WORKSPACE_PATH/node_modules/.cache 2>/dev/null
rm -rf WORKSPACE_PATH/.expo 2>/dev/null
rm -rf /tmp/metro-* 2>/dev/null
rm -rf /tmp/haste-* 2>/dev/null
rm -rf /tmp/react-* 2>/dev/null
echo "    Cache eliminata!"

echo ">>> Pulizia lock e temp orfani..."
rm -f /tmp/start-backend.lock /tmp/start-backend.flock 2>/dev/null
rm -f /tmp/start-expo.lock /tmp/start-expo.flock 2>/dev/null
rm -f /tmp/watchdog.flock 2>/dev/null
rm -f /tmp/metro.pid 2>/dev/null
rm -f /tmp/metro-opt-cycle* 2>/dev/null
echo "    Lock e temp eliminati!"

echo ">>> Verifica porte..."
if fuser BACKEND_PORT/tcp 2>/dev/null; then
  echo "    ATTENZIONE: porta BACKEND_PORT ancora occupata"
else
  echo "    Porta BACKEND_PORT libera"
fi
if fuser FRONTEND_PORT/tcp 2>/dev/null; then
  echo "    ATTENZIONE: porta FRONTEND_PORT ancora occupata"
else
  echo "    Porta FRONTEND_PORT libera"
fi

echo ""
echo ">>> Cache pulita, processi terminati, lock rimossi."
echo ">>> Riavvia i workflow 'Start Backend' e 'Start Frontend' per completare."
echo "============================================"
```

---

## OTA — Problemi ricorrenti e soluzioni

### Problema: EAS timeout durante publish-ota.sh → utenti bloccati sulla OTA precedente

**Sintomo**: `publish-ota.sh` completa la build del bundle custom e lo carica sul backend, ma il passo EAS (`bash scripts/eas.sh update`) va in timeout. Il messaggio di errore riporta `EAS_STATUS: TIMEOUT`.

**Motivo**: `OtaStartupChecker` usa `checkForUpdateAsync()` di EAS (expo-updates), non il custom backend. Se EAS non riceve la nuova OTA (perché il comando è andato in timeout), gli utenti che aprono l'app ricevono ancora la versione precedente dalla CDN EAS — ad esempio restano bloccati su OTA-6 anche se il backend serve già OTA-7.

**Soluzione: pubblicare una nuova OTA superseding con numero N+1**

Non tentare di ripetere manualmente il comando EAS. La procedura corretta è:

1. Incrementa `CURRENT_OTA_NUMBER` in `OtaStartupChecker` (es. da 7 a 8)
2. Aggiorna `ota-updates.json` con il nuovo numero OTA e le note di release
3. Esegui: `bash scripts/publish-ota.sh`

La nuova OTA (N+1) supera quella fallita: EAS distribuirà la versione corretta e `OtaStartupChecker` aggiornerà il numero OTA nel backend al termine.

**Regole critiche**:
- **MAI** usare `eas` grezzo o `npx eas-cli` direttamente — usare sempre `bash scripts/eas.sh` (wrapper ufficiale del progetto)
- Usa **sempre** `publish-ota.sh` per pubblicare OTA
- Aggiorna sempre `CURRENT_OTA_NUMBER` e `ota-updates.json` **prima** dell'export, non dopo
- Il bundle custom sul backend è già attivo dopo un timeout EAS — non è necessario ripubblicarlo, basta che EAS riceva la nuova versione tramite publish-ota.sh

---

## Note importanti

- **Non usare `npx expo start` direttamente in shell**: usa sempre i workflow Replit (`restart_workflow`) — i workflow iniettano le variabili d'ambiente corrette (`REPLIT_DEV_DOMAIN`, `PORT`, ecc.)
- **Metro come orphan process**: quando `npm run expo:dev` lancia Metro, il processo npm può uscire subito mentre Metro continua. Lo script attende il binding sulla porta, non il PID del launcher.
- **port_is_alive vs port_is_open**: durante la compilazione del bundle (~28-60s) Metro non risponde in 2s. Usa `max-time 60` nel monitoring loop per evitare falsi restart.
- **flock vs lock file**: usa `flock` (kernel-level) dove le race condition sono critiche (start-expo, watchdog); usa il lock file PID dove serve solo impedire avvii duplicati (start-backend).
- **NODE_OPTIONS memory**: `--max-old-space-size=1024` è calibrato per Replit con limite cgroup 8GB. Adatta al tuo piano.
- **Log file watchdog**: il file di log viene ruotato automaticamente quando supera LOG_MAX_BYTES (default 1MB). La rotazione mantiene la metà più recente delle righe.
- **Rebuild condizionale**: `needs_rebuild()` confronta il mtime di `server_dist/index.js` con i sorgenti `.ts`. Se nessun sorgente è più recente, salta la compilazione (~3-5s risparmiati per riavvio).
- **Graceful shutdown watchdog**: il trap SIGTERM/SIGINT imposta `RUNNING=0` e il loop esce pulitamente al ciclo successivo, senza processi zombie.
- **Pulizia temp orfani**: `start-expo.sh` elimina i log Metro più vecchi di 2 ore all'avvio. `riavvia-tutto.sh` rimuove tutti i file lock/flock/pid da `/tmp/`.
