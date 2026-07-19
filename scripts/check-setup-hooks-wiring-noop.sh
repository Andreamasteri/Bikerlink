#!/usr/bin/env bash
# check-setup-hooks-wiring-noop.sh
#
# Static gate — verifica che il blocco di wiring check in setup-hooks.sh
# (la chiamata a check-pre-commit-hook-wiring.sh + exit 1 on failure) non
# sia stato silenziato con "|| true", "|| :", "|| exit 0" o simili no-op.
#
# Rationale: il test regression #783/#807 verifica il comportamento a runtime,
# ma non può catturare una modifica statica come aggiungere "|| true" alla riga
# della chiamata stessa. Questo gate opera a livello di testo sorgente e fallisce
# appena qualcuno disabilita l'uscita di errore del wiring check.
#
# Usato da: workflow db-migration-checks
# Autore:   agent (task 807)

set -euo pipefail

# TARGET può essere sovrascritta dall'esterno (utile nei test dove la cwd è
# stata rimossa dopo un sandbox cleanup).  Se non è settata, la deriviamo
# dalla radice del repo corrente.
if [ -z "${TARGET:-}" ]; then
  REPO_ROOT="$(git rev-parse --show-toplevel)"
  TARGET="$REPO_ROOT/scripts/setup-hooks.sh"
fi

FAIL=0

echo "🔍 check-setup-hooks-wiring-noop: analisi statica di $TARGET"

# ── Check 1: la chiamata al wiring check NON contiene un no-op fallback ────────
# Cerca la riga che invoca check-pre-commit-hook-wiring.sh e verifica che non
# sia seguita da || true, || :, || exit 0 o qualsiasi || <no-op>.
# Pattern catturati:
#   bash "..." check-pre-commit-hook-wiring.sh" || true
#   if bash "..." || true
#   bash "..." || :
NOOP_PATTERNS=('|| true' '|| :' '||true' '||:' '|| exit 0' '||exit 0')

for pat in "${NOOP_PATTERNS[@]}"; do
  if grep -n "check-pre-commit-hook-wiring\.sh" "$TARGET" | grep -qF "$pat"; then
    echo "❌ FAIL: la chiamata a check-pre-commit-hook-wiring.sh in setup-hooks.sh"
    echo "   contiene il no-op fallback '$pat' — il wiring check è silenziato."
    echo "   Righe incriminate:"
    grep -n "check-pre-commit-hook-wiring\.sh" "$TARGET" | grep -F "$pat" | sed 's/^/     /'
    FAIL=1
  fi
done

if [ "$FAIL" -eq 0 ]; then
  echo "   ✔ Nessun no-op fallback sulla riga della chiamata al wiring check."
fi

# ── Check 2: il blocco else contiene ancora "exit 1" ──────────────────────────
# Estrae le righe che circondano check-pre-commit-hook-wiring.sh (±5 righe) e
# verifica che "exit 1" compaia nel blocco else adiacente.
WIRING_LINE=$(grep -n "check-pre-commit-hook-wiring\.sh" "$TARGET" | head -1 | cut -d: -f1)

if [ -z "$WIRING_LINE" ]; then
  echo "❌ FAIL: check-pre-commit-hook-wiring.sh non trovato in setup-hooks.sh."
  echo "   Il blocco di wiring check potrebbe essere stato rimosso."
  FAIL=1
else
  START=$(( WIRING_LINE - 2 ))
  END=$(( WIRING_LINE + 8 ))
  [ "$START" -lt 1 ] && START=1

  BLOCK=$(sed -n "${START},${END}p" "$TARGET")

  if echo "$BLOCK" | grep -q "exit 1"; then
    echo "   ✔ 'exit 1' presente nel blocco else del wiring check (righe $START-$END)."
  else
    echo "❌ FAIL: 'exit 1' NON trovato nel blocco else del wiring check"
    echo "   (righe $START-$END di setup-hooks.sh)."
    echo "   Blocco estratto:"
    echo "$BLOCK" | sed 's/^/     /'
    FAIL=1
  fi
fi

# ── Check 3: check-pre-commit-hook-wiring.sh esiste ed è eseguibile ───────────
# Se lo script referenziato da setup-hooks.sh venisse rinominato o cancellato,
# bash uscirebbe con exit ≠0 al momento dell'installazione; ma questo errore
# potrebbe passare inosservato in ambienti con shell option lasse.  Questo check
# statico verifica che il file esista sul filesystem prima ancora di eseguire
# l'installazione.
#
# HELPER_SCRIPT può essere sovrascritta dall'esterno (utile nei test).
if [ -z "${HELPER_SCRIPT:-}" ]; then
  REPO_ROOT_FOR_HELPER="$(git rev-parse --show-toplevel 2>/dev/null || dirname "$(dirname "$TARGET")")"
  HELPER_SCRIPT="$REPO_ROOT_FOR_HELPER/scripts/check-pre-commit-hook-wiring.sh"
fi

if [ ! -f "$HELPER_SCRIPT" ]; then
  echo "❌ FAIL: scripts/check-pre-commit-hook-wiring.sh NON trovato su filesystem."
  echo "   Percorso atteso: $HELPER_SCRIPT"
  echo "   Lo script è stato rinominato o cancellato? Ripristinarlo prima di continuare."
  FAIL=1
