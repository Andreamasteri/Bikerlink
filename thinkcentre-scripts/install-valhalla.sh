#!/usr/bin/env bash
# install-valhalla — installa Docker (se assente) e scarica l'immagine Valhalla
#
# Parte da Ubuntu pulito:
#   1. Se Docker manca, lo installa dal repository ufficiale Docker per Ubuntu.
#   2. Abilita e avvia il servizio docker.
#   3. Aggiunge l'utente corrente al gruppo docker (se serve).
#   4. `docker pull` dell'immagine Valhalla (ghcr.io/gis-ops/docker-valhalla).
#
# Idempotente: se Docker e l'immagine sono già presenti non rifà nulla.
set -euo pipefail

ok()   { echo "[OK]   $1"; }
warn() { echo "[WARN] $1"; }
fail() { echo "[FAIL] $1"; }

# sudo helper (coerente con gli altri script)
if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi

# Config condivisa: VALHALLA_IMAGE (fonte unica)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config-valhalla.sh"
if [ -f "$CONFIG_FILE" ]; then
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
fi
VALHALLA_IMAGE="${VALHALLA_IMAGE:-ghcr.io/gis-ops/docker-valhalla/valhalla:latest}"

echo "=== INSTALL VALHALLA (Docker + immagine) ==="
echo ""

# ──────────────────────────────────────────────
# 1. DOCKER
# ──────────────────────────────────────────────
echo "─── DOCKER ───────────────────────────────────────────"

if command -v docker &>/dev/null; then
  DOCKER_VER=$(docker --version 2>/dev/null | sed 's/,.*//' || echo "Docker")
  ok "Docker già installato: $DOCKER_VER"
else
  warn "Docker non trovato — installo dal repository ufficiale Docker per Ubuntu..."

  if ! command -v apt-get &>/dev/null; then
    fail "apt-get non disponibile: questo installer è pensato per Ubuntu/Debian."
    exit 1
  fi

  # 1a. Dipendenze per il repo
  echo "[>] Installo prerequisiti (ca-certificates, curl)..."
  $SUDO apt-get update -y
  $SUDO apt-get install -y ca-certificates curl

  # 1b. Chiave GPG ufficiale Docker
  echo "[>] Aggiungo la chiave GPG ufficiale Docker..."
  $SUDO install -m 0755 -d /etc/apt/keyrings
  $SUDO curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
  $SUDO chmod a+r /etc/apt/keyrings/docker.asc

  # 1c. Repository apt Docker
  echo "[>] Aggiungo il repository apt Docker..."
  ARCH="$(dpkg --print-architecture)"
  CODENAME="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")"
  echo \
    "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
    | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null

  # 1d. Installa Docker Engine + plugin compose
  echo "[>] Installo docker-ce e i plugin..."
  $SUDO apt-get update -y
  $SUDO apt-get install -y \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  if command -v docker &>/dev/null; then
    ok "Docker installato: $(docker --version 2>/dev/null | sed 's/,.*//')"
  else
    fail "Installazione Docker fallita — controlla l'output sopra."
    exit 1
  fi
fi

# ──────────────────────────────────────────────
# 2. SERVIZIO DOCKER (enable + start)
# ──────────────────────────────────────────────
echo ""
echo "─── SERVIZIO ─────────────────────────────────────────"
if command -v systemctl &>/dev/null; then
  if systemctl is-active --quiet docker; then
    ok "Servizio docker già attivo."
  else
    echo "[>] Avvio il servizio docker..."
    $SUDO systemctl enable --now docker
    if systemctl is-active --quiet docker; then
      ok "Servizio docker abilitato e avviato (sopravvive al reboot)."
    else
      fail "Impossibile avviare il servizio docker."
      exit 1
    fi
  fi
else
  warn "systemctl non disponibile — salto la gestione del servizio (avvia docker manualmente)."
fi

# ──────────────────────────────────────────────
# 3. GRUPPO DOCKER (uso senza sudo)
# ──────────────────────────────────────────────
echo ""
echo "─── GRUPPO ───────────────────────────────────────────"
if [ "$(id -u)" -eq 0 ]; then
  ok "Eseguito come root — gruppo docker non necessario."
elif id -nG "$USER" 2>/dev/null | tr ' ' '\n' | grep -qx docker; then
  ok "Utente '$USER' già nel gruppo docker."
else
  echo "[>] Aggiungo '$USER' al gruppo docker..."
  $SUDO usermod -aG docker "$USER"
  ok "Utente aggiunto al gruppo docker."
  warn "Effettua logout/login (o 'newgrp docker') per usare docker senza sudo."
fi

# ──────────────────────────────────────────────
# 4. IMMAGINE VALHALLA (docker pull)
# ──────────────────────────────────────────────
echo ""
echo "─── IMMAGINE VALHALLA ────────────────────────────────"

# Per il pull serve poter parlare col daemon: se l'utente è appena stato aggiunto
# al gruppo docker, nella sessione corrente il socket potrebbe non essere ancora
# accessibile → uso sudo come fallback.
DOCKER="docker"
if ! docker info &>/dev/null; then
  if [ "$(id -u)" -ne 0 ]; then
    DOCKER="$SUDO docker"
  fi
fi

if $DOCKER image inspect "$VALHALLA_IMAGE" &>/dev/null; then
  ok "Immagine già presente: $VALHALLA_IMAGE"
else
  echo "[>] Scarico l'immagine: $VALHALLA_IMAGE"
  if $DOCKER pull "$VALHALLA_IMAGE"; then
    ok "Immagine scaricata: $VALHALLA_IMAGE"
  else
    fail "docker pull fallito per $VALHALLA_IMAGE."
    exit 1
  fi
fi

echo ""
echo "=== Install completata ==="
echo ""
echo "Prossimi passi:"
echo "  ./config-valhalla.sh  ← verifica i parametri di serve (porta/tiles)"
echo "  ./usb.sh              ← monta la USB, copia il PBF, smonta"
echo "  ./swap.sh             ← swapfile 32–48 GB (OBBLIGATORIO su 16 GB)"
echo "  ./04.sh               ← check pre-build"
echo "  ./05.sh               ← avvia build"
