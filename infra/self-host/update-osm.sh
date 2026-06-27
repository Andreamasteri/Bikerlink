#!/usr/bin/env bash
# =============================================================================
# BikerLink — update-osm.sh
# Aggiorna i dati OSM dello stack self-host multi-area SENZA downtime totale:
# le aree vengono ricostruite UNA ALLA VOLTA, così le altre restano attive.
#
# Strategia:
#   1. Applica i diff incrementali OSM (pyosmium-up-to-date) a ciascun file
#      nazionale in data/countries/ (scarica solo le modifiche, non i GB interi).
#   2. Ri-esegue download-regions.sh per ri-formare i .pbf per gruppo
#      (rigenera solo i merge con sorgenti più recenti; idempotente).
#   3. Per ogni istanza graphhopper-<codice> in esecuzione:
#        a. Ferma il container.
#        b. Ricostruisce il grafo (build-regions.sh <codice>).
#        c. Riavvia il container e aspetta /health.
#   4. Rebuild dei tile Valhalla (force_rebuild una tantum, se in esecuzione).
#   5. (Opzionale) notifica al backend la data di aggiornamento.
#
# Uso:
#   ./update-osm.sh
#   ./update-osm.sh grecia balcani        # solo alcuni gruppi (anche se non in esecuzione)
#   DATA_DIR=/mnt/nvme/osm ./update-osm.sh
#
# Schedulazione consigliata (cron, 1° del mese 03:00 Europe/Rome):
#   CRON_TZ=Europe/Rome
#   0 3 1 * * /percorso/infra/self-host/update-osm.sh >> /var/log/bikerlink-osm.log 2>&1
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DATA_DIR="${DATA_DIR:-${SCRIPT_DIR}/data}"
COUNTRIES_DIR="${COUNTRIES_DIR:-${DATA_DIR}/countries}"
GRAPHS_DIR="${GRAPHS_DIR:-${SCRIPT_DIR}/graphs}"
ENV_FILE="${SCRIPT_DIR}/.env"

ALL_GROUPS="grecia balcani est iberia arco-alpino germania-centro francia-benelux ecuador"

# Endpoint backend opzionale per registrare la data ultimo update.
BACKEND_URL="${BACKEND_URL:-}"
OSM_UPDATE_SECRET="${OSM_UPDATE_SECRET:-}"

# Timeout per /health di ogni istanza GraphHopper dopo il restart (secondi).
GH_HEALTH_TIMEOUT="${GH_HEALTH_TIMEOUT:-600}"   # 10 min (serving, grafo già pronto)
VALHALLA_TIMEOUT_SECS="${VALHALLA_TIMEOUT_SECS:-10800}"  # 3h rebuild tile Valhalla

log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRORE: $*" >&2; exit 1; }

DOCKER="docker"; docker info >/dev/null 2>&1 || DOCKER="sudo docker"
COMPOSE="$DOCKER compose"
[[ -f "$ENV_FILE" ]] && COMPOSE="$DOCKER compose --env-file $ENV_FILE"

# ── Prerequisiti ──────────────────────────────────────────────────────────────
command -v pyosmium-up-to-date >/dev/null 2>&1 || \
  die "pyosmium-up-to-date non installato. Installa con: sudo apt install -y python3-pyosmium (oppure: pipx install osmium)"
command -v curl >/dev/null 2>&1 || die "curl non installato (sudo apt install -y curl)."
[[ -d "$COUNTRIES_DIR" ]] || die "Cartella nazionali non trovata: ${COUNTRIES_DIR}. Esegui prima ./download-regions.sh."

