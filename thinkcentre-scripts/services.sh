#!/usr/bin/env bash
# services.sh — Accendi o spegni i servizi BikerLink sul ThinkCentre
#
# Uso:
#   ./services.sh stop    — ferma tutto tranne Valhalla, DragonflyDB
#   ./services.sh start   — riavvia tutto
#   ./services.sh status  — mostra stato di tutti i container/servizi

ok()   { echo "[OK]   $1"; }
info() { echo "[INFO] $1"; }
warn() { echo "[WARN] $1"; }

# Ollama gira come servizio systemd (non Docker)
SYSTEMD_HEAVY=(ollama)

# Servizi pesanti Docker
DOCKER_HEAVY=(
  bikerlink-gh-balcani
  bikerlink-gh-grecia
  bikerlink-gh-arco-alpino
  bikerlink-gh-iberia
  bikerlink-gh-est
  bikerlink-gh-francia-benelux
  bikerlink-gh-germania-centro
  bikerlink-gh-ecuador
)

DOCKER_ALWAYS_ON=(
  bikerlink-valhalla
  bikerlink-dragonfly
  bikerlink-uptime-kuma
)

ACTION="${1:-status}"

docker_action() {
  local action="$1" c="$2"
  if docker inspect "$c" &>/dev/null; then
    docker "$action" "$c" 2>/dev/null \
      && ok "$action: $c" \
      || info "Già ${action}pato o errore: $c"
  else
    info "Container non esiste: $c"
  fi
}

case "$ACTION" in

  stop)
    echo "=== STOP servizi pesanti ($(date '+%H:%M:%S')) ==="
    for svc in "${SYSTEMD_HEAVY[@]}"; do
      if systemctl is-active --quiet "$svc" 2>/dev/null; then
        sudo systemctl stop "$svc" && ok "Fermato (systemd): $svc" || warn "Stop fallito: $svc"
      else
        info "Già fermo (systemd): $svc"
      fi
    done
    for c in "${DOCKER_HEAVY[@]}"; do
      docker_action stop "$c"
    done
    echo ""
    info "Valhalla, DragonflyDB: rimasti accesi."
    ;;

  start)
    echo "=== START servizi ($(date '+%H:%M:%S')) ==="
    for svc in "${SYSTEMD_HEAVY[@]}"; do
      sudo systemctl start "$svc" && ok "Avviato (systemd): $svc" || warn "Start fallito: $svc"
    done
    for c in "${DOCKER_HEAVY[@]}" "${DOCKER_ALWAYS_ON[@]}"; do
      docker_action start "$c"
    done
    ;;

  status)
    echo "=== STATUS servizi BikerLink ($(date '+%H:%M:%S')) ==="
    echo ""
    printf "%-42s %s\n" "SERVIZIO" "STATO"
    printf "%-42s %s\n" "-----------------------------------------" "------"
    for svc in "${SYSTEMD_HEAVY[@]}"; do
      STATE=$(systemctl is-active "$svc" 2>/dev/null || echo "assente")
      printf "%-42s %s\n" "$svc (systemd)" "$STATE"
    done
    for c in "${DOCKER_HEAVY[@]}" "${DOCKER_ALWAYS_ON[@]}"; do
      STATE=$(docker inspect --format='{{.State.Status}}' "$c" 2>/dev/null || echo "assente")
      printf "%-42s %s\n" "$c" "$STATE"
    done
    ;;

  *)
    echo "Uso: $0 stop | start | status"
    exit 1
    ;;
esac
