#!/usr/bin/env bash
# check-ai-direct-generateobject.sh
#
# Quattro controlli in sequenza — tutti devono passare:
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
#
# ── Check 4 — callOllamaChat think:true in contesto non-streaming ─────────────
# Scopo: rilevare chiamate callOllamaChat che passano `think: true` nel terzo
# argomento (options) senza contestualmente passare `stream: true`.
#
# Perché è pericoloso:
#   callOllamaChat costruisce providerOptions internamente in base a `schema` e
#   `persona` — il chiamante non ha visibilità su quel calcolo. Se un futuro
#   callsite aggiunge `think: true` all'options e OllamaChatOptions è estesa per
#   accettarlo, il valore bypassa l'enforcement interno che forza think:false per
#   le chiamate non-streaming con schema (generateObject). Il risultato è che
#   qwen3 emette token <think>…</think> nel body JSON, rompendo la validazione
#   schema silenziosamente.
#
# Caso legittimo (think:true implicito, non da passare esplicitamente):
#   callOllamaChat con persona="horus", schema=undefined, stream:true (Horus
#   reasoning in full-stream). L'enforcement interno di callOllamaChat gestisce
#   questo caso senza che il chiamante debba specificare think:true.
#
# FIX: rimuovere think:true dal terzo argomento di callOllamaChat. L'enforcement
#   interno gestisce già il flag correttamente. Se il callsite è un path di testo
#   libero Horus non-streaming che vuole il reasoning, usare persona:"horus" e
#   stream:true (così CF non va in timeout) — think sarà automaticamente true.

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
# Check 4 — callOllamaChat con think:true in contesto non-streaming
# ═══════════════════════════════════════════════════════════════════════════════
# callOllamaChat gestisce internamente il flag think in base a `schema` e
# `persona`. Un callsite che passa think:true esplicitamente nelle options è
# sempre sbagliato: se lo schema è presente think è già forzato a false
# (silenziosamente ignorato, ma fuorviante); se in futuro OllamaChatOptions
# accetta think come campo esplicito un valore true senza stream:true corrompere
# il JSON di generateObject.
echo ""
echo "🔍 Check 4 — Chiamate callOllamaChat con think:true in contesto non-streaming..."

