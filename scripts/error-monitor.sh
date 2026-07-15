#!/bin/bash
# error-monitor.sh — Monitora solo il backend (porta 5000).
# Metro/frontend non più in uso (EAS build + OTA).

BACKEND_PORT=5000
PROD_HOST="https://bikerlink.replit.app"
LOG_FILE="logs/error-monitor.log"
CHECK_INTERVAL=30
LOG_MAX_LINES=2000

# ── Configurazione alert crash ────────────────────────────────────────────────
# Numero di crash consecutivi (nella finestra) che attivano l'alert
CRASH_ALERT_THRESHOLD=3
# Finestra di osservazione in secondi (default: 300 = 5 minuti)
CRASH_ALERT_WINDOW_SEC=300
# Cooldown tra un alert e il successivo in secondi (default: 600 = 10 minuti)
CRASH_ALERT_COOLDOWN_SEC=600
# File dove vengono scritti gli alert (oltre al log principale)
CRASH_ALERT_LOG="logs/crash-alerts.log"
# Telegram: impostare TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID nell'ambiente per ricevere notifiche
# TELEGRAM_BOT_TOKEN=""
# TELEGRAM_CHAT_ID=""
# Webhook generico: impostare CRASH_ALERT_WEBHOOK_URL per ricevere una POST JSON
# CRASH_ALERT_WEBHOOK_URL=""

mkdir -p logs

# ── Unica istanza ────────────────────────────────────────────────────────────
exec 9>>"/tmp/error-monitor.flock"
if ! flock -n 9; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Altra istanza gia' in esecuzione. Uscita."
  exit 0
fi

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"
}

rotate_log() {
  if [ -f "$LOG_FILE" ]; then
    local lines
    lines=$(wc -l < "$LOG_FILE" 2>/dev/null || echo 0)
    if [ "$lines" -gt "$LOG_MAX_LINES" ]; then
      tail -n $((LOG_MAX_LINES / 2)) "$LOG_FILE" > "${LOG_FILE}.tmp" 2>/dev/null
      mv "${LOG_FILE}.tmp" "$LOG_FILE" 2>/dev/null
      log "LOG_ROTATE: troncato a $((LOG_MAX_LINES / 2)) righe"
    fi
  fi
}

# ── Alert crash ───────────────────────────────────────────────────────────────
# File temporanei per il contatore crash
CRASH_TIMESTAMPS_FILE="/tmp/em_crash_timestamps"
CRASH_LAST_ALERT_FILE="/tmp/em_last_crash_alert"
# Cursore: ultima riga letta in backend-crashes.log (per lettura incrementale)
CRASH_LOG_CURSOR_FILE="/tmp/em_crash_log_cursor"

# Registra N eventi crash e verifica se superare la soglia.
# $1 = numero di nuovi crash da registrare (default 1)
track_crash_and_alert() {
  local new_events="${1:-1}"
  local now
  now=$(date +%s)

  # Aggiungi un timestamp per ogni nuovo evento crash
  local i
  for ((i = 0; i < new_events; i++)); do
    echo "$now" >> "$CRASH_TIMESTAMPS_FILE"
  done

  # Elimina i timestamp più vecchi della finestra
  local cutoff=$((now - CRASH_ALERT_WINDOW_SEC))
  local tmp_file="/tmp/em_crash_timestamps_tmp"
  awk -v cutoff="$cutoff" '$1 >= cutoff' "$CRASH_TIMESTAMPS_FILE" > "$tmp_file" 2>/dev/null
  mv "$tmp_file" "$CRASH_TIMESTAMPS_FILE" 2>/dev/null

  # Conta i crash nella finestra
  local crash_count=0
  if [ -f "$CRASH_TIMESTAMPS_FILE" ]; then
    crash_count=$(wc -l < "$CRASH_TIMESTAMPS_FILE" 2>/dev/null | tr -d ' ')
  fi

  log "CRASH_COUNTER: $crash_count crash negli ultimi ${CRASH_ALERT_WINDOW_SEC}s (soglia: ${CRASH_ALERT_THRESHOLD}, +${new_events} nuovi)"

  # Verifica soglia
  if [ "$crash_count" -ge "$CRASH_ALERT_THRESHOLD" ]; then
    # Verifica cooldown
    local last_alert=0
    if [ -f "$CRASH_LAST_ALERT_FILE" ]; then
      last_alert=$(cat "$CRASH_LAST_ALERT_FILE" 2>/dev/null || echo 0)
    fi
    local elapsed_since_alert=$((now - last_alert))

    if [ "$elapsed_since_alert" -ge "$CRASH_ALERT_COOLDOWN_SEC" ]; then
      fire_crash_alert "$crash_count"
      echo "$now" > "$CRASH_LAST_ALERT_FILE"
    else
      local remaining=$((CRASH_ALERT_COOLDOWN_SEC - elapsed_since_alert))
      log "CRASH_ALERT_SUPPRESSED: soglia superata ($crash_count crash) ma cooldown attivo (ancora ${remaining}s)"
    fi
  fi
}

