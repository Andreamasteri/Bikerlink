#!/usr/bin/env bash
# fix-multiline-deps.test.sh
#
# End-to-end test for the multi-line deps Mode C support in
# scripts/fix-inline-default-memo-deps.ts.
#
# Creates isolated fixtures in a temp directory, runs the fixer with --apply,
# and verifies the expected transformations (and non-transformations).
#
# Exit 0 = all tests passed, !=0 = at least one failure.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FIXER="$PROJECT_ROOT/scripts/fix-inline-default-memo-deps.ts"

[ -f "$FIXER" ] || { echo "ERRORE: fixer non trovato: $FIXER"; exit 1; }

TMP="$(mktemp -d /tmp/fix-memo-deps-test.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0

ok()  { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
nok() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }

# Prefer the locally-installed tsx binary (fast, offline) and fall back to npx.
if [ -x "$PROJECT_ROOT/node_modules/.bin/tsx" ]; then
  TSX="$PROJECT_ROOT/node_modules/.bin/tsx"
else
  TSX="npx --yes tsx"
fi

# Run the fixer (--apply) from within the temp dir.
run_fixer() {
  (cd "$TMP" && $TSX "$FIXER" --apply 2>&1) || true
}

# Run the fixer in dry-run mode (no --apply) and capture its stdout.
run_fixer_dryrun() {
  (cd "$TMP" && $TSX "$FIXER" 2>&1) || true
}

# Check that a DEPS-INTERIOR line (leading whitespace + expr) matching the
# pattern is NOT present in the file. Interior dep lines always have leading
# whitespace and a trailing comma, so we match `^\s+<pattern>,`.
# Usage: assert_dep_gone FILE PATTERN LABEL
assert_dep_gone() {
  local file="$1" pattern="$2" label="$3"
  if grep -qE "^\s+${pattern}," "$file"; then
    nok "$label: dep-interior '${pattern},' ancora presente dopo il fix"
  else
    ok "$label: dep-interior '${pattern}' rimosso correttamente"
  fi
}

# Check that a dep-interior line WITH the pattern IS still present (not over-fixed).
assert_dep_present() {
  local file="$1" pattern="$2" label="$3"
  if grep -qE "^\s+${pattern}," "$file"; then
    ok "$label: dep '${pattern},' presente come atteso"
  else
    nok "$label: dep '${pattern}' non trovato (rimosso per errore?)"
  fi
}

echo ""
echo "════════════════════════════════════════════════════════"
echo "  Test: fix-inline-default-memo-deps — Mode C (multi-line)"
echo "════════════════════════════════════════════════════════"

# ── Test 1: Mode C1 — hook + ", [" on same line, array continues ─────────────
echo ""
echo "── Test 1: Mode C1 (hook + same-line opening bracket, interior violations)"
cat > "$TMP/fixture_c1.tsx" << 'EOF'
import { useMemo } from 'react';

const Component = ({ data, otherDep }: any) => {
  const derived = useMemo(() => data ?? [], [
    data ?? [],
    otherDep,
  ]);
  return null;
};
EOF

run_fixer
# Interior dep line "    data ?? []," should be gone; "    data," should exist.
assert_dep_gone    "$TMP/fixture_c1.tsx"  'data \?\? \[\]'  "C1"
assert_dep_present "$TMP/fixture_c1.tsx"  'data'            "C1 dep clean"
assert_dep_present "$TMP/fixture_c1.tsx"  'otherDep'        "C1 otherDep untouched"
# useMemo body expression must NOT have been altered
if grep -q 'data ?? \[\]' "$TMP/fixture_c1.tsx"; then
  ok "C1: body 'data ?? []' in useMemo callback preserved (unchanged)"
else
  nok "C1: body 'data ?? []' was incorrectly removed (over-fix!)"
fi

# ── Test 2: Mode C2 — standalone "[" line, interior violations ───────────────
echo ""
echo "── Test 2: Mode C2 (standalone '[' line, three-line form)"
cat > "$TMP/fixture_c2.tsx" << 'EOF'
import { useMemo } from 'react';

