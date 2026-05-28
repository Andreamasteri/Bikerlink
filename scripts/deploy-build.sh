#!/bin/bash
set -e

# Task #1150 — deploy build minimale.
#
# Storia: lo script ha avuto in passato uno step `npx expo export --platform web`
# (4.8 MB di JS in static-build/web/) e poi un marker statico static-build/index.html.
# Entrambi sono stati rimossi: BikerLink non gira via web, server/index.ts non
# referenzia più static-build, e la cartella confondeva il classifier autoscale di
# Replit. Restano due step puri: sync DB schema + bundle del server Express.

echo "=== [1/2] Sync database schema — SKIPPED ==="
# Task #2662 / deploy-fail-2026-05-28: `drizzle-kit push --force` rileva un
# conflitto di rename non risolvibile senza TTY (tabelle integrity_* vs
# db_integrity_*) e lascia in stderr una stack trace che Replit Deploy
# interpreta come build failure. Lo schema prod va allineato manualmente
# (vedi task #2662 per lo script SQL idempotente già applicato in dev).
echo "  Schema sync NON eseguito al deploy. Per applicare modifiche schema"
echo "  in produzione: eseguire manualmente lo script SQL idempotente"
echo "  oppure ripristinare lo step quando il conflitto di rename è risolto."

echo "=== [2/2] Build server TypeScript ==="
node scripts/server-build.js

echo "=== Deploy build completato ==="
