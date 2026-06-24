#!/usr/bin/env bash
# check-ai-direct-generateobject.sh
#
# Scopo: rilevare chiamate dirette a generateObject con un parametro `schema:`
# (o shorthand `schema,` / `schema }`) al di fuori del gateway approvato
# (server/ai/moderation/provider.ts).
#
# Perché è pericoloso:
#   llama-3.x (il modello default su Groq) NON supporta json_schema nativo.
#   Il Vercel AI SDK v6 ha rimosso il parametro `mode` da generateObject — non
#   è più possibile forzare mode:"json" per aggirare la limitazione.
#   La soluzione corretta è delegare a generateStructured (ai/moderation/provider.ts)
#   che usa output:"no-schema" + validazione Zod lato client per i modelli con
#   objectMode:"json" (es. tutti i modelli llama su Groq).
#
#   Una chiamata diretta `generateObject({ schema: ... })` o shorthand
#   `generateObject({ schema, ... })` bypassa il guard e crasha silenziosamente
#   in produzione quando il modello risolve a llama.
#
# Gateway approvato: server/ai/moderation/provider.ts (generateStructured)
# — unico file autorizzato a chiamare generateObject con uno schema.
#
# Soppressione (solo se il modello è verificato non-llama / non passa per runWithFallback):
#   // check-ai-direct-generateobject: safe
# Aggiungere il commento sulla riga immediatamente precedente a `generateObject(`.
#
# Vedi: .agents/memory/ai-strict-schema.md
#       server/lib/groq-client.ts (commento ATTENZIONE su objectMode:"json")
#       server/__tests__/ai-schema-compatibility.test.ts (Suite 1b e Suite 5)

set -euo pipefail

echo "🔍 Controllo chiamate generateObject con schema diretto (bypass generateStructured)..."

RESULT=$(python3 - << 'PYEOF'
import os
import re

IGNORE_DIRS = {'.local', '.agents', 'node_modules', 'scripts'}
SUPPRESSION = 'check-ai-direct-generateobject: safe'

# Files that are the approved gateways — allowed to call generateObject with schema
WHITELIST = {
    'server/ai/moderation/provider.ts',
}

RE_GENERATE_OBJECT = re.compile(r'\bgenerateObject\s*\(')
# `schema:` keyword form
RE_SCHEMA_KEYED = re.compile(r'\bschema\s*:')
# shorthand form: `schema` not preceded by `.` or word chars,
# followed by optional whitespace then `,` or `}` — e.g. `{ schema, model }`
RE_SCHEMA_SHORTHAND = re.compile(r'(?<![.\w])schema\s*[,}]')
RE_NO_SCHEMA_OUTPUT = re.compile(r'\boutput\s*:\s*["\']no-schema["\']')


def has_schema_arg(body: str) -> bool:
    """Return True if the call body contains a schema argument (keyed or shorthand)."""
    return bool(RE_SCHEMA_KEYED.search(body) or RE_SCHEMA_SHORTHAND.search(body))


def extract_call_body(lines: list[str], start_idx: int) -> tuple[str, int]:
    """
    Starting from `start_idx` (the line containing `generateObject(`), collect
    lines until the top-level paren that opened the call is closed.
    Returns (body_text, last_line_index).
    """
    depth = 0
    body_lines: list[str] = []
    for i in range(start_idx, min(start_idx + 40, len(lines))):
        line = lines[i]
        body_lines.append(line)
        # Track paren depth (ignores string literals — good enough for this check)
        for ch in line:
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0:
                    return ''.join(body_lines), i
    return ''.join(body_lines), min(start_idx + 40, len(lines) - 1)


violations: list[str] = []

for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith('.')]
    for fname in files:
        if fname.endswith('.test.ts') or fname.endswith('.test.tsx'):
            continue
        if not (fname.endswith('.ts') or fname.endswith('.tsx')):
            continue
        if fname.endswith('.styles.ts') or fname.endswith('.styles.tsx'):
            continue

        fpath = os.path.join(root, fname).lstrip('./')
        if fpath in WHITELIST:
            continue
        if '__tests__' in fpath:
            continue

        try:
            with open(os.path.join(root, fname), 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
        except OSError:
            continue

        i = 0
        while i < len(lines):
            line = lines[i]
            if not RE_GENERATE_OBJECT.search(line):
                i += 1
                continue

            lineno = i + 1  # 1-based

            # Check suppression on the same line or the immediately preceding line
            suppressed = SUPPRESSION in line
            if not suppressed and i > 0:
                suppressed = SUPPRESSION in lines[i - 1]
            if suppressed:
                i += 1
                continue

            # Extract this call's argument block (paren-balanced)
            body, end_idx = extract_call_body(lines, i)

            # Only flag if a schema argument appears in the body
            if not has_schema_arg(body):
                i = end_idx + 1
                continue

            # Don't flag output:"no-schema" calls — they are the safe no-schema path
            if RE_NO_SCHEMA_OUTPUT.search(body):
                i = end_idx + 1
                continue

            violations.append(f"{fpath}:{lineno}: {line.rstrip()}")
            i = end_idx + 1

if violations:
    print("FAIL")
    for v in violations:
        print(v)
else:
    print("OK")
PYEOF
)

FIRST_LINE=$(echo "$RESULT" | head -1)

if [ "$FIRST_LINE" = "OK" ]; then
  echo "✅ Nessuna chiamata generateObject con schema diretto fuori dal gateway approvato."
  exit 0
fi

# FAIL — print violations
echo ""
VIOLATIONS=$(echo "$RESULT" | tail -n +2)
while IFS= read -r vline; do
  [ -z "$vline" ] && continue
  echo "❌ TROVATO — $vline"
done <<< "$VIOLATIONS"

echo ""
echo "💥 check-ai-direct-generateobject FALLITO"
echo ""
echo "   llama-3.x (default Groq) NON supporta json_schema nativo."
echo "   generateObject con schema: o shorthand schema, crasha quando il modello è llama."
echo ""
echo "   FIX: sostituire"
echo "     generateObject({ model, schema, prompt })"
echo "   con"
echo "     generateStructured(resolvedModel, { schema, prompt })"
echo "   dove resolvedModel viene da runWithFallback (ai/moderation/provider.ts)."
echo ""
echo "   Soppressione (solo se il modello è verificato non-llama / non passa per runWithFallback):"
echo "     // check-ai-direct-generateobject: safe"
echo "     const result = await generateObject({ schema, ... });"
echo ""
echo "   Documentazione: server/__tests__/ai-schema-compatibility.test.ts (Suite 1b, Suite 5)"
echo "                   server/lib/groq-client.ts (sezione ATTENZIONE objectMode)"
exit 1
