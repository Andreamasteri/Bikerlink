#!/usr/bin/env bash
# check-mutation-object-deps.sh
#
# Rileva il pattern pericoloso: l'OGGETTO-mutation INTERO di React Query
# (una variabile `*Mutation`) usato come dipendenza in un array di deps di
# useCallback o useMemo.
#
# Perché è pericoloso:
#   const saveMutation = useMutation(...);
#   const onPress = useCallback(() => saveMutation.mutate(id), [saveMutation]);
#                                                              ^^^^^^^^^^^^^^^
#   L'oggetto-mutation cambia riferimento ad ogni transizione di stato
#   (idle → pending → success) e spesso ad ogni render. Se `onPress` (o un
#   altro handler) è chiuso dentro un `renderItem` di una FlatList che fa
#   refetch su un tick, l'intera lista — e ogni riga — viene ricreata ad ogni
#   ciclo. È un problema di performance reale (liste che "tornano a
#   ridisegnarsi" toccando un pulsante), già ripulito a mano nei task #5038 e
#   #5039.
#
# Fix (vedi .agents/memory/react-query-mutation-ref-deps.md):
#   Tieni la mutation in un ref e chiama attraverso di esso, mettendo nei deps
#   solo le slice primitive che influenzano l'output:
#     const mRef = useRef(saveMutation);
#     mRef.current = saveMutation;
#     const onPress = useCallback(() => mRef.current.mutate(id), [id]);
#
# Cosa è CONSENTITO nei deps (NON segnalato):
#   - `saveMutation.mutate`      (metodo referenzialmente stabile in v5)
#   - `saveMutation.isPending`   (slice primitiva di stato)
#   - `saveMutation.<altro>`     (qualsiasi accesso a membro → slice, non oggetto)
#   - `saveMutationRef`          (il ref, non l'oggetto)
#
# Cosa è VIETATO (segnalato):
#   - `saveMutation`             (l'oggetto-mutation INTERO come dep)
#
# ── RATCHET / BASELINE ───────────────────────────────────────────────────────
# Il codebase contiene già alcune occorrenze legacy (handler di pulsanti one-off
# NON in renderItem di FlatList, fuori dallo scope di #5038/#5039). Sono
# congelate in `.mutation-object-deps-baseline`. Il gate FALLISCE solo su
# occorrenze NUOVE (non in baseline) — così nessun nuovo screen FlatList può
# reintrodurre il pattern. Le voci legacy possono solo diminuire.
#
# Aggiornare la baseline è un'azione UMANA esplicita:
#   BIKERLINK_HUMAN_BASELINE_UPDATE=1 bash scripts/check-mutation-object-deps.sh --update-baseline
#
# Soppressione per falsi positivi puntuali verificati:
#   Aggiungere il commento  // check-mutation-object-deps: safe
#   sulla stessa riga o sulla riga precedente al deps array incriminato.

set -euo pipefail

BASELINE_FILE=".mutation-object-deps-baseline"

UPDATE_BASELINE=0
for arg in "$@"; do
  if [[ "$arg" == "--update-baseline" ]]; then
    UPDATE_BASELINE=1
  fi
done

if [ "$UPDATE_BASELINE" -eq 1 ] && [ "${BIKERLINK_HUMAN_BASELINE_UPDATE:-}" != "1" ]; then
  echo "❌ Solo l'utente può aggiornare la baseline. Esegui:"
  echo "   BIKERLINK_HUMAN_BASELINE_UPDATE=1 bash scripts/check-mutation-object-deps.sh --update-baseline"
  exit 1
fi

echo "🔍 Controllo oggetti-mutation interi nei deps di useCallback / useMemo..."

