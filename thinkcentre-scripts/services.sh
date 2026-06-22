#!/usr/bin/env bash
# services.sh — Accendi o spegni i servizi BikerLink sul ThinkCentre
#
# Uso:
#   ./services.sh stop    — ferma tutto tranne Valhalla, Postgres, Redis
#   ./services.sh start   — riavvia tutto
#   ./services.sh status  — mostra stato di tutti i container

ok()   { echo "[OK]   $1"; }
info() { echo "[INFO] $1"; }

HEAVY=(
  bikerlink-ollama
  bikerlink-whisper
  bikerlink-nominatim
  bikerlink-gh-balcani
  bikerlink-gh-grecia
  bikerlink-gh-arco-alpino
  bikerlink-gh-iberia
  bikerlink-gh-est
  bikerlink-gh-francia-benelux
  bikerlink-gh-germania-centro
)

ALWAYS_ON=(
  bikerlink-valhalla
  bikerlink-postgres
  bikerlink-redis
  bikerlink-uptime-kuma
  bikerlink-pgadmin
)

ACTION="${1:-status}"

case "$ACTION" in

  stop)
    echo "=== STOP servizi pesanti ($(date '+%H:%M:%S')) ==="
    for c in "${HEAVY[@]}"; do
      if docker inspect "$c" &>/dev/null; then
        docker stop "$c" 2>/dev/null && ok "Fermato: $c" || info "Non in esecuzione: $c"
      else
        info "Non esiste: $c"
      fi
    done
    echo ""
    info "Valhalla, Postgres, Redis: rimasti accesi."
    ;;

  start)
    echo "=== START servizi ($(date '+%H:%M:%S')) ==="
    for c in "${HEAVY[@]}" "${ALWAYS_ON[@]}"; do
      if docker inspect "$c" &>/dev/null; then
        docker start "$c" 2>/dev/null && ok "Avviato: $c" || info "Già in esecuzione o errore: $c"
      else
        info "Non esiste: $c"
      fi
    done
    ;;

  status)
    echo "=== STATUS container BikerLink ($(date '+%H:%M:%S')) ==="
    printf "%-42s %s\n" "CONTAINER" "STATO"
    printf "%-42s %s\n" "-----------------------------------------" "------"
    for c in "${HEAVY[@]}" "${ALWAYS_ON[@]}"; do
      STATE=$(docker inspect --format='{{.State.Status}}' "$c" 2>/dev/null || echo "assente")
      printf "%-42s %s\n" "$c" "$STATE"
    done
    ;;

  *)
    echo "Uso: $0 stop | start | status"
    exit 1
    ;;
esac
