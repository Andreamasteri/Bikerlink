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
#   (A) No file under app/, components/, lib/, hooks/ imports directly from
#       server/ paths (absolute or relative).
#   (B) Every named value imported client-side from ANY @shared/* module is
#       actually exported by the resolved shared file.
#       Also verifies the resolved file does NOT import any SERVER_ONLY_PACKAGES.
#       Modules currently scanned: all @shared/* paths found in client code.
#   (C) mocks/empty.js is still a Proxy (not a plain empty object).
#   (D) ALL shared/*.ts modules (not just client-imported ones) are free of
#       top-level imports from SERVER_ONLY_PACKAGES — catches future OTA-4
#       risks before a module is ever imported client-side.
#   (E) Self-test — verify Check B export-grep correctly rejects a nonexistent
#       symbol (regression guard for the grep pattern itself).
#
# MODULE RESOLUTION (mirrors Metro's behaviour):
#   For @shared/X the resolver tries in order:
#     1. shared/X.ts       — file wins when both file and directory exist
#     2. shared/X/index.ts — fallback when only a directory exists
#   Example: @shared/schema → shared/schema.ts  (NOT shared/schema/index.ts)
#            @shared/privacy-policy-it → shared/privacy-policy-it.ts
#
# SERVER_ONLY_PACKAGES (loaded dynamically from metro.config.js — single source):
#   These packages are replaced with mocks/empty.js on iOS/Android by Metro.
#   Any shared module that imports them risks the OTA-4 init-crash pattern.
#
# Usage:
#   bash scripts/check-client-undefined.sh
#
# Exit code: 0 = all clear, 1 = violations found
# =============================================================================

set -uo pipefail

FAIL=0
PASS=0

# ---------------------------------------------------------------------------
# SERVER_ONLY_PACKAGES — loaded dynamically from metro.config.js (single source)
# ---------------------------------------------------------------------------
# metro.config.js is the authoritative list. Do NOT add packages here manually.
# To add a new server-only package, edit the SERVER_ONLY_PACKAGES array in
# metro.config.js — this script will pick it up automatically.
mapfile -t SERVER_ONLY_PACKAGES < <(
  node -e "require('./metro.config.js').SERVER_ONLY_PACKAGES.forEach(p => console.log(p))" 2>/dev/null
)

