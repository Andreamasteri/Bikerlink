#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  BikerLink — EAS CLI wrapper
#
#  Usa eas-cli dal progetto (node_modules/.bin/eas) — versione gestita da
#  package.json ("eas-cli": "^20.1.0").
#
#  NON usare il binario eas globale né il CLI tramite package runner:
#    - il binario globale può essere vecchio (v19 causa errore eas.json >= 20)
#    - il CLI via package runner scarica il pacchetto ad ogni run → timeout Metro
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
EAS_BIN="$SCRIPT_DIR/../node_modules/.bin/eas"

if [ ! -f "$EAS_BIN" ]; then
  echo "  ✖  eas-cli non trovato in node_modules/.bin/eas" >&2
  echo "  Esegui: npm install    (richiede eas-cli ^20 in package.json)" >&2
  exit 1
fi

exec "$EAS_BIN" "$@"
