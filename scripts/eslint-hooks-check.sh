#!/usr/bin/env bash
# CI ratchet for react-hooks/exhaustive-deps violations.
# Fails if the violation count INCREASES above the stored baseline.
# To lower the baseline: fix violations, then run with --update-baseline.
#
# Usage:
#   bash scripts/eslint-hooks-check.sh               # CI check
#   bash scripts/eslint-hooks-check.sh --update-baseline  # update after fixing

set -euo pipefail

BASELINE_FILE=".eslint-hooks-baseline"
UPDATE=false
TMP_OUT="/tmp/eslint-hooks-$$.txt"

if [[ "${1:-}" == "--update-baseline" ]]; then
  UPDATE=true
fi

cleanup() { rm -f "$TMP_OUT"; }
trap cleanup EXIT

echo "Running ESLint..."
# Write to temp file to avoid pipe-kill on large codebases
npx eslint . --ext .ts,.tsx --max-warnings 9999 > "$TMP_OUT" 2>&1 || true

COUNT=$(grep -c "exhaustive-deps" "$TMP_OUT" || true)
echo "Current react-hooks/exhaustive-deps violations: $COUNT"

if [[ "$UPDATE" == "true" ]]; then
  echo "$COUNT" > "$BASELINE_FILE"
  echo "Baseline updated to $COUNT in $BASELINE_FILE"
  exit 0
fi

if [[ ! -f "$BASELINE_FILE" ]]; then
  echo "ERROR: Baseline file '$BASELINE_FILE' not found."
  echo "Run:  bash scripts/eslint-hooks-check.sh --update-baseline"
  exit 1
fi

BASELINE=$(cat "$BASELINE_FILE" | tr -d '[:space:]')
echo "Baseline: $BASELINE"

if [[ "$COUNT" -gt "$BASELINE" ]]; then
  echo ""
  echo "FAIL: exhaustive-deps violations increased from $BASELINE to $COUNT."
  echo "Fix the new violations or run --update-baseline only after fixing existing ones."
  # Show new violations to help the developer
  grep "exhaustive-deps" "$TMP_OUT" | tail -20 || true
  exit 1
fi

echo ""
if [[ "$COUNT" -lt "$BASELINE" ]]; then
  echo "PASS (improved!): violations dropped from $BASELINE to $COUNT."
  echo "Tip: run 'bash scripts/eslint-hooks-check.sh --update-baseline' to lock in the lower baseline."
else
  echo "PASS: violations ($COUNT) within baseline ($BASELINE)."
fi
exit 0
