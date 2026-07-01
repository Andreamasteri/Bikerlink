#!/usr/bin/env bash
# =============================================================================
# BikerLink — expose/setup-wifi-usb.sh
# Configura l'adattatore WiFi USB sul ThinkCentre con IP statico 192.168.1.36
# tramite NetworkManager (nmcli), in modo che i servizi (esposti via Cloudflare
# Tunnel) siano raggiungibili anche quando il disco viene spostato su un PC senza
# NIC cablata.
#
# Prerequisiti:
#   - NetworkManager installato e attivo (systemctl is-active NetworkManager)
#   - Adattatore WiFi USB collegato (interfaccia wlan0 o wlxXXXXXXXXXXXX)
#   - Credenziali WiFi di casa disponibili
#
# Uso:
#   sudo ./setup-wifi-usb.sh
#   WIFI_SSID="NomRete" WIFI_PASSWORD="password" WIFI_IFACE="wlan0" sudo -E ./setup-wifi-usb.sh
#
# Variabili d'ambiente (override):
#   WIFI_SSID       SSID della rete WiFi (richiesto se non già connesso)
#   WIFI_PASSWORD   Password WPA2 (richiesto se non già connesso)
#   WIFI_IFACE      Interfaccia WiFi USB (default: auto-rilevata)
#   WIFI_IP         IP statico da assegnare (default: 192.168.1.36)
#   WIFI_GATEWAY    Gateway LAN             (default: 192.168.1.1)
#   WIFI_DNS        DNS primario            (default: 8.8.8.8)
#   CONN_NAME       Nome profilo NM         (default: BikerLink-WiFi)
#   DRY_RUN=1       Mostra i comandi senza eseguirli
# =============================================================================
set -euo pipefail

# ── Colori/helper ─────────────────────────────────────────────────────────────
bold()    { echo -e "\033[1m$*\033[0m"; }
ok()      { echo -e "  \033[32m✓\033[0m $*"; }
warn()    { echo -e "  \033[33m!\033[0m $*"; }
info()    { echo -e "  \033[36m→\033[0m $*"; }
die()     { echo -e "\033[31m✗ ERRORE:\033[0m $*" >&2; exit 1; }
section() { echo; bold "━━━ $* ━━━"; }

DRY_RUN="${DRY_RUN:-0}"
run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "  [DRY_RUN] $*"
  else
    "$@"
  fi
}

# ── Verifica root ─────────────────────────────────────────────────────────────
if [[ "$EUID" -ne 0 ]]; then
  die "Esegui come root: sudo $0"
fi

# ── Parametri ─────────────────────────────────────────────────────────────────
WIFI_IP="${WIFI_IP:-192.168.1.36}"
WIFI_GATEWAY="${WIFI_GATEWAY:-192.168.1.1}"
WIFI_DNS="${WIFI_DNS:-8.8.8.8}"
CONN_NAME="${CONN_NAME:-BikerLink-WiFi}"

section "1/5 — Verifica dipendenze"
command -v nmcli  >/dev/null 2>&1 || die "nmcli non trovato. Installa NetworkManager: apt install network-manager"
command -v ip     >/dev/null 2>&1 || die "ip non trovato. Installa iproute2."
ok "nmcli e ip disponibili"

if ! systemctl is-active --quiet NetworkManager 2>/dev/null; then
  warn "NetworkManager non attivo — avvio..."
  run systemctl enable --now NetworkManager
fi
ok "NetworkManager attivo"

# ── Rilevamento interfaccia WiFi ───────────────────────────────────────────────
section "2/5 — Rilevamento adattatore WiFi USB"

