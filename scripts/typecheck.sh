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
#
# Performance note:
#   Slow checks (grep-based guards, independent tsc scopes) run in parallel
#   to stay within the ~120s sandbox budget. Each tsc scope is run at most
#   once — the client output is captured once and reused for both the import
#   check and the full type check.

set -uo pipefail

TARGET="${1:-both}"
BUDGET_SECONDS=120
_TC_START=$SECONDS

IMPORT_ERROR_CODES="TS2307|TS2305|TS2614|TS2306|TS2440|TS2724"

PASS=0
FAIL=0
CLIENT_ERRORS=""
SERVER_ERRORS=""

# Temp dir for capturing background job output in order
BG_DIR=$(mktemp -d)
trap 'rm -rf "$BG_DIR"' EXIT

echo ""
echo "=========================================="
echo "  BikerLink — TypeScript Import Checker   "
echo "=========================================="
echo ""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# check_import_errors_from_raw <label> <var_name> <raw_output>
# Filters pre-captured tsc output for import-specific error codes only.
check_import_errors_from_raw() {
  local label="$1"
  local var_name="$2"
  local raw_output="$3"

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

# check_all_errors_from_raw <label> <raw_output>
# Fails (exit 1) if the pre-captured tsc output contains any type error.
# Must be called in the foreground — not inside a subshell.
check_all_errors_from_raw() {
  local label="$1"
  local raw_output="$2"

  local errors
  errors=$(echo "$raw_output" | grep -E "error TS[0-9]+" || true)
  if [ -z "$errors" ]; then
    echo "  ✓ ${label}: no type errors found"
  else
    local count
    count=$(echo "$errors" | wc -l | tr -d ' ')
    echo "  ✗ ${label}: ${count} type error(s) detected"
    echo ""
    echo "$errors" | sed 's/^/    /'
    echo ""
    echo "Fix the type errors above, then re-run: bash scripts/typecheck.sh"
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Phase 0: start slow background checks immediately
#
# check-client-undefined.sh is pure grep (~42s). Launching it now lets it
# run in parallel with the tsc passes below.
# ---------------------------------------------------------------------------

BG_CLIENT_UNDEFINED_OUT="${BG_DIR}/client_undefined.log"
bash "$(dirname "$0")/check-client-undefined.sh" > "$BG_CLIENT_UNDEFINED_OUT" 2>&1 &
BG_CLIENT_UNDEFINED_PID=$!

# ---------------------------------------------------------------------------
# Phase 1: import-error checks (single tsc pass per scope, output cached)
#
# CLIENT: uses tsconfig.client.json (app/, components/, hooks/, lib/, shared/)
#   — focused scope avoids scanning the entire repo.
#   The captured CLIENT_RAW is reused in Phase 2 for the full type check
#   so tsc is invoked only once for the client scope.
#
# SERVER: runs in background while the client tsc pass runs in the
#   foreground, overlapping the two ~20-34s compilations.
# ---------------------------------------------------------------------------

BG_SERVER_IMPORT_OUT="${BG_DIR}/server_import.log"
BG_SERVER_IMPORT_PID=""

if [ "$TARGET" = "server" ] || [ "$TARGET" = "both" ]; then
  echo "[Server (Express / Node.js)] Starting tsc --noEmit --project server/tsconfig.json (background)..."
  (npx tsc --noEmit --project "server/tsconfig.json" 2>&1 || true) > "$BG_SERVER_IMPORT_OUT" &
  BG_SERVER_IMPORT_PID=$!
fi

CLIENT_RAW=""

if [ "$TARGET" = "client" ] || [ "$TARGET" = "both" ]; then
  echo "[Client (Expo / React Native)] Running tsc --noEmit --project tsconfig.client.json ..."
  CLIENT_RAW=$(npx tsc --noEmit --project "tsconfig.client.json" 2>&1 || true)
  check_import_errors_from_raw "Client (Expo / React Native)" "CLIENT_ERRORS" "${CLIENT_RAW}"
  echo ""
fi

if [ -n "$BG_SERVER_IMPORT_PID" ]; then
  wait "$BG_SERVER_IMPORT_PID" 2>/dev/null || true
  SERVER_RAW=$(cat "$BG_SERVER_IMPORT_OUT")
  check_import_errors_from_raw "Server (Express / Node.js)" "SERVER_ERRORS" "${SERVER_RAW}"
  echo ""
fi

echo "=========================================="
echo "  Results: ${PASS} passed, ${FAIL} failed"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  kill "$BG_CLIENT_UNDEFINED_PID" 2>/dev/null || true
  wait "$BG_CLIENT_UNDEFINED_PID" 2>/dev/null || true
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
# Phase 2: full type checks (focused scopes, parallel where independent)
#
#   Scripts and Server Tests are launched in parallel — they are independent
#   of each other and of the client scope.
#   Client is re-checked from the cached CLIENT_RAW (zero additional tsc cost).
#
#   Root tsconfig.json is intentionally NOT used here; it is retained for
#   IDE / Expo dev-build purposes only.
# ---------------------------------------------------------------------------

BG_SCRIPTS_OUT="${BG_DIR}/scripts.log"
BG_SERVER_TESTS_OUT="${BG_DIR}/server_tests.log"

echo ""
echo "Running full type check [Scripts] in parallel (npx tsc --noEmit --project scripts/tsconfig.json)..."
(npx tsc --noEmit --project "scripts/tsconfig.json" 2>&1 || true) > "$BG_SCRIPTS_OUT" &
BG_SCRIPTS_PID=$!

echo "Running full type check [Server Tests] in parallel (npx tsc --noEmit --project server/tsconfig.test.json)..."
(npx tsc --noEmit --project "server/tsconfig.test.json" 2>&1 || true) > "$BG_SERVER_TESTS_OUT" &
BG_SERVER_TESTS_PID=$!

if [ "$TARGET" = "client" ] || [ "$TARGET" = "both" ]; then
  echo ""
  echo "Running full type check [Client (Expo/RN)] (reusing cached tsc output)..."
  check_all_errors_from_raw "Client (Expo/RN)" "${CLIENT_RAW}"
fi

wait "$BG_SCRIPTS_PID" 2>/dev/null || true
SCRIPTS_RAW=$(cat "$BG_SCRIPTS_OUT")
echo ""
check_all_errors_from_raw "Scripts" "${SCRIPTS_RAW}"

wait "$BG_SERVER_TESTS_PID" 2>/dev/null || true
SERVER_TESTS_RAW=$(cat "$BG_SERVER_TESTS_OUT")
echo ""
check_all_errors_from_raw "Server Tests" "${SERVER_TESTS_RAW}"

# ---------------------------------------------------------------------------
# Phase 3: remaining lightweight guards
# ---------------------------------------------------------------------------

echo ""
echo "Running schema-import guard..."
bash "$(dirname "$0")/check-schema-imports.sh"
SCHEMA_IMPORT_EXIT=$?
if [ $SCHEMA_IMPORT_EXIT -ne 0 ]; then
  kill "$BG_CLIENT_UNDEFINED_PID" 2>/dev/null || true
  wait "$BG_CLIENT_UNDEFINED_PID" 2>/dev/null || true
  exit $SCHEMA_IMPORT_EXIT
fi

# Collect the background client-undefined check (started in Phase 0).
# By this point (~58s into the run) it has been running for ~58s — its
# ~42s window is already done. We just flush its buffered output.
echo ""
echo "Collecting client-undefined safety check results..."
wait "$BG_CLIENT_UNDEFINED_PID" 2>/dev/null
CLIENT_UNDEFINED_EXIT=$?
cat "$BG_CLIENT_UNDEFINED_OUT"
if [ $CLIENT_UNDEFINED_EXIT -ne 0 ]; then
  exit $CLIENT_UNDEFINED_EXIT
fi

echo ""
echo "Running Leaflet map guard..."
bash "$(dirname "$0")/check-leaflet-map-guard.sh"
LEAFLET_MAP_GUARD_EXIT=$?
if [ $LEAFLET_MAP_GUARD_EXIT -ne 0 ]; then
  exit $LEAFLET_MAP_GUARD_EXIT
fi

echo ""
echo "Running Sistema A — version alignment check..."
bash "$(dirname "$0")/check-version-alignment.sh"
_VERSION_CHECK_EXIT=$?

_TC_ELAPSED=$(( SECONDS - _TC_START ))
echo ""
echo "TypeCheck completed in ${_TC_ELAPSED}s (budget: ${BUDGET_SECONDS}s)."
if [ "$_TC_ELAPSED" -gt "$BUDGET_SECONDS" ]; then
  echo ""
  echo "ERROR: typecheck budget exceeded — ${_TC_ELAPSED}s > ${BUDGET_SECONDS}s limit."
  echo "       Review recent tsconfig changes or new broad type-check scopes."
  exit 1
fi

exit $_VERSION_CHECK_EXIT
