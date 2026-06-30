#!/usr/bin/env bash
# fix-ip-nginx.sh — Diagnostica rete + imposta IP statico 192.168.1.35 + riallinea nginx
#
# Perché: nginx ascolta su "listen 192.168.1.35:443". Se il router via DHCP assegna
# al ThinkCentre un IP LAN diverso, nginx non riesce più a fare bind → porta 443
# "Connection refused" dall'esterno (DuckDNS resta corretto, l'IP pubblico non cambia).
# Questo script rende l'IP fisso a .35 così il problema non si ripresenta.
#
# Uso:  sudo ./fix-ip-nginx.sh            (diagnostica + applica IP statico + restart nginx)
#       sudo ./fix-ip-nginx.sh --diag     (solo diagnostica, NESSUNA modifica)
#
# ⚠️  Se sei collegato in SSH all'IP ATTUALE (diverso da .35), applicando l'IP statico
#     la sessione cadrà: riconnettiti a 192.168.1.35. Meglio eseguire da console fisica
#     o sapendo che dovrai riaprire l'SSH verso .35.

set -uo pipefail

STATIC_IP="192.168.1.35"
PREFIX="24"
NETPLAN_FILE="/etc/netplan/99-bikerlink-static.yaml"

ok()   { echo "[OK]   $1"; }
warn() { echo "[WARN] $1"; }
fail() { echo "[FAIL] $1"; }
info() { echo "[INFO] $1"; }

DIAG_ONLY=0
[ "${1:-}" = "--diag" ] && DIAG_ONLY=1

if [ "$EUID" -ne 0 ] && [ "$DIAG_ONLY" -eq 0 ]; then
  fail "Devi eseguire con sudo:  sudo ./fix-ip-nginx.sh"
  exit 1
fi

echo "============================================================"
echo "  BikerLink ThinkCentre — Fix IP statico + nginx"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"
echo ""

# ── 1. DIAGNOSTICA RETE ──────────────────────────────────────────────────────
echo "--- 1. Stato rete attuale ---"

# Interfaccia con la default route (quella fisica usata per uscire)
IFACE=$(ip -4 route show default 2>/dev/null | awk '/default/{print $5; exit}')
GW=$(ip -4 route show default 2>/dev/null | awk '/default/{print $3; exit}')
CUR_IP=$(ip -4 -o addr show "${IFACE:-x}" 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1)

if [ -z "$IFACE" ]; then
  fail "Nessuna interfaccia con default route trovata. Rete giù?"
  ip -4 -o addr show
  exit 1
fi

info "Interfaccia primaria : $IFACE"
info "IP LAN attuale       : ${CUR_IP:-(nessuno)}"
info "Gateway              : ${GW:-(sconosciuto)}"

if [ "$CUR_IP" = "$STATIC_IP" ]; then
  ok "L'IP LAN è già $STATIC_IP"
else
  warn "L'IP LAN ($CUR_IP) è DIVERSO da $STATIC_IP → ecco perché nginx non bindava"
fi
echo ""

# ── 2. STATO NGINX + PORTA 443 ───────────────────────────────────────────────
echo "--- 2. Stato nginx e porta 443 ---"
if command -v systemctl &>/dev/null; then
  NGINX_STATE=$(systemctl is-active nginx 2>/dev/null || echo "unknown")
  info "nginx systemd        : $NGINX_STATE"
fi
if command -v ss &>/dev/null; then
  LISTEN443=$(ss -tlnp 2>/dev/null | grep ':443 ' || true)
  if [ -n "$LISTEN443" ]; then
    ok "Qualcuno ascolta su 443:"
    echo "$LISTEN443"
  else
    warn "NESSUN listener su 443 (nginx non sta servendo)"
  fi
fi
echo ""

if [ "$DIAG_ONLY" -eq 1 ]; then
  info "Modalità --diag: nessuna modifica applicata. Esci."
  exit 0
fi

# ── 3. RILEVA BACKEND DI RETE (networkd vs NetworkManager) ───────────────────
echo "--- 3. Applico IP statico $STATIC_IP/$PREFIX su $IFACE ---"
RENDERER="networkd"
if systemctl is-active --quiet NetworkManager 2>/dev/null; then
  RENDERER="NetworkManager"
fi
info "Backend di rete rilevato: $RENDERER"

# Fallback DNS: gateway + Cloudflare + Google
DNS_LIST="${GW:-1.1.1.1}, 1.1.1.1, 8.8.8.8"

