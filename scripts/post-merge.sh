#!/bin/bash
set -e

echo "Running post-merge setup..."
npm run db:push --force 2>&1 || true

echo "Invalidating server_dist to force TypeScript recompile on next start..."
rm -f server_dist/index.js

echo "Post-merge setup complete."

# ── CONTROLLO OTA POST-MERGE ─────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "  Controllo sistema OTA post-merge"
echo "════════════════════════════════════════"

OTA_MODIFIED=$(git diff HEAD~1 HEAD --name-only 2>/dev/null | grep -c "^ota-updates\.json$" || true)

if [ "$OTA_MODIFIED" -gt 0 ]; then
  echo "⚠️  ota-updates.json modificato in questo merge — avvio validazione OTA..."
  echo ""
  OTA_EXIT=0; bash scripts/validate-ota.sh || OTA_EXIT=$?
  echo ""
  if [ "$OTA_EXIT" -ne 0 ]; then
    echo "❌ Validazione OTA: $OTA_EXIT errore/i rilevato/i — verificare prima di pubblicare."
  else
    echo "✅ Validazione OTA completata senza errori."
  fi
else
  echo "✅ ota-updates.json non modificato — sistema OTA intatto."
fi

echo "════════════════════════════════════════"
echo ""

# ── CONTROLLO IMPORT TYPESCRIPT POST-MERGE ───────────────────
echo "════════════════════════════════════════"
echo "  Controllo import TypeScript post-merge"
echo "════════════════════════════════════════"

TS_MODIFIED=$(git diff HEAD~1 HEAD --name-only 2>/dev/null | grep -cE '\.(ts|tsx)$' || true)

if [ "$TS_MODIFIED" -gt 0 ]; then
  echo "📂 $TS_MODIFIED file/i .ts/.tsx modificati — avvio controllo import..."
  echo ""

  CLIENT_EXIT=0
  SERVER_EXIT=0

  # Controllo client (tsconfig.json nella root)
  if [ -f "tsconfig.json" ]; then
    echo "→ Client (tsconfig.json)..."
    CLIENT_ERRORS=$(npx tsc --noEmit --project tsconfig.json 2>&1) || CLIENT_EXIT=$?
    if [ "$CLIENT_EXIT" -eq 0 ]; then
      echo "  ✅ Client: nessun errore di import."
    else
      echo "  ❌ Client: import rotti rilevati:"
      echo "$CLIENT_ERRORS" | sed 's/^/     /'
    fi
  else
    echo "  ⚠️  tsconfig.json non trovato — controllo client saltato."
  fi

  echo ""

  # Controllo server (server/tsconfig.json)
  if [ -f "server/tsconfig.json" ]; then
    echo "→ Server (server/tsconfig.json)..."
    SERVER_ERRORS=$(npx tsc --noEmit --project server/tsconfig.json 2>&1) || SERVER_EXIT=$?
    if [ "$SERVER_EXIT" -eq 0 ]; then
      echo "  ✅ Server: nessun errore di import."
    else
      echo "  ❌ Server: import rotti rilevati:"
      echo "$SERVER_ERRORS" | sed 's/^/     /'
    fi
  else
    echo "  ⚠️  server/tsconfig.json non trovato — controllo server saltato."
  fi

  echo ""
  if [ "$CLIENT_EXIT" -eq 0 ] && [ "$SERVER_EXIT" -eq 0 ]; then
    echo "✅ Controllo TypeScript completato: nessun import rotto."
  else
    echo "❌ Controllo TypeScript: import rotti trovati — verificare prima di pubblicare."
  fi
else
  echo "✅ Nessun file .ts/.tsx modificato — controllo import saltato."
fi

echo "════════════════════════════════════════"
echo ""


# ── SYNC GITHUB POST-MERGE ───────────────────────────────────
echo "════════════════════════════════════════"
echo "  Sincronizzazione GitHub post-merge"
echo "════════════════════════════════════════"

GITHUB_REPO_URL="https://github.com/Andreamasteri/Bikerlink.git"

if [ -n "$GITHUB_PAT" ]; then
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  echo "→ Push branch '${CURRENT_BRANCH}' su GitHub..."
  GIT_PUSH_EXIT=0
  git -c "credential.helper=!f() { echo username=x; echo password=${GITHUB_PAT}; }; f" \
    push --force "${GITHUB_REPO_URL}" "HEAD:${CURRENT_BRANCH}" 2>&1 || GIT_PUSH_EXIT=$?
  if [ "$GIT_PUSH_EXIT" -eq 0 ]; then
    echo "✅ GitHub sincronizzato correttamente (branch: ${CURRENT_BRANCH})."
  else
    echo "❌ Push GitHub fallito (exit ${GIT_PUSH_EXIT}) — verificare il GITHUB_PAT e la connettività."
  fi
else
  echo "⚠️  GITHUB_PAT non impostato — sincronizzazione GitHub saltata."
  echo "   Imposta il secret GITHUB_PAT nelle variabili d'ambiente Replit."
fi

echo "════════════════════════════════════════"
echo ""

exit 0
