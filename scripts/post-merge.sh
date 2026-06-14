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

# ── FIX I18N __TODO__ DUPLICATI (anti-regressione) ───────────
# Rimuove automaticamente chiavi __TODO__ duplicate dai file lib/i18n/*.ts
# prima del gate ratchet. Pattern: task che aggiungono stub __TODO__ per
# chiavi già tradotte causano TS1117 e superamento baseline ad ogni merge.
echo "════════════════════════════════════════"
echo "  Fix i18n __TODO__ duplicati (auto)"
echo "════════════════════════════════════════"
I18N_EXIT=0
npx tsx scripts/fix-i18n-todo-duplicates.ts 2>&1 || I18N_EXIT=$?
if [ "$I18N_EXIT" -ne 0 ]; then
  echo "⚠️  fix-i18n-todo-duplicates ha restituito exit ${I18N_EXIT} — verificare manualmente."
fi
echo ""

# ── GATE "600 RIGHE PER FILE" POST-MERGE ─────────────────────
# Subito dopo il merge (prima di chiudere): se un merge ha portato
# dentro un file > 600 senza marker, falliamo qui e lasciamo
# evidenza nei log. Vedi replit.md → "⛔ REGOLA FERREA — Limite 600 righe per file".
# N.B.: quando si splitta un file, i file risultanti vanno tenuti ≤450 righe.
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

# ── GUARD PORTA DEPLOY (.replit) ─────────────────────────────
# La porta di deploy DEVE essere 5000. Se qualcuno la cambia (es. PORT=8081)
# il container Replit non risponde all'healthcheck → deploy fallisce in silenzio.
echo "════════════════════════════════════════"
echo "  Guard porta deploy (.replit)"
echo "════════════════════════════════════════"
DEPLOY_PORT_OK=true
if grep -q 'PORT=8081' .replit 2>/dev/null; then
  echo "❌ ERRORE: .replit contiene PORT=8081 nel comando di deploy!"
  echo "   La porta di deploy DEVE essere PORT=5000."
  echo "   Fix: cambia la riga 'run' in [deployment] da PORT=8081 a PORT=5000."
  DEPLOY_PORT_OK=false
fi
if ! grep -q 'PORT=5000' .replit 2>/dev/null; then
  echo "❌ ERRORE: .replit non contiene PORT=5000 nel comando di deploy!"
  echo "   Verifica la sezione [deployment] → run."
  DEPLOY_PORT_OK=false
fi
if [ "$DEPLOY_PORT_OK" = true ]; then
  echo "✅ Porta deploy corretta: PORT=5000 (deploy stabile)."
else
  echo "⚠️  Porta deploy errata rilevata — il prossimo publish fallirà."
  echo "   Usa deployConfig() per correggere (non editare .replit direttamente)."
fi
echo "════════════════════════════════════════"
echo ""

# ── GUARD RELEASE_NUMBER ─────────────────────────────────────
# RELEASE_NUMBER deve essere derivato da app.json a runtime (non hardcoded).
# Se qualcuno lo reintroduce come costante numerica, questo guard lo blocca.
echo "════════════════════════════════════════"
echo "  Guard RELEASE_NUMBER (buildInfo.ts)"
echo "════════════════════════════════════════"
RELEASE_NUMBER_HARDCODED=false
if grep -qE '^export const RELEASE_NUMBER(\s*:[^=]+)?\s*=\s*[0-9]+' constants/buildInfo.ts 2>/dev/null; then
  RELEASE_NUMBER_HARDCODED=true
  HARDCODED_VALUE=$(grep -oP 'RELEASE_NUMBER(\s*:[^=]+)?\s*=\s*\K[0-9]+' constants/buildInfo.ts | head -1 || echo "?")
  VERSION_CODE=$(node -p "require('./app.json').expo.android.versionCode" 2>/dev/null || echo "?")
  echo "❌ ERRORE: RELEASE_NUMBER è hardcoded (${HARDCODED_VALUE}) in constants/buildInfo.ts!"
  echo "   Deve essere derivato da app.json a runtime:"
  echo "   import appJson from '../app.json';"
  echo "   export const RELEASE_NUMBER: number = appJson.expo.android.versionCode;"
  if [ "$HARDCODED_VALUE" != "$VERSION_CODE" ]; then
    echo "   ⚠️  Disallineamento rilevato: buildInfo.ts=${HARDCODED_VALUE}  app.json=${VERSION_CODE}"
  fi
else
  echo "✅ RELEASE_NUMBER derivato a runtime da app.json — nessun valore hardcoded."
fi
echo "════════════════════════════════════════"
echo ""
if [ "$RELEASE_NUMBER_HARDCODED" = true ]; then
  echo "❌ Guard RELEASE_NUMBER fallito — correggere constants/buildInfo.ts prima di procedere."
  exit 1
fi