# Python emette un record per occorrenza nel formato:
#   <path>\t<token>\t<lineno>\t<testo riga>
RESULT=$(python3 - << 'PYEOF'
import os
import re

IGNORE_DIRS = {'.local', '.agents', 'node_modules', 'scripts', '__tests__'}
SUPPRESSION = 'check-mutation-object-deps: safe'

# useMemo / useCallback (solo il nome). La '(' di apertura della call viene
# individuata da call_paren_after(), che salta un eventuale type-parameter
# generico — anche con tipi-funzione al suo interno, es.
# useCallback<() => void>(...) / useMemo<Map<string, () => void>>(...).
RE_HOOK_NAME = re.compile(r'\b(useMemo|useCallback)\b')


def call_paren_after(text, pos):
    """Dato l'indice subito dopo il nome del hook, salta whitespace ed un
    eventuale type-parameter generico bilanciato <...> (riconoscendo `=>` come
    freccia, non come `>` di chiusura) e restituisce l'indice SUBITO DOPO la
    '(' di apertura della call. Restituisce None se non è una chiamata."""
    n = len(text)
    i = pos
    while i < n and text[i].isspace():
        i += 1
    if i < n and text[i] == '<':
        adepth = 0
        while i < n:
            c = text[i]
            if c == '<':
                adepth += 1
            elif c == '>' and (i == 0 or text[i - 1] != '='):
                adepth -= 1
                if adepth == 0:
                    i += 1
                    break
            i += 1
        while i < n and text[i].isspace():
            i += 1
    if i < n and text[i] == '(':
        return i + 1
    return None

# Token mutation "intero": un identificatore che termina in `Mutation`,
# NON preceduto da word-char / $ / `.` (così non cattura accessi a membro né
# parti di identificatori più lunghi) e NON seguito da word-char / $ / `.`
# né da `?.` (optional chaining). Esclude quindi `*MutationRef`, `*Mutations`,
# `*Mutation.mutate`, `*Mutation.isPending`, `*Mutation?.mutate`, ecc.
RE_MUTATION_BARE = re.compile(r'(?<![\w$.])[A-Za-z_$][\w$]*Mutation(?![\w$.]|\?\.)')

# Rimozione commenti di linea // e blocchi /* */ dal contenuto dei deps
# (evita falsi positivi se un commento contiene la parola "Mutation").
RE_LINE_COMMENT = re.compile(r'//[^\n]*')
RE_BLOCK_COMMENT = re.compile(r'/\*.*?\*/', re.DOTALL)


def find_deps_bracket(text, paren_start):
    """A partire dalla '(' di apertura del hook (indice del char DOPO '('),
    scorre l'argomento della call tracciando la profondità delle parentesi e
    restituisce (start, end) dell'ULTIMO array `[...]` a livello-top
    dell'argomento — ovvero l'array dei deps. Salta stringhe e template.
    Restituisce None se non trovato."""
    n = len(text)
    depth = 1            # siamo dentro la '(' del hook
    i = paren_start
    in_str = None
    last_bracket = None
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
        elif ch == '[' and depth == 1:
            # Array a livello-top dell'argomento → candidato deps.
            bstart = i
            bdepth = 1
            j = i + 1
            in_str2 = None
            while j < n and bdepth > 0:
                cj = text[j]
                if in_str2:
                    if cj == '\\':
                        j += 2
                        continue
                    if cj == in_str2:
                        in_str2 = None
                    j += 1
                    continue
                if cj in '"\'`':
                    in_str2 = cj
                elif cj == '[':
                    bdepth += 1
                elif cj == ']':
                    bdepth -= 1
                j += 1
            last_bracket = (bstart, j)   # j = indice DOPO il ']' di chiusura
            i = j
            continue
        i += 1
    return last_bracket


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
                text = f.read()
        except OSError:
            continue

        if 'Mutation' not in text:
            continue   # pre-filtro veloce

        # Offset di inizio di ogni riga per risalire al numero di riga.
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
            return lo  # 0-based

        lines = text.split('\n')

        for m in RE_HOOK_NAME.finditer(text):
            paren_start = call_paren_after(text, m.end())
            if paren_start is None:
                continue
            bracket = find_deps_bracket(text, paren_start)
            if not bracket:
                continue
            bstart, bend = bracket
            deps_raw = text[bstart + 1:bend - 1]
            deps_clean = RE_BLOCK_COMMENT.sub(' ', deps_raw)
            deps_clean = RE_LINE_COMMENT.sub('', deps_clean)

            seen_tokens = set()
            for mut in RE_MUTATION_BARE.finditer(deps_clean):
                token = mut.group(0)
                if token in seen_tokens:
                    continue
                seen_tokens.add(token)

                dep_line0 = lineno_at(bstart)
                dep_lineno = dep_line0 + 1
                dep_line_txt = lines[dep_line0].strip() if dep_line0 < len(lines) else ''

                suppressed = False
                if dep_line0 < len(lines) and SUPPRESSION in lines[dep_line0]:
                    suppressed = True
                elif dep_line0 - 1 >= 0 and SUPPRESSION in lines[dep_line0 - 1]:
                    suppressed = True
                if suppressed:
                    continue

                violations.append((fpath, token, dep_lineno, dep_line_txt))

for fpath, token, lineno, txt in violations:
    print(f"{fpath}\t{token}\t{lineno}\t{txt}")
PYEOF
)

