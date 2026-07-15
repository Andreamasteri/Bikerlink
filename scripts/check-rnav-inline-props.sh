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

# ── Funzioni inline nelle prop di navigazione ─────────────────────────────────

# tabBarIcon inline: tabBarIcon: ({ color, size, focused }) => ...
check_pattern 'tabBarIcon:\s*\(\{' \
  "tabBarIcon con funzione arrow inline → usare useMemo sul componente parent (vedi rnav-memo-guard)"

# headerLeft inline (senza params): headerLeft: () =>
check_pattern 'headerLeft:\s*\(\)\s*=>' \
  "headerLeft con funzione arrow inline → usare useCallback (vedi rnav-memo-guard)"

# headerRight inline (senza params): headerRight: () =>
check_pattern 'headerRight:\s*\(\)\s*=>' \
  "headerRight con funzione arrow inline → usare useCallback (vedi rnav-memo-guard)"

# header prop inline (custom header component): header: () =>
check_pattern 'header:\s*\(\)\s*=>' \
  "header con funzione arrow inline → usare useCallback (vedi rnav-memo-guard)"

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

# tabBarIcon inline con parametro singolo non-destructurato: tabBarIcon: (props) =>
# Variante non catturata da tabBarIcon:\s*\(\{ (che cattura solo la forma destructurata).
check_pattern 'tabBarIcon:\s*\([^{]' \
  "tabBarIcon con param non-destructurato → usare useMemo sul componente parent (vedi rnav-memo-guard)"

# headerTitle inline arrow (senza params): headerTitle: () =>
# headerTitle come funzione (restituisce JSX) richiama setOptions ad ogni render.
# Fix: useCallback o costante module-level.
check_pattern 'headerTitle:\s*\(\)\s*=>' \
  "headerTitle con funzione arrow inline (no-arg) → usare useCallback (vedi rnav-memo-guard)"

# headerTitle inline arrow (con params): headerTitle: (props) => ...
# Cattura sia la forma plain-arg che la forma destructurata ({ ... }) => ...
check_pattern 'headerTitle:\s*\([^)]+\)\s*=>' \
  "headerTitle con funzione arrow inline (con params) → usare useCallback (vedi rnav-memo-guard)"

# headerLeft/headerRight inline con parametro singolo non-destructurato: prop: (p) =>
# Il gate esistente cattura () => (no-arg) e ({ }) => (destructurato); questa regola
# chiude il gap per la forma (singleParam) =>.
check_pattern 'header(Left|Right):\s*\([^){]+\)\s*=>' \
  "headerLeft/headerRight con param singolo non-destructurato → usare useCallback (vedi rnav-memo-guard)"

# ── Oggetti options/screenOptions con nested Style inline ─────────────────────
# Causa: React Navigation chiama useLayoutEffect→setOptions ad ogni render se
# il riferimento all'oggetto cambia. Anche con valori identici, un nuovo {}
# ha referenza diversa → loop infinito ("Maximum update depth exceeded").

# screenOptions={{...}} con oggetto annidato *Style:{}
check_pattern_multiline 'screenOptions=\{\{[^}]{0,300}\w+Style:\s*\{' \
  "screenOptions={{}} con nested object (xStyle:{}) → wrappare con useMemo (vedi rnav-memo-guard)"

# Stack.Screen options={{...}} con oggetto annidato *Style:{}
check_pattern_multiline '<Stack\.Screen[^>]{0,200}options=\{\{[^}]{0,300}\w+Style:\s*\{' \
  "Stack.Screen options={{}} con nested object (xStyle:{}) → usare useMemo o costante module-level"

# Tabs.Screen options={{...}} con oggetto annidato *Style:{}
# (specchio del check Stack.Screen — colpisce anche il tab bar layout)
check_pattern_multiline '<Tabs\.Screen[^>]{0,200}options=\{\{[^}]{0,300}\w+Style:\s*\{' \
  "Tabs.Screen options={{}} con nested object (xStyle:{}) → usare useMemo o costante module-level"

