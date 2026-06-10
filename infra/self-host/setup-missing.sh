#!/usr/bin/env bash
# =============================================================================
# BikerLink — setup-missing.sh
# Installa i servizi mancanti su un server che ha già Ollama attivo (e
# opzionalmente alcune istanze graphhopper-* già buildabili). Avvia:
#   - postgres, redis, valhalla, pgadmin (servizi base)
#   - istanze graphhopper-* per i gruppi selezionati (default: core)
#
# Cosa fa:
#   1. Verifica OS Ubuntu/Debian.
#   2. Installa i prerequisiti via apt (Docker + plugin compose, osmium-tool,
#      python3-pyosmium) se assenti.
#   3. Genera .env con password casuali (non sovrascrive se esiste già).
#   4. Genera .env.local dal template con DATABASE_URL precompilato.
#   5. Verifica/scarica i PBF per i gruppi richiesti (download-regions.sh).
#   6. Builda i grafi GraphHopper per i gruppi richiesti (build-regions.sh).
#   7. docker compose up -d postgres redis valhalla pgadmin
#      + avvia le istanze graphhopper-<codice> per i gruppi core.
#   8. Attende l'health check di ciascun servizio.
#   9. Stampa il riepilogo finale (URL, porte, credenziali).
#
# Uso:
#   chmod +x setup-missing.sh && ./setup-missing.sh
#   ./setup-missing.sh --gen-secrets   # genera anche i secret locali in .env.local
#   ./setup-missing.sh --groups "grecia arco-alpino"  # solo alcuni gruppi GH
#   ./setup-missing.sh --skip-gh       # salta tutto il flusso GraphHopper
#
# Variabili d'ambiente utili (CI / scripting non-interattivo):
#   GEN_SECRETS=1      genera i secret locali mancanti senza prompt
#   NONINTERACTIVE=1   disabilita i prompt (usa i default)
#   GROUPS_OVERRIDE="grecia balcani"   gruppi da buildare/avviare
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="${SCRIPT_DIR}/.env"
ENV_LOCAL_FILE="${SCRIPT_DIR}/.env.local"
TEMPLATE_FILE="${SCRIPT_DIR}/.env.local.template"
PLACEHOLDER_VALUE="<INSERIRE>"

DATA_DIR="${DATA_DIR:-${SCRIPT_DIR}/data}"
GRAPHS_DIR="${GRAPHS_DIR:-${SCRIPT_DIR}/graphs}"

# Gruppi "core" (abilitati di default): sync con shared/routing-areas.ts.
CORE_GROUPS="${GROUPS_OVERRIDE:-grecia balcani iberia arco-alpino}"
ALL_GROUPS="grecia balcani est iberia arco-alpino germania-centro francia-benelux"
SKIP_GH=0

GEN_SECRETS="${GEN_SECRETS:-${GEN_TOKENS:-0}}"
NONINTERACTIVE="${NONINTERACTIVE:-0}"

# Timeout health check (secondi)
TIMEOUT_FAST=120                    # postgres, redis, pgadmin  (2 min)
TIMEOUT_GH_SERVE=600               # 10 min (istanza GH che carica grafo pronto)
TIMEOUT_VALHALLA=$((3 * 60 * 60))  # 3h (build tile Valhalla)

# ── Libreria condivisa ────────────────────────────────────────────────────────
# shellcheck source=lib/env-helpers.sh
source "${SCRIPT_DIR}/lib/env-helpers.sh"

# ── Estetica ──────────────────────────────────────────────────────────────────
bold()    { echo -e "\033[1m$*\033[0m"; }
ok()      { echo -e "  \033[32m✓\033[0m $*"; }
warn()    { echo -e "  \033[33m!\033[0m $*"; }
info()    { echo -e "  \033[36m→\033[0m $*"; }
section() { echo; bold "━━━ $* ━━━"; }

