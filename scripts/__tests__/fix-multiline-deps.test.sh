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

# Run the fixer (--apply) from within the temp dir.
run_fixer() {
  (cd "$TMP" && npx --yes tsx "$FIXER" --apply 2>&1) || true
}

# Run the fixer in dry-run mode (no --apply) and capture its stdout.
run_fixer_dryrun() {
  (cd "$TMP" && npx --yes tsx "$FIXER" 2>&1) || true
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

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────────"
echo "  Totale: $((PASS + FAIL)) test — ✅ $PASS PASS / ❌ $FAIL FAIL"
echo "════════════════════════════════════════════════════════"
echo ""

[ "$FAIL" -eq 0 ] || exit 1
