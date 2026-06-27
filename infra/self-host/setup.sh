#!/usr/bin/env bash
# =============================================================================
# BikerLink — setup.sh
# Setup completo dello stack self-host su Ubuntu Server 24.04 LTS (Noble Numbat).
# Pensato per essere lanciato DIRETTAMENTE sulla macchina (monitor + tastiera),
# NON in modalità SSH headless. Richiede sudo per installare i prerequisiti.
#
# Cosa fa:
#   1. Verifica/installa i prerequisiti via apt (Docker + plugin compose,
#      osmium-tool, wget, curl, python3-pyosmium).
#   2. Verifica spazio disco (>150 GB liberi: dati OSM + grafi multi-area).
#   3. Genera .env (da .env.local.template) con password casuali sicure.
#   4. Crea le directory dei volumi (data/, graphs/).
#   5. Chiede conferma e scarica i dati OSM per i gruppi core
#      (download-osm.sh: per area).
#   6. Builda i grafi GraphHopper per i gruppi core (build-regions.sh).
#   7. `docker compose up -d` (postgres, redis, valhalla, pgadmin) e avvia le
#      istanze graphhopper-* core; attende l'health check di ogni servizio.
#   8. Stampa il riepilogo finale (URL + credenziali).
#
# Uso:
#   chmod +x setup.sh && ./setup.sh
#   ./setup.sh --gen-secrets   # genera anche i secret locali mancanti nel .env.local
#   ./setup.sh --groups "grecia balcani arco-alpino"  # solo alcuni gruppi
#
# Variabili d'ambiente utili (CI / scripting non-interattivo):
#   GEN_SECRETS=1      genera i secret locali mancanti senza prompt
#   NONINTERACTIVE=1   disabilita i prompt
#   GROUPS_OVERRIDE="grecia balcani"   gruppi da avviare (sovrascrive i core default)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DATA_DIR="${DATA_DIR:-${SCRIPT_DIR}/data}"
GRAPHS_DIR="${GRAPHS_DIR:-${SCRIPT_DIR}/graphs}"
ENV_FILE="${SCRIPT_DIR}/.env"
ENV_LOCAL_FILE="${SCRIPT_DIR}/.env.local"
TEMPLATE_FILE="${SCRIPT_DIR}/.env.local.template"
MIN_FREE_GB=150
PLACEHOLDER_VALUE="<INSERIRE>"

# Gruppi "core" (abilitati di default): sincronizzati con shared/routing-areas.ts.
# Override via --groups "..." o GROUPS_OVERRIDE="...".
CORE_GROUPS="${GROUPS_OVERRIDE:-grecia balcani iberia arco-alpino}"
ALL_GROUPS="grecia balcani est iberia arco-alpino germania-centro francia-benelux ecuador"

GEN_SECRETS="${GEN_SECRETS:-${GEN_TOKENS:-0}}"
NONINTERACTIVE="${NONINTERACTIVE:-0}"

# Timeout health check (secondi)
TIMEOUT_FAST=120           # postgres, redis, pgadmin
TIMEOUT_GH_SERVE=600       # 10 min (istanza GH che carica grafo già pronto)
TIMEOUT_VALHALLA=$((3 * 60 * 60))  # 3h (build tile Valhalla)

# ── Libreria condivisa ────────────────────────────────────────────────────────
# shellcheck source=lib/env-helpers.sh
source "${SCRIPT_DIR}/lib/env-helpers.sh"

# ── Estetica ──────────────────────────────────────────────────────────────────
bold()  { echo -e "\033[1m$*\033[0m"; }
ok()    { echo -e "  \033[32m✓\033[0m $*"; }
warn()  { echo -e "  \033[33m!\033[0m $*"; }
info()  { echo -e "  \033[36m→\033[0m $*"; }
section() { echo; bold "━━━ $* ━━━"; }

# ── Argomenti CLI ─────────────────────────────────────────────────────────────
VALID_GROUPS="grecia balcani est iberia arco-alpino germania-centro francia-benelux ecuador"