# ── Argomenti CLI ─────────────────────────────────────────────────────────────
args=("$@")
for (( i=0; i<${#args[@]}; i++ )); do
  case "${args[$i]}" in
    --gen-secrets|--gen-tokens) GEN_SECRETS=1 ;;
    --skip-gh) SKIP_GH=1 ;;
    --groups)
      if (( i+1 < ${#args[@]} )); then
        CORE_GROUPS="${args[$((i+1))]}"; i=$((i+1))
      fi ;;
    -h|--help)
      echo "Uso: $0 [--gen-secrets] [--groups \"codice1 codice2 ...\"] [--skip-gh]"
      echo ""
      echo "  Installa i servizi mancanti (postgres, redis, valhalla, pgadmin)"
      echo "  e le istanze GraphHopper-area per i gruppi selezionati."
      echo ""
      echo "  --gen-secrets  Genera automaticamente i secret locali mancanti"
      echo "                 (SESSION_SECRET, OSM_UPDATE_SECRET)."
      echo "  --groups       Gruppi GraphHopper da buildare/avviare"
      echo "                 (default: grecia balcani iberia arco-alpino)."
      echo "  --skip-gh      Salta completamente il flusso GraphHopper-area"
      echo "                 (download, build, avvio istanze)."
      exit 0 ;;
    *) die "Argomento sconosciuto: ${args[$i]} (usa --help)" ;;
  esac
done

read -r -a CORE_GROUPS_ARR <<< "$CORE_GROUPS"

[[ "$(id -u)" -eq 0 ]] && SUDO="" || SUDO="sudo"

# Mappa codice → porta interna (sync con shared/routing-areas.ts).
area_port() {
  case "$1" in
    grecia)          echo 8990 ;;
    balcani)         echo 8991 ;;
    est)             echo 8992 ;;
    iberia)          echo 8993 ;;
    arco-alpino)     echo 8994 ;;
    germania-centro) echo 8995 ;;
    francia-benelux) echo 8996 ;;
    *)               echo 0 ;;
  esac
}

# =============================================================================
section "1/9 — Verifica sistema operativo"
# =============================================================================
if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  info "Rilevato: ${PRETTY_NAME:-sconosciuto}"
  if [[ "${ID:-}" != "ubuntu" && "${ID_LIKE:-}" != *debian* ]]; then
    warn "Questo script è testato su Ubuntu/Debian. Procedo comunque."
  fi
else
  warn "Impossibile determinare la distro (/etc/os-release assente)."
fi

# =============================================================================
section "2/9 — Prerequisiti (apt)"
# =============================================================================
install_base_packages() {
  info "Aggiorno l'indice dei pacchetti..."
  $SUDO apt-get update -y
  info "Installo wget, curl, ca-certificates, gnupg, osmium-tool, python3-pyosmium..."
  $SUDO apt-get install -y wget curl ca-certificates gnupg osmium-tool coreutils python3-pyosmium
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "Docker Engine + plugin compose già presenti ($(docker --version))"
    return 0
  fi
  info "Installo Docker Engine + plugin compose dal repo ufficiale Docker..."
  $SUDO install -m 0755 -d /etc/apt/keyrings

  local distro codename os_id
  os_id="$(. /etc/os-release 2>/dev/null && echo "${ID:-ubuntu}")"
  case "$os_id" in
    ubuntu) distro="ubuntu" ;;
    debian) distro="debian" ;;
    *)
      warn "Distro '${os_id}' non riconosciuta — uso il repo Docker per Ubuntu come fallback."
      distro="ubuntu"
      ;;
  esac

  codename="$(. /etc/os-release 2>/dev/null && echo "${VERSION_CODENAME:-}")"
  if [[ -z "$codename" ]]; then
    codename="$(lsb_release -cs 2>/dev/null || true)"
  fi
  if [[ -z "$codename" ]]; then
    [[ "$distro" == "debian" ]] && codename="bookworm" || codename="noble"
    warn "VERSION_CODENAME non trovato — uso il default '${codename}'."
  fi
  info "Distro rilevata: ${distro} (${codename})"

  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL "https://download.docker.com/linux/${distro}/gpg" \
      | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    $SUDO chmod a+r /etc/apt/keyrings/docker.gpg
  fi
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/${distro} ${codename} stable" \
    | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
  $SUDO apt-get update -y
  $SUDO apt-get install -y \
    docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
  $SUDO systemctl enable --now docker
  ok "Docker installato ($(docker --version))"

  if [[ -n "${SUDO_USER:-}" || "$(id -u)" -ne 0 ]]; then
    local target_user="${SUDO_USER:-$USER}"
    $SUDO usermod -aG docker "$target_user" || true
    warn "Aggiunto '$target_user' al gruppo docker. Esci e rientra (o riavvia) per usarlo senza sudo."
  fi
}

