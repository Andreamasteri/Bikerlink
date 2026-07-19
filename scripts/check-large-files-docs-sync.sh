#!/usr/bin/env bash
# check-large-files-docs-sync.sh
#
# Scans docs, scripts and TypeScript comment lines for hardcoded line-limit
# numbers that describe either the GATE threshold (MAX_LINES) or the SPLIT
# TARGET floor (SPLIT_TARGET) but disagree with the values in
# scripts/lib/large-files-core.ts.
#
# ── Gate-describing patterns (any of these in a non-split-target line) ──
#   "max N lines"
#   "Limite N righe per file"
#   "Ratchet N righe" / "ratchet N righe"
#   "gate ≤N righe" / "gate <=N righe" / "gate N righe"
#   "REGOLA FERREA … N righe per file"
#   "limite globale N"
#
# Lines containing "split target", "risultant", or "stare sotto" are skipped
# from the gate scan: those legitimately reference the split floor.
#
# ── Split-target-describing patterns (checked separately vs SPLIT_TARGET) ──
#   "≤N righe (split target" / "split target ≤N"
#   "file risultanti … N righe"
#   "stare sotto … N righe"
#   "target ≤N lines/righe/per"
#
# Files scanned:
#   scripts/*.sh, scripts/pre-commit  — full text
#   scripts/**/*.ts                   — comment lines only (// or *)
#   replit.md, docs/*.md              — full text
#
# Exit 0  — all gate and split-target references use the correct values
# Exit 1  — one or more stale hardcoded references found

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
CORE="$REPO_ROOT/scripts/lib/large-files-core.ts"

# --- Extract the authoritative MAX_LINES and SPLIT_TARGET ---
AUTHORITATIVE=$(grep -E '^export const MAX_LINES\s*=' "$CORE" | grep -oE '[0-9]+' | head -1)
if [[ -z "$AUTHORITATIVE" ]]; then
  echo "❌ check-large-files-docs-sync: impossibile estrarre MAX_LINES da $CORE"
  exit 1
fi

SPLIT_TARGET=$(grep -E '^export const SPLIT_TARGET\s*=' "$CORE" | grep -oE '[0-9]+' | head -1)
if [[ -z "$SPLIT_TARGET" ]]; then
  echo "❌ check-large-files-docs-sync: impossibile estrarre SPLIT_TARGET da $CORE"
  exit 1
fi

# ═══════════════════════════════════════════════════════════════════
# SECTION A — Gate threshold scan (MAX_LINES)
# ═══════════════════════════════════════════════════════════════════

# --- Patterns that describe the gate threshold (ERE) ---
# Covers English and Italian gate descriptions, including ≤N / <=N / N variants.
# Numbers in gate patterns must be ≥100 to avoid false positives on unrelated
# inline numbers (e.g. "max 4 lines" in a text-processing comment).
GATE_PAT='(max [0-9]{3,} lines|[Ll]imite [0-9]{3,} righe per file|[Rr]atchet [0-9]{3,} righe|[Gg]ate [≤<=]*[0-9]{3,} righe|REGOLA FERREA[^0-9]*[0-9]{3,} righe per file|limite globale [0-9]{3,})'

# Lines describing split-target context (skip — legitimately use a lower number)
# Only skip lines that explicitly describe the split-target floor (not the gate).
# "risultant" covers "file risultanti ≤750" style phrasing.
# "storico" covers historical audit records that recorded the old gate value at the time.
# Note: "stare sotto" / "restare sotto" are intentionally NOT included: those phrases can
# appear in gate-limit statements ("restare sotto il limite 800 righe") and would create
# false negatives if skipped.
SKIP_PAT='split[- ]target|risultant|split when exceeded|storico'

FAILURES=0
FAIL_LINES=()