elif [ ! -x "$HELPER_SCRIPT" ]; then
  echo "❌ FAIL: scripts/check-pre-commit-hook-wiring.sh esiste ma NON è eseguibile."
  echo "   Percorso: $HELPER_SCRIPT"
  echo "   Fix: chmod +x scripts/check-pre-commit-hook-wiring.sh"
  FAIL=1
else
  echo "   ✔ scripts/check-pre-commit-hook-wiring.sh esiste ed è eseguibile."
fi

# ── Check 4: la chiamata a check-setup-hooks-install.test.sh in post-merge.sh ──
# Analogamente a Check 1, verifica che l'invocazione del regression test
# check-setup-hooks-install.test.sh in scripts/post-merge.sh non sia stata
# silenziata con "|| true", "|| :", o simili no-op.
# Se POST_MERGE_TARGET non è settata esternamente, la deriviamo dalla root del
# repo. Per evitare una seconda chiamata a "git rev-parse" (che fallirebbe se
# la cwd è una directory di sandbox già rimossa), riusiamo REPO_ROOT se già
# calcolato, oppure lo deriviamo da TARGET (parent del parent di setup-hooks.sh).
if [ -z "${POST_MERGE_TARGET:-}" ]; then
  if [ -n "${REPO_ROOT:-}" ]; then
    REPO_ROOT_PM="$REPO_ROOT"
  elif [ -n "${TARGET:-}" ]; then
    # TARGET = $REPO_ROOT/scripts/setup-hooks.sh → root = dirname(dirname(TARGET))
    REPO_ROOT_PM="$(dirname "$(dirname "$TARGET")")"
  else
    REPO_ROOT_PM="$(git rev-parse --show-toplevel)"
  fi
  POST_MERGE_TARGET="$REPO_ROOT_PM/scripts/post-merge.sh"
fi

echo ""
echo "🔍 check-setup-hooks-wiring-noop: analisi statica di $POST_MERGE_TARGET"

if [ ! -f "$POST_MERGE_TARGET" ]; then
  echo "❌ FAIL: $POST_MERGE_TARGET non trovato."
  FAIL=1
else
  # Considera solo le righe non-commento (il contenuto dopo "<linenum>:" non inizia con "#").
  # Questo evita falsi positivi da commenti esplicativi che menzionano "|| true".
  for pat in "${NOOP_PATTERNS[@]}"; do
    if grep -n "check-setup-hooks-install\.test\.sh" "$POST_MERGE_TARGET" \
        | grep -v ':[[:space:]]*#' \
        | grep -qF "$pat"; then
      echo "❌ FAIL: la chiamata a check-setup-hooks-install.test.sh in post-merge.sh"
      echo "   contiene il no-op fallback '$pat' — il regression test è silenziato."
      echo "   Righe incriminate:"
      grep -n "check-setup-hooks-install\.test\.sh" "$POST_MERGE_TARGET" \
        | grep -v ':[[:space:]]*#' \
        | grep -F "$pat" | sed 's/^/     /'
      FAIL=1
    fi
  done

  # Verifica anche che la riga (non-commento) esista (non sia stata rimossa del tutto)
  if ! grep -n "check-setup-hooks-install\.test\.sh" "$POST_MERGE_TARGET" \
       | grep -v ':[[:space:]]*#' \
       | grep -q .; then
    echo "❌ FAIL: check-setup-hooks-install.test.sh non trovato (in righe non-commento) in post-merge.sh."
    echo "   Il regression test potrebbe essere stato rimosso."
    FAIL=1
  else
    # Nessun no-op trovato nei loop precedenti — segnala OK
    _PM_FAIL=0
    for pat in "${NOOP_PATTERNS[@]}"; do
      grep -n "check-setup-hooks-install\.test\.sh" "$POST_MERGE_TARGET" \
        | grep -v ':[[:space:]]*#' \
        | grep -qF "$pat" && _PM_FAIL=1
    done
    if [ "$_PM_FAIL" -eq 0 ]; then
      echo "   ✔ Nessun no-op fallback sulla riga della chiamata al regression test in post-merge.sh."
    fi
  fi
fi

# ── Risultato finale ───────────────────────────────────────────────────────────
echo ""
if [ "$FAIL" -ne 0 ]; then
  echo "❌ check-setup-hooks-wiring-noop: FALLITO — il wiring check o il regression test è stato silenziato."
  echo "   Ripristina il blocco originale in scripts/setup-hooks.sh (righe 82-87):"
  echo "     if bash \"\$SCRIPT_DIR/check-pre-commit-hook-wiring.sh\"; then"
  echo "       echo '✅ Wiring verificato ...'"
  echo "     else"
  echo "       echo '❌ Wiring fallito ...'"
  echo "       exit 1"
  echo "     fi"
  echo "   E ripristina la riga in scripts/post-merge.sh:"
  echo "     bash scripts/__tests__/check-setup-hooks-install.test.sh || SETUP_HOOKS_INSTALL_EXIT=\$?"
  exit 1
fi

echo "✅ check-setup-hooks-wiring-noop: OK — il wiring check e il regression test non sono silenziati."
exit 0
