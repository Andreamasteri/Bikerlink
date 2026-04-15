#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
#  BikerLink — DB Migration Guard
#
#  Verifica STATICA che tutte le colonne definite nello schema Drizzle per
#  le tabelle critiche (users, user_profiles, moto_clubs) siano coperte da:
#    A) la lista baseline (colonne storiche, presenti dalla creazione del DB)
#    B) una istruzione ALTER TABLE … ADD COLUMN IF NOT EXISTS in server/index.ts
#
#  Comportamento:
#    EXIT 1 → colonne nel schema NON in baseline NÉ in Phase 1 (build bloccata)
#    EXIT 0 → tutte le colonne sono coperte (build può procedere)
#
#  Il controllo DB (via information_schema) è puramente informativo:
#  mostra avvisi se colonne mancano nel DB dev, ma NON influenza l'exit code.
#
#  Uso diretto:
#    bash scripts/db-migration-guard.sh
#
#  Viene chiamato automaticamente da build-apk.sh dopo il controllo del token
#  di autorizzazione, prima del sync versionCode e della build EAS.
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo ""
echo "  ┌─ Guardia Migrazioni DB ───────────────────────────────────────────"

if ! command -v npx &>/dev/null; then
  echo "  ✖  npx non trovato — impossibile eseguire la guardia."
  exit 1
fi

cd "$PROJECT_ROOT"
npx tsx scripts/check-schema-migrations.ts
EXIT_CODE=$?

echo "  └──────────────────────────────────────────────────────────────────"
echo ""

exit $EXIT_CODE