const Component = ({ items, count }: any) => {
  const result = useMemo(
    () => items ?? [],
    [
      items ?? [],
      count ?? {},
    ]
  );
  return null;
};
EOF

run_fixer
assert_dep_gone    "$TMP/fixture_c2.tsx"  'items \?\? \[\]'  "C2 items"
assert_dep_gone    "$TMP/fixture_c2.tsx"  'count \?\? \{\}'  "C2 count"
assert_dep_present "$TMP/fixture_c2.tsx"  'items'            "C2 items clean"
assert_dep_present "$TMP/fixture_c2.tsx"  'count'            "C2 count clean"
# Body expression must be untouched
if grep -q 'items ?? \[\]' "$TMP/fixture_c2.tsx"; then
  ok "C2: body 'items ?? []' in callback preserved"
else
  nok "C2: body 'items ?? []' was incorrectly removed (over-fix!)"
fi

# ── Test 3: Mode C2 — optional chaining in interior line ─────────────────────
echo ""
echo "── Test 3: Mode C2 — optional chaining (data?.items ?? [])"
cat > "$TMP/fixture_c2_oc.tsx" << 'EOF'
import { useMemo } from 'react';

const Component = ({ data }: any) => {
  const list = useMemo(
    () => data?.items ?? [],
    [
      data?.items ?? [],
    ]
  );
  return null;
};
EOF

run_fixer
assert_dep_gone    "$TMP/fixture_c2_oc.tsx"  'data\?\.items \?\? \[\]'  "C2-OC"
assert_dep_present "$TMP/fixture_c2_oc.tsx"  'data\?\.items'            "C2-OC dep clean"
# Body must remain
if grep -q 'data?\.items ?? \[\]' "$TMP/fixture_c2_oc.tsx"; then
  ok "C2-OC: body preserved"
else
  nok "C2-OC: body was incorrectly removed"
fi

# ── Test 4: Mode C1 — multiple interior violations ───────────────────────────
echo ""
echo "── Test 4: Mode C1 — più violazioni su righe interne diverse"
cat > "$TMP/fixture_c1_multi.tsx" << 'EOF'
import { useMemo } from 'react';

const Component = ({ a, b, c }: any) => {
  const x = useMemo(() => [a, b, c], [
    a ?? [],
    b ?? {},
    c,
  ]);
  return null;
};
EOF

run_fixer
assert_dep_gone    "$TMP/fixture_c1_multi.tsx"  'a \?\? \[\]'  "C1-multi a"
assert_dep_gone    "$TMP/fixture_c1_multi.tsx"  'b \?\? \{\}'  "C1-multi b"
assert_dep_present "$TMP/fixture_c1_multi.tsx"  'a'            "C1-multi a clean"
assert_dep_present "$TMP/fixture_c1_multi.tsx"  'b'            "C1-multi b clean"
assert_dep_present "$TMP/fixture_c1_multi.tsx"  'c'            "C1-multi c untouched"

# ── Test 5: suppression comment respected ────────────────────────────────────
echo ""
echo "── Test 5: la soppressione // check-inline-default-memo-deps: safe deve essere rispettata"
cat > "$TMP/fixture_suppressed.tsx" << 'EOF'
import { useMemo } from 'react';

const Component = ({ data }: any) => {
  const x = useMemo(
    () => data ?? [],
    [
      // check-inline-default-memo-deps: safe — questo ?? [] non causa loop
      data ?? [],
    ]
  );
  return null;
};
EOF

run_fixer
# The suppressed interior line should be left alone
if grep -qE '^\s+data \?\? \[\],' "$TMP/fixture_suppressed.tsx"; then
  ok "suppression: riga soppressa lasciata invariata"
else
  nok "suppression: riga soppressa modificata (regressione!)"
fi

# ── Test 6: non-memo context must NOT be touched ─────────────────────────────
echo ""
echo "── Test 6: array literal fuori da useMemo/useCallback non deve essere toccato"
cat > "$TMP/fixture_nonmemo.tsx" << 'EOF'
import { useState } from 'react';

