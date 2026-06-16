#!/usr/bin/env bash
# =============================================================================
# BikerLink — setup-pulla-cron.sh
# Installa un cron job notturno per eseguire pulla.sh --restart sul ThinkCentre.
#
# Cosa fa (idempotente — puoi rieseguirlo senza duplicare il job):
#   1. Rileva automaticamente il percorso assoluto di pulla.sh (dalla root del repo).
#   2. Rimuove l'eventuale voce cron precedente per pulla.sh.
#   3. Aggiunge la nuova voce cron per l'ora configurata.
#   4. Verifica che il job sia stato installato correttamente.
#
# Utilizzo:
#   bash scripts/setup-pulla-cron.sh
#
# Override opzionali (variabili d'ambiente):
#   PULLA_CRON_HOUR=<0-23>    Ora di esecuzione (default: 3)
#   PULLA_CRON_MINUTE=<0-59>  Minuto di esecuzione (default: 0)
#   PULLA_CRON_USER=<user>    Utente il cui crontab viene modificato
#                              (default: utente corrente).
#                              Richiede privilegi root per un utente diverso.
#   PULLA_LOG=/path/to.log    File di log (default: /tmp/pulla.log)
#
# Esempi:
#   bash scripts/setup-pulla-cron.sh                  # alle 03:00 (default)
#   PULLA_CRON_HOUR=2 PULLA_CRON_MINUTE=30 bash scripts/setup-pulla-cron.sh
#   PULLA_CRON_USER=andrea bash scripts/setup-pulla-cron.sh
# =============================================================================

set -euo pipefail

# ── Configurazione (override via env) ─────────────────────────────────────────
PULLA_CRON_HOUR="${PULLA_CRON_HOUR:-3}"
PULLA_CRON_MINUTE="${PULLA_CRON_MINUTE:-0}"
PULLA_CRON_USER="${PULLA_CRON_USER:-}"
PULLA_LOG="${PULLA_LOG:-/tmp/pulla.log}"

# ── Logging colorato ──────────────────────────────────────────────────────────
log()  { echo -e "\033[1;34m[CRON-SETUP]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[ OK  ]\033[0m $*"; }
warn() { echo -e "\033[1;33m[WARN ]\033[0m $*"; }
err()  { echo -e "\033[1;31m[FAIL ]\033[0m $*" >&2; }
die()  { err "$*"; exit 1; }

echo "============================================================"
echo "BikerLink — setup-pulla-cron.sh (ThinkCentre)"
echo "$(date)"
echo "============================================================"
echo ""

