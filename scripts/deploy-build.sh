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
# Task #2682 — drizzle-kit push reso non-fatale.
# Source of truth dello schema in produzione = migrations/*.sql, applicate da
# server/migrate.ts (runMigrations()) durante Phase 1 del boot. drizzle-kit push
# resta utile per allineamenti opportunistici, ma il deploy NON deve fallire
# quando incontra il prompt promptNamedWithSchemasConflict in ambienti non-TTY.
# Background: 14 tabelle (ai_conversations, db_integrity_*, system_*, weekly_*,
# user_time_profile, ...) sono definite in shared/db/*.ts ma non ancora in
# migrations/*.sql; i loro consumer sono try/catch non-fatal in server/index.ts.
if npx drizzle-kit push --force; then
  echo "  Schema sync completato (drizzle-kit push OK)."
else
  echo "  ⚠ drizzle-kit push fallito (TTY/conflict noto) — proseguo: schema applicato a runtime da runMigrations()."
fi

echo "=== [2/2] Build server TypeScript ==="
node scripts/server-build.js

echo "=== Deploy build completato ==="