function helper(items: string[]) {
  const arr = [
    items ?? [],
    'other',
  ];
  return arr;
}
EOF

run_fixer
# The non-deps array should be untouched
if grep -qE '^\s+items \?\? \[\],' "$TMP/fixture_nonmemo.tsx"; then
  ok "non-memo: array fuori da useMemo/useCallback non toccato"
else
  nok "non-memo: fixer ha modificato un array non in deps (falso positivo!)"
fi

# ── Test 7: Mode A (single-line) regression — still works ────────────────────
echo ""
echo "── Test 7: Mode A (single-liner) non regredisce"
cat > "$TMP/fixture_mode_a.tsx" << 'EOF'
import { useMemo } from 'react';

const Component = ({ data }: any) => {
  const x = useMemo(() => data ?? [], [data ?? []]);
  return null;
};
EOF

run_fixer
# The single-line deps [data ?? []] should become [data]
if grep -q '\[data ?? \[\]\]' "$TMP/fixture_mode_a.tsx"; then
  nok "Mode A regression: '[data ?? []]' ancora presente"
else
  ok "Mode A: single-line deps riscritta correttamente"
fi
if grep -q '\[data\]' "$TMP/fixture_mode_a.tsx"; then
  ok "Mode A: deps è ora [data]"
else
  nok "Mode A: deps [data] non trovata"
fi

# ── Test 8: Mode B (standalone deps line, single element) — still works ───────
echo ""
echo "── Test 8: Mode B (standalone deps line chiusa sulla stessa riga) non regredisce"
cat > "$TMP/fixture_mode_b.tsx" << 'EOF'
import { useMemo } from 'react';

const Component = ({ items }: any) => {
  const x = useMemo(
    () => items ?? [],
    [items ?? []]
  );
  return null;
};
EOF

run_fixer
# [items ?? []] on its own line should become [items]
if grep -q '\[items ?? \[\]\]' "$TMP/fixture_mode_b.tsx"; then
  nok "Mode B regression: '[items ?? []]' ancora presente"
else
  ok "Mode B: standalone single-line deps riscritta correttamente"
fi
if grep -q '\[items\]' "$TMP/fixture_mode_b.tsx"; then
  ok "Mode B: deps è ora [items]"
else
  nok "Mode B: deps [items] non trovata"
fi

# ── Test 9a: Mode C3 — block-body callback, "}, [" deps opener ───────────────
echo ""
echo "── Test 9a: Mode C3 (callback a blocco, deps aperto su '}, [')"
cat > "$TMP/fixture_c3.tsx" << 'EOF'
import { useMemo } from 'react';

const Component = ({ data, otherDep }: any) => {
  const derived = useMemo(() => {
    return data ?? [];
  }, [
    data ?? [],
    otherDep,
  ]);
  return null;
};
EOF

run_fixer
# Interior dep line "    data ?? []," should be gone; "    data," should exist.
assert_dep_gone    "$TMP/fixture_c3.tsx"  'data \?\? \[\]'  "C3"
assert_dep_present "$TMP/fixture_c3.tsx"  'data'            "C3 dep clean"
assert_dep_present "$TMP/fixture_c3.tsx"  'otherDep'        "C3 otherDep untouched"
# The block-body return expression must NOT have been altered
if grep -q 'return data ?? \[\];' "$TMP/fixture_c3.tsx"; then
  ok "C3: body 'return data ?? [];' in callback preserved (unchanged)"
else
  nok "C3: body 'return data ?? [];' was incorrectly removed (over-fix!)"
fi

# ── Test 9b: Mode C3 — useCallback block-body with multiple violations ────────
echo ""
echo "── Test 9b: Mode C3 useCallback con più violazioni interne"
cat > "$TMP/fixture_c3_cb.tsx" << 'EOF'
import { useCallback } from 'react';

const Component = ({ a, b, c }: any) => {
  const handler = useCallback(() => {
    doSomething(a, b, c);
  }, [
    a ?? [],
    b ?? {},
    c,
  ]);
  return null;
};
EOF

