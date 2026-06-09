#!/usr/bin/env bash
# =============================================================================
# setup-redis-thinkcentre.sh
# Installa e configura Redis sul ThinkCentre (Ubuntu 22.04/24.04)
# + nginx stream proxy TLS su porta 6380 per esposizione via DuckDNS.
#
# Architettura:
#   Replit (rediss://:<password>@bikerlink.duckdns.org:6380)
#     └─ TLS ──► nginx stream :6380
#                  └─ plaintext ──► Redis 127.0.0.1:6379
#
# Utilizzo:
#   sudo bash scripts/setup-redis-thinkcentre.sh
#
# Lo script è IDEMPOTENTE: può essere eseguito più volte senza effetti collaterali.
# Richiede: Ubuntu 22.04+ con nginx-full installato e certificati Let's Encrypt
#           già ottenuti per bikerlink.duckdns.org (via certbot).
#
# ⚠️ REDIS_PASSWORD deve essere impostata come variabile d'ambiente:
#   export REDIS_PASSWORD="<password_forte>"
#   sudo -E bash scripts/setup-redis-thinkcentre.sh
#
# Migrazione futura: quando Cloudflare Tunnel sarà attivo (task #3552),
# sostituire REDIS_URL con l'URL del tunnel e chiudere la porta 6380.
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Colori per output leggibile
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*" >&2; }

# ---------------------------------------------------------------------------
# Variabili di configurazione
# ---------------------------------------------------------------------------
REDIS_BIND="127.0.0.1"
REDIS_PORT=6379
NGINX_STREAM_PORT=6380
DUCKDNS_DOMAIN="bikerlink.duckdns.org"
CERT_DIR="/etc/letsencrypt/live/${DUCKDNS_DOMAIN}"
REDIS_CONF="/etc/redis/redis.conf"
NGINX_CONF="/etc/nginx/nginx.conf"
NGINX_STREAM_CONF="/etc/nginx/stream.d/redis-tls.conf"
MAXMEMORY="2gb"
MAXMEMORY_POLICY="allkeys-lru"

# ---------------------------------------------------------------------------
# Verifica prerequisiti
# ---------------------------------------------------------------------------
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

  if ! command -v nginx &>/dev/null; then
    error "nginx non trovato. Installa nginx-full: apt install nginx-full"
    exit 1
  fi

  # Verifica che nginx abbia il modulo stream
  if ! nginx -V 2>&1 | grep -q "\-\-with-stream"; then
    error "nginx non ha il modulo stream. Installa nginx-full: apt install nginx-full"
    exit 1
  fi

  if [[ ! -d "${CERT_DIR}" ]]; then
    warn "Certificati Let's Encrypt non trovati in ${CERT_DIR}"
    warn "Ottienili con: certbot certonly --standalone -d ${DUCKDNS_DOMAIN}"
    warn "Il proxy TLS non sarà configurato finché i certificati non esistono."
    SKIP_NGINX_TLS=true
  else
    SKIP_NGINX_TLS=false
    success "Certificati Let's Encrypt trovati"
  fi

  success "Prerequisiti OK"
}

# ---------------------------------------------------------------------------
# Step 1 — Installa Redis
# ---------------------------------------------------------------------------
install_redis() {
  info "Step 1: Installazione redis-server..."

  # Use dpkg -s + grep for proper status check; dpkg -l can return
  # non-zero exit for "known but not installed" state on some Ubuntu versions.
  if dpkg -s redis-server 2>/dev/null | grep -q "Status: install ok installed"; then
    local ver
    ver=$(redis-server --version 2>/dev/null | awk '{print $3}' || echo "unknown")
    success "redis-server già installato (${ver})"
  else
    apt-get update -qq
    apt-get install -y redis-server
    success "redis-server installato"
  fi
}

