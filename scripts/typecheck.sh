#!/usr/bin/env bash
# TypeScript import/re-export validation for client and server codebases.
#
# Catches broken imports that commonly appear after file splits:
#   TS2307 — Cannot find module or its type declarations
#   TS2305 — Module has no exported member
#   TS2614 — Module has no exported member (re-export)
#   TS2306 — File is not a module
#   TS2440 — Import declaration conflicts with local declaration
#   TS2724 — Module has no exported member (named export)
#
# Other pre-existing type errors are intentionally ignored so this check
# stays focused on the structural import health of barrel files.
#
# Usage:
#   bash scripts/typecheck.sh          # check both codebases
#   bash scripts/typecheck.sh client   # check only client (Expo)
#   bash scripts/typecheck.sh server   # check only server (Express)

set -uo pipefail

TARGET="${1:-both}"

IMPORT_ERROR_CODES="TS2307|TS2305|TS2614|TS2306|TS2440|TS2724"

PASS=0
FAIL=0
CLIENT_ERRORS=""
SERVER_ERRORS=""

echo ""
echo "=========================================="
echo "  BikerLink — TypeScript Import Checker   "
echo "=========================================="
echo ""

run_check() {
  local label="$1"
  local project="$2"
  local var_name="$3"

  echo "[${label}] Running tsc --noEmit --project ${project} ..."

  local raw_output
  raw_output=$(npx tsc --noEmit --project "${project}" 2>&1 || true)

  local import_errors
  import_errors=$(echo "$raw_output" | grep -E "(${IMPORT_ERROR_CODES})" || true)

  if [ -z "$import_errors" ]; then
    echo "  ✓ ${label}: no broken imports found"
    PASS=$((PASS + 1))
  else
    local count
    count=$(echo "$import_errors" | wc -l | tr -d ' ')
    echo "  ✗ ${label}: ${count} broken import(s) detected"
    echo ""
    echo "$import_errors" | sed 's/^/    /'
    echo ""
    FAIL=$((FAIL + 1))
    eval "${var_name}=\"\${import_errors}\""
  fi
}

if [ "$TARGET" = "client" ] || [ "$TARGET" = "both" ]; then
  run_check "Client (Expo / React Native)" "tsconfig.json" "CLIENT_ERRORS"
  echo ""
fi

if [ "$TARGET" = "server" ] || [ "$TARGET" = "both" ]; then
  run_check "Server (Express / Node.js)" "server/tsconfig.json" "SERVER_ERRORS"
  echo ""
fi

echo "=========================================="
echo "  Results: ${PASS} passed, ${FAIL} failed"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Fix the broken imports above, then re-run: bash scripts/typecheck.sh"
  echo ""
  echo "Tip: broken imports usually mean a barrel file is missing a re-export"
  echo "     or a module path changed during a file split."
  exit 1
fi

echo ""
echo "All import checks passed."

# ---------------------------------------------------------------------------
# Run client-undefined safety check (guards against OTA-4 pattern)
# ---------------------------------------------------------------------------
echo ""
echo "Running client-undefined safety check..."
bash "$(dirname "$0")/check-client-undefined.sh"
exit $?
