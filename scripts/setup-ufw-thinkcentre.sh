#!/usr/bin/env bash
# =============================================================================
# BikerLink — Configurazione ufw sul ThinkCentre (192.168.1.35, Ubuntu)
#
# Esegui come root:
#   sudo bash scripts/setup-ufw-thinkcentre.sh [--mode tunnel|dns-proxy] [--ssh-port PORT]
#
# Modalità Cloudflare (obbligatoria dopo installazione Cloudflare):
#   --mode tunnel      Cloudflare Tunnel: NESSUNA porta 80/443 aperta verso
#                      internet; cloudflared è un daemon outbound. (RACCOMANDATO)
#   --mode dns-proxy   DNS proxy standard: 80/443 aperte solo agli IP Cloudflare.
#
# Default (nessun --mode): apre 80/443 a tutti — solo per test iniziale
# PRIMA di configurare Cloudflare.
#
# Porta SSH:
#   --ssh-port 2222    porta post-hardening (default — setup-ssh-hardening-thinkcentre.sh)
#   --ssh-port 22      solo se l'hardening SSH non è ancora stato applicato
#
# Idempotente: può essere rieseguito senza danni.
#
# Porta mappa:
#   nginx           80, 443   → dipende da --mode (vedi sopra)
#   SSH             22|2222   → solo LAN 192.168.1.0/24 + rate limit
#   Tailscale       —         → allow in on tailscale0 (interfaccia intera)
#   GraphHopper     8990-8996 → solo LAN 192.168.1.0/24
#   Valhalla        8002      → solo LAN 192.168.1.0/24
#   Nominatim       8080      → solo LAN 192.168.1.0/24
#   Ollama          11434     → solo LAN 192.168.1.0/24
#   Whisper         9000      → solo LAN 192.168.1.0/24
#   ufw-status      9099      → solo localhost (health endpoint admin)
#   PostgreSQL      5432      → solo localhost (mai LAN/internet)
#   # Uptime Kuma   3001      → commentato — abilitare quando installato
#   Redis TLS       6380      → internet (nginx stream proxy, setup-redis-nginx-stream.sh)
#   Redis raw       6379      → solo localhost
# =============================================================================

set -euo pipefail

LAN="192.168.1.0/24"
LOCALHOST="127.0.0.1"
CLOUDFLARE_MODE=""   # tunnel | dns-proxy | "" (aperto — solo pre-Cloudflare)
SSH_PORT=2222        # porta post-hardening (setup-ssh-hardening-thinkcentre.sh)

# ── Parsing argomenti ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      CLOUDFLARE_MODE="$2"
      shift 2
      ;;
    --ssh-port)
      SSH_PORT="$2"
      shift 2
      ;;
    *)
      echo "ERRORE: argomento sconosciuto: $1" >&2
      echo "Uso: sudo bash $0 [--mode tunnel|dns-proxy] [--ssh-port PORT]" >&2
      exit 1
      ;;
  esac
done

# Valida --mode
if [[ -n "${CLOUDFLARE_MODE}" && "${CLOUDFLARE_MODE}" != "tunnel" && "${CLOUDFLARE_MODE}" != "dns-proxy" ]]; then
  echo "ERRORE: --mode deve essere 'tunnel' o 'dns-proxy'" >&2
  exit 1
fi

echo "=== BikerLink ufw setup ThinkCentre ==="
echo "LAN: ${LAN}"
echo "Modalità Cloudflare: ${CLOUDFLARE_MODE:-'nessuna (aperto — solo pre-Cloudflare)'}"
echo "Porta SSH: ${SSH_PORT}"
echo ""

# ── Prerequisiti ──────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "ERRORE: eseguire come root (sudo)." >&2
  exit 1
fi

if ! command -v ufw &>/dev/null; then
  echo "ufw non trovato — installazione..."
  apt-get update -q && apt-get install -y ufw
fi

# ── Reset + policy di default ─────────────────────────────────────────────────
echo "→ Reset regole esistenti..."
ufw --force reset

echo "→ Policy default: nega tutto in ingresso, consenti tutto in uscita..."
ufw default deny incoming
ufw default allow outgoing

# ── Tailscale (interfaccia intera) ────────────────────────────────────────────
echo "→ Tailscale: allow in on tailscale0..."
ufw allow in on tailscale0

# ── Loopback ──────────────────────────────────────────────────────────────────
echo "→ Loopback: allow in on lo..."
ufw allow in on lo

# ── nginx: 80 e 443 — dipende dalla modalità Cloudflare ───────────────────────
if [[ "${CLOUDFLARE_MODE}" == "tunnel" ]]; then
  # Cloudflare Tunnel: cloudflared parla con nginx via loopback.
  # Il loopback è già aperto sopra (allow in on lo).
  # Nessuna porta 80/443 da aprire verso internet.
  echo "→ nginx 80/443 — Cloudflare Tunnel: nessuna apertura internet (loopback già aperto)"