install_base_packages
install_docker

if docker info >/dev/null 2>&1; then
  DOCKER="docker"
else
  DOCKER="$SUDO docker"
fi

# =============================================================================
section "3/9 — Configurazione .env"
# =============================================================================
gen_secret()     { openssl rand -hex 24 2>/dev/null || head -c 36 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 36; }
gen_b64_secret() {
  command -v openssl >/dev/null 2>&1 || die "openssl non disponibile: impossibile generare i secret."
  openssl rand -base64 32
}

read_env_value() {
  local key="$1" file="$2" line val
  [[ -r "$file" ]] || return 1
  line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n1 || true)"
  [[ -n "$line" ]] || return 1
  val="${line#*=}"; val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
  printf '%s' "$val"
}

sed_escape() { printf '%s' "$1" | sed -e 's/[\#&]/\\&/g'; }

upsert_env_value() {
  local key="$1" value="$2" file="$3" tmp esc_val
  if [[ ! -e "$file" ]]; then mkdir -p "$(dirname "$file")"; : > "$file"; fi
  [[ -w "$file" ]] || die "Impossibile scrivere su $file (permessi?)."
  esc_val="$(sed_escape "$value")"
  if grep -qE "^[[:space:]]*${key}=" "$file"; then
    tmp="$(mktemp)"
    sed -E "s#^[[:space:]]*${key}=.*#${key}=${esc_val}#" "$file" > "$tmp"
    cat "$tmp" > "$file"; rm -f "$tmp"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

should_generate_secret() {
  local name="$1" reply
  [[ "$GEN_SECRETS" == "1" ]] && return 0
  [[ "$NONINTERACTIVE" == "1" ]] && return 1
  read -r -p "  ${name} assente: generarlo automaticamente e salvarlo in .env.local? [s/N] " reply
  [[ "${reply,,}" == "s" || "${reply,,}" == "y" ]]
}

if [[ -f "$ENV_FILE" ]]; then
  warn ".env già presente — riuso le credenziali esistenti (non sovrascrivo)."
  check_env_quoted "$ENV_FILE"
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
else
  POSTGRES_USER="bikerlink"
  POSTGRES_PASSWORD="$(gen_secret)"
  POSTGRES_DB="bikerlink"
  PGADMIN_EMAIL="admin@bikerlink.local"
  PGADMIN_PASSWORD="$(gen_secret)"

  cat > "$ENV_FILE" <<EOF
# Generato automaticamente da setup-missing.sh il $(date '+%Y-%m-%d %H:%M:%S')
# NON committare questo file. Contiene le credenziali dei servizi locali.
POSTGRES_USER="${POSTGRES_USER}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
POSTGRES_DB="${POSTGRES_DB}"
PGADMIN_EMAIL="${PGADMIN_EMAIL}"
PGADMIN_PASSWORD="${PGADMIN_PASSWORD}"
EOF
  chmod 600 "$ENV_FILE"
  ok "Generato .env con password casuali sicure."
fi

if [[ -f "$TEMPLATE_FILE" ]]; then
  if [[ -f "$ENV_LOCAL_FILE" ]]; then
    warn ".env.local già presente — non sovrascrivo."
  else
    DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}"
    sed "s#__DATABASE_URL__#${DATABASE_URL}#g" "$TEMPLATE_FILE" > "$ENV_LOCAL_FILE"
    chmod 600 "$ENV_LOCAL_FILE"
    ok "Generato .env.local per l'app (DATABASE_URL valorizzato)."
    info "Ricorda di compilare le variabili ${PLACEHOLDER_VALUE} in .env.local prima di avviare l'app."
  fi
