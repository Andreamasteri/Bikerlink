#!/usr/bin/env bash
# =============================================================================
# BikerLink — setup.sh
# Setup completo dello stack self-host su Ubuntu Server 24.04 LTS (Noble Numbat).
# Pensato per essere lanciato DIRETTAMENTE sulla macchina (monitor + tastiera),
# NON in modalità SSH headless. Richiede sudo per installare i prerequisiti.
#
# Cosa fa:
#   1. Verifica/installa i prerequisiti via apt (Docker + plugin compose,
#      osmium-tool, wget, curl).
#   2. Verifica spazio disco (>100 GB liberi).
#   3. Genera .env (da .env.local.template) con password casuali sicure.
#   4. Crea le directory dei volumi.
#   5. Chiede conferma e lancia download-osm.sh (~30 GB).
#   6. `docker compose up -d` e attende l'health check di ogni servizio.
#   7. Stampa il riepilogo finale (URL + credenziali).
#
# Uso:
#   chmod +x setup.sh && ./setup.sh
#   ./setup.sh --gen-secrets   # genera anche i secret locali mancanti nel .env.local
#
# Variabili d'ambiente utili (CI / scripting non-interattivo):
#   GEN_SECRETS=1   genera i secret locali mancanti senza prompt
#   NONINTERACTIVE=1 disabilita i prompt (i secret restano <INSERIRE> se non opt-in)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DATA_DIR="${DATA_DIR:-${SCRIPT_DIR}/data}"
ENV_FILE="${SCRIPT_DIR}/.env"
ENV_LOCAL_FILE="${SCRIPT_DIR}/.env.local"
TEMPLATE_FILE="${SCRIPT_DIR}/.env.local.template"
MIN_FREE_GB=100
PLACEHOLDER_VALUE="<INSERIRE>"

# Opt-in generazione secret locali (SESSION_SECRET, OSM_UPDATE_SECRET).
# Coerente con expose/setup-expose.sh: accetta --gen-secrets/--gen-tokens o GEN_SECRETS/GEN_TOKENS=1.
GEN_SECRETS="${GEN_SECRETS:-${GEN_TOKENS:-0}}"
NONINTERACTIVE="${NONINTERACTIVE:-0}"

# Timeout health check (secondi)
TIMEOUT_FAST=120          # postgres, redis, pgadmin
TIMEOUT_GRAPHHOPPER=$((60 * 60))   # 60 min (import grafo Europa)
TIMEOUT_VALHALLA=$((3 * 60 * 60))  # 3h (build tile Europa)

# ── Estetica ──────────────────────────────────────────────────────────────────
bold()  { echo -e "\033[1m$*\033[0m"; }
ok()    { echo -e "  \033[32m✓\033[0m $*"; }
warn()  { echo -e "  \033[33m!\033[0m $*"; }
info()  { echo -e "  \033[36m→\033[0m $*"; }
die()   { echo -e "\033[31m✗ ERRORE:\033[0m $*" >&2; exit 1; }
section() { echo; bold "━━━ $* ━━━"; }

# ── Argomenti CLI ─────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --gen-secrets|--gen-tokens) GEN_SECRETS=1 ;;
    -h|--help)
      echo "Uso: $0 [--gen-secrets]"
      echo "  --gen-secrets  Genera automaticamente i secret locali mancanti/placeholder"
      echo "                 (SESSION_SECRET, OSM_UPDATE_SECRET) con 'openssl rand -base64 32'"
      echo "                 e li scrive nel .env.local. Equivalente a GEN_SECRETS=1."
      exit 0 ;;
    *) die "Argomento sconosciuto: $arg (usa --help)" ;;
  esac
done

[[ "$(id -u)" -eq 0 ]] && SUDO="" || SUDO="sudo"

# ─────────────────────────────────────────────────────────────────────────────
section "1/7 — Verifica sistema operativo"
# ─────────────────────────────────────────────────────────────────────────────
if [[ -r /etc/os-release ]]; then
  . /etc/os-release
  info "Rilevato: ${PRETTY_NAME:-sconosciuto}"
  if [[ "${ID:-}" != "ubuntu" && "${ID_LIKE:-}" != *debian* ]]; then
    warn "Questo script è testato su Ubuntu/Debian. Procedo comunque."
  fi
else
  warn "Impossibile determinare la distro (/etc/os-release assente)."
fi

