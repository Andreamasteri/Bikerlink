#!/usr/bin/env bash
# =============================================================================
# BikerLink — Oracle ARM Poller: Script di installazione
# install.sh — Installa OCI CLI, copia lo script e registra il servizio systemd
#
# UTILIZZO (sul ThinkCentre, come utente normale — NON root):
#   bash install.sh
#
# Lo script usa sudo solo dove necessario (copia file in /usr/local/bin,
# installazione logrotate, creazione /var/log/oracle-poller.log).
# Il servizio systemd viene registrato come user service (~/.config/systemd/user/).
# =============================================================================

set -euo pipefail

# ── Colori ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ok()      { echo -e "${GREEN}✓${NC} $*"; }
info()    { echo -e "${BLUE}→${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
fail()    { echo -e "${RED}✗ ERRORE:${NC} $*" >&2; exit 1; }
section() { echo -e "\n${BOLD}══ $* ══${NC}"; }

# ── Prerequisiti ──────────────────────────────────────────────────────────────
if [[ $EUID -eq 0 ]]; then
    fail "Esegui come utente normale (NON root). Lo script usa sudo internamente dove serve."
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT_USER="$(whoami)"
CONF_FILE="${HOME}/.oci/poller.conf"
LOG_FILE="/var/log/oracle-poller.log"
SERVICE_NAME="oracle-poller"
SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"

# ── 1. OCI CLI ────────────────────────────────────────────────────────────────
section "1/5 — OCI CLI"

if command -v oci &>/dev/null; then
    OCI_VER=$(oci --version 2>/dev/null || echo "sconosciuta")
    ok "OCI CLI già installato (versione: $OCI_VER)"
else
    info "OCI CLI non trovato. Installazione tramite installer ufficiale Oracle..."
    info "Scaricamento installer (può impiegare 1-2 minuti)..."

    TMP_INSTALLER=$(mktemp /tmp/oci-install-XXXXXX.sh)
    curl -fsSL https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh \
        -o "$TMP_INSTALLER"
    chmod +x "$TMP_INSTALLER"

    # Installazione non interattiva in ~/.local/lib/oracle-cli
    bash "$TMP_INSTALLER" \
        --accept-all-defaults \
        --install-dir "${HOME}/.local/lib/oracle-cli" \
        --exec-dir    "${HOME}/.local/bin" \
        --script-dir  "${HOME}/.local/bin/oci-cli-scripts" \
        2>&1 | tail -5

    rm -f "$TMP_INSTALLER"

    # Aggiungi ~/.local/bin al PATH se non è già presente
    if ! echo "$PATH" | grep -q "${HOME}/.local/bin"; then
        warn "Aggiungi questa riga al tuo ~/.bashrc o ~/.zshrc:"
        warn "  export PATH=\"\${HOME}/.local/bin:\${PATH}\""
        export PATH="${HOME}/.local/bin:${PATH}"
    fi

    if command -v oci &>/dev/null; then
        ok "OCI CLI installato: $(oci --version 2>/dev/null)"
    else
        fail "Installazione OCI CLI fallita. Controlla la connessione e riprova."
    fi

    echo ""
    warn "PROSSIMO PASSO: configura OCI CLI con:"
    warn "  oci setup config"
    warn "Segui le istruzioni del README per trovare i valori richiesti."
fi

# ── 2. Script principale ──────────────────────────────────────────────────────
section "2/5 — Script oracle-poller.sh"

POLLER_SCRIPT="${SCRIPT_DIR}/oracle-poller.sh"
if [[ ! -f "$POLLER_SCRIPT" ]]; then
    fail "File non trovato: $POLLER_SCRIPT — esegui install.sh dalla directory scripts/oracle-poller/"
fi

info "Copia oracle-poller.sh in /usr/local/bin/ ..."
sudo cp "$POLLER_SCRIPT" /usr/local/bin/oracle-poller.sh
sudo chmod 755 /usr/local/bin/oracle-poller.sh
ok "oracle-poller.sh installato in /usr/local/bin/"

# ── 3. File di log + logrotate ────────────────────────────────────────────────
section "3/5 — Log e logrotate"

info "Creazione file di log: $LOG_FILE ..."
sudo touch "$LOG_FILE"
sudo chmod 644 "$LOG_FILE"
# Permetti all'utente corrente di scrivere nel log senza sudo
sudo chown "${CURRENT_USER}:${CURRENT_USER}" "$LOG_FILE" 2>/dev/null \
    || sudo chmod 666 "$LOG_FILE"
ok "File di log pronto: $LOG_FILE"

LOGROTATE_SRC="${SCRIPT_DIR}/logrotate.conf"
if [[ -f "$LOGROTATE_SRC" ]]; then
    info "Installazione configurazione logrotate (owner: ${CURRENT_USER})..."
    # Sostituisce il placeholder __POLLER_USER__ con l'utente reale in modo che
    # logrotate ricrei il file di log con il proprietario corretto dopo ogni
    # rotazione, mantenendo i permessi di scrittura per il servizio non-root.
    sed "s/__POLLER_USER__/${CURRENT_USER}/g" "$LOGROTATE_SRC" \
        | sudo tee /etc/logrotate.d/oracle-poller >/dev/null
    sudo chmod 644 /etc/logrotate.d/oracle-poller
    ok "logrotate configurato: /etc/logrotate.d/oracle-poller (weekly, 4 rotazioni, owner: ${CURRENT_USER})"
else
    warn "logrotate.conf non trovato — saltato (log non verrà ruotato automaticamente)"
fi

# ── 4. Servizio systemd user ──────────────────────────────────────────────────
section "4/5 — Servizio systemd (user unit)"

SERVICE_SRC="${SCRIPT_DIR}/oracle-poller.service"
if [[ ! -f "$SERVICE_SRC" ]]; then
    fail "File non trovato: $SERVICE_SRC"
fi

mkdir -p "$SYSTEMD_USER_DIR"

# Sostituisce il placeholder %i con l'utente reale nella unit
# (il template usa User=%i per essere esplicito, ma come user unit è ridondante;
#  viene comunque sostituito per chiarezza nei log)
sed "s/User=%i/User=${CURRENT_USER}/" "$SERVICE_SRC" \
    > "${SYSTEMD_USER_DIR}/${SERVICE_NAME}.service"

info "Ricaricamento systemd user daemon..."
systemctl --user daemon-reload
ok "Unit installata in ${SYSTEMD_USER_DIR}/${SERVICE_NAME}.service"

# Abilita la user unit (non avviare ancora — la config deve essere completata)
systemctl --user enable "$SERVICE_NAME" 2>/dev/null || true

# Assicura che il servizio user sopravviva al logout (linger)
if command -v loginctl &>/dev/null; then
    sudo loginctl enable-linger "$CURRENT_USER" 2>/dev/null \
        && ok "loginctl linger abilitato — il servizio resta attivo dopo il logout" \
        || warn "loginctl enable-linger fallito — il servizio si fermerà al logout"
fi

ok "Servizio ${SERVICE_NAME} abilitato (non ancora avviato — configura prima poller.conf)"

# ── 5. Template poller.conf ────────────────────────────────────────────────────
section "5/5 — Template di configurazione (~/.oci/poller.conf)"

mkdir -p "${HOME}/.oci"
chmod 700 "${HOME}/.oci"

if [[ -f "$CONF_FILE" ]]; then
    warn "poller.conf esiste già — non sovrascritto: $CONF_FILE"
else
    cat > "$CONF_FILE" << 'CONFEOF'
# =============================================================================
# Oracle ARM Poller — Configurazione
# File: ~/.oci/poller.conf
#
# IMPORTANTE: Questo file NON va committato nel repository.
#             Contiene ID OCI potenzialmente sensibili.
#
# Come trovare i valori:
#   - Apri https://cloud.oracle.com → Identity & Security → Compartments
#     → copia l'OCID del compartimento
#   - Networking → Virtual Cloud Networks → [la tua VCN] → Subnets
#     → copia l'OCID della subnet pubblica
#   - Compute → Images → (cerca "Ubuntu 22.04" o "Oracle Linux 9", filtra ARM)
#     → copia l'OCID dell'immagine
#   - Infrastruttura → Availability Domains
#     → copia il nome dell'AD (es. "Uocm:EU-FRANKFURT-1-AD-1")
# =============================================================================

# ── Parametri OCI (OBBLIGATORI) ──────────────────────────────────────────────

# OCID del compartimento in cui creare l'istanza
OCI_COMPARTMENT_ID=""

# OCID della subnet pubblica (deve avere un Internet Gateway associato)
OCI_SUBNET_ID=""

# OCID dell'immagine: Ubuntu 22.04 ARM o Oracle Linux 9 ARM
# Cerca "Canonical-Ubuntu-22.04-aarch64" o "Oracle-Linux-9.*-aarch64"
OCI_IMAGE_ID=""

# Availability Domain (formato: "Uocm:EU-FRANKFURT-1-AD-1")
# Prova tutti gli AD disponibili nella tua region se uno dà sempre "Out of capacity"
OCI_AVAILABILITY_DOMAIN=""

# ── Parametri istanza (con default) ──────────────────────────────────────────

# Nome visualizzato nell'interfaccia OCI
DISPLAY_NAME="bikerlink-arm-01"

# OCPU e RAM (Free Tier: max 4 OCPU / 24 GB in totale su tutti gli account)
OCPU_COUNT=4
MEMORY_GB=24

# Dimensione boot volume in GB (Free Tier: max 200 GB totali)
BOOT_VOLUME_GB=50

# Path alla SSH public key da installare sull'istanza
SSH_PUBLIC_KEY_FILE="${HOME}/.ssh/id_rsa.pub"

# ── Backoff (secondi) ─────────────────────────────────────────────────────────

# Il poller aspetta un tempo casuale tra MIN e MAX tra un tentativo e l'altro.
# Valori più alti riducono il rischio di rate-limit OCI.
MIN_SLEEP=60
MAX_SLEEP=300

# ── Notifiche (opzionale — almeno uno per ricevere avvisi) ───────────────────

# ntfy.sh: topic pubblico o self-hosted (es. "bikerlink-oracle-ARM")
# Ricevi notifiche sull'app ntfy (iOS/Android) o via browser
NTFY_TOPIC=""

# Telegram: crea un bot con @BotFather e ottieni il chat_id con @userinfobot
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""
CONFEOF

    chmod 600 "$CONF_FILE"
    ok "Template creato: $CONF_FILE"
fi

# ── Riepilogo ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Oracle ARM Poller — Installazione completata${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}PROSSIMI PASSI:${NC}"
echo ""
echo -e "  ${BLUE}1.${NC} Configura OCI CLI (se non ancora fatto):"
echo -e "       oci setup config"
echo ""
echo -e "  ${BLUE}2.${NC} Compila ${BOLD}~/.oci/poller.conf${NC} con i tuoi valori OCI:"
echo -e "       nano ~/.oci/poller.conf"
echo ""
echo -e "  ${BLUE}3.${NC} Verifica che la SSH public key esista:"
echo -e "       cat ~/.ssh/id_rsa.pub"
echo -e "       (se non esiste: ssh-keygen -t rsa -b 4096)"
echo ""
echo -e "  ${BLUE}4.${NC} Avvia il servizio:"
echo -e "       systemctl --user start oracle-poller"
echo ""
echo -e "  ${BLUE}5.${NC} Monitora i log:"
echo -e "       tail -f /var/log/oracle-poller.log"
echo ""
echo -e "  ${BLUE}6.${NC} Controlla lo stato del servizio:"
echo -e "       systemctl --user status oracle-poller"
echo ""
echo -e "  Per fermare manualmente:"
echo -e "       systemctl --user stop oracle-poller"
echo ""
echo -e "  Vedi ${BOLD}scripts/oracle-poller/README.md${NC} per la documentazione completa."
echo ""
