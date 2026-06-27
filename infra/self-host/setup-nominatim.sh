#!/usr/bin/env bash
# =============================================================================
# BikerLink — setup-nominatim.sh
# Primo avvio del servizio Nominatim self-hosted su docker compose.
#
# Cosa fa:
#   1. Verifica prerequisiti (Docker, docker compose).
#   2. Permette di scegliere il dataset OSM da importare (Italy default).
#   3. Imposta NOMINATIM_PBF_URL in .env (o usa quello già configurato).
#   4. Avvia il container bikerlink-nominatim con profilo "nominatim".
#   5. Monitora il log finché l'import è completato (o mostra istruzioni).
#   6. Verifica che /status.php risponda 200.
#   7. Stampa le istruzioni per configurare NOMINATIM_URL/TOKEN nell'app.
#
# Uso:
#   chmod +x setup-nominatim.sh && ./setup-nominatim.sh
#   ./setup-nominatim.sh --pbf-url https://download.geofabrik.de/europe/italy-latest.osm.pbf
#   ./setup-nominatim.sh --freeze          # disabilita aggiornamenti OSM (stabile)
#   ./setup-nominatim.sh --no-wait         # avvia e non aspetta il completamento import
#
# Variabili d'ambiente:
#   NOMINATIM_PBF_URL        sovrascrive l'URL del PBF (senza prompt)
#   NONINTERACTIVE=1         disabilita tutti i prompt
#   NOMINATIM_FREEZE=true    disabilita aggiornamenti OSM
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="${SCRIPT_DIR}/.env"
ENV_LOCAL_FILE="${SCRIPT_DIR}/.env.local"

# ── Estetica ──────────────────────────────────────────────────────────────────
bold()    { echo -e "\033[1m$*\033[0m"; }
ok()      { echo -e "  \033[32m✓\033[0m $*"; }
warn()    { echo -e "  \033[33m!\033[0m $*"; }
info()    { echo -e "  \033[36m→\033[0m $*"; }
err()     { echo -e "  \033[31m✗\033[0m $*" >&2; }
section() { echo; bold "━━━ $* ━━━"; }
die()     { err "$*"; exit 1; }

# ── Argomenti CLI ─────────────────────────────────────────────────────────────
PBF_URL_ARG=""
FREEZE="${NOMINATIM_FREEZE:-false}"
NO_WAIT=0
NONINTERACTIVE="${NONINTERACTIVE:-0}"

args=("$@")
for (( i=0; i<${#args[@]}; i++ )); do
  case "${args[$i]}" in
    --pbf-url)
      (( i+1 < ${#args[@]} )) || die "--pbf-url richiede un URL come argomento"
      PBF_URL_ARG="${args[$((i+1))]}"; i=$((i+1)) ;;
    --freeze) FREEZE="true" ;;
    --no-wait) NO_WAIT=1 ;;
    --non-interactive) NONINTERACTIVE=1 ;;
    -h|--help)
      echo "Uso: $0 [--pbf-url <url>] [--freeze] [--no-wait]"
      echo ""
      echo "  --pbf-url <url>   URL del PBF da importare (default: Italy da Geofabrik)"
      echo "  --freeze          Disabilita aggiornamenti OSM periodici (DB statico)"
      echo "  --no-wait         Avvia il container senza aspettare il completamento"
      echo ""
      echo "Dataset disponibili su Geofabrik:"
      echo "  Italia       https://download.geofabrik.de/europe/italy-latest.osm.pbf  (~1.7 GB)"
      echo "  Nord Italia  https://download.geofabrik.de/europe/italy/nord-ovest-latest.osm.pbf"
      exit 0 ;;
    *) die "Argomento sconosciuto: ${args[$i]} (usa --help)" ;;
  esac
done

[[ "$(id -u)" -eq 0 ]] && SUDO="" || SUDO="sudo"

