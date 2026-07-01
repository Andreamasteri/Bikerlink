#!/usr/bin/env bash
# check-bg-promise-all-burst.sh
#
# Rileva burst `Promise.all` NON budgettati nei job in background/schedulati
# (server/matching/*, server/jobs/*) che possono aprire troppe connessioni
# del pool DB simultaneamente.
#
# Contesto (Task #5323 → #5324, vedi .agents/memory/pool-promise-all-setup-burst.md):
# un `Promise.all([...])` di letture/scritture DB di SETUP a inizio job apre
# N connessioni del pool insieme. Con pool max=10, un singolo job bg che apre
# ~9 conn in parallelo affama il traffico utente (picco di "waiting" che poi
# si azzera). music/bio affinity, archive stale ed enrich-breakdowns sono
# già stati resi sequenziali; questo gate impedisce la regressione futura e
# blocca nuovi job che reintroducono lo stesso pattern.
#
# Cosa segnala (SOLO dentro server/matching/**/*.ts e server/jobs/**/*.ts):
#   1. `Promise.all([a, b, c, ...])` con un array LETTERALE di PIÙ DI 2
#      elementi a livello-top — un burst 2-wide è tollerato (precedente
#      documentato: run-biker.ts, time-profile.ts, coordinator.ts — chiamate
#      cache-friendly o sul path utente, non la causa dei picchi 10-12).
#   2. `Promise.all(<expr>.map(...))` — fan-out su un array DINAMICO — a meno
#      che non sia visibilmente `pLimit`-bounded (una chiamata a `pLimit(`
#      nelle 15 righe precedenti nello stesso file), es. backfill embeddings.
#
# `Promise.allSettled` NON è segnalato: è già "best-effort" (non blocca sul
# fallimento di una singola promise) ed è usato qui solo per probe di rete
# (thinkcentre-monitor-probes.ts), non per connessioni del pool DB.
#
# Soppressione per casi verificati sicuri — commento sulla riga del
# `Promise.all(` o sulla riga precedente:
#   // check-bg-promise-all-burst: safe — <motivo>
#
# Nessuna baseline: al momento della scrittura di questo gate, zero
# occorrenze nel codebase violano queste regole (music/bio/archive/enrich
# già sequenziali, backfill-embeddings già pLimit-bounded). Qualsiasi nuova
# violazione deve essere sequenzializzata, resa pLimit-bounded, o soppressa
# con motivazione esplicita — non c'è una baseline legacy da congelare.

set -euo pipefail

echo "🔍 Controllo burst Promise.all non budgettati in server/matching e server/jobs..."

