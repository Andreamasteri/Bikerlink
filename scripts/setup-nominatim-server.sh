#!/usr/bin/env bash
# =============================================================================
# BikerLink — Setup Nominatim sul server di casa (ThinkCentre 910q)
#
# Cosa fa questo script (idempotente — puoi rieseguirlo senza danni):
#   1. Installa le dipendenze di build (PostgreSQL, PostGIS, cmake, g++, boost…).
#   2. Scarica e compila l'ultima release stabile di Nominatim da GitHub.
#   3. Scarica i dati OSM Italia da Geofabrik e li importa nel database.
#   4. Crea il servizio systemd `nominatim.service` (bind 127.0.0.1:8088).
#   5. Aggiunge a nginx una `location /nominatim/` con auth token X-Nominatim-Token
#      (stesso pattern di X-GH-Token usato da GraphHopper) + reverse proxy a 8088.
#   6. Esegue test locale e attraverso nginx.
#   7. Stampa i 2 secret da impostare su Replit (NOMINATIM_URL / NOMINATIM_TOKEN).
#
# Prerequisiti sul server:
#   - Ubuntu 26.04 LTS, nginx già installato e configurato con Tailscalli avra  una cazzo di fognae Funnel.
#   - Permessi sudo (lo script richiede root per apt, systemd e nginx).
#   - ~60 GB liberi su disco (dati OSM Italia ~3 GB PBF → ~30 GB PostgreSQL).
#   - Connessione internet (Geofabrik + GitHub releases).
#
# Utilizzo:
#   bash setup-nominatim-server.sh
#
# Override opzionali (variabili d'ambiente):
#   NOMINATIM_TOKEN=<tok>   Riusa un token esistente invece di generarne uno nuovo.
#   PUBLIC_HOST=<host>      Forza l'hostname pubblico (es. bikerlink.tail5056aa.ts.net)
#                           se l'auto-detect via Tailscale non funziona.
#   NGINX_CONF=<path>       Forza il file nginx da modificare
#                           (default: auto-detect, fallback /etc/nginx/sites-enabled/default).
#   OSM_PBF_URL=<url>       URL del file PBF da scaricare (default: Italia Geofabrik).
#                           Esempio Europa: https://download.geofabrik.de/europe-latest.osm.pbf
#   IMPORT_THREADS=<n>      Thread per l'import (default: 4, adattare ai core disponibili).
#   NOMINATIM_VERSION=<v>   Versione Nominatim da installare (default: 4.4.0).
#   SKIP_IMPORT=1           Salta il download PBF e l'import (database già presente).
# =============================================================================

set -euo pipefail

# ── Configurazione (override via env) ────────────────────────────────────────
NOMINATIM_VERSION="${NOMINATIM_VERSION:-4.4.0}"
NOMINATIM_PORT="8088"
NOMINATIM_BIND="127.0.0.1:${NOMINATIM_PORT}"
NOMINATIM_INSTALL_DIR="/opt/nominatim"
NOMINATIM_DATA_DIR="${NOMINATIM_INSTALL_DIR}/data"
NOMINATIM_BUILD_DIR="${NOMINATIM_INSTALL_DIR}/build"
NOMINATIM_DB="nominatim"
NOMINATIM_USER="nominatim"

# NOTA: per dati di altri paesi/regioni, sovrascrivere OSM_PBF_URL.
# Esempi:
#   Europa completa: https://download.geofabrik.de/europe-latest.osm.pbf  (~30 GB)
#   Nord Italia:     https://download.geofabrik.de/europe/italy/nord-ovest-latest.osm.pbf
OSM_PBF_URL="${OSM_PBF_URL:-https://download.geofabrik.de/europe/italy-latest.osm.pbf}"
OSM_PBF_FILE="${NOMINATIM_DATA_DIR}/italy-latest.osm.pbf"

IMPORT_THREADS="${IMPORT_THREADS:-4}"

NGINX_SNIPPET="/etc/nginx/snippets/bikerlink-nominatim.conf"

# ── Logging colorato ─────────────────────────────────────────────────────────
log()  { echo -e "\033[1;34m[NOMINATIM]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[ OK  ]\033[0m $*"; }
warn() { echo -e "\033[1;33m[WARN ]\033[0m $*"; }
err()  { echo -e "\033[1;31m[FAIL ]\033[0m $*" >&2; }
die()  { err "$*"; exit 1; }

