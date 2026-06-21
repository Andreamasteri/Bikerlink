#!/usr/bin/env bash
# Stato rapido ThinkCentre
echo "=== IP PUBBLICO ===" && curl -s --max-time 4 ifconfig.me && echo ""
echo "=== CLOUDFLARED ===" && systemctl is-active cloudflared
echo "=== DOCKER ===" && docker ps -a --format "{{.Names}}  {{.Status}}"
