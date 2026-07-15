#!/usr/bin/env bash
# =============================================================================
# BikerLink — check-tc-repo-drift.sh
# Controllo RAPIDO: il checkout app sul ThinkCentre (~/bikerlink) è in deriva
# rispetto a origin/main?
#
# PERCHÉ ESISTE:
#   Il checkout ~/bikerlink sul ThinkCentre può restare centinaia di commit
#   indietro rispetto a origin/main, con la copia locale dei Modelfile STALE
#   (es. Bowie con `FROM mistral-nemo:latest` quando origin/main è già a
#   `FROM qwen3:1.7b`). Buildare un modello custom (`ollama create`) da quel
#   checkout usa il BASE SBAGLIATO senza errori: `ollama list` sembra normale.
#   Questo script rende la deriva VISIBILE in un colpo solo, prima di buildare.
#
# COSA CONTROLLA:
#   1. Quanti commit indietro è HEAD rispetto a origin/<branch>.
#   2. Se i file di build dei modelli custom (setup + Modelfile) differiscono
#      da origin/<branch>, mostrando anche la riga FROM locale vs remota.
#   3. Se il working tree ha edit locali non committati su quei file.
#
# UTILIZZO (sul ThinkCentre):
#   bash ~/bikerlink/scripts/check-tc-repo-drift.sh
#
# UTILIZZO (dalla sandbox Replit, via skill thinkcentre-access):
#   python3 .agents/skills/thinkcentre-access/tc.py exec \
#     "bash ~/bikerlink/scripts/check-tc-repo-drift.sh"
#
# Override (env):
#   SETUP_OLLAMA_BRANCH=<branch>   Ramo di confronto (default: main).
#   NO_FETCH=1                     Non fare git fetch (usa lo stato locale già noto).
#
# EXIT CODE:
#   0 = nessuna deriva sui file di build (safe per buildare).
#   1 = deriva rilevata (i file di build NON combaciano con origin/<branch>).
#   2 = impossibile verificare (non un repo git / fetch fallito).
# =============================================================================

set -uo pipefail

BRANCH="${SETUP_OLLAMA_BRANCH:-main}"
TRACKED_BUILD_FILES=(
  "scripts/setup-ollama-server.sh"
  "scripts/ollama-modelfile/BikerLink-Bowie.Modelfile"
  "scripts/ollama-modelfile/BikerLink-Horus.Modelfile"
)

log()  { echo -e "\033[1;34m[DRIFT]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[ OK  ]\033[0m $*"; }
warn() { echo -e "\033[1;33m[WARN ]\033[0m $*"; }
err()  { echo -e "\033[1;31m[DRIFT]\033[0m $*" >&2; }

echo "============================================================"
echo "BikerLink — check-tc-repo-drift (vs origin/${BRANCH})"
echo "$(date)"
echo "============================================================"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
if [[ -z "$REPO_ROOT" ]]; then
  err "Non sono in un repository git. Esegui dallo checkout ~/bikerlink."
  exit 2
fi
log "Repository: $REPO_ROOT"

export GIT_TERMINAL_PROMPT=0
if [[ "${NO_FETCH:-0}" != "1" ]]; then
  if ! git -C "$REPO_ROOT" fetch origin "$BRANCH" >/dev/null 2>&1; then
    err "git fetch origin ${BRANCH} fallito — impossibile verificare la deriva."
    err "Controlla rete/credenziali git (vedi anche scripts/pulla.sh), oppure NO_FETCH=1."
    exit 2
  fi
else
  warn "NO_FETCH=1: uso lo stato remoto già in cache (potrebbe non essere aggiornato)."
fi

if ! git -C "$REPO_ROOT" rev-parse --verify "origin/${BRANCH}" >/dev/null 2>&1; then
  err "origin/${BRANCH} non risolvibile."
  exit 2
fi

# ── Distanza in commit ────────────────────────────────────────────────────────
BEHIND="$(git -C "$REPO_ROOT" rev-list --count "HEAD..origin/${BRANCH}" 2>/dev/null || echo "?")"
AHEAD="$(git -C "$REPO_ROOT" rev-list --count "origin/${BRANCH}..HEAD" 2>/dev/null || echo "?")"
LOCAL_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "?")"
REMOTE_SHA="$(git -C "$REPO_ROOT" rev-parse --short "origin/${BRANCH}" 2>/dev/null || echo "?")"
log "HEAD locale: ${LOCAL_SHA}  |  origin/${BRANCH}: ${REMOTE_SHA}"
if [[ "$BEHIND" =~ ^[0-9]+$ && "$BEHIND" -gt 0 ]]; then
  warn "Il checkout è ${BEHIND} commit INDIETRO rispetto a origin/${BRANCH} (ahead: ${AHEAD})."
else
  ok "Il checkout è allineato a origin/${BRANCH} (indietro: ${BEHIND}, avanti: ${AHEAD})."
fi

# ── Confronto file di build ───────────────────────────────────────────────────
DRIFT=0
for f in "${TRACKED_BUILD_FILES[@]}"; do
  if [[ ! -e "$REPO_ROOT/$f" ]]; then
    warn "File assente in questo checkout (salto): $f"
    continue
  fi

  # Deriva vs origin (working tree ≠ origin/<branch>).
  if git -C "$REPO_ROOT" diff --quiet "origin/${BRANCH}" -- "$f" 2>/dev/null; then
    ok "Allineato con origin/${BRANCH}: $f"
  else
    DRIFT=1
    err "DERIVA: $f differisce da origin/${BRANCH}"
    # Per i Modelfile, mostra esplicitamente la riga FROM (base model) locale vs remota.
    case "$f" in
      *.Modelfile)
        local_from="$(grep -m1 -E '^[[:space:]]*FROM[[:space:]]' "$REPO_ROOT/$f" | awk '{print $2}' || true)"
        remote_from="$(git -C "$REPO_ROOT" show "origin/${BRANCH}:$f" 2>/dev/null \
          | grep -m1 -E '^[[:space:]]*FROM[[:space:]]' | awk '{print $2}' || true)"
        err "        FROM locale : ${local_from:-<n/d>}"
        err "        FROM origin : ${remote_from:-<n/d>}"
        ;;
    esac
  fi

  # Edit locali non committati sul file (anche se combacia con origin, segnalali).
  if [[ -n "$(git -C "$REPO_ROOT" status --porcelain -- "$f" 2>/dev/null)" ]]; then
    warn "Edit locali NON committati su: $f"
  fi
done

echo "------------------------------------------------------------"
if [[ "$DRIFT" -eq 1 ]]; then
  err "RISULTATO: DERIVA sui file di build dei modelli — NON buildare così."
  err "Riallinea SOLO i file di build (checkout mirato, no pull completo):"
  err "  git -C \"$REPO_ROOT\" fetch origin ${BRANCH}"
  err "  git -C \"$REPO_ROOT\" checkout origin/${BRANCH} -- ${TRACKED_BUILD_FILES[*]}"
  err "Oppure sync completo: bash scripts/pulla.sh"
  err "Nota: setup-ollama-server.sh esegue già questo check (STEP 0) prima di 'ollama create'."
  exit 1
fi

ok "RISULTATO: nessuna deriva sui file di build — safe per 'ollama create'."
exit 0