# ── Privilegi: usa sudo se non root ──────────────────────────────────────────
if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
else
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    die "Servono privilegi root (apt/systemd/nginx) ma 'sudo' non è installato. Esegui come root."
  fi
fi

echo "============================================================"
echo "BikerLink — Setup Nominatim (server di casa)"
echo "$(date)"
echo "============================================================"
echo ""

# =============================================================================
# STEP 1 — Prerequisiti e dipendenze di sistema
# =============================================================================
log "STEP 1/7 — Installazione dipendenze di sistema..."

# Verifica che PostgreSQL sia attivo prima di continuare
if ! command -v pg_lsclusters >/dev/null 2>&1; then
  warn "pg_lsclusters non trovato — PostgreSQL potrebbe non essere installato."
fi

$SUDO apt-get update -qq

# Dipendenze build Nominatim + runtime
DEPS=(
  # Build
  build-essential cmake g++ libboost-dev libboost-system-dev libboost-filesystem-dev
  libexpat1-dev zlib1g-dev libbz2-dev libpq-dev libproj-dev
  # PostgreSQL + PostGIS
  postgresql postgresql-contrib postgresql-postgis
  # Python (necessario per nominatim import e serve)
  python3 python3-pip python3-psycopg2 python3-dotenv
  # Utilità
  wget curl git osm2pgsql
)

log "  Installazione pacchetti apt (può richiedere alcuni minuti)..."
# Preserva il codice di uscita di apt-get: il pipe a grep è solo per il filtro
# dell'output verboso, ma un fallimento di apt deve bloccare lo script.
APT_OUT="$($SUDO apt-get install -y --no-install-recommends "${DEPS[@]}" 2>&1)" \
  || die "apt-get install fallito. Output:\n${APT_OUT}"
echo "$APT_OUT" | grep -E "(upgraded|newly installed|already|E:)" || true

# Dipendenze Python per Nominatim
$SUDO pip3 install --quiet nominatim-db 2>/dev/null || \
  $SUDO pip3 install --quiet --break-system-packages nominatim-db 2>/dev/null || true

ok "Dipendenze di sistema installate."

# Verifica PostgreSQL attivo
if command -v pg_lsclusters >/dev/null 2>&1; then
  PG_STATUS="$(pg_lsclusters 2>/dev/null | grep -v 'Ver ' | head -3 || true)"
  if [[ -n "$PG_STATUS" ]]; then
    ok "PostgreSQL attivo:"
    echo "$PG_STATUS"
  else
    warn "Nessun cluster PostgreSQL trovato. Creazione cluster default..."
    $SUDO pg_createcluster 16 main --start || \
      $SUDO pg_createcluster 15 main --start || \
      $SUDO pg_createcluster 14 main --start || true
    $SUDO systemctl start postgresql || true
  fi
else
  log "Avvio PostgreSQL..."
  $SUDO systemctl enable postgresql
  $SUDO systemctl start postgresql
fi
echo ""

# =============================================================================
# STEP 2 — Installazione Nominatim (da GitHub release)
# =============================================================================
log "STEP 2/7 — Installazione Nominatim ${NOMINATIM_VERSION}..."

# Crea utente di sistema nominatim (se non esiste)
if ! id "$NOMINATIM_USER" >/dev/null 2>&1; then
  log "  Creo utente di sistema '${NOMINATIM_USER}'..."
  $SUDO useradd -r -s /bin/bash -m -d "${NOMINATIM_INSTALL_DIR}" "$NOMINATIM_USER"
  ok "  Utente '${NOMINATIM_USER}' creato."
else
  ok "  Utente '${NOMINATIM_USER}' già presente."
fi

# Crea directory
$SUDO mkdir -p "${NOMINATIM_INSTALL_DIR}" "${NOMINATIM_DATA_DIR}" "${NOMINATIM_BUILD_DIR}"
$SUDO chown -R "${NOMINATIM_USER}:${NOMINATIM_USER}" "${NOMINATIM_INSTALL_DIR}"