# ── Gruppi da aggiornare ───────────────────────────────────────────────────────
if [[ $# -gt 0 ]]; then
  GROUPS=("$@")
else
  read -r -a GROUPS <<< "$ALL_GROUPS"
fi

log "=== Aggiornamento OSM incrementale BikerLink (multi-area) ==="
log "Gruppi: ${GROUPS[*]}"

# ── 1. Diff incrementali per ogni file nazionale ──────────────────────────────
# Raccoglie tutti i .pbf nazionali in data/countries/ che esistono.
log "[1/5] Applico diff OSM a ciascun file nazionale in ${COUNTRIES_DIR}/ ..."
DIFF_ERRORS=0
while IFS= read -r -d '' pbf; do
  slug="$(basename "$pbf" -latest.osm.pbf)"
  log "  [${slug}] pyosmium-up-to-date..."
  if pyosmium-up-to-date --size 2000 -o "${pbf}.updated" "$pbf"; then
    mv "${pbf}.updated" "$pbf"
    log "  [${slug}] diff applicati ✓"
  else
    rc=$?
    if [[ $rc -eq 1 && -f "${pbf}.updated" ]]; then
      mv "${pbf}.updated" "$pbf"
      log "  [${slug}] diff parziali applicati (altri disponibili al prossimo run) ✓"
    else
      rm -f "${pbf}.updated"
      log "  [${slug}] ATTENZIONE: aggiornamento diff fallito (exit ${rc}) — continuo con il PBF esistente"
      DIFF_ERRORS=$((DIFF_ERRORS + 1))
    fi
  fi
done < <(find "$COUNTRIES_DIR" -maxdepth 1 -name "*-latest.osm.pbf" -print0 2>/dev/null)

if [[ "$DIFF_ERRORS" -gt 0 ]]; then
  log "ATTENZIONE: ${DIFF_ERRORS} file nazionali non aggiornati — i grafi relativi useranno dati parzialmente stantii."
fi

# ── 2. Ri-merge dei gruppi (download-regions.sh) ─────────────────────────────
log "[2/5] Ri-genero i .pbf per gruppo (osmium merge, solo se sorgenti più recenti)..."
DOWNLOAD_SCRIPT="${SCRIPT_DIR}/download-regions.sh"
[[ -f "$DOWNLOAD_SCRIPT" ]] || die "download-regions.sh non trovato in ${SCRIPT_DIR}/"
chmod +x "$DOWNLOAD_SCRIPT"
DATA_DIR="$DATA_DIR" COUNTRIES_DIR="$COUNTRIES_DIR" "$DOWNLOAD_SCRIPT" "${GROUPS[@]}"
log "[2/5] Re-merge gruppi completato ✓"

# ── Helper: attende /health di un'istanza GraphHopper ─────────────────────────
wait_gh_healthy() {
  local svc="$1" port="$2" timeout="$3" elapsed=0 interval=15
  log "  [${svc}] attendo /health su :${port} (timeout $((timeout/60)) min)..."
  while (( elapsed < timeout )); do
    if curl -fsS --max-time 5 "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
      log "  [${svc}] healthy (dopo ${elapsed}s) ✓"
      return 0
    fi
    sleep "$interval"; elapsed=$((elapsed + interval))
    if (( elapsed % 60 == 0 )); then log "  [${svc}] ancora in avvio (${elapsed}s)..."; fi
  done
  log "  [${svc}] ATTENZIONE: /health non ha risposto entro $((timeout/60)) min — controlla: $COMPOSE logs ${svc}"
  return 1
}

# Mappa codice → porta interna (copia di shared/routing-areas.ts).
area_port() {
  case "$1" in
    grecia)          echo 8990 ;;
    balcani)         echo 8991 ;;
    est)             echo 8992 ;;
    iberia)          echo 8993 ;;
    arco-alpino)     echo 8994 ;;
    germania-centro) echo 8995 ;;
    francia-benelux) echo 8996 ;;
    ecuador)         echo 8997 ;;
    *) echo 0 ;;
  esac
}

# ── 3. Rebuild grafi + restart per ogni area in esecuzione ───────────────────
log "[3/5] Rebuild grafi e restart istanze GraphHopper-area..."
BUILD_SCRIPT="${SCRIPT_DIR}/build-regions.sh"
[[ -f "$BUILD_SCRIPT" ]] || die "build-regions.sh non trovato in ${SCRIPT_DIR}/"
chmod +x "$BUILD_SCRIPT"