# ── Stack.Screen / Tabs.Screen options={{}} inline in screen files ────────────
# QUALSIASI options={{}} inline è pericoloso nelle screen components che si
# ri-renderano: anche { headerShown: false } crea un nuovo oggetto a ogni render
# → useLayoutEffect([options]) in React Navigation si attiva → setOptions →
# navigation state update → ri-render → nuovo options → loop infinito.
# Fix: costante module-level per options statiche, useMemo per quelle dinamiche.
# I file _layout.tsx sono ESCLUSI perché si ri-renderano raramente.
SCREEN_INLINE_OPTS=$(rg -n '<(Stack|Tabs)\.Screen[^/]*options=\{\{' \
  --glob 'app/**/*.tsx' \
  --glob '!app/**/_layout*.tsx' \
  --glob '!node_modules/**' --glob '!.local/**' --glob '!.agents/**' \
  2>/dev/null || true)
if [ -n "$SCREEN_INLINE_OPTS" ]; then
  echo ""
  echo "❌ TROVATO — Stack/Tabs.Screen options={{}} inline in screen file"
  echo "$SCREEN_INLINE_OPTS"
  echo "   → Estrarre in costante module-level (se statico) o useMemo (se dipende da state/props)."
  FAIL=1
fi

# ── Stack/Tabs.Screen options={{}} inline NEI _layout*.tsx ────────────────────
# I sub-layout annidati (app/admin/sensors, app/route, app/routes, app/contest…)
# montano i loro Stack.Screen quando il navigator si attiva durante la
# navigazione. Anche un options={{ title: "…" }} statico è un nuovo oggetto
# literal ad ogni render del layout → useLayoutEffect([options]) di React
# Navigation → setOptions → re-render → "Maximum update depth exceeded".
# Il check SCREEN_INLINE_OPTS sopra ESCLUDE i _layout.tsx; questo lo specchia
# proprio per loro. `rg` salta di default le righe-solo-commento? No → si filtra
# manualmente via grep -v sulle righe che iniziano con // o *.
LAYOUT_INLINE_OPTS=$(rg -n '<(Stack|Tabs)\.Screen[^/]*options=\{\{' \
  --glob 'app/**/_layout*.tsx' \
  --glob '!node_modules/**' --glob '!.local/**' --glob '!.agents/**' \
  2>/dev/null || true)
if [ -n "$LAYOUT_INLINE_OPTS" ]; then
  # Ignora righe di commento (// ... oppure * ... oppure {/* ... */}).
  LAYOUT_INLINE_OPTS=$(printf '%s\n' "$LAYOUT_INLINE_OPTS" \
    | grep -vE ':[0-9]+:[[:space:]]*(//|\*|\{/\*)' || true)
fi
if [ -n "$LAYOUT_INLINE_OPTS" ]; then
  echo ""
  echo "❌ TROVATO — Stack/Tabs.Screen options={{}} inline in _layout file"
  echo "$LAYOUT_INLINE_OPTS"
  echo "   → Estrarre in dizionario di costanti module-level (vedi ADMIN_OPTS/SENSORS_OPTS)."
  FAIL=1
fi