# Verifica se già installato
NOMINATIM_BIN="${NOMINATIM_BUILD_DIR}/nominatim"
if [[ -x "$NOMINATIM_BIN" ]]; then
  INSTALLED_VER="$("$NOMINATIM_BIN" --version 2>/dev/null | head -1 || echo 'unknown')"
  ok "Nominatim già compilato: ${INSTALLED_VER}"
  log "Per reinstallare, rimuovi ${NOMINATIM_BUILD_DIR} e riesegui."
else
  TARBALL_URL="https://github.com/osm-search/Nominatim/archive/refs/tags/v${NOMINATIM_VERSION}.tar.gz"
  TARBALL_FILE="/tmp/nominatim-${NOMINATIM_VERSION}.tar.gz"
  SRC_DIR="/tmp/Nominatim-${NOMINATIM_VERSION}"

  log "  Download Nominatim ${NOMINATIM_VERSION} da GitHub..."
  if wget -q --show-progress -O "$TARBALL_FILE" "$TARBALL_URL"; then
    ok "  Download completato."
    log "  Estrazione sorgenti..."
    rm -rf "$SRC_DIR"
    tar xzf "$TARBALL_FILE" -C /tmp
    ok "  Sorgenti estratti in ${SRC_DIR}."
  else
    log "  Download tarball fallito, tentativo via git clone..."
    rm -f "$TARBALL_FILE"
    rm -rf "$SRC_DIR"
    git clone --depth 1 --branch "v${NOMINATIM_VERSION}" \
      https://github.com/osm-search/Nominatim.git "$SRC_DIR" \
      || die "Impossibile scaricare Nominatim (wget e git clone entrambi falliti)."
    ok "  Sorgenti clonati via git in ${SRC_DIR}."
  fi

  log "  Compilazione con cmake (può richiedere 5-10 minuti)..."
  rm -rf "${NOMINATIM_BUILD_DIR}"
  # set -euo pipefail nel subshell garantisce che cmake/make propaghino exit code;
  # il log a schermo è intenzionalmente verboso (no | tail) così errori di build
  # sono visibili direttamente senza dover aprire log separati.
  $SUDO -u "$NOMINATIM_USER" bash -euo pipefail -c "
    mkdir -p '${NOMINATIM_BUILD_DIR}'
    cd '${NOMINATIM_BUILD_DIR}'
    cmake '${SRC_DIR}' -DCMAKE_BUILD_TYPE=Release
    make -j'${IMPORT_THREADS}'
  " || die "Compilazione Nominatim fallita. Controlla le dipendenze di build installate al STEP 1."

  if [[ ! -x "$NOMINATIM_BIN" ]]; then
    die "Compilazione completata ma il binario '${NOMINATIM_BIN}' non trovato."
  fi
  ok "Nominatim compilato: $("$NOMINATIM_BIN" --version 2>/dev/null | head -1)"

  # Pulizia sorgenti temporanei
  rm -rf "$SRC_DIR" "$TARBALL_FILE"
fi

# Aggiorna PATH per le fasi successive
export PATH="${NOMINATIM_BUILD_DIR}:${PATH}"
echo ""

# =============================================================================
# STEP 3 — Database PostgreSQL con PostGIS
# =============================================================================
log "STEP 3/7 — Configurazione database PostgreSQL..."

# Permette all'utente nominatim di creare database (necessario per l'import)
$SUDO -u postgres psql -c "ALTER USER ${NOMINATIM_USER} CREATEDB;" 2>/dev/null || \
  $SUDO -u postgres createuser --createdb "$NOMINATIM_USER" 2>/dev/null || true

# Verifica se il database nominatim esiste già
DB_EXISTS="$($SUDO -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${NOMINATIM_DB}';" 2>/dev/null || echo '')"
if [[ "$DB_EXISTS" == "1" ]]; then
  ok "Database '${NOMINATIM_DB}' già presente."
  if [[ "${SKIP_IMPORT:-0}" != "1" ]]; then
    warn "Database già esistente — salto il download e l'import per evitare sovrascritture."
    warn "Per reimportare da zero, droppa il DB e riesegui (senza SKIP_IMPORT):"
    warn "  sudo -u postgres dropdb ${NOMINATIM_DB}"
    warn "  bash setup-nominatim-server.sh"
    SKIP_IMPORT="1"
  fi
