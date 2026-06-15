#!/usr/bin/env bash
# =============================================================================
# BikerLink — pulla.sh
# Sincronizza il ThinkCentre con l'ultimo commit di main su GitHub.
# Script speculare a scripts/pusha ma in direzione opposta (GitHub → ThinkCentre).
#
# PRIMO UTILIZZO (una-tantum):
#   git pull origin main      ← pull manuale per ottenere questo script
#   bash scripts/pulla.sh     ← da qui in poi usa solo questo
#
# UTILIZZO NORMALE:
#   bash scripts/pulla.sh             # sync pulito
#   bash scripts/pulla.sh --restart   # sync + docker compose up -d
#   bash scripts/pulla.sh -r          # alias --restart
#
# AUTENTICAZIONE:
#   Se GITHUB_TOKEN è nell'env: autenticazione HTTPS via GIT_ASKPASS (un file
#   temporaneo chmod 700 in /tmp). Il token non viene mai scritto in .git/config,
#   non appare nei log, non compare negli args dei processi git.
#   Altrimenti: usa le credenziali git già configurate sul ThinkCentre (SSH,
#   credential helper, ecc.) — il remote 'origin' viene usato così com'è.
#   Il remote URL non viene modificato in nessun caso.
#
# AUTO-RECOVERY (senza input utente):
#   Livello 1 — Rimozione lock file stantii
#   Livello 2 — Reset working tree sporco
#   Livello 3 — Fix detached HEAD (fallback a L6 se non risolvibile)
#   Livello 4 — git fetch --prune origin con retry 3x (backoff 5/15/30s)
#   Livello 5 — git reset --hard origin/main (storia divergente)
#   Livello 6 — Re-clone nucleare + preservazione .env*
#
# Log dettagliato: /tmp/pulla.log
# =============================================================================

set -euo pipefail

# ── Costanti ─────────────────────────────────────────────────────────────────
REPO_HTTPS_BASE="https://github.com/Andreamasteri/Bikerlink.git"
LOG_FILE="/tmp/pulla.log"
BRANCH="main"
MAX_RETRIES=3
BACKOFF_SECS=(5 15 30)
ASKPASS_SCRIPT=""

# ── Cleanup on exit (rimuove askpass temporaneo) ─────────────────────────────
_cleanup() {
  rm -f "${ASKPASS_SCRIPT:-}"
}
trap _cleanup EXIT

# ── Colori / output ──────────────────────────────────────────────────────────
log()  { local msg="[$(date '+%H:%M:%S')] $*";      echo -e "\033[1;34m[PULLA]\033[0m $*"; echo "$msg" >> "$LOG_FILE"; }
ok()   { local msg="[$(date '+%H:%M:%S')] OK  $*";  echo -e "\033[1;32m[ OK  ]\033[0m $*"; echo "$msg" >> "$LOG_FILE"; }
warn() { local msg="[$(date '+%H:%M:%S')] WARN $*"; echo -e "\033[1;33m[WARN ]\033[0m $*"; echo "$msg" >> "$LOG_FILE"; }
err()  { local msg="[$(date '+%H:%M:%S')] FAIL $*"; echo -e "\033[1;31m[FAIL ]\033[0m $*" >&2; echo "$msg" >> "$LOG_FILE"; }
die()  { err "$*"; exit 1; }

# ── Parsing flag ─────────────────────────────────────────────────────────────
RESTART=0
for arg in "$@"; do
  case "$arg" in
    --restart|-r) RESTART=1 ;;
    *) warn "Flag sconosciuto ignorato: $arg" ;;
  esac
done

# ── Intestazione ─────────────────────────────────────────────────────────────
echo "============================================================"
echo "BikerLink — pulla.sh (GitHub → ThinkCentre)"
echo "$(date)"
echo "============================================================"
echo "[$(date '+%H:%M:%S')] === pulla.sh avviato ===" >> "$LOG_FILE"

# ── Rilevamento directory repo ───────────────────────────────────────────────
REPO_DIR="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
if [[ -z "$REPO_DIR" ]]; then
  die "Non sono dentro un repository git. Esegui lo script dalla root del repo."
fi
cd "$REPO_DIR"
log "Repository: $REPO_DIR"

# Cattura l'URL configurata per 'origin' prima di qualsiasi modifica.
# Questa URL viene usata per il re-clone nucleare (L6) e per il ripristino.
# Può essere SSH (git@github.com:...) o HTTPS — viene preservata com'è.
ORIGIN_URL="$(git remote get-url origin 2>/dev/null || echo "$REPO_HTTPS_BASE")"

