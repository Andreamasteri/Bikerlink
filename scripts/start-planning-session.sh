#!/usr/bin/env bash
# BikerLink — Sessione di pianificazione
#
# Esegue il triage Horus e poi mostra il percorso del report più recente,
# pronto per il planner. Da lanciare prima di ogni sessione di pianificazione.
#
# Uso:
#   bash scripts/start-planning-session.sh
#   bash scripts/start-planning-session.sh --only-internal   # salta GitHub e Sentry
#   bash scripts/start-planning-session.sh --dry-run         # mostra bundle, non chiama Horus

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
LOGS_DIR="$ROOT/logs"

echo "════════════════════════════════════════════════════════════"
echo "  BikerLink — Sessione di pianificazione"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  Passo 1/2: Triage Horus — raccolta fonti e analisi AI"
echo ""

# Passa tutti gli argomenti allo script di triage
npx tsx "$SCRIPT_DIR/log-analysis-horus.ts" "$@"
TRIAGE_EXIT=$?

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Passo 2/2: Report disponibile per il planner"
echo "════════════════════════════════════════════════════════════"
echo ""

# Trova il report più recente
LATEST=$(ls -t "$LOGS_DIR"/horus-log-analysis-*.md 2>/dev/null | head -1 || true)

if [[ -z "$LATEST" ]]; then
  echo "  ⚠  Nessun report trovato in logs/horus-log-analysis-*.md"
  echo "     (il triage potrebbe essere fallito o essere stato lanciato in --dry-run)"
else
  REL="${LATEST#"$ROOT/"}"
  echo "  📄 Report più recente:"
  echo "     $REL"
  echo ""
  echo "  Come usarlo nella sessione di pianificazione:"
  echo "  1. Leggi il report:  cat $REL"
  echo "  2. La sezione '## TASK PROPOSTI DA HORUS' contiene i task suggeriti."
  echo "  3. Valuta quali sono pertinenti rispetto al backlog attuale."
  echo "  4. Proponi all'utente quelli validi — NON crearli automaticamente."
fi

echo ""
echo "════════════════════════════════════════════════════════════"

exit $TRIAGE_EXIT
