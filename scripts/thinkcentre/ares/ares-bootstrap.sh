#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Ares bootstrap — Step 1 della migrazione Windows → Linux (Task #5259)
#
# DA ESEGUIRE UNA SOLA VOLTA sul nuovo Ares-Linux (server headless), come root:
#
#     sudo bash ares-bootstrap.sh
#
# Cosa fa (idempotente — lo puoi rilanciare senza danni):
#   • installa openssh-server + ethtool
#   • crea l'utente dedicato dell'agente ($AGENT_USER) con la chiave pubblica
#     dell'agente già autorizzata (incorporata qui sotto)
#   • abilita e avvia sshd
#   • concede sudo NOPASSWD TEMPORANEO all'agente per il setup
#     (a fine migrazione viene ristretto/rimosso, vedi ares-harden-sudo.sh)
#   • stampa IP LAN + MAC + stato Wake-on-LAN (servono al Task #5255)
#
# Dopo questo, l'agente entra via ThinkCentre→Ares (ProxyJump), Ares resta
# LAN-only: niente nuove porte aperte, niente nuovo tunnel/CF Access.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

AGENT_USER="ares-agent"
# Chiave PUBBLICA dell'agente (privata = secret ARES_SSH_KEY, mai qui dentro).
AGENT_PUBKEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEij9yM282dDFeCrRf/qTqEy/svhTRTo+F7KJiFextju ares-agent@bikerlink"

if [[ $EUID -ne 0 ]]; then
  echo "Devi eseguirlo come root:  sudo bash $0" >&2
  exit 1
fi

echo "==> Installazione openssh-server + ethtool"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y openssh-server ethtool

echo "==> Utente agente: $AGENT_USER"
id -u "$AGENT_USER" &>/dev/null || useradd -m -s /bin/bash "$AGENT_USER"

install -d -m 700 "/home/$AGENT_USER/.ssh"
AUTH="/home/$AGENT_USER/.ssh/authorized_keys"
grep -qxF "$AGENT_PUBKEY" "$AUTH" 2>/dev/null || echo "$AGENT_PUBKEY" >> "$AUTH"
chmod 600 "$AUTH"
chown -R "$AGENT_USER:$AGENT_USER" "/home/$AGENT_USER/.ssh"

echo "==> sshd enable + start"
systemctl enable --now ssh 2>/dev/null || systemctl enable --now sshd

echo "==> sudo NOPASSWD temporaneo per il setup"
echo "$AGENT_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-ares-agent
chmod 440 /etc/sudoers.d/90-ares-agent
visudo -cf /etc/sudoers.d/90-ares-agent >/dev/null

IFACE=$(ip route show default | awk '{print $5; exit}')
IP=$(ip -4 addr show "$IFACE" | awk '/inet /{print $2}' | head -1)
MAC=$(cat "/sys/class/net/$IFACE/address" 2>/dev/null || echo "?")
WOL=$(ethtool "$IFACE" 2>/dev/null | awk '/Wake-on:/{print $2; exit}')

echo
echo "==================== ARES PRONTO ===================="
echo "Interfaccia : $IFACE"
echo "IP LAN      : $IP"
echo "MAC         : $MAC"
echo "Wake-on-LAN : ${WOL:-?}   (g = magic packet attivo)"
echo "====================================================="
echo
echo "Copia/incolla queste 3 righe nella chat: servono all'agente"
echo "per collegarsi (ProxyJump dal ThinkCentre) e per il Wake-on-LAN."