# ── Autenticazione ───────────────────────────────────────────────────────────
# Se GITHUB_TOKEN è presente:
#   - Configura GIT_ASKPASS (file temporaneo chmod 700) per auth HTTPS
#   - Riscrive il remote 'origin' a HTTPS solo per la durata dello script,
#     poi lo ripristina all'URL originale via trap EXIT
#   - Token MAI nei log, MAI in URL visibili, MAI su disco dopo EXIT
# Se GITHUB_TOKEN è assente:
#   - Il remote 'origin' non viene toccato (SSH, credential helper, ecc.)
#   - L6 clona dalla stessa ORIGIN_URL (SSH o HTTPS com'è configurato)

export GIT_TERMINAL_PROMPT=0

restore_origin_url() {
  # Ripristina l'URL di origin e rimuove il file askpass temporaneo
  if [[ -n "${ORIGIN_URL:-}" ]]; then
    git remote set-url origin "$ORIGIN_URL" 2>/dev/null || true
  fi
  rm -f "${ASKPASS_SCRIPT:-}"
}
# Sostituisce il trap precedente (che gestiva solo ASKPASS_SCRIPT)
trap restore_origin_url EXIT

if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  ASKPASS_SCRIPT="$(mktemp /tmp/.git-askpass-XXXXXX)"
  chmod 700 "$ASKPASS_SCRIPT"
  printf '#!/bin/sh\nexec printf "%%s\\n" "%s"\n' "$GITHUB_TOKEN" > "$ASKPASS_SCRIPT"
  export GIT_ASKPASS="$ASKPASS_SCRIPT"
  export GIT_USERNAME="x-access-token"
  # Punta origin all'URL HTTPS (senza token) per la durata dello script;
  # verrà ripristinata all'URL originale via trap EXIT.
  git remote set-url origin "$REPO_HTTPS_BASE" >> "$LOG_FILE" 2>&1 || true
  log "Autenticazione HTTPS via GIT_ASKPASS (token mai nei log; origin ripristinata all'exit)."
else
  log "Nessun GITHUB_TOKEN — uso credenziali git configurate (SSH o helper su 'origin')."
fi

# Cattura SHA pre-sync prima di qualsiasi reset/fetch
BEFORE_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo "")"

# =============================================================================
# LIVELLO 1 — Rimozione lock file stantii
# =============================================================================
log "L1: Rimozione lock file git stantii..."
LOCK_COUNT=0
while IFS= read -r -d '' lockfile; do
  warn "Rimuovo lock stantio: $lockfile"
  rm -f "$lockfile"
  LOCK_COUNT=$((LOCK_COUNT + 1))
done < <(find .git -name "*.lock" -print0 2>/dev/null || true)

if [[ $LOCK_COUNT -eq 0 ]]; then
  ok "Nessun lock file trovato."
else
  ok "Rimossi $LOCK_COUNT lock file."
fi

# =============================================================================
# LIVELLO 2 — Reset working tree sporco
# =============================================================================
log "L2: Verifica working tree..."
if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  warn "Working tree sporco — scarto modifiche locali (reset hard + clean)."
  git reset --hard HEAD >> "$LOG_FILE" 2>&1 || true
  git clean -fd >> "$LOG_FILE" 2>&1 || true
  ok "Working tree ripristinato."
else
  ok "Working tree pulito."
fi

# =============================================================================
# LIVELLO 3 — Fix detached HEAD
# (failure → non die(), ma continua verso L4/L6 in cascata)
# =============================================================================
log "L3: Verifica HEAD..."
CURRENT_BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || echo "DETACHED")"
if [[ "$CURRENT_BRANCH" == "DETACHED" ]]; then
  warn "HEAD sganciato — riaggancio a $BRANCH..."
  if git checkout "$BRANCH" >> "$LOG_FILE" 2>&1; then
    ok "HEAD riagganciato a $BRANCH."
  else
    warn "Checkout $BRANCH fallito — procedo comunque; il fetch/reset/reclone tenterà il ripristino."
  fi
else
  ok "HEAD su branch: $CURRENT_BRANCH"
fi

# =============================================================================
# LIVELLO 4 — git fetch --prune origin con retry (backoff 5/15/30s)
# =============================================================================
log "L4: git fetch --prune origin ($BRANCH)..."