else
  log "  Creo database '${NOMINATIM_DB}'..."
  $SUDO -u postgres createdb -O "$NOMINATIM_USER" "$NOMINATIM_DB"
  $SUDO -u postgres psql -d "$NOMINATIM_DB" -c "CREATE EXTENSION IF NOT EXISTS postgis;" >/dev/null
  $SUDO -u postgres psql -d "$NOMINATIM_DB" -c "CREATE EXTENSION IF NOT EXISTS hstore;" >/dev/null
  ok "Database '${NOMINATIM_DB}' creato con PostGIS e hstore."
fi
echo ""

# =============================================================================
# STEP 4 — Download dati OSM e import
# =============================================================================
if [[ "${SKIP_IMPORT:-0}" == "1" ]]; then
  warn "STEP 4/7 — SKIP_IMPORT=1: salto download e import OSM."
else
  log "STEP 4/7 — Download dati OSM Italia..."

  log "  URL: ${OSM_PBF_URL}"
  log "  Destinazione: ${OSM_PBF_FILE}"
  log "  Nota: il download può richiedere 5-15 minuti a seconda della connessione (~3 GB per l'Italia)."

  # Download con resume support
  $SUDO -u "$NOMINATIM_USER" wget -q --show-progress \
    --continue \
    -O "$OSM_PBF_FILE" \
    "$OSM_PBF_URL" || die "Download dati OSM fallito."
  ok "Download OSM completato: $(du -sh "$OSM_PBF_FILE" | cut -f1)"

  echo ""
  log "STEP 4/7 (import) — Import OSM nel database PostgreSQL..."
  warn "⚠️  ATTENZIONE: l'import richiede 30–90 minuti su CPU (ThinkCentre i5-7500T)."
  warn "    Thread usati: ${IMPORT_THREADS}. Per aumentare: IMPORT_THREADS=<n> bash setup-nominatim-server.sh"
  warn "    Non interrompere il processo durante l'import."
  echo ""

  # Nominatim import
  # --osm-file: file PBF da importare
  # --threads:  core paralleli
  # --project-dir: directory di configurazione
  $SUDO -u "$NOMINATIM_USER" "${NOMINATIM_BUILD_DIR}/nominatim" import \
    --osm-file "$OSM_PBF_FILE" \
    --threads "$IMPORT_THREADS" \
    --project-dir "${NOMINATIM_INSTALL_DIR}" \
    2>&1 | tee /tmp/nominatim-import.log | tail -20

  log "Verifica integrità database post-import..."
  $SUDO -u "$NOMINATIM_USER" "${NOMINATIM_BUILD_DIR}/nominatim" admin \
    --check-database \
    --project-dir "${NOMINATIM_INSTALL_DIR}" \
    2>&1 | tail -10 || warn "check-database: verifica manuale consigliata."

  ok "Import OSM completato."
fi
echo ""

# =============================================================================
# STEP 5 — Servizio systemd nominatim.service
# =============================================================================
log "STEP 5/7 — Configurazione servizio systemd nominatim.service..."

SYSTEMD_UNIT="/etc/systemd/system/nominatim.service"

$SUDO tee "$SYSTEMD_UNIT" > /dev/null << EOF
[Unit]
Description=Nominatim Geocoding Service — BikerLink
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service

[Service]
Type=simple
User=${NOMINATIM_USER}
Group=${NOMINATIM_USER}
WorkingDirectory=${NOMINATIM_INSTALL_DIR}
ExecStart=${NOMINATIM_BUILD_DIR}/nominatim serve \\
    --project-dir ${NOMINATIM_INSTALL_DIR} \\
    --address 127.0.0.1 \\
    --port ${NOMINATIM_PORT}
Restart=always
RestartSec=5
# Limiti risorse (aggiustare in base alla RAM disponibile)
MemoryLimit=8G
# Log
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nominatim

[Install]
WantedBy=multi-user.target
EOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable nominatim >/dev/null 2>&1 || true
$SUDO systemctl restart nominatim

# Attendi che l'API risponda (fino a 60s — Nominatim è più lento di Ollama a partire)
log "Attendo che l'API Nominatim sia pronta su ${NOMINATIM_BIND}..."
READY=0
for _ in $(seq 1 60); do
  if curl -fsS "http://${NOMINATIM_BIND}/search?q=Roma&format=json&limit=1" >/dev/null 2>&1; then
    READY=1; break
  fi
  sleep 2