# ─────────────────────────────────────────────────────────────────────────────
section "2/7 — Prerequisiti (apt)"
# ─────────────────────────────────────────────────────────────────────────────
install_base_packages() {
  info "Aggiorno l'indice dei pacchetti..."
  $SUDO apt-get update -y
  info "Installo wget, curl, osmium-tool, ca-certificates..."
  $SUDO apt-get install -y wget curl ca-certificates gnupg osmium-tool coreutils
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "Docker Engine + plugin compose già presenti ($(docker --version))"
    return 0
  fi
  info "Installo Docker Engine + plugin compose dal repo ufficiale Docker..."
  $SUDO install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    $SUDO chmod a+r /etc/apt/keyrings/docker.gpg
  fi
  local codename
  codename="$(. /etc/os-release && echo "${VERSION_CODENAME:-noble}")"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${codename} stable" \
    | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
  $SUDO apt-get update -y
  $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  $SUDO systemctl enable --now docker
  ok "Docker installato ($(docker --version))"

  # Aggiunge l'utente corrente al gruppo docker (per evitare sudo sui comandi docker)
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

# ─────────────────────────────────────────────────────────────────────────────
section "3/7 — Verifica spazio disco"
# ─────────────────────────────────────────────────────────────────────────────
mkdir -p "$DATA_DIR"
FREE_GB="$(df -BG --output=avail "$DATA_DIR" | tail -1 | tr -dc '0-9')"
info "Spazio libero su $(df --output=target "$DATA_DIR" | tail -1 | xargs): ${FREE_GB} GB"
if (( FREE_GB < MIN_FREE_GB )); then
  die "Spazio insufficiente: servono almeno ${MIN_FREE_GB} GB liberi (disponibili: ${FREE_GB} GB)."
fi
ok "Spazio disco sufficiente (${FREE_GB} GB ≥ ${MIN_FREE_GB} GB)"

# ─────────────────────────────────────────────────────────────────────────────
section "4/7 — Configurazione .env"
# ─────────────────────────────────────────────────────────────────────────────
gen_secret() { openssl rand -hex 24 2>/dev/null || head -c 36 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 36; }

# Genera un secret robusto (32 byte base64), coerente coi token di routing.
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

# Decide se generare un secret mancante: opt-in via --gen-secrets/GEN_SECRETS=1,
# oppure prompt interattivo. In NONINTERACTIVE senza opt-in: no.
should_generate_secret() {
  local name="$1" reply
  [[ "$GEN_SECRETS" == "1" ]] && return 0
  [[ "$NONINTERACTIVE" == "1" ]] && return 1
  read -r -p "  ${name} assente: generarlo automaticamente e salvarlo in .env.local? [s/N] " reply
  [[ "${reply,,}" == "s" || "${reply,,}" == "y" ]]
}

# Calcola lo heap GraphHopper in base alla RAM disponibile (~60%, min 4g, max 24g).
TOTAL_RAM_GB="$(free -g | awk '/^Mem:/{print $2}')"
GH_HEAP_GB=$(( TOTAL_RAM_GB * 6 / 10 ))
(( GH_HEAP_GB < 4 )) && GH_HEAP_GB=4
(( GH_HEAP_GB > 24 )) && GH_HEAP_GB=24

if [[ -f "$ENV_FILE" ]]; then
  warn ".env già presente — riuso le credenziali esistenti (non sovrascrivo)."
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
else
  POSTGRES_USER="bikerlink"
  POSTGRES_PASSWORD="$(gen_secret)"
  POSTGRES_DB="bikerlink"
  PGADMIN_EMAIL="admin@bikerlink.local"
  PGADMIN_PASSWORD="$(gen_secret)"
  GRAPHHOPPER_JAVA_OPTS="-Xmx${GH_HEAP_GB}g -Xms4g -XX:+UseG1GC -XX:MaxGCPauseMillis=200"

  cat > "$ENV_FILE" <<EOF
# Generato automaticamente da setup.sh il $(date '+%Y-%m-%d %H:%M:%S')
# NON committare questo file. Contiene le credenziali dei servizi locali.
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}
PGADMIN_EMAIL=${PGADMIN_EMAIL}
PGADMIN_PASSWORD=${PGADMIN_PASSWORD}
GRAPHHOPPER_JAVA_OPTS=${GRAPHHOPPER_JAVA_OPTS}
EOF
  chmod 600 "$ENV_FILE"
  ok "Generato .env con password casuali (heap GraphHopper: ${GH_HEAP_GB}g)"
fi

# Genera .env.local per l'app BikerLink a partire dal template, valorizzando il DATABASE_URL.
if [[ -f "$TEMPLATE_FILE" ]]; then
  DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}"
  sed "s#__DATABASE_URL__#${DATABASE_URL}#g" "$TEMPLATE_FILE" > "$ENV_LOCAL_FILE"
  chmod 600 "$ENV_LOCAL_FILE"
  ok "Generato .env.local per l'app (DATABASE_URL valorizzato, altri secret cloud da compilare)"
else
  warn ".env.local.template non trovato — salto la generazione di .env.local"
fi

