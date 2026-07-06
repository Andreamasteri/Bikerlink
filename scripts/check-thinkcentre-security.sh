#!/usr/bin/env bash
# =============================================================================
# BikerLink — Verifica stato layer di sicurezza ThinkCentre
#
# Esegui come root (alcune verifiche richiedono sudo):
#   sudo bash scripts/check-thinkcentre-security.sh
#
# Controlla: ufw, fail2ban, SSH hardening, unattended-upgrades, ufw-status daemon.
# Output: OK (verde) / WARN (giallo) / FAIL (rosso) per ogni check.
# =============================================================================

set -uo pipefail

# Colori
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

PASS=0
WARN=0
FAIL=0

ok()   { echo -e "${GREEN}  ✓ OK${RESET}   $1";   ((PASS++)); }
warn() { echo -e "${YELLOW}  ⚠ WARN${RESET}  $1";  ((WARN++)); }
fail() { echo -e "${RED}  ✗ FAIL${RESET}  $1";   ((FAIL++)); }

echo "=== BikerLink ThinkCentre — Security Check ==="
echo ""

# ── 1. ufw ────────────────────────────────────────────────────────────────────
echo "── ufw ──────────────────────────────────────────────────────────"

if command -v ufw &>/dev/null; then
  UFW_STATUS=$(ufw status 2>/dev/null | grep "^Status:" | awk '{print $2}')
  if [[ "${UFW_STATUS}" == "active" ]]; then
    ok "ufw attivo"
  else
    fail "ufw NON attivo (status: ${UFW_STATUS:-sconosciuto})"
  fi

  # Verifica che 80/443 non siano aperte a tutti (sicurezza post-Cloudflare)
  if ufw status 2>/dev/null | grep -qE "^80(/tcp)?\s+ALLOW\s+Anywhere"; then
    warn "Porta 80 aperta a tutti — applicare --mode tunnel o --mode dns-proxy"
  else
    ok "Porta 80 non esposta a internet generico"
  fi

  if ufw status 2>/dev/null | grep -qE "^443(/tcp)?\s+ALLOW\s+Anywhere"; then
    warn "Porta 443 aperta a tutti — applicare --mode tunnel o --mode dns-proxy"
  else
    ok "Porta 443 non esposta a internet generico"
  fi

  # (Tailscale rimosso — nessuna verifica necessaria)
else
  fail "ufw non installato"
fi

echo ""

# ── 2. fail2ban ───────────────────────────────────────────────────────────────
echo "── fail2ban ─────────────────────────────────────────────────────"

if command -v fail2ban-client &>/dev/null; then
  if systemctl is-active --quiet fail2ban 2>/dev/null; then
    ok "fail2ban attivo"

    JAIL_COUNT=$(fail2ban-client status 2>/dev/null | grep "Number of jail" | awk '{print $NF}')
    if [[ "${JAIL_COUNT:-0}" -gt 0 ]]; then
      ok "Jail attive: ${JAIL_COUNT}"
    else
      warn "Nessuna jail fail2ban attiva"
    fi

    if fail2ban-client status sshd &>/dev/null; then
      ok "Jail sshd configurata"
    else
      warn "Jail sshd non trovata — rieseguire setup-fail2ban-thinkcentre.sh"
    fi
  else
    fail "fail2ban NON attivo"
  fi
else
  warn "fail2ban non installato — eseguire: sudo bash scripts/setup-fail2ban-thinkcentre.sh"
fi

echo ""

# ── 3. SSH hardening ──────────────────────────────────────────────────────────
echo "── SSH hardening ────────────────────────────────────────────────"

