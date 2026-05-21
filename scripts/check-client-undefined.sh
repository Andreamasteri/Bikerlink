#!/usr/bin/env bash
# =============================================================================
# check-client-undefined.sh — Client-side undefined runtime safety check
# =============================================================================
#
# PATTERN THIS GUARDS AGAINST (OTA-4 crash, May 2026):
#
#   1. A shared module (e.g. shared/schema.ts) is imported client-side.
#   2. That module imports Node.js-only packages (drizzle-orm, pg, etc.)
#      at the top level.
#   3. Metro bundles those Node.js packages as `mocks/empty.js`.
#   4. If the mock returns `{}` (empty), functions like `pgTable()` are
#      `undefined`, so calling them throws at module init time.
#   5. A module that throws during initialization exports NOTHING — all
#      named exports (including Zod schemas like `loginSchema`) become
#      `undefined` in the consuming file.
#   6. Calling `loginSchema.safeParse()` → "TypeError: undefined is not
#      a function" — the OTA-4 crash in handleLogin.
#
# FIX APPLIED: mocks/empty.js is now a universal no-op Proxy that survives
#   any call or property access without throwing. This prevents the module
#   init crash. The mock MUST remain a Proxy — never downgrade it to `{}`.
#
# WHAT THIS SCRIPT CHECKS:
#   (a) No file under app/, components/, lib/, hooks/ imports directly from
#       server/ paths (absolute or relative).
#   (b) Every named value imported client-side from @shared/schema is
#       actually exported by shared/schema.ts (the file Metro resolves to).
#   (c) mocks/empty.js is still a Proxy (not a plain empty object).
#
# Usage:
#   bash scripts/check-client-undefined.sh
#
# Exit code: 0 = all clear, 1 = violations found
# =============================================================================

set -uo pipefail

FAIL=0
PASS=0

echo ""
echo "=============================================="
echo "  BikerLink — Client Undefined Safety Check  "
echo "=============================================="
echo ""

# ---------------------------------------------------------------------------
# CHECK A: no client file imports from server/ paths
# ---------------------------------------------------------------------------
echo "[A] Checking for server/ imports in client code..."

CLIENT_DIRS="app components lib hooks"
SERVER_IMPORT_PATTERN="from ['\"][./]*server/"

server_hits=""
for dir in $CLIENT_DIRS; do
  if [ -d "$dir" ]; then
    hits=$(grep -rn --include="*.ts" --include="*.tsx" \
      -E "$SERVER_IMPORT_PATTERN" "$dir" 2>/dev/null || true)
    if [ -n "$hits" ]; then
      server_hits="${server_hits}${hits}"$'\n'
    fi
  fi
done

if [ -z "$server_hits" ]; then
  echo "  ✓ No server/ imports found in client code"
  PASS=$((PASS + 1))
else
  echo "  ✗ Direct server/ imports detected in client code:"
  echo ""
  echo "$server_hits" | sed 's/^/    /'
  echo ""
  echo "  Fix: move shared logic to shared/ and import from @shared/"
  FAIL=$((FAIL + 1))
fi
echo ""

# ---------------------------------------------------------------------------
# CHECK B: named @shared/schema imports exist in shared/schema.ts
#
# Metro module resolution: when both shared/schema.ts (file) and
# shared/schema/ (directory) exist, the FILE wins. So @shared/schema always
# resolves to shared/schema.ts on the client — never to the barrel index.
#
# The barrel (shared/schema/index.ts) is therefore irrelevant for client
# bundle resolution and must NOT be used for this check. Using it would
# silently pass any symbol because it contains "export * from ..." lines
# that would match regardless of whether the specific symbol exists.
#
# This check greps shared/schema.ts directly for each named import.
# Type-only imports are skipped (erased at compile time, safe at runtime).
# ---------------------------------------------------------------------------
echo "[B] Checking named @shared/schema imports exist in shared/schema.ts..."

SCHEMA_FILE="shared/schema.ts"

if [ ! -f "$SCHEMA_FILE" ]; then
  echo "  ✗ shared/schema.ts not found — Metro has no file to resolve @shared/schema"
  FAIL=$((FAIL + 1))
