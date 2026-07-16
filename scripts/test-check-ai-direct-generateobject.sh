#!/usr/bin/env bash
# test-check-ai-direct-generateobject.sh
#
# Fixture-based tests for check-ai-direct-generateobject.sh.
# Creates temporary .ts files with known patterns, runs the checker, and
# asserts the expected exit code (pass=0 / fail=1).
#
# Usage: bash scripts/test-check-ai-direct-generateobject.sh

set -euo pipefail

CHECKER="$(dirname "$0")/check-ai-direct-generateobject.sh"
TMPDIR_FIXTURES="$(mktemp -d)"
PASS=0
FAIL_COUNT=0

cleanup() {
  rm -rf "$TMPDIR_FIXTURES"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Helper: run the checker restricted to a single fixture file.
# Because the checker walks the full tree, we symlink the fixture into a
# temp directory that has no other .ts files and override FIXTURE_DIR.
# ---------------------------------------------------------------------------
run_check_on_file() {
  local fixture_file="$1"
  # Write Python directly — re-use the same detector logic but pointed at the fixture
  python3 - "$fixture_file" << 'PYEOF'
import sys
import re

SUPPRESSION = 'check-ai-direct-generateobject: safe'
WHITELIST = {'server/ai/moderation/provider.ts'}

RE_GENERATE_OBJECT = re.compile(r'\bgenerateObject\s*\(')
RE_SCHEMA_KEYED = re.compile(r'\bschema\s*:')
RE_SCHEMA_SHORTHAND = re.compile(r'(?<![.\w])schema\s*[,}]')
RE_NO_SCHEMA_OUTPUT = re.compile(r'\boutput\s*:\s*["\']no-schema["\']')

def has_schema_arg(body):
    return bool(RE_SCHEMA_KEYED.search(body) or RE_SCHEMA_SHORTHAND.search(body))

def extract_call_body(lines, start_idx):
    depth = 0
    body_lines = []
    for i in range(start_idx, min(start_idx + 40, len(lines))):
        line = lines[i]
        body_lines.append(line)
        for ch in line:
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0:
                    return ''.join(body_lines), i
    return ''.join(body_lines), min(start_idx + 40, len(lines) - 1)

fpath = sys.argv[1]
with open(fpath, 'r') as f:
    lines = f.readlines()

violations = []
i = 0
while i < len(lines):
    line = lines[i]
    if not RE_GENERATE_OBJECT.search(line):
        i += 1
        continue
    lineno = i + 1
    suppressed = SUPPRESSION in line
    if not suppressed and i > 0:
        suppressed = SUPPRESSION in lines[i - 1]
    if suppressed:
        i += 1
        continue
    body, end_idx = extract_call_body(lines, i)
    if not has_schema_arg(body):
        i = end_idx + 1
        continue
    if RE_NO_SCHEMA_OUTPUT.search(body):
        i = end_idx + 1
        continue
    violations.append(f"{fpath}:{lineno}: {line.rstrip()}")
    i = end_idx + 1

if violations:
    for v in violations:
        print(f"VIOLATION: {v}")
    sys.exit(1)
sys.exit(0)
PYEOF
}

assert_pass() {
  local name="$1"
  local fixture_file="$2"
  if run_check_on_file "$fixture_file" > /dev/null 2>&1; then
    echo "  ✅ PASS — $name"
    PASS=$((PASS + 1))
  else
    echo "  ❌ FAIL — $name (expected no violation, got one)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

assert_fail() {
  local name="$1"
  local fixture_file="$2"
  if ! run_check_on_file "$fixture_file" > /dev/null 2>&1; then
    echo "  ✅ PASS — $name (violation correctly detected)"
    PASS=$((PASS + 1))
  else
    echo "  ❌ FAIL — $name (expected violation, but checker passed)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

echo "🧪 Tests for check-ai-direct-generateobject.sh"
echo ""

# ---------------------------------------------------------------------------
# TRUE POSITIVE: keyed `schema:` form
# ---------------------------------------------------------------------------
F1="$TMPDIR_FIXTURES/tp_keyed.ts"
cat > "$F1" << 'TS'
import { generateObject } from "ai";
const result = await generateObject({
  model: someModel,
  schema: mySchema,
  prompt: "test",
});
TS
assert_fail "TRUE POSITIVE — keyed schema: form" "$F1"

# ---------------------------------------------------------------------------
# TRUE POSITIVE: shorthand `schema,` form
# ---------------------------------------------------------------------------
F2="$TMPDIR_FIXTURES/tp_shorthand.ts"
cat > "$F2" << 'TS'
import { generateObject } from "ai";
const result = await generateObject({
  model,
  schema,
  prompt,
});
TS
assert_fail "TRUE POSITIVE — shorthand schema, form" "$F2"

# ---------------------------------------------------------------------------
# TRUE POSITIVE: shorthand `schema }` (last property, no trailing comma)
# ---------------------------------------------------------------------------
F3="$TMPDIR_FIXTURES/tp_shorthand_last.ts"
cat > "$F3" << 'TS'
import { generateObject } from "ai";
const result = await generateObject({ model, prompt, schema });
TS
assert_fail "TRUE POSITIVE — shorthand schema } (last property)" "$F3"

# ---------------------------------------------------------------------------
# TRUE NEGATIVE: output:"no-schema" call — safe, should not flag
# ---------------------------------------------------------------------------
F4="$TMPDIR_FIXTURES/tn_no_schema.ts"
cat > "$F4" << 'TS'
import { generateObject } from "ai";
const res = await generateObject({
  model,
  output: "no-schema",
  prompt: "test",
});
TS
assert_pass "TRUE NEGATIVE — output:\"no-schema\" call (safe path)" "$F4"

# ---------------------------------------------------------------------------
# TRUE NEGATIVE: suppression comment on preceding line
# ---------------------------------------------------------------------------
F5="$TMPDIR_FIXTURES/tn_suppressed.ts"
cat > "$F5" << 'TS'
import { generateObject } from "ai";
// check-ai-direct-generateobject: safe — Ollama supports json_schema natively
const result = await generateObject({
  model,
  schema: decisionSchema,
  prompt: "x",
});
TS
assert_pass "TRUE NEGATIVE — suppression comment on preceding line" "$F5"

# ---------------------------------------------------------------------------
# TRUE NEGATIVE: generateObject with no schema arg at all
# ---------------------------------------------------------------------------
F6="$TMPDIR_FIXTURES/tn_no_schema_arg.ts"
cat > "$F6" << 'TS'
import { generateObject } from "ai";
const res = await generateObject({
  model,
  prompt: "test",
  output: "text",
});
TS
assert_pass "TRUE NEGATIVE — no schema argument in call" "$F6"

# ---------------------------------------------------------------------------
# TRUE NEGATIVE: `params.schema.parse()` — not a generateObject schema arg
# ---------------------------------------------------------------------------
F7="$TMPDIR_FIXTURES/tn_schema_access.ts"
cat > "$F7" << 'TS'
import { generateObject } from "ai";
const res = await generateObject({
  model,
  output: "no-schema",
  prompt: "test",
});
const obj = params.schema.parse(res.object);
TS
assert_pass "TRUE NEGATIVE — params.schema.parse() outside call body" "$F7"

# ---------------------------------------------------------------------------
# TRUE NEGATIVE: two calls, first is no-schema, second has suppression
# (regression for bleeding lookahead between adjacent calls)
# ---------------------------------------------------------------------------
F8="$TMPDIR_FIXTURES/tn_two_calls.ts"
cat > "$F8" << 'TS'
import { generateObject } from "ai";
// first call: no-schema
const res = await generateObject({
  model, output: "no-schema", prompt: "test",
});
const obj = schema.parse(res.object);

// second call: suppressed
// check-ai-direct-generateobject: safe — non-llama model confirmed
const result = await generateObject({
  model, schema: mySchema, prompt: "x",
});
TS
assert_pass "TRUE NEGATIVE — two calls: no-schema + suppressed (no bleed)" "$F8"

# ---------------------------------------------------------------------------
# Check 2 — Ollama think:false (generateObject with Ollama model missing think:false)
# ---------------------------------------------------------------------------

# Inline Python runner for Check 2 (mirrors the logic in check-ai-direct-generateobject.sh)
run_check2_on_file() {
  local fixture_file="$1"
  python3 - "$fixture_file" << 'PYEOF'
import sys
import re

SUPPRESSION_NO_THINK_OK = 'check-ai-direct-generateobject: ollama-no-think-ok'

RE_GENERATE_OBJECT = re.compile(r'\bgenerateObject\s*\(')
RE_OLLAMA_MODEL = re.compile(
    r'\bmodel\s*:\s*'
    r'(?:'
        r'om\.model'
        r'|getOllamaModel\s*\('
        r'|[Oo]llama[a-zA-Z0-9_$]*(?:\.model)?'
        r'|[a-zA-Z_$][a-zA-Z0-9_$]+[Oo]llama[a-zA-Z0-9_$]*(?:\.model)?'
    r')'
)
RE_THINK_FALSE = re.compile(r'think\s*:\s*false')
RE_OLLAMA_IN_PROVIDER_OPTS = re.compile(r'providerOptions\s*:[^}]*ollama', re.DOTALL)

def extract_call_body(lines, start_idx):
    depth = 0
    body_lines = []
    for i in range(start_idx, min(start_idx + 60, len(lines))):
        line = lines[i]
        body_lines.append(line)
        for ch in line:
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0:
                    return ''.join(body_lines), i
    return ''.join(body_lines), min(start_idx + 60, len(lines) - 1)

def has_ollama_think_false(body):
    return bool(RE_OLLAMA_IN_PROVIDER_OPTS.search(body) and RE_THINK_FALSE.search(body))

fpath = sys.argv[1]
with open(fpath, 'r') as f:
    lines = f.readlines()

violations = []
i = 0
while i < len(lines):
    line = lines[i]
    if not RE_GENERATE_OBJECT.search(line):
        i += 1
        continue
    suppressed = SUPPRESSION_NO_THINK_OK in line
    if not suppressed and i > 0:
        suppressed = SUPPRESSION_NO_THINK_OK in lines[i - 1]
    if suppressed:
        i += 1
        continue
    body, end_idx = extract_call_body(lines, i)
    if not RE_OLLAMA_MODEL.search(body):
        i = end_idx + 1
        continue
    if not has_ollama_think_false(body):
        violations.append(f"{fpath}:{i+1}: {line.rstrip()}")
    i = end_idx + 1

if violations:
    for v in violations:
        print(f"VIOLATION: {v}")
    sys.exit(1)
sys.exit(0)
PYEOF
}

assert_pass2() {
  local name="$1"
  local fixture_file="$2"
  if run_check2_on_file "$fixture_file" > /dev/null 2>&1; then
    echo "  ✅ PASS — $name"
    PASS=$((PASS + 1))
  else
    echo "  ❌ FAIL — $name (expected no violation, got one)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

assert_fail2() {
  local name="$1"
  local fixture_file="$2"
  if ! run_check2_on_file "$fixture_file" > /dev/null 2>&1; then
    echo "  ✅ PASS — $name (violation correctly detected)"
    PASS=$((PASS + 1))
  else
    echo "  ❌ FAIL — $name (expected violation, but checker passed)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

echo ""
echo "── Check 2 tests (Ollama think:false) ──────────────────────────────────"
echo ""

# TRUE POSITIVE: om.model without think:false
C2_F1="$TMPDIR_FIXTURES/c2_tp_om_model.ts"
cat > "$C2_F1" << 'TS'
import { generateObject } from "ai";
const { object } = await generateObject({
  model: om.model,
  schema: decisionSchema,
  prompt: "choose engine",
  temperature: 0,
});
TS
assert_fail2 "Check2 TRUE POSITIVE — om.model without think:false" "$C2_F1"

# TRUE POSITIVE: ollamaModel (lowercase prefix) without think:false
C2_F2="$TMPDIR_FIXTURES/c2_tp_ollamamodel_var.ts"
cat > "$C2_F2" << 'TS'
import { generateObject } from "ai";
const ollamaModel = getOllamaModel();
const { object } = await generateObject({
  model: ollamaModel,
  schema: mySchema,
  prompt: "test",
});
TS
assert_fail2 "Check2 TRUE POSITIVE — ollamaModel variable (lowercase prefix) without think:false" "$C2_F2"

# TRUE POSITIVE: ollama.model object form without think:false
C2_F3="$TMPDIR_FIXTURES/c2_tp_ollama_model_prop.ts"
cat > "$C2_F3" << 'TS'
import { generateObject } from "ai";
const { object } = await generateObject({
  model: ollama.model,
  schema: mySchema,
  prompt: "test",
});
TS
assert_fail2 "Check2 TRUE POSITIVE — ollama.model (object.property) without think:false" "$C2_F3"

# TRUE POSITIVE: getOllamaModel() without think:false
C2_F4="$TMPDIR_FIXTURES/c2_tp_getolellamamodel.ts"
cat > "$C2_F4" << 'TS'
import { generateObject } from "ai";
const { object } = await generateObject({
  model: getOllamaModel(), schema: mySchema, prompt: "test",
});
TS
assert_fail2 "Check2 TRUE POSITIVE — getOllamaModel() without think:false" "$C2_F4"

# TRUE POSITIVE: myOllamaModel (mixed-case mid-word) without think:false
C2_F5="$TMPDIR_FIXTURES/c2_tp_my_ollamamodel.ts"
cat > "$C2_F5" << 'TS'
import { generateObject } from "ai";
const { object } = await generateObject({
  model: myOllamaModel,
  schema: mySchema,
  prompt: "test",
});
TS
assert_fail2 "Check2 TRUE POSITIVE — myOllamaModel variable without think:false" "$C2_F5"

# TRUE NEGATIVE: om.model WITH think:false — correctly approved
C2_F6="$TMPDIR_FIXTURES/c2_tn_with_think_false.ts"
cat > "$C2_F6" << 'TS'
import { generateObject } from "ai";
const result = await generateObject({
  model: om.model,
  schema: decisionSchema,
  prompt: "choose engine",
  temperature: 0,
  providerOptions: { ollama: { think: false } },
});
TS
assert_pass2 "Check2 TRUE NEGATIVE — om.model WITH think:false (approved)" "$C2_F6"

# TRUE NEGATIVE: ollamaModel WITH think:false
C2_F7="$TMPDIR_FIXTURES/c2_tn_ollamamodel_think_false.ts"
cat > "$C2_F7" << 'TS'
import { generateObject } from "ai";
const { object } = await generateObject({
  model: ollamaModel,
  schema: mySchema,
  prompt: "test",
  providerOptions: { ollama: { think: false } },
});
TS
assert_pass2 "Check2 TRUE NEGATIVE — ollamaModel WITH think:false" "$C2_F7"

# TRUE NEGATIVE: suppressed with ollama-no-think-ok
C2_F8="$TMPDIR_FIXTURES/c2_tn_suppressed.ts"
cat > "$C2_F8" << 'TS'
import { generateObject } from "ai";
// check-ai-direct-generateobject: ollama-no-think-ok — non-qwen3 model confirmed
const { object } = await generateObject({
  model: om.model,
  schema: mySchema,
  prompt: "test",
});
TS
assert_pass2 "Check2 TRUE NEGATIVE — suppressed with ollama-no-think-ok" "$C2_F8"

# TRUE NEGATIVE: non-Ollama model (openaiModel) — should not trigger Check 2
C2_F9="$TMPDIR_FIXTURES/c2_tn_non_ollama.ts"
cat > "$C2_F9" << 'TS'
import { generateObject } from "ai";
const { object } = await generateObject({
  model: openaiModel,
  schema: mySchema,
  prompt: "test",
});
TS
assert_pass2 "Check2 TRUE NEGATIVE — non-Ollama model (openaiModel) not flagged" "$C2_F9"

# TRUE NEGATIVE: ollama.model WITH think:false (multiline providerOptions)
C2_F10="$TMPDIR_FIXTURES/c2_tn_ollama_model_multiline.ts"
cat > "$C2_F10" << 'TS'
import { generateObject } from "ai";
const { object } = await generateObject({
  model: ollama.model,
  schema: mySchema,
  prompt: "test",
  temperature: 0,
  providerOptions: {
    ollama: { think: false },
  },
});
TS
assert_pass2 "Check2 TRUE NEGATIVE — ollama.model WITH think:false (multiline providerOptions)" "$C2_F10"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
TOTAL=$((PASS + FAIL_COUNT))
echo "Results: $PASS/$TOTAL passed"
if [ $FAIL_COUNT -gt 0 ]; then
  echo "💥 $FAIL_COUNT test(s) FAILED"
  exit 1
else
  echo "✅ All tests passed"
fi
