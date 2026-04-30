#!/bin/bash
set -e

# Task #1150 — deploy build semplificato.
#
# Storia: questo script faceva 4 step, includendo `npx expo export --platform web`
# che produceva ~4.8 MB di JS in `static-build/web/`. Il classificatore di deploy
# di Replit ha iniziato a riconoscere quella cartella come output statico e a
# rifiutare il deploy autoscale con messaggi tipo "build output is in
# 'static-build/web' while Autoscale deployments expect a server to run".
# Il build phase completava ma il container non veniva mai promosso live.
#
# Soluzione: il server Express in produzione non ha bisogno del bundle web Expo.
# Serve API, OTA endpoint, landing page (server/templates/landing-page.html) e
# pagine HTML statiche. La rotta `/web` (preview app in browser) restituirà 404
# finché non reintroduciamo il bundle web come artefatto separato — accettabile
# perché l'uso reale è il client mobile via OTA.

echo "=== [1/3] Sync database schema ==="
npx drizzle-kit push --force 2>&1 || echo "WARNING: db:push failed, continuing..."

echo "=== [2/3] Build server TypeScript ==="
node scripts/server-build.js

echo "=== [3/3] Create SPA index marker ==="
# Il marker serve a server/index.ts per attivare il routing in production
# (vedi `staticBuildIndex` checks). Niente bundle web qui — solo l'index minimal.
mkdir -p static-build
cat > static-build/index.html <<'HTML'
<!DOCTYPE html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <title>BikerLink</title>
    <meta http-equiv="refresh" content="0;url=/" />
  </head>
  <body></body>
</html>
HTML
echo "static-build/index.html creato (marker minimale, no bundle web)"

echo "=== Deploy build completato ==="