validate_groups() {
  local requested="$1" grp
  for grp in $requested; do
    if ! grep -qw "$grp" <<< "$VALID_GROUPS"; then
      die "Gruppo '${grp}' non riconosciuto. Gruppi validi: ${VALID_GROUPS}"
    fi
  done
}

args=("$@")
for (( i=0; i<${#args[@]}; i++ )); do
  case "${args[$i]}" in
    --gen-secrets|--gen-tokens) GEN_SECRETS=1 ;;
    --groups)
      if (( i+1 < ${#args[@]} )); then
        CORE_GROUPS="${args[$((i+1))]}"; i=$((i+1))
      else
        die "--groups richiede un valore (es. --groups \"grecia arco-alpino\")"
      fi ;;
    -h|--help)
      echo "Uso: $0 [--gen-secrets] [--groups \"codice1 codice2 ...\"]"
      echo "  --gen-secrets  Genera automaticamente i secret locali mancanti"
      echo "                 (SESSION_SECRET, OSM_UPDATE_SECRET)."
      echo "  --groups       Gruppi GraphHopper da scaricare/buildare/avviare"
      echo "                 (default: grecia balcani iberia arco-alpino)."
      echo "                 Validi: ${VALID_GROUPS}"
      exit 0 ;;
    *) die "Argomento sconosciuto: '${args[$i]}' — usa --help" ;;
  esac
done

validate_groups "$CORE_GROUPS"

[[ "$(id -u)" -eq 0 ]] && SUDO="" || SUDO="sudo"

# ─────────────────────────────────────────────────────────────────────────────
section "1/8 — Verifica sistema operativo"
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
section "2/8 — Prerequisiti (apt)"
# ─────────────────────────────────────────────────────────────────────────────
install_base_packages() {
  info "Aggiorno l'indice dei pacchetti..."
  $SUDO apt-get update -y
  info "Installo wget, curl, osmium-tool, python3-pyosmium, ca-certificates..."
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
  if [[ -z "$codename" ]]; then codename="$(lsb_release -cs 2>/dev/null || true)"; fi
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
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${distro} ${codename} stable" \
    | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
  $SUDO apt-get update -y
  $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
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

# ─────────────────────────────────────────────────────────────────────────────
section "3/8 — Verifica spazio disco"
# ─────────────────────────────────────────────────────────────────────────────
mkdir -p "$DATA_DIR"
FREE_GB="$(df -BG --output=avail "$DATA_DIR" | tail -1 | tr -dc '0-9')"
info "Spazio libero su $(df --output=target "$DATA_DIR" | tail -1 | xargs): ${FREE_GB} GB"
if (( FREE_GB < MIN_FREE_GB )); then
  die "Spazio insufficiente: servono almeno ${MIN_FREE_GB} GB liberi (disponibili: ${FREE_GB} GB)."
fi
ok "Spazio disco sufficiente (${FREE_GB} GB ≥ ${MIN_FREE_GB} GB)"

# ─────────────────────────────────────────────────────────────────────────────
section "4/8 — Configurazione .env"
# ─────────────────────────────────────────────────────────────────────────────
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
# Generato automaticamente da setup.sh il $(date '+%Y-%m-%d %H:%M:%S')
# NON committare questo file. Contiene le credenziali dei servizi locali.
POSTGRES_USER="${POSTGRES_USER}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
POSTGRES_DB="${POSTGRES_DB}"
PGADMIN_EMAIL="${PGADMIN_EMAIL}"
PGADMIN_PASSWORD="${PGADMIN_PASSWORD}"
EOF
  chmod 600 "$ENV_FILE"
  ok "Generato .env con password casuali"
fi

if [[ -f "$TEMPLATE_FILE" ]]; then
  DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}"
  sed "s#__DATABASE_URL__#${DATABASE_URL}#g" "$TEMPLATE_FILE" > "$ENV_LOCAL_FILE"
  chmod 600 "$ENV_LOCAL_FILE"
  ok "Generato .env.local per l'app (DATABASE_URL valorizzato, altri secret cloud da compilare)"
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

# ─────────────────────────────────────────────────────────────────────────────
section "5/8 — Download dati OSM per gruppi-area"
# ─────────────────────────────────────────────────────────────────────────────
# Controlla se i .pbf per i gruppi core esistono già.
DOWNLOAD_SCRIPT="${SCRIPT_DIR}/download-regions.sh"
[[ -f "$DOWNLOAD_SCRIPT" ]] || die "download-regions.sh non trovato in ${SCRIPT_DIR}/"
chmod +x "$DOWNLOAD_SCRIPT"

read -r -a CORE_GROUPS_ARR <<< "$CORE_GROUPS"
all_pbfs_present=true
for grp in "${CORE_GROUPS_ARR[@]}"; do
  [[ -f "${DATA_DIR}/${grp}.osm.pbf" ]] || { all_pbfs_present=false; break; }
done

if [[ "$all_pbfs_present" == "true" ]]; then
  ok "PBF per i gruppi core già presenti — salto il download."
else
  info "Gruppi da scaricare: ${CORE_GROUPS}"
  warn "Sto per scaricare i dati OSM per area (può richiedere 1-3h a seconda della velocità della banda)."

  if [[ "$NONINTERACTIVE" == "1" ]]; then
    info "Modalità non-interattiva: procedo con il download."
    DATA_DIR="$DATA_DIR" "$DOWNLOAD_SCRIPT" "${CORE_GROUPS_ARR[@]}"
  else
    read -r -p "  Procedo con il download dei dati OSM? [s/N] " ans
    if [[ "${ans,,}" == "s" || "${ans,,}" == "y" ]]; then
      DATA_DIR="$DATA_DIR" "$DOWNLOAD_SCRIPT" "${CORE_GROUPS_ARR[@]}"
    else
      die "Download annullato dall'utente. Rilancia setup.sh quando vuoi procedere."
    fi
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
section "6/8 — Build grafi GraphHopper per gruppi-area"
# ─────────────────────────────────────────────────────────────────────────────
BUILD_SCRIPT="${SCRIPT_DIR}/build-regions.sh"
[[ -f "$BUILD_SCRIPT" ]] || die "build-regions.sh non trovato in ${SCRIPT_DIR}/"
chmod +x "$BUILD_SCRIPT"

# Controlla se i grafi sono già presenti (presenza di edges/ come sentinella).
all_graphs_present=true
for grp in "${CORE_GROUPS_ARR[@]}"; do
  [[ -d "${GRAPHS_DIR}/${grp}/edges" ]] || { all_graphs_present=false; break; }
done

if [[ "$all_graphs_present" == "true" ]]; then
  ok "Grafi per i gruppi core già presenti in ${GRAPHS_DIR}/ — salto il build."
  info "Per forzare un rebuild: rimuovi le cartelle in ${GRAPHS_DIR}/ e rilancia setup.sh."
else
  info "Build grafi per i gruppi core: ${CORE_GROUPS}"
  warn "Il build può richiedere 30-60 min per area a seconda delle dimensioni e della RAM."
  DATA_DIR="$DATA_DIR" GRAPHS_DIR="$GRAPHS_DIR" "$BUILD_SCRIPT" "${CORE_GROUPS_ARR[@]}"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "7/8 — Avvio stack Docker"
# ─────────────────────────────────────────────────────────────────────────────
info "docker compose up -d  (postgres, redis, valhalla, pgadmin)..."
$DOCKER compose --env-file "$ENV_FILE" up -d

# Attesa health check per servizio base.
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

wait_healthy postgres "$TIMEOUT_FAST" || true
wait_healthy redis    "$TIMEOUT_FAST" || true
wait_healthy pgadmin  "$TIMEOUT_FAST" || true
wait_healthy valhalla "$TIMEOUT_VALHALLA" || true

# Avvia le istanze GraphHopper per i gruppi core.
# I servizi sono sotto il profilo "areas": specificare il nome bypassa il profilo.
info "Avvio istanze GraphHopper-area per i gruppi core: ${CORE_GROUPS}..."
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

# Attesa health per ogni istanza GraphHopper avviata.
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
    ecuador)         echo 8997 ;;
    *)               echo 0 ;;
  esac
}

