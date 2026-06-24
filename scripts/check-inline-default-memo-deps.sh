#!/usr/bin/env bash
# check-inline-default-memo-deps.sh
#
# Rileva il pattern pericoloso: `[]` o `{}` letterali direttamente nell'array
# dei deps di useMemo o useCallback.
#
# Perché è pericoloso:
#   const derived = useMemo(() => data?.items ?? [], [data?.items ?? []]);
#                                                     ^^^^^^^^^^^^^^^^^^^
#   L'espressione `data?.items ?? []` nel CORPO è OK (il risultato è memoizzato).
#   La stessa espressione nei DEPS crea un nuovo `[]` ad ogni render quando
#   `data?.items` è undefined → React vede sempre deps cambiati → useMemo
#   ricalcola ad ogni render → se il risultato finisce in uno stato o in altri
#   hook, si innesca "Maximum update depth exceeded" → crash globale.
#
# Pattern tipici catturati:
#   useMemo(() => x ?? [],     [x ?? []])          ← [] nei deps (single-line)
#   useMemo(() => x ?? {},     [x ?? {}])          ← {} nei deps (single-line)
#   useMemo(() => ...,         [a, [], b])         ← [] nudo nei deps (single-line)
#   useCallback(() => ...,     [items ?? []])      ← [] in useCallback deps (single-line)
#   useMemo(                                       ← deps array su linea propria
#     () => something,
#     [dep ?? []]                                  ← [] nei deps (multi-line)
#   )
#
# Soppressione per falsi positivi verificati:
#   Aggiungere il commento nel file: // check-inline-default-memo-deps: safe
#   sulla stessa riga o sulla riga precedente al deps array incriminato,
#   con una breve spiegazione del perché il pattern è sicuro in quel contesto.
#
# Vedi: .agents/memory/rnav-screenoptions-nested.md (pattern correlato)

set -euo pipefail

echo "🔍 Controllo [] / {} inline nei deps di useMemo / useCallback..."

RESULT=$(python3 - << 'PYEOF'
import os
import re

IGNORE_DIRS = {'.local', '.agents', 'node_modules', 'scripts', '__tests__'}
SUPPRESSION = 'check-inline-default-memo-deps: safe'

# Match a [bracket] expression that contains [] or {} inside it.
# [^\[\]]* = anything that is NOT [ or ] (avoids crossing nested brackets).
# Correctly matches [x ?? []] or [a, {}, b] but NOT [a.b(c)] or [0].
RE_BRACKET_WITH_INLINE = re.compile(r'\[(?:[^\[\]]*?)(?:\[\]|\{\})(?:[^\[\]]*?)\]')

# useMemo or useCallback opener (same line check)
RE_HOOK_SAME_LINE = re.compile(r'\b(useMemo|useCallback)\s*\(')

# useMemo or useCallback opener (backward walk)
RE_HOOK_OPEN = re.compile(r'\b(useMemo|useCallback)\s*\(')

violations = []

for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith('.')]
    for fname in sorted(files):
        if not (fname.endswith('.tsx') or fname.endswith('.ts')):
            continue
        if fname.endswith('.test.ts') or fname.endswith('.test.tsx'):
            continue
        if fname.endswith('.spec.ts') or fname.endswith('.spec.tsx'):
            continue
        if fname.endswith('.styles.ts') or fname.endswith('.styles.tsx'):
            continue

        fpath = os.path.join(root, fname).lstrip('./')

        try:
            with open(os.path.join(root, fname), 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
        except OSError:
            continue

        for i, line in enumerate(lines):
            stripped = line.rstrip()

            # Quick pre-filter: must contain [] or {} and also an outer [
            if ('[]' not in stripped and '{}' not in stripped) or '[' not in stripped:
                continue

            # Find [... [] ...] or [... {} ...] matches on this line
            for match in RE_BRACKET_WITH_INLINE.finditer(stripped):
                match_start = match.start()
                prefix = stripped[:match_start]

                # ── MODE A: single-liner ─────────────────────────────────
                # useMemo / useCallback on the SAME line as the deps [...]
                # The [... [] ...] must come after a trailing comma (end of callback).
                # Example: useMemo(() => x ?? [], [x ?? []])
                if RE_HOOK_SAME_LINE.search(stripped):
                    # The prefix (text before the [...]) must end with ','
                    # (possibly with spaces), signalling end of callback arg.
                    if not re.search(r',\s*$', prefix):
                        continue  # [...] is not in deps position on this line

                # ── MODE B: multi-liner ──────────────────────────────────
                # The deps array is on its own line; the opening [ is the
                # first non-whitespace character.
                # Example (line alone):    [dep ?? [], otherDep]
                elif prefix.strip() == '':
                    # Walk backwards (up to 80 lines) to find nearest hook opener
                    nearest_hook = None
                    block_start = max(0, i - 80)
                    for j in range(i - 1, block_start - 1, -1):
                        m = RE_HOOK_OPEN.search(lines[j])
                        if m:
                            nearest_hook = m.group(1)
                            break
                    if nearest_hook not in ('useMemo', 'useCallback'):
                        continue

                else:
                    # The [ is neither the first thing on the line nor
                    # preceded by the hook name → not a deps array.
                    continue

                # ── Suppression check ────────────────────────────────────
                lineno = i + 1
                suppressed = SUPPRESSION in stripped
                if not suppressed and i > 0:
                    suppressed = SUPPRESSION in lines[i - 1]
                if suppressed:
                    break  # skip all matches on this line

                violations.append((fpath, lineno, stripped))
                break  # one violation per line is enough

if violations:
    print("FAIL")
    for fpath, lineno, txt in violations:
        print(f"{fpath}:{lineno}: {txt}")
else:
    print("OK")
PYEOF
)

