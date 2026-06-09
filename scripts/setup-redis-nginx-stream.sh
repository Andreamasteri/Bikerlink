#!/usr/bin/env bash
# =============================================================================
# BikerLink — Redis via nginx stream (TCP+TLS) su DuckDNS
# Eseguire sul ThinkCentre come root: sudo bash scripts/setup-redis-nginx-stream.sh
#
# Espone Redis su bkredis.bikerlink.duckdns.org:6380 con TLS Let's Encrypt.
# Replit si connette con: rediss://:PASSWORD@bkredis.bikerlink.duckdns.org:6380
# =============================================================================

set -euo pipefail

DOMAIN="bkredis.bikerlink.duckdns.org"
REDIS_PORT_LOCAL=6379
REDIS_PORT_PUBLIC=6380
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
STREAM_CONF="/etc/nginx/stream.conf.d/redis.conf"
NGINX_CONF="/etc/nginx/nginx.conf"

echo "=== BikerLink — Redis nginx stream setup ==="
echo "Dominio pubblico : ${DOMAIN}:${REDIS_PORT_PUBLIC}"
echo "Redis locale     : 127.0.0.1:${REDIS_PORT_LOCAL}"
echo ""

# --- 1. Prerequisiti ---
echo "[1/6] Verifica nginx con modulo stream..."
if ! nginx -V 2>&1 | grep -q "with-stream"; then
    echo "    nginx non ha il modulo stream. Installazione nginx-full..."
    apt-get install -y nginx-full
fi
echo "    OK — modulo stream disponibile."

# --- 2. Certificato TLS ---
echo "[2/6] Certificato TLS per ${DOMAIN}..."
if [ -d "${CERT_DIR}" ]; then
    echo "    OK — certificato già presente in ${CERT_DIR}"
else
    echo "    Richiesta certificato via certbot..."
    certbot certonly --nginx \
        --non-interactive \
        --agree-tos \
        --register-unsafely-without-email \
        -d "${DOMAIN}"
    echo "    OK — certificato ottenuto."
fi

# --- 3. Directory stream.conf.d ---
echo "[3/6] Configura directory stream.conf.d in nginx.conf..."
mkdir -p /etc/nginx/stream.conf.d

# Aggiunge il blocco stream a nginx.conf se non presente
if ! grep -q "stream.conf.d" "${NGINX_CONF}"; then
    cat >> "${NGINX_CONF}" <<'EOF'

# BikerLink — TCP stream proxy (Redis, ecc.)
stream {
    include /etc/nginx/stream.conf.d/*.conf;
}
EOF
    echo "    OK — blocco stream aggiunto a nginx.conf."
else
    echo "    OK — blocco stream già presente in nginx.conf."
fi

# --- 4. Config stream Redis ---
echo "[4/6] Scrittura config stream Redis..."
cat > "${STREAM_CONF}" <<EOF
# BikerLink — Redis TCP+TLS proxy
# Generato da setup-redis-nginx-stream.sh

upstream redis_backend {
    server 127.0.0.1:${REDIS_PORT_LOCAL};
}

server {
    listen ${REDIS_PORT_PUBLIC} ssl;

    ssl_certificate     ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL_REDIS:10m;
    ssl_session_timeout 10m;

    proxy_pass    redis_backend;
    proxy_timeout 600s;
    proxy_connect_timeout 5s;
}
EOF
echo "    OK — ${STREAM_CONF} scritto."

# --- 5. ufw — apri porta 6380 su internet ---
echo "[5/6] Regola firewall ufw per porta ${REDIS_PORT_PUBLIC}..."
if ufw status | grep -q "${REDIS_PORT_PUBLIC}/tcp"; then
    echo "    OK — regola già presente."
else
    ufw allow ${REDIS_PORT_PUBLIC}/tcp comment "Redis TLS pubblico (BikerLink)"
    echo "    OK — porta ${REDIS_PORT_PUBLIC}/tcp aperta."
fi

# --- 6. Test e reload nginx ---
echo "[6/6] Verifica config nginx e reload..."
nginx -t
systemctl reload nginx
echo "    OK — nginx ricaricato."

echo ""
echo "==================================================="
echo "  Setup completato!"
echo "==================================================="
echo ""
echo "  Prossimi passi:"
echo ""
echo "  1. Verifica connessione da un altro terminale:"
echo "     redis-cli -h ${DOMAIN} -p ${REDIS_PORT_PUBLIC} --tls \\"
echo "       -a '<tua_password_redis>' ping"
echo "     → deve rispondere: PONG"
echo ""
echo "  2. Aggiorna il secret REDIS_URL in Replit:"
REDIS_PASS=$(grep -oP '(?<=redis://:)[^@]+' <<< "${REDIS_URL:-}" 2>/dev/null || echo "<password>")
echo "     REDIS_URL = rediss://:${REDIS_PASS}@${DOMAIN}:${REDIS_PORT_PUBLIC}"
echo ""
echo "  3. Riavvia il backend Replit per applicare il nuovo URL."
echo "==================================================="
