#!/bin/bash
# start-expo.sh — Avvia il dev server Expo con pulizia Metro condizionale.
# Se package.json (e package-lock.json) non sono cambiati dall'ultimo avvio,
# riusa la cache Metro esistente (nessun --reset-cache): startup più veloce.
# Se il checksum è cambiato (nuovi pacchetti), esegue clean-metro.sh + --reset-cache.
#
# Lock file: /tmp/start-metro.lock — acquisizione atomica con flock(1).
# Impedisce che il Watchdog lanci un secondo Metro mentre questo è ancora in avvio.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
METRO_PORT=8081
LOCK_FILE="/tmp/start-metro.lock"
CACHE_KEY_FILE="/tmp/.metro-cache-key"

# Timestamp avvio per calcolare uptime Metro al momento della morte.
METRO_START_TS=$(date +%s)

# Carica libreria diagnostica crash (solo osservazione, nessun side-effect).
# shellcheck source=scripts/metro-crash-diag.sh
source "$SCRIPT_DIR/metro-crash-diag.sh"

# ── Lock atomico con flock ────────────────────────────────────────────────────
# fd 9 aperto in scrittura (crea il file se assente, non tronca se presente).
# flock -n 9 fallisce immediatamente se il lock è già detenuto da un altro PID.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || true)
  if [ -z "$LOCK_PID" ] || ! [[ "$LOCK_PID" =~ ^[0-9]+$ ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Metro startup già in corso (PID non ancora scritto nel lock) — skip (già in esecuzione)"
  elif ! kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Metro startup detenuto da flock ma PID $LOCK_PID risulta morto — skip per sicurezza (già in esecuzione)"
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Metro startup già in corso (PID: $LOCK_PID) — skip (già in esecuzione)"
  fi
  # Exit code 2 = "saltato perché già in esecuzione" (NON un crash).
  # start.sh usa questo codice per distinguere uno skip da un vero crash Metro.
  exit 2
fi
# Scrivi il PID corrente nel file (utile per diagnostica e watchdog)
: >&9
echo $$ >&9

cleanup_lock() {
  flock -u 9 2>/dev/null || true
  rm -f "$LOCK_FILE"
}
trap cleanup_lock EXIT

# ── Verifica flag pulizia notturna (prima della logica checksum) ──────────────
# Se il job notturno (lanciato da cerbero.sh) ha cancellato .metro-cache/ e
# scritto il flag, imposta FORCE_RESET=1 così da passare --reset-cache a Expo
# indipendentemente dal checksum delle dipendenze.
# shellcheck source=scripts/metro-cache-check.sh
source "$SCRIPT_DIR/metro-cache-check.sh"

# ── Kill porta 8081 se già occupata ──────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pulizia porta $METRO_PORT in corso..."
PIDS_ON_PORT=$(lsof -ti:"$METRO_PORT" 2>/dev/null || true)
if [ -n "$PIDS_ON_PORT" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Processo(i) su porta $METRO_PORT: $PIDS_ON_PORT — SIGTERM..."
  echo "$PIDS_ON_PORT" | xargs kill -TERM 2>/dev/null || true
  sleep 2
  PIDS_ON_PORT=$(lsof -ti:"$METRO_PORT" 2>/dev/null || true)
  if [ -n "$PIDS_ON_PORT" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Processo(i) ancora su porta $METRO_PORT — SIGKILL..."
    echo "$PIDS_ON_PORT" | xargs kill -9 2>/dev/null || true
  fi
fi

# Attendi che la porta sia effettivamente libera (max 5s), poi fallisci se ancora occupata
PORT_FREE=0
for i in 1 2 3 4 5; do
  if ! lsof -ti:"$METRO_PORT" >/dev/null 2>&1; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Porta $METRO_PORT libera (${i}s)."
    PORT_FREE=1
    break
  fi
  sleep 1
done

if [ "$PORT_FREE" -eq 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRORE: porta $METRO_PORT ancora occupata dopo 5s — impossibile avviare Metro."
  exit 1
fi

# ── Checksum condizionale: reset-cache solo se le dipendenze sono cambiate ────
# Calcola il checksum di package.json + package-lock.json (se presente).
# Usa md5sum se disponibile, altrimenti sha1sum.
compute_checksum() {
  local files=()
  [ -f "$PROJECT_ROOT/package.json" ] && files+=("$PROJECT_ROOT/package.json")
  [ -f "$PROJECT_ROOT/package-lock.json" ] && files+=("$PROJECT_ROOT/package-lock.json")
  [ -f "$PROJECT_ROOT/node_modules/.yarn-integrity" ] && files+=("$PROJECT_ROOT/node_modules/.yarn-integrity")
  if [ ${#files[@]} -eq 0 ]; then
    echo "no-files"
    return
  fi
  if command -v md5sum >/dev/null 2>&1; then
    cat "${files[@]}" | md5sum | awk '{print $1}'
  elif command -v sha1sum >/dev/null 2>&1; then
    cat "${files[@]}" | sha1sum | awk '{print $1}'
  else
    # Fallback: usa la data di modifica di package.json
    stat -c '%Y' "$PROJECT_ROOT/package.json" 2>/dev/null || echo "no-stat"
  fi
}

CURRENT_KEY=$(compute_checksum)
SAVED_KEY=$(cat "$CACHE_KEY_FILE" 2>/dev/null || echo "")

RESET_CACHE=0
if [ "$CURRENT_KEY" != "$SAVED_KEY" ] || [ -z "$SAVED_KEY" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Dipendenze cambiate (checksum: ${SAVED_KEY:-none} → $CURRENT_KEY) — reset cache Metro"
  RESET_CACHE=1
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Dipendenze invariate (checksum: $CURRENT_KEY) — riuso cache Metro"
fi

# OR logic: FORCE_RESET=1 (flag notturno) forza il reset anche se le dipendenze
# non sono cambiate. FORCE_RESET è già impostato da metro-cache-check.sh (sourced
# sopra) e vale 1 solo se il flag /tmp/.metro-cache-purged era presente.
if [ "${FORCE_RESET:-0}" -eq 1 ] && [ "$RESET_CACHE" -eq 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] FORCE_RESET=1 da pulizia notturna — reset cache Metro forzato"
  RESET_CACHE=1
fi

if [ "$RESET_CACHE" -eq 1 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Avvio frontend — pulizia Metro in corso..."
  bash "$SCRIPT_DIR/clean-metro.sh"
  echo "$CURRENT_KEY" > "$CACHE_KEY_FILE"
fi

# ── Crea directory log Expo (evita ENOENT al primo avvio) ────────────────────
mkdir -p "$PROJECT_ROOT/.expo/dev/logs"

# ── Log sessione dedicato ─────────────────────────────────────────────────────
# start-expo.sh può essere lanciato sia da start.sh (stdout → /tmp/metro.log)
# sia da cerbero.sh (stdout → cerbero.log). In entrambi i casi questo file
# cattura SEMPRE l'output di Expo, garantendo che le ultime righe siano
# disponibili per la diagnostica crash indipendentemente dal chiamante.
# Rotazione: max METRO_SESSION_LOG_MAX_LINES righe, mantenuta l'ultima metà.
if [ -f "$METRO_SESSION_LOG" ]; then
  session_lines=$(wc -l < "$METRO_SESSION_LOG" 2>/dev/null || echo 0)
  if [ "$session_lines" -ge "$METRO_SESSION_LOG_MAX_LINES" ]; then
    session_keep=$(( METRO_SESSION_LOG_MAX_LINES / 2 ))
    tail -n "$session_keep" "$METRO_SESSION_LOG" > "${METRO_SESSION_LOG}.tmp" 2>/dev/null && \
      mv "${METRO_SESSION_LOG}.tmp" "$METRO_SESSION_LOG" 2>/dev/null || true
  fi
fi

# ── Avvio Expo come processo figlio (non exec) ────────────────────────────────
# Importante: NON usare exec qui. exec sostituisce la shell corrente e impedisce
# l'esecuzione del trap EXIT, lasciando il lock file orfano.
#
# `> >(tee -a ...)` redirige stdout al session log SENZA alterare l'exit code
# (process substitution è asincrona, non un pipe): EXPO_EXIT cattura solo
# l'exit code di npx expo start, non di tee.

# ── Registra l'inizio di questa sessione Metro ────────────────────────────────
# Genera un session_id univoco PRIMA di avviare Expo e lo scrive in
# /tmp/metro-session-id. Sia il crash record (al termine, qui sotto) sia lo
# snapshot di Cerbero (al prossimo ciclo di check) leggono lo stesso file →
# correlazione affidabile anche se Cerbero rileva il crash 10s dopo l'uscita.
metro_diag_new_session 2>/dev/null || true

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Avvio Expo dev server (reset_cache=$RESET_CACHE)..."
cd "$PROJECT_ROOT"

EXPO_EXIT=0
if [ "$RESET_CACHE" -eq 1 ]; then
  npx expo start --reset-cache > >(tee -a "$METRO_SESSION_LOG") 2>&1 || EXPO_EXIT=$?
else
  npx expo start > >(tee -a "$METRO_SESSION_LOG") 2>&1 || EXPO_EXIT=$?
fi

# ── Diagnostica crash: registra causa uscita ─────────────────────────────────
# Registra tutti gli exit ≠ 0 e ≠ 2 (skip). Include exit 143 (SIGTERM da
# piattaforma) per accumulare prove del riciclo periodico nel tempo.
# Il session_id letto da metro_diag_record_crash è lo STESSO generato sopra da
# metro_diag_new_session → correla con lo snapshot che Cerbero scriverà dopo.
if [ "$EXPO_EXIT" -ne 0 ] && [ "$EXPO_EXIT" -ne 2 ]; then
  METRO_UPTIME=$(( $(date +%s) - METRO_START_TS ))
  # Leggi last_lines dal session log (sempre disponibile, indipendente dal
  # chiamante — sia start.sh sia cerbero.sh).
  METRO_LAST_LINES=$(tail -n 20 "$METRO_SESSION_LOG" 2>/dev/null || true)
  metro_diag_record_crash "$EXPO_EXIT" "$METRO_UPTIME" "$METRO_LAST_LINES" 2>/dev/null || true
fi

# Propaga l'exit code originale di Expo.
exit "$EXPO_EXIT"
