#!/usr/bin/env bash
# check-quebracho-question-import.sh
#
# CI gate: fails if any file under server/, app/, or scripts/ imports from
# (or otherwise references) "quebracho-question".
#
# WHY THIS FILE WAS DELETED:
#   server/ai/assistant/quebracho-question.ts was removed when Quebracho was
#   fully absorbed into Horus (Task #591). Its only purpose was to compose a
#   synthesised question to forward to Quebracho before a persona handoff.
#   Since Quebracho no longer exists as a separate persona, there is no
#   recipient for that composed question and the entire flow was removed.
#   All coordination is now handled directly by Horus (server/ai/horus/ and
#   the horus-analyzer.ts / horus-coordinator-loop.ts pipeline).
#   Any future re-import of this path would produce a confusing "module not
#   found" build error with no obvious explanation. This gate makes the
#   reason self-explanatory.
#
# WHAT TO USE INSTEAD:
#   For Quebracho-style coordination, use Horus directly:
#     server/ai/horus/
#     server/ai/coordinator/horus-coordinator-loop.ts
#
# Usage:
#   bash scripts/check-quebracho-question-import.sh
#   exit 0 → no references found
#   exit 1 → stale references found (list printed to stdout)

set -euo pipefail

VIOLATIONS=$(grep -rn \
  --include="*.ts" \
  --include="*.tsx" \
  --include="*.js" \
  --include="*.sh" \
  "quebracho-question" \
  server/ app/ scripts/ \
  | grep -v "scripts/check-quebracho-question-import\.sh" \
  | grep -v "scripts/deploy-build\.sh" \
  | grep -v "^.*//.*quebracho-question" \
  || true)

if [ -z "$VIOLATIONS" ]; then
  echo "[quebracho-question-import] OK — no stale references to quebracho-question found."
  exit 0
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║  STALE quebracho-question REFERENCE DETECTED                        ║"
echo "╠══════════════════════════════════════════════════════════════════════╣"
echo "║  server/ai/assistant/quebracho-question.ts was DELETED when         ║"
echo "║  Quebracho was absorbed into Horus (see Task #591).                 ║"
echo "║  Its only role was composing a question to forward to Quebracho     ║"
echo "║  before a persona handoff — a flow that no longer exists.           ║"
echo "║  Quebracho no longer exists as a separate AI persona.               ║"
echo "║                                                                      ║"
echo "║  If you need Quebracho-style coordination, use Horus directly:      ║"
echo "║    server/ai/coordinator/horus-coordinator-loop.ts                  ║"
echo "║    server/ai/horus/                                                  ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Violations:"
echo "$VIOLATIONS"
echo ""
exit 1
