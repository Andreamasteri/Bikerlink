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
# Task #2682 — root cause TTY prompt risolto:
# shared/db/drizzle-schema.ts ora importa ./matching-extra (match_rules,
# match_thresholds). Senza questo import, drizzle-kit vedeva quelle tabelle come
# to-delete vs 15 to-create → promptNamedWithSchemasConflict richiedeva TTY.
# Ora to-delete=0 → no prompt, push gira non-interattivo. Step torna fatale.
#
# Task #2700 — sostituito `npx drizzle-kit push --force` con il wrapper
# `scripts/db-push-safe.sh`. In prod drizzle-kit, nonostante il tablesFilter,
# emette un `ALTER TABLE spatial_ref_sys ADD PRIMARY KEY` (oggetto PostGIS
# di proprietà di `postgres`) che fallisce con "must be owner of table
# spatial_ref_sys" bloccando il deploy. Il wrapper:
#  - swallowa SOLO gli errori di ownership sui 3 oggetti PostGIS noti
#    (spatial_ref_sys, geography_columns, geometry_columns);
#  - fa fail-fast su qualunque altro errore (nessun masking di bug reali);
#  - rimane idempotente (seconda esecuzione = no-op).
# NON reintrodurre `npx drizzle-kit push --force` diretto: vedi task #2700
# e drizzle.config.ts (commento su `!public.spatial_ref_sys`).
bash scripts/db-push-safe.sh
echo "  Schema sync completato."

echo "=== [2/2] Build server TypeScript ==="
node scripts/server-build.js

echo "=== Deploy build completato ==="
