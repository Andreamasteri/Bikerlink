#!/usr/bin/env bash
# =============================================================================
# BikerLink — check-status.sh
# Diagnostica rapida dello stack multi-area sul ThinkCentre.
# Esegui questo script dal ThinkCentre e incolla l'output per la verifica.
#
# Uso:
#   chmod +x check-status.sh && ./check-status.sh
#   ./check-status.sh 2>&1 | tee /tmp/bikerlink-status-$(date +%Y%m%d-%H%M%S).txt
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GRAPHS_DIR="${GRAPHS_DIR:-${SCRIPT_DIR}/graphs}"
DATA_DIR="${DATA_DIR:-${SCRIPT_DIR}/data}"
ENV_FILE="${SCRIPT_DIR}/.env"

# Gruppi core da controllare
CORE_GROUPS="grecia balcani iberia arco-alpino"
ALL_GROUPS="grecia balcani est iberia arco-alpino germania-centro francia-benelux ecuador"

# Porte (sync con shared/routing-areas.ts e docker-compose.yml)
declare -A AREA_PORT=(
  [grecia]=8990
  [balcani]=8991
  [est]=8992
  [iberia]=8993
  [arco-alpino]=8994
  [germania-centro]=8995
  [francia-benelux]=8996
  [ecuador]=8997
)

bold()    { echo -e "\033[1m$*\033[0m"; }
green()   { echo -e "  \033[32m✓\033[0m $*"; }
red()     { echo -e "  \033[31m✗\033[0m $*"; }
yellow()  { echo -e "  \033[33m!\033[0m $*"; }
info()    { echo -e "  \033[36m→\033[0m $*"; }
section() { echo; bold "━━━ $* ━━━"; }

DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"
COMPOSE="$DOCKER compose"
[[ -f "$ENV_FILE" ]] && COMPOSE="$DOCKER compose --env-file $ENV_FILE"

ISSUES=()   # accumula problemi rilevati

# ─────────────────────────────────────────────────────────────────────────────
section "1/5 — Versione codice (git)"
# ─────────────────────────────────────────────────────────────────────────────
if git -C "$SCRIPT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
  echo "  Repository: $REPO_ROOT"
  echo "  Ultimi 5 commit:"
  git -C "$REPO_ROOT" log --oneline -5 | sed 's/^/    /'
  echo ""
  BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'sconosciuto')"
  info "Branch corrente: $BRANCH"
  # Verifica se ci sono aggiornamenti disponibili
  if git -C "$REPO_ROOT" fetch --dry-run origin "$BRANCH" 2>/dev/null | grep -q 'origin'; then
    yellow "Aggiornamenti disponibili su origin/$BRANCH — esegui: git pull"
    ISSUES+=("Repo non aggiornato: esegui 'git pull' in $REPO_ROOT")
  else
    green "Codice allineato con origin/$BRANCH (o fetch non disponibile)"
  fi
else
  yellow "Questa cartella non è un repo git (copia manuale dei file)."
  info  "Verificare manualmente che i file corrispondano all'ultima versione del repo."
fi

# ─────────────────────────────────────────────────────────────────────────────
section "2/5 — Stato container Docker"
# ─────────────────────────────────────────────────────────────────────────────
if ! $DOCKER info >/dev/null 2>&1; then
  red "Docker non raggiungibile! Verifica che il demone sia in esecuzione: sudo systemctl start docker"
  exit 1
fi

echo ""
bold "  docker compose ps --all:"
$COMPOSE ps --all 2>/dev/null | sed 's/^/  /' || echo "  (errore nel leggere lo stato)"
echo ""

# Controlla servizi base
for svc in postgres dragonfly valhalla; do
  status="$($DOCKER inspect --format '{{.State.Health.Status}}' "bikerlink-${svc}" 2>/dev/null || echo 'missing')"
  case "$status" in
    healthy)  green "bikerlink-${svc}: healthy" ;;
    missing)  red   "bikerlink-${svc}: container non trovato"; ISSUES+=("Servizio base '${svc}' non avviato: esegui 'docker compose up -d'") ;;
    starting) yellow "bikerlink-${svc}: ancora in avvio (starting)" ;;
    *)        yellow "bikerlink-${svc}: stato '${status}'" ;;
  esac
done

# pgadmin non sempre ha healthcheck
pgadmin_running="$($DOCKER ps -q -f name=bikerlink-pgadmin 2>/dev/null || true)"
if [[ -n "$pgadmin_running" ]]; then
  green "bikerlink-pgadmin: in esecuzione"
else
  yellow "bikerlink-pgadmin: non in esecuzione (non critico)"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "3/5 — Grafi GraphHopper (procedura GH 12: artefatto 'properties')"
