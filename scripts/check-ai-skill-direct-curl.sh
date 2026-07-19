#!/usr/bin/env bash
# check-ai-skill-direct-curl.sh
#
# Scopo: rilevare skill (file .md in .agents/skills/) che contengono chiamate
# curl dirette a $HORUS_OLLAMA_URL, $DIAG_OLLAMA_URL o $BOWIE_OLLAMA_URL
# senza includere il pre-flight canonico (source scripts/ai-agent-access.sh
# oppure il blocco Prerequisito ai-agent-access/SKILL.md).
#
# Il rilevamento è consapevole dei blocchi fenced (```bash ... ```):
#   • raccoglie ogni blocco fenced del file
#   • per ogni blocco: se il blocco contiene `curl` E una delle tre variabili
#     OLLAMA_URL (anche su righe separate, come in una chiamata multiline),
#     considera il file come file con curl diretto
#   • se il file non contiene il pre-flight canonico → VIOLAZIONE
#
# Perché è pericoloso:
#   Una skill che chiama curl $HORUS_OLLAMA_URL direttamente salta:
#     - la verifica dei secret non vuoti (ai_check_tc)
#     - gli header Cloudflare Access (CF-Access-Client-Id / CF-Access-Client-Secret)
#     - il parametro stream:true obbligatorio (CF taglia a 100s senza stream)
#     - lo strip dei token <think>…</think> di qwen3
#   Il risultato è un errore silenzioso (403 CF Access) o una risposta corrotta.
#
# Soppressione (solo se il bypass è intenzionale e documentato):
#   Aggiungere il commento nel file .md dove la violazione appare:
#     <!-- check-ai-skill-direct-curl: safe -->
#
# File canonico di accesso: scripts/ai-agent-access.sh
# Documentazione: .agents/skills/ai-agent-access/SKILL.md

set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# Self-test interni (sempre eseguiti — veloci, nessuna dipendenza esterna)
# ═══════════════════════════════════════════════════════════════════════════════

