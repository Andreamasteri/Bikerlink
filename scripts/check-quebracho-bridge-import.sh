#!/usr/bin/env bash
# check-quebracho-bridge-import.sh
#
# CI gate: fails if any file under server/, app/, or scripts/ imports from
# (or otherwise references) "quebracho-bridge".
#
# WHY THIS FILE WAS DELETED:
#   server/ai/assistant/quebracho-bridge.ts was removed when Quebracho was
#   fully absorbed into Horus (Task #591 / Task #597). Quebracho no longer
#   exists as a separate persona — all coordination now lives in Horus.
#   Any future re-import of this path would produce a confusing "module not
#   found" build error with no obvious explanation. This gate makes the
#   reason self-explanatory.
#
# Usage:
#   bash scripts/check-quebracho-bridge-import.sh
#   exit 0 → no references found
#   exit 1 → stale references found (list printed to stdout)

set -euo pipefail

VIOLATIONS=$(grep -rn \
  --include="*.ts" \
  --include="*.tsx" \
  --include="*.js" \
  --include="*.sh" \
  "quebracho-bridge" \
  server/ app/ scripts/ \
  | grep -v "scripts/check-quebracho-bridge-import\.sh" \
  || true)

if [ -z "$VIOLATIONS" ]; then
  echo "[quebracho-bridge-import] OK — no stale references to quebracho-bridge found."
  exit 0
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║  STALE quebracho-bridge REFERENCE DETECTED                          ║"
echo "╠══════════════════════════════════════════════════════════════════════╣"
echo "║  server/ai/assistant/quebracho-bridge.ts was DELETED when           ║"
echo "║  Quebracho was absorbed into Horus (see Task #591 / #597).          ║"
echo "║  Quebracho no longer exists as a separate AI persona.               ║"
echo "║                                                                      ║"
echo "║  If you need Quebracho-style coordination, use Horus directly:      ║"
echo "║    server/ai/horus/                                                  ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Violations:"
echo "$VIOLATIONS"
echo ""
exit 1