FETCH_OK=0
for attempt in 1 2 3; do
  log "Tentativo fetch $attempt/$MAX_RETRIES..."
  if git fetch --prune origin >> "$LOG_FILE" 2>&1; then
    FETCH_OK=1
    ok "Fetch completato al tentativo $attempt."
    break
  else
    WAIT="${BACKOFF_SECS[$((attempt - 1))]}"
    warn "Fetch fallito (tentativo $attempt). Attendo ${WAIT}s..."
    sleep "$WAIT"
  fi
done

goto_reclone=0
if [[ "$FETCH_OK" -eq 0 ]]; then
  warn "Tutti i tentativi di fetch falliti — procedo con il re-clone nucleare (L6)."
  goto_reclone=1
fi

# =============================================================================
# LIVELLO 5 — git reset --hard origin/main + verifica SHA
# =============================================================================
do_reset_and_verify() {
  log "L5: git reset --hard origin/$BRANCH..."
  git reset --hard "origin/$BRANCH" >> "$LOG_FILE" 2>&1 || return 1

  LOCAL_SHA="$(git rev-parse HEAD 2>/dev/null || echo "")"
  REMOTE_SHA="$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "")"

  if [[ -z "$REMOTE_SHA" ]]; then
    warn "Impossibile risolvere origin/$BRANCH dopo il reset."
    return 1
  fi
  if [[ "$LOCAL_SHA" == "$REMOTE_SHA" ]]; then
    return 0
  else
    warn "SHA mismatch dopo reset: local=${LOCAL_SHA:0:8} remote=${REMOTE_SHA:0:8}"
    return 1
  fi
}

SYNC_OK=0
if [[ "$goto_reclone" -eq 0 ]]; then
  if do_reset_and_verify; then
    SYNC_OK=1
  else
    warn "Reset hard fallito o SHA mismatch — procedo con re-clone nucleare (L6)."
    goto_reclone=1
  fi
fi

# =============================================================================
# LIVELLO 6 — Re-clone nucleare (fallback finale)
# GIT_ASKPASS è già attivo nell'env se GITHUB_TOKEN era presente, quindi
# il clone usa le stesse credenziali senza token nell'URL.
# =============================================================================
do_nuclear_reclone() {
  local ts
  ts="$(date +%Y%m%d_%H%M%S)"
  local backup_dir
  backup_dir="$(dirname "$REPO_DIR")/bikerlink-backup-${ts}"

  warn "=== RE-CLONE NUCLEARE ==="
  warn "Backup in: $backup_dir"
  log "L6: Backup in corso (cp -a)..."
  cp -a "$REPO_DIR" "$backup_dir" >> "$LOG_FILE" 2>&1 \
    || { err "Backup fallito — re-clone annullato per sicurezza."; return 1; }
  ok "Backup completato: $backup_dir"

  # Preserva file .env* — find con raggruppamento corretto
  local env_files=()
  while IFS= read -r -d '' f; do
    env_files+=("$f")
  done < <(find "$REPO_DIR" -maxdepth 2 \( -name '.env' -o -name '*.env*' \) -print0 2>/dev/null || true)
  log "Trovati ${#env_files[@]} file .env* da preservare."

  # Svuota la directory repo (non la dir stessa per mantenere mount point)
  log "Svuoto la directory repo..."
  find "$REPO_DIR" -mindepth 1 -maxdepth 1 ! -name "." -exec rm -rf {} + >> "$LOG_FILE" 2>&1 || true

  # Clone fresco.
  # - Se GITHUB_TOKEN è presente → usa REPO_HTTPS_BASE + GIT_ASKPASS (già attivo nell'env).
  #   ORIGIN_URL potrebbe essere SSH e non funzionerebbe con token HTTPS.
  # - Se GITHUB_TOKEN è assente → usa ORIGIN_URL (SSH, HTTPS+helper, ecc.) com'è configurato.
  local clone_url
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    clone_url="$REPO_HTTPS_BASE"
    log "Clone fresco via HTTPS + GIT_ASKPASS..."
  else
    clone_url="${ORIGIN_URL:-$REPO_HTTPS_BASE}"
    log "Clone fresco da URL originale di origin (SSH o HTTPS)..."
  fi
  git clone "$clone_url" "$REPO_DIR" >> "$LOG_FILE" 2>&1 \
    || { err "git clone fallito."; return 1; }

  # Ripristina file .env* dal backup
  if [[ "${#env_files[@]}" -gt 0 ]]; then
    log "Ripristino file .env* dal backup..."
    for ef in "${env_files[@]}"; do
      local rel="${ef#"$REPO_DIR"/}"
      local dest="$REPO_DIR/$rel"
      local dest_dir
      dest_dir="$(dirname "$dest")"
      mkdir -p "$dest_dir"
      cp "$backup_dir/$rel" "$dest" 2>/dev/null \
        && ok "  Ripristinato: $rel" \
        || warn "  Impossibile ripristinare: $rel"
    done
  fi

  cd "$REPO_DIR"

  # Verifica SHA finale — sia REMOTE_SHA vuoto sia mismatch sono errori
  LOCAL_SHA="$(git rev-parse HEAD 2>/dev/null || echo "")"
  REMOTE_SHA="$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "")"

  if [[ -z "$LOCAL_SHA" ]]; then
    err "Impossibile risolvere HEAD dopo il re-clone."
    return 1
  fi
  if [[ -z "$REMOTE_SHA" ]]; then
    err "Impossibile verificare SHA remoto dopo re-clone (rete/auth?)."
    return 1
  fi
  if [[ "$LOCAL_SHA" == "$REMOTE_SHA" ]]; then
    ok "Re-clone completato. SHA: ${LOCAL_SHA:0:8}"
    return 0
  else
    err "SHA mismatch dopo re-clone: local=${LOCAL_SHA:0:8} remote=${REMOTE_SHA:0:8}"
    return 1
  fi
}

