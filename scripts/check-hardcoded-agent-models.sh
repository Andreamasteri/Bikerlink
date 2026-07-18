#!/usr/bin/env bash
# check-hardcoded-agent-models.sh
#
# Scopo: impedire che i nomi dei modelli Ollama degli agenti BikerLink vengano
# ripristinati come letterali stringa fuori dalla sorgente di verità.
#
# Sorgente di verità: server/lib/agent-constants.ts (AGENT_MODEL_DEFAULTS)
# Ogni altro file che ha bisogno di un default deve importare da lì.
#
# Modelli rilevati (corrisponde alle chiavi di AGENT_MODEL_DEFAULTS):
#   "qwen3:1.7b"      → Bowie
#   "qwen3:4b"        → Horus
#   "granite4:tiny-h" → Quebracho
#   "all-minilm"      → Nadir
#   "devstral:latest" → Ares
#
# File autorizzato:
#   server/lib/agent-constants.ts  — unica fonte di verità, sempre escluso.
#
# Soppressione (per usi legittimi dove l'import non è praticabile):
#   // check-hardcoded-agent-models: ok
# Aggiungere il commento sulla riga immediatamente precedente a quella con il
# letterale stringa. Il commento deve essere sulla riga precedente — non inline.
#
# File e directory esclusi:
#   - node_modules/, .agents/, .local/, .bikerblog-ref/  (dipendenze/cache/ref esterne)
#   - __tests__/, *.test.ts, *.test.tsx                  (i test confrontano nomi nei mock)
#   - *.styles.ts, *.styles.tsx                           (style file, no logic)
#   - agent-constants.ts                                  (sorgente di verità)
#
# Scope: file .ts e .tsx (il server è TypeScript; i file .js del TC sono coperti
# da check-vram-agent-map-drift.ts che già verifica la parity con agent-constants).

set -euo pipefail

RESULT=$(python3 - << 'PYEOF'
import os
import re

IGNORE_DIRS = {
    'node_modules', '.agents', '.local', '.bikerblog-ref',
    '__tests__', 'dist', 'server_dist', 'dist-ota-env',
}

# Il file sorgente di verità — sempre escluso.
TRUTH_FILE = os.path.join('server', 'lib', 'agent-constants.ts')

# Commento di soppressione da mettere sulla riga PRECEDENTE al letterale.
SUPPRESSION = 'check-hardcoded-agent-models: ok'

# Letterali da rilevare — corrispondono ai valori in AGENT_MODEL_DEFAULTS.
# Usiamo pattern con word-boundary (\b non funziona su ':' quindi usiamo lookahead/lookbehind).
PATTERNS = [
    re.compile(r'"qwen3:1\.7b"'),
    re.compile(r'"qwen3:4b"'),
    re.compile(r'"granite4:tiny-h"'),
    re.compile(r'"all-minilm"'),
    re.compile(r'"devstral:latest"'),
]

# Regex per riconoscere le righe che sono puramente commenti TypeScript/TSX.
# Una riga è "solo commento" se, dopo aver rimosso lo spazio iniziale, inizia con // o *.
RE_COMMENT_LINE = re.compile(r'^\s*(?://|\*)')

violations = []

for root, dirs, files in os.walk('.'):
    # Filtra dir da ignorare (modifica in-place per os.walk)
    dirs[:] = [
        d for d in dirs
        if d not in IGNORE_DIRS and not d.startswith('.')
    ]

    for fname in files:
        # Solo .ts e .tsx
        if not (fname.endswith('.ts') or fname.endswith('.tsx')):
            continue
        # Salta test e style file
        if fname.endswith('.test.ts') or fname.endswith('.test.tsx'):
            continue
        if fname.endswith('.styles.ts') or fname.endswith('.styles.tsx'):
            continue

        fpath = os.path.join(root, fname).lstrip('./')
        fpath = fpath.replace('\\', '/')

        # Salta la sorgente di verità
        if fpath == TRUTH_FILE or fpath.endswith('/' + os.path.basename(TRUTH_FILE)):
            continue
        # Salta __tests__ ovunque nel path
        if '__tests__' in fpath:
            continue

        try:
            with open(os.path.join(root, fname), 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
        except OSError:
            continue

        for i, line in enumerate(lines):
            # Salta righe che sono puramente commento
            if RE_COMMENT_LINE.match(line):
                continue

            # Controlla se la riga contiene uno dei pattern target
            matched = any(pat.search(line) for pat in PATTERNS)
            if not matched:
                continue

            # Controlla la soppressione sulla riga precedente
            if i > 0 and SUPPRESSION in lines[i - 1]:
                continue

            # Controlla la soppressione inline (stesso rigo)
            if SUPPRESSION in line:
                continue

            violations.append(f"{fpath}:{i + 1}: {line.rstrip()}")

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
  echo "✅ check-hardcoded-agent-models OK — nessun nome modello hardcoded fuori da agent-constants.ts."
  exit 0
fi

# Fallimento
VIOLATIONS=$(echo "$RESULT" | tail -n +2)
echo ""
while IFS= read -r vline; do
  [ -z "$vline" ] && continue
  echo "❌ TROVATO — $vline"
done <<< "$VIOLATIONS"
echo ""
echo "💥 check-hardcoded-agent-models FALLITO"
echo ""
echo "   I nomi dei modelli Ollama (qwen3:1.7b, qwen3:4b, granite4:tiny-h,"
echo "   all-minilm, devstral:latest) non devono comparire come letterali stringa"
echo "   fuori da server/lib/agent-constants.ts."
echo ""
echo "   FIX — importa il default da agent-constants:"
echo "     import { AGENT_MODEL_DEFAULTS } from \"../lib/agent-constants\";"
echo "     const model = process.env.BOWIE_OLLAMA_MODEL?.trim() || AGENT_MODEL_DEFAULTS.bowie;"
echo ""
echo "   Soppressione (solo se l'import non è praticabile, es. script JS standalone):"
echo "     // check-hardcoded-agent-models: ok"
echo "     const DEFAULT_MODEL = \"qwen3:4b\";"
echo ""
echo "   Sorgente di verità: server/lib/agent-constants.ts (AGENT_MODEL_DEFAULTS)"
exit 1
