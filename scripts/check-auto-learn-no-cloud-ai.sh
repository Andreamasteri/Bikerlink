#!/usr/bin/env bash
# check-auto-learn-no-cloud-ai.sh
#
# Task #5336 — gate statico che blocca qualsiasi import futuro di un provider
# AI cloud (Groq/Gemini/OpenAI) dentro il job di auto-apprendimento LOCALE di
# Bowie (server/ai/assistant/auto-learn.ts).
#
# Perché: Task #5330 ha aggiunto un test runtime che verifica che il ciclo di
# auto-learn non usi mai un provider cloud, ma quel test scatta SOLO se il
# modulo cloud viene davvero importato e invocato a runtime (mock-bypassabile).
# Questo gate è più economico e non bypassabile: fallisce a lint/CI time se
# auto-learn.ts anche solo IMPORTA uno dei moduli cloud, prima che il codice
# giri.
#
# Import vietati in server/ai/assistant/auto-learn.ts (e nei suoi sotto-moduli):
#   - server/ai/moderation/provider.ts (runWithFallback = entrypoint cloud)
#   - server/lib/groq-client.ts
#   - server/lib/openai-route-client.ts
#   - qualunque modulo che esponga un client Gemini (google/generative-ai,
#     @google/genai, lib/gemini-client)
#
# Import consentito per la generazione: SOLO callOllamaChat / ollama-client.
#
# Invariante: server/ai/assistant/auto-learn.ts DEVE restare cloud-import-free.
# Vedi: .agents/memory (ai-provider-chain-strategy.md, ai-audit-logging.md)
#
# ⛔ auto-learn.ts MUST NOT be split into sub-modules.
#   This gate scans a SINGLE file plus any same-directory (./...) modules it
#   imports. If the file is split and cloud imports land in a new helper, this
#   gate will catch them because it also scans the helpers. Keep all logic in
#   this file; use internal helper functions instead of separate modules. If the
#   file grows beyond the size ratchet, extract pure utility functions to
#   EXISTING shared modules — never create a new local sub-module of auto-learn.
#   The file carries a `// @no-split` marker to document this constraint.

set -euo pipefail

TARGET="server/ai/assistant/auto-learn.ts"
TARGET_DIR="server/ai/assistant"

echo "🔍 Controllo che $TARGET (e i suoi sotto-moduli locali) non importino provider AI cloud..."

if [ ! -f "$TARGET" ]; then
  echo "⚠️  $TARGET non trovato — gate saltato (nessun file da controllare)."
  exit 0
fi

# ── Build the scan list: BFS over all same-directory (./...) imports ─────────
#
# Performs a full recursive traversal of the local module graph rooted at
# auto-learn.ts.  Starting from the root file, it finds every `./...` import
# or re-export, resolves the path, and repeats the process for the discovered
# files until no new files are found (fixpoint / BFS with cycle protection).
#
# This catches transitive delegation: if auto-learn.ts imports helperA, and
# helperA imports helperB which contains a cloud import, all three are scanned.
#
# Only `./` (same-directory-or-subdirectory) specifiers are followed; `../`
# paths lead to shared modules that are not local splits of auto-learn and are
# excluded from the BFS.  All discovered files are constrained to paths under
# TARGET_DIR to prevent the traversal from leaving the assistant/ subtree.
#
# Import detection uses a whole-file regex (not line-by-line) so multi-line
# import/export statements are handled reliably.
SCAN_LIST=$(python3 - << 'PYEOF'
import re, os
from collections import deque

TARGET     = "server/ai/assistant/auto-learn.ts"
TARGET_DIR = os.path.normpath("server/ai/assistant")

# Matches the specifier in any ES import/export that references a relative path
# starting with './' (same directory or subdirectory).  Applied to the whole
# file content so multi-line import blocks are handled correctly.
#
# Examples matched:
#   import { A, B } from './foo'
#   import type { T } from './foo'
#   import * as ns from './foo'
#   import Default from './foo'
#   export * from './foo'
#   export * as ns from './foo'
#   export { A, B } from './foo'
#   import(\n  './foo'\n)          ← dynamic import (also caught, belt-and-braces)
#
# We search the full file text with re.DOTALL so the pattern spans newlines,
# but we use a short-circuit `from` anchor to avoid catastrophic backtracking.
RE_LOCAL_SPECIFIER = re.compile(r"""from\s+['"](\.\/[^'"]+)['"]""")

def resolve_specifier(from_file: str, specifier: str) -> str | None:
    """
    Resolve a './foo' specifier relative to the directory of from_file.
    Returns a normalised repo-root-relative path, or None if not found.
    """
    from_dir = os.path.dirname(from_file)
    base = os.path.normpath(os.path.join(from_dir, specifier))
    # Only follow files that remain inside TARGET_DIR
    if not base.startswith(TARGET_DIR):
        return None
    for candidate in (base + ".ts", os.path.join(base, "index.ts")):
        if os.path.isfile(candidate):
            return candidate
    return None

visited: list[str] = []
queue: deque[str] = deque([TARGET])
seen: set[str] = {TARGET}

while queue:
    current = queue.popleft()
    visited.append(current)

    if not os.path.isfile(current):
        continue

    with open(current, encoding="utf-8") as f:
        content = f.read()

    for m in RE_LOCAL_SPECIFIER.finditer(content):
        specifier = m.group(1)
        resolved = resolve_specifier(current, specifier)
        if resolved and resolved not in seen:
            seen.add(resolved)
            queue.append(resolved)

print("\n".join(visited))
PYEOF
)

