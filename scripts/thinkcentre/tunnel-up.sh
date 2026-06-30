#!/usr/bin/env bash
# Riavvia il tunnel cloudflared — unica via di esposizione del ThinkCentre.
# DuckDNS è stato rimosso il 29 Giugno 2026 (migrazione a Cloudflare Tunnel su *.biker-link.net).
sudo systemctl restart cloudflared
sleep 3
systemctl is-active cloudflared && echo "tunnel OK" || echo "tunnel FAIL"
