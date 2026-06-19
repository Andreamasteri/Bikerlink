#!/usr/bin/env bash
# recover.sh — pulizia guidata post-crash Valhalla
#
# Esegue diag-system.sh + diag-build.sh, interpreta i [FAIL] rilevati
# e guida passo-passo verso il ripristino, chiedendo conferma prima di
# ogni azione distruttiva.
#
# Uso: ./recover.sh [/path/al/log-di-build]
#      Il percorso del log è passato a diag-build.sh (default: /tmp/valhalla-build.log)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_PATH="${1:-/tmp/valhalla-build.log}"

ok()   { echo "[OK]   $1"; }
warn() { echo "[WARN] $1"; }
fail() { echo "[FAIL] $1"; }
info() { echo "[INFO] $1"; }
step() { echo ""; echo "──────────────────────────────────────────────────────────"; echo "[>>>]  $1"; echo "──────────────────────────────────────────────────────────"; }

# ── Chiedi conferma prima di un'azione ───────────────────────────────────────
# Uso: confirm "Descrizione" && { ... azione ... }
confirm() {
  local prompt="$1"
  echo ""
  echo "[?]   $prompt"
  read -rp "      Eseguire? [s/N] " _ANS
  [[ "$_ANS" == "s" || "$_ANS" == "S" ]]
}

# ── Flag azioni suggerite ─────────────────────────────────────────────────────
NEED_SWAP=0
NEED_DOCKER_START=0
NEED_CLEAN=0       # 03.sh (distruttiva)
NEED_DISK_CHECK=0

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         RECOVERY GUIDATO — BikerLink / Valhalla          ║"
echo "║    $(date '+%Y-%m-%d %H:%M:%S')                                    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
info "Avvio diagnostica sistema e build. Attendi..."
echo ""

# ═════════════════════════════════════════════════════════════════════════════
# FASE 1 — Diagnostica sistema
# ═════════════════════════════════════════════════════════════════════════════
step "FASE 1/2 — Diagnostica sistema (diag-system.sh)"
echo ""

if [ ! -x "$SCRIPT_DIR/diag-system.sh" ]; then
  fail "diag-system.sh non trovato o non eseguibile in $SCRIPT_DIR"
  exit 1
fi

SYSTEM_OUT=$("$SCRIPT_DIR/diag-system.sh" 2>&1)
echo "$SYSTEM_OUT"

# Estrai le righe [FAIL] dalla diagnostica sistema
SYSTEM_FAILS=$(echo "$SYSTEM_OUT" | grep "^\[FAIL\]")

# ═════════════════════════════════════════════════════════════════════════════
# FASE 2 — Diagnostica build
# ═════════════════════════════════════════════════════════════════════════════
step "FASE 2/2 — Diagnostica build (diag-build.sh)"
echo ""

if [ ! -x "$SCRIPT_DIR/diag-build.sh" ]; then
  fail "diag-build.sh non trovato o non eseguibile in $SCRIPT_DIR"
  exit 1
fi

BUILD_OUT=$("$SCRIPT_DIR/diag-build.sh" "$LOG_PATH" 2>&1)
echo "$BUILD_OUT"

BUILD_FAILS=$(echo "$BUILD_OUT" | grep "^\[FAIL\]")

# ═════════════════════════════════════════════════════════════════════════════
# FASE 3 — Interpretazione dei [FAIL] e piano d'azione
# ═════════════════════════════════════════════════════════════════════════════
step "INTERPRETAZIONE E PIANO DI RIPRISTINO"
echo ""

ALL_FAILS=$(printf "%s\n%s" "$SYSTEM_FAILS" "$BUILD_FAILS" | sed '/^[[:space:]]*$/d')

if [ -z "$ALL_FAILS" ]; then
  ok "Nessun [FAIL] rilevato nelle diagnostiche."
  echo ""
  info "Se hai avuto un crash in passato, il sistema sembra già recuperato."
  info "Controlla i [WARN] nell'output sopra per possibili problemi minori."
  echo ""
  echo "=== Recovery completato — nessuna azione correttiva necessaria ==="
  exit 0
fi