else
  warn ".env.local.template non trovato — salto la generazione di .env.local"
fi

if [[ -f "$ENV_LOCAL_FILE" ]]; then
  for secret_key in SESSION_SECRET OSM_UPDATE_SECRET; do
    cur_val="$(read_env_value "$secret_key" "$ENV_LOCAL_FILE" 2>/dev/null || true)"
    if [[ -n "$cur_val" && "$cur_val" != "$PLACEHOLDER_VALUE" ]]; then
      ok "${secret_key} già valorizzato in .env.local — non sovrascrivo."
      continue
    fi
    if should_generate_secret "$secret_key"; then
      upsert_env_value "$secret_key" "$(gen_b64_secret)" "$ENV_LOCAL_FILE"
      ok "${secret_key} generato e scritto in .env.local"
    else
      warn "${secret_key} lasciato come ${PLACEHOLDER_VALUE}: inseriscilo a mano nel .env.local."
    fi
  done
fi

# =============================================================================
section "4/9 — Download dati OSM per gruppi-area GraphHopper"
# =============================================================================
mkdir -p "$DATA_DIR"

if [[ "$SKIP_GH" == "1" ]]; then
  info "Flusso GraphHopper saltato (--skip-gh)."
else
  DOWNLOAD_SCRIPT="${SCRIPT_DIR}/download-regions.sh"
  [[ -f "$DOWNLOAD_SCRIPT" ]] || die "download-regions.sh non trovato in ${SCRIPT_DIR}/"
  chmod +x "$DOWNLOAD_SCRIPT"

  info "Gruppi GraphHopper richiesti: ${CORE_GROUPS}"

  all_pbfs_present=true
  for grp in "${CORE_GROUPS_ARR[@]}"; do
    [[ -f "${DATA_DIR}/${grp}.osm.pbf" ]] || { all_pbfs_present=false; break; }
  done

  if [[ "$all_pbfs_present" == "true" ]]; then
    ok "PBF per i gruppi richiesti già presenti in ${DATA_DIR}/ — salto il download."
  else
    warn "Alcuni PBF mancanti — avvio download-regions.sh per i gruppi: ${CORE_GROUPS}"
    if [[ "$NONINTERACTIVE" == "1" ]]; then
      info "Modalità non-interattiva: procedo con il download."
      DATA_DIR="$DATA_DIR" "$DOWNLOAD_SCRIPT" "${CORE_GROUPS_ARR[@]}"
    else
      echo ""
      info "Il download scarica i .pbf nazionali per i gruppi: ${CORE_GROUPS}"
      read -r -p "  Procedo con il download? [s/N] " _dl_reply
      if [[ "${_dl_reply,,}" == "s" || "${_dl_reply,,}" == "y" ]]; then
        DATA_DIR="$DATA_DIR" "$DOWNLOAD_SCRIPT" "${CORE_GROUPS_ARR[@]}"
      else
        warn "Download saltato. I grafi non verranno buildati per i gruppi senza PBF."
        warn "Esegui manualmente: ./download-regions.sh ${CORE_GROUPS}"
      fi
    fi
  fi
fi

# =============================================================================
section "5/9 — Build grafi GraphHopper per gruppi-area"
# =============================================================================
if [[ "$SKIP_GH" == "1" ]]; then
  info "Build GraphHopper saltato (--skip-gh)."
