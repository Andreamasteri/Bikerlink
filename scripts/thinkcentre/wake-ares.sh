#!/usr/bin/env bash
# Sveglia Ares (PC Windows fisso, Ollama diagnostica) via Wake-on-WLAN.
# Eseguito SUL ThinkCentre (stessa LAN di Ares). Non richiede wakeonlan/etherwake:
# costruisce e invia il magic packet con python3 puro (già presente sul box).
#
# Uso: bash scripts/thinkcentre/wake-ares.sh
# Da Replit: python3 .agents/skills/thinkcentre-access/tc.py exec "bash -s" < scripts/thinkcentre/wake-ares.sh
set -euo pipefail

ARES_MAC="A8:E2:91:2C:90:6A"
BROADCAST="192.168.1.255"

python3 -c "
import socket
mac='${ARES_MAC}'
mac_bytes=bytes.fromhex(mac.replace(':',''))
packet=b'\xff'*6 + mac_bytes*16
s=socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
for port in (7,9):
    s.sendto(packet, ('${BROADCAST}', port))
print('Magic packet inviato a', mac, 'su ${BROADCAST}:7 e :9')
"
