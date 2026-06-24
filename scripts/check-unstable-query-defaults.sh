#!/usr/bin/env bash
# check-unstable-query-defaults.sh
#
# Rileva il pattern pericoloso: useQuery con default inline `= []` o `= {}`
# quando quella variabile finisce nei deps di useEffect.
#
# Perché è pericoloso:
#   const { data: items = [] } = useQuery(...)
#   useEffect(() => { ... }, [items]);   // ← LOOP INFINITO
#
#   Quando `data` è undefined (loading), `items` riceve un nuovo `[]` ad ogni render.
#   React confronta i deps con Object.is → [] !== [] → useEffect scatta ad ogni render.
#   Se dentro c'è un setState o un invalidate, il ciclo diventa infinito
#   ("Maximum update depth exceeded").
#
# Caso reale: OTA 166 — crash di MusicRadioTab.tsx causato da suggestedGenreIds = [].
#   Fix applicato: rimosso il default inline, gestito `undefined` esplicitamente.
#
# Soppressione per falsi positivi verificati:
#   Aggiungere il commento nel file: // check-unstable-query-defaults: safe
#   con una spiegazione del perché il pattern è sicuro in quel contesto.
#
# Vedi: .agents/memory/ota-publish-pipeline.md (OTA 166 crash note)

set -euo pipefail

FAIL=0

EXCLUDE_FLAGS=(
  --glob '!node_modules/**'
  --glob '!.local/**'
  --glob '!.agents/**'
  --glob '!scripts/**'
  --glob '!*.test.ts'
  --glob '!*.test.tsx'
  --glob '!*.spec.ts'
  --glob '!*.spec.tsx'
)

echo "🔍 Controllo useQuery default instabili (= [] / = {}) in deps di useEffect..."

# Trova tutti i file con il pattern data: VAR = [] o data: VAR = {}
while IFS= read -r file; do

  # Soppressione esplicita: file verificato sicuro
  if rg -q 'check-unstable-query-defaults:\s*safe' "$file" 2>/dev/null; then
    echo "   ⚪ skip (safe): $file"
    continue
  fi

  # Ottimizzazione: salta se il file non ha useEffect
  if ! rg -q '\buseEffect\b' "$file" 2>/dev/null; then
    continue
  fi

  # Estrai i nomi delle variabili con default instabile
  while IFS= read -r varname; do
    [ -z "$varname" ] && continue

    # Pattern 1 — deps su una sola riga: }, [... VAR ...]
    # Es: }, [items, otherDep]);
    if rg -q "},\s*\[[^\]]*\b${varname}\b[^\]]*\]" "$file" 2>/dev/null; then
      echo ""
      echo "❌ TROVATO — ${file}"
      echo "   variabile: ${varname}"
      echo "   useQuery inline default '= []' o '= {}' usato nei deps di useEffect"
      rg -n "data:\s*${varname}\s*=" "$file" 2>/dev/null | head -3 | sed 's/^/   /'
      rg -n "},\s*\[[^\]]*\b${varname}\b[^\]]*\]" "$file" 2>/dev/null | head -3 | sed 's/^/   /'
      FAIL=1
      continue
    fi

    # Pattern 2 — deps multi-riga: la variabile è su riga propria nell'array deps
    # Es:
    #   }, [
    #     VAR,
    #     otherDep,
    #   ]);
    # Usa rg -U (multiline) per cercare "}, [\n ... VAR"
    if rg -Uq "},\s*\[\s*\n([^\]]*\n)*\s*\b${varname}\b" "$file" 2>/dev/null; then
      echo ""
      echo "❌ TROVATO — ${file}"
      echo "   variabile: ${varname}"
      echo "   useQuery inline default '= []' o '= {}' usato nei deps di useEffect (multi-riga)"
      rg -n "data:\s*${varname}\s*=" "$file" 2>/dev/null | head -3 | sed 's/^/   /'
      FAIL=1
      continue
    fi

  done < <(rg 'data:\s*(\w+)\s*=\s*(\[\]|\{\})' --only-matching -r '$1' "$file" 2>/dev/null | sort -u)

done < <(rg 'data:\s*\w+\s*=\s*(\[\]|\{\})' \
  --type-add 'tsx:*.tsx' --type tsx --type ts \
  "${EXCLUDE_FLAGS[@]}" -l 2>/dev/null)

echo ""
if [ $FAIL -eq 1 ]; then
  echo "💥 check-unstable-query-defaults FALLITO"
  echo ""
  echo "   I default inline '= []' / '= {}' in useQuery creano un nuovo riferimento"
  echo "   ad ogni render quando data è undefined (stato loading). Se il valore"
  echo "   finisce nei deps di useEffect, React lo vede sempre cambiato → loop infinito."
  echo ""
  echo "   Fix consigliato (opzione A — rimuovi il default):"
  echo "     const { data } = useQuery<T[]>({...})"
  echo "     const items = data ?? []   // stabile: data è memoizzata da React Query"
  echo ""
  echo "   Fix consigliato (opzione B — useMemo):"
  echo "     const { data: rawItems } = useQuery<T[]>({...})"
  echo "     const items = useMemo(() => rawItems ?? [], [rawItems])"
  echo "     useEffect(() => { ... }, [items])   // items è ora stabile"
  echo ""
  echo "   Se il pattern è verificato sicuro (nessuna modifica stato nell'effect):"
  echo "     aggiungere nel file: // check-unstable-query-defaults: safe — <motivo>"
  exit 1
else
  echo "✅ Nessun useQuery default instabile (= [] / = {}) trovato in deps di useEffect."
fi
