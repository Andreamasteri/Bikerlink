#!/usr/bin/env bash
# check-schema-imports.sh
#
# Lint rule: server/routes/** must NOT import Zod schema identifiers
# (any name ending in "Schema") from @shared/schema.
#
# Zod validators belong in @shared/validators. Drizzle table objects
# (users, events, etc.) may still come from @shared/schema.
#
# Catches:
#   - Static imports:  import { insertUserSchema } from "@shared/db"
#   - Dynamic imports: const { fooSchema } = await import("@shared/schema")
#   - Multi-line static imports spanning several lines
#
# Usage:
#   bash scripts/check-schema-imports.sh
# Exit code:
#   0 — no violations
#   1 — one or more violations found

set -uo pipefail

ROUTES_DIR="server/routes"

echo "Checking for forbidden Schema imports from @shared/schema in ${ROUTES_DIR}/**..."

VIOLATIONS=0
VIOLATION_OUTPUT=""

# Use Python for reliable multi-line import block parsing.
result=$(python3 - "$ROUTES_DIR" <<'PYEOF'
import re
import sys
import os

routes_dir = sys.argv[1]
violations = []

# Pattern 1: static import block  — import { ...Schema... } from "@shared/db"
static_re = re.compile(
    r'import\s*\{([^}]+)\}\s*from\s*["\']@shared/schema["\']',
    re.DOTALL
)

# Pattern 2: dynamic import — same line has Schema identifier and @shared/schema
dynamic_re = re.compile(
    r'[A-Za-z0-9_]+Schema[^"\']*["\']@shared/schema["\']'
    r'|["\']@shared/schema["\'][^"\']*[A-Za-z0-9_]+Schema'
)

for root, dirs, files in os.walk(routes_dir):
    # Skip node_modules if somehow present
    dirs[:] = [d for d in dirs if d != 'node_modules']
    for fname in files:
        if not fname.endswith('.ts'):
            continue
        fpath = os.path.join(root, fname)
        try:
            content = open(fpath, encoding='utf-8').read()
        except Exception:
            continue

        # Check static multi-line imports
        for m in static_re.finditer(content):
            imports_block = m.group(1)
            # Extract individual identifiers, stripping 'type' keyword and aliases
            identifiers = re.findall(r'\b([A-Za-z0-9_]+)\b', imports_block)
            schema_ids = [i for i in identifiers
                          if i.endswith('Schema') and i != 'type']
            if schema_ids:
                line_no = content[:m.start()].count('\n') + 1
                snippet = ' '.join(m.group(0).split())[:100]
                violations.append(f"{fpath}:{line_no}: {snippet}")

        # Check dynamic imports (same-line pattern)
        for i, line in enumerate(content.splitlines(), 1):
            if '@shared/schema' in line and re.search(r'[A-Za-z0-9_]+Schema', line):
                # Avoid double-reporting lines already caught by static_re
                # (static imports don't normally appear on a single line with 'import(')
                if 'import(' in line or 'require(' in line:
                    violations.append(f"{fpath}:{i}: {line.strip()[:100]}")

for v in violations:
    print(v)
PYEOF
)

if [ -n "$result" ]; then
  echo ""
  echo "  ERROR: Forbidden Zod Schema import(s) from @shared/schema detected:"
  echo ""
  echo "$result" | while IFS= read -r line; do
    echo "    $line"
    VIOLATIONS=$((VIOLATIONS + 1))
  done
  VIOLATIONS=$(echo "$result" | wc -l | tr -d ' ')
  echo ""
  echo "  Identifiers ending in 'Schema' must be imported from @shared/validators,"
  echo "  not @shared/schema. Example fix:"
  echo "    - import { insertUserSchema } from \"@shared/schema\""
  echo "    + import { insertUserSchema } from \"@shared/validators\""
  echo ""
  exit 1
else
  echo "  ✓ No forbidden Schema imports found in ${ROUTES_DIR}/**"
fi
