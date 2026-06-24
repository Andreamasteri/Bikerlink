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
#     [dep ?? []]                                  ← [] nei deps (multi-line, Mode B)
#   )
#   useMemo(() => something, [                     ← deps array multi-line, [] su linea
#     dep1,                                           interna (Mode C — nuovo)
#     dep2 ?? [],
#     dep3,
#   ])
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

# Mode C: line ends with ",  [" (with optional trailing whitespace/comment) →
# the deps array opens here but does NOT close on the same line.
RE_DEPS_OPEN_C1 = re.compile(r',\s*\[\s*(?://[^\n]*)?\s*$')

# Mode C: [] or {} that is NOT immediately preceded by a word character.
# The (?<!\w) lookbehind excludes `string[]`, `number[]`, `MyType[]` (and
# similar) where [] is a type-suffix attached to a word char.  It does NOT
# exclude forms where [] follows a non-word char such as `}` or `>` (e.g.
# `Record<K, {}>[]`), but those are extremely rare inside deps arrays and
# would themselves be a bug (a type annotation used as a runtime value).
RE_EMPTY_VAL = re.compile(r'(?<!\w)(\[\]|\{\})')

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

        # ── PASS 1: per-line checks (Mode A & B) ─────────────────────────────
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

        # ── PASS 2: bracket-depth tracker (Mode C) ───────────────────────────
        # Catches [] or {} on INTERIOR lines of a multi-line deps array, i.e.
        # lines where the opening [ was on an earlier line (so Modes A/B never
        # inspect this content):
        #
        #   useMemo(() => something, [   ← opening line (Mode C1)
        #     dep1,
        #     dep2 ?? [],                ← interior line — new detection
        #     dep3,
        #   ])
        #
        # Also handles the three-line form (Mode C2):
        #   useMemo(
        #     () => something,
        #     [                          ← Mode B opening (already checked above)
        #       dep1,
        #       dep2 ?? [],              ← interior line — new detection
        #     ]
        #   )
        n_lines = len(lines)
        ci = 0
        while ci < n_lines:
            cl = lines[ci].rstrip()

            # Mode C1: hook and ", [" on the same line → deps array opens here,
            # but the closing ] is on a later line.
            is_c1 = bool(RE_HOOK_OPEN.search(cl) and RE_DEPS_OPEN_C1.search(cl))

            # Mode C2: standalone "[" line (same condition as Mode B opener) →
            # the interior lines after it are not yet covered.
            #
            # Extra constraint vs. Mode B: the deps [ must be in deps *position*,
            # i.e. it must follow a line whose last non-comment token is a comma
            # (the separator after the callback argument).  This rejects array
            # literals inside the callback body such as:
            #
            #   useMemo(() => {
            #     const x =         ← ends with "=", not ","
            #     [                 ← NOT in deps position
            #       foo ?? [],
            #     ];
            #     return x;
            #   }, [dep])
            #
            # whereas the true deps case always has a preceding "," line:
            #
            #   useMemo(
            #     () => something,  ← ends with ","
            #     [                 ← deps position ✓
            #       dep ?? [],
            #     ]
            #   )
            is_c2 = False
            if not is_c1:
                cl_lstripped = cl.lstrip()
                if cl_lstripped.startswith('['):
                    prefix_before = cl[:len(cl) - len(cl_lstripped)]
                    # Only if [ is the first non-whitespace (Mode B pattern)
                    if prefix_before.strip() == '':
                        # Find the nearest preceding non-blank line.
                        prev_nonblank = ''
                        for bj in range(ci - 1, max(-1, ci - 81), -1):
                            prev_stripped = lines[bj].rstrip()
                            if prev_stripped.strip():
                                prev_nonblank = prev_stripped
                                break
                        # The preceding non-blank line must end with ","
                        # (after stripping trailing whitespace and any
                        # trailing // inline comment), confirming this [
                        # is the deps argument, not an array literal.
                        # e.g.  "() => foo, // comment"  → bare token is ","
                        prev_code = re.sub(r'\s*//.*$', '', prev_nonblank).rstrip()
                        if prev_code.endswith(','):
                            for bj in range(ci - 1, max(-1, ci - 81), -1):
                                if RE_HOOK_OPEN.search(lines[bj]):
                                    is_c2 = True
                                    break

            if not (is_c1 or is_c2):
                ci += 1
                continue

            # Determine the bracket depth that remains OPEN after the opening
            # line itself.  We count every [ and ] character on line ci:
            # - Mode C1 guarantees the line ends with ", [" (unmatched) → +1
            # - Mode C2 may be "[dep]" (depth=0, already closed) or "[" (depth=1)
            # Only proceed with interior scanning when the opening line leaves
            # at least one bracket unclosed.
            depth = sum(1 if ch == '[' else -1 if ch == ']' else 0 for ch in cl)
            if depth <= 0:
                # The brackets on the opening line are already balanced; there
                # are no interior lines to inspect (this is a single-line form
                # already handled by Mode A or B).
                ci += 1
                continue

            # Scan interior lines tracking bracket depth.
            j = ci + 1
            while j < n_lines and depth > 0:
                inner = lines[j].rstrip()

                # Check for [] or {} on this interior line.
                # RE_EMPTY_VAL uses (?<!\w) to skip TypeScript type-suffix
                # notation like `string[]` or `Record<K, {}>`.
                if RE_EMPTY_VAL.search(inner):
                    suppressed = SUPPRESSION in inner
                    if not suppressed and j > 0:
                        suppressed = SUPPRESSION in lines[j - 1]
                    if not suppressed:
                        violations.append((fpath, j + 1, inner))

                # Update bracket depth character by character.
                for ch in inner:
                    if ch == '[':
                        depth += 1
                    elif ch == ']':
                        depth -= 1
                        if depth <= 0:
                            break

                j += 1

            # Resume scanning after the closing ] of this deps array.
            ci = j
            continue

if violations:
    print("FAIL")
    # Deduplicate while preserving order (Mode C may overlap with Mode A/B on
    # edge cases where the same line is reported twice).
    seen = set()
    for fpath, lineno, txt in violations:
        key = (fpath, lineno)
        if key not in seen:
            seen.add(key)
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