run_self_tests() {
  local fail=0

  # Crea directory temporanea per i fixture
  local tmpdir
  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' RETURN

  # ── Fixture 1: curl multiline con URL su riga separata, senza pre-flight ─────
  cat > "$tmpdir/bad_multiline.md" << 'EOF'
# Bad skill — curl multilinea senza pre-flight

```bash
curl -s --no-buffer --max-time 60 \
  -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
  "$HORUS_OLLAMA_URL/api/generate" \
  -d '{"model":"qwen3:4b","prompt":"test","stream":true}'
```
EOF

  # ── Fixture 2: curl same-line con URL, senza pre-flight ──────────────────────
  cat > "$tmpdir/bad_sameline.md" << 'EOF'
# Bad skill — curl su una riga senza pre-flight

```bash
curl -s "$DIAG_OLLAMA_URL/api/chat" -d '{"model":"devstral","prompt":"x"}'
```
EOF

  # ── Fixture 3: curl con BOWIE_OLLAMA_URL, senza pre-flight ───────────────────
  cat > "$tmpdir/bad_bowie.md" << 'EOF'
# Bad skill — curl BOWIE senza pre-flight

```bash
STATUS=$(curl -s "$BOWIE_OLLAMA_URL/api/ps")
echo "$STATUS"
```
EOF

  # ── Fixture 4: curl multiline CON pre-flight canonico → deve passare ─────────
  cat > "$tmpdir/good_preflight.md" << 'EOF'
# Good skill — ha il pre-flight

## Prerequisito: carica `.agents/skills/ai-agent-access/SKILL.md`

```bash
source scripts/ai-agent-access.sh
STATUS=$(ai_check_tc)
[ "$STATUS" = "online" ] || { echo "TC offline"; exit 1; }

curl -s --no-buffer --max-time 60 \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
  "$HORUS_OLLAMA_URL/api/generate" \
  -d '{"model":"qwen3:4b","prompt":"test","stream":true}'
```
EOF

  # ── Fixture 5: curl multiline CON source canonico → deve passare ──────────────
  cat > "$tmpdir/good_source.md" << 'EOF'
# Good skill — sourcia ai-agent-access.sh

```bash
source scripts/ai-agent-access.sh
[ "$(ai_check_tc)" = "online" ] || exit 1
RESPONSE=$(ai_call_horus "test prompt")
```
EOF

  # ── Fixture 6: soppressione → deve passare ────────────────────────────────────
  cat > "$tmpdir/suppressed.md" << 'EOF'
# Suppressed skill

<!-- check-ai-skill-direct-curl: safe -->

```bash
curl -s "$HORUS_OLLAMA_URL/api/ps"
```
EOF

  # ── Fixture 7: curl senza OLLAMA_URL → deve passare (non riguarda questa skill) ─
  cat > "$tmpdir/unrelated.md" << 'EOF'
# Skill senza Ollama

```bash
curl -s "https://example.com/health"
```
EOF

  # Esegui il detector Python sui fixture
  local result
  result=$(python3 - "$tmpdir" << 'PYEOF'
import os
import re
import sys

SKILLS_DIR = sys.argv[1]
SUPPRESSION = 'check-ai-skill-direct-curl: safe'
OLLAMA_VARS = ('$HORUS_OLLAMA_URL', '$DIAG_OLLAMA_URL', '$BOWIE_OLLAMA_URL')

RE_CANONICAL_SOURCE    = re.compile(r'source\s+scripts/ai-agent-access\.sh')
RE_CANONICAL_PREREQ_MD = re.compile(r'ai-agent-access/SKILL\.md')
RE_FENCED_BLOCK        = re.compile(r'```[^\n]*\n(.*?)```', re.DOTALL)
RE_CURL                = re.compile(r'\bcurl\b')

def file_has_direct_ollama_curl(content):
    """True if any fenced block contains both 'curl' and an OLLAMA_URL variable."""
    for block_match in RE_FENCED_BLOCK.finditer(content):
        block = block_match.group(0)
        if not RE_CURL.search(block):
            continue
        if any(var in block for var in OLLAMA_VARS):
            return True
    return False

violations = []

for fname in sorted(os.listdir(SKILLS_DIR)):
    if not fname.endswith('.md'):
        continue
    fpath = os.path.join(SKILLS_DIR, fname)
    with open(fpath, encoding='utf-8', errors='ignore') as f:
        content = f.read()

    if not file_has_direct_ollama_curl(content):
        continue
    if SUPPRESSION in content:
        continue
    has_preflight = (RE_CANONICAL_SOURCE.search(content) or
                     RE_CANONICAL_PREREQ_MD.search(content))
    if has_preflight:
        continue
    violations.append(fname)

if violations:
    print("FAIL:" + ",".join(violations))
else:
    print("OK")
PYEOF
)

  # Casi attesi come FAIL (devono produrre una violazione)
  local expected_fail=("bad_multiline.md" "bad_sameline.md" "bad_bowie.md")
  for f in "${expected_fail[@]}"; do
    if echo "$result" | grep -q "$f"; then
      :  # corretto: rilevato
    else
      echo "❌ SELF-TEST FALLITO — '$f' avrebbe dovuto essere segnalato come violazione ma non lo è stato (falso negativo)"
      fail=1
    fi
  done

  # Casi attesi come OK (NON devono produrre una violazione)
  local expected_ok=("good_preflight.md" "good_source.md" "suppressed.md" "unrelated.md")
  for f in "${expected_ok[@]}"; do
    if echo "$result" | grep -q "$f"; then
      echo "❌ SELF-TEST FALLITO — '$f' NON avrebbe dovuto essere segnalato come violazione ma lo è stato (falso positivo)"
      fail=1
    fi
  done

  return $fail
}

echo "🔬 Self-test interni del gate..."
if run_self_tests; then
  echo "✅ Self-test OK (7/7 fixture corretti)"
else
  echo ""
  echo "💥 Self-test FALLITI — il gate è rotto. Correggere prima di procedere."
  exit 1
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# Check principale — scansione .agents/skills/**/*.md
# ═══════════════════════════════════════════════════════════════════════════════
echo "🔍 check-ai-skill-direct-curl — Skill con curl diretto a OLLAMA_URL senza pre-flight canonico..."