wait_gh_healthy() {
  local svc="$1" port="$2" timeout="$3" elapsed=0 interval=15
  info "Attendo /health di '${svc}' su :${port} (timeout $((timeout/60)) min)..."
  while (( elapsed < timeout )); do
    if curl -fsS --max-time 5 "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
      ok "'${svc}' healthy (dopo ${elapsed}s)"
      return 0
    fi
    sleep "$interval"; elapsed=$((elapsed + interval))
    if (( elapsed % 60 == 0 )); then info "'${svc}' ancora in avvio (${elapsed}s trascorsi)..."; fi
  done
  warn "'${svc}' non è diventato healthy entro $((timeout/60)) min. Controlla: $DOCKER compose logs ${svc}"
  return 1
}

for grp in "${CORE_GROUPS_ARR[@]}"; do
  port="$(area_port "$grp")"
  [[ "$port" -gt 0 ]] || continue
  [[ -d "${GRAPHS_DIR}/${grp}/edges" ]] || continue
  wait_gh_healthy "graphhopper-${grp}" "$port" "$TIMEOUT_GH_SERVE" || true
done

# ─────────────────────────────────────────────────────────────────────────────
section "8/8 — Riepilogo"
# ─────────────────────────────────────────────────────────────────────────────
check_env_quoted "$ENV_FILE"
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
  Valhalla               http://localhost:8002   (status: /status)
  pgAdmin 4              http://localhost:5050
      email    : ${PGADMIN_EMAIL}
      password : ${PGADMIN_PASSWORD}

