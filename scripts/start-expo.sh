#!/bin/bash
# start-expo.sh — Avvia il dev server Expo con pulizia profonda Metro preventiva.
# Esegue clean-metro.sh prima di lanciare expo start --reset-cache,
# garantendo che ogni avvio parta da uno stato completamente pulito.
#
# Lock file: /tmp/start-metro.lock — acquisizione atomica con flock(1).
# Impedisce che il Watchdog lanci un secondo Metro mentre questo è ancora in avvio.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
METRO_PORT=8081
LOCK_FILE="/tmp/start-metro.lock"

# ── Lock atomico con flock ────────────────────────────────────────────────────
# fd 9 aperto in scrittura (crea il file se assente, non tronca se presente).
# flock -n 9 fallisce immediatamente se il lock è già detenuto da un altro PID.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "?")
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Metro startup già in corso (PID: $LOCK_PID) — skip"
  exit 0
fi
# Scrivi il PID corrente nel file (utile per diagnostica e watchdog)
echo $$ >&9

cleanup_lock() {
  flock -u 9 2>/dev/null || true
  rm -f "$LOCK_FILE"
}
trap cleanup_lock EXIT

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

# ── Pulizia Metro ─────────────────────────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Avvio frontend — pulizia Metro in corso..."

bash "$SCRIPT_DIR/clean-metro.sh"

# ── Crea directory log Expo (evita ENOENT al primo avvio) ────────────────────
mkdir -p "$PROJECT_ROOT/.expo/dev/logs"

# ── Avvio Expo come processo figlio (non exec) ────────────────────────────────
# Importante: NON usare exec qui. exec sostituisce la shell corrente e impedisce
# l'esecuzione del trap EXIT, lasciando il lock file orfano.
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Avvio Expo dev server..."
cd "$PROJECT_ROOT"
npx expo start --reset-cache
