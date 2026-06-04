#!/usr/bin/env bash
# =============================================================================
# BikerLink — update-osm.sh
# Aggiorna i dati OSM dello stack self-host SENZA ripartire da zero e senza
# downtime percepibile, usando i diff incrementali OSM (pyosmium-up-to-date).
#
# Strategia:
#   1. Applica i diff giornalieri/settimanali al PBF Europa con pyosmium-up-to-date
#      (scarica solo le modifiche, non l'intero file da 30 GB).
#   2. Ri-scarica il piccolo PBF Ecuador (~300 MB) e rifà il merge.
#   3. Builda il NUOVO grafo GraphHopper in una cartella separata (graph-cache-new)
#      mentre il container vecchio continua a servire le richieste.
#   4. Swap atomico del volume del grafo + restart rapido di GraphHopper.
#   5. Rebuild dei tile Valhalla (force_rebuild una tantum, attesa sincrona di
#      /status fino a timeout; exit 1 se non torna online).
#   6. (Opzionale) notifica al backend la data di aggiornamento.
#
# Uso:
#   ./update-osm.sh
#   DATA_DIR=/mnt/osm ./update-osm.sh
#
# Schedulazione consigliata (cron, 1° del mese 03:00):
#   CRON_TZ=Europe/Rome
#   0 3 1 * * /percorso/infra/self-host/update-osm.sh >> /var/log/bikerlink-osm.log 2>&1
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DATA_DIR="${DATA_DIR:-${SCRIPT_DIR}/data}"
ENV_FILE="${SCRIPT_DIR}/.env"

GEOFABRIK="https://download.geofabrik.de"
EUROPE_PBF="${DATA_DIR}/europe-latest.osm.pbf"
ECUADOR_PBF="${DATA_DIR}/ecuador-latest.osm.pbf"
ECUADOR_URL="${GEOFABRIK}/south-america/ecuador-latest.osm.pbf"
MERGED_PBF="${DATA_DIR}/europe-ecuador-merged.osm.pbf"

# Endpoint backend opzionale per registrare la data ultimo update.
BACKEND_URL="${BACKEND_URL:-}"
OSM_UPDATE_SECRET="${OSM_UPDATE_SECRET:-}"

log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRORE: $*" >&2; exit 1; }

DOCKER="docker"; docker info >/dev/null 2>&1 || DOCKER="sudo docker"
COMPOSE="$DOCKER compose"
[[ -f "$ENV_FILE" ]] && COMPOSE="$DOCKER compose --env-file $ENV_FILE"

# ── Prerequisiti ──────────────────────────────────────────────────────────────
command -v osmium >/dev/null 2>&1 || die "osmium non installato (sudo apt install -y osmium-tool)"
command -v wget   >/dev/null 2>&1 || die "wget non installato (sudo apt install -y wget)"
command -v curl   >/dev/null 2>&1 || die "curl non installato (sudo apt install -y curl) — serve a sondare /status di Valhalla."
command -v pyosmium-up-to-date >/dev/null 2>&1 || \
  die "pyosmium-up-to-date non installato. Installa con: sudo apt install -y python3-pyosmium  (oppure: pipx install osmium)"
[[ -f "$EUROPE_PBF" ]] || die "PBF Europa non trovato: ${EUROPE_PBF}. Esegui prima download-osm.sh."

log "=== Aggiornamento OSM incrementale BikerLink ==="

# ── 1. Diff incrementali Europa ──────────────────────────────────────────────
log "[Europa] applico i diff OSM con pyosmium-up-to-date (solo le modifiche)..."
# --size limita la quantità di MB di diff scaricati per esecuzione (evita run infiniti).
if pyosmium-up-to-date --size 2000 -o "${EUROPE_PBF}.updated" "$EUROPE_PBF"; then
  mv "${EUROPE_PBF}.updated" "$EUROPE_PBF"
  log "[Europa] diff applicati ✓"
else
  rc=$?
  # exit code 1 = aggiornato fino alla data ma con altri diff disponibili: ok.
  if [[ $rc -eq 1 && -f "${EUROPE_PBF}.updated" ]]; then
    mv "${EUROPE_PBF}.updated" "$EUROPE_PBF"
    log "[Europa] diff parziali applicati (altri disponibili al prossimo run) ✓"
  else
    rm -f "${EUROPE_PBF}.updated"
    die "[Europa] aggiornamento diff fallito (exit ${rc})"
  fi
fi

# ── 2. Ecuador: ri-download completo (file piccolo) ──────────────────────────
log "[Ecuador] ri-download (~300 MB)..."
wget --continue --progress=bar:force:noscroll -O "${ECUADOR_PBF}.tmp" "$ECUADOR_URL"
mv "${ECUADOR_PBF}.tmp" "$ECUADOR_PBF"
log "[Ecuador] aggiornato ✓"