detect_wifi_iface() {
  # Cerca la prima interfaccia wireless (wlan* o wlx*) che non sia 'lo'
  local iface
  for iface in $(ip link show | awk -F': ' '/^[0-9]+:/{print $2}' | tr -d '@' | cut -d' ' -f1); do
    if [[ "$iface" =~ ^(wlan|wlx|wlp) ]]; then
      echo "$iface"
      return 0
    fi
  done
  # Fallback: cerca via /sys/class/net
  for iface in /sys/class/net/*/; do
    iface="$(basename "$iface")"
    if [[ -d "/sys/class/net/${iface}/wireless" ]]; then
      echo "$iface"
      return 0
    fi
  done
  return 1
}

if [[ -n "${WIFI_IFACE:-}" ]]; then
  info "Interfaccia fornita via env: $WIFI_IFACE"
  ip link show "$WIFI_IFACE" >/dev/null 2>&1 || die "Interfaccia $WIFI_IFACE non trovata (lsusb e ip link show per verificare)"
else
  WIFI_IFACE="$(detect_wifi_iface 2>/dev/null || true)"
  if [[ -z "$WIFI_IFACE" ]]; then
    echo
    warn "Nessuna interfaccia WiFi rilevata automaticamente."
    warn "Interfacce disponibili:"
    ip link show | awk -F': ' '/^[0-9]+:/{print "    " $2}' | tr -d '@'
    die "Imposta WIFI_IFACE=<interfaccia> e riesegui (es: WIFI_IFACE=wlan0 sudo -E $0)"
  fi
fi

info "Interfaccia WiFi: $WIFI_IFACE"

# Verifica driver: l'interfaccia deve avere la cartella wireless in /sys
if [[ ! -d "/sys/class/net/${WIFI_IFACE}/wireless" ]]; then
  warn "L'interfaccia $WIFI_IFACE non sembra essere wireless — verifica con: lsusb && lsmod"
  warn "Procedo comunque con la configurazione."
fi

# Mostra chipset USB se rilevabile
USB_ID=""
if command -v lsusb >/dev/null 2>&1; then
  # Legge l'idVendor:idProduct dal sysfs e cerca in lsusb
  SYS_NET="/sys/class/net/${WIFI_IFACE}"
  if [[ -d "${SYS_NET}/device" ]]; then
    DEV_PATH="$(readlink -f "${SYS_NET}/device" 2>/dev/null || true)"
    if [[ -n "$DEV_PATH" ]]; then
      IDVENDOR="$(cat "${DEV_PATH}/../idVendor" 2>/dev/null || true)"
      IDPRODUCT="$(cat "${DEV_PATH}/../idProduct" 2>/dev/null || true)"
      if [[ -n "$IDVENDOR" && -n "$IDPRODUCT" ]]; then
        USB_ID="${IDVENDOR}:${IDPRODUCT}"
        USB_DESC="$(lsusb | grep -i "${IDVENDOR}:${IDPRODUCT}" | head -1 || true)"
        info "Chipset USB rilevato: ${USB_ID} ${USB_DESC}"
      fi
    fi
  fi
fi

# ── Credenziali WiFi ───────────────────────────────────────────────────────────
section "3/5 — Credenziali WiFi"

if [[ -z "${WIFI_SSID:-}" ]]; then
  read -r -p "  SSID della rete WiFi di casa: " WIFI_SSID
fi
[[ -n "$WIFI_SSID" ]] || die "SSID obbligatorio."

if [[ -z "${WIFI_PASSWORD:-}" ]]; then
  read -r -s -p "  Password WPA2: " WIFI_PASSWORD
  echo
fi
[[ -n "$WIFI_PASSWORD" ]] || die "Password obbligatoria."

ok "SSID: $WIFI_SSID"
info "IP statico: $WIFI_IP/24  gateway: $WIFI_GATEWAY  dns: $WIFI_DNS"
info "Profilo NM: $CONN_NAME"

# ── Configurazione NetworkManager ──────────────────────────────────────────────
section "4/5 — Creazione profilo NetworkManager"

# Rimuovi profilo precedente con lo stesso nome (se esiste) per evitare duplicati
if nmcli connection show "$CONN_NAME" >/dev/null 2>&1; then
  warn "Profilo '$CONN_NAME' già esistente — rimozione e ricreazione."
  run nmcli connection delete "$CONN_NAME"
fi

# Crea il profilo WiFi con IP statico e autoconnect
run nmcli connection add \
  type wifi \
  ifname "$WIFI_IFACE" \
  con-name "$CONN_NAME" \
  ssid "$WIFI_SSID" \
  -- \
  wifi-sec.key-mgmt wpa-psk \
  wifi-sec.psk "$WIFI_PASSWORD" \
  ipv4.method manual \
  ipv4.addresses "${WIFI_IP}/24" \
  ipv4.gateway "$WIFI_GATEWAY" \
  ipv4.dns "$WIFI_DNS" \
  ipv4.ignore-auto-dns yes \
  ipv4.route-metric 200 \
  connection.autoconnect yes \
  connection.autoconnect-priority 10

ok "Profilo '$CONN_NAME' creato con autoconnect."
info "route-metric=200: la rotta WiFi è subordinata alla eth (100) se entrambe attive."

# Attiva la connessione
info "Attivazione connessione WiFi..."
if [[ "$DRY_RUN" == "1" ]]; then
  echo "  [DRY_RUN] nmcli connection up '$CONN_NAME'"
else
  if nmcli connection up "$CONN_NAME"; then
    ok "Connessione '$CONN_NAME' attivata."
  else
    warn "Impossibile attivare adesso (forse l'adattatore non è collegato o la rete non è in range)."
    warn "Al prossimo boot con adattatore in range, il profilo si auto-connetterà."
  fi
fi

# ── Verifica finale ────────────────────────────────────────────────────────────
section "5/5 — Verifica configurazione"

if [[ "$DRY_RUN" != "1" ]]; then
  # Attendi 3 secondi per la negoziazione DHCP/IP
  sleep 3

  CURRENT_IP="$(ip addr show "$WIFI_IFACE" 2>/dev/null | awk '/inet /{print $2}' | head -1 || true)"
  if [[ "$CURRENT_IP" == "${WIFI_IP}/24" ]]; then
    ok "IP $WIFI_IP assegnato correttamente su $WIFI_IFACE"
  elif [[ -n "$CURRENT_IP" ]]; then
    warn "IP assegnato ($CURRENT_IP) diverso da ${WIFI_IP}/24 — verifica il profilo NM."
    warn "Potrebbe esserci un conflitto IP sulla LAN. Controlla con: nmcli connection show '$CONN_NAME'"
  else
    warn "IP non ancora assegnato su $WIFI_IFACE — la connessione potrebbe essere in corso."
    info "Verifica con: ip addr show $WIFI_IFACE"
  fi
else
  info "[DRY_RUN] Salto verifica IP."
fi

# Mostra stato profilo NM
if [[ "$DRY_RUN" != "1" ]]; then
  echo
  info "Stato interfaccia:"
  ip addr show "$WIFI_IFACE" 2>/dev/null || true
  echo
  info "Profilo NM creato:"
  nmcli connection show "$CONN_NAME" | grep -E "(connection\.(id|type|autoconnect)|ipv4\.(method|addresses|gateway|dns|route-metric))" || true
fi

cat <<'EOF'

━━━ Operazioni manuali post-setup ━━━

  # 1. Verifica che nginx risponda sull'IP WiFi (eseguire sul TC):
  curl -sk --resolve "gh.biker-link.net:443:192.168.1.36" \
    https://gh.biker-link.net/areas/grecia/health || true

  # 2. Test post-reboot — verifica autoconnect dopo riavvio:
  sudo reboot
  # dopo il boot:
  ip addr show  # deve mostrare 192.168.1.36 su wlan*/wlx*
  systemctl status NetworkManager

  # 3. Verifica che nginx sia in ascolto su 192.168.1.36:443:
  sudo ss -tlnp | grep :443
  # output atteso: *:443 (o le righe 192.168.1.35:443 e 192.168.1.36:443)

  # 4. Esposizione pubblica (nessuna modifica necessaria):
  #    Cloudflare Tunnel (cloudflared) usa una connessione outbound verso Cloudflare,
  #    indipendente dalla NIC e dall'IP pubblico del router.
  #    Verifica con: sudo systemctl status cloudflared

  # 5. Aggiorna il config nginx sul TC per allineare al template del repo:
  #    (setup-expose.sh genera il config con entrambi i listen)
  sudo cp /path/to/generated/nginx-bikerlink.conf /etc/nginx/sites-available/bikerlink
  sudo nginx -t && sudo systemctl reload nginx

EOF

ok "Setup WiFi USB completato."