GH_REBUILD_ERRORS=0
for group in "${GROUPS[@]}"; do
  port="$(area_port "$group")"
  svc="graphhopper-${group}"
  container="bikerlink-gh-${group}"

  # Controlla se il container è in esecuzione.
  running="$($DOCKER ps -q -f "name=${container}" 2>/dev/null || true)"

  log "[${group}] build nuovo grafo (il container resta fermo durante il build)..."

  # Se in esecuzione, fermalo prima del rebuild (il grafo è un bind mount).
  if [[ -n "$running" ]]; then
    log "[${group}] fermo ${svc}..."
    $COMPOSE stop "$svc" || true
  fi

  # Rebuild del grafo (usa build-regions.sh che già gestisce ✓/✗ per gruppo).
  if DATA_DIR="$DATA_DIR" GRAPHS_DIR="$GRAPHS_DIR" "$BUILD_SCRIPT" "$group"; then
    log "[${group}] build OK ✓"
  else
    log "[${group}] ERRORE: build grafo fallito ✗ — il container NON verrà riavviato"
    GH_REBUILD_ERRORS=$((GH_REBUILD_ERRORS + 1))
    continue
  fi

  # Riavvia il container solo se era in esecuzione.
  if [[ -n "$running" ]]; then
    log "[${group}] riavvio ${svc}..."
    # Specifica il profilo per bypassare l'esclusione dal profilo "areas".
    $COMPOSE up -d "$svc" || {
      log "[${group}] ATTENZIONE: riavvio fallito — avvia manualmente: $COMPOSE up -d ${svc}"
      GH_REBUILD_ERRORS=$((GH_REBUILD_ERRORS + 1))
      continue
    }
    if [[ "$port" -gt 0 ]]; then
      wait_gh_healthy "$svc" "$port" "$GH_HEALTH_TIMEOUT" || true
    fi
  else
    log "[${group}] container non era in esecuzione — grafo aggiornato, pronto per il prossimo avvio."
  fi
done

# ── 4. Rebuild tile Valhalla (solo se in esecuzione) ─────────────────────────
log "[4/5] Controllo Valhalla..."
if [[ -n "$($DOCKER ps -q -f name=bikerlink-valhalla 2>/dev/null || true)" ]]; then
  log "[Valhalla] container attivo — avvio rebuild tile (force_rebuild=True)..."
  VALHALLA_FORCE_REBUILD=True $COMPOSE up -d --force-recreate valhalla

  log "[Valhalla] attendo /status dopo il rebuild dei tile (timeout $((VALHALLA_TIMEOUT_SECS/3600))h)..."
  VALHALLA_STATUS_URL="http://localhost:${VALHALLA_PORT:-8002}/status"
  elapsed=0
  valhalla_ok=false
  while (( elapsed < VALHALLA_TIMEOUT_SECS )); do
    if curl -fsS --max-time 10 "$VALHALLA_STATUS_URL" >/dev/null 2>&1; then
      valhalla_ok=true
      break
    fi
    sleep 30; elapsed=$((elapsed + 30))
  done

  if [[ "$valhalla_ok" == "true" ]]; then
    log "[Valhalla] tile ricostruiti ✓ — ripristino force_rebuild=False..."
    $COMPOSE up -d --force-recreate valhalla
    log "[Valhalla] online ✓"
  else
    log "[Valhalla] ATTENZIONE: /status non ha risposto entro $((VALHALLA_TIMEOUT_SECS/3600))h — controlla: $COMPOSE logs -f valhalla"
    VALHALLA_REBUILD_FAILED=1
  fi
else
  log "[Valhalla] container non in esecuzione — rebuild tile saltato."
fi

# ── 5. Notifica backend (opzionale) ──────────────────────────────────────────
log "[5/5] Notifica backend..."
if [[ -n "$BACKEND_URL" && -n "$OSM_UPDATE_SECRET" ]]; then
  TS="$(date '+%Y-%m-%dT%H:%M:%S%z')"
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    "${BACKEND_URL}/api/admin/maps/osm-updated" \
    -H 'Content-Type: application/json' \
    -H "X-OSM-Update-Secret: ${OSM_UPDATE_SECRET}" \
    -d "{\"updatedAt\":\"${TS}\"}" || true)"
  log "[Backend] POST /api/admin/maps/osm-updated → HTTP ${code}"
else
  log "[Backend] BACKEND_URL o OSM_UPDATE_SECRET non configurati — notifica saltata."
fi

# ── Riepilogo ─────────────────────────────────────────────────────────────────
echo ""
if [[ "$GH_REBUILD_ERRORS" -gt 0 ]] || [[ "${VALHALLA_REBUILD_FAILED:-0}" == "1" ]]; then
  log "=== Aggiornamento OSM completato CON ERRORI ==="
  [[ "$GH_REBUILD_ERRORS" -gt 0 ]]         && log "  ✗ Rebuild grafi falliti: ${GH_REBUILD_ERRORS} su ${#GROUPS[@]}"
  [[ "${VALHALLA_REBUILD_FAILED:-0}" == "1" ]] && log "  ✗ Rebuild tile Valhalla fallito"
  exit 1
fi

log "=== Aggiornamento OSM completato ✓ ==="
