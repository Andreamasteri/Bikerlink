#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  BikerLink — EAS CLI wrapper
#
#  Unico punto in cui la versione di EAS CLI è definita.
#  Per aggiornare EAS CLI in tutti gli script, modifica solo EAS_CLI_VERSION.
#
#  Uso (da altri script):
#    bash scripts/eas.sh <eas-command> [args...]
#
#  Esempio:
#    bash scripts/eas.sh build --platform android --profile release-apk
#    bash scripts/eas.sh build:view "$BUILD_ID" --json
#    bash scripts/eas.sh --version
# ═══════════════════════════════════════════════════════════════════════════

EAS_CLI_VERSION="20"

exec npx "eas-cli@${EAS_CLI_VERSION}" "$@"