$(bold "GraphHopper — istanze multi-area (profilo 'areas')")
  grecia          http://127.0.0.1:8990   (health: /health)
  balcani         http://127.0.0.1:8991   (health: /health)
  est             http://127.0.0.1:8992   (avvia: docker compose up -d graphhopper-est)
  iberia          http://127.0.0.1:8993   (health: /health)
  arco-alpino     http://127.0.0.1:8994   (health: /health)
  germania-centro http://127.0.0.1:8995   (avvia: docker compose up -d graphhopper-germania-centro)
  francia-benelux http://127.0.0.1:8996   (avvia: docker compose up -d graphhopper-francia-benelux)
  ecuador         http://127.0.0.1:8997   (avvia: docker compose up -d graphhopper-ecuador)

  ⚠ Le porte sono bindate su 127.0.0.1: l'accesso pubblico passa SOLO dal
    reverse proxy nginx (expose/nginx-bikerlink.conf, location /areas/<codice>/).
    Configura GRAPHHOPPER_URL nell'app sull'URL base del proxy (es. https://gh.<dominio>).

$(bold "File generati")
  .env         credenziali dei container Docker
  .env.local   variabili per l'app BikerLink (DATABASE_URL già pronto)
               SESSION_SECRET / OSM_UPDATE_SECRET: generati con --gen-secrets,
               altrimenti restano <INSERIRE> (genera: openssl rand -base64 32)

$(bold "Comandi utili")
  docker compose ps                              stato dei servizi base
  docker compose ps --all                        stato di tutte le istanze
  docker compose logs -f graphhopper-arco-alpino log in tempo reale
  docker compose stop  graphhopper-est           spegni un'area
  docker compose up -d graphhopper-est           accendi un'area
  docker compose down                            ferma lo stack
  ./update-osm.sh                                aggiorna i dati OSM (multi-area)
  ./download-regions.sh est                      scarica dati per un'area
  ./build-regions.sh est                         builda il grafo per un'area
  ./expose/areas-watchdog.sh                     watchdog automatico on/off aree

EOF
ok "Setup completato."