# ── GUARD RUNTIME_VERSION ────────────────────────────────────
# RUNTIME_VERSION deve essere derivato da app.json a runtime (non hardcoded).
# Se qualcuno lo reintroduce come stringa letterale, questo guard lo blocca.
echo "════════════════════════════════════════"
echo "  Guard RUNTIME_VERSION (buildInfo.ts)"
echo "════════════════════════════════════════"
RUNTIME_VERSION_HARDCODED=false
if grep -qE '^export const RUNTIME_VERSION(\s*:[^=]+)?\s*=\s*"[^"]*"' constants/buildInfo.ts 2>/dev/null; then
  RUNTIME_VERSION_HARDCODED=true
  HARDCODED_RTVER=$(grep -oP 'RUNTIME_VERSION(\s*:[^=]+)?\s*=\s*"\K[^"]+' constants/buildInfo.ts || echo "?")
  APP_RUNTIME=$(node -p "require('./app.json').expo.runtimeVersion" 2>/dev/null || echo "?")
  echo "❌ ERRORE: RUNTIME_VERSION è hardcoded (\"${HARDCODED_RTVER}\") in constants/buildInfo.ts!"
  echo "   Deve essere derivato da app.json a runtime:"
  echo "   import appJson from '../app.json';"
  echo "   export const RUNTIME_VERSION: string = appJson.expo.runtimeVersion;"
  if [ "$HARDCODED_RTVER" != "$APP_RUNTIME" ]; then
    echo "   ⚠️  Disallineamento rilevato: buildInfo.ts=\"${HARDCODED_RTVER}\"  app.json=${APP_RUNTIME}"
  fi
else
  echo "✅ RUNTIME_VERSION derivato a runtime da app.json — nessun valore hardcoded."
fi
echo "════════════════════════════════════════"
echo ""
if [ "$RUNTIME_VERSION_HARDCODED" = true ]; then
  echo "❌ Guard RUNTIME_VERSION fallito — correggere constants/buildInfo.ts prima di procedere."
  exit 1
fi

# ── GUARD REGISTRY ↔ MIGRATION DRIFT (pre-boot guard) ────────
# Verifica che ogni tabella dichiarata nel registry Drizzle sia coperta da
# almeno un file di migration numerato. Stessa guardia che gira in boot-sequence
# Phase 2b — qui viene anticipata al merge così lo sviluppatore riceve feedback
# immediato senza dover avviare il server.
echo "════════════════════════════════════════"
echo "  Guard Registry ↔ Migration drift"
echo "════════════════════════════════════════"
SCHEMA_DRIFT_EXIT=0
npx tsx server/scripts/check-schema-migration-drift.ts 2>&1 || SCHEMA_DRIFT_EXIT=$?
if [ "$SCHEMA_DRIFT_EXIT" -eq 0 ]; then
  echo "✅ Registry ↔ Migration: nessun nuovo drift rilevato."
elif [ "$SCHEMA_DRIFT_EXIT" -eq 2 ]; then
  echo "⚠️  Registry ↔ Migration check: impossibile leggere le migration (exit 2) — verificare manualmente."
else
  echo "❌ Registry ↔ Migration DRIFT rilevato — tabelle o colonne senza migration numerata."
  echo "   Crea il file migrations/NNNN_*.sql con le DDL mancanti prima di procedere."
  echo "════════════════════════════════════════"
  echo ""
  exit "$SCHEMA_DRIFT_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GUARD INDICI DESC/WHERE — INDEX DRIFT ────────────────────
# Verifica che gli indici speciali (DESC / WHERE) dello schema Drizzle TS
# siano allineati con le migration SQL e con il DB live.
# Un DROP+CREATE silenzioso nelle migration reintroduce drift a ogni deploy.
echo "════════════════════════════════════════"
echo "  Guard Index Drift (DESC/WHERE)"
echo "════════════════════════════════════════"
INDEX_DRIFT_EXIT=0
npx tsx scripts/check-index-drift.ts 2>&1 || INDEX_DRIFT_EXIT=$?
if [ "$INDEX_DRIFT_EXIT" -eq 0 ]; then
  echo "✅ Index Drift: nessun drift DESC/WHERE rilevato."
else
  echo "❌ Index Drift RILEVATO — indici speciali (DESC/WHERE) non allineati."
  echo "   Aggiungere una migration correttiva o correggere lo schema Drizzle TS."
  echo "════════════════════════════════════════"
  echo ""
  exit "$INDEX_DRIFT_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

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

# ── GENERA PDF MATCHING POST-MERGE ───────────────────────────
# Rigenera docs/matching-system.pdf (e la copia in server/public/)
# da docs/matching-system.md dopo ogni merge, così la route
# GET /api/exports/matching-system.pdf serve sempre la versione
# aggiornata al codice senza richiedere un passo manuale.
echo "════════════════════════════════════════"
echo "  Generazione PDF matching system"
echo "════════════════════════════════════════"
PDF_EXIT=0
node scripts/generate-matching-pdf.mjs 2>&1 || PDF_EXIT=$?
if [ "$PDF_EXIT" -ne 0 ]; then
  echo "⚠️  generate-matching-pdf.mjs ha restituito exit ${PDF_EXIT} — PDF potrebbe essere stale."
else
  echo "✅ PDF matching system aggiornato."
fi
echo "════════════════════════════════════════"
echo ""

# ── GENERA PDF ANALISI COMPETITOR POST-MERGE ─────────────────
# Rigenera server/public/assets/competitor-analysis.pdf e .png
# da scripts/generate-competitor-analysis.js dopo ogni merge,
# così la card "Analisi Competitor" in /docs mostra sempre
# il PDF aggiornato senza intervento manuale.
echo "════════════════════════════════════════"
echo "  Generazione PDF analisi competitor"
echo "════════════════════════════════════════"
COMPETITOR_PDF_EXIT=0
node scripts/generate-competitor-analysis.js 2>&1 || COMPETITOR_PDF_EXIT=$?
if [ "$COMPETITOR_PDF_EXIT" -ne 0 ]; then
  echo "⚠️  generate-competitor-analysis.js ha restituito exit ${COMPETITOR_PDF_EXIT} — PDF potrebbe essere stale."
else
  echo "✅ PDF analisi competitor aggiornato."
fi
echo "════════════════════════════════════════"
echo ""

exit 0
