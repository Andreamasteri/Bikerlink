#!/usr/bin/env bash
# =============================================================================
# BikerLink — SSH hardening sul ThinkCentre
#
# Esegui come root:
#   sudo bash scripts/setup-ssh-hardening-thinkcentre.sh
#
# Cosa fa:
#   - Disabilita autenticazione con password (solo chiave SSH)
#   - Sposta SSH dalla porta 22 alla porta 2222
#   - Disabilita login root via SSH
#   - Riavvia sshd
#
# ⚠️  PREREQUISITO OBBLIGATORIO: verificare che la propria chiave SSH pubblica
#     sia già presente in ~/.ssh/authorized_keys PRIMA di eseguire questo
#     script. Altrimenti si perde l'accesso al server.
#
#     Verifica: ssh -i ~/.ssh/id_rsa utente@192.168.1.35 -p 22
#     (deve funzionare senza password)
#
# ⚠️  PORTA SSH: dopo l'esecuzione la porta SSH cambia da 22 a 2222.
#     Aggiornare ufw di conseguenza (vedere note a fondo script).
# =============================================================================

set -euo pipefail

SSH_NEW_PORT=2222
SSHD_CONFIG="/etc/ssh/sshd_config"
BACKUP="${SSHD_CONFIG}.bak.$(date +%Y%m%d%H%M%S)"

echo "=== BikerLink SSH hardening ThinkCentre ==="
echo ""

if [[ $EUID -ne 0 ]]; then
  echo "ERRORE: eseguire come root (sudo)." >&2
  exit 1
fi

# ── Verifica chiave SSH presente ──────────────────────────────────────────────
CURRENT_USER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"
AUTH_KEYS_ROOT="/root/.ssh/authorized_keys"
AUTH_KEYS_USER="/home/${CURRENT_USER}/.ssh/authorized_keys"

KEY_FOUND=false
[[ -s "${AUTH_KEYS_ROOT}" ]] && KEY_FOUND=true
[[ -s "${AUTH_KEYS_USER}" ]] && KEY_FOUND=true

if [[ "${KEY_FOUND}" == "false" ]]; then
  echo "⚠️  ATTENZIONE: nessuna chiave SSH trovata in authorized_keys."
  echo "    Aggiungere la chiave pubblica prima di procedere:"
  echo "    ssh-copy-id -i ~/.ssh/id_rsa.pub utente@192.168.1.35"
  echo ""
  read -r -p "Continuare comunque? (richiede conferma esplicita — digita YES): " CONFIRM
  if [[ "${CONFIRM}" != "YES" ]]; then
    echo "Annullato."
    exit 0
  fi
fi

# ── Backup sshd_config ────────────────────────────────────────────────────────
echo "→ Backup sshd_config → ${BACKUP}..."
cp "${SSHD_CONFIG}" "${BACKUP}"

# ── Funzione helper: imposta o aggiunge opzione in sshd_config ────────────────
set_sshd_option() {
  local key="$1"
  local value="$2"
  if grep -qE "^#?${key}" "${SSHD_CONFIG}"; then
    sed -i "s|^#\?${key}.*|${key} ${value}|" "${SSHD_CONFIG}"
  else
    echo "${key} ${value}" >> "${SSHD_CONFIG}"
  fi
}

# ── Applicazione hardening ────────────────────────────────────────────────────
echo "→ Disabilitazione autenticazione con password..."
set_sshd_option "PasswordAuthentication" "no"
set_sshd_option "ChallengeResponseAuthentication" "no"
set_sshd_option "UsePAM" "yes"

echo "→ Disabilitazione login root via SSH..."
set_sshd_option "PermitRootLogin" "no"

echo "→ Spostamento porta SSH da 22 a ${SSH_NEW_PORT}..."
set_sshd_option "Port" "${SSH_NEW_PORT}"

echo "→ Hardening aggiuntivo..."
set_sshd_option "X11Forwarding" "no"
set_sshd_option "AllowAgentForwarding" "no"
set_sshd_option "AllowTcpForwarding" "no"
set_sshd_option "MaxAuthTries" "3"
set_sshd_option "LoginGraceTime" "20"

# ── Blocca cloud-init dalla gestione di SSH password auth ─────────────────────
# cloud-init può rigenerare /etc/ssh/sshd_config.d/50-cloud-init.conf ad ogni
# reboot/re-provision ripristinando silenziosamente PasswordAuthentication yes.
# La soluzione è duplice:
#   1) Dichiariamo ssh_pwauth: false nel config override di cloud-init (ha
#      precedenza su user-data e sulla logica del modulo ssh).
#   2) Scriviamo il drop-in 50-cloud-init.conf esplicitamente con "no", così
#      anche se cloud-init venisse invocato prima della nostra verifica, il
#      contenuto che scrive rispecchia la nostra policy.

