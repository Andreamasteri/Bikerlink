#!/bin/bash
set -e

# ── LOCK PORTE .replit (merge=ours driver) ───────────────────
# Ri-applica il merge driver ad ogni merge, anche se il git global
# config è stato resettato da un restart Replit.
git config --global merge.ours.driver true 2>/dev/null || true
# ─────────────────────────────────────────────────────────────

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

  # ── PATCH react-native-webview index.d.ts ────────────────────
  # react-native-webview 13.17.0 dichiara WebView<P = undefined> in index.d.ts.
  # Con TypeScript 6.x strict, WebViewProps & undefined = never → tutti i JSX
  # <WebView> falliscono il typecheck. Fix: P = {} invece di P = undefined.
  RNWV_DTS="node_modules/react-native-webview/index.d.ts"
  if [ -f "$RNWV_DTS" ] && grep -q "declare class WebView<P = undefined>" "$RNWV_DTS" 2>/dev/null; then
    sed -i 's/declare class WebView<P = undefined>/declare class WebView<P = {}>/' "$RNWV_DTS"
    echo "✅ Patch react-native-webview/index.d.ts applicata (P=undefined → P={})."
  fi
  # ─────────────────────────────────────────────────────────────

  # ── FIX package-lock.json proxy Replit ───────────────────────
  if [ -f "package-lock.json" ] && grep -q "package-firewall.replit.local" package-lock.json 2>/dev/null; then
    sed -i 's|http://package-firewall\.replit\.local/npm/|https://registry.npmjs.org/|g' package-lock.json
    echo "✅ Fix package-lock.json proxy Replit applicato."
  fi
  # ─────────────────────────────────────────────────────────────
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

# ── GATE ROTTE FANTASMA app/(tabs)/ ──────────────────────────
# Expo Router registra OGNI file in app/(tabs)/ come rotta.
# Regola STRETTA:
#   - .tsx senza prefisso _ → screen legittimi (es. index.tsx, music.tsx)
#   - _layout.tsx e _layout.part2.tsx → ammessi (layout Expo Router)
#   - QUALSIASI altro file (.ts, .tsx con prefisso _, ecc.) → VIETATO
#     → spostare in components/ o lib/
# Vedi .agents/memory/expo-tabs-route-pollution.md
echo "════════════════════════════════════════"
echo "  Gate rotte fantasma app/(tabs)/  [strict]"
echo "════════════════════════════════════════"
PHANTOM_ROUTES=()
for _f in "app/(tabs)/"*; do
  [ -f "$_f" ] || continue
  _bn=$(basename "$_f")
  # ammetti solo screen .tsx senza prefisso _
  if [[ "$_bn" == _layout.tsx || "$_bn" == _layout.part2.tsx ]]; then
    continue
  fi
  if [[ "$_bn" == *.tsx && "$_bn" != _* ]]; then
    continue
  fi
  # tutto il resto è proibito: .ts, .tsx con _, ecc.
  PHANTOM_ROUTES+=("$_bn")