else
  BUILD_SCRIPT="${SCRIPT_DIR}/build-regions.sh"
  [[ -f "$BUILD_SCRIPT" ]] || die "build-regions.sh non trovato in ${SCRIPT_DIR}/"
  chmod +x "$BUILD_SCRIPT"

  all_graphs_present=true
  for grp in "${CORE_GROUPS_ARR[@]}"; do
    [[ -d "${GRAPHS_DIR}/${grp}/edges" ]] || { all_graphs_present=false; break; }
  done

  if [[ "$all_graphs_present" == "true" ]]; then
    ok "Grafi per i gruppi richiesti già presenti in ${GRAPHS_DIR}/ — salto il build."
    info "Per forzare un rebuild: rimuovi le cartelle in ${GRAPHS_DIR}/ e rilancia."
  else
    # Builda solo i gruppi con PBF presente e grafo assente.
    GROUPS_TO_BUILD=()
    for grp in "${CORE_GROUPS_ARR[@]}"; do
      if [[ ! -d "${GRAPHS_DIR}/${grp}/edges" ]]; then
        if [[ -f "${DATA_DIR}/${grp}.osm.pbf" ]]; then
          GROUPS_TO_BUILD+=("$grp")
        else
          warn "PBF assente per '${grp}' — grafo non buildato. Scarica con: ./download-regions.sh ${grp}"
        fi
      fi
    done

    if [[ ${#GROUPS_TO_BUILD[@]} -gt 0 ]]; then
      info "Build grafi per: ${GROUPS_TO_BUILD[*]}"
      warn "Il build può richiedere 20-60 min per area a seconda delle dimensioni e della RAM."
      DATA_DIR="$DATA_DIR" GRAPHS_DIR="$GRAPHS_DIR" "$BUILD_SCRIPT" "${GROUPS_TO_BUILD[@]}"
    else
      info "Nessun gruppo da buildare (tutti già presenti o senza PBF)."
    fi
  fi
fi

# =============================================================================
section "6/9 — Verifica dati Valhalla (PBF)"
# =============================================================================
PBF_SEARCH="$(find "$DATA_DIR" -maxdepth 1 -name "*.osm.pbf" 2>/dev/null | head -1 || true)"
VALHALLA_FORCE_RECREATE=0

if [[ -n "$PBF_SEARCH" ]]; then
  ok "PBF trovato in ${DATA_DIR}/ ($(basename "$PBF_SEARCH"))"
  info "Valhalla builderà i tile all'avvio (può richiedere fino a 3h)."
  VALHALLA_FORCE_RECREATE=1
else
  warn "Nessun file .osm.pbf trovato in ${DATA_DIR}/"
  warn "Valhalla si avvierà vuoto e non potrà calcolare percorsi."
  info "Per aggiungere dati Valhalla: ./download-regions.sh arco-alpino  (o altri gruppi)"
fi

# =============================================================================
section "7/9 — Avvio servizi base"
# =============================================================================
info "Avvio: postgres redis pgadmin valhalla..."
$DOCKER compose --env-file "$ENV_FILE" up -d postgres redis pgadmin

info "Avvio Valhalla..."
if [[ "$VALHALLA_FORCE_RECREATE" == "1" ]]; then
  info "PBF presente — avvio Valhalla con --force-recreate per triggerare il build dei tile."
  $DOCKER compose --env-file "$ENV_FILE" up -d --force-recreate valhalla
else
  $DOCKER compose --env-file "$ENV_FILE" up -d valhalla
fi

wait_healthy() {
  local svc="$1" timeout="$2" elapsed=0 interval=10 status
  info "Attendo l'health di '${svc}' (timeout $((timeout / 60)) min)..."
  while (( elapsed < timeout )); do
    status="$($DOCKER inspect --format '{{.State.Health.Status}}' "bikerlink-${svc}" 2>/dev/null || echo "missing")"
    case "$status" in
      healthy)
        ok "'${svc}' healthy (dopo ${elapsed}s)"
        return 0
        ;;
      missing)
        warn "Container bikerlink-${svc} non trovato."
        return 1
        ;;
    esac
    sleep "$interval"
    elapsed=$(( elapsed + interval ))
    if (( elapsed % 60 == 0 )); then
      info "'${svc}' ancora '${status}' (${elapsed}s trascorsi)..."
    fi
  done
  warn "'${svc}' non è diventato healthy entro $((timeout / 60)) min (stato: ${status})."
  warn "Controlla: $DOCKER compose logs ${svc}"
  return 1
}

wait_healthy postgres "$TIMEOUT_FAST"     || true
wait_healthy redis    "$TIMEOUT_FAST"     || true
wait_healthy pgadmin  "$TIMEOUT_FAST"     || true
wait_healthy valhalla "$TIMEOUT_VALHALLA" || true

# =============================================================================
section "8/9 — Avvio istanze GraphHopper-area"
# =============================================================================
if [[ "$SKIP_GH" == "1" ]]; then
  info "Avvio istanze GraphHopper saltato (--skip-gh)."
else
  info "Avvio istanze GraphHopper-area per i gruppi richiesti: ${CORE_GROUPS}..."
  for grp in "${CORE_GROUPS_ARR[@]}"; do
    svc="graphhopper-${grp}"
    if [[ -d "${GRAPHS_DIR}/${grp}/edges" ]]; then
      info "  Avvio ${svc}..."
      $DOCKER compose --env-file "$ENV_FILE" up -d "$svc" || \
        warn "  Avvio ${svc} fallito — verifica i log: $DOCKER compose logs ${svc}"
    else
      warn "  Grafo per '${grp}' non trovato in ${GRAPHS_DIR}/${grp}/ — ${svc} non avviato."
      warn "  Esegui manualmente: ./build-regions.sh ${grp} && docker compose up -d ${svc}"
    fi
  done

  # Attesa health per le istanze GraphHopper avviate.
  wait_gh_healthy() {
    local svc="$1" port="$2" timeout="$3" elapsed=0 interval=15
    info "  Attendo /health di '${svc}' su :${port} (timeout $((timeout/60)) min)..."
    while (( elapsed < timeout )); do
      if curl -fsS --max-time 5 "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
        ok "  '${svc}' healthy (dopo ${elapsed}s)"
        return 0
      fi
      sleep "$interval"; elapsed=$((elapsed + interval))
      if (( elapsed % 60 == 0 )); then info "  '${svc}' ancora in avvio (${elapsed}s)..."; fi
    done
    warn "  '${svc}' non healthy entro $((timeout/60)) min. Controlla: $DOCKER compose logs ${svc}"
    return 1
  }

  for grp in "${CORE_GROUPS_ARR[@]}"; do
    port="$(area_port "$grp")"
    [[ "$port" -gt 0 ]] || continue
    [[ -d "${GRAPHS_DIR}/${grp}/edges" ]] || continue
    wait_gh_healthy "graphhopper-${grp}" "$port" "$TIMEOUT_GH_SERVE" || true
  done
fi

wait_valhalla_tiles_ready() {
  local attempts=3 interval=15 attempt=0
  local valhalla_url="http://localhost:8002"
  local route_body='{"locations":[{"lon":9.1895,"lat":45.4654},{"lon":7.6869,"lat":45.0703}],"costing":"auto","directions_options":{"units":"kilometers"}}'

  info "Verifico che i tile Valhalla siano pronti (route di prova Milano → Torino)..."

  while (( attempt < attempts )); do
    attempt=$(( attempt + 1 ))
    local raw_response http_code body
    raw_response="$(curl -s -w '\n__HTTP_CODE__:%{http_code}' \
      -X POST -H 'Content-Type: application/json' -d "$route_body" \
      "${valhalla_url}/route" --max-time 30 2>/dev/null || true)"
    http_code="$(printf '%s' "$raw_response" | grep '__HTTP_CODE__:' | sed 's/__HTTP_CODE__://' | tr -d '[:space:]')"
    body="$(printf '%s' "$raw_response" | grep -v '__HTTP_CODE__:' || true)"

    if [[ "$http_code" == "200" ]]; then
      ok "Tile Valhalla pronti — route di prova completata con successo."
      return 0
    fi

    if [[ -z "$http_code" ]]; then
      warn "Tentativo ${attempt}/${attempts}: Valhalla non raggiungibile."
    elif printf '%s' "$body" | grep -qiE "no data|no route|tile.*not.*found|insufficient"; then
      warn "Tentativo ${attempt}/${attempts}: tile ancora in costruzione (HTTP ${http_code})."
    else
      warn "Tentativo ${attempt}/${attempts}: risposta inattesa (HTTP ${http_code})."
    fi

    (( attempt < attempts )) && { info "Riprovo tra ${interval}s..."; sleep "$interval"; }
  done

  warn "Tile Valhalla NON ancora pronti — Valhalla è vivo ma il calcolo percorsi non è disponibile."
  warn "Monitora con: $DOCKER compose logs -f valhalla"
  return 1
}

VALHALLA_TILES_READY=0
wait_valhalla_tiles_ready && VALHALLA_TILES_READY=1 || true

# =============================================================================
section "9/9 — Riepilogo"
# =============================================================================
check_env_quoted "$ENV_FILE"
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

cat <<EOF

$(bold "BikerLink self-host — servizi avviati")

  PostgreSQL + PostGIS   localhost:5432
      utente   : ${POSTGRES_USER}
      password : ${POSTGRES_PASSWORD}
      database : ${POSTGRES_DB}
      DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}

  Redis                  redis://localhost:6379

  Valhalla               http://localhost:8002   (status: /status)
