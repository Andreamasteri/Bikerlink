#!/usr/bin/env bash
# =============================================================================
# BikerLink — Aggiornamento mensile dati OSM Italia
# Installato da setup-oracle.sh in: /opt/graphhopper/update-osm.sh
# Cron: 0 2 1 * * /opt/graphhopper/update-osm.sh >> /opt/graphhopper/logs/osm-update.log 2>&1
# =============================================================================

# NOTA: set -e DISABILITATO intenzionalmente per gestire il fallimento del build
# e ripristinare il backup senza terminare lo script prematuramente.
# Le variabili non definite (set -u) sono comunque verificate esplicitamente.
set -uo pipefail

GH_DIR="__GH_DIR__"
JAVA_HEAP="__JAVA_HEAP__"
OSM_URL="https://download.geofabrik.de/europe/italy-latest.osm.pbf"
OSM_FILE="${GH_DIR}/data/italy-latest.osm.pbf"
GRAPH_DIR="${GH_DIR}/data/italy-latest-gh"
BACKUP_GRAPH="${GH_DIR}/data/italy-latest-gh.bak"
LOG_FILE="${GH_DIR}/logs/osm-update.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

log "=== Inizio aggiornamento OSM Italia ==="
log "Data: $(date)"

# ---------------------------------------------------------------------------
# 1. Download nuovo file OSM
# ---------------------------------------------------------------------------
log "Download italy-latest.osm.pbf da Geofabrik..."
if wget -q -O "${OSM_FILE}.tmp" "$OSM_URL"; then
    FILE_SIZE=$(stat -c%s "${OSM_FILE}.tmp")
    if [[ $FILE_SIZE -lt 500000000 ]]; then
        log "ERRORE: File scaricato troppo piccolo (${FILE_SIZE} bytes). Download corrotto?"
        rm -f "${OSM_FILE}.tmp"
        exit 1
    fi
    mv "${OSM_FILE}.tmp" "$OSM_FILE"
    log "Download completato. Dimensione: $(du -sh "$OSM_FILE" | cut -f1)"
else
    log "ERRORE: Download fallito. Aggiornamento annullato."
    rm -f "${OSM_FILE}.tmp"
    exit 1
fi

# ---------------------------------------------------------------------------
# 2. Backup grafo esistente
# ---------------------------------------------------------------------------
if [[ -d "$GRAPH_DIR" ]]; then
    log "Backup grafo esistente in ${BACKUP_GRAPH}..."
    rm -rf "$BACKUP_GRAPH"
    if ! cp -r "$GRAPH_DIR" "$BACKUP_GRAPH"; then
        log "ERRORE: Impossibile creare backup. Aggiornamento annullato."
        exit 1
    fi
    log "Backup creato ($(du -sh "$BACKUP_GRAPH" | cut -f1))"
fi

# ---------------------------------------------------------------------------
# 3. Stop GraphHopper
# ---------------------------------------------------------------------------
log "Stop GraphHopper..."
systemctl stop graphhopper || true
sleep 5

# ---------------------------------------------------------------------------
# 4. Rebuild grafo — exit code catturato manualmente (NO set -e)
# ---------------------------------------------------------------------------
log "Rebuild grafo OSM (15-20 min)..."
rm -rf "$GRAPH_DIR"
cd "$GH_DIR"

IMPORT_LOG="${GH_DIR}/logs/import-$(date +%Y%m).log"

# Esegue il build; il tee non maschera l'exit code di java grazie a PIPESTATUS
java -Xmx${JAVA_HEAP} -Xms4g \
    -Ddw.graphhopper.datareader.file=data/italy-latest.osm.pbf \
    -jar graphhopper.jar import config.yml \
    2>&1 | tee -a "$IMPORT_LOG"
BUILD_EXIT=${PIPESTATUS[0]}

if [[ $BUILD_EXIT -ne 0 ]]; then
    log "ERRORE: Build fallita (exit code ${BUILD_EXIT}). Ripristino backup..."
    rm -rf "$GRAPH_DIR"
    if [[ -d "$BACKUP_GRAPH" ]]; then
        mv "$BACKUP_GRAPH" "$GRAPH_DIR"
        log "Backup ripristinato con successo."
    else
        log "CRITICO: Nessun backup disponibile — GraphHopper non può ripartire con un grafo valido."
    fi
    # Riavvia GraphHopper con il vecchio grafo (se ripristinato)
    systemctl start graphhopper || true
    exit 1
fi

log "Build completata! Dimensione grafo: $(du -sh "$GRAPH_DIR" | cut -f1)"
rm -rf "$BACKUP_GRAPH"

# ---------------------------------------------------------------------------
# 5. Riavvio GraphHopper con nuovo grafo
# ---------------------------------------------------------------------------
log "Avvio GraphHopper con nuovo grafo..."
systemctl start graphhopper
log "Attesa avvio GraphHopper (120 sec)..."
sleep 120

# ---------------------------------------------------------------------------
# 6. Verifica health
# ---------------------------------------------------------------------------
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8990/health" 2>/dev/null || echo "000")
HEALTH_RESP=$(curl -s "http://localhost:8990/health" 2>/dev/null || echo '{}')
OSM_DATE=$(echo "$HEALTH_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('osm_date','unknown'))" 2>/dev/null || echo "unknown")

if [[ "$HTTP_CODE" == "200" ]]; then
    log "✓ GraphHopper operativo con grafo aggiornato (osm_date=${OSM_DATE})"
else
    log "ATTENZIONE: /health ha risposto con HTTP ${HTTP_CODE} — grafo potrebbe ancora caricarsi"
fi

log "=== Aggiornamento OSM completato ==="
log ""
