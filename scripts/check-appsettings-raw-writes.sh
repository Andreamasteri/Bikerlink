#!/usr/bin/env bash
# check-appsettings-raw-writes.sh
#
# CI gate: fails if any file under server/ (excluding the canonical
# storage/system.ts and test helpers) contains a raw db.insert(appSettings)
# or db.update(appSettings) call without going through storage.upsertAppSetting()
# or storage.invalidateAppSettingCache().
#
# Rule: ALL writes to the appSettings table MUST route through the
# storage layer so the in-process cache stays consistent.
# See server/storage/system.ts — upsertAppSetting / invalidateAppSettingCache.
#
# Usage:
#   bash scripts/check-appsettings-raw-writes.sh
#   exit 0 → no violations
#   exit 1 → violations found (list printed to stdout)

set -euo pipefail

VIOLATIONS=$(grep -rn \
  --include="*.ts" \
  -E "db\.(insert|update|delete)\(appSettings" \
  server/ \
  | grep -v "server/storage/system\.ts" \
  | grep -v "__tests__" \
  | grep -v "\.test\.ts" \
  | grep -v "\.spec\.ts" \
  || true)

if [ -z "$VIOLATIONS" ]; then
  echo "[appsettings-raw-writes] OK — no raw appSettings writes found outside storage layer."
  exit 0
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║  RAW appSettings WRITE DETECTED — cache bypass risk                 ║"
echo "╠══════════════════════════════════════════════════════════════════════╣"
echo "║  All writes to app_settings MUST go through:                        ║"
echo "║    storage.upsertAppSetting(key, value, valueJson)                  ║"
echo "║    — or —                                                            ║"
echo "║    raw db write + storage.invalidateAppSettingCache(key)            ║"
echo "║                                                                      ║"
echo "║  The canonical implementation is server/storage/system.ts.          ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Violations:"
echo "$VIOLATIONS"
echo ""
exit 1