run_fixer
assert_dep_gone    "$TMP/fixture_c3_cb.tsx"  'a \?\? \[\]'  "C3-cb a"
assert_dep_gone    "$TMP/fixture_c3_cb.tsx"  'b \?\? \{\}'  "C3-cb b"
assert_dep_present "$TMP/fixture_c3_cb.tsx"  'a'            "C3-cb a clean"
assert_dep_present "$TMP/fixture_c3_cb.tsx"  'b'            "C3-cb b clean"
assert_dep_present "$TMP/fixture_c3_cb.tsx"  'c'            "C3-cb c untouched"

# ── Test 9c: Mode C3 — dry-run shows the rewrite WITHOUT mutating the file ────
echo ""
echo "── Test 9c: Mode C3 dry-run mostra il rewrite proposto senza modificare il file"
cat > "$TMP/fixture_c3_dry.tsx" << 'EOF'
import { useMemo } from 'react';

const Component = ({ data, otherDep }: any) => {
  const derived = useMemo(() => {
    return data ?? [];
  }, [
    data ?? [],
    otherDep,
  ]);
  return null;
};
EOF

# Snapshot the file before running, then run dry-run (no --apply).
BEFORE_HASH=$(md5sum "$TMP/fixture_c3_dry.tsx" | awk '{print $1}')
DRY_OUTPUT=$(run_fixer_dryrun)
AFTER_HASH=$(md5sum "$TMP/fixture_c3_dry.tsx" | awk '{print $1}')

# The file must be unchanged in dry-run mode.
if [ "$BEFORE_HASH" = "$AFTER_HASH" ]; then
  ok "C3 dry-run: il file NON è stato modificato (nessuna scrittura)"
else
  nok "C3 dry-run: il file è stato modificato in dry-run (regressione!)"
fi
# The interior dep violation must still be present (not written away).
assert_dep_present "$TMP/fixture_c3_dry.tsx"  'data \?\? \[\]'  "C3 dry-run dep intatto"
# The dry-run report must show the proposed PRIMA→DOPO rewrite.
if echo "$DRY_OUTPUT" | grep -q 'data ?? \[\]' && echo "$DRY_OUTPUT" | grep -qE 'DOPO:[[:space:]]+data,'; then
  ok "C3 dry-run: il report mostra la riscrittura proposta (PRIMA data ?? [] → DOPO data)"
else
  nok "C3 dry-run: il report NON mostra la riscrittura proposta per C3"
fi

# ── Test 9: gate and fixer agree — gate finds no violations after fixer ───────
echo ""
echo "── Test 9: il gate non segnala violazioni dopo il fix del fixer (coerenza gate↔fixer)"
cat > "$TMP/fixture_gate_agree.tsx" << 'EOF'
import { useMemo } from 'react';

const Component = ({ data, items, count }: any) => {
  const a = useMemo(() => data ?? [], [
    data ?? [],
  ]);
  const b = useMemo(
    () => items ?? [],
    [
      items ?? [],
      count ?? {},
    ]
  );
  const d = useMemo(() => {
    return data ?? [];
  }, [
    data ?? [],
    count ?? {},
  ]);
  return null;
};
EOF

# First apply the fixer
run_fixer