# ── Validazione parametri ─────────────────────────────────────────────────────
# Normalizza a base-10 (rimuove zeri iniziali es. "03" → 3) per accettare
# sia "3" che "03" come input validi dall'operatore.
PULLA_CRON_HOUR=$(( 10#${PULLA_CRON_HOUR} ))
PULLA_CRON_MINUTE=$(( 10#${PULLA_CRON_MINUTE} ))

if (( PULLA_CRON_HOUR < 0 || PULLA_CRON_HOUR > 23 )); then
  die "PULLA_CRON_HOUR non valido: '${PULLA_CRON_HOUR}' — deve essere un numero tra 0 e 23."
fi
if (( PULLA_CRON_MINUTE < 0 || PULLA_CRON_MINUTE > 59 )); then
  die "PULLA_CRON_MINUTE non valido: '${PULLA_CRON_MINUTE}' — deve essere un numero tra 0 e 59."
fi

# ── Rilevamento percorso assoluto di pulla.sh ─────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PULLA_SCRIPT="${SCRIPT_DIR}/pulla.sh"

if [[ ! -f "$PULLA_SCRIPT" ]]; then
  die "pulla.sh non trovato in: ${PULLA_SCRIPT}"
fi
if [[ ! -x "$PULLA_SCRIPT" ]]; then
  warn "pulla.sh non è eseguibile — aggiungo il permesso..."
  chmod +x "$PULLA_SCRIPT"
  ok "chmod +x applicato: ${PULLA_SCRIPT}"
fi

log "Script target: ${PULLA_SCRIPT}"
log "Log file:      ${PULLA_LOG}"
log "Orario cron:   ${PULLA_CRON_MINUTE} ${PULLA_CRON_HOUR} * * * (ogni notte alle $(printf '%02d:%02d' "$PULLA_CRON_HOUR" "$PULLA_CRON_MINUTE"))"
echo ""

# ── Identifica il crontab target ──────────────────────────────────────────────
# Se PULLA_CRON_USER è vuoto → usa il crontab dell'utente corrente.
# Se PULLA_CRON_USER è impostato → usa -u <user> (richiede root).
CRONTAB_CMD="crontab"
CRONTAB_ARGS=()

if [[ -n "$PULLA_CRON_USER" ]]; then
  if [[ "$(id -u)" -ne 0 ]]; then
    die "PULLA_CRON_USER='${PULLA_CRON_USER}' richiede privilegi root. Riesegui con sudo o come root."
  fi
  CRONTAB_ARGS=("-u" "$PULLA_CRON_USER")
  log "Crontab target: utente '${PULLA_CRON_USER}'"
else
  log "Crontab target: utente corrente ('$(id -un)')"
fi

# ── Recupera il crontab esistente ─────────────────────────────────────────────
EXISTING_CRONTAB="$("$CRONTAB_CMD" "${CRONTAB_ARGS[@]}" -l 2>/dev/null || true)"

# ── Tag identificativo: identifica univocamente la riga pulla.sh nel crontab ──
# Usare il percorso assoluto come firma garantisce che la ricerca sia precisa
# anche se l'utente ha altri cron job con path simili.
CRON_TAG="# bikerlink-pulla"

# ── Nuova riga cron ───────────────────────────────────────────────────────────
# stdout e stderr redirezionati su PULLA_LOG (append); il cron stesso non
# riceve mail (MAILTO="" non serve qui perché la ridirezione assorbe tutto).
NEW_CRON_LINE="${PULLA_CRON_MINUTE} ${PULLA_CRON_HOUR} * * * bash \"${PULLA_SCRIPT}\" --restart >> \"${PULLA_LOG}\" 2>&1 ${CRON_TAG}"

# ── Idempotenza: rimuovi l'eventuale voce esistente di pulla ─────────────────
PREV_COUNT=0
if echo "$EXISTING_CRONTAB" | grep -qF "$CRON_TAG" 2>/dev/null; then
  PREV_ENTRIES="$(echo "$EXISTING_CRONTAB" | grep -c "$CRON_TAG" || true)"
  warn "Trovate ${PREV_ENTRIES} voce/i cron esistenti per pulla.sh — rimuovo e riscrivo."
  EXISTING_CRONTAB="$(echo "$EXISTING_CRONTAB" | grep -vF "$CRON_TAG" || true)"
  PREV_COUNT="$PREV_ENTRIES"
else
  log "Nessuna voce cron preesistente per pulla.sh — installazione pulita."
fi

# ── Componi il nuovo crontab ──────────────────────────────────────────────────
# Aggiunge la nuova riga alla fine (con una riga vuota di separazione se il
# crontab aveva già contenuto).
if [[ -n "$EXISTING_CRONTAB" ]]; then
  NEW_CRONTAB="${EXISTING_CRONTAB}
${NEW_CRON_LINE}"
else
  NEW_CRONTAB="${NEW_CRON_LINE}"
fi

# ── Installa il crontab ───────────────────────────────────────────────────────
echo "$NEW_CRONTAB" | "$CRONTAB_CMD" "${CRONTAB_ARGS[@]}" - \
  || die "Impossibile installare il crontab. Controlla i permessi."

# ── Verifica installazione ────────────────────────────────────────────────────
INSTALLED_CRONTAB="$("$CRONTAB_CMD" "${CRONTAB_ARGS[@]}" -l 2>/dev/null || true)"

if echo "$INSTALLED_CRONTAB" | grep -qF "$CRON_TAG"; then
  INSTALLED_LINE="$(echo "$INSTALLED_CRONTAB" | grep -F "$CRON_TAG")"
  ok "Cron job installato correttamente:"
  echo ""
  echo "    ${INSTALLED_LINE}"
  echo ""
else
  die "Verifica fallita: il cron job non appare nel crontab dopo l'installazione."
fi

# ── Riepilogo ─────────────────────────────────────────────────────────────────
echo "============================================================"
echo ""
if [[ "$PREV_COUNT" -gt 0 ]]; then
  ok "Aggiornato (rimosso ${PREV_COUNT} voce/i precedente/i, aggiunta nuova)."
else
  ok "Installato (primo setup)."
fi
echo ""
log "Riepilogo:"
echo "  Script:    ${PULLA_SCRIPT}"
echo "  Orario:    ogni notte alle $(printf '%02d:%02d' "$PULLA_CRON_HOUR" "$PULLA_CRON_MINUTE")"
echo "  Flag:      --restart (docker compose up -d dopo il pull)"
echo "  Log:       ${PULLA_LOG}  (append stdout+stderr)"
echo ""
log "Per verificare:      crontab -l | grep pulla"
log "Per i log notturni:  tail -f ${PULLA_LOG}"
log "Per rimuovere:       crontab -e  → elimina la riga con '${CRON_TAG}'"
echo ""
exit 0
