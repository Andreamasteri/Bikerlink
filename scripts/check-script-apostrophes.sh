#!/bin/bash
# check-script-apostrophes.sh — Detect risky backslash-escaped apostrophes in
# TypeScript files that generate inline <script> HTML, and in HTML templates.
#
# ROOT CAUSE:
#   In TypeScript template literals (backtick strings), \' is NOT a valid escape
#   sequence. The backslash is silently dropped, so:
#
#     `<script>var s = 'Scarica l\'app';</script>`
#
#   renders in the browser as:
#
#     <script>var s = 'Scarica l'app';</script>   ← broken JS!
#
#   In static HTML files the \'  escape is technically valid JS, but we flag it
#   anyway to prevent copy-paste regressions into TypeScript template literals.
#
# SAFE PATTERN: use double quotes for strings containing apostrophes:
#
#     `<script>var s = "Scarica l'app";</script>`   ← correct

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "[apostrophe-check] Scanning files for \\' inside inline <script> blocks..."

FOUND=0

# ── Extract <script>…</script> blocks from a file and look for \' ────────────
check_file() {
  local file="$1"
  local kind="$2"   # "ts" or "html"

  # Pull only the content of <script> blocks (non-vendor, inline blocks only).
  # We skip <script src=…> lines (external scripts) and process only inline content.
  local script_content
  script_content=$(python3 - "$file" <<'PYEOF'
import sys, re

with open(sys.argv[1], encoding='utf-8', errors='replace') as f:
    src = f.read()

# Match <script …> … </script> blocks (non-greedy, case-insensitive)
# Exclude blocks with a src= attribute (those are external scripts)
pattern = re.compile(r'<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>', re.DOTALL | re.IGNORECASE)
parts = []
for m in pattern.finditer(src):
    attrs = m.group('attrs')
    if 'src=' in attrs:
        continue
    # Prefix each line with its real line number so we can report it
    body = m.group('body')
    start_line = src[:m.start('body')].count('\n') + 1
    for i, line in enumerate(body.split('\n')):
        parts.append(f"{start_line + i}:{line}")
print('\n'.join(parts))
PYEOF
)

  if [ -z "$script_content" ]; then
    return 0
  fi

  # Now search for \' (backslash + apostrophe) inside those script blocks
  local matches
  matches=$(echo "$script_content" | grep -P "\\\\'" || true)

  if [ -n "$matches" ]; then
    echo ""
    echo "[apostrophe-check] FAIL ($kind): $file"
    echo "$matches" | while IFS= read -r line; do
      echo "    $line"
    done
    FOUND=1
    # Export so the outer loop can see it
    return 1
  fi
  return 0
}

# ── Check TypeScript files that emit <script> HTML ────────────────────────────
while IFS= read -r -d '' file; do
  if ! grep -q '<script' "$file" 2>/dev/null; then
    continue
  fi
  check_file "$file" "ts" || FOUND=1
done < <(find "$PROJECT_ROOT/server/site" -name "*.ts" -print0 2>/dev/null)

# ── Check HTML template files ─────────────────────────────────────────────────
while IFS= read -r -d '' file; do
  check_file "$file" "html" || FOUND=1
done < <(find "$PROJECT_ROOT/server/templates" -name "*.html" -print0 2>/dev/null)

echo ""
if [ "$FOUND" -eq 1 ]; then
  echo "[apostrophe-check] FAIL — Found \\' inside <script> blocks."
  echo "  In TypeScript template literals, \\' silently drops the backslash, leaving a"
  echo "  bare apostrophe that breaks the browser JS parser."
  echo "  FIX: wrap strings containing apostrophes in double quotes: \"Scarica l'app\""
  exit 1
fi

echo "[apostrophe-check] OK — No risky apostrophe patterns found."