# Then run the gate on the fixed file
GATE_RESULT=$(python3 - "$TMP/fixture_gate_agree.tsx" << 'PYEOF'
import sys, re

fpath = sys.argv[1]
SUPPRESSION = 'check-inline-default-memo-deps: safe'
RE_BRACKET_WITH_INLINE = re.compile(r'\[(?:[^\[\]]*?)(?:\[\]|\{\})(?:[^\[\]]*?)\]')
RE_HOOK_SAME_LINE = re.compile(r'\b(useMemo|useCallback)\s*\(')
RE_HOOK_OPEN = re.compile(r'\b(useMemo|useCallback)\s*\(')
RE_DEPS_OPEN_C1 = re.compile(r',\s*\[\s*(?://[^\n]*)?\s*$')
RE_DEPS_OPEN_C3 = re.compile(r'\}\s*,?\s*\[\s*(?://[^\n]*)?\s*$')
RE_EMPTY_VAL = re.compile(r'(?<!\w)(\[\]|\{\})')

with open(fpath, 'r') as f:
    lines = f.readlines()

violations = []

# Pass 1 (Mode A + B)
for i, line in enumerate(lines):
    stripped = line.rstrip()
    if ('[]' not in stripped and '{}' not in stripped) or '[' not in stripped:
        continue
    for match in RE_BRACKET_WITH_INLINE.finditer(stripped):
        prefix = stripped[:match.start()]
        if RE_HOOK_SAME_LINE.search(stripped):
            if not re.search(r',\s*$', prefix):
                continue
        elif prefix.strip() == '':
            nearest = None
            for j in range(i - 1, max(-1, i - 80), -1):
                m = RE_HOOK_OPEN.search(lines[j])
                if m:
                    nearest = m.group(1)
                    break
            if nearest not in ('useMemo', 'useCallback'):
                continue
        else:
            continue
        if SUPPRESSION not in stripped and (i == 0 or SUPPRESSION not in lines[i-1]):
            violations.append((i+1, stripped))
        break

# Pass 2 (Mode C)
n = len(lines)
ci = 0
while ci < n:
    cl = lines[ci].rstrip()
    is_c1 = bool(RE_HOOK_OPEN.search(cl) and RE_DEPS_OPEN_C1.search(cl))
    is_c2 = False
    if not is_c1:
        ls = cl.lstrip()
        if ls.startswith('[') and cl[:len(cl)-len(ls)].strip() == '':
            prev = ''
            for bj in range(ci-1, max(-1, ci-81), -1):
                ps = lines[bj].rstrip()
                if ps.strip():
                    prev = ps
                    break
            pc = re.sub(r'\s*//.*$', '', prev).rstrip()
            if pc.endswith(','):
                for bj in range(ci-1, max(-1, ci-81), -1):
                    if RE_HOOK_OPEN.search(lines[bj]):
                        is_c2 = True
                        break
    is_c3 = False
    if not is_c1 and not is_c2:
        if RE_DEPS_OPEN_C3.search(cl) and not RE_HOOK_OPEN.search(cl):
            for bj in range(ci-1, max(-1, ci-81), -1):
                if RE_HOOK_OPEN.search(lines[bj]):
                    is_c3 = True
                    break
    if not (is_c1 or is_c2 or is_c3):
        ci += 1
        continue
    depth = sum(1 if c == '[' else -1 if c == ']' else 0 for c in cl)
    if depth <= 0:
        ci += 1
        continue
    j = ci + 1
    while j < n and depth > 0:
        inner = lines[j].rstrip()
        if RE_EMPTY_VAL.search(inner):
            if SUPPRESSION not in inner and (j == 0 or SUPPRESSION not in lines[j-1]):
                violations.append((j+1, inner))
        for c in inner:
            if c == '[': depth += 1
            elif c == ']': depth -= 1
            if depth <= 0: break
        j += 1
    ci = j

if violations:
    print("FAIL")
    for ln, txt in violations:
        print(f"  line {ln}: {txt}")
else:
    print("OK")
PYEOF
)

if [ "$GATE_RESULT" = "OK" ]; then
  ok "gate↔fixer coerenza: gate non segnala violazioni sul file fixato"
else
  nok "gate↔fixer DISACCORDO: gate trova ancora violazioni dopo il fix:"
  echo "$GATE_RESULT" | sed 's/^/    /'
fi

# ── Test 10: inference of a SOLE bare [] / {} dep from the callback body ───────
echo ""
echo "── Test 10: inferenza dep da corpo callback quando il literal nudo è l'unico elemento"
cat > "$TMP/fixture_infer.tsx" << 'EOF'
import { useMemo } from 'react';

