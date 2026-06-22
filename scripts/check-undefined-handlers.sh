#!/usr/bin/env bash
# check-undefined-handlers.sh
# Detect .next.ts stub files that are imported as default Express handlers
# but lack `export default`. These cause TypeError at startup.
#
# Exit code 0 = clean, 1 = problems found.

set -euo pipefail

ROUTES_DIR="server/routes"
ERRORS=0

echo "=== check-undefined-handlers: scanning $ROUTES_DIR ==="

# Build a list of .next.ts files that have NO `export default`
STUBS_WITHOUT_DEFAULT=()
while IFS= read -r -d '' file; do
  if ! grep -q "export default" "$file"; then
    STUBS_WITHOUT_DEFAULT+=("$file")
  fi
done < <(find "$ROUTES_DIR" -name "*.next.ts" -print0)

if [[ ${#STUBS_WITHOUT_DEFAULT[@]} -eq 0 ]]; then
  echo "OK: all .next.ts files have export default (or none found)."
  exit 0
fi

echo "Found ${#STUBS_WITHOUT_DEFAULT[@]} .next.ts file(s) without 'export default':"
for stub in "${STUBS_WITHOUT_DEFAULT[@]}"; do
  # Extract the base import path (strip leading ./ and .ts suffix)
  # e.g. server/routes/admin/ota.next.ts → admin/ota.next
  rel="${stub#$ROUTES_DIR/}"
  rel_no_ext="${rel%.ts}"

  echo "  - $stub"

  # Search for any file that imports this stub as a default import:
  #   import <identifier> from '.../<basename>'
  #   import <identifier> from ".../<basename>"
  basename_no_ext="$(basename "$rel_no_ext")"
  # grep across all TS files except the stub itself
  matches=$(grep -rn "import [A-Za-z_][A-Za-z0-9_]* from ['\"].*${basename_no_ext}['\"]" \
    server/ --include="*.ts" \
    | grep -v "^${stub}:" || true)

  if [[ -n "$matches" ]]; then
    echo "    ERROR: imported as default router in:"
    echo "$matches" | sed 's/^/      /'
    ERRORS=$((ERRORS + 1))
  else
    echo "    ok: not imported as default anywhere (safe stub)."
  fi
done

echo ""
if [[ $ERRORS -gt 0 ]]; then
  echo "FAIL: $ERRORS stub(s) imported as default handler without 'export default'."
  echo "Fix: add 'export default router;' to each flagged file, or remove the import."
  exit 1
else
  echo "OK: no undefined-handler imports detected."
  exit 0
fi
