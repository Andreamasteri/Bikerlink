#!/bin/bash
set -e

# Task #1150 — deploy build minimale.
#
# Storia: lo script ha avuto in passato uno step `npx expo export --platform web`
# (4.8 MB di JS in static-build/web/) e poi un marker statico static-build/index.html.
# Entrambi sono stati rimossi: BikerLink non gira via web, server/index.ts non
# referenzia più static-build, e la cartella confondeva il classifier autoscale di
# Replit. Restano due step puri: sync DB schema + bundle del server Express.
#
# Task #2678 — il conflitto integrity_* → db_integrity_* è risolto:
#   - shared/db/drizzle-schema.ts (schema entry-point per drizzle-kit, esclude
#     integrity.ts per eliminare l'ambiguità di rename)
#   - drizzle.config.ts tablesFilter esclude le tabelle DB non gestite da drizzle
#     (session, integrity_*, schema_migrations, spatial_ref_sys, PostGIS views)
#   - constraint _key → _unique rinominati manualmente (dev già allineato)
#   - colonne geography(Point,4326) aggiornate con generatedAlwaysAs per
#     rispecchiare GENERATED ALWAYS del DB ed evitare ALTER distruttivi
# drizzle-kit push --force ora gira senza TTY e senza prompt interattivi.

echo "=== [1/2] Sync database schema ==="
npx drizzle-kit push --force
echo "  Schema sync completato."

echo "=== [2/2] Build server TypeScript ==="
node scripts/server-build.js

echo "=== Deploy build completato ==="
