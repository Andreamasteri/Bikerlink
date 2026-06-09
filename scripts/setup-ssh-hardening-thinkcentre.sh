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

echo ""
echo "=== SSH hardening completato ==="
echo ""
echo "⚠️  AZIONI RICHIESTE DOPO QUESTO SCRIPT:"
echo ""
echo "1. Aggiornare ufw per la nuova porta SSH:"
echo "   sudo ufw delete limit from 192.168.1.0/24 to any port 22 proto tcp"
echo "   sudo ufw limit from 192.168.1.0/24 to any port ${SSH_NEW_PORT} proto tcp"
echo "   sudo ufw status verbose"
echo ""
echo "2. Aggiornare fail2ban per la nuova porta:"
echo "   Editare /etc/fail2ban/jail.local → port = ${SSH_NEW_PORT}"
echo "   sudo systemctl restart fail2ban"
echo ""
echo "3. Aprire una NUOVA sessione SSH sulla porta ${SSH_NEW_PORT} PRIMA di chiudere questa:"
echo "   ssh -p ${SSH_NEW_PORT} utente@192.168.1.35"
echo ""
echo "Riepilogo hardening applicato:"
echo "  PasswordAuthentication  → no"
echo "  PermitRootLogin         → no"
echo "  Port                    → ${SSH_NEW_PORT}"
echo "  MaxAuthTries            → 3"
echo "  X11/Agent/TcpForwarding → no"
