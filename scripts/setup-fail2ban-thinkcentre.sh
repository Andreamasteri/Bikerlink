#!/usr/bin/env bash
# =============================================================================
# BikerLink — Installazione e configurazione fail2ban sul ThinkCentre
#
# Esegui come root:
#   sudo bash scripts/setup-fail2ban-thinkcentre.sh [--ssh-port PORT]
#
# --ssh-port PORT   porta SSH da proteggere (default: 2222 — come configurato
#                   da setup-ssh-hardening-thinkcentre.sh).
#                   Usare 22 solo se l'hardening SSH non è ancora stato applicato.
#
# Cosa fa:
#   - Installa fail2ban
#   - Configura jail SSH: ban dopo 5 tentativi falliti in 10 minuti
#   - Whitelist LAN 192.168.1.0/24 (mai bannare la rete locale)
#   - Abilita e avvia il servizio
# =============================================================================

set -euo pipefail

LAN_WHITELIST="192.168.1.0/24 127.0.0.1/8"
SSH_PORT=2222  # Porta post-hardening — allineata con setup-ssh-hardening-thinkcentre.sh

# ── Parsing argomenti ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssh-port)
      SSH_PORT="$2"
      shift 2
      ;;
    *)
      echo "ERRORE: argomento sconosciuto: $1" >&2
      echo "Uso: sudo bash $0 [--ssh-port PORT]" >&2
      exit 1
      ;;
  esac
done

echo "=== BikerLink fail2ban setup ThinkCentre ==="
echo "Porta SSH protetta: ${SSH_PORT}"
echo ""

if [[ $EUID -ne 0 ]]; then
  echo "ERRORE: eseguire come root (sudo)." >&2
  exit 1
fi

# ── Installazione ──────────────────────────────────────────────────────────────
echo "→ Aggiornamento repo e installazione fail2ban..."
apt-get update -q
apt-get install -y fail2ban

# ── Configurazione jail SSH ────────────────────────────────────────────────────
# Creare /etc/fail2ban/jail.local (sovrascrive defaults senza modificare jail.conf)
echo "→ Scrittura /etc/fail2ban/jail.local (porta SSH: ${SSH_PORT})..."
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
# Whitelist: indirizzi MAI bannati
ignoreip = ${LAN_WHITELIST}

# Finestra di osservazione: 10 minuti
findtime  = 600

# Max tentativi falliti prima del ban
maxretry  = 5

# Durata ban: 1 ora
bantime   = 3600

# Backend log
backend = auto

[sshd]
enabled  = true
port     = ${SSH_PORT}
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 5
bantime  = 3600
EOF

echo "→ Abilitazione e riavvio fail2ban..."
systemctl enable fail2ban
systemctl restart fail2ban

echo ""
echo "=== Stato fail2ban ==="
systemctl is-active fail2ban && echo "✓ fail2ban attivo" || echo "✗ fail2ban NON attivo"
fail2ban-client status sshd 2>/dev/null || true

echo ""
echo "Configurazione applicata:"
echo "  Porta SSH protetta  : ${SSH_PORT}"
echo "  Max tentativi       : 5 in 10 min"
echo "  Durata ban          : 1 ora"
echo "  Whitelist           : ${LAN_WHITELIST}"
echo ""
echo "Comandi utili:"
echo "  sudo fail2ban-client status sshd              # stato jail SSH"
echo "  sudo fail2ban-client set sshd unbanip <IP>    # sblocca IP manualmente"
echo "  sudo journalctl -u fail2ban -f                # log in tempo reale"
