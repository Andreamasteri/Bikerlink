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

RG_FLAGS=(
  --type-add 'tsx:*.tsx' --type tsx
  --type-add 'ts_:*.ts' --type ts_
  --glob '!*.styles.ts'
  --glob '!*.styles.tsx'
  --glob '!node_modules/**'
  --glob '!.local/**'
  --glob '!.agents/**'
  --glob '!scripts/**'
)

check_pattern() {
  local pattern="$1"
  local label="$2"
  local results
  results=$(rg "$pattern" "${RG_FLAGS[@]}" -n 2>/dev/null || true)
  if [ -n "$results" ]; then
    echo ""
    echo "❌ TROVATO — $label"
    echo "$results"
    FAIL=1
  fi
}

check_pattern_multiline() {
  local pattern="$1"
  local label="$2"
  local results
  results=$(rg -U "$pattern" "${RG_FLAGS[@]}" -n 2>/dev/null || true)
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

# headerLeft inline (senza params): headerLeft: () =>
check_pattern 'headerLeft:\s*\(\)\s*=>' \
  "headerLeft con funzione arrow inline → usare useCallback (vedi rnav-memo-guard)"

# headerRight inline (senza params): headerRight: () =>
check_pattern 'headerRight:\s*\(\)\s*=>' \
  "headerRight con funzione arrow inline → usare useCallback (vedi rnav-memo-guard)"

# headerLeft inline (ternary, stessa riga): headerLeft: expr ? () =>
check_pattern 'headerLeft:\s*\S[^\n]*\?\s*\(\)\s*=>' \
  "headerLeft con ternario inline (stessa riga) → usare useCallback (vedi rnav-memo-guard)"

# headerRight inline (ternary, stessa riga): headerRight: expr ? () =>
check_pattern 'headerRight:\s*\S[^\n]*\?\s*\(\)\s*=>' \
  "headerRight con ternario inline (stessa riga) → usare useCallback (vedi rnav-memo-guard)"

# headerLeft/headerRight inline (ternary, riga successiva): prop:\n  ? () =>
check_pattern_multiline 'header(Left|Right):[^\n]*\n\s*\?\s*\(\)\s*=>' \
  "headerLeft/headerRight con ternario inline (riga successiva) → usare useCallback (vedi rnav-memo-guard)"

# tabBar inline: tabBar={(  oppure tabBar={ (
check_pattern 'tabBar=\{\s*\(' \
  "tabBar con funzione arrow inline → usare useCallback (vedi rnav-memo-guard)"

# screenOptions={{...}} con oggetto annidato *Style:{} — causa loop useLayoutEffect
# Pattern: screenOptions={{ ... xStyle: { ... } — rilevato via rg multiline
check_pattern_multiline 'screenOptions=\{\{[^}]{0,300}\w+Style:\s*\{' \
  "screenOptions={{}} con nested object (xStyle:{}) → wrappare con useMemo (vedi rnav-memo-guard)"

if [ $FAIL -eq 1 ]; then
  echo ""
  echo "💥 check-rnav-inline-props FALLITO"
  echo "   Wrappare le funzioni con useCallback, gli oggetti options con useMemo."
  echo "   Documentazione: .agents/skills/rnav-memo-guard/SKILL.md"
  exit 1
else
  echo "✅ Nessuna inline prop function trovata nei componenti di navigazione."
fi
