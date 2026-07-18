#!/usr/bin/env bash
# check-quebracho-stale.sh
#
# CI gate: fails if any visible UI string or non-comment code in the admin
# screens or AI-assistant lib contains the word "Quebracho".
#
# Why this matters:
#   Quebracho was removed and unified into Horus (Task #591). References to
#   "Quebracho" in admin labels, subtitles, PERSONA_LABELS, or component text
#   mislead operators into thinking a separate agent still exists.
#   Task #600 cleaned these up manually; this gate prevents re-introduction.
#
# What is scanned:
#   app/admin/      — admin screens
#   components/admin/ — admin UI components
#   lib/ai-assistant/ — persona labels, roster constants, type definitions
#
# What is flagged:
#   Any line in a .ts / .tsx file that contains the literal string "Quebracho"
#   and is NOT inside a comment (// line comment, /* block comment */, or
#   JSDoc /** … */ continuation lines starting with *).
#
# Suppression (use only when a reference is intentional and documented):
#   Add the following comment on the line immediately above OR on the same line:
#     // check-quebracho-stale: safe
#
# Usage:
#   bash scripts/check-quebracho-stale.sh
#   exit 0 → no violations
#   exit 1 → violations found

set -euo pipefail

SCAN_DIRS=("app/admin" "components/admin" "lib/ai-assistant")

RESULT=$(python3 - << 'PYEOF'
import os
import re
import sys

SCAN_DIRS = ["app/admin", "components/admin", "lib/ai-assistant"]
SUPPRESSION = "check-quebracho-stale: safe"

TARGET_WORD = "Quebracho"


def is_comment_line(line: str) -> bool:
    """Return True if the whole line is a comment (not code with a trailing comment)."""
    stripped = line.lstrip()
    # // single-line comment
    if stripped.startswith("//"):
        return True
    # * continuation inside /** ... */ or /* ... */
    if stripped.startswith("*"):
        return True
    # Shell / Python # comment (not expected here but be defensive)
    if stripped.startswith("#"):
        return True
    return False


def has_inline_comment_before(line: str, match_start: int) -> bool:
    """Return True if 'Quebracho' appears only after a // inline comment marker."""
    comment_idx = line.find("//")
    if comment_idx != -1 and comment_idx < match_start:
        return True
    return False


violations = []

for scan_dir in SCAN_DIRS:
    if not os.path.isdir(scan_dir):
        # Directory not present — skip silently (not an error; may not exist yet)
        continue
    for root, dirs, files in os.walk(scan_dir):
        dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", "__pycache__")]
        for fname in sorted(files):
            if not (fname.endswith(".ts") or fname.endswith(".tsx")):
                continue

            fpath = os.path.join(root, fname)

            try:
                with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                    lines = f.readlines()
            except OSError:
                continue

            # Track block comment state (/* ... */)
            in_block_comment = False

            for i, line in enumerate(lines):
                stripped = line.strip()

                # Update block-comment state
                if in_block_comment:
                    if "*/" in line:
                        in_block_comment = False
                    # Everything on this line is inside /* ... */
                    continue

                if "/*" in line and TARGET_WORD not in line[:line.find("/*")]:
                    # Block comment opens; if target is before /*, it would be
                    # caught below. If /* comes first, enter block mode.
                    if "/*" in line:
                        before_block = line[:line.find("/*")]
                        if TARGET_WORD not in before_block:
                            if "*/" not in line[line.find("/*"):]:
                                in_block_comment = True
                            continue
                        # else: target appears before /* — fall through to check it

                if TARGET_WORD not in line:
                    continue

                # Skip pure comment lines
                if is_comment_line(line):
                    continue

                # Find exact match position(s)
                for m in re.finditer(re.escape(TARGET_WORD), line):
                    match_start = m.start()

                    # Skip if match is after an inline // comment
                    if has_inline_comment_before(line, match_start):
                        continue

                    # Skip if match is inside a /* ... */ on the same line
                    open_idx = line.find("/*")
                    if open_idx != -1 and open_idx < match_start:
                        continue

                    # Check suppression: same line or immediately preceding non-blank line
                    suppressed = SUPPRESSION in line
                    if not suppressed:
                        j = i - 1
                        while j >= 0:
                            prev = lines[j].strip()
                            if prev == "":
                                j -= 1
                                continue
                            if SUPPRESSION in lines[j]:
                                suppressed = True
                            break

                    if suppressed:
                        continue

                    # Relative path without leading "./"
                    display = fpath.lstrip("./")
                    violations.append({
                        "file": display,
                        "lineno": i + 1,
                        "text": line.rstrip(),
                    })
                    break  # one violation per line is enough

if not violations:
    scanned = []
    for sd in SCAN_DIRS:
        count = sum(
            1
            for root, _, files in os.walk(sd)
            for f in files
            if f.endswith(".ts") or f.endswith(".tsx")
        ) if os.path.isdir(sd) else 0
        scanned.append(f"{sd}/ ({count} files)")
    print(f"OK — 0 violations in {', '.join(scanned)}")
    sys.exit(0)

unique_files = len(set(v["file"] for v in violations))
print(f"FAIL — {len(violations)} violation{'s' if len(violations) != 1 else ''} in {unique_files} file{'s' if unique_files != 1 else ''}")
for v in violations:
    print(f"  {v['file']}:{v['lineno']}: {v['text'].strip()}")
sys.exit(1)
PYEOF
)

EXIT_CODE=$?
FIRST_LINE=$(echo "$RESULT" | head -1)

if [[ "$FIRST_LINE" == OK* ]]; then
  echo "✅ check-quebracho-stale PASSATO — $FIRST_LINE"
  exit 0
fi

# FAIL case
echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║  QUEBRACHO STALE REFERENCE — visibile nell'admin UI o nel codice    ║"
echo "╠══════════════════════════════════════════════════════════════════════╣"
echo "║  Quebracho è stato rimosso e unificato in Horus (Task #591).        ║"
echo "║  Un riferimento a 'Quebracho' in una label, subtitle, costante o    ║"
echo "║  stringa visibile dell'admin inganna gli operatori e suggerisce che  ║"
echo "║  esista ancora un agente separato.                                   ║"
echo "║                                                                      ║"
echo "║  FIX: sostituisci 'Quebracho' con 'Horus' (o rimuovi il riferimento) ║"
echo "║  nelle stringhe visibili, label, PERSONA_LABELS, subtitle.           ║"
echo "║                                                                      ║"
echo "║  Contesti legittimi (note storiche in commenti /* */ o //):          ║"
echo "║  sono già ignorati automaticamente dal check.                        ║"
echo "║                                                                      ║"
echo "║  Soppressione (solo se il riferimento è intenzionale e documentato): ║"
echo "║    // check-quebracho-stale: safe                                    ║"
echo "║    const LABEL = 'Quebracho';                                        ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Violazioni trovate:"
echo "$RESULT" | tail -n +2
echo ""
exit 1