RESULT4=$(python3 - << 'PYEOF'
import os
import re

IGNORE_DIRS = {'.local', '.agents', 'node_modules', 'scripts'}

# Match the callOllamaChat( call site opener
RE_CALL = re.compile(r'\bcallOllamaChat\s*\(')
RE_THINK_TRUE = re.compile(r'think\s*:\s*true')
RE_STREAM_TRUE = re.compile(r'stream\s*:\s*true')


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
        # Skip the implementation file itself — the enforcement lives there.
        if fpath == 'server/lib/ollama-client.ts':
            continue

        try:
            with open(os.path.join(root, fname), 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
        except OSError:
            continue

        i = 0
        while i < len(lines):
            line = lines[i]
            if not RE_CALL.search(line):
                i += 1
                continue

            lineno = i + 1
            body, end_idx = extract_call_body(lines, i)

            # Flag: think:true present AND stream:true absent → non-streaming + explicit think
            if RE_THINK_TRUE.search(body) and not RE_STREAM_TRUE.search(body):
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

FIRST_LINE4=$(echo "$RESULT4" | head -1)

if [ "$FIRST_LINE4" = "OK" ]; then
  echo "✅ Check 4 OK — Nessun callOllamaChat passa think:true in contesto non-streaming."
else
  OVERALL_OK=false
  echo ""
  VIOLATIONS4=$(echo "$RESULT4" | tail -n +2)
  while IFS= read -r vline; do
    [ -z "$vline" ] && continue
    echo "❌ Check 4 — TROVATO — $vline"
  done <<< "$VIOLATIONS4"
  echo ""
  echo "💥 Check 4 FALLITO"
  echo ""
  echo "   callOllamaChat costruisce providerOptions internamente in base a \`schema\`"
  echo "   e \`persona\` — il chiamante non deve specificare think:true."
  echo "   Un callsite non-streaming con think:true esplicito è fuorviante e,"
  echo "   se OllamaChatOptions venisse estesa per accettare il campo, bypasserebbe"
  echo "   l'enforcement interno che forza think:false per le chiamate con schema."
  echo ""
  echo "   FIX: rimuovere think:true dall'options di callOllamaChat."
  echo "   Per i path di testo Horus non-streaming, usare stream:true per"
  echo "   evitare il timeout CF (think sarà automaticamente true via persona)."
  echo ""
  echo "   Vedi: server/lib/ollama-client.ts (callOllamaChat, righe 313-319)"
  echo "         .agents/memory/qwen3-ollama-think-quirk.md"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Check 5 — streamAresChat / generateText diretti con think:true (path non AI-SDK-streaming)
# ═══════════════════════════════════════════════════════════════════════════════
# Due sotto-check in un unico blocco Python:
#
# 5a) streamAresChat callsites con think:true nel corpo della chiamata.
#     streamAresChat fa sempre HTTP-direct streaming verso Ollama (stream:true nel
#     body JSON). AresChatOptions NON ha un campo `think`; se qualcuno lo inietta
#     nell'oggetto options inviato ad Ollama, il modello qwen3/devstral emetterà
#     token <think>…</think> che corrompono la risposta testuale. Poiché il tipo
#     non prevede il campo, TypeScript lo cattura già; questo gate aggiunge un
#     controllo statico testuale belt-and-suspenders.
#
# 5b) generateText callsites (al di fuori di server/lib/ollama-client.ts, che è
#     il gateway approvato) con providerOptions.ollama.think:true.
#     generateText è per definizione non-streaming (non esiste fullStream): se un
#     modello qwen3 riceve think:true in una chiamata non-streaming, i token
#     <think>…</think> finiscono nel campo `text` restituito, corrompendo
#     qualsiasi parsing downstream. Il path streaming usa streamText, non
#     generateText: nessun callsite legittimo di generateText ha bisogno di
#     think:true.
#
# Gateway approvato per generateText + Ollama: server/lib/ollama-client.ts
# (callOllamaChat — gestisce internamente think:false per generateText e
# think:true solo quando stream:true via streamText).
#
# Soppressione (solo se la chiamata è verificata sicura per una ragione specifica):
#   // check-ai-direct-generateobject: think-stream-ok
# Aggiungere sulla riga immediatamente precedente alla chiamata.
echo ""
echo "🔍 Check 5 — streamAresChat/generateText con think:true in contesto non AI-SDK-streaming..."

RESULT5=$(python3 - << 'PYEOF'
import os
import re

IGNORE_DIRS = {'.local', '.agents', 'node_modules', 'scripts'}
SUPPRESSION = 'check-ai-direct-generateobject: think-stream-ok'

# 5a — streamAresChat con think:true nel corpo della chiamata
RE_STREAM_ARES = re.compile(r'\bstreamAresChat\s*\(')

# 5b — generateText con providerOptions.ollama.think:true (escluso il gateway)
RE_GENERATE_TEXT = re.compile(r'\bgenerateText\s*\(')
RE_OLLAMA_IN_PROVIDER_OPTS = re.compile(r'providerOptions\s*:[^}]*ollama', re.DOTALL)

RE_THINK_TRUE = re.compile(r'think\s*:\s*true')


def extract_call_body(lines: list, start_idx: int, max_lines: int = 80) -> tuple:
    depth = 0
    body_lines: list = []
    for i in range(start_idx, min(start_idx + max_lines, len(lines))):
        line = lines[i]
        body_lines.append(line)
        for ch in line:
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0:
                    return ''.join(body_lines), i
    return ''.join(body_lines), min(start_idx + max_lines, len(lines) - 1)


violations: list = []

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
        # Escludi l'implementazione di ares-client.ts (il controllo è sulle chiamate esterne)
        if fpath == 'server/lib/ares-client.ts':
            continue
        # Escludi il gateway approvato per generateText + Ollama
        if fpath == 'server/lib/ollama-client.ts':
            continue

        try:
            with open(os.path.join(root, fname), 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
        except OSError:
            continue

        i = 0
        while i < len(lines):
            line = lines[i]

            # ── 5a: streamAresChat con think:true ────────────────────────────────
            if RE_STREAM_ARES.search(line):
                lineno = i + 1
                suppressed = SUPPRESSION in line or (i > 0 and SUPPRESSION in lines[i - 1])
                if not suppressed:
                    body, end_idx = extract_call_body(lines, i)
                    if RE_THINK_TRUE.search(body):
                        violations.append(f"5a:{fpath}:{lineno}: {line.rstrip()}")
                    i = end_idx + 1
                    continue

            # ── 5b: generateText con providerOptions.ollama.think:true ────────────
            if RE_GENERATE_TEXT.search(line):
                lineno = i + 1
                suppressed = SUPPRESSION in line or (i > 0 and SUPPRESSION in lines[i - 1])
                if not suppressed:
                    body, end_idx = extract_call_body(lines, i)
                    if RE_OLLAMA_IN_PROVIDER_OPTS.search(body) and RE_THINK_TRUE.search(body):
                        violations.append(f"5b:{fpath}:{lineno}: {line.rstrip()}")
                    i = end_idx + 1
                    continue

            i += 1

if violations:
    print("FAIL")
    for v in violations:
        print(v)
else:
    print("OK")
PYEOF
)

FIRST_LINE5=$(echo "$RESULT5" | head -1)

if [ "$FIRST_LINE5" = "OK" ]; then
  echo "✅ Check 5 OK — Nessun streamAresChat/generateText diretto con think:true fuori dal gateway approvato."
else
  OVERALL_OK=false
  echo ""
  VIOLATIONS5=$(echo "$RESULT5" | tail -n +2)
  while IFS= read -r vline; do
    [ -z "$vline" ] && continue
    PREFIX=$(echo "$vline" | cut -d: -f1)
    DETAIL=$(echo "$vline" | cut -d: -f2-)
    if [ "$PREFIX" = "5a" ]; then
      echo "❌ Check 5a — streamAresChat con think:true — $DETAIL"
    else
      echo "❌ Check 5b — generateText con providerOptions.ollama.think:true — $DETAIL"
    fi
  done <<< "$VIOLATIONS5"
  echo ""
  echo "💥 Check 5 FALLITO"
  echo ""
  echo "   5a) streamAresChat usa HTTP-direct streaming verso Ollama (stream:true nel body)."
  echo "       AresChatOptions NON espone un campo 'think': aggiungere think:true nell'oggetto"
  echo "       options passato all'API Ollama farebbe emettere token <think>…</think> che"
  echo "       corrompono il testo. Il check è belt-and-suspenders: TypeScript lo cattura già."
  echo ""
  echo "       FIX: rimuovere think:true dal corpo della chiamata streamAresChat."
  echo ""
  echo "   5b) generateText è per definizione non-streaming: i token <think>…</think>"
  echo "       finiscono nel campo 'text' restituito, corrompendo qualsiasi parsing downstream."
  echo "       Il gateway approvato è server/lib/ollama-client.ts (callOllamaChat), che gestisce"
  echo "       internamente think:false per generateText e think:true solo via streamText."
  echo ""
  echo "       FIX: usare callOllamaChat (server/lib/ollama-client.ts) invece di generateText"
  echo "       diretto con modello Ollama, oppure rimuovere think:true dal providerOptions."
  echo ""
  echo "   Soppressione (solo se verificato sicuro — raro):"
  echo "     // check-ai-direct-generateobject: think-stream-ok"
  echo "     await streamAresChat({ ... }) | await generateText({ ... })"
  echo ""
  echo "   Vedi: server/lib/ares-client.ts (streamAresChat, AresChatOptions)"
  echo "         server/lib/ollama-client.ts (callOllamaChat — gateway approvato)"
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
