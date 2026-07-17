#!/usr/bin/env bash
# check-settings-route-order.sh
#
# CI gate: fails if any specific literal PUT/PATCH/DELETE route is declared
# AFTER a wildcard param route on the same HTTP verb within any router file
# under server/routes/.
#
# Why this matters:
#   Express matches routes in declaration order.  A wildcard like /:id or
#   /:key intercepts every request that reaches it.  A specific handler
#   declared below (e.g. router.put("/apk-url", …)) is silently dead —
#   requests are consumed by the wildcard first.
#   This bug existed undetected for /tc-terminal-apk-url and /play-store-url
#   in settings.ts before this gate was introduced.
#
# What is flagged:
#   For each HTTP verb (put, patch, delete) in each .ts file under
#   server/routes/, any specific route (first path segment is a literal)
#   that appears AFTER a wildcard route (first path segment is a param /:…)
#   of the SAME verb AND the SAME path depth.
#
#   Path depth is the number of non-empty segments in the route string.
#   /:id       → depth 1  — shadows /specific (depth 1) but NOT /group/:id (depth 2)
#   /:id/sub   → depth 2  — shadows /literal/sub (depth 2) only
#
# Suppression (use only if the handler is intentionally unreachable and
# documented as such):
#   Add a comment on the line immediately above the router call:
#     // check-route-order: safe
#
# The legacy suppression token is also accepted for backwards-compatibility:
#     // check-settings-route-order: safe
#
# Usage:
#   bash scripts/check-settings-route-order.sh
#   exit 0 → no violations
#   exit 1 → violations found

set -euo pipefail

ROUTES_DIR="server/routes"

if [ ! -d "$ROUTES_DIR" ]; then
  echo "❌ check-route-order: directory not found: $ROUTES_DIR"
  exit 1
fi

RESULT=$(python3 - << 'PYEOF'
import re
import sys
import glob

ROUTES_DIR = "server/routes"
SUPPRESSION_NEW = "check-route-order: safe"
SUPPRESSION_OLD = "check-settings-route-order: safe"

# Matches: router.<verb>("<path>", …)   (single- or double-quoted path)
RE_ROUTE = re.compile(
    r"""router\.(put|patch|delete)\(\s*["'](/[^"']*)["']"""
)

def path_depth(path):
    """Number of non-empty path segments."""
    return len([s for s in path.split("/") if s])

def is_wildcard_path(path):
    """True when the first path segment is a route parameter (/:…)."""
    segs = [s for s in path.split("/") if s]
    return len(segs) > 0 and segs[0].startswith(":")

def is_specific_path(path):
    """True when the first path segment is a literal (not a param)."""
    segs = [s for s in path.split("/") if s]
    return len(segs) > 0 and not segs[0].startswith(":")

def find_suppression(lines, zero_based_line_idx):
    """Return True if the nearest non-blank line above carries a suppression token."""
    j = zero_based_line_idx - 1
    while j >= 0:
        prev = lines[j].strip()
        if prev == "":
            j -= 1
            continue
        if SUPPRESSION_NEW in prev or SUPPRESSION_OLD in prev:
            return True
        break
    return False

files = sorted(glob.glob(f"{ROUTES_DIR}/**/*.ts", recursive=True))

all_violations = []

for filepath in files:
    with open(filepath, encoding="utf-8") as f:
        lines = f.readlines()

    # Per-verb: list of (lineno_1based, path) for wildcards already seen
    wildcards: dict[str, list[tuple[int, str]]] = {}
    file_violations = []

    for i, line in enumerate(lines):
        m = RE_ROUTE.search(line)
        if not m:
            continue
        verb = m.group(1).lower()
        path = m.group(2)

        if is_wildcard_path(path):
            wildcards.setdefault(verb, []).append((i + 1, path))
        elif is_specific_path(path):
            depth = path_depth(path)
            # Find any wildcard for this verb at the same depth declared earlier
            shadowing = [
                (wl, wp)
                for (wl, wp) in wildcards.get(verb, [])
                if path_depth(wp) == depth
            ]
            if shadowing and not find_suppression(lines, i):
                wl, wp = shadowing[0]
                file_violations.append({
                    "file": filepath,
                    "lineno": i + 1,
                    "verb": verb.upper(),
                    "path": path,
                    "wc_lineno": wl,
                    "wc_path": wp,
                    "text": line.rstrip(),
                })

    all_violations.extend(file_violations)

if not all_violations:
    count = len(files)
    print(f"OK ({count} file{'s' if count != 1 else ''} scanned, 0 violations)")
    sys.exit(0)

print(f"FAIL ({len(all_violations)} violation{'s' if len(all_violations) != 1 else ''} across {len(set(v['file'] for v in all_violations))} file{'s' if len(set(v['file'] for v in all_violations)) != 1 else ''})")
for v in all_violations:
    print(f"  {v['file']}:{v['lineno']}: [{v['verb']}] {v['path']!r} -- shadowed by {v['wc_path']!r} at line {v['wc_lineno']}")
    print(f"    {v['text'].strip()}")
sys.exit(1)
PYEOF
)

EXIT_CODE=$?
FIRST_LINE=$(echo "$RESULT" | head -1)

if [[ "$FIRST_LINE" == OK* ]]; then
  echo "✅ check-route-order PASSATO — $FIRST_LINE"
  exit 0
fi

# FAIL case
echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║  ROUTE ORDER VIOLATION — handler specifico dopo un wildcard param    ║"
echo "╠══════════════════════════════════════════════════════════════════════╣"
echo "║  Un handler router.put/patch/delete(\"/percorso-specifico\", …) è    ║"
echo "║  dichiarato DOPO un catch-all router.<verb>(\"/:param\", …) per lo   ║"
echo "║  stesso verbo HTTP e la stessa profondità di path.                   ║"
echo "║                                                                      ║"
echo "║  Express instrada la richiesta al wildcard prima che l'handler       ║"
echo "║  specifico venga mai raggiunto — route silenziosamente morta.        ║"
echo "║                                                                      ║"
echo "║  FIX: sposta l'handler specifico PRIMA della riga wildcard.          ║"
echo "║                                                                      ║"
echo "║  Soppressione (solo se la route è intenzionalmente irraggiungibile   ║"
echo "║  e documentata come tale):                                           ║"
echo "║    // check-route-order: safe                                        ║"
echo "║    router.put(\"/percorso\", …)                                       ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Violazioni trovate:"
echo "$RESULT" | tail -n +2
echo ""
exit 1