const Component = ({ data, items, count, props }: any) => {
  // single-line: ?? capture
  const m1 = useMemo(() => data ?? [], [[]]);
  // single-line: single free identifier (no ??)
  const m2 = useMemo(() => items.filter((x: any) => x.active), [[]]);
  // single-line: member expression via ??
  const m3 = useMemo(() => props.data ?? [], [[]]);
  // single-line: bare {} with ??
  const m4 = useMemo(() => count ?? {}, [{}]);
  return null;
};
EOF

run_fixer
# m1 -> [data]
if grep -q 'data ?? \[\], \[data\]' "$TMP/fixture_infer.tsx"; then
  ok "infer m1: bare [] sostituito con [data] (?? capture)"
else
  nok "infer m1: atteso [data], non trovato"
fi
# m2 -> [items]  (single free identifier; `any` type keyword ignored)
if grep -q 'x.active), \[items\]' "$TMP/fixture_infer.tsx"; then
  ok "infer m2: bare [] sostituito con [items] (identificatore singolo)"
else
  nok "infer m2: atteso [items], non trovato"
fi
# m3 -> [props.data]
if grep -q 'props.data ?? \[\], \[props.data\]' "$TMP/fixture_infer.tsx"; then
  ok "infer m3: bare [] sostituito con [props.data] (member expr)"
else
  nok "infer m3: atteso [props.data], non trovato"
fi
# m4 -> [count]
if grep -q 'count ?? {}, \[count\]' "$TMP/fixture_infer.tsx"; then
  ok "infer m4: bare {} sostituito con [count]"
else
  nok "infer m4: atteso [count], non trovato"
fi

# ── Test 11: ambiguous / empty body -> manual fallback (no auto-fix) ───────────
echo ""
echo "── Test 11: ambiguità o corpo vuoto → fallback manuale (nessun auto-fix)"
cat > "$TMP/fixture_manual.tsx" << 'EOF'
import { useMemo } from 'react';

const Component = ({ a, b }: any) => {
  // two candidates -> ambiguous
  const amb = useMemo(() => a + b, [[]]);
  // empty body -> nothing to infer
  const empty = useMemo(() => [], [[]]);
  return null;
};
EOF

OUT_MANUAL="$(run_fixer_dryrun)"
# The bare [[]] must remain untouched (still present, no inference applied).
if grep -q 'a + b, \[\[\]\]' "$TMP/fixture_manual.tsx"; then
  ok "manual amb: bare [[]] preservato (nessun auto-fix su ambiguità)"
else
  nok "manual amb: bare [[]] modificato per errore"
fi
if grep -q '() => \[\], \[\[\]\]' "$TMP/fixture_manual.tsx"; then
  ok "manual empty: bare [[]] preservato (corpo vuoto, nessuna inferenza)"
else
  nok "manual empty: bare [[]] modificato per errore"
fi
if echo "$OUT_MANUAL" | grep -q "FIX MANUALE RICHIESTO"; then
  ok "manual: il fixer segnala 'FIX MANUALE RICHIESTO' per i casi ambigui/vuoti"
else
  nok "manual: nessun avviso 'FIX MANUALE RICHIESTO' emesso"
fi

# ── Test 12: multi-line sole-bare inference (Mode C) ──────────────────────────
echo ""
echo "── Test 12: inferenza dep su literal nudo unico in deps multi-linea (Mode C)"
cat > "$TMP/fixture_infer_ml.tsx" << 'EOF'
import { useMemo } from 'react';

const Component = ({ data, items }: any) => {
  const c1 = useMemo(() => data ?? [], [
    [],
  ]);
  const c3 = useMemo(() => {
    return items ?? [];
  }, [
    [],
  ]);
  return null;
};
EOF

run_fixer
assert_dep_present "$TMP/fixture_infer_ml.tsx" 'data'  "ML infer c1 -> data"
assert_dep_present "$TMP/fixture_infer_ml.tsx" 'items' "ML infer c3 -> items"
# The bare interior "[]," lines must be gone.
if grep -qE '^\s+\[\],' "$TMP/fixture_infer_ml.tsx"; then
  nok "ML infer: una riga interior '[]' nuda è ancora presente"
else
  ok "ML infer: nessuna riga interior '[]' nuda residua"
fi

