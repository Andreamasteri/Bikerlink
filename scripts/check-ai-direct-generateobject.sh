#!/usr/bin/env bash
# check-ai-direct-generateobject.sh
#
# Due controlli in sequenza — entrambi devono passare:
#
# ── Check 1 — Schema bypass ──────────────────────────────────────────────────
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
# ── Check 2 — Ollama think:false ─────────────────────────────────────────────
# Scopo: rilevare chiamate generateObject che passano un modello Ollama (indicato
# da `om.model`, `getOllamaModel(`, o una variabile con "ollama" nel nome) senza
# includere `providerOptions: { ollama: { think: false } }`.
#
# Perché è pericoloso:
#   qwen3 (il modello default su Ollama/ThinkCentre) emette token <think>…</think>
#   per default. Questi token rompono il parsing JSON di generateObject causando un
#   errore di validazione schema → il decider scala a cloud (disabilitato) →
#   ricade sul deterministico → la "Modalità AI" non si attiva mai.
#
# Call site approvato: server/routing/ai-engine-decider.ts
# — ha già `providerOptions: { ollama: { think: false } }` e il commento safe.
#
# Soppressione di Check 2 (aggiuntiva, solo se `think:false` non è applicabile):
#   // check-ai-direct-generateobject: ollama-no-think-ok
# Aggiungere sulla riga immediatamente precedente a `generateObject(`.
#
# Vedi: .agents/memory/ai-strict-schema.md
#       .agents/memory/qwen3-ollama-think-quirk.md
#       server/lib/groq-client.ts (commento ATTENZIONE su objectMode:"json")
#       server/__tests__/ai-schema-compatibility.test.ts (Suite 1b e Suite 5)

set -euo pipefail

OVERALL_OK=true

# ═══════════════════════════════════════════════════════════════════════════════
# Check 1 — Schema bypass (generateObject con schema: fuori dal gateway)
# ═══════════════════════════════════════════════════════════════════════════════
echo "🔍 Check 1 — Chiamate generateObject con schema diretto (bypass generateStructured)..."