done
if [ ${#PHANTOM_ROUTES[@]} -eq 0 ]; then
  echo "✅ app/(tabs)/ pulita: solo screen .tsx e _layout ammessi."
else
  echo "❌ File non ammessi rilevati in app/(tabs)/:"
  for _pf in "${PHANTOM_ROUTES[@]}"; do
    echo "   ⚠️  app/(tabs)/$_pf"
  done
  echo ""
  echo "   Solo screen .tsx (senza prefisso _) e _layout.tsx sono ammessi."
  echo "   File helper, stili e utility DEVONO stare in components/ o lib/."
  echo "   Expo Router trasforma ogni file in questa cartella in una rotta."
  echo "════════════════════════════════════════"
  echo ""
  exit 1
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE ROTTE FANTASMA cartelle stack app/**/*.ts ───────────
# Expo Router registra OGNI file .ts/.tsx in app/ come rotta, in modo
# RICORSIVO (anche nelle cartelle stack: app/profile, app/giri, app/admin…).
# Qualsiasi file helper .ts co-locato in queste cartelle genera un route node
# (deeplink rotto / warning "missing the required default export").
# FIX DEFINITIVO (2026-06-22): tutti i file helper sono stati spostati in
# components/ o lib/. La regola ora è: NESSUN .ts (non-_layout) in app/
# nelle cartelle stack — né con né senza prefisso _.
# Vedi .agents/memory/expo-tabs-route-pollution.md
echo "════════════════════════════════════════"
echo "  Gate rotte fantasma stack app/**"
echo "════════════════════════════════════════"
STACK_PHANTOM=()
while IFS= read -r _f; do
  [ -n "$_f" ] && STACK_PHANTOM+=("$_f")
done < <(find app -type f -name '*.ts' ! -name '*.tsx' ! -path 'app/(tabs)/*')
if [ ${#STACK_PHANTOM[@]} -eq 0 ]; then
  echo "✅ Nessun file .ts helper nelle cartelle stack di app/."
else
  echo "❌ File .ts rilevati in app/ (fuori da (tabs)) — generano route node fantasma:"
  for _pf in "${STACK_PHANTOM[@]}"; do
    echo "   ⚠️  $_pf"
  done
  echo ""
  echo "   Expo Router registra QUALSIASI .ts in app/ come rotta (con o senza _)."
  echo "   → Spostare il file in components/ o lib/ e aggiornare gli import."
  echo "════════════════════════════════════════"
  echo ""
  exit 1
fi
echo "════════════════════════════════════════"
echo ""

# ── GUARD PORTE .replit (MAPPING [[ports]] + DEPLOY) ─────────
# REGOLA BLOCCANTE (replit.md § Preferenze utente):
# Nessun agente può modificare [[ports]] senza autorizzazione esplicita utente.
# Mapping canonico immutabile:
#   localPort=5000  → externalPort=80    (Express API, traffico pubblico)
#   localPort=8081  → externalPort=8081  (probe deploy interno)
#   localPort=8082  → externalPort=6000  (invariato)
# Il comando [deployment] run DEVE contenere PORT=5000.
echo "════════════════════════════════════════"
echo "  Guard porte .replit ([[ports]] + deploy)"
echo "════════════════════════════════════════"
PORT_OK=true

# 1. Mapping [[ports]] — verifica configurazione canonica
_REPLIT_NORM=$(tr -d ' ' < .replit 2>/dev/null)

if ! printf '%s\n' "$_REPLIT_NORM" | grep -A1 'localPort=5000' | grep -q 'externalPort=80$'; then
  echo "❌ ERRORE [[ports]]: localPort=5000 deve avere externalPort=80!"
  PORT_OK=false
else
  echo "✅ [[ports]] localPort=5000 → externalPort=80: OK"
fi

if ! printf '%s\n' "$_REPLIT_NORM" | grep -A1 'localPort=8081' | grep -q 'externalPort=8081$'; then
  echo "❌ ERRORE [[ports]]: localPort=8081 deve avere externalPort=8081!"
  PORT_OK=false
else
  echo "✅ [[ports]] localPort=8081 → externalPort=8081: OK"
fi

# 2. Comando [deployment] — PORT=5000 nel run
if grep -q 'PORT=8081' .replit 2>/dev/null; then
  echo "❌ ERRORE deploy: .replit contiene PORT=8081 nel comando run!"
  PORT_OK=false
fi
if ! grep -q 'PORT=5000' .replit 2>/dev/null; then
  echo "❌ ERRORE deploy: .replit non contiene PORT=5000 nel comando run!"
  PORT_OK=false
fi

if [ "$PORT_OK" = true ]; then
  echo "✅ Porte .replit corrette: [[ports]] canonico + deploy PORT=5000."
else
  echo ""
  echo "⛔ PORTE ERRATE — impossibile correggere automaticamente."
  echo "   Configurazione canonica richiesta:"
  echo "     [[ports]] localPort=5000  → externalPort=80"
  echo "     [[ports]] localPort=8081  → externalPort=8081"
  echo "     [[ports]] localPort=8082  → externalPort=6000"
  echo "     [deployment] run → PORT=5000"
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

# ── GATE TEST COMPONENTI ────────────────────────────────────
# Esegue TUTTI i test automatici in components/__tests__/ (glob a livello di
# cartella: ogni nuovo file *.test.ts viene incluso automaticamente, senza
# bisogno di modificare questo script). La directory copre gesture, logica
# widget, comportamento UI e qualunque altro test di componente aggiunto in
# futuro.
# Se fallisce, il merge è bloccato: regressioni sui componenti critici
# vengono rilevate qui prima di raggiungere produzione.
#
# ⚠ CONTRIBUTOR: quando aggiungi un nuovo file in components/__tests__/,
#   NON serve modificare questo script — il glob lo include automaticamente.
#   Verifica che il file appaia nell'elenco "File di test rilevati" qui sotto.
#   Consulta CONTRIBUTING.md → "Test di componente" per le convenzioni.
echo "════════════════════════════════════════"
echo "  Gate test gesture componenti"
echo "════════════════════════════════════════"
COMPONENT_TEST_FILES=()
for _glob in components/__tests__/*.test.ts components/__tests__/*.test.tsx; do
  [ -f "$_glob" ] && COMPONENT_TEST_FILES+=("$_glob")
done
COMPONENT_TEST_COUNT=${#COMPONENT_TEST_FILES[@]}
echo "  File di test rilevati (${COMPONENT_TEST_COUNT}):"
for _f in "${COMPONENT_TEST_FILES[@]}"; do
  echo "    • $(basename "$_f")"
done
echo ""
GESTURE_TEST_EXIT=0
npx vitest run components/__tests__ 2>&1 || GESTURE_TEST_EXIT=$?
if [ "$GESTURE_TEST_EXIT" -eq 0 ]; then
  echo "✅ Gesture tests: tutti i test passati."
else
  echo "❌ Gesture tests FALLITI (exit ${GESTURE_TEST_EXIT}) — verificare components/__tests__/ prima di procedere."
  echo "   Eseguire 'npx vitest run components/__tests__' localmente per i dettagli."
  echo "════════════════════════════════════════"
  echo ""
  exit "$GESTURE_TEST_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE TEST INIT-GATE LOGIN (Task #4458) ──────────────────
# Blocca la regressione del blanket-503: il gate /api/* deve lasciar passare le
# rotte auth essenziali appena dbReady=true (login senza "Server occupato"), e
# il client deve ritentare sui 503 transitori senza ritentare gli altri errori.
echo "════════════════════════════════════════"
echo "  Gate test gate di init (login)"
echo "════════════════════════════════════════"
INIT_GATE_TEST_EXIT=0
npx vitest run server/__tests__/init-gate.test.ts 2>&1 || INIT_GATE_TEST_EXIT=$?
if [ "$INIT_GATE_TEST_EXIT" -eq 0 ]; then
  npx vitest run --config vitest.config.lib.ts lib/__tests__/init-retry.test.ts 2>&1 || INIT_GATE_TEST_EXIT=$?
fi
if [ "$INIT_GATE_TEST_EXIT" -eq 0 ]; then
  echo "✅ Init-gate tests: gate server + retry client OK."
else
  echo "❌ Init-gate tests FALLITI (exit ${INIT_GATE_TEST_EXIT}) — il login potrebbe mostrare 'Server occupato' al boot."
  echo "   Eseguire 'npx vitest run server/__tests__/init-gate.test.ts' e"
  echo "   'npx vitest run --config vitest.config.lib.ts lib/__tests__/init-retry.test.ts' localmente."
  echo "════════════════════════════════════════"
  echo ""
  exit "$INIT_GATE_TEST_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE TEST HOOK AVVIO (useAppBootstrap / useOtaAutoUpdate) ────────────────
# Blocca regressioni sui timeout di cold-start e OTA update: qualsiasi modifica
# agli hook di avvio (useAppBootstrap, useOtaAutoUpdate) viene verificata prima
# del merge. Senza questo gate, un errore nei timeout di boot passerebbe
# inosservato perché hooks/__tests__/ non era in nessun gate bloccante.
echo "════════════════════════════════════════"
echo "  Gate test hook di avvio (hooks/__tests__)"
echo "════════════════════════════════════════"
HOOKS_TEST_EXIT=0
npx vitest run hooks/__tests__ 2>&1 || HOOKS_TEST_EXIT=$?
if [ "$HOOKS_TEST_EXIT" -eq 0 ]; then
  echo "✅ Hook tests: useAppBootstrap + useOtaAutoUpdate OK."
else
  echo "❌ Hook tests FALLITI (exit ${HOOKS_TEST_EXIT}) — verificare hooks/__tests__/ prima di procedere."
  echo "   Eseguire 'npx vitest run hooks/__tests__' localmente per i dettagli."
  echo "════════════════════════════════════════"
  echo ""
  exit "$HOOKS_TEST_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE SOPPRESSIONE ALLARMI TC SPENTO (aggregator E2E) ─────────────────────
# Verifica che runAggregatorCycle() applichi correttamente la soppressione
# downstream quando ThinkCentre è powered-off: db.db.ping_ms e
# maps.health.network_instability NON devono superare "warn" nello snapshot
# finale. Blocca regressioni su OUTAGE_DOWNSTREAM_IDS o sulla logica E2E.
echo "════════════════════════════════════════"
echo "  Gate soppressione allarmi TC spento (aggregator E2E)"
echo "════════════════════════════════════════"
TC_SUPPRESSION_EXIT=0
npx vitest run --config vitest.config.server.ts server/__tests__/aggregator-downstream-suppression.test.ts 2>&1 || TC_SUPPRESSION_EXIT=$?
if [ "$TC_SUPPRESSION_EXIT" -eq 0 ]; then
  echo "✅ Aggregator TC-suppression: unit + E2E OK."
else
  echo "❌ Aggregator TC-suppression FALLITO (exit ${TC_SUPPRESSION_EXIT}) — verificare la soppressione downstream in aggregator.ts."
  echo "   Eseguire 'npx vitest run --config vitest.config.server.ts server/__tests__/aggregator-downstream-suppression.test.ts' localmente."
  echo "════════════════════════════════════════"
  echo ""
  exit "$TC_SUPPRESSION_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE FLAG PULIZIA NOTTURNA METRO ─────────────────────────
# Verifica che metro-cache-check.sh (sourciato da start-expo.sh):
#   - flag PRESENTE → FORCE_RESET=1 e flag rimosso
#   - flag ASSENTE  → FORCE_RESET=0
# Blocca la regressione del meccanismo di pulizia automatica 01:00 UTC.
echo "════════════════════════════════════════"
echo "  Gate flag pulizia notturna Metro"
echo "════════════════════════════════════════"
METRO_CACHE_FLAG_EXIT=0
bash scripts/__tests__/metro-cache-flag.test.sh 2>&1 || METRO_CACHE_FLAG_EXIT=$?
if [ "$METRO_CACHE_FLAG_EXIT" -eq 0 ]; then
  echo "✅ Flag pulizia notturna Metro: gate verde."
else
  echo "❌ Flag pulizia notturna Metro FALLITO (exit ${METRO_CACHE_FLAG_EXIT}) — metro-cache-check.sh o start-expo.sh hanno regressioni."
  echo "   Eseguire 'bash scripts/__tests__/metro-cache-flag.test.sh' localmente per i dettagli."
  echo "════════════════════════════════════════"
  echo ""
  exit "$METRO_CACHE_FLAG_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE STRESS RACE AVVIO METRO ─────────────────────────────
# Test deterministico (start-expo mockato) che prova in modo ripetibile che il
# guardiano (cerbero.sh / cerbero-lib.sh) e clean-metro-restart.sh NON uccidano
# mai un Metro in avvio né rimuovano un lock attivo (/tmp/start-metro.lock).
# Blocca la regressione silenziosa della race se watchdog/clean-metro vengono
# modificati. Vedi .agents/memory/metro-startup-race.md.
echo "════════════════════════════════════════"
echo "  Gate stress race avvio Metro"
echo "════════════════════════════════════════"
METRO_RACE_EXIT=0
bash scripts/__tests__/metro-startup-race.test.sh 2>&1 || METRO_RACE_EXIT=$?
if [ "$METRO_RACE_EXIT" -eq 0 ]; then
  echo "✅ Stress race avvio Metro: gate verde."
else
  echo "❌ Stress race avvio Metro FALLITO (exit ${METRO_RACE_EXIT}) — watchdog/clean-metro potrebbero uccidere un Metro in avvio."
  echo "   Eseguire 'bash scripts/__tests__/metro-startup-race.test.sh' localmente per i dettagli."
  echo "════════════════════════════════════════"
  echo ""
  exit "$METRO_RACE_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE STRESS RACE AVVIO BACKEND ───────────────────────────
# Test deterministico (start-backend mockato) che prova in modo ripetibile che il
# guardiano (cerbero.sh / cerbero-lib.sh) NON riavvii mai un backend che sta
# inizializzando (503 {status:initializing}) o il cui start-backend.sh è attivo.
# Blocca la regressione silenziosa della race se cerbero.sh viene modificato.
echo "════════════════════════════════════════"
echo "  Gate stress race avvio Backend"
echo "════════════════════════════════════════"
BACKEND_RACE_EXIT=0
bash scripts/__tests__/backend-startup-race.test.sh 2>&1 || BACKEND_RACE_EXIT=$?
if [ "$BACKEND_RACE_EXIT" -eq 0 ]; then
  echo "✅ Stress race avvio Backend: gate verde."
else
  echo "❌ Stress race avvio Backend FALLITO (exit ${BACKEND_RACE_EXIT}) — cerbero potrebbe riavviare un backend in fase di init."
  echo "   Eseguire 'bash scripts/__tests__/backend-startup-race.test.sh' localmente per i dettagli."
  echo "════════════════════════════════════════"
  echo ""
  exit "$BACKEND_RACE_EXIT"
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

# ── GUARD SKILL OTA ↔ app.json (versionCode sync) ────────────
# La sezione "Contesto fisso" in bikerlink-ota-publish/SKILL.md
# contiene il versionCode APK corrente. Se non è aggiornato dopo
# un APK bump, l'agente OTA pubblica con numero di ciclo errato.
echo "════════════════════════════════════════"
echo "  Guard skill OTA ↔ app.json (versionCode)"
echo "════════════════════════════════════════"
OTA_SKILL=".agents/skills/bikerlink-ota-publish/SKILL.md"
if [ -f "$OTA_SKILL" ] && [ -f "app.json" ]; then
  APPJSON_VC=$(node -p "require('./app.json').expo.android.versionCode" 2>/dev/null || echo "")
  SKILL_VC=$(grep -oP '`versionCode` APK \| \*\*\K[0-9]+' "$OTA_SKILL" | head -1 || echo "")
  if [ -z "$APPJSON_VC" ]; then
    echo "⚠️  Impossibile leggere versionCode da app.json — guard saltato."
  elif [ -z "$SKILL_VC" ]; then
    echo "⚠️  Impossibile leggere versionCode dalla skill OTA — guard saltato."
  elif [ "$APPJSON_VC" != "$SKILL_VC" ]; then
    echo "⚠️  bikerlink-ota-publish/SKILL.md out of sync with app.json"
    echo "   app.json versionCode  = ${APPJSON_VC}"
    echo "   SKILL.md versionCode  = ${SKILL_VC}"
    echo "   → Aggiornare la tabella 'Contesto fisso' in ${OTA_SKILL}"
    echo "     prima di pubblicare il prossimo OTA."
  else
    echo "✅ Skill OTA in sync con app.json (versionCode=${APPJSON_VC})."
  fi
else
  echo "⚠️  File mancante (app.json o skill OTA) — guard saltato."
fi
echo "════════════════════════════════════════"
echo ""

exit 0