# ── Test 13: false-positive guards — literals & object keys stay manual ───────
echo ""
echo "── Test 13: nessuna inferenza da stringhe/template/chiavi-oggetto (no falsi positivi)"
cat > "$TMP/fixture_falsepos.tsx" << 'EOF'
import { useMemo } from 'react';

const Component = ({ data, key }: any) => {
  // string literal body -> no real identifier
  const s1 = useMemo(() => "abc", [[]]);
  // template literal body
  const s2 = useMemo(() => `hello world`, [[]]);
  // string that even contains "?? []" text
  const s3 = useMemo(() => "data ?? []", [[]]);
  // object-literal return with property keys
  const o1 = useMemo(() => ({ foo: 1, bar: 2 }), [[]]);
  // shorthand prop references a REAL variable -> should infer
  const sh = useMemo(() => ({ data }), [[]]);
  // computed key references a REAL variable -> should infer
  const ck = useMemo(() => ({ [key]: 1 }), [[]]);
  return null;
};
EOF

run_fixer
# Literals / object keys must remain bare (manual) — never auto-fixed.
for varname in s1 s2 s3 o1; do
  if grep -qE "const ${varname} = useMemo\(.*\[\[\]\]\)" "$TMP/fixture_falsepos.tsx"; then
    ok "falsepos ${varname}: bare [[]] preservato (nessuna inferenza da literal/object-key)"
  else
    nok "falsepos ${varname}: bare [[]] modificato per errore (falso positivo)"
  fi
done
# Shorthand prop and computed key ARE real references -> must be inferred.
if grep -q '({ data }), \[data\]' "$TMP/fixture_falsepos.tsx"; then
  ok "falsepos sh: shorthand prop { data } correttamente inferito -> [data]"
else
  nok "falsepos sh: shorthand prop non inferito (atteso [data])"
fi
if grep -q '({ \[key\]: 1 }), \[key\]' "$TMP/fixture_falsepos.tsx"; then
  ok "falsepos ck: computed key [key] correttamente inferito -> [key]"
else
  nok "falsepos ck: computed key non inferito (atteso [key])"
fi

# ── Test 14: local declarations are NOT valid deps (no false positives) ───────
echo ""
echo "── Test 14: variabili locali della callback non sono dipendenze (no falsi positivi)"
cat > "$TMP/fixture_locals.tsx" << 'EOF'
import { useMemo } from 'react';

const Component = ({ data }: any) => {
  // pure local -> manual
  const l1 = useMemo(() => { const x = 1; return x; }, [[]]);
  // local function declaration -> manual
  const l4 = useMemo(() => { function helper() { return 1; } return helper(); }, [[]]);
  // local x but initializer references outer `data` -> infer data
  const l5 = useMemo(() => { const x = data; return x; }, [[]]);
  // destructured locals, outer ref in initializer -> infer base identifier `data`
  const l2 = useMemo(() => { const { a, b } = data; return a + b; }, [[]]);
  return null;
};
EOF

run_fixer
# Pure-local cases must stay bare (manual).
if grep -q 'const x = 1; return x; }, \[\[\]\]' "$TMP/fixture_locals.tsx"; then
  ok "locals l1: variabile locale non inferita (manuale)"
else
  nok "locals l1: variabile locale inferita per errore"
fi
if grep -q 'return helper(); }, \[\[\]\]' "$TMP/fixture_locals.tsx"; then
  ok "locals l4: funzione locale non inferita (manuale)"
else
  nok "locals l4: funzione locale inferita per errore"
fi
# Outer ref used in initializer must still be inferred.
if grep -q 'const x = data; return x; }, \[data\]' "$TMP/fixture_locals.tsx"; then
  ok "locals l5: ref esterna (data) nell'initializer correttamente inferita"
else
  nok "locals l5: ref esterna nell'initializer non inferita (atteso [data])"
fi
if grep -q '} = data; return a + b; }, \[data\]' "$TMP/fixture_locals.tsx"; then
  ok "locals l2: ref esterna (data) inferita, locali destrutturati esclusi"