# ---------------------------------------------------------------------------
# Step 2 — Configura Redis
# ---------------------------------------------------------------------------
configure_redis() {
  info "Step 2: Configurazione Redis (${REDIS_CONF})..."

  # Backup del file di configurazione originale
  if [[ ! -f "${REDIS_CONF}.orig" ]]; then
    cp "${REDIS_CONF}" "${REDIS_CONF}.orig"
    info "Backup originale salvato in ${REDIS_CONF}.orig"
  fi

  # Applica configurazioni chiave in modo idempotente (sed replace-or-append)
  apply_redis_conf() {
    local key="$1"
    local value="$2"
    # Se la riga esiste (commentata o no), sostituiscila; altrimenti aggiungila
    if grep -qE "^#?${key}" "${REDIS_CONF}"; then
      sed -i "s|^#\?${key}.*|${key} ${value}|" "${REDIS_CONF}"
    else
      echo "${key} ${value}" >> "${REDIS_CONF}"
    fi
  }

  # Ascolta solo su localhost — mai esposto raw
  apply_redis_conf "bind" "${REDIS_BIND}"

  # Porta standard
  apply_redis_conf "port" "${REDIS_PORT}"

  # Autenticazione obbligatoria
  apply_redis_conf "requirepass" "${REDIS_PASSWORD}"

  # Limite memoria
  apply_redis_conf "maxmemory" "${MAXMEMORY}"
  apply_redis_conf "maxmemory-policy" "${MAXMEMORY_POLICY}"

  # Persistenza: mantieni snapshot RDB ogni 15 minuti se almeno 1 chiave è cambiata
  apply_redis_conf "save" "900 1"

  # Disabilita accesso senza password (protezione extra)
  apply_redis_conf "protected-mode" "yes"

  success "Redis configurato"
}

# ---------------------------------------------------------------------------
# Step 3 — Abilita e avvia il servizio Redis
# ---------------------------------------------------------------------------
enable_redis_service() {
  info "Step 3: Abilitazione servizio Redis al boot..."

  systemctl enable redis-server
  systemctl restart redis-server

  # Attendi che Redis sia pronto
  local retries=10
  local count=0
  while ! redis-cli -h "${REDIS_BIND}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" --no-auth-warning ping &>/dev/null; do
    count=$((count + 1))
    if [[ $count -ge $retries ]]; then
      error "Redis non risponde dopo ${retries} tentativi. Controlla: journalctl -u redis-server"
      exit 1
    fi
    sleep 1
  done

  success "Redis attivo e risponde su ${REDIS_BIND}:${REDIS_PORT}"
}

