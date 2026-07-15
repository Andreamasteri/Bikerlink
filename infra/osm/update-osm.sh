#!/usr/bin/env bash
# update-osm.sh — Aggiornamento mensile dati OSM per GraphHopper (BikerLink)
# Esecuzione: chiamare direttamente o tramite cron (vedere README.md)

# ── Configurazione ───────────────────────────────────────────────────────────
AREA="${OSM_AREA:-italy}"
GEOFABRIK_BASE="https://download.geofabrik.de"
GEOFABRIK_URL="${GEOFABRIK_URL:-${GEOFABRIK_BASE}/europe/${AREA}-latest.osm.pbf}"
GH_DIR="${GH_DIR:-/opt/graphhopper}"
GH_DATA_DIR="${GH_DATA_DIR:-${GH_DIR}/data}"
GH_JAR="${GH_JAR:-${GH_DIR}/graphhopper.jar}"
GH_CONFIG="${GH_CONFIG:-${GH_DIR}/config.yml}"
GH_SERVICE="${GH_SERVICE:-graphhopper}"
LOG_FILE="${LOG_FILE:-/var/log/bikerlink/osm-update.log}"
BACKEND_URL="${BACKEND_URL:-https://bikerlink.replit.app}"
OSM_UPDATE_SECRET="${OSM_UPDATE_SECRET:-}"
NOTIFY_SCRIPT="$(dirname "$0")/notify.sh"
OSMIUM_BIN="${OSMIUM_BIN:-osmium}"

PBF_NEW="${GH_DATA_DIR}/new.osm.pbf"
PBF_CURRENT="${GH_DATA_DIR}/current.osm.pbf"
PBF_MERGED="${GH_DATA_DIR}/merged.osm.pbf"
TIMESTAMP="$(date '+%Y-%m-%dT%H:%M:%S%z')"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# ── Trap errori: notifica sempre al termine (successo o errore) ───────────────
notify_error() {
  local exit_code=$?
  log "ERRORE — script terminato con codice ${exit_code}"
  if [[ -x "$NOTIFY_SCRIPT" ]]; then
    "$NOTIFY_SCRIPT" "ERROR" "Aggiornamento OSM FALLITO — area: ${AREA} — exit: ${exit_code} — ${TIMESTAMP}"
  fi
}
trap notify_error ERR

set -euo pipefail

# ── 1. Preparazione ──────────────────────────────────────────────────────────
mkdir -p "$GH_DATA_DIR" "$(dirname "$LOG_FILE")"
log "=== Avvio aggiornamento OSM — area: ${AREA} ==="

# ── 2. Download nuovo .pbf da Geofabrik ──────────────────────────────────────
log "Download: ${GEOFABRIK_URL}"
curl -fsSL --retry 3 --retry-delay 10 -o "$PBF_NEW" "$GEOFABRIK_URL"
log "Download completato: $(du -sh "$PBF_NEW" | cut -f1)"

# ── 3. Merge con osmium (se esiste un .pbf precedente) ───────────────────────
if [[ -f "$PBF_CURRENT" ]]; then
  log "Merge osmium: ${PBF_CURRENT} + ${PBF_NEW} → ${PBF_MERGED}"
  "$OSMIUM_BIN" merge "$PBF_CURRENT" "$PBF_NEW" -o "$PBF_MERGED" --overwrite
  mv "$PBF_MERGED" "$PBF_CURRENT"
  rm -f "$PBF_NEW"
else
  log "Nessun .pbf precedente — uso diretto il nuovo download"
  mv "$PBF_NEW" "$PBF_CURRENT"
fi

# ── 4. Re-import GraphHopper (foreground — completa prima del restart) ────────
log "Avvio re-import GraphHopper (sincrono)..."
GH_IMPORT_LOG="${GH_DATA_DIR}/gh-import-$(date +%Y%m%d%H%M%S).log"
java -jar "$GH_JAR" import "$GH_CONFIG" --osm-file="$PBF_CURRENT" >> "$GH_IMPORT_LOG" 2>&1
log "Re-import completato. Log: ${GH_IMPORT_LOG}"

# ── 5. Riavvio servizio systemd GraphHopper (dopo import) ─────────────────────
log "Riavvio servizio systemd: ${GH_SERVICE}"
if systemctl is-active --quiet "$GH_SERVICE" 2>/dev/null || systemctl is-enabled --quiet "$GH_SERVICE" 2>/dev/null; then
  systemctl restart "$GH_SERVICE"
  log "Servizio riavviato con i nuovi dati OSM"
else
  log "AVVISO: servizio ${GH_SERVICE} non trovato — skip restart"
fi

# ── 6. Aggiornamento campo DB via endpoint admin ──────────────────────────────
if [[ -n "$OSM_UPDATE_SECRET" ]]; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "${BACKEND_URL}/api/admin/maps/osm-updated" \
    -H "Content-Type: application/json" \
    -H "X-OSM-Update-Secret: ${OSM_UPDATE_SECRET}" \
    -d "{\"updatedAt\":\"${TIMESTAMP}\"}" || true)
  log "POST /api/admin/maps/osm-updated → HTTP ${HTTP_CODE}"
else
  log "AVVISO: OSM_UPDATE_SECRET non impostato — campo DB non aggiornato"
fi

# ── 7. Notifica successo ───────────────────────────────────────────────────────
trap - ERR
if [[ -x "$NOTIFY_SCRIPT" ]]; then
  "$NOTIFY_SCRIPT" "SUCCESS" "Aggiornamento OSM completato — area: ${AREA} — ${TIMESTAMP}"
fi
log "=== Aggiornamento OSM completato con successo ==="