# Genera i secret puramente locali (SESSION_SECRET, OSM_UPDATE_SECRET) se assenti
# o lasciati come placeholder. Opt-in: --gen-secrets / GEN_SECRETS=1 oppure prompt.
if [[ -f "$ENV_LOCAL_FILE" ]]; then
  for secret_key in SESSION_SECRET OSM_UPDATE_SECRET; do
    cur_val="$(read_env_value "$secret_key" "$ENV_LOCAL_FILE" 2>/dev/null || true)"
    if [[ -n "$cur_val" && "$cur_val" != "$PLACEHOLDER_VALUE" ]]; then
      ok "${secret_key} già valorizzato in .env.local — non sovrascrivo."
      continue
    fi
    if should_generate_secret "$secret_key"; then
      upsert_env_value "$secret_key" "$(gen_b64_secret)" "$ENV_LOCAL_FILE"
      ok "${secret_key} generato (openssl rand -base64 32) e scritto in .env.local"
    else
      warn "${secret_key} lasciato come ${PLACEHOLDER_VALUE}: inseriscilo a mano nel .env.local."
    fi
  done
fi

# ─────────────────────────────────────────────────────────────────────────────
section "5/7 — Download dati OSM"
# ─────────────────────────────────────────────────────────────────────────────
if [[ -f "${DATA_DIR}/europe-ecuador-merged.osm.pbf" ]]; then
  ok "PBF unificato già presente — salto il download."
else
  warn "Sto per scaricare ~30 GB di dati OSM (Europa + Ecuador). Può richiedere ~2h."
  read -r -p "  Procedo con il download? [s/N] " ans
  if [[ "${ans,,}" == "s" || "${ans,,}" == "y" ]]; then
    DATA_DIR="$DATA_DIR" bash "${SCRIPT_DIR}/download-osm.sh"
  else
    die "Download annullato dall'utente. Rilancia setup.sh quando vuoi procedere."
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
section "6/7 — Avvio stack Docker"
# ─────────────────────────────────────────────────────────────────────────────
info "docker compose up -d ..."
$DOCKER compose --env-file "$ENV_FILE" up -d

# Attesa health check per servizio.
wait_healthy() {
  local svc="$1" timeout="$2" elapsed=0 interval=10 status
  info "Attendo l'health di '${svc}' (timeout $((timeout/60)) min)..."
  while (( elapsed < timeout )); do
    status="$($DOCKER inspect --format '{{.State.Health.Status}}' "bikerlink-${svc}" 2>/dev/null || echo "missing")"
    case "$status" in
      healthy)  ok "'${svc}' healthy (dopo ${elapsed}s)"; return 0 ;;
      missing)  warn "container bikerlink-${svc} non trovato"; return 1 ;;
    esac
    sleep "$interval"; elapsed=$((elapsed + interval))
    if (( elapsed % 60 == 0 )); then info "'${svc}' ancora '${status}' (${elapsed}s trascorsi)..."; fi
  done
  warn "'${svc}' non è diventato healthy entro $((timeout/60)) min (stato: ${status}). Controlla: $DOCKER compose logs ${svc}"
  return 1
}

wait_healthy postgres    "$TIMEOUT_FAST" || true
wait_healthy redis       "$TIMEOUT_FAST" || true
wait_healthy pgadmin     "$TIMEOUT_FAST" || true
wait_healthy graphhopper "$TIMEOUT_GRAPHHOPPER" || true
wait_healthy valhalla    "$TIMEOUT_VALHALLA" || true

# ─────────────────────────────────────────────────────────────────────────────
section "7/7 — Riepilogo"
# ─────────────────────────────────────────────────────────────────────────────
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
cat <<EOF

$(bold "BikerLink self-host — servizi attivi")

  PostgreSQL + PostGIS   localhost:5432
      utente   : ${POSTGRES_USER}
      password : ${POSTGRES_PASSWORD}
      database : ${POSTGRES_DB}
      DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}

  Redis                  redis://localhost:6379
  GraphHopper            http://localhost:8989   (health: /health)
  Valhalla               http://localhost:8002   (status: /status)
  pgAdmin 4              http://localhost:5050
      email    : ${PGADMIN_EMAIL}
      password : ${PGADMIN_PASSWORD}

$(bold "File generati")
  .env         credenziali dei container Docker
  .env.local   variabili per l'app BikerLink (DATABASE_URL già pronto)
               SESSION_SECRET / OSM_UPDATE_SECRET: generati con --gen-secrets,
               altrimenti restano <INSERIRE> (genera: openssl rand -base64 32)

$(bold "Comandi utili")
  docker compose ps                 stato dei servizi
  docker compose logs -f graphhopper   log in tempo reale
  docker compose down               ferma lo stack
  ./update-osm.sh                   aggiorna i dati OSM

EOF
ok "Setup completato."