RESULT1=$(python3 - << 'PYEOF'
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

FIRST_LINE1=$(echo "$RESULT1" | head -1)

if [ "$FIRST_LINE1" = "OK" ]; then
  echo "✅ Check 1 OK — Nessuna chiamata generateObject con schema diretto fuori dal gateway approvato."
else
  OVERALL_OK=false
  echo ""
  VIOLATIONS1=$(echo "$RESULT1" | tail -n +2)
  while IFS= read -r vline; do
    [ -z "$vline" ] && continue
    echo "❌ Check 1 — TROVATO — $vline"
  done <<< "$VIOLATIONS1"
  echo ""
  echo "💥 Check 1 FALLITO"
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
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Check 2 — Ollama think:false (generateObject con modello Ollama senza think:false)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "🔍 Check 2 — Chiamate generateObject con modello Ollama senza providerOptions.ollama.think:false..."

RESULT2=$(python3 - << 'PYEOF'
import os
import re

IGNORE_DIRS = {'.local', '.agents', 'node_modules', 'scripts'}

# Soppressione specifica per Check 2: il chiamante garantisce che think:false
# non è necessario (es. il modello Ollama non è qwen3 o non emette <think>).
SUPPRESSION_NO_THINK_OK = 'check-ai-direct-generateobject: ollama-no-think-ok'

RE_GENERATE_OBJECT = re.compile(r'\bgenerateObject\s*\(')

# Indicatori che il modello passato è un modello Ollama:
#   - om.model              → pattern comune da tryBuildOllama()
#   - getOllamaModel(       → chiamata diretta al factory
#   - ollamaModel           → variabile che inizia con "ollama" (minuscolo)
#   - ollama.model          → oggetto Ollama con proprietà .model
#   - myOllamaModel         → variabile con "Ollama" nel mezzo
#   - xyzOllama.model       → oggetto con "Ollama" nel nome + .model
RE_OLLAMA_MODEL = re.compile(
    r'\bmodel\s*:\s*'
    r'(?:'
        r'om\.model'                                                    # om.model (da tryBuildOllama)
        r'|getOllamaModel\s*\('                                         # factory diretto
        r'|[Oo]llama[a-zA-Z0-9_$]*(?:\.model)?'                        # ollama, ollamaModel, ollama.model, ollamaFoo.model
        r'|[a-zA-Z_$][a-zA-Z0-9_$]+[Oo]llama[a-zA-Z0-9_$]*(?:\.model)?'  # myOllama, myOllamaModel, xyzOllama.model
    r')'
)

# Presenza di think:false dentro providerOptions.ollama
RE_THINK_FALSE = re.compile(r'think\s*:\s*false')
RE_OLLAMA_IN_PROVIDER_OPTS = re.compile(r'providerOptions\s*:[^}]*ollama', re.DOTALL)


def extract_call_body(lines: list[str], start_idx: int) -> tuple[str, int]:
    """
    Collect lines from start_idx until the top-level paren is closed.
    Returns (body_text, last_line_index).
    """
    depth = 0
    body_lines: list[str] = []
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


def has_ollama_think_false(body: str) -> bool:
    """
    Return True if the call body has providerOptions with ollama.think:false.
    We require BOTH: the word 'ollama' inside providerOptions AND think:false
    somewhere in the body (they are co-located in practice).
    """
    return bool(RE_OLLAMA_IN_PROVIDER_OPTS.search(body) and RE_THINK_FALSE.search(body))


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

            # Check suppression for Check 2 on the same line or immediately preceding line
            suppressed = SUPPRESSION_NO_THINK_OK in line
            if not suppressed and i > 0:
                suppressed = SUPPRESSION_NO_THINK_OK in lines[i - 1]
            if suppressed:
                i += 1
                continue

            # Extract the call body
            body, end_idx = extract_call_body(lines, i)

            # Only flag if this call targets an Ollama model
            if not RE_OLLAMA_MODEL.search(body):
                i = end_idx + 1
                continue

            # Require providerOptions: { ollama: { think: false } }
            if not has_ollama_think_false(body):
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

FIRST_LINE2=$(echo "$RESULT2" | head -1)

if [ "$FIRST_LINE2" = "OK" ]; then
  echo "✅ Check 2 OK — Tutte le chiamate generateObject con modello Ollama hanno providerOptions.ollama.think:false."
else
  OVERALL_OK=false
  echo ""
  VIOLATIONS2=$(echo "$RESULT2" | tail -n +2)
  while IFS= read -r vline; do
    [ -z "$vline" ] && continue
    echo "❌ Check 2 — TROVATO — $vline"
  done <<< "$VIOLATIONS2"
  echo ""
  echo "💥 Check 2 FALLITO"
  echo ""
  echo "   qwen3 (modello default Ollama/ThinkCentre) emette token <think>…</think>"
  echo "   che rompono il parsing JSON di generateObject."
  echo ""
  echo "   FIX: aggiungere providerOptions a generateObject:"
  echo "     const result = await generateObject({"
  echo "       model: om.model,"
  echo "       schema: mySchema,"
  echo "       prompt: myPrompt,"
  echo "       providerOptions: { ollama: { think: false } },  // ← obbligatorio"
  echo "     });"
  echo ""
  echo "   Soppressione (solo se think:false non è necessario, es. modello non qwen3):"
  echo "     // check-ai-direct-generateobject: ollama-no-think-ok"
  echo "     const result = await generateObject({ model: om.model, ... });"
  echo ""
  echo "   Vedi: .agents/memory/qwen3-ollama-think-quirk.md"
  echo "         server/routing/ai-engine-decider.ts (call site approvato)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Check 3 — generateStructured con think:true nel providerOptions Ollama
# ═══════════════════════════════════════════════════════════════════════════════
# generateStructured forza think:false incondizionatamente (spread finale in
# provider.ts), quindi passare think:true è sempre un errore: è silenziosamente
# ignorato e può confondere future manutenzioni facendo credere che il valore
# venga rispettato.
echo ""
echo "🔍 Check 3 — Chiamate generateStructured con providerOptions.ollama.think:true..."

RESULT3=$(python3 - << 'PYEOF'
import os
import re

IGNORE_DIRS = {'.local', '.agents', 'node_modules', 'scripts'}

RE_GENERATE_STRUCTURED = re.compile(r'\bgenerateStructured\s*\(')
RE_THINK_TRUE = re.compile(r'think\s*:\s*true')
RE_OLLAMA_IN_PROVIDER_OPTS = re.compile(r'providerOptions\s*:[^}]*ollama', re.DOTALL)


def extract_call_body(lines: list[str], start_idx: int) -> tuple[str, int]:
    depth = 0
    body_lines: list[str] = []
    for i in range(start_idx, min(start_idx + 80, len(lines))):
        line = lines[i]
        body_lines.append(line)
        for ch in line:
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0:
                    return ''.join(body_lines), i
    return ''.join(body_lines), min(start_idx + 80, len(lines) - 1)


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
            if not RE_GENERATE_STRUCTURED.search(line):
                i += 1
                continue

            lineno = i + 1

            body, end_idx = extract_call_body(lines, i)

            # Flag if the call passes ollama.think:true inside providerOptions
            if RE_OLLAMA_IN_PROVIDER_OPTS.search(body) and RE_THINK_TRUE.search(body):
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

FIRST_LINE3=$(echo "$RESULT3" | head -1)

if [ "$FIRST_LINE3" = "OK" ]; then
  echo "✅ Check 3 OK — Nessuna chiamata generateStructured passa think:true ad Ollama."
else
  OVERALL_OK=false
  echo ""
  VIOLATIONS3=$(echo "$RESULT3" | tail -n +2)
  while IFS= read -r vline; do
    [ -z "$vline" ] && continue
    echo "❌ Check 3 — TROVATO — $vline"
  done <<< "$VIOLATIONS3"
  echo ""
  echo "💥 Check 3 FALLITO"
  echo ""
  echo "   generateStructured() forza think:false incondizionatamente per Ollama."
  echo "   Passare think:true nel providerOptions è silenziosamente ignorato e"
  echo "   può trarre in inganno chi legge il codice."
  echo ""
  echo "   FIX: rimuovere think:true dal providerOptions passato a generateStructured."
  echo "   Il path streaming (agent.ts) usa think:true correttamente — solo"
  echo "   generateStructured (path non-streaming) forza sempre think:false."
  echo ""
  echo "   Vedi: server/ai/moderation/provider.ts (generateStructured)"
  echo "         .agents/memory/qwen3-ollama-think-quirk.md"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Esito finale
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
if [ "$OVERALL_OK" = "true" ]; then
  echo "✅ check-ai-direct-generateobject PASSATO (tutti i check OK)"
  exit 0
else
  echo "💥 check-ai-direct-generateobject FALLITO — vedere i dettagli sopra"
  exit 1
fi