$(if [[ "$VALHALLA_TILES_READY" == "1" ]]; then
    echo "      ✓  Tile pronti — calcolo percorsi attivo."
  elif [[ -z "$PBF_SEARCH" ]]; then
    echo "      ⚠  Nessun PBF trovato — tile non costruiti."
    echo "         Scarica con: ./download-regions.sh arco-alpino"
  else
    echo "      ⚠  Tile ancora in costruzione (build in corso)."
    echo "         Monitora con: docker compose logs -f valhalla"
  fi)

  pgAdmin 4              http://localhost:5050
      email    : ${PGADMIN_EMAIL}
      password : ${PGADMIN_PASSWORD}

  Ollama                 già attivo — non toccato

$(bold "GraphHopper — istanze multi-area (porte 8990-8996)")
$(if [[ "$SKIP_GH" == "1" ]]; then
  echo "  (saltate con --skip-gh)"
else
  for grp in "${CORE_GROUPS_ARR[@]}"; do
    port="$(area_port "$grp")"
    if [[ -d "${GRAPHS_DIR}/${grp}/edges" ]]; then
      echo "  ${grp}  http://127.0.0.1:${port}  (health: /health)"
    else
      echo "  ${grp}  ⚠ grafo assente — avvia con: ./build-regions.sh ${grp} && docker compose up -d graphhopper-${grp}"
    fi
  done
fi)

$(bold "File generati")
  .env         credenziali dei container Docker
  .env.local   variabili per l'app BikerLink (DATABASE_URL già pronto)
               Variabili ${PLACEHOLDER_VALUE} da compilare manualmente:
               GRAPHHOPPER_URL (URL base del proxy nginx), GRAPHHOPPER_TOKEN,
               ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY,
               MAPBOX_ACCESS_TOKEN, SESSION_SECRET, OSM_UPDATE_SECRET

$(bold "Comandi utili")
  docker compose ps --all                        stato di tutti i container
  docker compose logs -f graphhopper-arco-alpino log in tempo reale
  docker compose stop  graphhopper-est           spegni un'area
  docker compose up -d graphhopper-est           accendi un'area
  docker compose down                            ferma i servizi
  ./update-osm.sh                                aggiorna tutti i dati OSM

EOF
ok "Setup completato."