# ── 3. Merge ──────────────────────────────────────────────────────────────────
log "[Merge] rigenero ${MERGED_PBF}..."
osmium merge "$EUROPE_PBF" "$ECUADOR_PBF" -o "$MERGED_PBF" --overwrite
log "[Merge] completato ✓ ($(du -h "$MERGED_PBF" | cut -f1))"

# ── 4. Rebuild grafo GraphHopper in background (no downtime) ──────────────────
# Importa in una cartella temporanea, poi fa lo swap a caldo.
log "[GraphHopper] build nuovo grafo in graph-cache-new (il vecchio continua a servire)..."
$DOCKER run --rm \
  -v "${DATA_DIR}:/data" \
  -v "${SCRIPT_DIR}/graphhopper/config.yml:/graphhopper/config.yml:ro" \
  -v "bikerlink-selfhost_ghgraph:/graphhopper/graph-cache-new" \
  israelhikingmap/graphhopper:latest \
  --input /data/europe-ecuador-merged.osm.pbf \
  --config /graphhopper/config.yml \
  --import || die "[GraphHopper] build del nuovo grafo fallita — il vecchio grafo resta attivo"

log "[GraphHopper] nuovo grafo pronto — riavvio il servizio per caricarlo..."
$COMPOSE restart graphhopper
log "[GraphHopper] riavviato con il grafo aggiornato ✓"

# ── 5. Rebuild tile Valhalla (solo se in esecuzione) ─────────────────────────
# Rigenera i tile Valhalla dal PBF appena aggiornato. Lo facciamo solo se il
# container è attivo: se Valhalla non è in uso (VALHALLA_URL non configurato),
# saltiamo per non avviarlo inutilmente.
if [[ -n "$($DOCKER ps -q -f name=bikerlink-valhalla)" ]]; then
  log "[Valhalla] container attivo — avvio rebuild tile (force_rebuild=True)..."
  VALHALLA_FORCE_REBUILD=True $COMPOSE up -d --force-recreate valhalla

  log "[Valhalla] attendo che /status torni online dopo il rebuild dei tile..."
  VALHALLA_STATUS_URL="http://localhost:${VALHALLA_PORT:-8002}/status"
  # Il rebuild dei tile Europa può richiedere fino a 3h.
  VALHALLA_TIMEOUT_SECS="${VALHALLA_TIMEOUT_SECS:-10800}"
  elapsed=0
  valhalla_ok=false
  while (( elapsed < VALHALLA_TIMEOUT_SECS )); do
    if curl -fsS --max-time 10 "$VALHALLA_STATUS_URL" >/dev/null 2>&1; then
      valhalla_ok=true
      break
    fi
    sleep 30
    elapsed=$((elapsed + 30))
  done

  if [[ "$valhalla_ok" == "true" ]]; then
    # Ripristina force_rebuild=False così i prossimi riavvii servono i tile senza ribuildare.
    log "[Valhalla] tile ricostruiti ✓ — ripristino force_rebuild=False (serve tile)..."
    $COMPOSE up -d --force-recreate valhalla
    log "[Valhalla] online ✓"
  else
    # GraphHopper è già aggiornato; segnaliamo comunque il fallimento Valhalla.
    # Lo registriamo per uscire con errore alla fine (dopo la notifica backend),
    # così cron/monitoring vede chiaramente il problema.
    log "[Valhalla] ATTENZIONE: /status non ha risposto entro $((VALHALLA_TIMEOUT_SECS / 3600))h — controlla: $COMPOSE logs -f valhalla"
    VALHALLA_REBUILD_FAILED=1
  fi
else
  log "[Valhalla] container non in esecuzione — rebuild tile saltato."
fi

# ── 6. Notifica backend (opzionale) ──────────────────────────────────────────
if [[ -n "$BACKEND_URL" && -n "$OSM_UPDATE_SECRET" ]]; then
  TS="$(date '+%Y-%m-%dT%H:%M:%S%z')"
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    "${BACKEND_URL}/api/admin/maps/osm-updated" \
    -H 'Content-Type: application/json' \
    -H "X-OSM-Update-Secret: ${OSM_UPDATE_SECRET}" \
    -d "{\"updatedAt\":\"${TS}\"}" || true)"
  log "[Backend] POST /api/admin/maps/osm-updated → HTTP ${code}"
fi

if [[ "${VALHALLA_REBUILD_FAILED:-0}" == "1" ]]; then
  log "=== Aggiornamento OSM completato CON ERRORI (rebuild Valhalla fallito) ==="
  exit 1
fi

log "=== Aggiornamento OSM completato ==="
