#!/usr/bin/env bash
# 00 — git pull (con stash automatico se ci sono modifiche locali)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "=== BikerLink — git pull ==="
echo "Directory: $REPO_DIR"
echo ""

STASHED=false

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[!] Modifiche locali rilevate — eseguo stash automatico..."
  git stash push -m "auto-stash prima del pull $(date '+%Y-%m-%d %H:%M:%S')"
  STASHED=true
fi

echo "[>] Pull in corso..."
if ! git pull; then
  echo ""
  echo "[ERRORE] Pull fallito. Possibili cause:"
  echo "  - Conflitto non risolvibile automaticamente"
  echo "  - Nessuna connessione a internet"
  echo "  - Remote irraggiungibile"
  if $STASHED; then
    echo ""
    echo "[!] Lo stash NON è stato ripristinato. Per recuperarlo:"
    echo "    git stash pop"
  fi
  exit 1
fi

if $STASHED; then
  echo ""
  echo "[>] Ripristino stash..."
  if ! git stash pop; then
    echo "[WARN] Conflitto durante il ripristino dello stash."
    echo "       Risolvi i conflitti e poi: git stash drop"
    exit 1
  fi
  echo "[OK] Stash ripristinato."
fi

echo ""
echo "[OK] Pull completato."