if command -v sshd &>/dev/null; then
  SSH_PORT_EFF=$(sshd -T 2>/dev/null | grep "^port " | awk '{print $2}')
  SSH_PASS_EFF=$(sshd -T 2>/dev/null | grep "^passwordauthentication " | awk '{print $2}')
  SSH_ROOT_EFF=$(sshd -T 2>/dev/null | grep "^permitrootlogin " | awk '{print $2}')

  # Porta non standard
  if [[ "${SSH_PORT_EFF}" == "22" ]]; then
    warn "SSH sulla porta standard 22 — eseguire setup-ssh-hardening-thinkcentre.sh"
  else
    ok "SSH su porta non standard: ${SSH_PORT_EFF}"
  fi

  # Autenticazione password disabilitata
  if [[ "${SSH_PASS_EFF}" == "no" ]]; then
    ok "PasswordAuthentication: no"
  else
    fail "PasswordAuthentication: ${SSH_PASS_EFF:-sconosciuto} — deve essere 'no'"
  fi

  # Root login disabilitato
  if [[ "${SSH_ROOT_EFF}" == "no" ]]; then
    ok "PermitRootLogin: no"
  else
    warn "PermitRootLogin: ${SSH_ROOT_EFF:-sconosciuto} — preferibile 'no'"
  fi

  # Coerenza porta SSH ↔ fail2ban
  if [[ -f /etc/fail2ban/jail.local ]]; then
    FB_PORT=$(grep "^port" /etc/fail2ban/jail.local 2>/dev/null | awk '{print $3}' | head -1)
    if [[ -n "${FB_PORT}" && "${FB_PORT}" != "${SSH_PORT_EFF}" ]]; then
      warn "Porta fail2ban (${FB_PORT}) ≠ porta SSH effettiva (${SSH_PORT_EFF}) — aggiornare jail.local"
    elif [[ -n "${FB_PORT}" ]]; then
      ok "Porta fail2ban allineata con SSH: ${FB_PORT}"
    fi
  fi
else
  warn "sshd non trovato — installare openssh-server"
fi

echo ""

# ── 4. unattended-upgrades ────────────────────────────────────────────────────
echo "── unattended-upgrades ──────────────────────────────────────────"

if command -v unattended-upgrades &>/dev/null; then
  if systemctl is-active --quiet unattended-upgrades 2>/dev/null; then
    ok "unattended-upgrades attivo"
  else
    warn "unattended-upgrades NON attivo — eseguire setup-unattended-upgrades-thinkcentre.sh"
  fi

  if [[ -f /etc/apt/apt.conf.d/20auto-upgrades ]]; then
    UU_ENABLED=$(grep "Unattended-Upgrade" /etc/apt/apt.conf.d/20auto-upgrades 2>/dev/null | grep '"1"' | wc -l)
    if [[ "${UU_ENABLED}" -gt 0 ]]; then
      ok "auto-upgrades periodici abilitati"
    else
      warn "auto-upgrades non abilitati in 20auto-upgrades"
    fi
  else
    warn "/etc/apt/apt.conf.d/20auto-upgrades non trovato"
  fi
else
  warn "unattended-upgrades non installato — eseguire: sudo bash scripts/setup-unattended-upgrades-thinkcentre.sh"
fi

echo ""

# ── 5. ufw-status daemon ──────────────────────────────────────────────────────
echo "── ufw-status daemon (pannello admin) ───────────────────────────"

if systemctl is-active --quiet bikerlink-ufw-status 2>/dev/null; then
  ok "bikerlink-ufw-status attivo"

  DAEMON_RESP=$(curl -sf --max-time 3 http://localhost:9099/ 2>/dev/null || echo "")
  if echo "${DAEMON_RESP}" | grep -q '"status"'; then
    DAEMON_STATUS=$(echo "${DAEMON_RESP}" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    ok "Daemon risponde: status=${DAEMON_STATUS}"
  else
    warn "Daemon non risponde su :9099 — verificare: curl http://localhost:9099/"
  fi
else
  warn "bikerlink-ufw-status NON attivo — rieseguire setup-ufw-thinkcentre.sh"
fi

echo ""

# ── Riepilogo ─────────────────────────────────────────────────────────────────
echo "══════════════════════════════════════════════════════════════════"
TOTAL=$((PASS + WARN + FAIL))
echo -e "Riepilogo: ${GREEN}${PASS} OK${RESET} | ${YELLOW}${WARN} WARN${RESET} | ${RED}${FAIL} FAIL${RESET} (su ${TOTAL} check)"

if [[ ${FAIL} -gt 0 ]]; then
  echo -e "${RED}Ci sono check FAIL — correggere prima di andare in produzione.${RESET}"
  exit 2
elif [[ ${WARN} -gt 0 ]]; then
  echo -e "${YELLOW}Ci sono WARN — verificare se applicabili alla configurazione attuale.${RESET}"
  exit 1
else
  echo -e "${GREEN}Tutti i check OK.${RESET}"
  exit 0
fi