# ─────────────────────────────────────────────────────────────────────────────
# GH 12: il marcatore di completamento è il file `properties` nella graph-cache
# (NON la directory edges/ come in versioni precedenti — quella non esiste più).
# Un grafo completo contiene: properties, nodes, edges, geometry, location_index.
# ─────────────────────────────────────────────────────────────────────────────
echo "  GRAPHS_DIR: ${GRAPHS_DIR}"
echo ""

GRAPHS_OK=()
GRAPHS_MISSING=()

for grp in $ALL_GROUPS; do
  graph_path="${GRAPHS_DIR}/${grp}"
  if [[ -f "${graph_path}/properties" ]]; then
    size="$(du -sh "$graph_path" 2>/dev/null | cut -f1 || echo '?')"
    # Controlla che i profili attesi siano nel file properties
    props="$(cat "${graph_path}/properties" 2>/dev/null || true)"
    missing_profiles=""
    for prof in motorcycle motorcycle_fast car; do
      echo "$props" | grep -q "$prof" || missing_profiles="${missing_profiles} ${prof}"
    done
    if [[ -n "$missing_profiles" ]]; then
      yellow "graphhopper-${grp}: grafo presente (${size}) ma profili mancanti:${missing_profiles}"
      GRAPHS_MISSING+=("$grp")
      ISSUES+=("Grafo incompleto per '${grp}': profili${missing_profiles} assenti — esegui './build-graphs-sequential.sh ${grp}'")
    else
      green "graphhopper-${grp}: grafo OK — 3 profili (${size})"
      GRAPHS_OK+=("$grp")
    fi
  elif [[ -d "$graph_path" ]]; then
    yellow "graphhopper-${grp}: cartella presente ma 'properties' mancante (build incompleto o formato pre-GH12)"
    GRAPHS_MISSING+=("$grp")
    ISSUES+=("Grafo incompleto per '${grp}': esegui './build-graphs-sequential.sh ${grp}'")
  else
    red "graphhopper-${grp}: grafo MANCANTE"
    GRAPHS_MISSING+=("$grp")
    # Solo i core sono critici
    if echo "$CORE_GROUPS" | grep -qw "$grp"; then
      ISSUES+=("Grafo CORE mancante per '${grp}': esegui './download-regions.sh ${grp} && ./build-graphs-sequential.sh ${grp}'")
    fi
  fi
done

echo ""
echo "  PBF per gruppo:"
for grp in $ALL_GROUPS; do
  pbf="${DATA_DIR}/${grp}.osm.pbf"
  if [[ -f "$pbf" ]]; then
    size="$(du -h "$pbf" 2>/dev/null | cut -f1 || echo '?')"
    info "${grp}.osm.pbf: presente (${size})"
  else
    if echo "$CORE_GROUPS" | grep -qw "$grp"; then
      red "${grp}.osm.pbf: MANCANTE (core)"
    else
      yellow "${grp}.osm.pbf: mancante (on-demand, non critico)"
    fi
  fi
done

# ─────────────────────────────────────────────────────────────────────────────
section "4/5 — Health check istanze GraphHopper core"
# ─────────────────────────────────────────────────────────────────────────────
echo ""

GH_UP=()
GH_DOWN=()

for grp in $CORE_GROUPS; do
  port="${AREA_PORT[$grp]:-0}"
  container="bikerlink-gh-${grp}"
  svc="graphhopper-${grp}"

  running="$($DOCKER ps -q -f name="${container}" 2>/dev/null || true)"
  if [[ -z "$running" ]]; then
    red "graphhopper-${grp} (:${port}): container non in esecuzione"
    GH_DOWN+=("$grp")
    if [[ -d "${GRAPHS_DIR}/${grp}/edges" ]]; then
      ISSUES+=("Istanza CORE '${grp}' spenta ma grafo pronto: esegui 'docker compose up -d ${svc}'")
    else
      ISSUES+=("Istanza CORE '${grp}' spenta e grafo mancante: esegui './build-regions.sh ${grp} && docker compose up -d ${svc}'")
    fi
    continue
  fi

  # Container in esecuzione: testa /health
  if curl -fsS --max-time 5 "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
    green "graphhopper-${grp} (:${port}): /health OK"
    GH_UP+=("$grp")
  else
    yellow "graphhopper-${grp} (:${port}): container in esecuzione ma /health non risponde (forse ancora in avvio)"
    GH_DOWN+=("$grp")
    ISSUES+=("Istanza CORE '${grp}' non risponde su :${port}/health — controlla: docker compose logs graphhopper-${grp}")
  fi
done