CLOUD_INIT_OVERRIDE_DIR="/etc/cloud/cloud.cfg.d"
CLOUD_INIT_OVERRIDE="${CLOUD_INIT_OVERRIDE_DIR}/99-bikerlink-ssh.cfg"
SSHD_DROPIN_DIR="/etc/ssh/sshd_config.d"
SSHD_DROPIN="${SSHD_DROPIN_DIR}/50-cloud-init.conf"

echo "→ Configurazione cloud-init per bloccare SSH password auth..."

if [[ -d "${CLOUD_INIT_OVERRIDE_DIR}" ]]; then
  cat > "${CLOUD_INIT_OVERRIDE}" <<'CLOUDINIT'
# BikerLink — impedisce a cloud-init di abilitare SSH password authentication.
# Generato da scripts/setup-ssh-hardening-thinkcentre.sh — NON modificare a mano.
# Ref: https://cloudinit.readthedocs.io/en/latest/reference/modules.html#ssh
ssh_pwauth: false
CLOUDINIT
  chmod 644 "${CLOUD_INIT_OVERRIDE}"
  echo "   ✓ Creato ${CLOUD_INIT_OVERRIDE} (ssh_pwauth: false)"
else
  echo "   ⚠  cloud-init non trovato (${CLOUD_INIT_OVERRIDE_DIR} assente) — skip"
fi

echo "→ Applicazione/aggiornamento drop-in sshd ${SSHD_DROPIN}..."
mkdir -p "${SSHD_DROPIN_DIR}"
cat > "${SSHD_DROPIN}" <<'DROPIN'
# Gestito da scripts/setup-ssh-hardening-thinkcentre.sh — NON modificare a mano.
# Sovrascritto anche da cloud-init ma la policy 99-bikerlink-ssh.cfg garantisce
# che cloud-init stesso scriva "no" a ogni re-provision.
PasswordAuthentication no
DROPIN
chmod 644 "${SSHD_DROPIN}"
echo "   ✓ ${SSHD_DROPIN} → PasswordAuthentication no"

# ── Verifica sintassi sshd_config ─────────────────────────────────────────────
echo "→ Verifica sintassi sshd_config..."
if ! sshd -t; then
  echo "ERRORE: sshd_config non valido — ripristino backup..."
  cp "${BACKUP}" "${SSHD_CONFIG}"
  exit 1
fi

# ── Riavvio sshd ──────────────────────────────────────────────────────────────
echo "→ Riavvio sshd..."
systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null

# ── Verifica runtime post-riavvio ─────────────────────────────────────────────
echo "→ Verifica runtime (sshd -T)..."
PWAUTH=$(sshd -T 2>/dev/null | grep -i "^passwordauthentication" | awk '{print $2}')
if [[ "${PWAUTH}" == "no" ]]; then
  echo "   ✓ passwordauthentication = no (corretto)"
else
  echo "   ✗ ERRORE: sshd -T riporta passwordauthentication = ${PWAUTH:-<vuoto>}" >&2
  echo "     Controllare manualmente /etc/ssh/sshd_config.d/ e /etc/ssh/sshd_config" >&2
  exit 1
fi

echo ""
echo "=== SSH hardening completato ==="
echo ""
echo "⚠️  AZIONI RICHIESTE DOPO QUESTO SCRIPT:"
echo ""
echo "1. Aggiornare ufw per la nuova porta SSH (rieseguire senza override — default già 2222):"
echo "   sudo bash scripts/setup-ufw-thinkcentre.sh --mode tunnel"
echo "   sudo ufw status verbose"
echo ""
echo "2. Aggiornare fail2ban per la nuova porta:"
echo "   Editare /etc/fail2ban/jail.local → port = ${SSH_NEW_PORT}"
echo "   sudo systemctl restart fail2ban"
echo ""
echo "3. Aprire una NUOVA sessione SSH sulla porta ${SSH_NEW_PORT} PRIMA di chiudere questa:"
echo "   ssh -p ${SSH_NEW_PORT} utente@192.168.1.35"
echo ""
echo "4. Dopo il prossimo riavvio del TC, verificare che l'hardening sia ancora attivo:"
echo "   ssh -p ${SSH_NEW_PORT} utente@192.168.1.35 'sudo sshd -T | grep passwordauthentication'"
echo "   (deve restituire: passwordauthentication no)"
echo ""
echo "Riepilogo hardening applicato:"
echo "  PasswordAuthentication  → no (sshd_config + drop-in + cloud-init)"
echo "  PermitRootLogin         → no"
echo "  Port                    → ${SSH_NEW_PORT}"
echo "  MaxAuthTries            → 3"
echo "  X11/Agent/TcpForwarding → no"
echo "  cloud-init override     → ${CLOUD_INIT_OVERRIDE}"
