#!/usr/bin/env bash
# =============================================================================
# BikerLink — setup-missing.sh
# Installa i servizi mancanti su un server che ha già GraphHopper (porta 8989)
# e Ollama attivi. Avvia solo: postgres, redis, valhalla, pgadmin.
#
# Cosa fa:
#   1. Verifica OS Ubuntu/Debian.
#   2. Installa i prerequisiti via apt (Docker + plugin compose) se assenti.
#   3. Genera .env con password casuali (non sovrascrive se esiste già).
#   4. Genera .env.local dal template con DATABASE_URL precompilato.
#   5. docker compose up -d postgres redis valhalla pgadmin  (GraphHopper escluso).
#   6. Attende l'health check di ciascun servizio.
#   7. Stampa il riepilogo finale (URL, porte, credenziali).
#
# Uso:
#   chmod +x setup-missing.sh && ./setup-missing.sh
#   ./setup-missing.sh --gen-secrets   # genera anche i secret locali in .env.local
#
# Variabili d'ambiente utili (CI / scripting non-interattivo):
#   GEN_SECRETS=1      genera i secret locali mancanti senza prompt
#   NONINTERACTIVE=1   disabilita i prompt
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="${SCRIPT_DIR}/.env"
ENV_LOCAL_FILE="${SCRIPT_DIR}/.env.local"
TEMPLATE_FILE="${SCRIPT_DIR}/.env.local.template"
PLACEHOLDER_VALUE="<INSERIRE>"

GEN_SECRETS="${GEN_SECRETS:-${GEN_TOKENS:-0}}"
NONINTERACTIVE="${NONINTERACTIVE:-0}"

# Timeout health check (secondi)
TIMEOUT_FAST=120          # postgres, redis, pgadmin  (2 min)
TIMEOUT_VALHALLA=$((3 * 60 * 60))  # 3h (build tile Europa se il PBF è presente)

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
for arg in "$@"; do
  case "$arg" in
    --gen-secrets|--gen-tokens) GEN_SECRETS=1 ;;
    -h|--help)
      echo "Uso: $0 [--gen-secrets]"
      echo ""
      echo "  Installa i servizi mancanti (postgres, redis, valhalla, pgadmin)"
      echo "  su un server che ha già GraphHopper e Ollama attivi."
      echo ""
      echo "  --gen-secrets  Genera automaticamente i secret locali mancanti"
      echo "                 (SESSION_SECRET, OSM_UPDATE_SECRET) con 'openssl rand -base64 32'"
      echo "                 e li scrive nel .env.local. Equivalente a GEN_SECRETS=1."
      exit 0 ;;
    *) die "Argomento sconosciuto: $arg (usa --help)" ;;
  esac
done

[[ "$(id -u)" -eq 0 ]] && SUDO="" || SUDO="sudo"

# =============================================================================
section "1/6 — Verifica sistema operativo"
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
section "2/6 — Prerequisiti (apt)"
# =============================================================================
install_base_packages() {
  info "Aggiorno l'indice dei pacchetti..."
  $SUDO apt-get update -y
  info "Installo wget, curl, ca-certificates, gnupg, osmium-tool..."
  $SUDO apt-get install -y wget curl ca-certificates gnupg osmium-tool coreutils
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "Docker Engine + plugin compose già presenti ($(docker --version))"
    return 0
  fi
  info "Installo Docker Engine + plugin compose dal repo ufficiale Docker..."
  $SUDO install -m 0755 -d /etc/apt/keyrings

  # Rileva la distro (ubuntu o debian) per usare l'URL corretto del repo Docker.
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

# Wrapper: usa sudo per docker se l'utente non è ancora nel gruppo docker
if docker info >/dev/null 2>&1; then
  DOCKER="docker"
else
  DOCKER="$SUDO docker"
fi

# =============================================================================
section "3/6 — Configurazione .env"
# =============================================================================
gen_secret()     { openssl rand -hex 24 2>/dev/null || head -c 36 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 36; }
gen_b64_secret() {
  command -v openssl >/dev/null 2>&1 || die "openssl non disponibile: impossibile generare i secret."
  openssl rand -base64 32
}

# Legge il valore di una chiave da un file .env (ultima occorrenza, trim quote).
read_env_value() {
  local key="$1" file="$2" line val
  [[ -r "$file" ]] || return 1
  line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n1 || true)"
  [[ -n "$line" ]] || return 1
  val="${line#*=}"
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  printf '%s' "$val"
}

# Escape per sed (sostituzione sicura su separatore '#').
sed_escape() { printf '%s' "$1" | sed -e 's/[\#&]/\\&/g'; }

