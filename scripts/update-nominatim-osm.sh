#!/usr/bin/env bash
# =============================================================================
# BikerLink — Aggiornamento incrementale Nominatim con diff Geofabrik
#
# Cosa fa:
#   1. Verifica che il servizio Nominatim sia attivo.
#   2. Applica il diff incrementale più recente (Geofabrik Italy) via
#      `nominatim replication --once`.
#   3. Logga inizio, fine e risultato con timestamp in LOG_FILE.
#
# Eseguito automaticamente da: nominatim-update.timer (domenica 02:00)
# Manuale:  sudo bash /opt/nominatim/scripts/update-nominatim-osm.sh
# Log:      /var/log/nominatim-update.log
#
# ── Cambiare area geografica ─────────────────────────────────────────────────
# Per aggiornare l'Europa completa invece dell'Italia, modifica la variabile
# REPLICATION_URL qui sotto (o sovrascrivila via env):
#
#   REPLICATION_URL="https://download.geofabrik.de/europe-updates/"
#
# Nota: la REPLICATION_URL deve corrispondere all'area del PBF importato
# in fase di setup. Non è possibile applicare diff di un'area diversa.
# =============================================================================

set -euo pipefail

# ── Configurazione (override via variabile d'ambiente) ────────────────────────
NOMINATIM_SERVICE="${NOMINATIM_SERVICE:-nominatim}"
NOMINATIM_BUILD_DIR="${NOMINATIM_BUILD_DIR:-/opt/nominatim/build}"
NOMINATIM_PROJECT_DIR="${NOMINATIM_PROJECT_DIR:-/opt/nominatim}"
NOMINATIM_USER="${NOMINATIM_USER:-nominatim}"
LOG_FILE="${LOG_FILE:-/var/log/nominatim-update.log}"

# URL del server di replicazione Geofabrik.
# Predefinito: Italy (corrisponde al PBF italy-latest.osm.pbf importato dal setup).
# Per l'Europa completa: https://download.geofabrik.de/europe-updates/
REPLICATION_URL="${REPLICATION_URL:-https://download.geofabrik.de/europe/italy-updates/}"

# Nominatim env file: viene aggiornato se REPLICATION_URL non è ancora configurata.
NOMINATIM_ENV_FILE="${NOMINATIM_PROJECT_DIR}/.env"

# ── Funzioni di logging ───────────────────────────────────────────────────────
ts() { date '+%Y-%m-%d %H:%M:%S'; }

log_line() {
  local level="$1"; shift
  local msg="$*"
  echo "[$(ts)] [${level}] ${msg}" | tee -a "$LOG_FILE"
}

log()  { log_line "INFO " "$*"; }
ok()   { log_line "OK   " "$*"; }
warn() { log_line "WARN " "$*"; }
err()  { log_line "ERROR" "$*" >&2; }
die()  { err "$*"; exit 1; }