# Invia l'alert tramite tutti i canali configurati
fire_crash_alert() {
  local count="$1"
  local ts
  ts=$(date '+%Y-%m-%d %H:%M:%S')
  local msg="[CRASH ALERT] $ts — $count crash del backend rilevati in ${CRASH_ALERT_WINDOW_SEC}s (soglia: ${CRASH_ALERT_THRESHOLD})"

  # 1) Log dedicato
  echo "$msg" >> "$CRASH_ALERT_LOG"
  log "CRASH_ALERT_FIRED: $count crash nella finestra — alert registrato in $CRASH_ALERT_LOG"

  # 2) Telegram (se configurato)
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    local tg_text
    tg_text="🚨 *BikerLink Backend Crash Alert*%0A${count} crash rilevati in $((CRASH_ALERT_WINDOW_SEC / 60)) min (soglia: ${CRASH_ALERT_THRESHOLD})%0A🕐 ${ts}"
    curl -s --max-time 10 \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_CHAT_ID}&text=${tg_text}&parse_mode=Markdown" \
      > /dev/null 2>&1 && log "CRASH_ALERT_TELEGRAM: notifica inviata" \
                        || log "CRASH_ALERT_TELEGRAM_FAIL: invio fallito"
  fi

  # 3) Webhook generico (se configurato)
  if [ -n "${CRASH_ALERT_WEBHOOK_URL:-}" ]; then
    local payload
    payload="{\"event\":\"backend_crash_alert\",\"crash_count\":${count},\"threshold\":${CRASH_ALERT_THRESHOLD},\"window_sec\":${CRASH_ALERT_WINDOW_SEC},\"timestamp\":\"${ts}\"}"
    curl -s --max-time 10 -X POST \
      -H "Content-Type: application/json" \
      -d "$payload" \
      "$CRASH_ALERT_WEBHOOK_URL" \
      > /dev/null 2>&1 && log "CRASH_ALERT_WEBHOOK: notifica inviata" \
                        || log "CRASH_ALERT_WEBHOOK_FAIL: invio fallito"
  fi
}

# ── Check 1: Backend /api/health ─────────────────────────────────────────────
check_backend() {
  local http_code start_time end_time elapsed

  start_time=$(date +%s%3N)
  http_code=$(curl -s --max-time 5 --connect-timeout 3 \
    -o /tmp/em_backend_health.txt -w "%{http_code}" \
    "http://localhost:$BACKEND_PORT/api/health" 2>/dev/null)
  end_time=$(date +%s%3N)
  elapsed=$((end_time - start_time))

  local body
  body=$(cat /tmp/em_backend_health.txt 2>/dev/null)

  if [ "$http_code" = "200" ]; then
    local initializing
    initializing=$(echo "$body" | grep -o '"initializing":[a-z]*' | cut -d: -f2)
    if [ "$initializing" = "true" ]; then
      log "BACKEND_INIT: /api/health 200 — ancora in inizializzazione (${elapsed}ms)"
    else
      log "BACKEND_OK: /api/health 200 — ${elapsed}ms"
    fi
  elif [ "$http_code" = "000" ] || [ -z "$http_code" ]; then
    log "BACKEND_DOWN: /api/health non risponde (timeout/crash)"
  else
    local trimmed
    trimmed=$(echo "$body" | head -c 150)
    log "BACKEND_ERROR: /api/health HTTP $http_code — ${elapsed}ms — $trimmed"
  fi
}

# ── Check 2: Crash backend recenti ───────────────────────────────────────────
# Usa un cursore (numero di righe già lette) per leggere solo le nuove righe
# dal file di crash, garantendo un conteggio preciso anche in caso di burst.
check_recent_crashes() {
  local crash_log="logs/backend-crashes.log"
  [ -f "$crash_log" ] || return 0

  # Leggi il cursore (ultima riga già processata)
  local raw_cursor last_line=0
  if [ -f "$CRASH_LOG_CURSOR_FILE" ]; then
    raw_cursor=$(cat "$CRASH_LOG_CURSOR_FILE" 2>/dev/null)
    # Usa il valore solo se è un intero valido, altrimenti 0
    [[ "$raw_cursor" =~ ^[0-9]+$ ]] && last_line="$raw_cursor"
    # Sanity: se il file è stato ruotato/troncato, reset del cursore
    local current_total
    current_total=$(wc -l < "$crash_log" 2>/dev/null | tr -d ' ')
    if [ "$last_line" -gt "${current_total:-0}" ]; then
      last_line=0
    fi
  fi

  # Leggi TUTTE le nuove righe dall'ultima posizione
  local new_lines
  new_lines=$(tail -n +"$((last_line + 1))" "$crash_log" 2>/dev/null)

  # Aggiorna il cursore al numero totale di righe correnti
  local new_total
  new_total=$(wc -l < "$crash_log" 2>/dev/null | tr -d ' ')
  echo "$new_total" > "$CRASH_LOG_CURSOR_FILE"

  if [ -z "$new_lines" ]; then
    return 0
  fi

  # Conta e logga ogni nuova riga di crash (una per evento reale)
  local event_count=0
  while IFS= read -r line; do
    if [ -n "$line" ]; then
      log "BACKEND_CRASH: $(echo "$line" | head -c 200)"
      event_count=$((event_count + 1))
    fi
  done <<< "$new_lines"

  # Aggiorna il contatore passando il numero esatto di eventi rilevati
  if [ "$event_count" -gt 0 ]; then
    track_crash_and_alert "$event_count"
  fi
}


