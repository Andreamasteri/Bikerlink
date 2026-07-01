#!/usr/bin/env bash
# =============================================================================
# setup-dragonfly-thinkcentre.sh
# Installa e avvia DragonflyDB v1.38.1 sul ThinkCentre come sostituto drop-in
# di Redis (Task #5244).
#
# DragonflyDB usa fino all'80% in meno di RAM rispetto a Redis (critico con
# Ollama + GraphHopper attivi sullo stesso mini-PC), è multi-thread su tutti
# i core, e non ha spike di memoria durante gli snapshot. È compatibile
# drop-in con ioredis/BullMQ/Redlock/Pub-Sub: nessuna modifica al codice
# applicativo, stessa porta 6379, stessa variabile TC_DRAGONFLY_URL.
#
# Utilizzo:
#   sudo bash scripts/setup-dragonfly-thinkcentre.sh
#
# Lo script è IDEMPOTENTE: può essere eseguito più volte senza effetti
# collaterali (riusa il container esistente se già presente e in salute).
#
# ⚠️ REDIS_PASSWORD deve essere impostata come variabile d'ambiente (stessa
#    password già usata con Redis, se si sta migrando un'istanza esistente):
#   export REDIS_PASSWORD="<password_forte>"
#   sudo -E bash scripts/setup-dragonfly-thinkcentre.sh
#
# Nota: questo script è pensato per un avvio standalone (senza docker-compose),
# utile per test rapidi o per ambienti dove lo stack completo non gira ancora.
# Per il deployment definitivo, lo stack usa invece il servizio `dragonfly` in
# infra/self-host/docker-compose.yml.
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*" >&2; }

DRAGONFLY_IMAGE="ghcr.io/dragonflydb/dragonfly:v1.38.1"
CONTAINER_NAME="bikerlink-dragonfly"
VOLUME_NAME="dragonflydata"
DRAGONFLY_PORT=6379

check_prerequisites() {
  info "Verifica prerequisiti..."

  if [[ $EUID -ne 0 ]]; then
    error "Lo script deve essere eseguito come root (usa sudo -E)"
    exit 1
  fi

  if [[ -z "${REDIS_PASSWORD:-}" ]]; then
    error "REDIS_PASSWORD non impostata. Esegui: export REDIS_PASSWORD='<password>' && sudo -E bash $0"
    exit 1
  fi

  if [[ ${#REDIS_PASSWORD} -lt 32 ]]; then
    error "REDIS_PASSWORD troppo corta (minimo 32 caratteri per sicurezza)"
    exit 1
  fi

  if ! command -v docker &>/dev/null; then
    error "docker non trovato. DragonflyDB richiede Docker (nessun pacchetto apt nativo)."
    exit 1
  fi

  success "Prerequisiti OK"
}

pull_image() {
  info "Step 1: Pull immagine ${DRAGONFLY_IMAGE}..."
  docker pull "${DRAGONFLY_IMAGE}"
  success "Immagine scaricata"
}

start_dragonfly() {
  info "Step 2: Avvio container ${CONTAINER_NAME}..."

  if docker ps -a --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
    if docker ps --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
      success "${CONTAINER_NAME} già in esecuzione — skip avvio"
      return
    fi
    info "${CONTAINER_NAME} esiste ma è fermo — riavvio"
    docker start "${CONTAINER_NAME}"
    success "${CONTAINER_NAME} riavviato"
    return
  fi

  docker volume create "${VOLUME_NAME}" >/dev/null

  # --cluster_mode emulated è OBBLIGATORIO: BullMQ usa Lua script con chiavi
  # non dichiarate, senza questo flag fallisce silenziosamente.
  # --default_lua_flags=allow-undeclared-keys è OBBLIGATORIO insieme a
  # cluster_mode=emulated, altrimenti gli script BullMQ (es. addJob) falliscono
  # SEMPRE con "ERR ...script tried accessing undeclared key" (verificato con
  # smoke test end-to-end prima del cutover — vedi docker-compose.yml).
  # --ulimit memlock=-1: senza questo il container non parte.
  # NOTA: DragonflyDB NON supporta i flag Redis --maxmemory-policy, --save,
  # --aof_rewrite_min_size (CLI diversa da Redis, non un superset). Usa invece
  # --snapshot_cron per gli snapshot periodici (equivalente a --save 3600 1).
  # L'eviction sotto maxmemory è automatica, non richiede una policy esplicita.
  docker run -d \
    --name "${CONTAINER_NAME}" \
    --restart unless-stopped \
    --ulimit memlock=-1 \
    -p "${DRAGONFLY_PORT}:6379" \
    -v "${VOLUME_NAME}:/data" \
    "${DRAGONFLY_IMAGE}" \
    --cluster_mode=emulated \
    --requirepass="${REDIS_PASSWORD}" \
    --maxmemory=1gb \
    --snapshot_cron="0 * * * *" \
    --default_lua_flags=allow-undeclared-keys

  success "${CONTAINER_NAME} avviato"
}

wait_for_ready() {
  info "Step 3: Attesa readiness..."
  local retries=15
  local count=0
  while ! docker exec "${CONTAINER_NAME}" redis-cli -a "${REDIS_PASSWORD}" --no-auth-warning ping &>/dev/null; do
    count=$((count + 1))
    if [[ $count -ge $retries ]]; then
      error "DragonflyDB non risponde dopo ${retries} tentativi. Controlla: docker logs ${CONTAINER_NAME}"
      exit 1
    fi
    sleep 1
  done
  success "DragonflyDB pronto"
}

test_ping() {
  info "Step 4: Test ping..."
  local result
  result=$(docker exec "${CONTAINER_NAME}" redis-cli -a "${REDIS_PASSWORD}" --no-auth-warning ping 2>&1)
  if [[ "$result" == "PONG" ]]; then
    success "Ping: PONG ✓"
  else
    error "Ping fallito: $result"
    exit 1
  fi
}

print_summary() {
  echo ""
  echo "============================================================"
  echo "  Setup DragonflyDB ThinkCentre — Completato"
  echo "============================================================"
  echo ""
  echo "  Container:       ${CONTAINER_NAME}"
  echo "  Porta:           ${DRAGONFLY_PORT} (invariata rispetto a Redis)"
  echo "  Volume:          ${VOLUME_NAME}"
  echo ""
  echo "  TC_DRAGONFLY_URL resta invariata (stesso protocollo, nessuna modifica"
  echo "  al secret Replit né al codice applicativo):"
  echo "    redis://:<REDIS_PASSWORD>@<tc-host>:${DRAGONFLY_PORT}"
  echo ""
  echo "  Verifica stato:    docker logs ${CONTAINER_NAME}"
  echo "  Verifica memoria:  docker exec ${CONTAINER_NAME} redis-cli -a \$REDIS_PASSWORD info memory"
  echo ""
  echo "  Per il deployment definitivo via docker-compose, usa invece il"
  echo "  servizio 'dragonfly' in infra/self-host/docker-compose.yml."
  echo "============================================================"
}

main() {
  echo ""
  info "=== Setup DragonflyDB ThinkCentre (BikerLink) — Task #5244 ==="
  echo ""

  check_prerequisites
  pull_image
  start_dragonfly
  wait_for_ready
  test_ping
  print_summary
}

main "$@"
