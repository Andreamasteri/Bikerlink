#!/usr/bin/env bash
# =============================================================================
# BikerLink — ThinkCentre Performance Tuning
# apply-tuning.sh — Script idempotente di ottimizzazione
#
# Hardware target: Intel i5-7500T, 32 GB RAM, Ubuntu 22.04+
# Servizi: GraphHopper + Ollama
#
# UTILIZZO:
#   sudo bash apply-tuning.sh
#
# SICUREZZA:
#   - Idempotente: ri-eseguire non causa danni
#   - Non tocca GraphHopper (richiede riavvio manuale — vedi doc)
#   - Rollback: vedi docs/thinkcentre-tuning.md
# =============================================================================

set -euo pipefail

# ── Colori ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
info() { echo -e "${BLUE}→${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; exit 1; }
section() { echo -e "\n${BOLD}══ $* ══${NC}"; }

# ── Prerequisiti ──────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  fail "Questo script deve essere eseguito come root. Usa: sudo bash apply-tuning.sh"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 1. CPU Governor ───────────────────────────────────────────────────────────
section "1/3 — CPU Governor (performance)"

# Applica subito (senza riavvio)
info "Impostando governor a 'performance' su tutti i core..."
CORES_SET=0
for cpu in /sys/devices/system/cpu/cpu[0-9]*/cpufreq/scaling_governor; do
  if [[ -f "$cpu" ]]; then
    echo performance > "$cpu"
    CORES_SET=$((CORES_SET + 1))
  fi
done

if [[ $CORES_SET -eq 0 ]]; then
  warn "Nessun core cpufreq trovato. Il modulo 'acpi-cpufreq' potrebbe non essere caricato."
  warn "Prova: sudo modprobe acpi-cpufreq && sudo bash apply-tuning.sh"
else
  ok "Governor 'performance' impostato su $CORES_SET core."
fi

# Installa unit systemd per persistenza al riavvio
SERVICE_SRC="${SCRIPT_DIR}/cpu-performance.service"
SERVICE_DST="/etc/systemd/system/cpu-performance.service"

if [[ ! -f "$SERVICE_SRC" ]]; then
  fail "File non trovato: $SERVICE_SRC — assicurarsi di eseguire lo script dalla directory scripts/thinkcentre/"
fi

info "Installando cpu-performance.service..."
cp "$SERVICE_SRC" "$SERVICE_DST"
systemctl daemon-reload
systemctl enable --now cpu-performance.service
ok "cpu-performance.service installato e abilitato al boot."

# ── 2. Sysctl kernel tuning ───────────────────────────────────────────────────
section "2/3 — Sysctl kernel tuning"

SYSCTL_SRC="${SCRIPT_DIR}/sysctl-bikerlink.conf"
SYSCTL_DST="/etc/sysctl.d/99-bikerlink.conf"

if [[ ! -f "$SYSCTL_SRC" ]]; then
  fail "File non trovato: $SYSCTL_SRC"
fi

info "Copiando sysctl-bikerlink.conf in ${SYSCTL_DST}..."
cp "$SYSCTL_SRC" "$SYSCTL_DST"
chmod 644 "$SYSCTL_DST"

info "Ricaricando parametri sysctl..."
# Eseguire sysctl --system e catturare output+exit code senza sopprimere errori.
# Il grep filtra le righe rilevanti per la leggibilità, ma il failure di sysctl
# è rilevato separatamente sul codice di uscita del comando originale.
SYSCTL_OUTPUT=$(sysctl --system 2>&1) || {
  fail "sysctl --system ha restituito un errore. Output:\n${SYSCTL_OUTPUT}"
}
echo "$SYSCTL_OUTPUT" | grep -E "(Applying|vm\.|net\.)" | head -20 || true
ok "Sysctl aggiornato."

# Transparent Hugepages — THP non è configurabile via sysctl (non è una chiave
# del namespace sysctl). Va scritto direttamente nel path sysfs al boot.
# La persistenza è già gestita da cpu-performance.service (ExecStart).
# Qui lo impostiamo anche subito per la sessione corrente.
THP_PATH="/sys/kernel/mm/transparent_hugepage/enabled"
if [[ -f "$THP_PATH" ]]; then
  echo madvise > "$THP_PATH"
  ok "Transparent Hugepages impostato a 'madvise' (sessione corrente + boot via cpu-performance.service)."
else
  warn "THP sysfs path non trovato ($THP_PATH) — saltato (normale su VM o kernel senza THP)."
fi

# ── 3. Ollama systemd drop-in ─────────────────────────────────────────────────
section "3/3 — Ollama systemd drop-in"

OLLAMA_SRC="${SCRIPT_DIR}/ollama-override.conf"
OLLAMA_DROPIN_DIR="/etc/systemd/system/ollama.service.d"
OLLAMA_DST="${OLLAMA_DROPIN_DIR}/bikerlink.conf"

if [[ ! -f "$OLLAMA_SRC" ]]; then
  fail "File non trovato: $OLLAMA_SRC"
fi

info "Creando directory drop-in: ${OLLAMA_DROPIN_DIR}..."
mkdir -p "$OLLAMA_DROPIN_DIR"

info "Copiando ollama-override.conf in ${OLLAMA_DST}..."
cp "$OLLAMA_SRC" "$OLLAMA_DST"
chmod 644 "$OLLAMA_DST"

systemctl daemon-reload

if systemctl is-active --quiet ollama 2>/dev/null; then
  info "Riavviando il servizio ollama per applicare le variabili..."
  systemctl restart ollama
  ok "Ollama riavviato con la nuova configurazione."
else
  warn "Il servizio ollama non è in esecuzione. Le variabili saranno applicate al prossimo avvio."
  warn "Avvia con: sudo systemctl start ollama"
fi

# ── Riepilogo e verifica ──────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  BikerLink ThinkCentre Tuning — COMPLETATO${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}VERIFICA RAPIDA:${NC}"
echo ""

echo -e "  ${BLUE}CPU Governor:${NC}"
echo -e "    cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor"
echo -e "    Atteso: ${GREEN}performance${NC}"
echo ""

echo -e "  ${BLUE}Swappiness:${NC}"
echo -e "    cat /proc/sys/vm/swappiness"
echo -e "    Atteso: ${GREEN}5${NC}"
echo ""

echo -e "  ${BLUE}Transparent Hugepages:${NC}"
echo -e "    cat /sys/kernel/mm/transparent_hugepage/enabled"
echo -e "    Atteso: always [${GREEN}madvise${NC}] never"
echo ""

echo -e "  ${BLUE}Ollama env vars:${NC}"
echo -e "    systemctl show ollama | grep -i 'OLLAMA_NUM_PARALLEL\|OLLAMA_NUM_THREADS\|OLLAMA_FLASH'"
echo -e "    Atteso: vedere le variabili dell'override"
echo ""

echo -e "  ${BLUE}Memoria disponibile:${NC}"
echo -e "    free -h"
echo ""

echo -e "  ${BLUE}GraphHopper (riavvio MANUALE richiesto):${NC}"
echo -e "    Vedere docs/thinkcentre-tuning.md per il comando di avvio con i flag JVM ottimizzati."
echo ""
echo -e "${YELLOW}⚠  GraphHopper NON è stato riavviato automaticamente.${NC}"
echo -e "${YELLOW}   Riavviare manualmente il processo con i flag JVM di graphhopper-jvm.conf.${NC}"
echo ""