# Istanze non-core: solo stato
echo ""
info "Istanze non-core (on-demand, opzionali):"
for grp in est germania-centro francia-benelux ecuador; do
  port="${AREA_PORT[$grp]:-0}"
  container="bikerlink-gh-${grp}"
  running="$($DOCKER ps -q -f name="${container}" 2>/dev/null || true)"
  if [[ -n "$running" ]]; then
    if curl -fsS --max-time 3 "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
      green "graphhopper-${grp} (:${port}): in esecuzione e healthy"
    else
      yellow "graphhopper-${grp} (:${port}): in esecuzione, /health non ancora pronta"
    fi
  else
    info "graphhopper-${grp} (:${port}): spenta (normale per on-demand)"
  fi
done

# ─────────────────────────────────────────────────────────────────────────────
section "5/5 — Nginx proxy (se attivo)"
# ─────────────────────────────────────────────────────────────────────────────
if command -v nginx >/dev/null 2>&1; then
  nginx_status="$(systemctl is-active nginx 2>/dev/null || echo 'sconosciuto')"
  if [[ "$nginx_status" == "active" ]]; then
    green "nginx: attivo"
    # Verifica che /areas/grecia sia raggiungibile via proxy (porta 80 o 443)
    for scheme in http https; do
      if curl -fsS --max-time 5 --insecure "${scheme}://localhost/areas/grecia/health" >/dev/null 2>&1; then
        green "nginx proxy /areas/grecia/health: raggiungibile via ${scheme}"
        break
      fi
    done
  else
    yellow "nginx: ${nginx_status} (non attivo o non installato)"
  fi
elif $DOCKER ps --format '{{.Names}}' 2>/dev/null | grep -qi nginx; then
  green "nginx: in esecuzione come container Docker"
else
  info "nginx non trovato (potrebbe non essere ancora configurato)"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "RIEPILOGO"
# ─────────────────────────────────────────────────────────────────────────────
echo ""
bold "  GraphHopper core attivi   : ${GH_UP[*]:-(nessuno)}"
bold "  GraphHopper core inattivi : ${GH_DOWN[*]:-(nessuno)}"
bold "  Grafi presenti            : ${GRAPHS_OK[*]:-(nessuno)}"
bold "  Grafi mancanti            : ${GRAPHS_MISSING[*]:-(nessuno)}"
echo ""

if [[ ${#ISSUES[@]} -eq 0 ]]; then
  echo ""
  bold "  ✅ Stack multi-area OK — tutte le istanze core sono healthy!"
  echo ""
else
  bold "  ⚠ Azioni richieste (${#ISSUES[@]}):"
  for i in "${!ISSUES[@]}"; do
    echo "  $((i+1)). ${ISSUES[$i]}"
  done
  echo ""
  bold "  Comandi rapidi di ripristino:"
  echo ""
  # Genera i comandi automaticamente in base ai problemi trovati
  for grp in $CORE_GROUPS; do
    pbf="${DATA_DIR}/${grp}.osm.pbf"
    has_graph=false
    [[ -f "${GRAPHS_DIR}/${grp}/properties" ]] && has_graph=true

    container="bikerlink-gh-${grp}"
    running="$($DOCKER ps -q -f name="${container}" 2>/dev/null || true)"
    port="${AREA_PORT[$grp]:-0}"
    healthy=false
    [[ -n "$running" ]] && curl -fsS --max-time 3 "http://127.0.0.1:${port}/health" >/dev/null 2>&1 && healthy=true

    if [[ "$healthy" == "false" ]]; then
      if [[ ! -f "$pbf" ]]; then
        echo "  # ${grp}: scarica dati + build sequenziale + avvia"
        echo "  ./download-regions.sh ${grp} && ./build-graphs-sequential.sh ${grp} && docker compose up -d graphhopper-${grp}"
      elif [[ "$has_graph" == "false" ]]; then
        echo "  # ${grp}: build sequenziale + avvia"
        echo "  ./build-graphs-sequential.sh ${grp} && docker compose up -d graphhopper-${grp}"
      elif [[ -z "$running" ]]; then
        echo "  # ${grp}: solo avvia (grafo già presente)"
        echo "  docker compose up -d graphhopper-${grp}"
      else
        echo "  # ${grp}: controlla i log"
        echo "  docker compose logs --tail=50 graphhopper-${grp}"
      fi
      echo ""
    fi
  done
fi

echo ""
info "Per incollare questo output, esegui:"
echo "  ./check-status.sh 2>&1 | tee /tmp/bikerlink-status-\$(date +%Y%m%d-%H%M%S).txt"
echo "  cat /tmp/bikerlink-status-*.txt"
echo ""
