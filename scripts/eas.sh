#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  BikerLink — EAS CLI wrapper
#
#  Usa eas-cli tramite npx con versione ^20.1.0 (npx usa la cache locale,
#  quindi non scarica il pacchetto ad ogni run dopo la prima volta).
#  La versione minima è imposta anche in eas.json "cli.version": ">= 20.0.0".
#
#  Uso (da altri script):
#    bash scripts/eas.sh <eas-command> [args...]
#
#  Esempio:
#    bash scripts/eas.sh build --platform android --profile release-apk
#    bash scripts/eas.sh build:view "$BUILD_ID" --json
#    bash scripts/eas.sh update --channel production --skip-bundler ...
#    bash scripts/eas.sh --version
# ═══════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Usa il binario locale se ancora presente (backward compat), altrimenti npx.
LOCAL_BIN="$SCRIPT_DIR/../node_modules/.bin/eas"
if [ -f "$LOCAL_BIN" ]; then
  EAS_BIN="$LOCAL_BIN"
  _USE_NPX=false
else
  EAS_BIN="npx"
  _USE_NPX=true
fi

# ─────────────────────────────────────────────────────────────────────────────
#  PRE-FLIGHT: timeout guard per comandi build
#
#  Il tool bash dell'agente ha un default di 30 s, ma l'upload EAS (~127 MB)
#  richiede 2–3 minuti. Se il timeout non è impostato a ≥600000ms il processo
#  viene killato a metà upload senza alcun log né URL della dashboard.
#
#  Questo blocco stampa un avviso BEN VISIBILE ogni volta che si usa "build"
#  così l'agente (o lo sviluppatore) si ricorda di impostare timeout=600000.
# ─────────────────────────────────────────────────────────────────────────────
FIRST_ARG="${1:-}"
if [[ "$FIRST_ARG" == "build" ]]; then
  echo "" >&2
  echo "╔══════════════════════════════════════════════════════════════════════╗" >&2
  echo "║  ⛔  PRE-FLIGHT CHECK — TIMEOUT OBBLIGATORIO                        ║" >&2
  echo "║                                                                      ║" >&2
  echo "║  Il comando EAS build richiede ~2–3 min per l'upload (~127 MB).     ║" >&2
  echo "║  Il tool bash DEVE usare timeout=600000ms (non il default 30 s).    ║" >&2
  echo "║                                                                      ║" >&2
  echo "║  Se stai lanciando questo comando dall'agente, verifica che il      ║" >&2
  echo "║  parametro timeout del tool bash sia impostato a 600000.            ║" >&2
  echo "║  Se il processo viene interrotto prima dell'URL dashboard EAS,      ║" >&2
  echo "║  la build NON è stata inviata — devi rilanciarla.                   ║" >&2
  echo "║                                                                      ║" >&2
  echo "║  Comando atteso:                                                     ║" >&2
  echo "║    GIT_INDEX_FILE=/tmp/eas-build-index bash scripts/eas.sh build \\  ║" >&2
  echo "║      --platform android --profile release-apk \\                     ║" >&2
  echo "║      --non-interactive --no-wait                                    ║" >&2
  echo "╚══════════════════════════════════════════════════════════════════════╝" >&2
  echo "" >&2
fi

# (nessun check necessario: npx è sempre disponibile)

