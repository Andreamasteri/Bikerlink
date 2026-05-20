#!/usr/bin/env bash
# =============================================================================
# BikerLink — GraphHopper Self-Hosted Setup Script (SELF-CONTAINED)
# Target: Oracle Cloud Free Tier VM.Standard.A1.Flex (ARM, 4 OCPU, 24 GB RAM)
#         Ubuntu 22.04 LTS  |  Alternativa: Hetzner CX22
#
# UTILIZZO (due modalità equivalenti):
#
#   Modalità 1 — clone repo e run locale:
#     git clone https://github.com/your-org/bikerlink && cd bikerlink
#     sudo DOMAIN=gh.bikerlink.app GH_TOKEN=<token> ./graphhopper/setup-oracle.sh
#
#   Modalità 2 — pipe-to-bash (self-contained, non richiede file locali):
#     curl -fsSL https://raw.githubusercontent.com/your-org/bikerlink/main/graphhopper/setup-oracle.sh \
#       | sudo DOMAIN=gh.bikerlink.app GH_TOKEN=<token> bash
#
# Tutte le configurazioni (config.yml, nginx.conf, systemd services, ecc.)
# sono incorporate come heredoc — nessun file esterno necessario.
# =============================================================================

set -euo pipefail

GH_VERSION="${GH_VERSION:-9.1}"
GH_JAR_URL="https://github.com/graphhopper/graphhopper/releases/download/${GH_VERSION}/graphhopper-web-${GH_VERSION}.jar"
OSM_URL="https://download.geofabrik.de/europe/italy-latest.osm.pbf"
GH_DIR="/opt/graphhopper"
GH_USER="graphhopper"
DOMAIN="${DOMAIN:-gh.bikerlink.app}"
GH_TOKEN="${GH_TOKEN:-}"
JAVA_HEAP="${JAVA_HEAP:-20g}"

