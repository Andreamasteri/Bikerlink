#!/bin/bash
# metro-cache-nightly.sh — Job notturno pulizia .metro-cache/ alle 01:00 UTC.
#
# Lanciato in background da cerbero.sh all'avvio. Loop perpetuo:
#   1. Calcola i secondi mancanti alle 01:00 UTC di oggi/domani e dorme.
#   2. Sveglia: verifica se è sicuro cancellare (vedi sicurezza_purge sotto).
#   3. Cancella .metro-cache/ dal progetto.
#   4. Scrive il flag /tmp/.metro-cache-purged.
#   5. Logga in logs/cerbero.log.
#   6. Torna al punto 1 (prossima notte).
#
# Sicurezza purge (regola: "aspetta che la porta 8081 sia libera"):
#   - Lock libero (Metro spento)               → cancellazione immediata.
#   - Lock detenuto + porta NON risponde       → cancellazione immediata (Metro
#     si è fermato, lock ancora detenuto da start-expo.sh in uscita).
#   - Lock detenuto + porta 8081 risponde      → Metro in esecuzione → NON
#     cancellare; attendi fino a 5 min che la porta si liberi, poi skip (riprova
#     domani) senza terminare il loop.
#
# Questo script non usa `pgrep -f start-expo.sh` per non auto-bloccarsi quando
# è lanciato da cerbero.sh mentre start-expo.sh è in esecuzione.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

METRO_PORT="${METRO_PORT:-8081}"
METRO_LOCK_FILE="${METRO_LOCK_FILE:-/tmp/start-metro.lock}"
METRO_CACHE_PURGE_FLAG="${METRO_CACHE_PURGE_FLAG:-/tmp/.metro-cache-purged}"
CERBERO_LOG_FILE="${CERBERO_LOG_FILE:-$PROJECT_ROOT/logs/cerbero.log}"
METRO_CACHE_DIR="$PROJECT_ROOT/.metro-cache"

RUNNING=1
trap 'RUNNING=0' SIGTERM SIGINT

log() {
  # Scrive solo su stdout: il chiamante (cerbero.sh) prefissa ogni riga con
  # [TESTA 2 NIGHTLY] e la aggiunge a cerbero.log via pipeline.
  # Evita la doppia scrittura che si avrebbe se scrivessimo qui direttamente
  # nel file E venissimo anche catturati dalla pipeline del chiamante.
  echo "[metro-cache-nightly] $1"
}

# Secondi fino alla prossima occorrenza delle 01:00 UTC.
# Se sono già passate le 01:00, calcola per il giorno successivo.
seconds_until_0100_utc() {
  local now today_0100 diff
  now=$(date -u +%s)
  # Prova la sintassi GNU date (-d), poi BSD date (-jf).
  today_0100=$(date -u -d "$(date -u '+%Y-%m-%d') 01:00:00" +%s 2>/dev/null) || \
  today_0100=$(date -u -jf "%Y-%m-%d %H:%M:%S" "$(date -u '+%Y-%m-%d') 01:00:00" +%s 2>/dev/null) || \
  today_0100=0

  if [ "$today_0100" -eq 0 ]; then
    # Fallback: riprova tra 1 ora.
    echo 3600
    return
  fi

  diff=$(( today_0100 - now ))
  if [ "$diff" -le 0 ]; then
    diff=$(( diff + 86400 ))
  fi
  echo "$diff"
}

# Controlla se la cancellazione di .metro-cache/ è sicura.
#
# Regola (dal task spec): "se Metro è attivo (lock /tmp/start-metro.lock) aspetta
# che la porta 8081 sia libera prima di cancellare". Traduzione:
#   - Lock libero (Metro spento)              → SICURO immediato
#   - Lock detenuto + porta 8081 NON risponde → SICURO (Metro si è fermato)
#   - Lock detenuto + porta 8081 risponde     → NON SICURO (Metro attivo: aspetta)
#
# La purge è intenzionalmente conservativa: avviene quando Metro si ferma (notte
# di basso traffico). Il flag /tmp/.metro-cache-purged garantisce che al
# prossimo riavvio start-expo.sh usi --reset-cache, ricreando la cache pulita.
#
# Non usa pgrep per evitare auto-blocco se il chiamante è figlio di cerbero.sh.
# fd 201 — MAI fd 9 (start-expo lock owner) o fd 200 (cerbero restart_metro).
purge_safe() {
  if [ -f "$METRO_LOCK_FILE" ]; then
    exec 201>>"$METRO_LOCK_FILE"
    if ! flock -n 201; then
      exec 201>&-
      # Lock detenuto: Metro è attivo. Sicuro solo se la porta è già libera
      # (Metro si è fermato ma start-expo.sh non ha ancora rilasciato il lock).
      if curl -s --max-time 2 "http://localhost:$METRO_PORT" >/dev/null 2>&1; then
        return 1  # Porta risponde → Metro in esecuzione → NON sicuro.
      fi
      # Porta libera + lock detenuto → Metro fermato → sicuro.
      return 0
    fi
    flock -u 201 2>/dev/null || true
    exec 201>&-
  fi
  # Lock libero → Metro completamente spento → sicuro.
  return 0
}

log "Avviato — pulizia notturna .metro-cache/ alle 01:00 UTC ogni giorno."

while [ "$RUNNING" -eq 1 ]; do
  WAIT_SECS=$(seconds_until_0100_utc)
  log "Prossima pulizia in ${WAIT_SECS}s (ore 01:00 UTC)."

  # Sleep a tranche di 60s per reagire a SIGTERM in modo ragionevolmente rapido.
  SLEPT=0
  while [ "$SLEPT" -lt "$WAIT_SECS" ] && [ "$RUNNING" -eq 1 ]; do
    sleep 60 &
    wait $! 2>/dev/null || true
    SLEPT=$(( SLEPT + 60 ))
  done

  [ "$RUNNING" -eq 0 ] && break

  log "Ora di pulizia. Verifica sicurezza cancellazione .metro-cache/..."

  # Attendi al massimo 5 minuti che Metro esca dalla fase di avvio.
  # Se il timeout scade, saltiamo questa notte e riprendiamo domani (NO break 2).
  LOCK_WAIT=0
  SKIP_NIGHT=0
  while ! purge_safe; do
    if [ "$LOCK_WAIT" -ge 300 ]; then
      log "WARN: Metro ancora in avvio dopo 5 minuti — skip pulizia notturna, riprovo domani."
      SKIP_NIGHT=1
      break
    fi
    log "Metro in avvio (lock detenuto) — attendo 10s... (${LOCK_WAIT}s/300s)"
    sleep 10
    LOCK_WAIT=$(( LOCK_WAIT + 10 ))
  done

  [ "$SKIP_NIGHT" -eq 1 ] && continue  # Riprova domani (loop esterno continua).
  [ "$RUNNING" -eq 0 ] && break

  log "Condizione sicura — inizio pulizia .metro-cache/..."

  if [ -d "$METRO_CACHE_DIR" ]; then
    if rm -rf "$METRO_CACHE_DIR" 2>/dev/null; then
      log "OK: .metro-cache/ rimossa."
    else
      log "WARN: errore durante la rimozione di .metro-cache/ — salto il flag, riprovo domani."
      continue
    fi
  else
    log "INFO: .metro-cache/ non presente — niente da rimuovere."
  fi

  touch "$METRO_CACHE_PURGE_FLAG" 2>/dev/null || true
  log "Flag scritto: $METRO_CACHE_PURGE_FLAG — Metro ripartirà con --reset-cache al prossimo avvio."
done

log "Arresto completato."
