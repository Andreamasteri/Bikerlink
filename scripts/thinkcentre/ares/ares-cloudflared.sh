#!/usr/bin/env bash
# Step 8 — Ricrea il tunnel Cloudflare come servizio systemd su Ares-Linux.
# Stesso hostname e stesso ingress di prima: http://127.0.0.1:11434 con
# httpHostHeader: localhost (Ollama 0.24+ ritorna 403 se Host != localhost).
# Idempotente.
#
# Credenziali tunnel — fornisci UNO dei due:
#   ARES_CF_TUNNEL_TOKEN   token del tunnel (dashboard Cloudflare → Tunnels → token)
#                          → installazione "token-based", nessun file di config.
#   oppure file credenziali già presenti:
#     ARES_CF_TUNNEL_ID    UUID del tunnel
#     ARES_CF_HOSTNAME     es. ollama.biker-link.net
#     /etc/cloudflared/<ARES_CF_TUNNEL_ID>.json  (credenziali copiate a mano)
set -euo pipefail

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "==> Installo cloudflared (repo ufficiale Cloudflare)"
  mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
    | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
    > /etc/apt/sources.list.d/cloudflared.list
  apt-get update -y && apt-get install -y cloudflared
fi

if [[ -n "${ARES_CF_TUNNEL_TOKEN:-}" ]]; then
  echo "==> Installazione token-based del servizio"
  cloudflared service uninstall 2>/dev/null || true
  cloudflared service install "$ARES_CF_TUNNEL_TOKEN"
  systemctl enable --now cloudflared
else
  : "${ARES_CF_TUNNEL_ID:?serve ARES_CF_TUNNEL_ID o ARES_CF_TUNNEL_TOKEN}"
  : "${ARES_CF_HOSTNAME:?serve ARES_CF_HOSTNAME (es. ollama.biker-link.net)}"
  CREDS="/etc/cloudflared/${ARES_CF_TUNNEL_ID}.json"
  [[ -f "$CREDS" ]] || { echo "ERRORE: credenziali mancanti in $CREDS"; exit 1; }
  install -d -m 755 /etc/cloudflared
  cat > /etc/cloudflared/config.yml <<EOF
tunnel: ${ARES_CF_TUNNEL_ID}
credentials-file: ${CREDS}
ingress:
  - hostname: ${ARES_CF_HOSTNAME}
    service: http://127.0.0.1:11434
    originRequest:
      httpHostHeader: localhost
  - service: http_status:404
EOF
  cloudflared service install 2>/dev/null || true
  systemctl enable --now cloudflared
fi

sleep 3
echo "==> Stato cloudflared"
systemctl is-active cloudflared && echo "tunnel ATTIVO" || { echo "tunnel KO"; journalctl -u cloudflared -n 20 --no-pager; exit 1; }
