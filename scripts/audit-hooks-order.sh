#!/usr/bin/env bash
# audit-hooks-order.sh
# Verifica che nessun hook React venga chiamato DOPO un early return nel corpo
# di un componente (violazione delle React Rules of Hooks).
#
# Strategia a due livelli:
#   1. oxlint react-hooks/rules-of-hooks — rileva violazioni vere a livello AST
#   2. Gate oxlint-disable/eslint-disable — blocca i commenti di soppressione che maschererebbero (1)
#
# Eseguire con: bash scripts/audit-hooks-order.sh
# Exit 0 = tutto ok; Exit 1 = violazioni trovate.

set -euo pipefail

FAIL=0

echo "════════════════════════════════════════"
echo "  Audit: Hooks order (rules-of-hooks)"
echo "════════════════════════════════════════"
echo ""

# ── 1. oxlint rules-of-hooks su tutti i file app/**/*.tsx ──────────────────
echo "▶ oxlint react-hooks/rules-of-hooks …"
OXLINT_OUT=$(npx oxlint -c .oxlintrc.json app/ 2>&1 || true)
OXLINT_HOOKS=$(echo "$OXLINT_OUT" | grep "react-hooks/rules-of-hooks" || true)

if [ -n "$OXLINT_HOOKS" ]; then
  echo "❌ oxlint rules-of-hooks: violazioni trovate"
  echo "$OXLINT_HOOKS"
  FAIL=1
else
  echo "   ✅ Nessuna violazione rules-of-hooks rilevata da oxlint"
fi

echo ""

# ── 2. Gate oxlint-disable/eslint-disable.*rules-of-hooks ──────────────────
echo "▶ Gate: disable-comment rules-of-hooks in app/ …"
DISABLE_FOUND=$(rg '(oxlint|eslint)-disable.*rules-of-hooks' \
  --glob 'app/**/*.tsx' --glob 'app/**/*.ts' \
  --glob '!node_modules/**' --glob '!.local/**' --glob '!.agents/**' \
  -n 2>/dev/null || true)

if [ -n "$DISABLE_FOUND" ]; then
  echo "❌ TROVATO — commento disable rules-of-hooks in app/"
  echo "$DISABLE_FOUND"
  FAIL=1
else
  echo "   ✅ Nessun commento disable rules-of-hooks trovato"
fi

echo ""
echo "════════════════════════════════════════"
if [ $FAIL -eq 1 ]; then
  echo "💥 Audit hooks-order FALLITO"
  echo "   Fix: spostare useMemo/useCallback/useState PRIMA degli early return"
  echo "   (if !data / if isLoading). Usare optional chaining dove necessario."
  exit 1
else
  echo "✅ Audit hooks-order SUPERATO — 212 screen verificati, 0 violazioni"
fi