done

if [[ "$READY" -eq 1 ]]; then
  ok "nominatim.service attivo: $($SUDO systemctl is-active nominatim)"
else
  $SUDO systemctl status nominatim --no-pager -l | tail -20 || true
  warn "L'API Nominatim non risponde su ${NOMINATIM_BIND} entro 120s."
  warn "Controlla 'journalctl -u nominatim -n 50'. Il servizio potrebbe ancora star caricando."
  warn "Continuo comunque con la configurazione nginx."
fi
echo ""

# =============================================================================
# STEP 6 — Token + configurazione nginx (location /nominatim/ con X-Nominatim-Token)
# =============================================================================
log "STEP 6/7 — Configurazione nginx..."

# ── Token: riusa quello esistente o generane uno nuovo ───────────────────────
# Idempotente: se già nello snippet, viene riusato (nessuna rotazione involontaria
# che invaliderebbe i secret già impostati su Replit).
EXISTING_TOKEN=""
if [[ -f "$NGINX_SNIPPET" ]]; then
  EXISTING_TOKEN="$($SUDO grep -oE '\$http_x_nominatim_token != "[^"]+"' "$NGINX_SNIPPET" 2>/dev/null \
    | sed -E 's/.*"([^"]+)".*/\1/' | head -1 || true)"
fi

if [[ -n "${NOMINATIM_TOKEN:-}" ]]; then
  TOKEN="${NOMINATIM_TOKEN}"
  if [[ ! "$TOKEN" =~ ^[A-Za-z0-9_-]{16,128}$ ]]; then
    die "NOMINATIM_TOKEN non valido: usa 16-128 caratteri tra A-Z a-z 0-9 _ - (niente quote/spazi)."
  fi
  ok "Riuso il token fornito via NOMINATIM_TOKEN."
elif [[ -n "$EXISTING_TOKEN" ]]; then
  TOKEN="$EXISTING_TOKEN"
  ok "Riuso il token già presente nello snippet nginx (nessuna rotazione)."
  warn "Per forzare un nuovo token: rimuovi ${NGINX_SNIPPET} oppure passa NOMINATIM_TOKEN=<nuovo>."
else
  TOKEN="$(openssl rand -hex 32)"
  ok "Generato un NUOVO token (openssl rand -hex 32)."
  warn "Token generato: aggiorna il secret NOMINATIM_TOKEN su Replit con il valore stampato a fine script."
fi

# ── Snippet nginx con la location /nominatim/ ────────────────────────────────
# Pattern identico a GraphHopper: verifica header token con `if`, 403 se errato,
# `rewrite` per rimuovere il prefisso /nominatim, proxy_pass a 127.0.0.1:8088.
$SUDO mkdir -p "$(dirname "$NGINX_SNIPPET")"
$SUDO tee "$NGINX_SNIPPET" > /dev/null << EOF
# BikerLink — Reverse proxy Nominatim con auth token (X-Nominatim-Token).
# Generato da scripts/setup-nominatim-server.sh — non modificare a mano.
# Incluso dentro il server{} principale (Tailscale Funnel).
location /nominatim/ {
    # Verifica token: stesso meccanismo di X-GH-Token (GraphHopper).
    if (\$http_x_nominatim_token != "${TOKEN}") {
        return 403;
    }

    # Rimuove il prefisso /nominatim prima di inoltrare al servizio locale.
    rewrite ^/nominatim/(.*)\$ /\$1 break;

    proxy_pass http://127.0.0.1:${NOMINATIM_PORT};
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;

    # Timeout generosi (Nominatim su CPU può essere lento per query complesse).
    proxy_http_version 1.1;
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;
    proxy_connect_timeout 10s;
}
EOF
ok "Snippet nginx scritto: ${NGINX_SNIPPET}"

# ── Individua il file nginx con il server{} pubblico da modificare ───────────
detect_nginx_conf() {
  if [[ -n "${NGINX_CONF:-}" ]]; then
    echo "${NGINX_CONF}"; return
  fi
  local hit
  hit="$(grep -rlE 'server_name[^;]*\.ts\.net' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -1 || true)"
  if [[ -n "$hit" ]]; then echo "$hit"; return; fi
  if [[ -f /etc/nginx/sites-enabled/default ]]; then
    echo "/etc/nginx/sites-enabled/default"; return
  fi
  echo ""
}

