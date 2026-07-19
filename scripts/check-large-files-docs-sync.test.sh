#!/usr/bin/env bash
# check-large-files-docs-sync.test.sh
#
# Self-test for check-large-files-docs-sync.sh.
# Proves that:
#   (A) A stale gate-limit comment causes the scanner to exit 1.
#   (B) A split-target line (contains "risultant") is correctly skipped (exit 0).
#   (C) A historical audit line (contains "storico") is correctly skipped (exit 0).
#   (D) A comment already using MAX_LINES causes the scanner to exit 0.
#
# Strategy: write a real fixture into docs/ so the scanner's actual glob picks
# it up, run the scanner, assert the exit code, then always clean up.
#
# Run:  bash scripts/check-large-files-docs-sync.test.sh
# Exit: 0  all assertions passed | 1 at least one failed

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCANNER="$REPO_ROOT/scripts/check-large-files-docs-sync.sh"
CORE="$REPO_ROOT/scripts/lib/large-files-core.ts"
FIXTURE="$REPO_ROOT/docs/_large-files-docs-sync-selftest.md"

MAX=$(grep -E '^export const MAX_LINES\s*=' "$CORE" | grep -oE '[0-9]+' | head -1)
OLD=$((MAX - 200))   # plausibly old gate value (600 when MAX=800)

PASS=0
FAIL=0

cleanup() { rm -f "$FIXTURE"; }
trap cleanup EXIT

assert_scanner() {
  local desc="$1"
  local expect_exit="$2"
  local content="$3"

  printf '%s\n' "$content" > "$FIXTURE"

  local actual_exit=0
  bash "$SCANNER" >/dev/null 2>&1 || actual_exit=$?

  if [[ "$actual_exit" -eq "$expect_exit" ]]; then
    echo "  ✅ PASS  [$desc]"
    PASS=$((PASS + 1))
  else
    echo "  ❌ FAIL  [$desc]  expected exit $expect_exit, got $actual_exit"
    FAIL=$((FAIL + 1))
  fi

  rm -f "$FIXTURE"
}

echo "🔍 check-large-files-docs-sync self-test (MAX_LINES=$MAX, stale=$OLD)"
echo ""

# (A) Stale gate-limit comment → scanner must FAIL (exit 1)
assert_scanner "stale 'max ${OLD} lines' → exit 1" 1 \
  "# CI ratchet for the \"max ${OLD} lines per TS file\" rule."

# (B) Split-target line (contains "risultant") → scanner must PASS (exit 0)
assert_scanner "split-target 'risultant ${OLD} righe' → exit 0" 0 \
  "# i file risultanti devono stare sotto ${OLD} righe (split target)."

# (C) Historical audit (contains "storico") → scanner must PASS (exit 0)
assert_scanner "storico 'Ratchet ${OLD} righe (storico)' → exit 0" 0 \
  "# | Ratchet ${OLD} righe (storico — gate era ${OLD} al momento) |"

# (D) Correct gate comment matching MAX_LINES → scanner must PASS (exit 0)
assert_scanner "correct 'max ${MAX} lines' → exit 0" 0 \
  "# CI ratchet for the \"max ${MAX} lines per TS file\" rule."

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo "✅ Tutti i $((PASS)) test passati."
  exit 0
else
  echo "❌ $FAIL/$((PASS + FAIL)) test falliti."
  exit 1
fi
