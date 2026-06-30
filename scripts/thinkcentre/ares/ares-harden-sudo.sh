#!/usr/bin/env bash
# Fine migrazione — restringe il sudo NOPASSWD concesso da ares-bootstrap.sh.
# Lascia all'agente solo i comandi operativi che servono a regime (gestione
# servizi + lettura stato), togliendo il "NOPASSWD:ALL" da setup.
# Idempotente.
set -euo pipefail
AGENT_USER="ares-agent"
F=/etc/sudoers.d/90-ares-agent

cat > "$F" <<EOF
# Ares-agent — privilegi a regime (post-migrazione). Solo operatività servizi.
$AGENT_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart ollama, \\
  /usr/bin/systemctl start ollama, /usr/bin/systemctl stop ollama, \\
  /usr/bin/systemctl status ollama, /usr/bin/systemctl restart cloudflared, \\
  /usr/bin/systemctl status cloudflared, /usr/bin/systemctl restart ares-wol.service, \\
  /usr/sbin/ethtool, /usr/bin/journalctl
EOF
chmod 440 "$F"
visudo -cf "$F"
echo "OK: sudo ristretto. Verifica:  sudo -l -U $AGENT_USER"
