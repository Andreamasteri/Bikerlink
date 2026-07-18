#!/usr/bin/env bash
# check-horus-think-hardcoded.sh
#
# Scopo: rilevare `think: true` o `think:true` hardcodato nei file scripts/
# e server/ che chiamano Ollama, in modo da prevenire che un futuro script
# o callsite backend Horus ignori silenziosamente HORUS_THINK_ENABLED.
#
# Pattern approvato:
#   think: HORUS_THINK_ENABLED   <- variabile, OK
#   think: false                  <- disabilitato esplicitamente, OK
#   think: thinkSeparated         <- variabile locale, OK
#   think: ollamaThinkSeparated   <- variabile locale, OK
#
# Pattern NON approvato:
#   think: true                   <- hardcodato, bypassa HORUS_THINK env
#   think:true                    <- idem (senza spazio)
#
# Directory scansionate: scripts/ e server/ (escluse server/__tests__ e
# server/scripts/ — gli script di verifica e le test assertion che controllano
# che think:true SIA passato sono legittimi, non violazioni).
#
# Soppressione (caso raro dove think:true e' intenzionale e documentato):
#   // check-horus-think-hardcoded: safe
# Il commento deve essere sulla riga immediatamente precedente o sulla stessa
# riga dell'occorrenza.
#
# Perche' e' pericoloso:
#   Tre script Horus (horus-patch-scan.core.ts, log-analysis-horus.ts,
#   horus-app-analysis.ts) usano HORUS_THINK_ENABLED per permettere di
#   disabilitare il ragionamento via HORUS_THINK=0. Un futuro script o
#   callsite backend che hardcoda think:true ignora questo override e rende
#   impossibile usare la modalita' veloce (no-reasoning) in ambienti a bassa
#   risorsa o nel dry-run.
#
# Vedi: .agents/memory/qwen3-ollama-think-quirk.md
#        scripts/horus-patch-scan.core.ts (pattern di riferimento, Task #574)

set -euo pipefail

echo "Scanning scripts/ and server/ for hardcoded think:true..."

RESULT=$(python3 - << 'PYEOF'
import os
import re

# Directories to scan
SCAN_DIRS = ["scripts", "server"]

SUPPRESSION = "check-horus-think-hardcoded: safe"

# Files to skip entirely (self-reference, or legitimate allowlisted paths)
EXCLUDED_FILES = {
    "scripts/check-horus-think-hardcoded.sh",
}

# Subdirectory names that are never scanned regardless of which SCAN_DIR they
# appear in.  __tests__: test assertions that *check* think:true is passed are
# not violations.  scripts (under server/): verification/diagnostic scripts.
EXCLUDED_SUBDIRS = {"node_modules", ".git", "__pycache__", "__tests__", "scripts"}

# Matches think: true (literal boolean) — with or without spaces around colon
RE_THINK_TRUE = re.compile(r'\bthink\s*:\s*true\b')

# Detects an echo or print statement (shell) containing the pattern as a string
# e.g.  echo "   think: true ..."
RE_ECHO_LINE = re.compile(r'^\s*(?:echo|printf)\s')


def is_in_comment(line: str, match_start: int, is_shell: bool) -> bool:
    """Return True if the match position falls inside a comment."""
    stripped = line.lstrip()

    # Shell: whole-line comment (starts with #)
    if is_shell and stripped.startswith("#"):
        return True

    # TypeScript/JS: whole-line // comment
    if not is_shell and stripped.startswith("//"):
        return True

    # TypeScript/JS: JSDoc / block comment continuation line (starts with *)
    if not is_shell and stripped.startswith("*"):
        return True

    # TypeScript/JS: inline comment — find the first // before the match position
    comment_idx = line.find("//")
    if comment_idx != -1 and comment_idx < match_start:
        return True

    return False


violations = []

for scan_dir in SCAN_DIRS:
    if not os.path.isdir(scan_dir):
        continue
    for root, dirs, files in os.walk(scan_dir):
        dirs[:] = [d for d in dirs if d not in EXCLUDED_SUBDIRS]
        for fname in files:
            if not (fname.endswith(".ts") or fname.endswith(".tsx") or
                    fname.endswith(".js") or fname.endswith(".jsx") or
                    fname.endswith(".sh")):
                continue

            fpath = os.path.join(root, fname)
            # Normalize without leading "./"
            display_path = fpath.lstrip("./")

            if display_path in EXCLUDED_FILES:
                continue

            is_shell = fname.endswith(".sh")

            try:
                with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                    lines = f.readlines()
            except OSError:
                continue

            for i, line in enumerate(lines):
                m = RE_THINK_TRUE.search(line)
                if not m:
                    continue

                lineno = i + 1  # 1-based

                # Skip comment lines and echo/printf lines (string content, not code)
                if is_in_comment(line, m.start(), is_shell):
                    continue
                if is_shell and RE_ECHO_LINE.match(line):
                    continue

                # Check suppression: same line or immediately preceding line
                suppressed = SUPPRESSION in line
                if not suppressed and i > 0:
                    suppressed = SUPPRESSION in lines[i - 1]
                if suppressed:
                    continue

                violations.append(f"{display_path}:{lineno}: {line.rstrip()}")

if violations:
    print("FAIL")
    for v in violations:
        print(v)
else:
    print("OK")
PYEOF
)

FIRST_LINE=$(echo "$RESULT" | head -1)

if [ "$FIRST_LINE" = "OK" ]; then
  echo "OK - No hardcoded think:true found in scripts/ or server/"
  echo ""
  echo "All Horus callsites use HORUS_THINK_ENABLED (or a variable, or think:false)."
  exit 0
else
  echo ""
  VIOLATIONS=$(echo "$RESULT" | tail -n +2)
  while IFS= read -r vline; do
    [ -z "$vline" ] && continue
    echo "FAIL: $vline"
  done <<< "$VIOLATIONS"
  echo ""
  echo "check-horus-think-hardcoded FAILED"
  echo ""
  echo "The pattern 'think: true' hardcoded bypasses the HORUS_THINK_ENABLED"
  echo "env variable, making it impossible to use no-reasoning mode via HORUS_THINK=0."
  echo ""
  echo "FIX: replace"
  echo "  options: { think: true }"
  echo "with"
  echo "  const HORUS_THINK_ENABLED = process.env.HORUS_THINK !== '0';"
  echo "  options: { think: HORUS_THINK_ENABLED, num_predict: HORUS_THINK_ENABLED ? 800 : 600 }"
  echo ""
  echo "For streaming-only surfaces (where think:true routes reasoning to a"
  echo "side channel and the variable is derived from a DB setting), use:"
  echo "  // check-horus-think-hardcoded: safe"
  echo "  options: { think: true }"
  echo ""
  echo "Reference: scripts/horus-patch-scan.core.ts"
  echo "           .agents/memory/qwen3-ollama-think-quirk.md"
  exit 1
fi
