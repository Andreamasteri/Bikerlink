#!/usr/bin/env bash
# ci-secrets-scan.sh — gate anti-segreti condiviso da CI e validation step.
#
# Esegue `detect-secrets-hook --baseline .secrets.baseline` e fallisce
# (exit != 0) se trova segreti non presenti nella baseline approvata.
# È la versione "sempre in CI" del pre-commit hook (scripts/pre-commit):
# garantisce il gate anche se il contributore non ha installato l'hook locale.
#
# Modalità:
#   bash scripts/ci-secrets-scan.sh            # scansiona solo i file modificati
#                                              # (rispetto a main / merge-base) — veloce
#   bash scripts/ci-secrets-scan.sh --all      # scansiona TUTTI i file tracciati — completo
#
# Bypass falsi positivi: '# pragma: allowlist secret' sulla riga, oppure
# aggiorna .secrets.baseline (vedi CONTRIBUTING.md).

set -euo pipefail

BASELINE=".secrets.baseline"
MODE="changed"
if [[ "${1:-}" == "--all" ]]; then
  MODE="all"
fi

# Stessa lista di esclusioni del pre-commit hook, per coerenza.
EXCLUDE_RE='(node_modules|\.expo|server_dist|static-build|dist-ota|\.git/|\.secrets\.baseline|package-lock\.json|yarn\.lock)'

# --- Risoluzione del binario detect-secrets-hook (fail-closed) -------------
DETECT_SECRETS_HOOK=""
for candidate in \
  "$(command -v detect-secrets-hook 2>/dev/null || true)" \
  "$HOME/.local/bin/detect-secrets-hook" \
  "/home/runner/workspace/.pythonlibs/bin/detect-secrets-hook" \
  "/usr/local/bin/detect-secrets-hook"; do
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    DETECT_SECRETS_HOOK="$candidate"
    break
  fi
done

# Fallback: detect-secrets è in pyproject.toml → eseguibile via `uv run`.
RUNNER=()
if [[ -n "$DETECT_SECRETS_HOOK" ]]; then
  RUNNER=("$DETECT_SECRETS_HOOK")
elif command -v uv >/dev/null 2>&1; then
  RUNNER=(uv run detect-secrets-hook)
else
  echo ""
  echo "❌ SCANSIONE BLOCCATA — detect-secrets non trovato."
  echo "   Installa con: pip install detect-secrets==1.5.0"
  echo "   (oppure assicurati che 'uv' sia disponibile: il pacchetto è in pyproject.toml)"
  exit 1
fi

if [[ ! -f "$BASELINE" ]]; then
  echo "❌ SCANSIONE BLOCCATA — baseline '$BASELINE' mancante."
  echo "   Generala con: detect-secrets scan > $BASELINE"
  exit 1
fi

# --- Raccolta dei file da scansionare -------------------------------------
declare -a FILES=()

if [[ "$MODE" == "all" ]]; then
  mapfile -t FILES < <(git ls-files | grep -Ev "$EXCLUDE_RE" || true)
  echo "🔍 detect-secrets: scansione COMPLETA (${#FILES[@]} file tracciati)..."
else
  # Determina il punto di base: merge-base con main (o ref upstream noti).
  BASE_REF=""
  for ref in main origin/main gitsafe-backup/main; do
    if git rev-parse --verify --quiet "$ref" >/dev/null 2>&1; then
      BASE_REF="$ref"
      break
    fi
  done

  if [[ -z "$BASE_REF" ]]; then
    # Nessun ref di base affidabile → fallback alla scansione completa.
    echo "ℹ️  Nessun ref di base (main) trovato — fallback a scansione completa."
    mapfile -t FILES < <(git ls-files | grep -Ev "$EXCLUDE_RE" || true)
  else
    MERGE_BASE="$(git merge-base HEAD "$BASE_REF" 2>/dev/null || echo "$BASE_REF")"
    # File modificati: commit del branch + working tree + staging.
    mapfile -t FILES < <(
      {
        git diff --name-only --diff-filter=ACM "$MERGE_BASE" HEAD 2>/dev/null || true
        git diff --name-only --diff-filter=ACM 2>/dev/null || true
        git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true
      } | sort -u | grep -Ev "$EXCLUDE_RE" || true
    )
    echo "🔍 detect-secrets: scansione file modificati vs '$BASE_REF' (${#FILES[@]} file)..."
  fi
fi

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "✅ Nessun file da scansionare — gate segreti OK."
  exit 0
fi

# --- Esecuzione del gate ---------------------------------------------------
if "${RUNNER[@]}" --baseline "$BASELINE" "${FILES[@]}"; then
  echo "✅ Nessun segreto non approvato rilevato — gate segreti OK."
  exit 0
else
  echo ""
  echo "❌ GATE BLOCCATO — possibili segreti non approvati rilevati."
  echo ""
  echo "   Soluzioni:"
  echo "   1. Rimuovi il segreto dal file (raccomandato)."
  echo "   2. Credenziale fittizia in un test/fixture? Aggiungi sulla riga:"
  echo "        # pragma: allowlist secret"
  echo "      Funziona in qualsiasi linguaggio con commenti # o //."
  echo "   3. Falso positivo in un file non-test? Approva nella baseline:"
  echo "        detect-secrets scan --no-verify > .secrets.baseline"
  echo "        detect-secrets audit .secrets.baseline"
  echo "        git add .secrets.baseline"
  echo "   Consulta CONTRIBUTING.md §'Test fixture e credenziali placeholder'"
  echo "   per la procedura completa e le istruzioni sul pragma."
  exit 1
fi
