#!/bin/bash
set -e

# Task #1150 — deploy build minimale.
#
# Storia: lo script ha avuto in passato uno step `npx expo export --platform web`
# (4.8 MB di JS in static-build/web/) e poi un marker statico static-build/index.html.
# Entrambi sono stati rimossi: BikerLink non gira via web, server/index.ts non
# referenzia più static-build, e la cartella confondeva il classifier autoscale di
# Replit. Restano due step puri: sync DB schema + bundle del server Express.

echo "=== [1/2] Sync database schema ==="
npx drizzle-kit push --force 2>&1 || echo "WARNING: db:push failed, continuing..."

echo "=== [2/2] Build server TypeScript ==="
node scripts/server-build.js

echo "=== Deploy build completato ==="