elif [[ "${CLOUDFLARE_MODE}" == "dns-proxy" ]]; then
  # DNS proxy standard: accetta 80/443 solo dagli IP Cloudflare.
  # Lista aggiornata: https://www.cloudflare.com/ips-v4
  echo "→ nginx 80/443 — solo IP Cloudflare (DNS proxy mode)..."
  for cf_ip in \
    173.245.48.0/20 \
    103.21.244.0/22 \
    103.22.200.0/22 \
    103.31.4.0/22 \
    141.101.64.0/18 \
    108.162.192.0/18 \
    190.93.240.0/20 \
    188.114.96.0/20 \
    197.234.240.0/22 \
    198.41.128.0/17 \
    162.158.0.0/15 \
    104.16.0.0/13 \
    104.24.0.0/14 \
    172.64.0.0/13 \
    131.0.72.0/22; do
      ufw allow from "${cf_ip}" to any port 80 proto tcp
      ufw allow from "${cf_ip}" to any port 443 proto tcp
  done
  echo "   → Aggiornare trimestralmente da https://www.cloudflare.com/ips-v4"

else
  # Modalità legacy/pre-Cloudflare: apre 80/443 a tutti.
  # Usare solo per test iniziali PRIMA di configurare Cloudflare.
  echo "→ nginx 80/tcp (HTTP) — internet (modalità pre-Cloudflare)..."
  ufw allow 80/tcp
  echo "→ nginx 443/tcp (HTTPS) — internet (modalità pre-Cloudflare)..."
  ufw allow 443/tcp
  echo "   ⚠️  Passare a --mode tunnel o --mode dns-proxy dopo aver configurato Cloudflare."
fi

# ── SSH: solo LAN + rate limit ────────────────────────────────────────────────
# ufw limit from <src> applica rate limiting (≥6 connessioni in 30s → DROP)
# SOLO alle sorgenti che corrispondono alla regola LAN.
# La policy "default deny incoming" blocca il resto senza regole aggiuntive.
echo "→ SSH ${SSH_PORT}/tcp — solo LAN ${LAN} + rate limit (max 6 conn/30s)..."
ufw limit from "${LAN}" to any port "${SSH_PORT}" proto tcp

# ── Valhalla: solo LAN ────────────────────────────────────────────────────────
echo "→ Valhalla 8002/tcp — solo LAN..."
ufw allow from "${LAN}" to any port 8002 proto tcp

# ── Nominatim: solo LAN ───────────────────────────────────────────────────────
echo "→ Nominatim 8080/tcp — solo LAN..."
ufw allow from "${LAN}" to any port 8080 proto tcp

# ── GraphHopper aree (8990-8997): solo LAN ───────────────────────────────────
# Porte da shared/routing-areas.ts campo portaInterna:
#   grecia=8990  balcani=8991  est=8992  iberia=8993
#   arco-alpino=8994  germania-centro=8995  francia-benelux=8996  ecuador=8997
echo "→ GraphHopper 8990-8997/tcp — solo LAN..."
ufw allow from "${LAN}" to any port 8990:8997 proto tcp

# ── Ollama: solo LAN ──────────────────────────────────────────────────────────
echo "→ Ollama 11434/tcp — solo LAN..."
ufw allow from "${LAN}" to any port 11434 proto tcp

# ── Whisper: solo LAN ─────────────────────────────────────────────────────────
echo "→ Whisper 9000/tcp — solo LAN..."
ufw allow from "${LAN}" to any port 9000 proto tcp

# ── ufw-status health endpoint: solo localhost ────────────────────────────────
echo "→ ufw-status 9099/tcp — solo localhost..."
ufw allow from "${LOCALHOST}" to any port 9099 proto tcp

# ── PostgreSQL: solo localhost (mai LAN/internet) ─────────────────────────────
echo "→ PostgreSQL 5432/tcp — solo localhost..."
ufw allow from "${LOCALHOST}" to any port 5432 proto tcp

# ── Redis: solo localhost (mai LAN/internet) ─────────────────────────────────
# La porta pubblica 6380 (nginx stream proxy raggiungibile via DuckDNS) è stata
# RIMOSSA il 29 Giugno 2026: nginx è disattivato e l'esposizione passa solo da
# Cloudflare Tunnel. Redis locale, se presente, resta accessibile da localhost.
ufw allow from "${LOCALHOST}" to any port 6379 proto tcp comment "Redis raw — solo localhost"

# ── Regole future (commentate) ────────────────────────────────────────────────
# Uptime Kuma — abilitare quando installato:
#   ufw allow from "${LAN}" to any port 3001 proto tcp

# ── Abilita al boot e attiva ──────────────────────────────────────────────────
echo "→ ufw enable (abilitato al boot)..."
ufw --force enable

echo ""
echo "=== Stato finale ==="
ufw status verbose