# ── Check 4: Last.fm route produzione (ogni 10 cicli, ~5 min) ─────────────────
check_lastfm_prod() {
  local http_code
  http_code=$(curl -s --max-time 8 --connect-timeout 5 \
    -o /dev/null -w "%{http_code}" \
    "$PROD_HOST/api/lastfm/status" 2>/dev/null)

  # 401 = route viva, auth richiesta (atteso per chiamata non autenticata)
  # 200 = route viva (non dovrebbe succedere senza session ma accettabile)
  if [ "$http_code" = "401" ] || [ "$http_code" = "200" ]; then
    log "LASTFM_OK: GET $PROD_HOST/api/lastfm/status → $http_code"
  elif [ "$http_code" = "000" ] || [ -z "$http_code" ]; then
    log "LASTFM_WARN: GET $PROD_HOST/api/lastfm/status → timeout/non raggiungibile"
  else
    log "LASTFM_WARN: GET $PROD_HOST/api/lastfm/status → $http_code (inatteso)"
  fi
}

# ── Check 5: Endpoint critici locali (ogni 10 cicli, ~5 min) ──────────────────
# Proba endpoint che coprono telemetria, road-hazards e matching.
# Risposta 5xx → ENDPOINT_ERROR. Auth richiesta (401/403) = route viva → OK.
check_critical_endpoints() {
  local endpoints=(
    "http://localhost:$BACKEND_PORT/api/road-hazards"
    "http://localhost:$BACKEND_PORT/api/admin/telemetry-stats"
    "http://localhost:$BACKEND_PORT/api/admin/telemetry/users"
    "http://localhost:$BACKEND_PORT/api/proposals"
  )

  for url in "${endpoints[@]}"; do
    local http_code path_part
    path_part=$(echo "$url" | sed "s|http://localhost:$BACKEND_PORT||")
    http_code=$(curl -s --max-time 6 --connect-timeout 3 \
      -o /tmp/em_endpoint_check.txt -w "%{http_code}" \
      "$url" 2>/dev/null)

    if [ "$http_code" = "000" ] || [ -z "$http_code" ]; then
      log "ENDPOINT_WARN: $path_part → timeout/non raggiungibile"
    elif [ "${http_code:0:1}" = "5" ]; then
      local trimmed
      trimmed=$(cat /tmp/em_endpoint_check.txt 2>/dev/null | head -c 150)
      log "ENDPOINT_ERROR: $path_part → $http_code — $trimmed"
    else
      log "ENDPOINT_OK: $path_part → $http_code"
    fi
  done
}

# ── Ciclo principale ─────────────────────────────────────────────────────────
run_all_checks() {
  check_backend
  check_recent_crashes
}

# Azzera il contatore crash all'avvio (nuova sessione = finestra scorrevole pulita)
# La soglia è valutata su una finestra temporale mobile (es. 3 crash negli ultimi 5 min),
# non su crash consecutivi senza interruzione.
> "$CRASH_TIMESTAMPS_FILE" 2>/dev/null
# Inizializza il cursore alla lunghezza corrente del log: le righe già
# presenti a startup sono storia precedente, non crash nuovi da contare.
_init_lines=0
[ -f "logs/backend-crashes.log" ] && \
  _init_lines=$(wc -l < "logs/backend-crashes.log" 2>/dev/null | tr -d ' ')
echo "${_init_lines:-0}" > "$CRASH_LOG_CURSOR_FILE"

log "============================================"
log "ERROR MONITOR AVVIATO"
log "  Backend port: $BACKEND_PORT"
log "  Produzione:   $PROD_HOST"
log "  Intervallo:   ${CHECK_INTERVAL}s"
log "  Log:          $LOG_FILE"
log "  Checks/ciclo: backend, backend-crashes"
log "  Check Last.fm + endpoint critici: ogni 10 cicli (~5 min)"
log "  Crash alert:  soglia=${CRASH_ALERT_THRESHOLD} in ${CRASH_ALERT_WINDOW_SEC}s, cooldown=${CRASH_ALERT_COOLDOWN_SEC}s"
log "  Alert log:    $CRASH_ALERT_LOG"
log "============================================"

run_all_checks

CYCLE=0
while true; do
  sleep "$CHECK_INTERVAL"
  CYCLE=$((CYCLE + 1))

  run_all_checks

  if [ $((CYCLE % 10)) -eq 0 ]; then
    check_lastfm_prod
    check_critical_endpoints
  fi


  if [ $((CYCLE % 20)) -eq 0 ]; then
    rotate_log
  fi
done
