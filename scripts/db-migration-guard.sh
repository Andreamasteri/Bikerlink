#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
#  BikerLink — DB Migration Guard
#
#  Verifica che tutte le colonne definite nello schema Drizzle per le
#  tabelle critiche (users, user_profiles, moto_clubs) siano:
#    1. Presenti nel database reale (dev) → EXIT 1 se mancanti
#    2. Coperte da una migrazione Phase 1 in server/index.ts → AVVISO
#
#  Uso diretto:
#    bash scripts/db-migration-guard.sh
#
#  Viene chiamato automaticamente da build-apk.sh prima di avviare la build.
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo ""
echo "  ┌─ Guardia Migrazioni DB ───────────────────────────────────────────"

# Verifica che tsx sia disponibile
if ! command -v npx &>/dev/null; then
  echo "  ✖  npx non trovato — impossibile eseguire la guardia."
  exit 1
fi

# Esegui lo script TypeScript di verifica
cd "$PROJECT_ROOT"
npx tsx scripts/check-schema-migrations.ts
EXIT_CODE=$?

echo "  └──────────────────────────────────────────────────────────────────"
echo ""

exit $EXIT_CODE
