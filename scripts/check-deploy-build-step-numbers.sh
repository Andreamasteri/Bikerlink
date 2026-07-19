#!/usr/bin/env bash
# check-deploy-build-step-numbers.sh
#
# CI gate: fails if the [N/TOTAL] step labels in deploy-build.sh are not
# sequential, contain duplicates, or if TOTAL does not match the actual count.
#
# Why this matters:
#   deploy-build.sh uses labels like "=== [3/15] ..." to identify each phase.
#   When steps are added in a hurry, it is easy to introduce duplicates
#   ([1d/3], [1c/3]), out-of-order numbers, or a stale TOTAL.  This gate
#   catches those mistakes before they reach production logs.
#
# What is checked:
#   1. All step labels have the form [N/TOTAL] where N and TOTAL are integers.
#   2. No two labels share the same N.
#   3. N values form a strictly-increasing sequence starting at 1.
#   4. The declared TOTAL on every label matches the actual number of labels
#      found in the file.
#
# Suppression:
#   None — step numbering must always be consistent.
#
# Usage:
#   bash scripts/check-deploy-build-step-numbers.sh
#   exit 0 → numbering is correct
#   exit 1 → violations found

set -euo pipefail

TARGET="scripts/deploy-build.sh"

if [ ! -f "$TARGET" ]; then
  echo "❌ check-deploy-build-step-numbers: file not found: $TARGET"
  exit 1
fi

RESULT=$(python3 - << 'PYEOF'
import re
import sys

TARGET = "scripts/deploy-build.sh"

# Matches lines like:  log "=== [3/15] Some description..."
# Captures N and TOTAL as integers.
RE_STEP = re.compile(r'===\s+\[(\d+)/(\d+)\]')

with open(TARGET, encoding="utf-8") as f:
    lines = f.readlines()

labels = []   # list of (lineno_1based, n, total)
for i, line in enumerate(lines):
    m = RE_STEP.search(line)
    if m:
        labels.append((i + 1, int(m.group(1)), int(m.group(2))))

if not labels:
    print("FAIL — no [N/TOTAL] step labels found in " + TARGET)
    sys.exit(1)

violations = []
actual_count = len(labels)

# Check 1: TOTAL on each label must match the actual count.
for lineno, n, total in labels:
    if total != actual_count:
        violations.append(
            f"  line {lineno}: [{n}/{total}] — TOTAL is {total} but {actual_count} step labels exist"
        )

# Check 2: No duplicate N values.
seen_n = {}
for lineno, n, total in labels:
    if n in seen_n:
        violations.append(
            f"  line {lineno}: [{n}/{total}] — duplicate step number {n} (first seen at line {seen_n[n]})"
        )
    else:
        seen_n[n] = lineno

# Check 3: N values must be strictly increasing starting at 1.
sorted_labels = sorted(labels, key=lambda x: x[0])  # sort by line number
for idx, (lineno, n, total) in enumerate(sorted_labels):
    expected = idx + 1
    if n != expected:
        violations.append(
            f"  line {lineno}: [{n}/{total}] — expected step number {expected} at position {idx + 1}"
        )

if not violations:
    print(f"OK ({actual_count} step{'s' if actual_count != 1 else ''} found, numbering correct)")
    sys.exit(0)

print(f"FAIL ({len(violations)} violation{'s' if len(violations) != 1 else ''})")
for v in violations:
    print(v)
sys.exit(1)
PYEOF
)

EXIT_CODE=$?
FIRST_LINE=$(echo "$RESULT" | head -1)

if [[ "$FIRST_LINE" == OK* ]]; then
  echo "✅ check-deploy-build-step-numbers PASSATO — $FIRST_LINE"
  exit 0
fi

# FAIL case
echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║  DEPLOY-BUILD STEP NUMBERING VIOLATION                               ║"
echo "╠══════════════════════════════════════════════════════════════════════╣"
echo "║  I label [N/TOTAL] in deploy-build.sh non sono in ordine corretto.  ║"
echo "║                                                                      ║"
echo "║  Ogni step deve avere un numero progressivo unico e il TOTAL deve    ║"
echo "║  corrispondere al numero effettivo di step nel file.                 ║"
echo "║                                                                      ║"
echo "║  FIX: rinumera i label sequenzialmente da [1/N] a [N/N].            ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Violazioni trovate:"
echo "$RESULT" | tail -n +2
echo ""
exit 1
