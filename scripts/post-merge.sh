#!/bin/bash
set -e

echo "Running post-merge setup..."

# ── SYNC node_modules POST-MERGE (Task #2573) ────────────────
# I task agent vivono in ambienti isolati: node_modules NON è
# sincronizzato dai merge. Solo package.json + package-lock.json
# vengono committati. Senza questo step, il server crasha con
# "Cannot find module 'X'" per ogni pacchetto installato in un
# task ma assente nel node_modules dell'app principale.
if [ -f "package-lock.json" ]; then
  echo "→ Sincronizzazione node_modules (npm install dal lockfile)..."
  if npm install --no-audit --no-fund 2>&1; then
    echo "✅ node_modules sincronizzato."
  else
    NPM_EXIT=$?
    echo "❌ npm install fallito (exit ${NPM_EXIT}) — abort post-merge per evitare stato incoerente."
    exit "${NPM_EXIT}"
  fi
else
  echo "⚠️  package-lock.json mancante — sync node_modules saltato."
fi

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

GH_TOKEN="${GITHUB_TOKEN:-${GITHUB_PAT:-}}"
if [ -n "$GH_TOKEN" ]; then
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  echo "→ Push branch '${CURRENT_BRANCH}' su GitHub..."
  GIT_PUSH_EXIT=0
  git push "https://${GH_TOKEN}:x-oauth-basic@github.com/Andreamasteri/Bikerlink.git" \
    "HEAD:${CURRENT_BRANCH}" 2>&1 || GIT_PUSH_EXIT=$?
  if [ "$GIT_PUSH_EXIT" -eq 0 ]; then
    echo "✅ GitHub sincronizzato correttamente (branch: ${CURRENT_BRANCH})."
  else
    echo "❌ Push GitHub fallito (exit ${GIT_PUSH_EXIT}) — verificare il token e la connettività."
  fi
else
  echo "⚠️  GITHUB_TOKEN non impostato — sincronizzazione GitHub saltata."
  echo "   Imposta il secret GITHUB_TOKEN nelle variabili d'ambiente Replit."
fi

echo "════════════════════════════════════════"
echo ""

# ── GATE "600 RIGHE PER FILE" POST-MERGE ─────────────────────
# Subito dopo il merge (prima di chiudere): se un merge ha portato
# dentro un file > 600 senza marker, falliamo qui e lasciamo
# evidenza nei log. Vedi replit.md → "⛔ REGOLA FERREA — Limite 600 righe per file".
echo "════════════════════════════════════════"
echo "  Ratchet 600 righe per file (post-merge)"
echo "════════════════════════════════════════"
RATCHET_EXIT=0
bash scripts/check-large-files-ratchet.sh || RATCHET_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$RATCHET_EXIT" -ne 0 ]; then
  echo "❌ Gate 600 righe fallito post-merge — verificare i file segnalati sopra."
  exit "$RATCHET_EXIT"
fi

# ── CLEANUP UTENTI SMOKE RESIDUI POST-MERGE ──────────────────
echo "════════════════════════════════════════"
echo "  Cleanup utenti smoke residui"
echo "════════════════════════════════════════"
CLEANUP_EXIT=0
npx tsx scripts/smoke/cleanup-orphans.ts 2>&1 || CLEANUP_EXIT=$?
if [ "$CLEANUP_EXIT" -ne 0 ]; then
  echo "⚠️  cleanup-orphans.ts ha restituito exit ${CLEANUP_EXIT} — verificare manualmente."
else
  echo "✅ Cleanup smoke completato."
fi
echo "════════════════════════════════════════"
echo ""

exit 0