# ---------------------------------------------------------------------------
# Step 4 — Configura nginx stream proxy TLS
# ---------------------------------------------------------------------------
configure_nginx_stream() {
  if [[ "${SKIP_NGINX_TLS:-false}" == "true" ]]; then
    warn "Step 4: Configurazione nginx TLS saltata (certificati mancanti)"
    return
  fi

  info "Step 4: Configurazione nginx stream proxy TLS su porta ${NGINX_STREAM_PORT}..."

  # Crea directory per configurazioni stream se non esiste
  mkdir -p /etc/nginx/stream.d

  # Scrivi la configurazione del proxy stream
  cat > "${NGINX_STREAM_CONF}" << EOF
# Redis TLS proxy — generato da setup-redis-thinkcentre.sh
# Porta esterna: ${NGINX_STREAM_PORT} (TLS) → localhost:${REDIS_PORT} (plaintext)
#
# ⚠️ Migrazione futura: quando Cloudflare Tunnel sarà attivo,
# rimuovere questo file e aggiornare REDIS_URL nel secret Replit.

upstream redis_backend {
    server ${REDIS_BIND}:${REDIS_PORT};
}

server {
    listen ${NGINX_STREAM_PORT} ssl;

    ssl_certificate     ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;

    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL_stream:10m;
    ssl_session_timeout 10m;

    proxy_pass          redis_backend;
    proxy_timeout       10s;
    proxy_connect_timeout 5s;

    # Log accessi stream (opzionale, utile per debug)
    # access_log /var/log/nginx/redis-stream.log;
    # error_log  /var/log/nginx/redis-stream-error.log;
}
EOF

  # Aggiungi il blocco stream{} a nginx.conf se non presente
  if grep -q "^stream" "${NGINX_CONF}"; then
    success "Blocco stream{} già presente in nginx.conf"
  else
    # Verifica se nginx.conf include già stream.d
    if grep -q "stream.d" "${NGINX_CONF}"; then
      success "nginx.conf include già stream.d/"
    else
      # Aggiungi il blocco stream in fondo al nginx.conf (fuori dal blocco http{})
      cat >> "${NGINX_CONF}" << 'EOF'

# Redis TLS stream proxy — aggiunto da setup-redis-thinkcentre.sh
stream {
    include /etc/nginx/stream.d/*.conf;
}
EOF
      success "Blocco stream{} aggiunto a ${NGINX_CONF}"
    fi
  fi

  # Verifica sintassi nginx
  if nginx -t; then
    systemctl reload nginx
    success "nginx ricaricato con proxy stream su porta ${NGINX_STREAM_PORT}"
  else
    error "Errore nella configurazione nginx. Ripristina manualmente."
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Step 5 — Test di connessione TLS remota
# ---------------------------------------------------------------------------
test_connection() {
  info "Step 5: Test connessione locale Redis..."

  local result
  result=$(redis-cli -h "${REDIS_BIND}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" \
    --no-auth-warning ping 2>&1)

  if [[ "$result" == "PONG" ]]; then
    success "Redis locale: PONG ✓"
  else
    error "Redis locale non risponde: $result"
    exit 1
  fi

  if [[ "${SKIP_NGINX_TLS:-false}" == "true" ]]; then
    warn "Test connessione TLS remota saltato (certificati mancanti)"
    return
  fi

  info "Test connessione TLS remota (${DUCKDNS_DOMAIN}:${NGINX_STREAM_PORT})..."

  if command -v redis-cli &>/dev/null; then
    local tls_result
    tls_result=$(redis-cli \
      -h "${DUCKDNS_DOMAIN}" \
      -p "${NGINX_STREAM_PORT}" \
      --tls \
      -a "${REDIS_PASSWORD}" \
      --no-auth-warning \
      ping 2>&1 || true)

    if [[ "$tls_result" == "PONG" ]]; then
      success "Connessione TLS remota: PONG ✓"
      info "REDIS_URL da impostare su Replit (usa la REDIS_PASSWORD che hai esportato):"
      echo ""
      echo "  REDIS_URL=rediss://:<REDIS_PASSWORD>@${DUCKDNS_DOMAIN}:${NGINX_STREAM_PORT}"
      echo ""
      warn "NON salvare la password nel codice — impostala solo come secret Replit!"
    else
      warn "Connessione TLS remota: risposta inattesa: ${tls_result}"
      warn "Verifica: ufw allow ${NGINX_STREAM_PORT}/tcp, e che il port forwarding del router sia attivo"
    fi
  else
    warn "redis-cli non disponibile per il test TLS remoto"
  fi
}

# ---------------------------------------------------------------------------
# Riepilogo finale
# ---------------------------------------------------------------------------
print_summary() {
  echo ""
  echo "============================================================"
  echo "  Setup Redis ThinkCentre — Completato"
  echo "============================================================"
  echo ""
  echo "  Redis locale:    ${REDIS_BIND}:${REDIS_PORT}"
  echo "  Stream TLS:      ${DUCKDNS_DOMAIN}:${NGINX_STREAM_PORT}"
  echo "  Maxmemory:       ${MAXMEMORY} (policy: ${MAXMEMORY_POLICY})"
  echo ""
  echo "  Prossimi passi:"
  echo "  1. Assicurati che ufw consenta la porta ${NGINX_STREAM_PORT}:"
  echo "     sudo ufw allow ${NGINX_STREAM_PORT}/tcp"
  echo "  2. Verifica il port forwarding sul router (esterno:${NGINX_STREAM_PORT} → ThinkCentre:${NGINX_STREAM_PORT})"
  echo "  3. Imposta REDIS_URL come secret su Replit:"
  echo "     rediss://:<REDIS_PASSWORD>@${DUCKDNS_DOMAIN}:${NGINX_STREAM_PORT}"
  echo "  4. Riavvia il backend Replit e verifica il log [Redis] connected"
  echo ""
  echo "  Per ruotare la password:"
  echo "    export REDIS_PASSWORD='<nuova_password>' && sudo -E bash $0"
  echo ""
  echo "  ⚠️ Migrazione futura: quando Cloudflare Tunnel sarà attivo"
  echo "     (task #3552), aggiorna REDIS_URL e chiudi la porta ${NGINX_STREAM_PORT}."
  echo "============================================================"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  echo ""
  info "=== Setup Redis ThinkCentre (BikerLink) ==="
  echo ""

  check_prerequisites
  install_redis
  configure_redis
  enable_redis_service
  configure_nginx_stream
  test_connection
  print_summary
}

main "$@"