NGINX_TARGET="$(detect_nginx_conf)"
INCLUDE_LINE="    include ${NGINX_SNIPPET};"

inject_include() {
  local target="$1"
  # Già incluso? idempotente.
  if grep -qF "$NGINX_SNIPPET" "$target" 2>/dev/null; then
    ok "include già presente in ${target} — nessuna modifica."
    return 0
  fi

  # Backup prima di toccare il file.
  local backup="${target}.bak-$(date +%Y%m%d%H%M%S)"
  $SUDO cp "$target" "$backup"
  log "Backup creato: ${backup}"

  # Inserisce l'include subito dopo l'apertura del PRIMO blocco server{}.
  $SUDO awk -v inc="$INCLUDE_LINE" '
    BEGIN { done = 0 }
    {
      print
      if (!done && $0 ~ /server[[:space:]]*\{[[:space:]]*$/) {
        print inc
        done = 1
      }
    }
  ' "$target" | $SUDO tee "${target}.tmp" > /dev/null
  $SUDO mv "${target}.tmp" "$target"

  if ! grep -qF "$NGINX_SNIPPET" "$target"; then
    $SUDO cp "$backup" "$target"
    return 1
  fi
  ok "include aggiunto in ${target} (dentro il primo server{})."
  echo "BACKUP_FILE=${backup}"
  return 0
}

NGINX_OK=0
if [[ -n "$NGINX_TARGET" && -f "$NGINX_TARGET" ]]; then
  log "File nginx individuato: ${NGINX_TARGET}"
  if inject_include "$NGINX_TARGET"; then
    if $SUDO nginx -t 2>/dev/null; then
      $SUDO systemctl reload nginx
      ok "nginx validato e ricaricato."
      NGINX_OK=1
    else
      err "nginx -t FALLITO dopo l'inserimento dell'include. Eseguo rollback."
      BK="$(ls -t "${NGINX_TARGET}".bak-* 2>/dev/null | head -1 || true)"
      if [[ -n "$BK" ]]; then
        $SUDO cp "$BK" "$NGINX_TARGET"
        $SUDO nginx -t >/dev/null 2>&1 && $SUDO systemctl reload nginx || true
        warn "Config nginx ripristinata dal backup: ${BK}"
      fi
    fi
  else
    warn "Non sono riuscito a inserire automaticamente l'include nel server{}."
  fi
else
  warn "Nessun file nginx con server{} individuato automaticamente."
fi

if [[ "$NGINX_OK" -ne 1 ]]; then
  echo ""
  warn "AZIONE MANUALE RICHIESTA — aggiungi questa riga DENTRO il blocco server{}"
  warn "del tuo vhost nginx (quello servito da Tailscale Funnel):"
  echo ""
  echo "    ${INCLUDE_LINE}"
  echo ""
  warn "Poi esegui:  ${SUDO} nginx -t && ${SUDO} systemctl reload nginx"
fi
echo ""

# =============================================================================
# STEP 7 — Test e output finale
# =============================================================================
log "STEP 7/7 — Test di verifica..."

# ── Determina l'hostname pubblico (Tailscale) ────────────────────────────────
detect_public_host() {
  if [[ -n "${PUBLIC_HOST:-}" ]]; then echo "${PUBLIC_HOST}"; return; fi
  if command -v tailscale >/dev/null 2>&1; then
    local dns
    dns="$(tailscale status --json 2>/dev/null \
      | grep -oE '"DNSName"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 \
      | sed -E 's/.*:[[:space:]]*"([^"]+)"/\1/' | sed 's/\.$//' || true)"
    if [[ -n "$dns" ]]; then echo "$dns"; return; fi
  fi
  echo ""
}

PUBLIC_HOSTNAME="$(detect_public_host)"

# Test 1: API locale /search
log "  1) Test API locale (http://${NOMINATIM_BIND}/search?q=Roma&format=json&limit=1)..."
if curl -fsS "http://${NOMINATIM_BIND}/search?q=Roma&format=json&limit=1" >/dev/null 2>&1; then
  ok "  API locale /search risponde."
else
  warn "  API locale NON risponde. Il servizio potrebbe ancora star caricando."
  warn "  Riprova manualmente: curl http://${NOMINATIM_BIND}/search?q=Roma&format=json&limit=1"
fi

# Test 2: API locale /reverse
log "  2) Test API locale (http://${NOMINATIM_BIND}/reverse?lat=41.9&lon=12.5&format=json)..."
if curl -fsS "http://${NOMINATIM_BIND}/reverse?lat=41.9&lon=12.5&format=json" >/dev/null 2>&1; then
  ok "  API locale /reverse risponde."
else
  warn "  API locale /reverse NON risponde (normale se il servizio è ancora in avvio)."
fi

# Test attraverso nginx (solo se la config è stata applicata)
if [[ "$NGINX_OK" -eq 1 ]]; then
  # Test 3: senza token → deve essere 403
  log "  3) Test nginx senza token (deve dare 403)..."
  CODE_NOAUTH="$(curl -s -o /dev/null -w '%{http_code}' \
    "http://127.0.0.1/nominatim/search?q=Roma&format=json&limit=1" 2>/dev/null || echo 000)"
  if [[ "$CODE_NOAUTH" == "403" ]]; then
    ok "  Senza token → 403 (auth attiva)."
  else
    warn "  Senza token ho ricevuto HTTP ${CODE_NOAUTH} (atteso 403). Verifica il vhost."
  fi

  # Test 4: con token → deve dare 200
  log "  4) Test nginx con token valido (deve dare 200)..."
  CODE_AUTH="$(curl -s -o /dev/null -w '%{http_code}' \
    -H "X-Nominatim-Token: ${TOKEN}" \
    "http://127.0.0.1/nominatim/search?q=Roma&format=json&limit=1" 2>/dev/null || echo 000)"
  if [[ "$CODE_AUTH" == "200" ]]; then
    ok "  Con token → 200 (proxy + rewrite OK)."
  else
    warn "  Con token ho ricevuto HTTP ${CODE_AUTH} (atteso 200)."
    warn "  Nota: il test usa http://127.0.0.1 e potrebbe non matchare il server_name. Verifica via URL pubblico."
  fi
fi
echo ""

# =============================================================================
# Output finale: secret da impostare su Replit
# =============================================================================
if [[ -n "$PUBLIC_HOSTNAME" ]]; then
  NOMINATIM_URL_VALUE="https://${PUBLIC_HOSTNAME}/nominatim"
else
  NOMINATIM_URL_VALUE="https://<IL-TUO-HOST>.ts.net/nominatim"
fi

echo "============================================================"
echo -e "\033[1;32m✓ SETUP NOMINATIM COMPLETATO\033[0m"
echo "============================================================"
echo ""
echo "Imposta questi 2 secret nel progetto BikerLink su Replit"
echo "(Tools → Secrets), poi riavvia il backend:"
echo ""
echo -e "  \033[1mNOMINATIM_URL\033[0m   = ${NOMINATIM_URL_VALUE}"
echo -e "  \033[1mNOMINATIM_TOKEN\033[0m = ${TOKEN}"
echo ""
if [[ -z "$PUBLIC_HOSTNAME" ]]; then
  warn "Non sono riuscito a rilevare l'hostname Tailscale automaticamente."
  warn "Sostituisci <IL-TUO-HOST>.ts.net con il dominio del tuo nodo:"
  warn "  tailscale status   # colonna hostname, oppure il dominio del Funnel"
fi
echo "Verifica dall'esterno (da un altro PC):"
echo "  # Geocoding (testo → coordinate)"
echo "  curl -H \"X-Nominatim-Token: ${TOKEN}\" \\"
echo "    \"${NOMINATIM_URL_VALUE}/search?q=Milano+Duomo&format=json&limit=5\""
echo ""
echo "  # Reverse geocoding (coordinate → indirizzo)"
echo "  curl -H \"X-Nominatim-Token: ${TOKEN}\" \\"
echo "    \"${NOMINATIM_URL_VALUE}/reverse?lat=45.464&lon=9.188&format=json\""
echo ""
echo "  # Senza token (deve dare 403)"
echo "  curl -i \"${NOMINATIM_URL_VALUE}/search?q=Roma&format=json\""
echo "============================================================"