else
  nok "locals l2: inferenza errata con destructuring locale"
fi

# ── Test 15: mixed array (single-line) — bare [] alongside real deps ──────────
echo ""
echo "── Test 15: deps misti single-line — [] nudo accanto a dep reali, solo il [] viene inferito"
cat > "$TMP/fixture_mixed.tsx" << 'EOF'
import { useMemo } from 'react';

const Component = ({ data, otherDep, items, more }: any) => {
  // bare [] first, real dep second, ?? capture in body -> infer data
  const m1 = useMemo(() => data ?? [], [[], otherDep]);
  // real dep first, bare [] second, single free identifier in body -> infer items
  const m2 = useMemo(() => items.filter((x: any) => x.active), [more, []]);
  // two bare literals -> ambiguous, must stay manual (unchanged)
  const m3 = useMemo(() => data ?? [], [[], {}]);
  return null;
};
EOF

run_fixer
# m1: [[], otherDep] -> [data, otherDep]; sibling untouched, body preserved.
if grep -q 'data ?? \[\], \[data, otherDep\]' "$TMP/fixture_mixed.tsx"; then
  ok "mixed m1: [[], otherDep] -> [data, otherDep] (solo il [] inferito)"
else
  nok "mixed m1: atteso [data, otherDep], non trovato"
fi
# m2: [more, []] -> [more, items]; leading sibling untouched.
if grep -q 'x.active), \[more, items\]' "$TMP/fixture_mixed.tsx"; then
  ok "mixed m2: [more, []] -> [more, items] (fratello iniziale intatto)"
else
  nok "mixed m2: atteso [more, items], non trovato"
fi
# m3: two bare literals -> left untouched (manual).
if grep -q 'data ?? \[\], \[\[\], {}\]' "$TMP/fixture_mixed.tsx"; then
  ok "mixed m3: [[], {}] preservato (due literal nudi -> manuale)"
else
  nok "mixed m3: [[], {}] modificato per errore (atteso manuale)"
fi

# ── Test 16: mixed array (Mode C multi-line) — bare [] alongside real deps ─────
echo ""
echo "── Test 16: deps misti multi-linea (Mode C) — solo la riga interior nuda viene inferita"
cat > "$TMP/fixture_mixed_ml.tsx" << 'EOF'
import { useMemo } from 'react';

const Component = ({ data, otherDep, extra }: any) => {
  const c1 = useMemo(() => data ?? [], [
    [],
    otherDep,
  ]);
  const c3 = useMemo(() => {
    return extra ?? [];
  }, [
    [],
    data,
  ]);
  return null;
};
EOF

run_fixer
# c1: interior "[]," inferred to "data,"; otherDep untouched.
assert_dep_present "$TMP/fixture_mixed_ml.tsx" 'data'     "ML mixed c1 -> data"
assert_dep_present "$TMP/fixture_mixed_ml.tsx" 'otherDep' "ML mixed c1 otherDep intatto"
# c3: interior "[]," inferred to "extra,"; data sibling untouched.
assert_dep_present "$TMP/fixture_mixed_ml.tsx" 'extra'    "ML mixed c3 -> extra"
# No residual bare interior "[]," line must remain.
if grep -qE '^\s+\[\],' "$TMP/fixture_mixed_ml.tsx"; then
  nok "ML mixed: una riga interior '[]' nuda è ancora presente"
else
  ok "ML mixed: nessuna riga interior '[]' nuda residua"
fi
# Bodies must be preserved (not over-fixed).
if grep -q 'data ?? \[\], \[' "$TMP/fixture_mixed_ml.tsx" && grep -q 'return extra ?? \[\];' "$TMP/fixture_mixed_ml.tsx"; then
  ok "ML mixed: corpi delle callback preservati"
else
  nok "ML mixed: corpo di una callback alterato (over-fix!)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────────"
echo "  Totale: $((PASS + FAIL)) test — ✅ $PASS PASS / ❌ $FAIL FAIL"
echo "════════════════════════════════════════════════════════"
echo ""

[ "$FAIL" -eq 0 ] || exit 1