# ── Tabella dataset preimpostati ───────────────────────────────────────────────
declare -A DATASET_URLS=(
  [1]="https://download.geofabrik.de/europe/italy-latest.osm.pbf"
  [2]="https://download.geofabrik.de/europe/italy/nord-ovest-latest.osm.pbf"
  [3]="https://download.geofabrik.de/europe/italy/nord-est-latest.osm.pbf"
  [4]="custom"
  # Opzione 5 (non mostrata nel menu interattivo): usa il file locale già in DATA_DIR.
  # Il container Nominatim monta DATA_DIR_HOST in /nominatim_data (sola lettura).
  # Impostare manualmente: NOMINATIM_PBF_URL=file:///nominatim_data/valhalla-merged.osm.pbf
  # Il file valhalla-merged.osm.pbf (Europa + Ecuador, ~33 GB) è già in DATA_DIR
  # (copiato da infra/self-host/data/ dalla cartella MAPPE dell'NVMe).
)
declare -A DATASET_LABELS=(
  [1]="Italia intera        (~1.7 GB PBF / ~30 GB DB / ~1-2h)"
  [2]="Nord-Ovest Italia    (~350 MB PBF / ~5 GB DB  / ~15 min)"
  [3]="Nord-Est Italia      (~300 MB PBF / ~5 GB DB  / ~15 min)"
  [4]="URL personalizzato"
)
declare -A DATASET_REPLICATION=(
  [1]="https://download.geofabrik.de/europe/italy-updates/"
  [2]="https://download.geofabrik.de/europe/italy/nord-ovest-updates/"
  [3]="https://download.geofabrik.de/europe/italy/nord-est-updates/"
  [4]=""
)

# =============================================================================
section "1/6 — Prerequisiti"
# =============================================================================
if ! command -v docker >/dev/null 2>&1; then
  die "Docker non trovato. Installa Docker Engine prima di eseguire questo script."
fi
if ! docker compose version >/dev/null 2>&1; then
  die "Plugin 'docker compose' non trovato. Installa docker-compose-plugin."
fi
ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

if docker info >/dev/null 2>&1; then
  DOCKER="docker"
else
  DOCKER="$SUDO docker"
fi

# =============================================================================
section "2/6 — Selezione dataset OSM"
# =============================================================================
if [[ -n "$PBF_URL_ARG" ]]; then
  SELECTED_PBF_URL="$PBF_URL_ARG"
  SELECTED_REPLICATION_URL=""
  info "PBF da argomento CLI: $SELECTED_PBF_URL"
else
  # Controlla se già impostato in .env
  existing_pbf=""
  if [[ -f "$ENV_FILE" ]]; then
    existing_pbf="$(grep -E '^NOMINATIM_PBF_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  fi

  if [[ -n "$existing_pbf" && "$NONINTERACTIVE" == "1" ]]; then
    SELECTED_PBF_URL="$existing_pbf"
    SELECTED_REPLICATION_URL="$(grep -E '^NOMINATIM_REPLICATION_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
    info "PBF da .env esistente: $SELECTED_PBF_URL"
  else
    echo ""
    bold "Scegli il dataset OSM da importare:"
    echo ""
    for key in 1 2 3 4; do
      echo "  ${key}) ${DATASET_LABELS[$key]}"
    done
    echo ""

    if [[ "$NONINTERACTIVE" == "1" ]]; then
      CHOICE=1
      info "Modalità non-interattiva: selezionato Italia intera (default)."
    else
      read -r -p "  Scelta [1-4, default: 1]: " CHOICE
      CHOICE="${CHOICE:-1}"
    fi

    if [[ ! "$CHOICE" =~ ^[1-4]$ ]]; then
      warn "Scelta non valida — uso Italia intera (1)."
      CHOICE=1
    fi

    if [[ "$CHOICE" == "4" ]]; then
      read -r -p "  Inserisci l'URL del PBF: " SELECTED_PBF_URL
      read -r -p "  Inserisci l'URL di replicazione OSM (lascia vuoto per disabilitare): " SELECTED_REPLICATION_URL
    else
      SELECTED_PBF_URL="${DATASET_URLS[$CHOICE]}"
      SELECTED_REPLICATION_URL="${DATASET_REPLICATION[$CHOICE]}"
    fi
    ok "Dataset selezionato: ${DATASET_LABELS[$CHOICE]:-$SELECTED_PBF_URL}"
  fi
fi