FIRST_LINE=$(echo "$RESULT" | head -1)

if [ "$FIRST_LINE" = "OK" ]; then
  echo "✅ Nessun [] / {} inline nei deps di useMemo / useCallback trovato."
  exit 0
fi

echo ""
VIOLATIONS=$(echo "$RESULT" | tail -n +2)
while IFS= read -r vline; do
  [ -z "$vline" ] && continue
  echo "❌ TROVATO — $vline"
done <<< "$VIOLATIONS"

echo ""
echo "💥 check-inline-default-memo-deps FALLITO"
echo ""
echo "   Un [] o {} letterale nei deps di useMemo/useCallback crea un nuovo"
echo "   riferimento ad ogni render → useMemo ricalcola inutilmente ad ogni render."
echo "   Se il risultato alimenta altri hook o stati, si innesca il loop infinito"
echo "   'Maximum update depth exceeded'."
echo ""
echo "   Esempio del problema:"
echo "     const derived = useMemo(() => data?.items ?? [], [data?.items ?? []]);"
echo "                                                        ^^^^^^^^^^^^^^^^^^"
echo "     // data?.items ?? [] nei DEPS crea un nuovo [] ogni volta che data è undefined"
echo ""
echo "   Fix consigliato — stabilizza il valore PRIMA dei deps:"
echo "     const items = data?.items;  // undefined quando loading (stabile)"
echo "     const derived = useMemo(() => items ?? [], [items]);"
echo ""
echo "   Oppure: separa il fallback dal dep:"
echo "     const derived = useMemo(() => data?.items ?? [], [data?.items]);"
echo "     //                                              ^^^^^^^^^^^^^^"
echo "     // data?.items è undefined (valore primitivo stabile) quando data non è caricato"
echo ""
echo "   Se il pattern è verificato sicuro (il ricalcolo non causa side-effect):"
echo "     // check-inline-default-memo-deps: safe — <motivo>"
echo "     const derived = useMemo(() => ..., [dep ?? []]);"
echo ""
echo "   🔧 Auto-fix disponibile per i pattern 'expr ?? []' e 'expr ?? {}':"
echo "     npx tsx scripts/fix-inline-default-memo-deps.ts          # dry-run"
echo "     npx tsx scripts/fix-inline-default-memo-deps.ts --apply  # applica"
echo ""
exit 1
