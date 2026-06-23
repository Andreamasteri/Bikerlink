#!/usr/bin/env bash
# check-rnav-inline-props.sh
# Blocca funzioni arrow inline passate a prop di React Navigation.
# Queste causano "Maximum update depth exceeded" perché React Navigation
# chiama navigation.setOptions internamente ad ogni render — nuovo riferimento
# funzione a ogni render → setOptions → re-render → loop infinito.
#
# Fix: useCallback per le funzioni, useMemo per gli oggetti options.
# Vedi: .agents/skills/rnav-memo-guard/SKILL.md

set -euo pipefail

FAIL=0

echo "🔍 Controllo React Navigation inline prop functions..."

check_pattern() {
  local pattern="$1"
  local label="$2"
  local results
  results=$(rg "$pattern" \
    --type-add 'tsx:*.tsx' --type tsx \
    --type-add 'ts_:*.ts' --type ts_ \
    --glob '!*.styles.ts' \
    --glob '!*.styles.tsx' \
    --glob '!node_modules/**' \
    --glob '!.local/**' \
    --glob '!.agents/**' \
    --glob '!scripts/**' \
    -n 2>/dev/null || true)
  if [ -n "$results" ]; then
    echo ""
    echo "❌ TROVATO — $label"
    echo "$results"
    FAIL=1
  fi
}

# tabBarIcon inline: tabBarIcon: ({ color, size, focused }) => ...
check_pattern 'tabBarIcon:\s*\(\{' \
  "tabBarIcon con funzione arrow inline → usare useMemo sul componente parent (vedi rnav-memo-guard)"

# headerLeft inline in navigation options
check_pattern 'headerLeft:\s*\(\)\s*=>' \
  "headerLeft con funzione arrow inline → usare useCallback (vedi rnav-memo-guard)"

# headerRight inline in navigation options
check_pattern 'headerRight:\s*\(\)\s*=>' \
  "headerRight con funzione arrow inline → usare useCallback (vedi rnav-memo-guard)"

# tabBar inline: tabBar={(  oppure tabBar={ (
check_pattern 'tabBar=\{\s*\(' \
  "tabBar con funzione arrow inline → usare useCallback (vedi rnav-memo-guard)"

if [ $FAIL -eq 1 ]; then
  echo ""
  echo "💥 check-rnav-inline-props FALLITO"
  echo "   Wrappare le funzioni con useCallback, gli oggetti options con useMemo."
  echo "   Documentazione: .agents/skills/rnav-memo-guard/SKILL.md"
  exit 1
else
  echo "✅ Nessuna inline prop function trovata nei componenti di navigazione."
fi
