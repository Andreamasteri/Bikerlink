#!/usr/bin/env bash
# Accesso durevole a BikerBlog — copia di riferimento READ-ONLY.
# Task: #15 (Accesso durevole a BikerBlog)
#
# BikerBlog (github.com/Andreamasteri/bikerblog) è il repo "gemello" di
# riferimento di BikerLink: durante il down di BikerLink l'ecosistema
# (agenti AI Horus/Bowie/Nadir/Ares, AI-Hub, pipeline) è stato
# sviluppato lì. Questo script mantiene una copia locale sempre consultabile.
#
# Uso:
#   bash scripts/refresh-bikerblog.sh          # clona (prima volta) o aggiorna
#   bash scripts/refresh-bikerblog.sh --status # stampa solo il commit corrente
#
# Caratteristiche:
#   - Idempotente: clone alla prima esecuzione, fetch + reset --hard le volte
#     successive (la copia è SOLA LETTURA di riferimento, non un working tree).
#   - Auth: usa il secret BIKERBLOG_GITHUB_TOKEN se presente (fallback robusto
#     per repo privato / rate limit GitHub); altrimenti clone pubblico HTTPS
#     (il repo è pubblico oggi).
#   - Il token non viene MAI stampato in chat né nei log (git non lo echoa e la
#     URL con credenziali non viene mai emessa su stdout/stderr).
#   - La cartella di destinazione è ignorata da git (.gitignore) → non finisce
#     nel repo né gonfia il Repl layer del deploy.
#
# La cartella di riferimento è .bikerblog-ref/ (vedi .gitignore).

set -euo pipefail

REPO_SLUG="Andreamasteri/bikerblog"
PUBLIC_URL="https://github.com/${REPO_SLUG}.git"
DEST_DIR=".bikerblog-ref"

# Radice del repo BikerLink (una dir sopra scripts/).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGET="$ROOT/$DEST_DIR"

log()  { echo "[refresh-bikerblog] $*"; }

# URL con credenziali costruita solo in memoria; mai emessa su stdout/stderr.
build_auth_url() {
  if [ -n "${BIKERBLOG_GITHUB_TOKEN:-}" ]; then
    # x-access-token è lo username convenzionale per i PAT GitHub via HTTPS.
    printf 'https://x-access-token:%s@github.com/%s.git' "$BIKERBLOG_GITHUB_TOKEN" "$REPO_SLUG" # pragma: allowlist secret
  else
    printf '%s' "$PUBLIC_URL"
  fi
}

print_head() {
  local sha short subject
  sha="$(git -C "$TARGET" rev-parse HEAD)"
  short="$(git -C "$TARGET" rev-parse --short HEAD)"
  subject="$(git -C "$TARGET" log -1 --pretty=%s)"
  local when
  when="$(git -C "$TARGET" log -1 --pretty=%ci)"
  log "BikerBlog @ ${short} (${sha})"
  log "  data:    ${when}"
  log "  commit:  ${subject}"
}

# --status: stampa solo il commit corrente (se la copia esiste).
if [ "${1:-}" = "--status" ]; then
  if [ -d "$TARGET/.git" ]; then
    print_head
    exit 0
  fi
  log "Nessuna copia locale in $DEST_DIR/. Esegui 'bash scripts/refresh-bikerblog.sh' per crearla."
  exit 1
fi

if [ -n "${BIKERBLOG_GITHUB_TOKEN:-}" ]; then
  log "Auth: secret BIKERBLOG_GITHUB_TOKEN presente (valore non stampato)."
else
  log "Auth: nessun secret BIKERBLOG_GITHUB_TOKEN → clone pubblico (repo pubblico)."
fi

AUTH_URL="$(build_auth_url)"

if [ -d "$TARGET/.git" ]; then
  log "Copia esistente in $DEST_DIR/ → aggiorno (fetch + reset --hard)."
  # Aggiorna la remote URL in caso il token sia cambiato (silenzioso).
  git -C "$TARGET" remote set-url origin "$AUTH_URL" >/dev/null 2>&1
  # Determina il branch di default della remote (main/master/…).
  git -C "$TARGET" fetch --prune origin >/dev/null 2>&1
  DEFAULT_BRANCH="$(git -C "$TARGET" remote show origin 2>/dev/null \
    | sed -n 's/.*HEAD branch: //p')"
  DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"
  git -C "$TARGET" checkout -q "$DEFAULT_BRANCH" 2>/dev/null || true
  git -C "$TARGET" reset --hard "origin/$DEFAULT_BRANCH" >/dev/null 2>&1
else
  log "Nessuna copia locale → clone in $DEST_DIR/."
  rm -rf "$TARGET"
  git clone --quiet "$AUTH_URL" "$TARGET"
fi

# Rimuove la URL con credenziali dalla config on-disk: la ripristina il prossimo
# refresh a partire dal secret. Evita di lasciare il token in .git/config.
git -C "$TARGET" remote set-url origin "$PUBLIC_URL" >/dev/null 2>&1

log "Aggiornamento completato."
print_head