# ── 4. BACKUP NETPLAN ESISTENTE ──────────────────────────────────────────────
BACKUP_DIR="/root/netplan-backup-$(date +%Y%m%d-%H%M%S)"
if ls /etc/netplan/*.yaml &>/dev/null; then
  mkdir -p "$BACKUP_DIR"
  cp -a /etc/netplan/*.yaml "$BACKUP_DIR"/ 2>/dev/null
  ok "Backup config netplan esistenti in $BACKUP_DIR"
  # Disabilita eventuali config DHCP che entrerebbero in conflitto sulla stessa IFACE
  for f in /etc/netplan/*.yaml; do
    [ "$f" = "$NETPLAN_FILE" ] && continue
    if grep -q "$IFACE" "$f" 2>/dev/null; then
      mv "$f" "$f.disabled-by-bikerlink"
      warn "Disabilitato $f (conteneva config per $IFACE) → $f.disabled-by-bikerlink"
    fi
  done
fi

# ── 5. SCRIVI NETPLAN STATICO ────────────────────────────────────────────────
cat > "$NETPLAN_FILE" <<EOF
# Generato da fix-ip-nginx.sh — IP statico BikerLink ThinkCentre
network:
  version: 2
  renderer: $RENDERER
  ethernets:
    $IFACE:
      dhcp4: false
      dhcp6: false
      addresses:
        - $STATIC_IP/$PREFIX
      routes:
        - to: default
          via: ${GW:-192.168.1.1}
      nameservers:
        addresses: [${DNS_LIST}]
EOF
chmod 600 "$NETPLAN_FILE"
ok "Scritto $NETPLAN_FILE"
echo ""
cat "$NETPLAN_FILE"
echo ""

# ── 6. APPLICA ───────────────────────────────────────────────────────────────
echo "--- 6. netplan apply ---"
warn "Se sei in SSH sull'IP vecchio, la sessione cadrà: riconnettiti a $STATIC_IP"
netplan generate 2>&1 && info "netplan generate OK"
if netplan apply 2>&1; then
  ok "netplan apply eseguito"
else
  fail "netplan apply ha dato errore — ripristina da $BACKUP_DIR se necessario"
fi
sleep 3

# Verifica nuovo IP
NEW_IP=$(ip -4 -o addr show "$IFACE" 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1)
if [ "$NEW_IP" = "$STATIC_IP" ]; then
  ok "IP LAN ora = $STATIC_IP ✓"
else
  warn "IP LAN attuale = ${NEW_IP:-(nessuno)} (atteso $STATIC_IP). Controlla i log netplan."
fi
echo ""

# ── 7. RIAVVIA NGINX E VERIFICA 443 ──────────────────────────────────────────
echo "--- 7. Riavvio nginx ---"
if command -v nginx &>/dev/null; then
  if nginx -t 2>&1; then
    ok "nginx -t: config valida"
  else
    fail "nginx -t: config NON valida (vedi sopra). Non riavvio."
  fi
  systemctl restart nginx 2>&1 && ok "nginx riavviato" || fail "restart nginx fallito"
  sleep 2
  if ss -tlnp 2>/dev/null | grep -q ':443 '; then
    ok "nginx ora ascolta su 443 ✓"
    ss -tlnp 2>/dev/null | grep ':443 '
  else
    warn "nginx ancora NON in ascolto su 443 — controlla: journalctl -u nginx -n 50"
  fi
else
  warn "nginx non installato su questa macchina?"
fi
echo ""

# ── 8. TEST LOCALE HTTPS ─────────────────────────────────────────────────────
echo "--- 8. Test locale HTTPS ---"
if command -v curl &>/dev/null; then
  CODE=$(curl -skS -m 8 -o /dev/null -w "%{http_code}" "https://$STATIC_IP/" 2>/dev/null || echo "000")
  if [ "$CODE" != "000" ]; then
    ok "https://$STATIC_IP/ risponde (HTTP $CODE)"
  else
    warn "https://$STATIC_IP/ non risponde in locale — verifica nginx/servizi"
  fi
fi
echo ""

echo "============================================================"
echo "  FATTO."
echo "  • IP statico $STATIC_IP impostato (sopravvive ai reboot)"
echo "  • Consiglio extra: imposta anche una DHCP reservation sul router"
echo "    (MAC del ThinkCentre → $STATIC_IP) come doppia sicurezza."
echo "  • Backup netplan: ${BACKUP_DIR:-(nessuno)}"
echo "  • Da Replit, le probe ThinkCentre torneranno verdi entro ~1 min."
echo "============================================================"