# ── [router] come unica dep di un hook (loop setOptions / redirect loop) ──────
# Pattern pericoloso: [router] come sola dep di useEffect/useCallback/useMemo.
#  - In useEffect che fa router.replace/push → redirect loop (router cambia ref).
#  - In useCallback che alimenta headerLeft/headerRight/screenOptions →
#    riferimento instabile → Stack.Screen setOptions → "Maximum update depth exceeded".
#
# NB: il vecchio check guardava solo `}, [router])` (arrow con body a blocco) e
# saltava l'INTERO file se conteneva `routerRef` ovunque. Questo lasciava passare
# `useCallback(() => (...), [router])` (body a espressione, chiusura `), [router])`)
# → è esattamente il bug che ha fatto slittare proposals/create.tsx al CI.
# Ora cattura QUALSIASI `[router]` come deps array, in app/ e hooks/, senza
# esonero file-level.
#
# Fix: routerRef (router NON nelle deps) con deps []; vedi router-in-useEffect-deps.md.
# Opt-out esplicito per casi verificati safe: aggiungere il commento
#   // rnav-memo-guard-ok
# sulla STESSA riga del deps array.
ROUTER_DEP=$(rg -n '\[router\]' \
  --glob 'app/**/*.tsx' --glob 'app/**/*.ts' \
  --glob 'hooks/**/*.tsx' --glob 'hooks/**/*.ts' \
  --glob '!node_modules/**' --glob '!.local/**' --glob '!.agents/**' \
  2>/dev/null || true)
if [ -n "$ROUTER_DEP" ]; then
  ROUTER_DEP=$(printf '%s\n' "$ROUTER_DEP" | grep -v 'rnav-memo-guard-ok' || true)
fi
if [ -n "$ROUTER_DEP" ]; then
  echo ""
  echo "❌ TROVATO — [router] come unica dep di un hook (rischio loop setOptions/redirect)"
  echo "$ROUTER_DEP"
  echo "   → Usare routerRef (router NON nelle deps) con deps []."
  echo "   → Se il caso è verificato safe, aggiungere '// rnav-memo-guard-ok' sulla riga delle deps."
  FAIL=1
fi

# ── disable-comment rules-of-hooks in app/ ───────────────────────────────────
# Marcatore di hook dopo early return — viola le Regole dei Hook.
# Fix: spostare useMemo/useCallback PRIMA di qualsiasi early return.
HOOKS_VIOLATION=$(rg '(oxlint|eslint)-disable.*rules-of-hooks' \
  --glob 'app/**/*.tsx' --glob 'app/**/*.ts' \
  --glob '!node_modules/**' --glob '!.local/**' --glob '!.agents/**' \
  -n 2>/dev/null || true)
if [ -n "$HOOKS_VIOLATION" ]; then
  echo ""
  echo "❌ TROVATO — disable-comment rules-of-hooks in app/ (hook dopo early return)"
  echo "$HOOKS_VIOLATION"
  FAIL=1
fi

# ── Context.Provider con value oggetto inline non memoizzato ─────────────────
# Pattern: <XxxContext.Provider value={{ ... }}>. Un nuovo oggetto literal a ogni
# render del provider cambia referenza → TUTTI i consumer (useContext) ri-renderano
# anche senza cambio di valore. Nell'albero di provider al boot/OTA questo amplifica
# i re-render a cascata che alimentano il loop setOptions di React Navigation.
# Fix: const value = useMemo(() => ({ ... }), [deps]) e passare value={value}.
# Vedi: .agents/memory/rnav-screenoptions-nested.md
check_pattern_multiline 'Context\.Provider\s+value=\{\s*\{' \
  "Context.Provider con value oggetto inline ({{...}}) → wrappare con useMemo e passare value={memoValue} (vedi rnav-memo-guard)"

if [ $FAIL -eq 1 ]; then
  echo ""
  echo "💥 check-rnav-inline-props FALLITO"
  echo "   Funzioni arrow inline (tabBarIcon/headerLeft/headerRight/headerTitle/tabBar/header)"
  echo "   → wrappare con useCallback; per tabBarIcon usare useMemo sul componente parent."
  echo "   Oggetti options inline con nested *Style:{} → usare useMemo o costante module-level."
  echo "   router in useEffect deps → usare routerRef+didRedirectRef (non mettere router nelle deps)."
  echo "   Hook dopo early return → spostare useMemo/useCallback prima del return."
  echo "   Documentazione: .agents/skills/rnav-memo-guard/SKILL.md"
  exit 1
else
  echo "✅ Nessuna inline prop function trovata nei componenti di navigazione."
fi
