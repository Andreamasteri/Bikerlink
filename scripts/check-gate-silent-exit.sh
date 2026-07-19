#!/usr/bin/env bash
# check-gate-silent-exit.sh
#
# CI gate: fails if any scripts/check-*.sh contains sys.exit() with a non-zero
# argument inside a shell command-substitution heredoc block (VAR=$(python3 ...
# << 'MARKER' ... MARKER)).
#
# Why this matters:
#   When a bash script uses RESULT=$(python3 - << 'PYEOF' ... PYEOF) with
#   set -euo pipefail active, calling sys.exit(1) inside the Python block
#   causes bash errexit to fire the moment the substitution completes.
#   Control never reaches the echo / violation-box statements below — the gate
#   exits silently with no message.  The same bug has appeared in at least
#   three gate scripts.  This lint catches it at the point of introduction.
#
# What is scanned:
#   scripts/check-*.sh (all CI gate scripts in that directory)
#
# What is flagged:
#   Any sys.exit() call at statement position (start of line, after indent)
#   inside a VAR=$(python3 ... << 'MARKER' ... MARKER) block whose argument
#   is NOT the literal integer 0.
#   "Not 0" covers: sys.exit(1), sys.exit(2), sys.exit(0 if cond else 1).
#
# What is NOT flagged:
#   - sys.exit(0)           — harmless (Python exits 0, bash capture succeeds)
#   - Lines starting with # — Python comments inside the heredoc
#   - sys.exit inside a string or print() call — only statement-position calls
#     are detected (line must start with optional whitespace then sys.exit)
#   - Plain python3 ... << 'MARKER' without capture — sys.exit is fine there
#     because the Python exit code reaches bash directly
#
# Suppression:
#   None — use the OK/FAIL first-line + bash-branch pattern instead (see any
#   fixed gate script for the canonical form).
#
# Usage:
#   bash scripts/check-gate-silent-exit.sh
#   exit 0 -> all gate scripts clean
#   exit 1 -> violations found

set -euo pipefail

SCAN_GLOB="scripts/check-*.sh"

python3 - << 'PYEOF'
import glob
import re
import sys

SCAN_GLOB = "scripts/check-*.sh"

# Matches a shell line that opens a captured python heredoc:
#   VARNAME=$(python3 [args] << 'MARKER'   or   << "MARKER"
# Captures the heredoc end-marker as group 1.
# NOTE: we only apply this against non-comment shell lines (# lines skipped
# before the match) so that comment examples inside gate scripts cannot
# falsely trigger capture mode.
RE_CAPTURE_START = re.compile(
    r'\w+=\$\(\s*python3\b.*<<\s*[\'"](\w+)[\'"]'
)

# Matches sys.exit() at statement position — i.e. after optional leading
# whitespace but NOT inside a string or print().  Using ^ with re.MULTILINE
# is not needed here since we process line-by-line.
# Pattern: optional whitespace, then exactly 'sys.exit('.
RE_SYS_EXIT_STMT = re.compile(r'^\s*sys\.exit\((.+)\)')

files = sorted(glob.glob(SCAN_GLOB))
if not files:
    print("FAIL — no files matched " + repr(SCAN_GLOB))
    sys.exit(1)

violations = []

for filepath in files:
    with open(filepath, encoding="utf-8", errors="replace") as fh:
        lines = fh.readlines()

    in_capture_block = False
    end_marker = None

    for lineno, raw in enumerate(lines, start=1):
        line = raw.rstrip("\n")
        stripped = line.lstrip()

        if not in_capture_block:
            # Skip bash comment lines before checking for a capture open, so
            # that a comment like "# ... RESULT=$(python3 - << 'PYEOF'" in a
            # gate script's header does not falsely enter capture mode.
            if stripped.startswith("#"):
                continue
            m = RE_CAPTURE_START.search(line)
            if m:
                in_capture_block = True
                end_marker = m.group(1)
            continue

        # Detect the closing heredoc marker (alone on a line, possibly
        # with trailing whitespace).
        if line.strip() == end_marker:
            in_capture_block = False
            end_marker = None
            continue

        # Skip Python comment lines inside the heredoc.
        if stripped.startswith("#"):
            continue

        # Look for sys.exit() at statement position on this line.
        m = RE_SYS_EXIT_STMT.match(stripped)
        if not m:
            continue

        arg = m.group(1).strip()
        # Remove a trailing ')' if the regex captured it as part of arg.
        # The group captures everything after '(' until EOL, so strip the
        # closing paren and any trailing chars.
        # Simpler: strip outer closing paren.
        if arg.endswith(")"):
            arg = arg[:-1].strip()

        # sys.exit(0) is safe — Python exits 0, bash capture succeeds.
        if arg == "0":
            continue

        violations.append({
            "file": filepath,
            "lineno": lineno,
            "arg": arg,
            "text": line.strip(),
        })

scanned = len(files)

if not violations:
    print(
        "OK — 0 violations in "
        + str(scanned)
        + " file" + ("s" if scanned != 1 else "")
        + " (" + SCAN_GLOB + ")"
    )
    sys.exit(0)

unique_files = len(set(v["file"] for v in violations))
print(
    "FAIL — "
    + str(len(violations))
    + " violation" + ("s" if len(violations) != 1 else "")
    + " in "
    + str(unique_files)
    + " file" + ("s" if unique_files != 1 else "")
)
for v in violations:
    print("  " + v["file"] + ":" + str(v["lineno"]) + ": sys.exit(" + v["arg"] + ")")
    print("    " + v["text"])
sys.exit(1)
PYEOF
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "checkmark check-gate-silent-exit PASSED"
  exit 0
fi

echo ""
echo "=============================================================="
echo "  GATE SILENT-EXIT BUG"
echo "  sys.exit(<nonzero>) inside RESULT=\$(python3 ... << 'MARKER')"
echo "=============================================================="
echo ""
echo "  One or more gate scripts call sys.exit() with a non-zero"
echo "  argument inside a VAR=\$(python3 ... << 'MARKER' ...) block."
echo ""
echo "  Why this is a bug:"
echo "    With 'set -euo pipefail', a non-zero Python exit inside a"
echo "    command substitution triggers bash errexit immediately."
echo "    The violation-box echo statements below RESULT=\$(...) never"
echo "    run — the gate exits silently with no diagnostic message."
echo ""
echo "  FIX: use the OK/FAIL output pattern instead:"
echo "    - Print 'OK ...' or 'FAIL ...' as the first output line"
echo "    - Let Python exit 0 in all cases (omit sys.exit entirely)"
echo "    - Branch in bash on the first line of RESULT:"
echo "        FIRST_LINE=\$(echo \"\$RESULT\" | head -1)"
echo "        if [[ \"\$FIRST_LINE\" == OK* ]]; then ... fi"
echo ""
echo "  See scripts/check-settings-route-order.sh for the canonical form."
echo ""
exit 1
