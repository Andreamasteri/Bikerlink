#!/usr/bin/env bash
# Riavvia tunnel cloudflared e aggiorna DuckDNS
sudo systemctl restart cloudflared
sleep 3
systemctl is-active cloudflared && echo "tunnel OK" || echo "tunnel FAIL"
curl -s "https://www.duckdns.org/update?domains=bikerlink&token=${DUCKDNS_TOKEN}&ip=" && echo ""
