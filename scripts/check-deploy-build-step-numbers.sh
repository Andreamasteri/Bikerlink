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
#   5. deploy-build.sh does NOT delegate to part files via `source` or `. `.
#      If it ever does, the step labels would be scattered across files and
#      this gate would silently check an incomplete set — producing false TOTAL
#      counts and letting stale numbering reach production.
#
# ⛔ deploy-build.sh MUST NOT be split into part files.
#   This gate reads a single file. Splitting would scatter [N/TOTAL] labels
#   across files, and the TOTAL check would silently operate on a subset.
#   If the file grows beyond the size ratchet, convert steps to sub-scripts
#   that are CALLED (not sourced) and move the [N/TOTAL] labels to a
#   thin wrapper that stays in deploy-build.sh.
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

# ── Guard: detect ANY source/dot delegation ──────────────────────────────────
# If deploy-build.sh uses `source` or `. ` to load ANY external script, the
# [N/TOTAL] labels could be scattered across files. This gate would then check
# an incomplete set and produce false TOTAL counts. We block on ANY sourcing
# statement regardless of the target filename, so renaming a part file cannot
# bypass the guard.
#
# Detection strategy (Python parser):
#   1. Strip quoted string contents (single-quoted and double-quoted) so that
#      `source` / `.` inside string literals are invisible to the scanner.
#   2. Strip the comment tail (everything after a bare `#`).
#   3. Split the remaining command skeleton by shell separators (`;`, `&&`,
#      `||`, `|`) to obtain individual command segments.
#   4. For each segment, skip leading shell keywords (if/then/else/do/while/
#      until/for/case/in/!/time) and check whether the first real token is
#      `source` (any argument) or `.` (dot followed by a non-empty argument).
#   This catches: standalone `source f.sh`, `. f.sh`, `cmd; source f.sh`,
#   `true && . f`, `if source f.sh; then`, while correctly ignoring quoted
#   mentions like `echo "use source"` or `log "source ./foo.sh"`.
SOURCE_GUARD=$(python3 - << 'PYEOF'
import re, sys

TARGET = "scripts/deploy-build.sh"

# Shell keywords that may precede a real command in the same segment.
SHELL_KEYWORDS = {
    "if", "then", "else", "elif", "do", "while", "until",
    "for", "case", "in", "!", "time",
}

def strip_quotes_and_comments(raw):
    """Return the command skeleton of a shell line: no quoted contents, no comments."""
    out = []
    i = 0
    n = len(raw)
    while i < n:
        ch = raw[i]
        if ch == "'":
            # Single-quoted string: skip until matching close-quote (no escapes inside).
            i += 1
            while i < n and raw[i] != "'":
                i += 1
            i += 1          # consume closing '
            out.append(" ") # placeholder to preserve token boundaries
        elif ch == '"':
            # Double-quoted string: skip until unescaped closing ".
            i += 1
            while i < n:
                if raw[i] == "\\" and i + 1 < n:
                    i += 2  # skip escaped character
                elif raw[i] == '"':
                    i += 1
                    break
                else:
                    i += 1
            out.append(" ")
        elif ch == "#":
            # Bare `#` outside quotes starts a comment; drop the rest of the line.
            break
        else:
            out.append(ch)
            i += 1
    return "".join(out)

def command_segments(skeleton):
    """Split a command skeleton by ; && || | into individual command strings."""
    return re.split(r";|&&|\|\||(?<!\|)\|(?!\|)", skeleton)

def is_source_cmd(segment):
    """Return True if this command segment invokes `source` or the dot builtin."""
    tokens = segment.split()
    if not tokens:
        return False
    # Skip leading shell keywords to reach the real command token.
    idx = 0
    while idx < len(tokens) and tokens[idx] in SHELL_KEYWORDS:
        idx += 1
    if idx >= len(tokens):
        return False
    first = tokens[idx]
    if first == "source":
        # `source` with at least one argument.
        return idx + 1 < len(tokens)
    if first == ".":
        # Dot builtin with at least one argument (not a bare `.` path prefix).
        return idx + 1 < len(tokens)
    return False

hits = []
with open(TARGET, encoding="utf-8") as f:
    lines = f.readlines()

for lineno, raw in enumerate(lines, 1):
    stripped = raw.strip()
    if not stripped or stripped.startswith("#"):
        continue  # blank or full-line comment
    skeleton = strip_quotes_and_comments(raw.rstrip())
    for seg in command_segments(skeleton):
        if is_source_cmd(seg):
            hits.append((lineno, raw.rstrip()))
            break  # one match per line is enough

if hits:
    print("FOUND")
    for lineno, text in hits:
        print(f"  line {lineno}: {text}")
else:
    print("OK")
PYEOF
)

FIRST_GUARD=$(echo "$SOURCE_GUARD" | head -1)
if [[ "$FIRST_GUARD" == "FOUND" ]]; then
  SOURCE_LINES=$(echo "$SOURCE_GUARD" | tail -n +2)
  echo ""
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║  DEPLOY-BUILD SOURCE DELEGATION RILEVATA — GATE BLOCCATO            ║"
  echo "╠══════════════════════════════════════════════════════════════════════╣"
  echo "║  deploy-build.sh contiene una o più istruzioni source/. :           ║"
  echo "║                                                                      ║"
  echo "$SOURCE_LINES" | while IFS= read -r line; do
    printf "║    %-68s║\n" "$line"
  done
  echo "║                                                                      ║"
  echo "║  Questo gate legge un SINGOLO file per contare i label [N/TOTAL].   ║"
  echo "║  Se i label fossero in file separati, il TOTAL sarebbe stantio e    ║"
  echo "║  il conteggio silenziosamente sbagliato in produzione.              ║"
  echo "║                                                                      ║"
  echo "║  Alternativa corretta: chiama i sub-script con bash/sh (non         ║"
  echo "║  source/.) e mantieni i label [N/TOTAL] in questo file wrapper.     ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""
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
    # Do NOT call sys.exit(1) here: bash captures this block via RESULT=$(python3 ...)
    # with set -euo pipefail active.  A non-zero Python exit fires bash errexit
    # immediately, before the violation-box echo statements below can run, so the
    # gate would exit silently with no message.  The bash layer already branches
    # entirely on FIRST_LINE — no Python exit code is needed.
else:
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
    else:
        print(f"FAIL ({len(violations)} violation{'s' if len(violations) != 1 else ''})")
        for v in violations:
            print(v)
PYEOF
)

# Note: EXIT_CODE is intentionally not captured here.  With bash set -euo pipefail,
# a non-zero exit from inside RESULT=$(...) would fire errexit before the violation
# box below could print.  The gate branches entirely on FIRST_LINE content instead.
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