RESULT=$(python3 - << 'PYEOF'
import os
import re

SKILLS_DIR = '.agents/skills'
SUPPRESSION = 'check-ai-skill-direct-curl: safe'

# Le tre variabili che identificano chiamate dirette ai modelli Ollama del TC
OLLAMA_VARS = ('$HORUS_OLLAMA_URL', '$DIAG_OLLAMA_URL', '$BOWIE_OLLAMA_URL')

# Pre-flight canonico: il file sourcia lo script oppure dichiara il Prerequisito
RE_CANONICAL_SOURCE     = re.compile(r'source\s+scripts/ai-agent-access\.sh')
RE_CANONICAL_PREREQ_MD  = re.compile(r'ai-agent-access/SKILL\.md')

# Rileva blocchi fenced (```...```) — consapevole di contenuto multilinea
RE_FENCED_BLOCK = re.compile(r'```[^\n]*\n(.*?)```', re.DOTALL)
RE_CURL         = re.compile(r'\bcurl\b')


def file_has_direct_ollama_curl(content: str) -> bool:
    """
    Restituisce True se almeno un blocco fenced nel file contiene sia
    'curl' sia una delle variabili OLLAMA_URL (anche su righe separate).
    Questo copre sia le chiamate su singola riga sia le chiamate multiline
    con URL su una riga di continuazione (\\ ...).
    """
    for block_match in RE_FENCED_BLOCK.finditer(content):
        block = block_match.group(0)
        if not RE_CURL.search(block):
            continue
        if any(var in block for var in OLLAMA_VARS):
            return True
    return False


violations: list[str] = []

for root, dirs, files in os.walk(SKILLS_DIR):
    # Non scendere in sottodirectory nascoste
    dirs[:] = [d for d in dirs if not d.startswith('.')]
    for fname in files:
        if not fname.endswith('.md'):
            continue
        fpath = os.path.join(root, fname)

        try:
            with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        except OSError:
            continue

        # Ha una chiamata curl diretta a una delle variabili Ollama?
        if not file_has_direct_ollama_curl(content):
            continue

        # È soppresso a livello di file?
        if SUPPRESSION in content:
            continue

        # Ha il pre-flight canonico?
        has_preflight = (
            RE_CANONICAL_SOURCE.search(content)
            or RE_CANONICAL_PREREQ_MD.search(content)
        )
        if has_preflight:
            continue

        # Violazione: ha curl diretto a Ollama, nessun pre-flight, nessuna soppressione.
        # Raccoglie le righe incriminate per il messaggio di errore.
        lines = content.splitlines()
        for lineno, line in enumerate(lines, start=1):
            if any(var in line for var in OLLAMA_VARS) and RE_CURL.search(line):
                # Curl e URL sulla stessa riga
                rel_path = fpath.lstrip('./')
                violations.append(f"{rel_path}:{lineno}: {line.strip()}")
                break
        else:
            # Curl e URL su righe diverse — segnala la prima riga con curl nel blocco
            in_fenced = False
            for lineno, line in enumerate(lines, start=1):
                stripped = line.strip()
                if stripped.startswith('```'):
                    in_fenced = not in_fenced
                    continue
                if in_fenced and RE_CURL.search(line):
                    rel_path = fpath.lstrip('./')
                    violations.append(f"{rel_path}:{lineno}: {line.strip()} [URL su riga separata nel blocco]")
                    break

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
  echo "✅ check-ai-skill-direct-curl OK — Tutte le skill usano il pre-flight canonico."
  exit 0
fi

echo ""
VIOLATIONS=$(echo "$RESULT" | tail -n +2)
while IFS= read -r vline; do
  [ -z "$vline" ] && continue
  echo "❌ TROVATO — $vline"
done <<< "$VIOLATIONS"

echo ""
echo "💥 check-ai-skill-direct-curl FALLITO"
echo ""
echo "   Una skill chiama curl \$HORUS_OLLAMA_URL / \$DIAG_OLLAMA_URL / \$BOWIE_OLLAMA_URL"
echo "   senza il pre-flight canonico (scripts/ai-agent-access.sh)."
echo ""
echo "   Questo salta:"
echo "     • la verifica dei secret non vuoti (ai_check_tc)"
echo "     • gli header Cloudflare Access (CF-Access-Client-Id/Secret)"
echo "     • stream:true obbligatorio (CF taglia connessioni silenziose dopo 100s)"
echo "     • lo strip dei token <think>…</think> di qwen3"
echo ""
echo "   FIX — aggiungere all'inizio della sezione operativa della skill:"
echo ""
echo "     ## Prerequisito: carica \`.agents/skills/ai-agent-access/SKILL.md\`"
echo "     \`\`\`bash"
echo "     source scripts/ai-agent-access.sh"
echo "     STATUS=\$(ai_check_tc)"
echo "     [ \"\$STATUS\" = \"online\" ] || { echo \"TC offline\"; exit 1; }"
echo "     \`\`\`"
echo ""
echo "   Poi sostituire la chiamata curl diretta con ai_call_horus / ai_call_ares."
echo ""
echo "   Soppressione (solo se il bypass è intenzionale e documentato):"
echo "     <!-- check-ai-skill-direct-curl: safe -->"
echo "     (aggiungere nel file .md che viola il check)"
echo ""
echo "   Documentazione: .agents/skills/ai-agent-access/SKILL.md"
exit 1