# --- Helper: process one grep result line for GATE threshold ---
# $1 = display path  $2 = "linenum:linetext" or "file:linenum:linetext"
process_match() {
  local display="$1"
  local raw="$2"

  # Skip split-target context
  if echo "$raw" | grep -qiE "$SKIP_PAT"; then return; fi

  # Extract the number from the gate pattern match
  local num
  num=$(echo "$raw" | grep -oiE "$GATE_PAT" | grep -oE '[0-9]+' | head -1)
  [[ -z "$num" ]] && return

  if [[ "$num" != "$AUTHORITATIVE" ]]; then
    local linetext
    linetext=$(echo "$raw" | sed 's/^[0-9]*://')
    local trimmed
    trimmed=$(echo "$linetext" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
    FAIL_LINES+=("  $display")
    FAIL_LINES+=("    → $trimmed")
    FAIL_LINES+=("    → numero trovato: $num  (atteso: MAX_LINES=$AUTHORITATIVE)")
    FAILURES=$((FAILURES + 1))
  fi
}

# --- A1) Scan plain text files (shell, markdown) — full file ---
PLAIN_GLOBS=(
  "$REPO_ROOT/scripts/"*.sh
  "$REPO_ROOT/scripts/pre-commit"
  "$REPO_ROOT/replit.md"
  "$REPO_ROOT/docs/"*.md
)

for f in "${PLAIN_GLOBS[@]}"; do
  [[ -f "$f" ]] || continue
  rel="${f#$REPO_ROOT/}"
  while IFS= read -r match; do
    [[ -z "$match" ]] && continue
    process_match "$rel" "$match"
  done < <(grep -nE "$GATE_PAT" "$f" 2>/dev/null || true)
done

# --- A2) Scan TypeScript files — comment lines only (// or *) ---
# Uses grep -rn to find comment lines matching the gate pattern in one pass.
# Exclude the source-of-truth file itself.
while IFS= read -r raw; do
  [[ -z "$raw" ]] && continue
  # raw format: /abs/path/to/file.ts:NNN:  // comment text
  # Strip repo root prefix for display
  file_abs=$(echo "$raw" | cut -d: -f1)
  [[ "$file_abs" == "$CORE" ]] && continue
  rel="${file_abs#$REPO_ROOT/}"
  rest=$(echo "$raw" | cut -d: -f2-)
  process_match "$rel" "$rest"
done < <(
  grep -rnE "^\s*(//|\*).*($GATE_PAT)" \
    "$REPO_ROOT/scripts" \
    --include='*.ts' 2>/dev/null || true
)

# ═══════════════════════════════════════════════════════════════════
# SECTION B — Split-target floor scan (SPLIT_TARGET)
# ═══════════════════════════════════════════════════════════════════
#
# Patterns that describe the split-target floor (ERE).
# These are the mirror of GATE_PAT but for split-target-describing phrasing.
# Each sub-pattern is written so that the FIRST 3+ digit number extracted from
# the match is the split target, not the gate threshold.
#
#   A) "≤N righe (split target"  — checklist item
#   B) "split target ≤N" / "split target ≤N lines/righe"
#   C) "file risultant…N…righe"
#   D) "stare sotto…N righe"
#   E) "target ≤N lines/righe/per"  — ratchet.sh comment style
#
# When extracting the number we filter out the gate threshold (AUTHORITATIVE)
# so that lines mentioning both values (e.g. "≤750 righe … blocca a 800") yield
# only the split-target number.
SPLIT_PAT='([≤<=][[:space:]]*[0-9]{3,}[[:space:]]*(righe|lines)[^0-9]*split[- ]target|split[- ]target[^0-9]*[≤<=][[:space:]]*[0-9]{3,}|file risultant[^0-9]*[0-9]{3,}[^0-9]*(righe|lines)|stare sotto[^0-9]*[0-9]{3,}[[:space:]]*(righe|lines)|target[[:space:]]*[≤<=][[:space:]]*[0-9]{3,}[[:space:]]*(righe|lines|per))'

# --- Helper: process one grep result line for SPLIT TARGET floor ---
# $1 = display path  $2 = "linenum:linetext"
process_split_match() {
  local display="$1"
  local raw="$2"

  # Extract the number from the split-target pattern match, excluding the gate threshold.
  local num
  num=$(echo "$raw" | grep -oiE "$SPLIT_PAT" | grep -oE '[0-9]+' | (grep -v "^${AUTHORITATIVE}$" || true) | head -1)
  [[ -z "$num" ]] && return

  if [[ "$num" != "$SPLIT_TARGET" ]]; then
    local linetext
    linetext=$(echo "$raw" | sed 's/^[0-9]*://')
    local trimmed
    trimmed=$(echo "$linetext" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
    FAIL_LINES+=("  $display")
    FAIL_LINES+=("    → $trimmed")
    FAIL_LINES+=("    → split-target trovato: $num  (atteso: SPLIT_TARGET=$SPLIT_TARGET)")
    FAILURES=$((FAILURES + 1))
  fi
}

# --- B1) Scan plain text files for split-target floor ---
for f in "${PLAIN_GLOBS[@]}"; do
  [[ -f "$f" ]] || continue
  rel="${f#$REPO_ROOT/}"
  while IFS= read -r match; do
    [[ -z "$match" ]] && continue
    process_split_match "$rel" "$match"
  done < <(grep -nE "$SPLIT_PAT" "$f" 2>/dev/null || true)
done

# --- B2) Scan TypeScript comment lines for split-target floor ---
while IFS= read -r raw; do
  [[ -z "$raw" ]] && continue
  file_abs=$(echo "$raw" | cut -d: -f1)
  [[ "$file_abs" == "$CORE" ]] && continue
  rel="${file_abs#$REPO_ROOT/}"
  rest=$(echo "$raw" | cut -d: -f2-)
  process_split_match "$rel" "$rest"
done < <(
  grep -rnE "^\s*(//|\*).*($SPLIT_PAT)" \
    "$REPO_ROOT/scripts" \
    --include='*.ts' 2>/dev/null || true
)

# ═══════════════════════════════════════════════════════════════════
# Report
# ═══════════════════════════════════════════════════════════════════
if [[ $FAILURES -eq 0 ]]; then
  echo "✅ check-large-files-docs-sync: tutti i riferimenti gate (MAX_LINES=$AUTHORITATIVE) e split-target (SPLIT_TARGET=$SPLIT_TARGET) sono in sync — nessun drift."
  exit 0
fi

echo "❌ check-large-files-docs-sync: $FAILURES riferimento/i hardcoded con valore divergente (MAX_LINES=$AUTHORITATIVE, SPLIT_TARGET=$SPLIT_TARGET):"
echo ""
for line in "${FAIL_LINES[@]}"; do
  echo "$line"
done
echo ""
echo "   Per riferimenti al GATE threshold: aggiorna il numero a MAX_LINES=$AUTHORITATIVE."
echo "   Per riferimenti al SPLIT TARGET: aggiorna il numero a SPLIT_TARGET=$SPLIT_TARGET."
echo "   Modifica SPLIT_TARGET in scripts/lib/large-files-core.ts per cambiare il valore autorevole."
exit 1
