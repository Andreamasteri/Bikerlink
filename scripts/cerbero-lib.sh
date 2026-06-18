#!/bin/bash
# cerbero-lib.sh — Libreria condivisa di Cerbero, il guardiano a tre teste.
#
# Contiene SOLO funzioni stateless e helper. Non avvia loop, non tiene stato:
# va caricata con `source` da cerbero.sh (o da altri script che ne hanno bisogno).
#
# Funzioni esportate:
#   cerbero_log            — log su stdout + file con timestamp
#   cerbero_rotate_log     — rotazione log (max 1 MB, mantiene ultima metà)
#   cerbero_port_open      — true se una porta TCP risponde (curl, fallback nc)
#   cerbero_health_backend — stato backend via /api/health (3 stati, vedi sotto)
#   cerbero_metro_starting — TESTA 3: true se un avvio Metro è in corso (lock+pgrep)
#   kill_port_pid          — kill MIRATO del PID in ascolto su una porta (mai per nome)

# ── Configurazione (override possibile dal chiamante prima del source) ─────────
CERBERO_LOG_FILE="${CERBERO_LOG_FILE:-/home/runner/workspace/logs/cerbero.log}"
CERBERO_LOG_MAX_BYTES="${CERBERO_LOG_MAX_BYTES:-1048576}"
METRO_LOCK_FILE="${METRO_LOCK_FILE:-/tmp/start-metro.lock}"
BACKEND_PORT="${BACKEND_PORT:-5000}"

# ── Logging ───────────────────────────────────────────────────────────────────
cerbero_log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo "$msg"
  echo "$msg" >> "$CERBERO_LOG_FILE"
}

# Rotazione: se il file supera CERBERO_LOG_MAX_BYTES, tiene solo l'ultima metà.
cerbero_rotate_log() {
  [ -f "$CERBERO_LOG_FILE" ] || return 0
  local size
  size=$(stat -c%s "$CERBERO_LOG_FILE" 2>/dev/null || echo 0)
  if [ "$size" -gt "$CERBERO_LOG_MAX_BYTES" ]; then
    local lines keep
    lines=$(wc -l < "$CERBERO_LOG_FILE")
    keep=$((lines / 2))
    tail -n "$keep" "$CERBERO_LOG_FILE" > "${CERBERO_LOG_FILE}.tmp" 2>/dev/null
    mv "${CERBERO_LOG_FILE}.tmp" "$CERBERO_LOG_FILE" 2>/dev/null
    cerbero_log "LOG ROTAZIONE: troncato da ${size} bytes (mantenute ultime $keep righe)"
  fi
}

# ── Porta TCP generica ────────────────────────────────────────────────────────
# True (0) se la porta risponde. curl come metodo primario (nc non sempre nel
# sandbox), fallback nc dove disponibile. Stesso metodo di start.sh/watchdog.
cerbero_port_open() {
  local port=$1
  curl -s --max-time 2 "http://localhost:$port" >/dev/null 2>&1 || \
  nc -z -w2 localhost "$port" >/dev/null 2>&1
}

# ── TESTA 1: salute backend via /api/health ───────────────────────────────────
# /api/health è initializing-aware: 503 {status:initializing} durante il boot DB,
# 200 {status:ok} a regime. Distinguiamo 3 stati per NON riavviare un backend che
# sta solo inizializzando (un restart in quella finestra → crash loop):
#   return 0  → backend pronto      (HTTP 200, "status":"ok")
#   return 2  → backend in avvio    (raggiungibile ma non ancora pronto, es. 503)
#   return 1  → backend IRRAGGIUNGIBILE (porta chiusa/timeout) → da riavviare
cerbero_health_backend() {
  local body code
  body=$(curl -s --max-time 3 -w $'\n%{http_code}' "http://localhost:$BACKEND_PORT/api/health" 2>/dev/null)
  code=$(printf '%s' "$body" | tail -n1)
  if [ -z "$code" ] || [ "$code" = "000" ]; then
    return 1
  fi
  if printf '%s' "$body" | grep -q '"status":"ok"'; then
    return 0
  fi
  return 2
}

# ── TESTA 3: il cancello ──────────────────────────────────────────────────────
# True (0) se un avvio Metro è realmente in corso, con DOPPIO segnale:
#   1) processo scripts/start-expo.sh attivo (pgrep), OPPURE
#   2) lock /tmp/start-metro.lock ancora detenuto (flock -n fallisce).
# Usa un fd dedicato (200), MAI fd 9 (di start-expo.sh) né fd 9 di cerbero.sh
# (single-instance). Il lock viene solo SONDATO e rilasciato subito: non lo
# deteniamo né lo rimuoviamo qui.
cerbero_metro_starting() {
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

# ── Kill MIRATO per porta ─────────────────────────────────────────────────────
# Termina SOLO il PID in ascolto sulla porta indicata: SIGTERM → attesa 2s →
# SIGKILL se ancora vivo. MAI pkill per nome (colpirebbe processi non correlati).
kill_port_pid() {
  local port=$1
  lsof -ti:"$port" 2>/dev/null | xargs -r kill -TERM 2>/dev/null || true
  sleep 2
  lsof -ti:"$port" 2>/dev/null | xargs -r kill -KILL 2>/dev/null || true
}
