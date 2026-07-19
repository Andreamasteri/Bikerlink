#!/usr/bin/env bash
# check-pre-commit-hook-wiring.sh
#
# CI gate: verifies that the local .git/hooks/pre-commit is installed
# and contains the required gates.
#
# Why this matters:
#   scripts/pre-commit (the canonical hook source) calls:
#     - check-deploy-build-step-numbers.sh to catch a mis-numbered deploy-build.sh
#     - check-large-files-limit-sync.sh to catch hardcoded limit constants that
#       drift from scripts/lib/large-files-core.ts
#   The hook only fires if the developer has run scripts/setup-hooks.sh to
#   install it.  A missing or stale hook silently bypasses these gates until
#   post-merge.  This script makes the absence visible inside post-merge itself,
#   closing the gap.
#
# What is checked:
#   1. .git/hooks/pre-commit exists.
#   2. .git/hooks/pre-commit is executable.
#   3. .git/hooks/pre-commit contains a call to check-deploy-build-step-numbers.sh
#      (proving it is the current version that includes the step-numbering gate).
#   4. .git/hooks/pre-commit contains a call to check-large-files-limit-sync.sh
#      (proving it is the current version that includes the limit-sync gate).
#
# Usage:
#   bash scripts/check-pre-commit-hook-wiring.sh
#   exit 0 → hook is installed and includes all required gates
#   exit 1 → hook missing, not executable, or stale (one or more gates not wired in)

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
HOOK_PATH="$REPO_ROOT/.git/hooks/pre-commit"
GATE_MARKER="check-deploy-build-step-numbers.sh"
GATE_MARKER_2="check-large-files-limit-sync.sh"
GATE_MARKER_3="check-replit-ports.sh"

FAIL=0

# ── Check 1: hook file exists ────────────────────────────────────────────────
if [[ ! -f "$HOOK_PATH" ]]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║  PRE-COMMIT HOOK NOT INSTALLED                                       ║"
  echo "╠══════════════════════════════════════════════════════════════════════╣"
  echo "║  .git/hooks/pre-commit does not exist.                               ║"
  echo "║                                                                      ║"
  echo "║  The hook is required so that deploy-build.sh step numbering is      ║"
  echo "║  verified before every local commit, not just at post-merge time.    ║"
  echo "║                                                                      ║"
  echo "║  FIX: bash scripts/setup-hooks.sh                                    ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""
  exit 1
fi

# ── Check 2: hook is executable ──────────────────────────────────────────────
if [[ ! -x "$HOOK_PATH" ]]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║  PRE-COMMIT HOOK NOT EXECUTABLE                                      ║"
  echo "╠══════════════════════════════════════════════════════════════════════╣"
  echo "║  .git/hooks/pre-commit exists but is not executable.                 ║"
  echo "║                                                                      ║"
  echo "║  FIX: chmod +x .git/hooks/pre-commit                                 ║"
  echo "║   or: bash scripts/setup-hooks.sh  (reinstalls + fixes permissions)  ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""
  exit 1
fi

# ── Check 3: hook contains the step-numbering gate ───────────────────────────
if ! grep -qF "$GATE_MARKER" "$HOOK_PATH"; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║  PRE-COMMIT HOOK IS STALE — STEP-NUMBERING GATE MISSING             ║"
  echo "╠══════════════════════════════════════════════════════════════════════╣"
  echo "║  .git/hooks/pre-commit does not call                                 ║"
  echo "║  check-deploy-build-step-numbers.sh.                                 ║"
  echo "║                                                                      ║"
  echo "║  The hook was likely installed before the step-numbering gate was    ║"
  echo "║  added to scripts/pre-commit.                                        ║"
  echo "║                                                                      ║"
  echo "║  FIX: bash scripts/setup-hooks.sh  (refreshes the installed hook)    ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""
  exit 1
fi

# ── Check 4: hook contains the limit-sync gate ───────────────────────────────
if ! grep -qF "$GATE_MARKER_2" "$HOOK_PATH"; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║  PRE-COMMIT HOOK IS STALE — LIMIT-SYNC GATE MISSING                 ║"
  echo "╠══════════════════════════════════════════════════════════════════════╣"
  echo "║  .git/hooks/pre-commit does not call                                 ║"
  echo "║  check-large-files-limit-sync.sh.                                    ║"
  echo "║                                                                      ║"
  echo "║  The hook was likely installed before the limit-sync gate was        ║"
  echo "║  added to scripts/pre-commit.                                        ║"
  echo "║                                                                      ║"
  echo "║  FIX: bash scripts/setup-hooks.sh  (refreshes the installed hook)    ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""
  exit 1
fi

# ── Check 5: hook contains the replit-ports gate ────────────────────────────
if ! grep -qF "$GATE_MARKER_3" "$HOOK_PATH"; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║  PRE-COMMIT HOOK IS STALE — REPLIT-PORTS GATE MISSING               ║"
  echo "╠══════════════════════════════════════════════════════════════════════╣"
  echo "║  .git/hooks/pre-commit does not call                                 ║"
  echo "║  check-replit-ports.sh.                                              ║"
  echo "║                                                                      ║"
  echo "║  The hook was likely installed before the replit-ports gate was      ║"
  echo "║  added to scripts/pre-commit.                                        ║"
  echo "║                                                                      ║"
  echo "║  FIX: bash scripts/setup-hooks.sh  (refreshes the installed hook)    ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""
  exit 1
fi

echo "✅ check-pre-commit-hook-wiring PASSATO — .git/hooks/pre-commit è installato ed include il gate step-numbering, il gate limit-sync e il gate replit-ports."
exit 0
