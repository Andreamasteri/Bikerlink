#!/usr/bin/env bash
# check-tc-admin-card-tests.sh
#
# Verifica che ogni componente sotto components/admin/ che interroga un
# endpoint /api/admin/thinkcentre-* abbia un file render test corrispondente
# in components/__tests__/<NomeComponente>.render.test.ts
#
# ── Perché questo gate esiste ────────────────────────────────────────────────
# Task #437 ha rilevato che ThinkCentreEfficiencyCard crashava con TypeError
# quando il payload dell'agente TC cambiava shape (nested vs flat).
# Il crash non sarebbe stato catturato prima del rilascio senza un render test
# che coprisse payload malformed.
#
# La regola è semplice: se un componente admin dipende da un endpoint
# /api/admin/thinkcentre-*, il suo render deve essere verificabile in modo
# automatico e il test deve coprire almeno un payload malformed o offline.
#
# ── Come funziona ─────────────────────────────────────────────────────────
# 1. Scansiona components/admin/*.tsx cercando la stringa
#    "/api/admin/thinkcentre-" (fetch diretta o queryKey).
# 2. Per ogni file trovato ricava il nome atteso del test:
#    ThinkCentreEfficiencyCard.tsx → ThinkCentreEfficiencyCard.render.test.ts
# 3. Se il test non esiste ed il file non è nell'allowlist dei gap noti
#    → uscita 1 (gate bloccante).
# 4. I file nell'allowlist emettono solo un WARNING senza bloccare.
#    Aggiungere a KNOWN_GAPS solo componenti pre-esistenti alla regola;
#    ogni nuovo componente deve avere il test oppure questo gate fallisce.
#
# ── Aggiungere un nuovo componente TC ─────────────────────────────────────
# 1. Crea il file components/__tests__/<Nome>.render.test.ts
#    (usa ThinkCentreEfficiencyCard.render.test.ts come riferimento).
# 2. Includi almeno:
#    - un test con payload flat/online valido
#    - un test con payload offline
#    - un test con payload malformed (online:true ma campo chiave mancante)
# 3. NON aggiungere il file a KNOWN_GAPS — la regola esiste per i nuovi file.
#
# ── Soppressione (solo se il componente non renderizza payload TC) ─────────
# Se un file in components/admin/ contiene "/api/admin/thinkcentre-" solo
# per invalidare una query (queryClient.invalidateQueries) senza mai montare
# un componente autonomo che dipende dal payload, aggiungi il commento:
#
#   // check-tc-admin-card-tests: invalidate-only
#
# sulla riga immediatamente prima della stringa (o in cima al file) e il gate
# lo salterà.
#
# ── Gap noti (pre-esistenti alla regola) ─────────────────────────────────
# I file qui sotto non hanno ancora un render test. Sono esentati dal blocco
# perché esistevano prima che questa regola fosse introdotta. Non aggiungere
# nuovi file a questo elenco.

KNOWN_GAPS=(
  "ThinkCentreCard.tsx"
  "ThinkCentreCard.part2.tsx"
  "ThinkCentreSystemMonitor.tsx"
  "AdminStatsCards.tsx"
)

set -euo pipefail

ADMIN_DIR="components/admin"
TESTS_DIR="components/__tests__"
OVERALL_OK=true
WARN_COUNT=0
FAIL_COUNT=0

echo "🔍 check-tc-admin-card-tests — componenti TC admin senza render test..."
echo ""

# Raccogli tutti i file admin che usano /api/admin/thinkcentre-
mapfile -t CANDIDATES < <(
  grep -rl '"/api/admin/thinkcentre-' "${ADMIN_DIR}" 2>/dev/null \
  | grep '\.tsx$' \
  | sort
)

if [[ ${#CANDIDATES[@]} -eq 0 ]]; then
  echo "✅ Nessun componente admin interroga /api/admin/thinkcentre-* (gate OK)."
  exit 0
fi

for filepath in "${CANDIDATES[@]}"; do
  filename="$(basename "${filepath}")"

  # ── Controlla se il file ha il pragma di esenzione inline ────────────────
  if grep -q 'check-tc-admin-card-tests: invalidate-only' "${filepath}" 2>/dev/null; then
    echo "  ⏭  ${filename} — ignorato (invalidate-only pragma)"
    continue
  fi

  # ── Ricava il nome del test atteso ────────────────────────────────────────
  # ThinkCentreEfficiencyCard.tsx → ThinkCentreEfficiencyCard.render.test.ts
  # ThinkCentreCard.part2.tsx     → ThinkCentreCard.part2.render.test.ts
  base="${filename%.tsx}"
  expected_test="${TESTS_DIR}/${base}.render.test.ts"

  if [[ -f "${expected_test}" ]]; then
    echo "  ✅ ${filename} → ${base}.render.test.ts trovato"
    continue
  fi

  # ── Test mancante — controlla se è un gap noto ───────────────────────────
  is_known_gap=false
  for gap in "${KNOWN_GAPS[@]}"; do
    if [[ "${filename}" == "${gap}" ]]; then
      is_known_gap=true
      break
    fi
  done

  if "${is_known_gap}"; then
    echo "  ⚠️  ${filename} — gap noto (pre-esistente alla regola, test mancante)"
    echo "     Atteso: ${expected_test}"
    WARN_COUNT=$((WARN_COUNT + 1))
  else
    echo "  ❌ ${filename} — NUOVO componente TC senza render test!"
    echo "     Atteso: ${expected_test}"
    echo "     → Aggiungi il test o il pragma 'check-tc-admin-card-tests: invalidate-only'."
    FAIL_COUNT=$((FAIL_COUNT + 1))
    OVERALL_OK=false
  fi
done

echo ""
echo "────────────────────────────────────────────"

if [[ ${WARN_COUNT} -gt 0 ]]; then
  echo "⚠️  Gap noti (non bloccanti): ${WARN_COUNT} componente/i pre-esistente/i senza test."
  echo "   Considera di aggiungere i render test mancanti (vedi KNOWN_GAPS in questo script)."
fi

if "${OVERALL_OK}"; then
  echo "✅ check-tc-admin-card-tests: OK (nessun nuovo componente TC senza render test)"
  exit 0
else
  echo "❌ check-tc-admin-card-tests: FALLITO — ${FAIL_COUNT} nuovo/i componente/i TC senza render test."
  echo ""
  echo "   Per ogni componente segnalato devi:"
  echo "   1. Creare components/__tests__/<Nome>.render.test.ts"
  echo "      (usa ThinkCentreEfficiencyCard.render.test.ts come modello)"
  echo "   2. Includere test per: payload valido, payload offline, payload malformed"
  echo "   3. Oppure aggiungere il pragma 'check-tc-admin-card-tests: invalidate-only'"
  echo "      se il file usa /api/admin/thinkcentre-* SOLO per invalidateQueries"
  exit 1
fi
