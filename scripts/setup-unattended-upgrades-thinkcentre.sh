#!/usr/bin/env bash
# =============================================================================
# BikerLink — Configurazione unattended-upgrades sul ThinkCentre (Ubuntu)
#
# Esegui come root:
#   sudo bash scripts/setup-unattended-upgrades-thinkcentre.sh
#
# Cosa fa:
#   - Installa unattended-upgrades e update-notifier-common
#   - Configura aggiornamenti automatici: solo patch di sicurezza Ubuntu
#   - Rimozione automatica pacchetti obsoleti
#   - Riavvio automatico solo se necessario (ore notturne: 03:00)
#   - NON aggiorna pacchetti applicativi (solo OS security patches)
# =============================================================================

set -euo pipefail

echo "=== BikerLink unattended-upgrades setup ThinkCentre ==="
echo ""

if [[ $EUID -ne 0 ]]; then
  echo "ERRORE: eseguire come root (sudo)." >&2
  exit 1
fi

# ── Installazione ──────────────────────────────────────────────────────────────
echo "→ Installazione unattended-upgrades..."
apt-get update -q
apt-get install -y unattended-upgrades update-notifier-common

# ── Configurazione 50unattended-upgrades ─────────────────────────────────────
echo "→ Scrittura /etc/apt/apt.conf.d/50unattended-upgrades..."
cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
// BikerLink ThinkCentre — unattended-upgrades config
// Solo patch di sicurezza Ubuntu, nessun aggiornamento applicativo.

Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};

// NON aggiornare automaticamente questi pacchetti (infrastruttura critica)
Unattended-Upgrade::Package-Blacklist {
    "docker*";
    "containerd*";
    "nginx";
    "postgresql*";
};

// Rimuovi pacchetti obsoleti dopo l'aggiornamento
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";

// Riavvio automatico se richiesto (es. kernel update)
// Solo in orario notturno per minimizzare downtime
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "03:00";

// Invia email in caso di errori (opzionale — commentato)
// Unattended-Upgrade::Mail "admin@bikerlink.it";
// Unattended-Upgrade::MailReport "on-change";

// Scrivi log dettagliato
Unattended-Upgrade::Verbose "false";
Unattended-Upgrade::Debug "false";
EOF

# ── Abilitazione aggiornamenti periodici ─────────────────────────────────────
echo "→ Scrittura /etc/apt/apt.conf.d/20auto-upgrades..."
cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF

# ── Abilitazione e verifica ────────────────────────────────────────────────────
echo "→ Abilitazione servizio unattended-upgrades..."
systemctl enable unattended-upgrades
systemctl restart unattended-upgrades

echo ""
echo "→ Simulazione dry-run per verifica configurazione..."
unattended-upgrades --dry-run --debug 2>&1 | grep -E "^(Allowed|Checking|Packages|No packages)" | head -20 || true

echo ""
echo "=== unattended-upgrades configurato ==="
echo ""
echo "Configurazione attiva:"
echo "  - Sorgente: Ubuntu security patches only"
echo "  - Pacchetti esclusi: docker*, containerd*, nginx, postgresql*"
echo "  - Rimozione obsoleti: sì"
echo "  - Riavvio automatico: sì (ore 03:00 se necessario)"
echo ""
echo "Verifica:"
echo "  sudo systemctl status unattended-upgrades"
echo "  sudo unattended-upgrades --dry-run"
echo "  cat /var/log/unattended-upgrades/unattended-upgrades.log"
