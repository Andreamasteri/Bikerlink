#!/usr/bin/env bash
# Step 9 — Wake-on-LAN persistente su Ares-Linux.
# Attiva `wol g` sulla NIC e lo rende persistente con una systemd unit (vale sia
# con NetworkManager sia con netplan/systemd-networkd). Idempotente.
# NB: il MAC NON cambia con la migrazione → wake-ares.sh continua a funzionare.
#
#   ARES_WOL_IFACE  interfaccia (default: quella della route di default)
set -euo pipefail
IFACE="${ARES_WOL_IFACE:-$(ip route show default | awk '{print $5; exit}')}"
[[ -n "$IFACE" ]] || { echo "ERRORE: interfaccia non rilevata (passa ARES_WOL_IFACE)"; exit 1; }

command -v ethtool >/dev/null 2>&1 || { apt-get update -y && apt-get install -y ethtool; }

echo "==> Attivo WoL ora su $IFACE"
ethtool -s "$IFACE" wol g || echo "(la NIC potrebbe non supportare 'g'; verifica sotto)"

echo "==> systemd unit per riapplicarlo a ogni boot"
cat > /etc/systemd/system/ares-wol.service <<EOF
[Unit]
Description=Abilita Wake-on-LAN su $IFACE (Ares)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/sbin/ethtool -s $IFACE wol g
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now ares-wol.service

echo "==> Stato finale"
echo -n "MAC $IFACE: "; cat "/sys/class/net/$IFACE/address"
ethtool "$IFACE" | awk '/Wake-on:/{print "Wake-on: "$2"  (g = attivo)"}'
echo
echo "NB: WoL su scheda WiFi richiede stato Sleep/Standby (non Shutdown completo)."