echo "I seguenti [FAIL] sono stati rilevati:"
echo ""
echo "$ALL_FAILS" | while IFS= read -r line; do
  echo "  • $line"
done
echo ""

# Mappa ogni pattern di FAIL a un'azione
while IFS= read -r line; do
  case "$line" in
    *"RAM disponibile critica"*|*"OOM"*|*"memoria esaurita"*|*"Killed"*)
      NEED_SWAP=1
      ;;
    *"Nessuno swap"*|*"swap"*"insufficiente"*|*"swap"*"piccolo"*|*"Swap troppo piccolo"*)
      NEED_SWAP=1
      ;;
    *"Docker non disponibile"*|*"Docker non raggiungibile"*)
      NEED_DOCKER_START=1
      ;;
    *"Spazio disco"*"critico"*|*"spazio disco"*"critico"*)
      NEED_DISK_CHECK=1
      ;;
    *"double free"*|*"Aborted"*|*"Segmentation fault"*|*"segnale fatale"*|*"Segnale fatale"*)
      NEED_CLEAN=1
      ;;
    *"Container Valhalla terminato con errore"*)
      NEED_CLEAN=1
      ;;
    *"Log non trovato"*)
      info "Log di build non trovato — la build potrebbe non essere mai partita o il log è altrove."
      ;;
  esac
done <<< "$ALL_FAILS"

# ═════════════════════════════════════════════════════════════════════════════
# FASE 4 — Azioni correttive guidate
# ═════════════════════════════════════════════════════════════════════════════
ACTIONS_DONE=0

# ── Azione: swap ─────────────────────────────────────────────────────────────
if [ "$NEED_SWAP" -eq 1 ]; then
  step "AZIONE: Swap insufficiente o assente"
  warn "La build Valhalla Europa richiede swap adeguato (consigliati >= 16 GB su 32 GB RAM)."
  info "Lo script swap.sh è idempotente: non fa nulla se lo swap è già corretto."
  if confirm "Eseguire ./swap.sh per creare/verificare lo swapfile?"; then
    echo ""
    "$SCRIPT_DIR/swap.sh"
    _RC=$?
    if [ "$_RC" -eq 0 ]; then
      ok "swap.sh completato con successo."
      ACTIONS_DONE=$((ACTIONS_DONE + 1))
    else
      fail "swap.sh terminato con errore (exit $_RC) — controlla l'output sopra."
    fi
  else
    warn "Swap saltato. Ricordati di eseguire ./swap.sh prima della prossima build."
  fi
fi

# ── Azione: Docker non in esecuzione ─────────────────────────────────────────
if [ "$NEED_DOCKER_START" -eq 1 ]; then
  step "AZIONE: Docker non in esecuzione"
  warn "Docker deve essere attivo prima di procedere con la build."
  if confirm "Eseguire 'sudo systemctl start docker'?"; then
    echo ""
    sudo systemctl start docker
    _RC=$?
    sleep 2
    if [ "$_RC" -ne 0 ]; then
      fail "systemctl start docker terminato con errore (exit $_RC) — controlla 'sudo systemctl status docker'"
    elif docker info &>/dev/null 2>&1; then
      ok "Docker avviato correttamente."
      ACTIONS_DONE=$((ACTIONS_DONE + 1))
    else
      fail "Docker non risponde dopo l'avvio — controlla 'sudo systemctl status docker'"
    fi
  else
    warn "Docker non avviato. Esegui 'sudo systemctl start docker' manualmente."
  fi
fi

# ── Azione: spazio disco ──────────────────────────────────────────────────────
if [ "$NEED_DISK_CHECK" -eq 1 ]; then
  step "AZIONE: Spazio disco critico"
  fail "Lo spazio disco è critico. La build non può procedere in sicurezza."
  echo ""
  info "Suggerimenti per liberare spazio:"
  info "  1. Rimuovi immagini Docker inutilizzate:  docker image prune -a"
  info "  2. Rimuovi tiles vecchi:                   ./03.sh  (se sono di una build fallita)"
  info "  3. Rimuovi log:                            rm -f /tmp/*.log"
  info "  4. Controlla le cartelle più pesanti:      du -sh ~/valhalla/* 2>/dev/null | sort -h"
  echo ""
  warn "Risolvi il problema di spazio manualmente, poi esegui di nuovo 04.sh + 05.sh."