if [ ${#SERVER_ONLY_PACKAGES[@]} -eq 0 ]; then
  echo "ERROR: Failed to load SERVER_ONLY_PACKAGES from metro.config.js"
  echo "  Ensure metro.config.js exports SERVER_ONLY_PACKAGES and Node.js is available."
  exit 1
fi

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
# CHECK B: named @shared/* imports exist in their resolved shared files,
#          and those files do NOT import any SERVER_ONLY_PACKAGES.
#
# Covers ALL @shared/* sub-paths used by client code — not just @shared/schema.
# The set of modules is discovered dynamically from the codebase, so new
# @shared/X additions are automatically included without editing this script.
#
# Metro module resolution — file wins over directory:
#   @shared/schema            → shared/schema.ts   (file, not shared/schema/index.ts)
#   @shared/privacy-policy-it → shared/privacy-policy-it.ts
#   @shared/event-types       → shared/event-types.ts
#   @shared/X                 → shared/X.ts  (preferred) or shared/X/index.ts
#
# The barrel (shared/schema/index.ts) is irrelevant for client bundle resolution
# because the FILE always wins when both file and directory exist (Metro rule).
# Using the barrel for this check would silently pass any symbol because it
# contains "export * from ..." lines that match everything.
#
# Type-only imports are skipped (erased at compile time, safe at runtime).
# ---------------------------------------------------------------------------
echo "[B] Checking ALL @shared/* named imports exist in their resolved shared files..."
echo "    (Also verifies each resolved file is free of SERVER_ONLY_PACKAGES imports)"
echo ""

# Helper: resolve @shared/SUFFIX to its actual file path (mirrors Metro logic)
resolve_shared_module() {
  local suffix="$1"
  local ts_file="shared/${suffix}.ts"
  local idx_file="shared/${suffix}/index.ts"
  if [ -f "$ts_file" ]; then
    echo "$ts_file"
  elif [ -f "$idx_file" ]; then
    echo "$idx_file"
  else
    echo ""
  fi
}

# Collect all unique @shared/* suffixes imported in client code
declare -A seen_modules

for dir in $CLIENT_DIRS; do
  [ -d "$dir" ] || continue
  while IFS= read -r match_line; do
    content=$(echo "$match_line" | cut -d: -f3-)
    # Skip type-only imports — erased at compile time
    echo "$content" | grep -qE "import type " && continue
    suffix=$(echo "$content" | grep -oE "@shared/[a-zA-Z0-9_/-]+" | head -1 | sed 's|@shared/||')
    [ -n "$suffix" ] && seen_modules["$suffix"]=1
  done < <(grep -rn --include="*.ts" --include="*.tsx" \
    -E "from ['\"]@shared/" "$dir" 2>/dev/null || true)
done

b_has_fail=0
all_b_missing=""
WARN=0

for module_suffix in "${!seen_modules[@]}"; do
  resolved_file=$(resolve_shared_module "$module_suffix")
  echo "  Module: @shared/${module_suffix}"

  if [ -z "$resolved_file" ]; then
    echo "    ✗ Cannot resolve: no shared/${module_suffix}.ts or shared/${module_suffix}/index.ts"
    all_b_missing="${all_b_missing}    @shared/${module_suffix}: source file not found"$'\n'
    b_has_fail=1
    echo ""
    continue
  fi

  echo "    Resolved → ${resolved_file}"

  # Sub-check B1: every named import from this module exists in the resolved file
  module_missing=""
  for dir in $CLIENT_DIRS; do
    [ -d "$dir" ] || continue
    while IFS= read -r line; do
      echo "$line" | grep -qE "import type " && continue

      file=$(echo "$line" | cut -d: -f1)
      lineno=$(echo "$line" | cut -d: -f2)
      content=$(echo "$line" | cut -d: -f3-)

      names=$(echo "$content" | grep -oE '\{[^}]+\}' | tr -d '{}' | tr ',' '\n' \
        | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//' | grep -v '^$' || true)

      for name in $names; do
        clean_name=$(echo "$name" | sed 's/ as .*//' | tr -d ' ')
        [ -z "$clean_name" ] && continue

        # Check the resolved file for a concrete export of this symbol.
        # Matches: export const|function|class|type|interface|enum <name>
        # or:      export { ..., <name>, ... }
        # Does NOT match "export *" — that would bypass the check.
        if ! grep -qE \
          "^export (const|function|class|type|interface|enum|abstract class) ${clean_name}[ <({=]|^export \{[^}]*\b${clean_name}\b[^}]*\}" \
          "$resolved_file" 2>/dev/null; then
          module_missing="${module_missing}      ${file}:${lineno} — '${clean_name}' not exported from ${resolved_file}"$'\n'
        fi
      done
    done < <(grep -rn --include="*.ts" --include="*.tsx" \
      -E "from ['\"]@shared/${module_suffix}['\"]" "$dir" 2>/dev/null || true)
  done

  if [ -z "$module_missing" ]; then
    echo "    ✓ All named imports exist in ${resolved_file}"
  else
    echo "    ✗ Missing exports (will be undefined at runtime):"
    echo "$module_missing"
    all_b_missing="${all_b_missing}${module_missing}"
    b_has_fail=1
  fi

  # Sub-check B2: resolved file does NOT import any SERVER_ONLY_PACKAGES.
  #
  # This is a WARNING (not a failure). shared/schema.ts intentionally imports
  # drizzle-orm/pg-core to define the DB schema — this is the known OTA-4
  # pattern, already mitigated by the Proxy mock (Check C). The warning keeps
  # developers aware that the Proxy mock is load-bearing for this module.
  # A true failure would permanently break this check for the current schema.
  file_server_hits=""
  for pkg in "${SERVER_ONLY_PACKAGES[@]}"; do
    hits=$(grep -nE "from ['\"]${pkg}['\"]|from ['\"]${pkg}/|require\(['\"]${pkg}['\"]|require\(['\"]${pkg}/" \
      "$resolved_file" 2>/dev/null || true)
    if [ -n "$hits" ]; then
      file_server_hits="${file_server_hits}      [${pkg}] ${hits}"$'\n'
    fi
  done

  if [ -z "$file_server_hits" ]; then
    echo "    ✓ No SERVER_ONLY_PACKAGES imports in ${resolved_file}"
  else
    echo "    ⚠ SERVER_ONLY_PACKAGES found in ${resolved_file} — protected by Proxy mock:"
    echo "$file_server_hits"
    echo "      → Proxy mock (mocks/empty.js) mitigates this at runtime (Check C)."
    echo "      → If this is NOT a schema file, consider moving logic to server/."
    WARN=$((WARN + 1))
  fi

  echo ""
done

if [ ${#seen_modules[@]} -eq 0 ]; then
  echo "  (no @shared/* imports found in client code)"
  PASS=$((PASS + 1))
elif [ "$b_has_fail" -eq 0 ]; then
  echo "  ✓ All @shared/* modules: named imports valid"
  PASS=$((PASS + 1))
else
  if [ -n "$all_b_missing" ]; then
    echo "  Fix (missing exports): add the missing export to the appropriate shared file."
    echo "       For @shared/schema, ensure shared/schema.ts re-exports the symbol."
  fi
  FAIL=$((FAIL + 1))
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
# CHECK D: scan ALL shared/*.ts modules (not just client-imported ones) for
#          top-level imports of SERVER_ONLY_PACKAGES.
#
# Rationale: a shared module that imports server-only packages today may be
# imported client-side in a future commit, silently reintroducing OTA-4.
# Catching it at the source (before client adoption) is cheaper than
# catching it post-deploy. This check is authoritative — it covers modules
# that Check B skips because they are not yet used by client code.
#
# This is a WARNING (not a failure). The known case — shared/schema.ts and
# shared/schema/*.ts importing drizzle-orm/pg-core — is intentional (DB
# schema definitions) and is already mitigated by the Proxy mock (Check C).
# The warning surfaces any NEW unexpected server-only imports that might
# appear in shared modules not yet covered by the Proxy mock mitigation.
#
# Files scanned: all shared/**/*.ts (top-level and sub-directories).
# Packages checked: SERVER_ONLY_PACKAGES array defined above (mirrors metro.config.js).
# ---------------------------------------------------------------------------
echo "[D] Scanning ALL shared/**/*.ts for SERVER_ONLY_PACKAGES imports..."
echo "    (Warns about future OTA-4 risks before any client imports the module)"
echo ""

d_warned=0

while IFS= read -r shared_file; do
  file_hits=""
  for pkg in "${SERVER_ONLY_PACKAGES[@]}"; do
    hits=$(grep -nE "from ['\"]${pkg}['\"]|from ['\"]${pkg}/|require\(['\"]${pkg}['\"]|require\(['\"]${pkg}/" \
      "$shared_file" 2>/dev/null || true)
    if [ -n "$hits" ]; then
      file_hits="${file_hits}      [${pkg}] ${hits}"$'\n'
    fi
  done

  if [ -n "$file_hits" ]; then
    echo "  ⚠ ${shared_file} imports SERVER_ONLY_PACKAGES:"
    echo "$file_hits"
    echo "    → If this file is imported client-side, the Proxy mock (mocks/empty.js)"
    echo "      must remain active (Check C) to prevent OTA-4 style crashes."
    echo "    → If this is NOT a schema/DB file, consider moving the import to server/."
    echo ""
    d_warned=1
    WARN=$((WARN + 1))
  fi
done < <(find shared -name "*.ts" -not -path "*/node_modules/*" 2>/dev/null | sort)

if [ "$d_warned" -eq 0 ]; then
  echo "  ✓ No shared/**/*.ts file imports SERVER_ONLY_PACKAGES at the top level"
  PASS=$((PASS + 1))
else
  echo "  Note: warnings above are informational. The Proxy mock (Check C) mitigates"
  echo "  runtime risk for known schema files. New warnings should be reviewed."
  PASS=$((PASS + 1))
fi
echo ""

# ---------------------------------------------------------------------------
# CHECK E: self-test — verify Check B export-grep correctly rejects a
#          nonexistent symbol (regression guard for the grep pattern itself).
#
# If this test fails it means Check B's grep logic has regressed to always-true
# and would silently pass missing-symbol bugs.
# ---------------------------------------------------------------------------
echo "[E] Self-test: verifying Check B grep correctly rejects a nonexistent symbol..."

SCHEMA_FILE="shared/schema.ts"
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
# CHECK E: no client file has value imports from @shared/schema
#
# Now that @shared/validators exists (pure Zod, no drizzle), client code
# should import from @shared/validators instead of @shared/schema.
# Type-only imports (`import type`) are still allowed from @shared/schema
# because they are erased at compile time and never touch the drizzle mock.
#
# A value import from @shared/schema forces Metro to load shared/schema.ts
# which in turn loads drizzle-orm — the exact hazard @shared/validators
# was created to eliminate.
# ---------------------------------------------------------------------------
echo "[E] Checking for @shared/schema value imports in client code..."
echo "    (type-only imports are OK; value imports should use @shared/validators)"

schema_value_hits=""
for dir in $CLIENT_DIRS; do
  if [ -d "$dir" ]; then
    # Find all lines that import from @shared/schema but are NOT type-only
    hits=$(grep -rn --include="*.ts" --include="*.tsx" \
      -E "from ['\"]@shared/schema['\"]" "$dir" 2>/dev/null \
      | grep -v "import type " || true)
    if [ -n "$hits" ]; then
      schema_value_hits="${schema_value_hits}${hits}"$'\n'
    fi
  fi
done

if [ -z "$schema_value_hits" ]; then
  echo "  ✓ No @shared/schema value imports found in client code"
  PASS=$((PASS + 1))
else
  echo "  ✗ @shared/schema value imports detected in client code:"
  echo ""
  echo "$schema_value_hits" | sed 's/^/    /'
  echo ""
  echo "  Fix: import Zod schemas and types from @shared/validators instead."
  echo "       Type-only imports (import type) from @shared/schema are still OK."
  FAIL=$((FAIL + 1))
fi
echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo "=============================================="
echo "  Results: ${PASS} passed, ${FAIL} failed, ${WARN} warned"
echo "=============================================="

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Fix the issues above to prevent undefined runtime crashes on client."
  echo "See OTA-4 post-mortem comment at the top of this script for context."
  echo ""
  exit 1
fi

echo ""
if [ "$WARN" -gt 0 ]; then
  echo "All client-safety checks passed (${WARN} warning(s) above are informational)."
else
  echo "All client-safety checks passed."
fi
exit 0