log()  { echo -e "\033[1;32m[$(date +%H:%M:%S)] $*\033[0m"; }
warn() { echo -e "\033[1;33m[WARN] $*\033[0m"; }
err()  { echo -e "\033[1;31m[ERROR] $*\033[0m" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || err "Eseguire come root: sudo $0"

# Sicurezza: token obbligatorio — fail immediato se non impostato
if [[ -z "$GH_TOKEN" ]]; then
    err "GH_TOKEN non impostato. Generane uno sicuro con:
  GH_TOKEN=\$(openssl rand -base64 32) sudo $0"
fi
if [[ ${#GH_TOKEN} -lt 16 ]]; then
    err "GH_TOKEN troppo corto (${#GH_TOKEN} caratteri, minimo 16). Usa: openssl rand -base64 32"
fi

# =============================================================================
# 1. Aggiornamento sistema e dipendenze
# =============================================================================
log "Aggiornamento pacchetti sistema..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
    curl wget unzip git bc \
    nginx certbot python3-certbot-nginx \
    ufw htop ncdu \
    openjdk-21-jre-headless

java -version 2>&1 | grep -q "21" || err "OpenJDK 21 non installato correttamente"
log "Java 21 installato: $(java -version 2>&1 | head -1)"

# =============================================================================
# 2. Utente dedicato + struttura directory
# =============================================================================
log "Creazione utente e directory GraphHopper..."
id "$GH_USER" &>/dev/null || useradd --system --home "$GH_DIR" --shell /bin/false "$GH_USER"
mkdir -p "${GH_DIR}/data" "${GH_DIR}/logs" "${GH_DIR}/custom_models"

# =============================================================================
# 3. Download GraphHopper JAR
# =============================================================================
if [[ ! -f "${GH_DIR}/graphhopper.jar" ]]; then
    log "Download GraphHopper ${GH_VERSION}..."
    wget -q --show-progress -O "${GH_DIR}/graphhopper.jar" "$GH_JAR_URL"
else
    log "graphhopper.jar già presente, skip download."
fi

# =============================================================================
# 4. Download dati OSM Italia
# =============================================================================
if [[ ! -f "${GH_DIR}/data/italy-latest.osm.pbf" ]]; then
    log "Download OSM Italia (~1.5 GB, pazienza...)..."
    wget -q --show-progress -O "${GH_DIR}/data/italy-latest.osm.pbf" "$OSM_URL"
else
    log "italy-latest.osm.pbf già presente, skip download."
fi

# =============================================================================
# 5. Scrittura config.yml (heredoc — self-contained)
# =============================================================================
log "Scrittura config.yml..."
cat > "${GH_DIR}/config.yml" << 'CONFIGEOF'
graphhopper:
  datareader.file: data/italy-latest.osm.pbf
  graph.location: data/italy-latest-gh

  profiles:
    - name: motorcycle
      vehicle: motorcycle
      weighting: custom
      custom_model:
        speed:
          - if: "true"
            limit_to: "max_speed"
          - if: "road_class == MOTORWAY"
            multiply_by: "0.1"
          - if: "road_class == PRIMARY"
            multiply_by: "0.85"
          - if: "road_class == SECONDARY || road_class == TERTIARY"
            multiply_by: "1.05"
        priority:
          - if: "road_class == MOTORWAY"
            multiply_by: "0.05"
          - if: "toll == ALL"
            multiply_by: "0.2"
          - if: "surface == UNPAVED || surface == GRAVEL"
            multiply_by: "0.3"
          - if: "road_class == SECONDARY"
            multiply_by: "1.1"
          - if: "road_class == TERTIARY"
            multiply_by: "1.2"
          - if: "road_class == RESIDENTIAL || road_class == UNCLASSIFIED"
            multiply_by: "1.15"

    - name: motorcycle_fast
      vehicle: motorcycle
      weighting: fastest

  # motorcycle usa LM (Landmark) — compatibile con custom_model per-request dinamici (Fase 3)
  # CH non supporta custom_model per-request senza ch.disable=true; LM sì nativamente.
  profiles_lm:
    - profile: motorcycle
      active_landmarks: 16

  profiles_ch:
    - profile: motorcycle_fast

  graph.flag_encoders: motorcycle
  graph.encoded_values: road_class,surface,toll,max_speed
  custom_model_dir: custom_models

  map_matching:
    enabled: true
    max_visited_nodes: 10000
    measurement_error_sigma: 50.0

  server:
    application_connectors:
      - type: http
        port: 8989
        bind_host: 127.0.0.1
    request_log:
      appenders: []

  import.osm.ignored_highways: footway,cycleway,path,steps,platform

logging:
  level: WARN
  appenders:
    - type: file
      currentLogFilename: /opt/graphhopper/logs/graphhopper.log
      archivedLogFilenamePattern: /opt/graphhopper/logs/graphhopper-%d.log.gz
      archivedFileCount: 7
    - type: console
      threshold: ERROR
CONFIGEOF

# =============================================================================
# 6. Scrittura health-server.py (heredoc)
# =============================================================================
log "Scrittura health-server.py..."
cat > "${GH_DIR}/health-server.py" << 'HEALTHEOF'
#!/usr/bin/env python3
"""
BikerLink GraphHopper Health Server (porta 8990, localhost only)
Restituisce: { "status", "graph_loaded", "osm_date", "version", "profiles" }
"""
import http.server, json, os, socket
from datetime import datetime, timezone

GH_DIR     = os.environ.get("GH_DIR", "/opt/graphhopper")
GH_PORT    = int(os.environ.get("GH_PORT", "8989"))
HEALTH_PORT= int(os.environ.get("HEALTH_PORT", "8990"))
GH_VERSION = os.environ.get("GH_VERSION", "9.1")

def get_osm_date():
    for p in [os.path.join(GH_DIR,"data","italy-latest-gh"),
              os.path.join(GH_DIR,"data","italy-latest.osm.pbf")]:
        if os.path.exists(p):
            return datetime.fromtimestamp(os.path.getmtime(p), tz=timezone.utc).strftime("%Y-%m-%d")
    return "unknown"

def is_graphhopper_up():
    try:
        with socket.create_connection(("127.0.0.1", GH_PORT), timeout=2): return True
    except (OSError, ConnectionRefusedError): return False

def graph_is_loaded():
    d = os.path.join(GH_DIR, "data", "italy-latest-gh")
    return os.path.isdir(d) and len(os.listdir(d)) > 0

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path not in ("/health", "/health/"):
            self.send_response(404); self.end_headers()
            self.wfile.write(b'{"error":"Not Found"}'); return
        up = is_graphhopper_up()
        payload = json.dumps({
            "status": "ok" if up else "starting",
            "graph_loaded": graph_is_loaded() and up,
            "osm_date": get_osm_date(),
            "version": GH_VERSION,
            "profiles": ["motorcycle","motorcycle_fast"],
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        }).encode()
        self.send_response(200 if up else 503)
        self.send_header("Content-Type","application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers(); self.wfile.write(payload)

http.server.HTTPServer(("127.0.0.1", HEALTH_PORT), H).serve_forever()
HEALTHEOF
chmod +x "${GH_DIR}/health-server.py"

# =============================================================================
# 7. Scrittura update-osm.sh (heredoc)
# =============================================================================
log "Scrittura update-osm.sh..."
cat > "${GH_DIR}/update-osm.sh" << UPDATEEOF
#!/usr/bin/env bash
# Aggiornamento mensile OSM Italia — installato da setup-oracle.sh
set -uo pipefail

GH_DIR="${GH_DIR}"
JAVA_HEAP="${JAVA_HEAP}"
OSM_URL="https://download.geofabrik.de/europe/italy-latest.osm.pbf"
OSM_FILE="\${GH_DIR}/data/italy-latest.osm.pbf"
GRAPH_DIR="\${GH_DIR}/data/italy-latest-gh"
BACKUP_GRAPH="\${GH_DIR}/data/italy-latest-gh.bak"
LOG_FILE="\${GH_DIR}/logs/osm-update.log"

log() { echo "[\$(date '+%Y-%m-%d %H:%M:%S')] \$*" | tee -a "\$LOG_FILE"; }

log "=== Inizio aggiornamento OSM Italia ==="

# 1. Download
log "Download italy-latest.osm.pbf..."
wget -q -O "\${OSM_FILE}.tmp" "\$OSM_URL" || { log "ERRORE: Download fallito"; exit 1; }
FILE_SIZE=\$(stat -c%s "\${OSM_FILE}.tmp")
if [[ \$FILE_SIZE -lt 500000000 ]]; then
    log "ERRORE: File troppo piccolo (\${FILE_SIZE} bytes)"; rm -f "\${OSM_FILE}.tmp"; exit 1
fi
mv "\${OSM_FILE}.tmp" "\$OSM_FILE"
log "Download OK. Dimensione: \$(du -sh "\$OSM_FILE" | cut -f1)"

# 2. Backup grafo esistente
if [[ -d "\$GRAPH_DIR" ]]; then
    log "Backup grafo in \${BACKUP_GRAPH}..."
    rm -rf "\$BACKUP_GRAPH"
    cp -r "\$GRAPH_DIR" "\$BACKUP_GRAPH"
fi

# 3. Stop servizio
log "Stop GraphHopper..."
systemctl stop graphhopper || true
sleep 5

# 4. Rebuild grafo — cattura exit code senza terminare lo script
log "Rebuild grafo OSM (15-20 min)..."
rm -rf "\$GRAPH_DIR"
cd "\$GH_DIR"

# NOTA: 'set -e' è disabilitato qui per gestire manualmente l'errore
java -Xmx\${JAVA_HEAP} -Xms4g \
    -Ddw.graphhopper.datareader.file=data/italy-latest.osm.pbf \
    -jar graphhopper.jar import config.yml \
    > >(tee -a "\${GH_DIR}/logs/import-\$(date +%Y%m).log") 2>&1
BUILD_EXIT=\$?

if [[ \$BUILD_EXIT -ne 0 ]]; then
    log "ERRORE: Build fallita (exit \$BUILD_EXIT). Ripristino backup..."
    rm -rf "\$GRAPH_DIR"
    if [[ -d "\$BACKUP_GRAPH" ]]; then
        mv "\$BACKUP_GRAPH" "\$GRAPH_DIR"
        log "Backup ripristinato."
    fi
    systemctl start graphhopper || true
    exit 1
fi

log "Build completata! Grafo: \$(du -sh "\$GRAPH_DIR" | cut -f1)"
rm -rf "\$BACKUP_GRAPH"

# 5. Restart
log "Avvio GraphHopper con nuovo grafo..."
systemctl start graphhopper
sleep 120

HTTP_CODE=\$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8990/health" || echo "000")
if [[ "\$HTTP_CODE" == "200" ]]; then
    log "✓ GraphHopper operativo con grafo aggiornato"
else
    log "ATTENZIONE: /health ha risposto con HTTP \${HTTP_CODE}"
fi
log "=== Aggiornamento OSM completato ==="
UPDATEEOF
chmod +x "${GH_DIR}/update-osm.sh"

# =============================================================================
# 8. Build grafo OSM (prima build)
# =============================================================================
if [[ ! -d "${GH_DIR}/data/italy-latest-gh" ]]; then
    log "Build grafo OSM Italia (prima build, ~15 min)..."
    cd "$GH_DIR"
    # Cattura exit code senza terminare lo script su pipefail
    java -Xmx${JAVA_HEAP} -Xms4g \
        -Ddw.graphhopper.datareader.file=data/italy-latest.osm.pbf \
        -jar graphhopper.jar import config.yml \
        > >(tee "${GH_DIR}/logs/import-initial.log") 2>&1
    IMPORT_EXIT=$?
    [[ $IMPORT_EXIT -eq 0 ]] || err "Build grafo fallita (exit $IMPORT_EXIT). Controlla: ${GH_DIR}/logs/import-initial.log"
    log "Build completata!"
else
    log "Grafo già buildato, skip import."
fi

# =============================================================================
# 9. Systemd service GraphHopper (heredoc)
# =============================================================================
log "Installazione systemd service GraphHopper..."
cat > /etc/systemd/system/graphhopper.service << SVCEOF
[Unit]
Description=GraphHopper Routing Server — BikerLink
After=network.target

[Service]
Type=simple
User=${GH_USER}
Group=${GH_USER}
WorkingDirectory=${GH_DIR}
Environment="JAVA_OPTS=-Xmx${JAVA_HEAP} -Xms4g -XX:+UseG1GC -XX:MaxGCPauseMillis=200"
ExecStart=/usr/bin/java \$JAVA_OPTS -jar ${GH_DIR}/graphhopper.jar server ${GH_DIR}/config.yml
Restart=always
RestartSec=10
StartLimitIntervalSec=120
StartLimitBurst=5
MemoryMax=22G
MemoryHigh=20G
TasksMax=512
LimitNOFILE=65536
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${GH_DIR}/data ${GH_DIR}/logs
TimeoutStartSec=300
TimeoutStopSec=30
StandardOutput=append:${GH_DIR}/logs/stdout.log
StandardError=append:${GH_DIR}/logs/stderr.log

[Install]
WantedBy=multi-user.target
SVCEOF

# =============================================================================
# 10. Systemd service Health Server (heredoc)
# =============================================================================
log "Installazione systemd service Health Server (porta 8990)..."
cat > /etc/systemd/system/graphhopper-health.service << HEALTHSVCEOF
[Unit]
Description=GraphHopper Health Server — BikerLink
After=network.target graphhopper.service

[Service]
Type=simple
User=${GH_USER}
Group=${GH_USER}
WorkingDirectory=${GH_DIR}
Environment="GH_DIR=${GH_DIR}"
Environment="GH_PORT=8989"
Environment="HEALTH_PORT=8990"
Environment="GH_VERSION=${GH_VERSION}"
ExecStart=/usr/bin/python3 ${GH_DIR}/health-server.py
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadOnlyPaths=${GH_DIR}/data
ReadWritePaths=${GH_DIR}/logs
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
HEALTHSVCEOF

systemctl daemon-reload
systemctl enable graphhopper graphhopper-health
systemctl start graphhopper graphhopper-health

log "Attesa avvio GraphHopper (60 sec)..."
sleep 60

systemctl is-active graphhopper  && log "GraphHopper avviato!" || warn "GraphHopper non ancora attivo — il grafo impiega 2-3 min a caricarsi"
systemctl is-active graphhopper-health && log "Health server avviato!" || warn "Health server non attivo"

# =============================================================================
# 11. Nginx — fase 1: config HTTP-only (necessaria PRIMA di certbot)
# IMPORTANTE: non aggiungere blocco SSL qui perché i certificati non esistono
# ancora. Certbot non può funzionare se nginx -t fallisce a causa di percorsi
# SSL mancanti.
# =============================================================================
log "Configurazione Nginx (fase 1 — HTTP only, necessaria per certbot)..."
cat > /etc/nginx/sites-available/graphhopper << NGINXHTTP
limit_req_zone \$binary_remote_addr zone=gh_limit:10m rate=100r/m;
limit_req_status 429;

upstream graphhopper_backend { server 127.0.0.1:8989; keepalive 32; }
upstream graphhopper_health  { server 127.0.0.1:8990; keepalive 8;  }

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    # Challenge Let's Encrypt (certbot webroot)
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Health check pubblico (utile anche su HTTP per uptime monitor interni)
    location = /health {
        limit_req zone=gh_limit burst=20 nodelay;
        proxy_pass http://graphhopper_health;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_read_timeout 10s;
    }

    # Tutto il resto: rifiuta su HTTP (HTTPS obbligatorio per le API)
    location / {
        return 400 '{"error":"Use HTTPS for API calls."}';
    }

    access_log /var/log/nginx/graphhopper-access.log;
    error_log /var/log/nginx/graphhopper-error.log warn;
}
NGINXHTTP

mkdir -p /var/www/certbot
ln -sf /etc/nginx/sites-available/graphhopper /etc/nginx/sites-enabled/graphhopper
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# =============================================================================
# 12. Let's Encrypt — certbot certonly (webroot, non modifica nginx)
# =============================================================================
log "Ottenimento certificato Let's Encrypt per ${DOMAIN}..."
CERTBOT_OK=0
certbot certonly \
    --webroot -w /var/www/certbot \
    -d "$DOMAIN" \
    --non-interactive --agree-tos -m "admin@bikerlink.app" \
    && CERTBOT_OK=1 \
    || warn "Let's Encrypt fallito — DNS non ancora puntato su questo server? Riesegui dopo: certbot certonly --webroot -w /var/www/certbot -d ${DOMAIN}"

# =============================================================================
# 12b. Nginx — fase 2: config HTTPS completa (solo se certificati presenti)
# =============================================================================
CERT_FILE="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
if [[ $CERTBOT_OK -eq 1 ]] && [[ -f "$CERT_FILE" ]]; then
    log "Certificato ottenuto — aggiornamento Nginx a HTTPS..."
    cat > /etc/nginx/sites-available/graphhopper << NGINXHTTPS
limit_req_zone \$binary_remote_addr zone=gh_limit:10m rate=100r/m;
limit_req_status 429;

upstream graphhopper_backend { server 127.0.0.1:8989; keepalive 32; }
upstream graphhopper_health  { server 127.0.0.1:8990; keepalive 8;  }

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header Access-Control-Allow-Origin "https://bikerlink.app" always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type, X-GH-Token, Authorization" always;

    if (\$request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin "https://bikerlink.app";
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
        add_header Access-Control-Allow-Headers "Content-Type, X-GH-Token, Authorization";
        add_header Content-Length 0;
        return 204;
    }

    location = /health {
        limit_req zone=gh_limit burst=20 nodelay;
        proxy_pass http://graphhopper_health;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_read_timeout 10s;
    }

    location / {
        limit_req zone=gh_limit burst=30 nodelay;

        set \$auth_ok "false";
        if (\$http_x_gh_token = "${GH_TOKEN}")              { set \$auth_ok "true"; }
        if (\$http_authorization = "Bearer ${GH_TOKEN}")    { set \$auth_ok "true"; }

        if (\$auth_ok = "false") {
            return 401 '{"error":"Unauthorized. Provide X-GH-Token header."}';
        }

        proxy_pass http://graphhopper_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
        proxy_buffer_size 16k;
        proxy_buffers 8 32k;
    }

    access_log /var/log/nginx/graphhopper-access.log;
    error_log /var/log/nginx/graphhopper-error.log warn;
}
NGINXHTTPS

    nginx -t && systemctl reload nginx
    log "Nginx configurato con HTTPS!"

    # Cron rinnovo automatico certificato (ogni 2 mesi, 03:00)
    (crontab -l 2>/dev/null | grep -v certbot; \
     echo "0 3 1 */2 * certbot renew --quiet && systemctl reload nginx") | crontab -
else
    warn "Nginx rimane in modalità HTTP — completa il setup SSL manualmente dopo aver puntato il DNS:"
    warn "  certbot certonly --webroot -w /var/www/certbot -d ${DOMAIN}"
    warn "  Poi sostituisci la config HTTP con quella HTTPS (vedi graphhopper/nginx.conf)."
fi

# =============================================================================
# 13. Firewall
# =============================================================================
log "Configurazione firewall..."
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
log "Firewall attivato. Porta 8989 e 8990 NON esposte direttamente."

# =============================================================================
# 14. Cron aggiornamento mensile OSM
# =============================================================================
log "Installazione cron aggiornamento mensile OSM (1° del mese, 02:00)..."
(crontab -l 2>/dev/null | grep -v update-osm; \
 echo "0 2 1 * * ${GH_DIR}/update-osm.sh >> ${GH_DIR}/logs/osm-update.log 2>&1") | crontab -

# =============================================================================
# 15. Permessi finali
# =============================================================================
chown -R "${GH_USER}:${GH_USER}" "$GH_DIR"

# =============================================================================
# 16. Verifica finale
# =============================================================================
log "Verifica salute servizio (attesa 180 sec per caricamento grafo)..."
sleep 180

HEALTH_RESP=$(curl -s "http://localhost:8990/health" || echo '{}')
HEALTH_STATUS=$(echo "$HEALTH_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','unknown'))" 2>/dev/null || echo "unknown")
GRAPH_LOADED=$(echo "$HEALTH_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('graph_loaded','unknown'))" 2>/dev/null || echo "unknown")
OSM_DATE=$(echo "$HEALTH_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('osm_date','unknown'))" 2>/dev/null || echo "unknown")

log "Health check: status=${HEALTH_STATUS}, graph_loaded=${GRAPH_LOADED}, osm_date=${OSM_DATE}"

log "============================================================"
log "Setup completato!"
log ""
log "  URL pubblico:  https://${DOMAIN}"
log "  Health check:  https://${DOMAIN}/health"
log "  Test routing:  ./test-graphhopper.sh https://${DOMAIN} <token>"
log ""
log "Imposta nel backend BikerLink (Replit Secrets):"
log "  GRAPHHOPPER_URL=${DOMAIN}"
log "  GRAPHHOPPER_TOKEN=${GH_TOKEN}"
log ""
log "Log servizi:"
log "  journalctl -u graphhopper -f"
log "  journalctl -u graphhopper-health -f"
log "============================================================"