fi

# ── Azione: pulizia tiles/container (DISTRUTTIVA) ────────────────────────────
if [ "$NEED_CLEAN" -eq 1 ]; then
  step "AZIONE: Pulizia tiles e container (03.sh) — DISTRUTTIVA"
  warn "È stato rilevato un crash critico (double free / SIGABRT / container terminato con errore)."
  warn "I tiles parziali devono essere rimossi prima di ritentare la build."
  echo ""
  info "03.sh eseguirà:"
  info "  • Stop container bikerlink-valhalla-build"
  info "  • Rimozione di ~/valhalla/data/valhalla_tiles/"
  info "  • Rimozione di /tmp/valhalla-build.log"
  echo ""
  warn "ATTENZIONE: questa operazione è irreversibile. I tiles parziali verranno eliminati."
  info "Nota: 03.sh chiederà conferma una seconda volta al suo interno."
  if confirm "Eseguire ./03.sh per pulire tiles e container?"; then
    echo ""
    "$SCRIPT_DIR/03.sh"
    _RC=$?
    # 03.sh esce 0 anche se l'utente risponde "N" al suo prompt interno.
    # Verifica che i tiles siano stati effettivamente rimossi.
    if [ -d "$HOME/valhalla/data/valhalla_tiles" ]; then
      warn "03.sh terminato ma la cartella valhalla_tiles è ancora presente."
      warn "Probabilmente la pulizia è stata annullata all'interno di 03.sh."
      warn "Esegui ./03.sh manualmente e conferma con 's' per completare la pulizia."
    elif [ "$_RC" -ne 0 ]; then
      fail "03.sh terminato con errore (exit $_RC) — controlla l'output sopra."
    else
      ok "03.sh completato — tiles e log rimossi correttamente."
      ACTIONS_DONE=$((ACTIONS_DONE + 1))
    fi
  else
    warn "Pulizia saltata. Esegui ./03.sh manualmente prima di ritentare la build."
  fi
fi

# ═════════════════════════════════════════════════════════════════════════════
# FASE 5 — Riepilogo e passi successivi
# ═════════════════════════════════════════════════════════════════════════════
step "RIEPILOGO E PROSSIMI PASSI"
echo ""

if [ "$NEED_DISK_CHECK" -eq 1 ]; then
  warn "Spazio disco ancora da risolvere manualmente — vedi suggerimenti sopra."
  echo ""
fi

# Determina se si può procedere con 04.sh + 05.sh
CAN_PROCEED=1
[ "$NEED_DISK_CHECK" -eq 1 ] && CAN_PROCEED=0

if [ "$NEED_DOCKER_START" -eq 1 ]; then
  if ! docker info &>/dev/null 2>&1; then
    CAN_PROCEED=0
    warn "Docker non è ancora attivo — risolvi prima."
    echo ""
  fi
fi

if [ "$CAN_PROCEED" -eq 1 ]; then
  ok "Il sistema sembra pronto per ritentare la build."
  echo ""
  info "Passi successivi consigliati:"
  info "  1. ./04.sh   ← verifica pre-build (PBF, Docker, disco, RAM, swap)"
  info "  2. ./05.sh   ← avvia la build Valhalla in background (screen)"
  info "  3. ./02.sh   ← monitora la build (in un'altra sessione SSH)"
  echo ""
  if confirm "Eseguire ./04.sh ora per il check pre-build?"; then
    echo ""
    "$SCRIPT_DIR/04.sh"
    RC=$?
    echo ""
    if [ "$RC" -eq 0 ]; then
      ok "04.sh superato — puoi eseguire ./05.sh per avviare la build."
    else
      warn "04.sh ha rilevato problemi — risolvi i [FAIL] indicati prima di procedere con 05.sh."
    fi
  else
    info "Quando sei pronto: ./04.sh && ./05.sh"
  fi
else
  warn "Risolvi i problemi segnalati sopra, poi esegui: ./04.sh && ./05.sh"
fi

echo ""
echo "=== Recovery guidato completato ==="