# =============================================================================
section "3/6 — Configurazione .env"
# =============================================================================
upsert_env_line() {
  local key="$1" value="$2" file="$3"
  if [[ ! -f "$file" ]]; then touch "$file"; fi
  if grep -qE "^${key}=" "$file"; then
    local tmp; tmp="$(mktemp)"
    sed -E "s|^${key}=.*|${key}=${value}|" "$file" > "$tmp"
    cat "$tmp" > "$file"; rm -f "$tmp"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

if [[ -f "$ENV_FILE" ]]; then
  info "Aggiorno NOMINATIM_PBF_URL in $ENV_FILE"
  upsert_env_line "NOMINATIM_PBF_URL" "$SELECTED_PBF_URL" "$ENV_FILE"
  if [[ -n "$SELECTED_REPLICATION_URL" ]]; then
    upsert_env_line "NOMINATIM_REPLICATION_URL" "$SELECTED_REPLICATION_URL" "$ENV_FILE"
  fi
  upsert_env_line "NOMINATIM_FREEZE" "$FREEZE" "$ENV_FILE"
else
  warn ".env non trovato — creo uno minimale con le variabili Nominatim."
  cat > "$ENV_FILE" <<EOF
# Generato da setup-nominatim.sh il $(date '+%Y-%m-%d %H:%M:%S')
NOMINATIM_PBF_URL=${SELECTED_PBF_URL}
NOMINATIM_REPLICATION_URL=${SELECTED_REPLICATION_URL}
NOMINATIM_FREEZE=${FREEZE}
EOF
  chmod 600 "$ENV_FILE"
fi
ok ".env aggiornato."

# =============================================================================
section "4/6 — Avvio container Nominatim"
# =============================================================================
info "Avvio bikerlink-nominatim (profilo: nominatim)..."
info "URL PBF: $SELECTED_PBF_URL"
info "FREEZE: $FREEZE"
echo ""
warn "PRIMA esecuzione: il container scarica (~1-2 GB) e importa il PBF."
warn "Questo può richiedere da 15 minuti (regione piccola) a 3 ore (Italia intera)."
warn "Il container è stabile e riprende automaticamente in caso di riavvio."
echo ""

if [[ "$NONINTERACTIVE" != "1" ]]; then
  read -r -p "  Continuare con l'avvio? [s/N] " _start_reply
  [[ "${_start_reply,,}" == "s" || "${_start_reply,,}" == "y" ]] \
    || { warn "Avvio annullato."; exit 0; }
fi

$DOCKER compose --env-file "$ENV_FILE" up -d nominatim
ok "Container bikerlink-nominatim avviato."

# =============================================================================
section "5/6 — Monitoraggio import"
# =============================================================================
if [[ "$NO_WAIT" == "1" ]]; then
  info "Flag --no-wait: non aspetto il completamento dell'import."
  info "Monitora con: docker compose logs -f nominatim"
  info "Verifica stato: curl -s http://localhost:7070/status.php"
else
  echo ""
  info "Monitoro i log del container (Ctrl+C per uscire senza fermare il container)..."
  echo ""
  IMPORT_TIMEOUT=$((4 * 3600))  # 4 ore massimo
  elapsed=0
  interval=30
  import_done=0

  while (( elapsed < IMPORT_TIMEOUT )); do
    # Controlla se il processo di import è terminato e Nominatim è in ascolto
    if curl -fsS --max-time 5 "http://localhost:7070/status.php" >/dev/null 2>&1; then
      import_done=1
      break
    fi

    # Mostra ultime righe di log ogni 30s
    echo -n "  [${elapsed}s] Nominatim in avvio"
    $DOCKER logs --tail 3 bikerlink-nominatim 2>/dev/null \
      | grep -v "^$" \
      | sed 's/^/  │ /' || true
    echo ""

    sleep "$interval"
    elapsed=$(( elapsed + interval ))
  done

  if [[ "$import_done" == "1" ]]; then
    ok "Import completato — Nominatim risponde su http://localhost:7070"
  else
    warn "Timeout di monitoraggio raggiunto (4h). L'import potrebbe essere ancora in corso."
    warn "Monitora con: docker compose logs -f nominatim"
    warn "Verifica stato: curl -s http://localhost:7070/status.php"
  fi
fi

# =============================================================================
section "6/6 — Configurazione dell'app"
# =============================================================================
NOMINATIM_TOKEN_VAL=""
if [[ -f "$ENV_LOCAL_FILE" ]]; then
  NOMINATIM_TOKEN_VAL="$(grep -E '^NOMINATIM_TOKEN=' "$ENV_LOCAL_FILE" | tail -1 | cut -d= -f2- || true)"
fi

cat <<EOF

$(bold "Nominatim — configurazione dell'app BikerLink")

  Aggiungi (o verifica) queste variabili nel file .env.local dell'app:

    NOMINATIM_URL=https://nominatim.<tuo-dominio>
    NOMINATIM_TOKEN=<token-generato-da-setup-expose.sh>

  Il token deve coincidere con NOMINATIM_TOKEN in nginx.
  Generalo (se non esiste) con:
    cd infra/self-host/expose
    ./setup-expose.sh --gen-tokens

  Verifica locale (senza token, da questa macchina):
    curl http://localhost:7070/status.php
    curl "http://localhost:7070/search?q=Roma&format=json&limit=1"

  Verifica pubblica (con token, dal deploy Replit):
    curl -H "X-Nominatim-Token: <TOKEN>" "https://nominatim.<dominio>/search?q=Roma&format=json"

$(bold "Monitoraggio")

  Stato health:  docker compose ps nominatim
  Log live:      docker compose logs -f nominatim
  Aggiorna OSM:  docker compose restart nominatim  (se FREEZE=false)

EOF