else
  missing_exports=""

  for dir in $CLIENT_DIRS; do
    if [ ! -d "$dir" ]; then continue; fi

    while IFS= read -r line; do
      # Skip type-only imports — they are erased at compile time
      if echo "$line" | grep -qE "import type "; then
        continue
      fi

      file=$(echo "$line" | cut -d: -f1)
      lineno=$(echo "$line" | cut -d: -f2)
      content=$(echo "$line" | cut -d: -f3-)

      # Extract names from "import { A, B, C } from ..."
      names=$(echo "$content" | grep -oE '\{[^}]+\}' | tr -d '{}' | tr ',' '\n' \
        | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//' | grep -v '^$' || true)

      for name in $names; do
        # Strip "as Alias" alias syntax
        clean_name=$(echo "$name" | sed 's/ as .*//' | tr -d ' ')
        [ -z "$clean_name" ] && continue

        # Check shared/schema.ts for a concrete export of this symbol.
        # Matches: export const|function|class|type|interface|enum <name>
        # or:      export { ..., <name>, ... }
        # Does NOT match "export *" — that would bypass the check.
        if ! grep -qE \
          "^export (const|function|class|type|interface|enum|abstract class) ${clean_name}[ <({=]|^export \{[^}]*\b${clean_name}\b[^}]*\}" \
          "$SCHEMA_FILE" 2>/dev/null; then
          missing_exports="${missing_exports}    ${file}:${lineno} — '${clean_name}' not exported from shared/schema.ts"$'\n'
        fi
      done
    done < <(grep -rn --include="*.ts" --include="*.tsx" \
      -E "from ['\"]@shared/schema['\"]" "$dir" 2>/dev/null || true)
  done

  if [ -z "$missing_exports" ]; then
    echo "  ✓ All @shared/schema named imports found in shared/schema.ts"
    PASS=$((PASS + 1))
  else
    echo "  ✗ Missing exports detected — these will be undefined at runtime:"
    echo ""
    echo "$missing_exports"
    echo "  Fix: add the missing export to shared/schema.ts or the appropriate"
    echo "       shared/schema/*.ts sub-file (ensure shared/schema.ts re-exports it)."
    FAIL=$((FAIL + 1))
  fi
fi
echo ""

# ---------------------------------------------------------------------------
# CHECK C: mocks/empty.js is still a Proxy (not a plain empty object)
#
# The OTA-4 crash was caused by mocks/empty.js being `module.exports = {}`
# which made pgTable, sql, etc. undefined. The fix is a universal no-op
# Proxy. This check ensures nobody accidentally reverts it.
# ---------------------------------------------------------------------------
echo "[C] Verifying mocks/empty.js is a Proxy (not an empty object)..."

MOCK_FILE="mocks/empty.js"
if [ ! -f "$MOCK_FILE" ]; then
  echo "  ✗ mocks/empty.js not found — Metro cannot mock server-only packages!"
  FAIL=$((FAIL + 1))
elif grep -q "new Proxy" "$MOCK_FILE"; then
  echo "  ✓ mocks/empty.js is a Proxy — safe for drizzle-orm/pg-core calls"
  PASS=$((PASS + 1))
else
  echo "  ✗ mocks/empty.js does NOT use Proxy!"
  echo ""
  echo "  This is the OTA-4 regression risk: if pgTable(), sql\`\`, etc. are"
  echo "  undefined, shared/schema.ts crashes at module init and ALL exports"
  echo "  (including loginSchema) become undefined at runtime on the client."
  echo ""
  echo "  Fix: restore mocks/empty.js to the universal no-op Proxy pattern."
  echo "  See: mocks/empty.js (check git history for the correct version)"
  FAIL=$((FAIL + 1))
fi
echo ""

# ---------------------------------------------------------------------------
# CHECK D: self-test — verify Check B actually catches missing symbols
#
# This smoke test confirms that the export-existence check (Check B) is not
# silently broken (e.g. by a regex that always matches). It runs Check B's
# core grep against a symbol that definitely does NOT exist in shared/schema.ts
# and asserts that grep returns non-zero (i.e. not found).
#
# If this test fails it means Check B's grep logic has regressed to always-true
# and would silently pass missing-symbol bugs.
# ---------------------------------------------------------------------------
echo "[D] Self-test: verifying Check B grep correctly rejects a nonexistent symbol..."

SENTINEL="__DOES_NOT_EXIST_OTA4_SENTINEL__"
if [ -f "$SCHEMA_FILE" ]; then
  if grep -qE \
    "^export (const|function|class|type|interface|enum|abstract class) ${SENTINEL}[ <({=]|^export \{[^}]*\b${SENTINEL}\b[^}]*\}" \
    "$SCHEMA_FILE" 2>/dev/null; then
    echo "  ✗ Self-test FAILED: Check B grep matched a nonexistent symbol '${SENTINEL}'"
    echo "    This means the export-validation regex is always-true and Check B"
    echo "    cannot catch missing symbols. Fix the grep pattern in this script."
    FAIL=$((FAIL + 1))
  else
    echo "  ✓ Self-test passed: grep correctly reported '${SENTINEL}' as not exported"
    PASS=$((PASS + 1))
  fi
else
  echo "  - Self-test skipped: shared/schema.ts not found"
fi
echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo "=============================================="
echo "  Results: ${PASS} passed, ${FAIL} failed"
echo "=============================================="

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Fix the issues above to prevent undefined runtime crashes on client."
  echo "See OTA-4 post-mortem comment at the top of this script for context."
  echo ""
  exit 1
fi

echo ""
echo "All client-safety checks passed."
exit 0