# ─────────────────────────────────────────────────────────────────────────────
#  PRE-FLIGHT: allineamento versioni app.json ↔ android/app/build.gradle
#
#  Verifica che versionCode e versionName siano identici nei due file prima
#  di inviare la build a EAS. Un disallineamento produce un APK con metadati
#  sbagliati senza alcun warning da EAS.
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$FIRST_ARG" == "build" ]]; then
  ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
  APP_JSON="$ROOT_DIR/app.json"
  BUILD_GRADLE="$ROOT_DIR/android/app/build.gradle"

  # Leggi i valori da app.json
  AJ_VERSION=$(node -e "const a=require('$APP_JSON'); process.stdout.write(a.expo.version)")
  AJ_VERSION_CODE=$(node -e "const a=require('$APP_JSON'); process.stdout.write(String(a.expo.android.versionCode))")

  # Leggi i valori da build.gradle (prende la prima occorrenza di "versionCode <n>")
  BG_VERSION_CODE=$(grep -E '^\s+versionCode\s+[0-9]+' "$BUILD_GRADLE" | head -1 | grep -oE '[0-9]+')
  BG_VERSION_NAME=$(grep -E '^\s+versionName\s+"[^"]+"' "$BUILD_GRADLE" | head -1 | grep -oP '(?<=")[^"]+')

  VERSION_OK=true

  if [[ "$AJ_VERSION_CODE" != "$BG_VERSION_CODE" ]]; then
    echo "" >&2
    echo "╔══════════════════════════════════════════════════════════════════════╗" >&2
    echo "║  ✖  VERSIONI DISALLINEATE — BUILD BLOCCATA                         ║" >&2
    echo "║                                                                      ║" >&2
    printf "║  versionCode  app.json     : %-39s║\n" "$AJ_VERSION_CODE" >&2
    printf "║  versionCode  build.gradle : %-39s║\n" "$BG_VERSION_CODE" >&2
    echo "║                                                                      ║" >&2
    echo "║  Allinea i due file prima di lanciare la build.                     ║" >&2
    echo "╚══════════════════════════════════════════════════════════════════════╝" >&2
    VERSION_OK=false
  fi

  if [[ "$AJ_VERSION" != "$BG_VERSION_NAME" ]]; then
    echo "" >&2
    echo "╔══════════════════════════════════════════════════════════════════════╗" >&2
    echo "║  ✖  VERSIONI DISALLINEATE — BUILD BLOCCATA                         ║" >&2
    echo "║                                                                      ║" >&2
    printf "║  version / versionName  app.json     : %-30s║\n" "$AJ_VERSION" >&2
    printf "║  versionName            build.gradle : %-30s║\n" "$BG_VERSION_NAME" >&2
    echo "║                                                                      ║" >&2
    echo "║  Allinea i due file prima di lanciare la build.                     ║" >&2
    echo "╚══════════════════════════════════════════════════════════════════════╝" >&2
    VERSION_OK=false
  fi

  if [[ "$VERSION_OK" == "true" ]]; then
    echo "  ✔  Versioni allineate: versionCode=$AJ_VERSION_CODE  versionName=$AJ_VERSION" >&2
  else
    exit 1
  fi

  # ─────────────────────────────────────────────────────────────────────────────
  #  PRE-FLIGHT: fix URL proxy Replit → registry.npmjs.org in package-lock.json
  #
  #  Ogni `npm install` eseguito in Replit riscrive le URL "resolved" nel
  #  package-lock.json puntando a package-firewall.replit.local, che non è
  #  raggiungibile dall'ambiente di build EAS (cloud esterno).
  #  Questo sed ripristina le URL pubbliche prima che EAS esegua `npm ci`.
  # ─────────────────────────────────────────────────────────────────────────────
  LOCK_FILE="$ROOT_DIR/package-lock.json"
  if grep -q "package-firewall.replit.local" "$LOCK_FILE" 2>/dev/null; then
    echo "  ⚙  Fix package-lock.json: sostituisco URL proxy Replit → registry.npmjs.org ..." >&2
    sed -i 's|http://package-firewall\.replit\.local/npm/|https://registry.npmjs.org/|g' "$LOCK_FILE"
    echo "  ✔  package-lock.json aggiornato (URL proxy rimossi)" >&2
  else
    echo "  ✔  package-lock.json OK (nessuna URL proxy trovata)" >&2
  fi
fi

if [[ "$_USE_NPX" == "true" ]]; then
  exec "$EAS_BIN" --yes "eas-cli@^20.1.0" "$@"
else
  exec "$EAS_BIN" "$@"
fi
