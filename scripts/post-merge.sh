#!/bin/bash
set -e

echo "Running post-merge setup..."
npm run db:push --force 2>&1 || true

echo "Invalidating server_dist to force TypeScript recompile on next start..."
rm -f server_dist/index.js

echo "Post-merge setup complete."

# ── CONTROLLO OTA POST-MERGE ─────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "  Controllo sistema OTA post-merge"
echo "════════════════════════════════════════"

OTA_MODIFIED=$(git diff HEAD~1 HEAD --name-only 2>/dev/null | grep -c "^ota-updates\.json$" || true)

if [ "$OTA_MODIFIED" -gt 0 ]; then
  echo "⚠️  ota-updates.json modificato in questo merge — avvio validazione OTA..."
  echo ""
  OTA_EXIT=0; bash scripts/validate-ota.sh || OTA_EXIT=$?
  echo ""
  if [ "$OTA_EXIT" -ne 0 ]; then
    echo "❌ Validazione OTA: $OTA_EXIT errore/i rilevato/i — verificare prima di pubblicare."
  else
    echo "✅ Validazione OTA completata senza errori."
  fi
else
  echo "✅ ota-updates.json non modificato — sistema OTA intatto."
fi

echo "════════════════════════════════════════"
echo ""

exit 0
