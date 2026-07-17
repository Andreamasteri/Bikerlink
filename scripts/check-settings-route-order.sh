#!/usr/bin/env bash
# check-settings-route-order.sh
#
# CI gate: fails if any specific router.put("/literal-path", …) declaration
# appears AFTER the catch-all router.put("/:key", …) wildcard in
# server/routes/admin/settings.ts.
#
# Why this matters:
#   Express matches routes in declaration order. The /:key wildcard handler
#   intercepts ALL PUT requests that reach it. A specific handler declared
#   below it (e.g. router.put("/apk-url", …)) is silently dead — requests go
#   to /:key instead, which saves to the wrong DB key (the hyphenated path
#   segment rather than the underscored key the handler intended).
#   This bug existed undetected for /tc-terminal-apk-url and /play-store-url.
#
# What is flagged:
#   Any line matching router.put("/<literal>", …) that appears AFTER the line
#   matching router.put("/:key", …).
#   Literal paths: anything starting with "/" where the next char is NOT ":"
#   (i.e. not a param segment).
#
# Suppression (use only if the handler is intentionally unreachable and
# documented as such):
#   Add a comment on the line immediately above the router.put call:
#     // check-settings-route-order: safe
#
# Usage:
#   bash scripts/check-settings-route-order.sh
#   exit 0 → no violations
#   exit 1 → violations found

set -euo pipefail

TARGET="server/routes/admin/settings.ts"

if [ ! -f "$TARGET" ]; then
  echo "❌ check-settings-route-order: file not found: $TARGET"
  exit 1
fi

RESULT=$(python3 - << 'PYEOF'
import re
import sys

TARGET = "server/routes/admin/settings.ts"
SUPPRESSION = "check-settings-route-order: safe"

# Matches: router.put("/:key",  (the catch-all wildcard)
RE_WILDCARD = re.compile(r"""router\.put\(\s*["']/:""")

# Matches specific literal PUT routes: router.put("/something",
# where "something" does NOT start with ":"
# This covers both double-quote and single-quote delimiters.
RE_SPECIFIC = re.compile(r"""router\.put\(\s*["']/(?!:)""")

with open(TARGET, encoding="utf-8") as f:
    lines = f.readlines()

wildcard_lineno = None
violations = []

for i, line in enumerate(lines, start=1):
    stripped = line.strip()

    if wildcard_lineno is None:
        if RE_WILDCARD.search(line):
            wildcard_lineno = i
        continue  # still before the wildcard — nothing to check yet

    # We are past the wildcard line.
    if RE_SPECIFIC.search(line):
        # Check if the immediately preceding non-blank line is a suppression comment.
        j = i - 2  # 0-based index of the line above
        suppressed = False
        while j >= 0:
            prev = lines[j].strip()
            if prev == "":
                j -= 1
                continue
            if SUPPRESSION in prev:
                suppressed = True
            break
        if not suppressed:
            violations.append((i, line.rstrip()))

if wildcard_lineno is None:
    print(f"ERROR: catch-all router.put(\"/:key\", …) not found in {TARGET}")
    print(f"       The gate cannot function without the wildcard anchor.")
    sys.exit(2)

if not violations:
    print(f"OK (wildcard at line {wildcard_lineno})")
else:
    print(f"FAIL (wildcard at line {wildcard_lineno})")
    for lineno, text in violations:
        print(f"  line {lineno}: {text}")
PYEOF
)

FIRST_LINE=$(echo "$RESULT" | head -1)

if [[ "$FIRST_LINE" == OK* ]]; then
  echo "✅ check-settings-route-order PASSATO — $FIRST_LINE"
  exit 0
fi

if [[ "$FIRST_LINE" == ERROR* ]]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║  check-settings-route-order — ERRORE INTERNO                        ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "$RESULT"
  echo ""
  exit 1
fi

# FAIL case
echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║  ROUTE ORDER VIOLATION — settings.ts PUT handler dopo /:key          ║"
echo "╠══════════════════════════════════════════════════════════════════════╣"
echo "║  Un handler router.put(\"/percorso-specifico\", …) è dichiarato DOPO  ║"
echo "║  il catch-all router.put(\"/:key\", …).                               ║"
echo "║                                                                      ║"
echo "║  Express instrada tutte le richieste PUT al wildcard prima che       ║"
echo "║  l'handler specifico venga mai raggiunto — salva nel DB la chiave    ║"
echo "║  sbagliata (il segmento di path invece della chiave underscore).     ║"
echo "║                                                                      ║"
echo "║  FIX: sposta l'handler specifico PRIMA della riga /:key.             ║"
echo "║                                                                      ║"
echo "║  Soppressione (solo se la route è intenzionalmente irraggiungibile   ║"
echo "║  e documentata come tale):                                           ║"
echo "║    // check-settings-route-order: safe                               ║"
echo "║    router.put(\"/percorso\", …)                                       ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Violazioni trovate:"
echo "$RESULT" | tail -n +2
echo ""
exit 1
