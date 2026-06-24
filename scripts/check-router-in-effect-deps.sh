#!/usr/bin/env bash
# check-router-in-effect-deps.sh
#
# Rileva due pattern pericolosi:
#
# 1) `router` nel deps array di useEffect + chiamata a router.replace/push nel corpo.
# 2) `router` nel deps array di useCallback + chiamata a router.replace/push nel corpo.
#
# Perché è pericoloso:
#   useRouter() di expo-router restituisce un nuovo oggetto ad ogni render.
#
#   Pattern 1 — useEffect:
#     Mettere `router` nei deps di useEffect che chiama router.replace/push crea
#     un ciclo: replace → re-render → nuovo `router` → effect ri-scatta → loop
#     infinito → "Maximum update depth exceeded" → crash globale.
#
#   Pattern 2 — useCallback:
#     Mettere `router` nei deps di useCallback che chiama router.replace/push fa
#     sì che la funzione venga ricreata ad ogni render. Se il callback viene usato
#     come dipendenza di un useEffect, quel useEffect ri-scatta ad ogni render →
#     stesso loop infinito.
#
# Fix: usare routerRef + didRedirectRef
#   const routerRef = useRef(router);
#   routerRef.current = router;
#   const didRedirect = useRef(false);
#   useEffect(() => {
#     if (!didRedirect.current && condizione) {
#       didRedirect.current = true;
#       routerRef.current.replace("/destinazione");
#     }
#   }, [condizione]); // ← router NON è nel deps
#
#   Per useCallback:
#   const navigate = useCallback(() => {
#     routerRef.current.replace("/destinazione");
#   }, []); // ← router NON è nel deps, usa routerRef.current
#
# Soppressione (usa con criterio, solo se il pattern è genuinamente sicuro):
#   Aggiungere il commento sulla riga del deps chiudente o sulla riga precedente:
#   // check-router-in-effect-deps: safe
#
# Vedi: .agents/memory/router-in-useEffect-deps.md

set -euo pipefail

echo "🔍 Controllo router in useEffect/useCallback deps + router.replace/push..."

RESULT=$(python3 - << 'PYEOF'
import os
import re
import sys

IGNORE_DIRS = {'.local', '.agents', 'node_modules', 'scripts'}
SUPPRESSION = 'check-router-in-effect-deps: safe'

# Pattern for closing deps array containing `router` (word boundary)
RE_DEPS_ROUTER = re.compile(r'\},\s*\[.*\brouter\b.*\]')
# Nearest hook opener — we look backwards for this
RE_HOOK_OPEN   = re.compile(r'\b(useEffect|useCallback|useMemo)\s*\(')
# router.replace/push inside the block
RE_ROUTER_CALL = re.compile(r'\brouter\.(replace|push)\s*\(')

# Hooks to flag (useCallback is now included alongside useEffect)
FLAGGED_HOOKS = {'useEffect', 'useCallback'}

violations = []

for root, dirs, files in os.walk('.'):
    # Prune ignored directories in-place
    dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith('.')]
    for fname in files:
        if not (fname.endswith('.tsx') or fname.endswith('.ts')):
            continue
        if fname.endswith('.styles.tsx') or fname.endswith('.styles.ts'):
            continue
        fpath = os.path.join(root, fname).lstrip('./')

        try:
            with open(os.path.join(root, fname), 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
        except OSError:
            continue

        for i, line in enumerate(lines):
            # Is this a closing deps line with `router` in the array?
            if not RE_DEPS_ROUTER.search(line):
                continue

            lineno = i + 1  # 1-based

            # Check for suppression on this line or the previous line
            suppressed = SUPPRESSION in line
            if not suppressed and i > 0:
                suppressed = SUPPRESSION in lines[i - 1]
            if suppressed:
                continue

            # Walk backwards (up to 60 lines) to find the nearest hook opener
            nearest_hook = None
            block_start = max(0, i - 60)
            for j in range(i - 1, block_start - 1, -1):
                m = RE_HOOK_OPEN.search(lines[j])
                if m:
                    nearest_hook = m.group(1)
                    hook_line = j
                    break

            # Only flag useEffect and useCallback (not useMemo)
            if nearest_hook not in FLAGGED_HOOKS:
                continue

            # Verify that router.replace/push appears between hook_line and the closing line
            block_text = ''.join(lines[hook_line:i])
            if not RE_ROUTER_CALL.search(block_text):
                continue

            violations.append((nearest_hook, f"{fpath}:{lineno}: {line.rstrip()}"))

if violations:
    print("FAIL")
    for hook, v in violations:
        print(f"{hook}:{v}")
else:
    print("OK")
PYEOF
)

FIRST_LINE=$(echo "$RESULT" | head -1)

if [ "$FIRST_LINE" = "OK" ]; then
  echo "✅ Nessun router-in-useEffect/useCallback-deps pericoloso trovato."
  exit 0
fi

# FAIL — print violations
echo ""
VIOLATIONS=$(echo "$RESULT" | tail -n +2)
while IFS= read -r vline; do
  [ -z "$vline" ] && continue
  HOOK_TYPE=$(echo "$vline" | cut -d: -f1)
  REST=$(echo "$vline" | cut -d: -f2-)
  echo "❌ TROVATO [${HOOK_TYPE}] —${REST}"
done <<< "$VIOLATIONS"

echo ""
echo "💥 check-router-in-effect-deps FALLITO"
echo ""
echo "   router in useEffect/useCallback deps + router.replace/push = loop infinito"
echo "   'Maximum update depth exceeded' → crash globale."
echo ""
echo "   Fix consigliato per useEffect:"
echo "     const routerRef = useRef(router);"
echo "     routerRef.current = router;"
echo "     const didRedirect = useRef(false);"
echo "     useEffect(() => {"
echo "       if (!didRedirect.current && condizione) {"
echo "         didRedirect.current = true;"
echo "         routerRef.current.replace('/destinazione');"
echo "       }"
echo "     }, [condizione]); // router NON nei deps"
echo ""
echo "   Fix consigliato per useCallback:"
echo "     const routerRef = useRef(router);"
echo "     routerRef.current = router;"
echo "     const navigate = useCallback(() => {"
echo "       routerRef.current.replace('/destinazione');"
echo "     }, []); // router NON nei deps, usa routerRef.current"
echo ""
echo "   Soppressione (solo se verificato sicuro):"
echo "     // check-router-in-effect-deps: safe"
echo "     }, [router]);"
echo ""
echo "   Documentazione: .agents/memory/router-in-useEffect-deps.md"
exit 1