RESULT=$(python3 - << 'PYEOF'
import os
import re

SCAN_DIRS = ["server/matching", "server/jobs"]
SUPPRESSION = "check-bg-promise-all-burst: safe"

RE_PROMISE_ALL = re.compile(r'\bPromise\.all\(')
RE_PLIMIT = re.compile(r'\bpLimit\(')


def find_call_args(text, paren_start):
    """Dato l'indice subito dopo 'Promise.all(', restituisce (start, end) del
    contenuto dell'argomento (senza le parentesi esterne), tracciando la
    profondità e saltando stringhe/template."""
    n = len(text)
    depth = 1
    i = paren_start
    in_str = None
    while i < n and depth > 0:
        ch = text[i]
        if in_str:
            if ch == '\\':
                i += 2
                continue
            if ch == in_str:
                in_str = None
            i += 1
            continue
        if ch in '"\'`':
            in_str = ch
            i += 1
            continue
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0:
                return paren_start, i
        i += 1
    return None


def top_level_element_count(inner):
    """Conta gli elementi a livello-top dentro un array letterale `[...]`
    (inner = testo TRA le parentesi quadre, senza [ ]), gestendo correttamente
    la trailing comma (es. `[a, b,]` → 2 elementi, non 3)."""
    depth = 0
    in_str = None
    segments = []
    current = []
    i = 0
    n = len(inner)
    while i < n:
        ch = inner[i]
        if in_str:
            if ch == '\\' and i + 1 < n:
                current.append(ch)
                current.append(inner[i + 1])
                i += 2
                continue
            current.append(ch)
            if ch == in_str:
                in_str = None
            i += 1
            continue
        if ch in '"\'`':
            in_str = ch
            current.append(ch)
        elif ch in '([{':
            depth += 1
            current.append(ch)
        elif ch in ')]}':
            depth -= 1
            current.append(ch)
        elif ch == ',' and depth == 0:
            segments.append(''.join(current))
            current = []
        else:
            current.append(ch)
        i += 1
    segments.append(''.join(current))
    return sum(1 for s in segments if s.strip())


violations = []

for base in SCAN_DIRS:
    if not os.path.isdir(base):
        continue
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d != '__tests__' and not d.startswith('.')]
        for fname in sorted(files):
            if not fname.endswith('.ts'):
                continue
            if fname.endswith('.test.ts') or fname.endswith('.spec.ts'):
                continue
            fpath = os.path.join(root, fname)
            try:
                with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                    text = f.read()
            except OSError:
                continue

            if 'Promise.all(' not in text:
                continue

            line_starts = [0]
            for idx, ch in enumerate(text):
                if ch == '\n':
                    line_starts.append(idx + 1)

            def lineno_at(offset):
                lo, hi = 0, len(line_starts) - 1
                while lo < hi:
                    mid = (lo + hi + 1) // 2
                    if line_starts[mid] <= offset:
                        lo = mid
                    else:
                        hi = mid - 1
                return lo

            lines = text.split('\n')

            for m in RE_PROMISE_ALL.finditer(text):
                args = find_call_args(text, m.end())
                if not args:
                    continue
                astart, aend = args
                arg_text = text[astart:aend].strip()

                line0 = lineno_at(m.start())
                lineno = line0 + 1
                line_txt = lines[line0].strip() if line0 < len(lines) else ''

                suppressed = SUPPRESSION in line_txt
                if not suppressed and line0 - 1 >= 0:
                    suppressed = SUPPRESSION in lines[line0 - 1]
                if suppressed:
                    continue

                reason = None
                if arg_text.startswith('['):
                    inner = arg_text[1:-1] if arg_text.endswith(']') else arg_text[1:]
                    elements = top_level_element_count(inner)
                    if elements > 2:
                        reason = f"array letterale con {elements} elementi (>2, non budgettato)"
                elif '.map(' in arg_text:
                    window_start = max(0, m.start() - 800)
                    preceding = text[window_start:m.start()]
                    if not RE_PLIMIT.search(preceding):
                        reason = "fan-out .map() dinamico senza pLimit visibile nelle righe precedenti"

                if reason:
                    violations.append((fpath, lineno, reason, line_txt))

for fpath, lineno, reason, txt in violations:
    print(f"{fpath}\t{lineno}\t{reason}\t{txt}")
PYEOF
)

RESULT_TRIM=$(echo "$RESULT" | grep -vE '^\s*$' || true)

if [ -z "$RESULT_TRIM" ]; then
  echo "✅ Nessun burst Promise.all non budgettato in server/matching o server/jobs."
  exit 0
fi

echo ""
while IFS=$'\t' read -r f l reason txt; do
  [ -z "$f" ] && continue
  echo "❌ $f:$l — $reason"
  echo "     $txt"
done <<< "$RESULT_TRIM"

echo ""
echo "💥 check-bg-promise-all-burst FALLITO"
echo ""
echo "   Un Promise.all non budgettato in un job bg apre più connessioni del"
echo "   pool DB simultaneamente. Con pool max=10, un burst da alcune connessioni"
echo "   affama il traffico utente (picco di 'waiting' intermittente)."
echo ""
echo "   Fix consigliato:"
echo "     - Sequenzializza le letture/scritture di setup (await uno alla volta)."
echo "     - Per fan-out su array dinamici, usa pLimit(N) per limitare la concorrenza."
echo "     - Avvolgi l'intera durata del job in withBgDbSlot() (bg-db-limiter.ts)."
echo ""
echo "   Se il caso è verificato sicuro (es. burst 2-wide cache-friendly, path"
echo "   utente non-schedulato), sopprimi con un commento motivato:"
echo "     // check-bg-promise-all-burst: safe — <motivo>"
echo ""
echo "   Documentazione: .agents/memory/pool-promise-all-setup-burst.md"
echo ""
exit 1