# ── Funzione principale ───────────────────────────────────────────────────────
main() {
  # Assicura che la directory di log esista e sia scrivibile
  LOG_DIR="$(dirname "$LOG_FILE")"
  if [[ ! -d "$LOG_DIR" ]]; then
    mkdir -p "$LOG_DIR" || die "Impossibile creare la directory di log: ${LOG_DIR}"
  fi
  touch "$LOG_FILE" 2>/dev/null || die "Impossibile scrivere nel log: ${LOG_FILE}"

  echo "" >> "$LOG_FILE"
  log "============================================================"
  log "Avvio aggiornamento Nominatim OSM (diff Geofabrik)"
  log "  Servizio:   ${NOMINATIM_SERVICE}"
  log "  Replica URL:${REPLICATION_URL}"
  log "  Project dir:${NOMINATIM_PROJECT_DIR}"
  log "============================================================"

  # ── 1. Verifica che il binario nominatim esista ───────────────────────────
  NOMINATIM_BIN="${NOMINATIM_BUILD_DIR}/nominatim"
  if [[ ! -x "$NOMINATIM_BIN" ]]; then
    die "Binario Nominatim non trovato: ${NOMINATIM_BIN}. Esegui prima setup-nominatim-server.sh."
  fi

  # ── 2. Verifica che il servizio systemd sia attivo ────────────────────────
  log "Verifica stato servizio ${NOMINATIM_SERVICE}..."

  if ! command -v systemctl >/dev/null 2>&1; then
    die "systemctl non disponibile. Questo script richiede un sistema con systemd."
  fi

  SERVICE_STATE="$(systemctl is-active "${NOMINATIM_SERVICE}" 2>/dev/null || true)"

  if [[ "$SERVICE_STATE" != "active" ]]; then
    warn "Il servizio '${NOMINATIM_SERVICE}' non è attivo (stato: ${SERVICE_STATE})."
    warn "L'aggiornamento richiede che Nominatim sia in esecuzione e che il database"
    warn "PostgreSQL sia accessibile. Avvialo con:"
    warn "  sudo systemctl start ${NOMINATIM_SERVICE}"
    warn "Aggiornamento annullato."
    exit 1
  fi

  ok "Servizio '${NOMINATIM_SERVICE}' attivo."

  # ── 3. Configura REPLICATION_URL nel file .env del progetto ──────────────
  # Nominatim legge la configurazione da <project-dir>/.env.
  # Se la variabile non è già impostata, la aggiunge.
  if [[ -f "$NOMINATIM_ENV_FILE" ]]; then
    if grep -q "^NOMINATIM_REPLICATION_URL=" "$NOMINATIM_ENV_FILE" 2>/dev/null; then
      CONFIGURED_URL="$(grep "^NOMINATIM_REPLICATION_URL=" "$NOMINATIM_ENV_FILE" | cut -d= -f2-)"
      if [[ "$CONFIGURED_URL" != "$REPLICATION_URL" ]]; then
        warn "NOMINATIM_REPLICATION_URL nel .env (${CONFIGURED_URL}) diversa da REPLICATION_URL (${REPLICATION_URL})."
        warn "Viene usata quella del .env. Per cambiare: modifica ${NOMINATIM_ENV_FILE}."
      else
        log "NOMINATIM_REPLICATION_URL già configurata: ${CONFIGURED_URL}"
      fi
    else
      log "Aggiungo NOMINATIM_REPLICATION_URL al file .env..."
      echo "NOMINATIM_REPLICATION_URL=${REPLICATION_URL}" >> "$NOMINATIM_ENV_FILE"
      ok "NOMINATIM_REPLICATION_URL aggiunta: ${REPLICATION_URL}"
    fi
  else
    log "Creo ${NOMINATIM_ENV_FILE} con NOMINATIM_REPLICATION_URL..."
    echo "NOMINATIM_REPLICATION_URL=${REPLICATION_URL}" > "$NOMINATIM_ENV_FILE"
    ok "File .env creato con NOMINATIM_REPLICATION_URL."
  fi

  # ── 4. Inizializza la replication se non ancora fatto ────────────────────
  # `nominatim replication --init` è idempotente: salta se già inizializzata.
  REPL_STATE_FILE="${NOMINATIM_PROJECT_DIR}/nominatim-replication-start.log"
  if [[ ! -f "$REPL_STATE_FILE" ]]; then
    log "Prima inizializzazione replication (nominatim replication --init)..."
    if sudo -u "$NOMINATIM_USER" "$NOMINATIM_BIN" replication \
         --project-dir "$NOMINATIM_PROJECT_DIR" \
         --init \
         >> "$LOG_FILE" 2>&1; then
      touch "$REPL_STATE_FILE"
      ok "Replication inizializzata."
    else
      die "Inizializzazione replication fallita. Controlla il log: ${LOG_FILE}"
    fi
  else
    log "Replication già inizializzata."
  fi

  # ── 5. Applica il diff più recente ────────────────────────────────────────
  log "Avvio nominatim replication --once..."
  START_TS="$(date +%s)"

  if sudo -u "$NOMINATIM_USER" "$NOMINATIM_BIN" replication \
       --project-dir "$NOMINATIM_PROJECT_DIR" \
       --once \
       >> "$LOG_FILE" 2>&1; then
    END_TS="$(date +%s)"
    ELAPSED=$(( END_TS - START_TS ))
    ok "Aggiornamento completato in ${ELAPSED}s."
  else
    END_TS="$(date +%s)"
    ELAPSED=$(( END_TS - START_TS ))
    die "nominatim replication --once fallita dopo ${ELAPSED}s. Controlla: ${LOG_FILE}"
  fi

  log "============================================================"
  ok "Aggiornamento OSM terminato. Log: ${LOG_FILE}"
  log "============================================================"
}

main "$@"