# Inserisce/aggiorna una chiave nel file .env.local (crea il file se assente).
upsert_env_value() {
  local key="$1" value="$2" file="$3" tmp esc_val
  if [[ ! -e "$file" ]]; then
    mkdir -p "$(dirname "$file")"
    : > "$file"
  fi
  [[ -w "$file" ]] || die "Impossibile scrivere su $file (permessi?)."
  esc_val="$(sed_escape "$value")"
  if grep -qE "^[[:space:]]*${key}=" "$file"; then
    tmp="$(mktemp)"
    sed -E "s#^[[:space:]]*${key}=.*#${key}=${esc_val}#" "$file" > "$tmp"
    cat "$tmp" > "$file"
    rm -f "$tmp"
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
  # GraphHopper è già attivo: usiamo un placeholder per GRAPHHOPPER_JAVA_OPTS
  # in modo che docker-compose.yml non fallisca se viene riletto interamente.
  GRAPHHOPPER_JAVA_OPTS="-Xmx16g -Xms4g -XX:+UseG1GC -XX:MaxGCPauseMillis=200"

  cat > "$ENV_FILE" <<EOF
# Generato automaticamente da setup-missing.sh il $(date '+%Y-%m-%d %H:%M:%S')
# NON committare questo file. Contiene le credenziali dei servizi locali.
POSTGRES_USER="${POSTGRES_USER}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
POSTGRES_DB="${POSTGRES_DB}"
PGADMIN_EMAIL="${PGADMIN_EMAIL}"
PGADMIN_PASSWORD="${PGADMIN_PASSWORD}"
GRAPHHOPPER_JAVA_OPTS="${GRAPHHOPPER_JAVA_OPTS}"
EOF
  chmod 600 "$ENV_FILE"
  ok "Generato .env con password casuali sicure."
fi

# Genera .env.local per l'app BikerLink a partire dal template.
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

# Genera i secret puramente locali (SESSION_SECRET, OSM_UPDATE_SECRET) se assenti.
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
section "4/6 — Verifica dati Valhalla (PBF)"
# =============================================================================
DATA_DIR="${DATA_DIR:-${SCRIPT_DIR}/data}"
mkdir -p "$DATA_DIR"

PBF_FILE="${DATA_DIR}/europe-ecuador-merged.osm.pbf"
VALHALLA_FORCE_RECREATE=0

if [[ -f "$PBF_FILE" ]]; then
  ok "PBF trovato: ${PBF_FILE}"
  info "Valhalla builderà i tile all'avvio (può richiedere fino a 3h per l'Europa)."
else
  warn "Nessun file PBF trovato in ${DATA_DIR}/"
  warn "Senza dati OSM Valhalla si avvierà vuoto e non potrà calcolare percorsi."

  _do_download=0
  if [[ "$NONINTERACTIVE" == "1" ]]; then
    warn "Modalità non-interattiva: skip download automatico."
    warn "Esegui './download-osm.sh' manualmente e poi rilancia questo script."
  else
    echo ""
    info "Il download scarica Europa + Ecuador (~35 GB) e richiede circa 2 ore."
    read -r -p "  Vuoi scaricare i dati OSM ora? [s/N] " _dl_reply
    [[ "${_dl_reply,,}" == "s" || "${_dl_reply,,}" == "y" ]] && _do_download=1
  fi

  if [[ "$_do_download" == "1" ]]; then
    DOWNLOAD_SCRIPT="${SCRIPT_DIR}/download-osm.sh"
    [[ -f "$DOWNLOAD_SCRIPT" ]] || die "download-osm.sh non trovato in ${SCRIPT_DIR}/"
    chmod +x "$DOWNLOAD_SCRIPT"
    info "Avvio download-osm.sh (puoi interrompere con Ctrl-C e riprendere dopo)..."
    "$DOWNLOAD_SCRIPT"
    if [[ -f "$PBF_FILE" ]]; then
      ok "PBF pronto: ${PBF_FILE}"
      VALHALLA_FORCE_RECREATE=1
    else
      warn "download-osm.sh terminato ma il file PBF non risulta presente — controlla gli errori sopra."
    fi
  else
    warn "Download saltato."
    warn "Per scaricare i dati in seguito esegui: ./download-osm.sh"
    warn "Poi rilancia questo script (o: docker compose up -d --force-recreate valhalla)."
  fi
fi

# =============================================================================
section "5/6 — Avvio servizi mancanti (GraphHopper escluso)"
# =============================================================================
info "Avvio: postgres redis pgadmin  (GraphHopper già attivo — saltato)"
$DOCKER compose --env-file "$ENV_FILE" up -d postgres redis pgadmin

info "Avvio Valhalla..."
if [[ -f "$PBF_FILE" ]]; then
  # PBF presente: usa --force-recreate per garantire che Valhalla (anche se già
  # in esecuzione senza dati) venga riavviato e costruisca i tile.
  # I tile già costruiti (nel volume Docker) vengono preservati; il container
  # li rileva all'avvio e non riesegue il build se sono aggiornati.
  if [[ "$VALHALLA_FORCE_RECREATE" == "1" ]]; then
    info "PBF appena scaricato — avvio Valhalla con --force-recreate per triggerare il build dei tile."
  else
    info "PBF presente — avvio Valhalla con --force-recreate per garantire il build dei tile."
  fi
  $DOCKER compose --env-file "$ENV_FILE" up -d --force-recreate valhalla
else
  $DOCKER compose --env-file "$ENV_FILE" up -d valhalla
fi

# Attesa health check per servizio.
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

wait_healthy postgres "$TIMEOUT_FAST"    || true
wait_healthy redis    "$TIMEOUT_FAST"    || true
wait_healthy pgadmin  "$TIMEOUT_FAST"    || true
wait_healthy valhalla "$TIMEOUT_VALHALLA" || true

# Verifica che Valhalla abbia i tile pronti (non solo "vivo").
# Dopo l'healthy-check il container è up ma i tile potrebbero essere ancora in build.
# Esegue una route di prova Milano → Torino; stampa avviso ma NON esce in errore.
wait_valhalla_tiles_ready() {
  local attempts=3 interval=15 attempt=0
  local valhalla_url="http://localhost:8002"
  # Rotta di prova: Milano → Torino (entrambe in Europa, sempre nel PBF).
  local route_body='{"locations":[{"lon":9.1895,"lat":45.4654},{"lon":7.6869,"lat":45.0703}],"costing":"auto","directions_options":{"units":"kilometers"}}'

  info "Verifico che i tile Valhalla siano pronti (route di prova Milano → Torino)..."

  while (( attempt < attempts )); do
    attempt=$(( attempt + 1 ))
    local raw_response http_code body
    raw_response="$(curl -s -w '\n__HTTP_CODE__:%{http_code}' \
      -X POST \
      -H 'Content-Type: application/json' \
      -d "$route_body" \
      "${valhalla_url}/route" \
      --max-time 30 2>/dev/null || true)"
    http_code="$(printf '%s' "$raw_response" | grep '__HTTP_CODE__:' | sed 's/__HTTP_CODE__://' | tr -d '[:space:]')"
    body="$(printf '%s' "$raw_response" | grep -v '__HTTP_CODE__:' || true)"

    if [[ "$http_code" == "200" ]]; then
      ok "Tile Valhalla pronti — route di prova completata con successo."
      return 0
    fi

    if [[ -z "$http_code" ]]; then
      warn "Tentativo ${attempt}/${attempts}: Valhalla non raggiungibile su ${valhalla_url}."
    elif printf '%s' "$body" | grep -qiE "no data|no route|no path|tile.*not.*found|data.*not.*found|insufficient"; then
      warn "Tentativo ${attempt}/${attempts}: tile ancora in costruzione (HTTP ${http_code})."
    else
      warn "Tentativo ${attempt}/${attempts}: risposta inattesa (HTTP ${http_code}): $(printf '%s' "$body" | head -c 200)"
    fi

    if (( attempt < attempts )); then
      info "Riprovo tra ${interval}s..."
      sleep "$interval"
    fi
  done

  warn "Tile Valhalla NON ancora pronti dopo ${attempts} tentativi."
  warn "Il build dei tile può richiedere ore — Valhalla è vivo ma il calcolo percorsi non è ancora disponibile."
  warn "Per monitorare il progresso: $DOCKER compose logs -f valhalla"
  return 1
}

VALHALLA_TILES_READY=0
wait_valhalla_tiles_ready && VALHALLA_TILES_READY=1 || true

# =============================================================================
section "6/6 — Riepilogo"
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
  elif [[ ! -f "$PBF_FILE" ]]; then
    echo "      ⚠  Nessun PBF trovato — tile non costruiti. Esegui ./download-osm.sh"
  else
    echo "      ⚠  Tile ancora in costruzione (build in corso). Valhalla è vivo ma"
    echo "         il calcolo percorsi non è ancora disponibile."
    echo "         Monitora con: docker compose logs -f valhalla"
  fi)

  pgAdmin 4              http://localhost:5050
      email    : ${PGADMIN_EMAIL}
      password : ${PGADMIN_PASSWORD}

  GraphHopper            http://localhost:8989   (già attivo — non toccato)
  Ollama                 già attivo — non toccato

$(bold "File generati")
  .env         credenziali dei container Docker
  .env.local   variabili per l'app BikerLink (DATABASE_URL già pronto)
               Variabili ${PLACEHOLDER_VALUE} da compilare manualmente:
               ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY,
               MAPBOX_ACCESS_TOKEN, TOMTOM_API_KEY, GRAPHHOPPER_TOKEN,
               SESSION_SECRET, OSM_UPDATE_SECRET

$(bold "Comandi utili")
  docker compose ps                          stato dei servizi
  docker compose logs -f valhalla            log Valhalla in tempo reale
  docker compose down                        ferma i servizi
  docker compose up -d postgres redis pgadmin   riavvia solo i 3 veloci

EOF
ok "Setup servizi mancanti completato."
