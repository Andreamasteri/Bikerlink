#!/bin/bash
set -e

echo "=== [1/4] Sync database schema ==="
npx drizzle-kit push --force 2>&1 || echo "WARNING: db:push failed, continuing..."

echo "=== [2/4] Build server TypeScript ==="
node scripts/server-build.js

echo "=== [3/4] Export Expo web app ==="
# expo export can time out or fail in the deployment container — make it non-fatal.
# The Express server works without static-build (serves landing page + API only).
EXPO_NO_INSPECTOR_PROXY=1 \
REACT_NATIVE_DEVTOOLS_DISABLE=1 \
npx expo export --platform web --output-dir static-build/web \
  || echo "WARNING: Expo web export failed or timed out — server will run in API-only mode"

echo "=== [4/4] Create SPA index marker ==="
if [ -f "static-build/web/index.html" ]; then
  cp static-build/web/index.html static-build/index.html
  echo "static-build/index.html creato (da web export)"
else
  mkdir -p static-build
  echo '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>BikerLink</title><meta http-equiv="refresh" content="0;url=/"></head><body></body></html>' > static-build/index.html
  echo "static-build/index.html creato (marker fallback)"
fi

echo "=== Deploy build completato ==="