# ── ufw-status health daemon ──────────────────────────────────────────────────
# Piccolo daemon Python che espone lo stato ufw come JSON su localhost:9099.
# Usato dal pannello admin BikerLink per il badge firewall.
#
# Endpoint:  GET http://localhost:9099/
# Risposta:  { "status": "active"|"inactive", "ruleCount": <N> }

UFW_DAEMON_DIR="/opt/bikerlink"
UFW_DAEMON_SCRIPT="${UFW_DAEMON_DIR}/ufw-status-daemon.py"
UFW_SERVICE="/etc/systemd/system/bikerlink-ufw-status.service"

echo ""
echo "→ Installazione daemon ufw-status su localhost:9099..."
mkdir -p "${UFW_DAEMON_DIR}"

cat > "${UFW_DAEMON_SCRIPT}" << 'PYEOF'
#!/usr/bin/env python3
"""
BikerLink — ufw status health daemon
Ascolta su 127.0.0.1:9099 e risponde con lo stato ufw in JSON.

GET /          → { "status": "active"|"inactive", "ruleCount": <N> }
GET /health    → 200 OK (liveness probe nginx)
"""
import json
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer


def _ufw_status() -> dict:
    try:
        result = subprocess.run(
            ["ufw", "status"],
            capture_output=True, text=True, timeout=5
        )
        active = "Status: active" in result.stdout
        # Conta le righe di regola (esclude header e righe vuote)
        rule_lines = [
            l for l in result.stdout.splitlines()
            if l.strip()
            and not l.startswith("Status:")
            and not l.startswith("To ")
            and not l.startswith("--")
            and l.strip() != ""
        ]
        return {"status": "active" if active else "inactive", "ruleCount": len(rule_lines)}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)[:200]}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # Silenzia i log HTTP per non sporcare journald

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"OK")
            return
        if self.path == "/":
            data = _ufw_status()
            body = json.dumps(data).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 9099), Handler)
    print("ufw-status daemon in ascolto su 127.0.0.1:9099")
    server.serve_forever()
PYEOF

chmod +x "${UFW_DAEMON_SCRIPT}"

cat > "${UFW_SERVICE}" << 'SVCEOF'
[Unit]
Description=BikerLink ufw-status health daemon
After=network.target ufw.service
Requires=ufw.service

[Service]
Type=simple
ExecStart=/usr/bin/python3 /opt/bikerlink/ufw-status-daemon.py
Restart=always
RestartSec=5
User=root
StandardOutput=journal
StandardError=journal
SyslogIdentifier=bikerlink-ufw-status

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable bikerlink-ufw-status
systemctl restart bikerlink-ufw-status

echo "→ Daemon ufw-status avviato: $(systemctl is-active bikerlink-ufw-status)"
echo ""

# ── Aggiungi location nginx per /ufw-status (se nginx è installato) ───────────
NGINX_CONF_DIR="/etc/nginx/sites-available"
NGINX_BIKERLINK_CONF="${NGINX_CONF_DIR}/bikerlink-ufw-status.conf"

if command -v nginx &>/dev/null; then
  echo "→ Configurazione nginx snippet per /ufw-status..."
  cat > "${NGINX_BIKERLINK_CONF}" << 'NGINXEOF'
# BikerLink — location /ufw-status
# Aggiungere questo blocco location all'interno del server block principale
# di nginx-bikerlink.conf (dentro il server { ... } su porta 443).
#
# NOTA: questo snippet NON viene incluso automaticamente.
# Copiare manualmente il blocco location nel server block esistente.
#
#   location /ufw-status {
#       # Accessibile solo via Tailscale — sicurezza aggiuntiva a livello nginx
#       allow 100.64.0.0/10;   # range Tailscale
#       allow 192.168.1.0/24;  # LAN locale
#       deny all;
#       proxy_pass http://127.0.0.1:9099/;
#       proxy_set_header Host "localhost";
#       proxy_read_timeout 8s;
#       proxy_connect_timeout 4s;
#   }
NGINXEOF
  echo "   → Snippet salvato in: ${NGINX_BIKERLINK_CONF}"
  echo "   ⚠️  Aggiungere manualmente il blocco location al server block nginx principale."
fi

echo ""
echo "=== Setup completato ==="
echo ""
echo "Verifica stato:"
echo "  sudo ufw status verbose"
echo "  curl -s http://localhost:9099/"
echo "  systemctl status bikerlink-ufw-status"
echo ""
echo "Per aggiungere porte future (es. Uptime Kuma 3001):"
echo "  Decommentare le righe corrispondenti in questo script e rieseguirlo."
echo "  Oppure: sudo ufw allow from 192.168.1.0/24 to any port 3001 proto tcp"
echo ""
echo "Per configurare il pannello admin BikerLink:"
echo "  Aggiungere in Replit Secrets:  UFW_STATUS_URL=https://<host-thinkcentre>/ufw-status"
echo "  Il pannello mostrerà il badge ufw nella card Server di casa."