if [[ "$goto_reclone" -eq 1 ]]; then
  if do_nuclear_reclone; then
    SYNC_OK=1
  else
    die "Re-clone nucleare fallito. Controlla $LOG_FILE e intervieni manualmente."
  fi
fi

# =============================================================================
# Risultato sync — log compatto dei nuovi commit
# =============================================================================
if [[ "$SYNC_OK" -eq 1 ]]; then
  LOCAL_SHA="$(git rev-parse HEAD)"
  LOCAL_SHA_SHORT="$(git rev-parse --short HEAD)"

  NEW_COUNT=0
  if [[ -n "${BEFORE_SHA:-}" ]]; then
    NEW_COMMITS="$(git log "${BEFORE_SHA}..HEAD" --oneline 2>/dev/null || true)"
    if [[ -n "$NEW_COMMITS" ]]; then
      NEW_COUNT="$(echo "$NEW_COMMITS" | wc -l | tr -d ' ')"
      log "Nuovi commit ($NEW_COUNT):"
      echo "$NEW_COMMITS" | while IFS= read -r line; do
        echo "  → $line"
        echo "  → $line" >> "$LOG_FILE"
      done
    else
      log "Nessun nuovo commit — già aggiornato."
    fi
  else
    log "SHA pre-sync non disponibile (re-clone nucleare) — conteggio commit saltato."
  fi

  echo ""
  echo -e "\033[1;32m✅ SYNC OK\033[0m — SHA: ${LOCAL_SHA_SHORT} | +${NEW_COUNT} commit"
  echo "[$(date '+%H:%M:%S')] SYNC OK — SHA: $LOCAL_SHA | +${NEW_COUNT} commit" >> "$LOG_FILE"
else
  die "Sync fallito. Controlla $LOG_FILE."
fi

# =============================================================================
# Flag --restart / -r — docker compose up -d --remove-orphans
# (errore docker non fatale: loggato ma exit code rimane 0)
# =============================================================================
if [[ "$RESTART" -eq 1 ]]; then
  log "Flag --restart attivo: docker compose up -d --remove-orphans..."
  if command -v docker >/dev/null 2>&1; then
    COMPOSE_OUT="$(docker compose up -d --remove-orphans 2>&1)" && COMPOSE_RC=0 || COMPOSE_RC=$?
    if [[ $COMPOSE_RC -eq 0 ]]; then
      ok "docker compose up -d completato."
      echo "$COMPOSE_OUT" | { grep -E "^(Container|Network|Volume)" || true; } | while IFS= read -r line; do
        echo "  🐳 $line"
      done
    else
      warn "docker compose up -d ha restituito exit code $COMPOSE_RC (non fatale)."
      echo "$COMPOSE_OUT" | tail -10 | while IFS= read -r line; do
        warn "  docker: $line"
        echo "[$(date '+%H:%M:%S')] docker: $line" >> "$LOG_FILE"
      done
    fi
  else
    warn "docker non trovato — flag --restart ignorato."
  fi
fi

echo ""
echo "Log completo: $LOG_FILE"
exit 0