if [ -z "$SCAN_LIST" ]; then
  echo "⚠️  Impossibile costruire la lista dei file da scansionare — gate saltato."
  exit 0
fi

# Report the scan scope so failures are easy to interpret.
SCAN_COUNT=$(echo "$SCAN_LIST" | wc -l)
if [ "$SCAN_COUNT" -gt 1 ]; then
  echo "   Scope: $TARGET + $(( SCAN_COUNT - 1 )) sotto-modulo/i locale/i"
  echo "$SCAN_LIST" | tail -n +2 | while IFS= read -r f; do
    echo "     → $f"
  done
else
  echo "   Scope: $TARGET (nessun sotto-modulo locale rilevato)"
fi

FAIL=0

# ── Forbidden-import scan over all files in the scan list ────────────────────
declare -a FORBIDDEN_PATTERNS=(
  'moderation/provider'
  'lib/groq-client'
  'lib/openai-route-client'
  'lib/gemini-client'
  '@google/generative-ai'
  '@google/genai'
  '@ai-sdk/openai'
  '@ai-sdk/google'
  'runWithFallback'
)

while IFS= read -r scan_file; do
  for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
    MATCHES=$(rg -n -- "$pattern" "$scan_file" 2>/dev/null || true)
    if [ -n "$MATCHES" ]; then
      echo ""
      echo "❌ TROVATO — import/uso vietato di provider AI cloud in $scan_file"
      echo "   Pattern: $pattern"
      echo "$MATCHES"
      FAIL=1
    fi
  done
done <<< "$SCAN_LIST"

if [ "$FAIL" -eq 1 ]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║  AUTO-LEARN CLOUD AI IMPORT RILEVATO — GATE BLOCCATO                ║"
  echo "╠══════════════════════════════════════════════════════════════════════╣"
  echo "║  Il job di auto-apprendimento locale di Bowie DEVE restare          ║"
  echo "║  cloud-import-free: usa ESCLUSIVAMENTE il modello Ollama locale     ║"
  echo "║  (callOllamaChat / ollama-client), MAI Groq/Gemini/OpenAI né il    ║"
  echo "║  gateway runWithFallback (server/ai/moderation/provider.ts).        ║"
  echo "║                                                                      ║"
  echo "║  L'invariante vale anche per i sotto-moduli locali (./...):         ║"
  echo "║  un import cloud in un helper di auto-learn è una violazione.       ║"
  echo "║                                                                      ║"
  echo "║  FIX: rimuovere l'import cloud e usare solo callOllamaChat/         ║"
  echo "║  isOllamaConfigured da server/lib/ollama-client.                    ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  exit 1
fi

echo "✅ $TARGET e tutti i sotto-moduli locali non importano provider AI cloud."