# ── Modalità --update-baseline (umana) ───────────────────────────────────────
if [ "$UPDATE_BASELINE" -eq 1 ]; then
  {
    echo "# .mutation-object-deps-baseline"
    echo "# Occorrenze legacy congelate dell'oggetto-mutation intero nei deps di"
    echo "# useCallback/useMemo. Il gate (scripts/check-mutation-object-deps.sh)"
    echo "# fallisce solo su occorrenze NUOVE non elencate qui."
    echo "# Formato (un record per riga):  <path>\\t<token>"
    echo "# Aggiornare SOLO via:"
    echo "#   BIKERLINK_HUMAN_BASELINE_UPDATE=1 bash scripts/check-mutation-object-deps.sh --update-baseline"
    if [ -n "$RESULT" ]; then
      echo "$RESULT" | awk -F'\t' '{print $1"\t"$2}' | sort -u
    fi
  } > "$BASELINE_FILE"
  COUNT=$(echo "$RESULT" | grep -c . || true)
  echo "✅ Baseline aggiornata: $BASELINE_FILE ($COUNT occorrenze legacy congelate)."
  exit 0
fi

# ── Carica baseline (set di chiavi path\ttoken) ──────────────────────────────
BASELINE_KEYS=""
if [ -f "$BASELINE_FILE" ]; then
  BASELINE_KEYS=$(grep -vE '^\s*#' "$BASELINE_FILE" 2>/dev/null | grep -vE '^\s*$' | sort -u || true)
fi

# Chiavi correnti (path\ttoken) e mappa per il display.
CURRENT_KEYS=""
if [ -n "$RESULT" ]; then
  CURRENT_KEYS=$(echo "$RESULT" | awk -F'\t' '{print $1"\t"$2}' | sort -u)
fi

# Occorrenze NUOVE = correnti ∉ baseline.
NEW_KEYS=$(comm -23 <(echo "$CURRENT_KEYS") <(echo "$BASELINE_KEYS") 2>/dev/null || true)
# Voci baseline non più presenti (la baseline può solo restringersi).
STALE_KEYS=$(comm -13 <(echo "$CURRENT_KEYS") <(echo "$BASELINE_KEYS") 2>/dev/null || true)

# Avviso non-bloccante per voci baseline ora risolte.
STALE_KEYS_TRIM=$(echo "$STALE_KEYS" | grep -vE '^\s*$' || true)
if [ -n "$STALE_KEYS_TRIM" ]; then
  echo ""
  echo "ℹ️  Voci di baseline non più presenti (risolte) — la baseline può restringersi:"
  echo "$STALE_KEYS_TRIM" | sed 's/^/   ✔ /'
  echo "   Aggiorna con: BIKERLINK_HUMAN_BASELINE_UPDATE=1 bash scripts/check-mutation-object-deps.sh --update-baseline"
fi

NEW_KEYS_TRIM=$(echo "$NEW_KEYS" | grep -vE '^\s*$' || true)
if [ -z "$NEW_KEYS_TRIM" ]; then
  echo "✅ Nessuna NUOVA occorrenza di oggetto-mutation intero nei deps (baseline rispettata)."
  exit 0
fi

echo ""
# Per ogni chiave nuova, mostra la riga/testo dal RESULT completo.
while IFS=$'\t' read -r nf nt; do
  [ -z "$nf" ] && continue
  MATCH=$(echo "$RESULT" | awk -F'\t' -v f="$nf" -v t="$nt" '$1==f && $2==t {print $1":"$3": ["$2"]  "$4; exit}')
  echo "❌ NUOVO — ${MATCH:-$nf  [$nt]}"
done <<< "$NEW_KEYS_TRIM"

echo ""
echo "💥 check-mutation-object-deps FALLITO"
echo ""
echo "   Un oggetto-mutation INTERO (variabile *Mutation) nei deps di"
echo "   useCallback/useMemo cambia riferimento ad ogni transizione di stato"
echo "   (idle→pending→success) e spesso ad ogni render. Se l'handler è usato"
echo "   in un renderItem di FlatList, l'intera lista si ridisegna ad ogni"
echo "   azione utente / tick di refetch."
echo ""
echo "   Esempio del problema:"
echo "     const onPress = useCallback(() => saveMutation.mutate(id), [saveMutation]);"
echo "                                                                ^^^^^^^^^^^^^^^"
echo ""
echo "   Fix consigliato — tieni la mutation in un ref, deps = solo slice primitive:"
echo "     const mRef = useRef(saveMutation);"
echo "     mRef.current = saveMutation;"
echo "     const onPress = useCallback(() => mRef.current.mutate(id), [id]);"
echo ""
echo "   Consentito nei deps (NON segnalato):"
echo "     saveMutation.mutate · saveMutation.isPending · saveMutationRef"
echo ""
echo "   Se il caso è verificato sicuro, sopprimere con il commento sulla riga"
echo "   del deps array (o su quella precedente):"
echo "     // check-mutation-object-deps: safe — <motivo>"
echo ""
echo "   Documentazione: .agents/memory/react-query-mutation-ref-deps.md"
echo ""
exit 1
