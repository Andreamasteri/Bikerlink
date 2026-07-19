#!/usr/bin/env bash
# =============================================================================
# check-bowie-dialetto.sh — T4 regression gate: Bowie + dialetto meridionale
#
# Invia i 4 messaggi del benchmark T4 (dialetto meridionale + typo) all'endpoint
# Bowie live. Fallisce se almeno una risposta è in inglese o contiene un rifiuto
# esplicito di rispondere al contenuto dell'utente.
#
# Progettato per girare nel workflow db-migration-checks. Se il ThinkCentre non è
# raggiungibile o i secret Bowie mancano, il test viene saltato (exit 0) senza
# bloccare la pipeline.
#
# Exit 0 = tutte le risposte OK  |  SKIP (TC offline / secret mancanti)
# Exit 1 = almeno una risposta in inglese o rifiuto
# =============================================================================
set -euo pipefail

BOLD="\033[1m"
GREEN="\033[32m"
RED="\033[31m"
YELLOW="\033[33m"
RESET="\033[0m"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Source per _ai_parse_ndjson e ai_check_tc
# shellcheck source=scripts/ai-agent-access.sh
source "$SCRIPT_DIR/ai-agent-access.sh"

echo -e "${BOLD}=== check-bowie-dialetto — T4 Dialetto Meridionale regression gate ===${RESET}"

# ---------------------------------------------------------------------------
# 1. Verifica secret Bowie
# ---------------------------------------------------------------------------
if [ -z "${BOWIE_OLLAMA_URL:-}" ] || [ -z "${CF_ACCESS_CLIENT_ID:-}" ] || [ -z "${CF_ACCESS_CLIENT_SECRET:-}" ]; then
  echo -e "${YELLOW}[SKIP]${RESET} Secret Bowie non impostati (BOWIE_OLLAMA_URL / CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET) — test saltato"
  exit 0
fi

# ---------------------------------------------------------------------------
# 2. Verifica raggiungibilità ThinkCentre (usa ai_check_tc che usa HORUS_OLLAMA_URL,
#    stesso TC su cui gira Bowie)
# ---------------------------------------------------------------------------
TC_STATUS=$(ai_check_tc 2>/dev/null || true)
if [ "$TC_STATUS" != "online" ]; then
  echo -e "${YELLOW}[SKIP]${RESET} ThinkCentre non raggiungibile (status: $TC_STATUS) — test saltato"
  exit 0
fi

# ---------------------------------------------------------------------------
# 3. Config endpoint Bowie
# ---------------------------------------------------------------------------
BOWIE_MODEL="${BOWIE_OLLAMA_MODEL:-qwen3:1.7b}"
BOWIE_URL="${BOWIE_OLLAMA_URL%/}"
BOWIE_TOKEN="${BOWIE_OLLAMA_TOKEN:-}"

echo -e "  Modello Bowie: ${BOLD}${BOWIE_MODEL}${RESET}"
echo -e "  Endpoint: ${BOWIE_URL}/api/chat"

# ---------------------------------------------------------------------------
# 4. T4 spec: sistema + 4 messaggi in sessione continua (history accumulata)
# ---------------------------------------------------------------------------
SYSTEM_PROMPT="Sei Bowie, assistant di BikerLink. Rispondi sempre in italiano standard, gentile e utile. L'utente potrebbe scrivere con errori di battitura o termini dialettali meridionali."

T4_MESSAGES=(
  "oi nun riesc a truva compagni pe viaggià, cumm si fa?"
  "appicciato l app ma nun part, che cazz succede"
  "voglo saper se posso mettere la mia moto preferita sulapp, ho na ducati"
  "sto cercando qualcunno pe fare un viaggio vrs palermo, sai aiutarm?"
)

# ---------------------------------------------------------------------------
# 5. Helper: chiama Bowie con un array messages JSON, restituisce testo risposta
# ---------------------------------------------------------------------------
call_bowie_with_messages() {
  local messages_json="$1"
  local tmpraw
  tmpraw=$(mktemp)

  curl -s --no-buffer --max-time 120 --fail-with-body \
    -H "Content-Type: application/json" \
    -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
    -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
    -H "Authorization: Bearer $BOWIE_TOKEN" \
    -d "{
      \"model\": $(python3 -c "import sys,json; print(json.dumps('$BOWIE_MODEL'))"),
      \"stream\": true,
      \"think\": false,
      \"options\": {\"num_predict\": 300},
      \"messages\": $messages_json
    }" \
    "${BOWIE_URL}/api/chat" > "$tmpraw" 2>/dev/null
  local curl_exit=$?

  if [ "$curl_exit" -ne 0 ]; then
    rm -f "$tmpraw"
    return 1
  fi

  local output
  output=$(cat "$tmpraw" | _ai_parse_ndjson 2>/dev/null || true)
  rm -f "$tmpraw"
  echo "$output"
}

# ---------------------------------------------------------------------------
# 6. Helper: rilevamento inglese
#    3+ marcatori inglesi tipici → risposta in inglese
# ---------------------------------------------------------------------------
is_english_response() {
  local text="$1"
  python3 - "$text" << 'PYEOF'
import sys, re

text = sys.argv[1].lower()

# Marcatori inglesi che raramente appaiono in risposta italiana (spazi inclusi per
# evitare falsi positivi su "the" dentro parole italiane come "pathe", ecc.)
en_markers = [
    ' i ', " i'", "i'm ", "i'll ", "i've ", "i'd ",
    ' the ', 'the ', 'of the ', 'in the ', 'for the ', 'to the ',
    ' you ', ' your ', "you're ", "you'll ",
    "don't ", "can't ", "doesn't ", "isn't ", "aren't ", "won't ",
    'please ', 'sure, ', 'of course, ', 'hello ', 'thank you',
    'let me ', 'i can ', 'i cannot ', 'i need ', 'i see ',
    'i will ', 'i am ', 'no problem', 'sounds good',
]

hits = sum(1 for m in en_markers if m in text)
# 3+ marcatori = risposta prevalentemente in inglese
sys.exit(0 if hits >= 3 else 1)
PYEOF
}

# ---------------------------------------------------------------------------
# 7. Helper: rilevamento rifiuto esplicito
# ---------------------------------------------------------------------------
is_refusal_response() {
  local text="$1"
  python3 - "$text" << 'PYEOF'
import sys

text = sys.argv[1].lower()

refusal_markers = [
    # Italiano
    'non posso rispondere',
    'non riesco a rispondere',
    'non posso aiutarti con questo',
    'non è appropriato',
    'questo non è appropriato',
    'non posso elaborare',
    'non capisco la richiesta',
    'non è possibile rispondere',
    # Inglese (per catturare rifiuti in inglese anche senza il threshold di 3)
    'i cannot help',
    "i can't help",
    'i am unable to',
    'i refuse to',
    'i apologize, but i cannot',
    'inappropriate request',
    'sorry, i cannot',
]

hits = sum(1 for m in refusal_markers if m in text)
sys.exit(0 if hits >= 1 else 1)
PYEOF
}

# ---------------------------------------------------------------------------
# 8. Esecuzione T4 — sessione continua con history accumulata
# ---------------------------------------------------------------------------
echo -e "\n${BOLD}Invio 4 messaggi T4 con history accumulata...${RESET}"

FAILURES=0
# History come array JSON di oggetti {role, content}
HISTORY_JSON="[]"

for i in "${!T4_MESSAGES[@]}"; do
  MSG="${T4_MESSAGES[$i]}"
  IDX=$((i + 1))
  echo -e "\n  ${BOLD}[T4.$IDX]${RESET} $MSG"

  # Costruisci array messages: [system] + history + [user corrente]
  MESSAGES_JSON=$(python3 - "$HISTORY_JSON" "$MSG" "$SYSTEM_PROMPT" << 'PYEOF'
import sys, json

history  = json.loads(sys.argv[1])
user_msg = sys.argv[2]
sys_msg  = sys.argv[3]

msgs = [{"role": "system", "content": sys_msg}] + history + [{"role": "user", "content": user_msg}]
print(json.dumps(msgs))
PYEOF
)

  RESPONSE=$(call_bowie_with_messages "$MESSAGES_JSON" 2>/dev/null || true)

  if [ -z "$RESPONSE" ]; then
    echo -e "  ${RED}[FAIL]${RESET} Nessuna risposta ricevuta dall'endpoint Bowie"
    FAILURES=$((FAILURES + 1))
    # Aggiungi comunque alla history con placeholder per non rompere il contesto
    HISTORY_JSON=$(python3 - "$HISTORY_JSON" "$MSG" "[nessuna risposta]" << 'PYEOF'
import sys, json
h = json.loads(sys.argv[1])
h.append({"role": "user",      "content": sys.argv[2]})
h.append({"role": "assistant", "content": sys.argv[3]})
print(json.dumps(h))
PYEOF
)
    continue
  fi

  # Anteprima (max 150 caratteri)
  PREVIEW="${RESPONSE:0:150}"
  echo -e "  Risposta: ${PREVIEW}..."

  # Controllo inglese
  if is_english_response "$RESPONSE"; then
    echo -e "  ${RED}[FAIL]${RESET} Risposta in inglese rilevata"
    FAILURES=$((FAILURES + 1))
  # Controllo rifiuto
  elif is_refusal_response "$RESPONSE"; then
    echo -e "  ${RED}[FAIL]${RESET} Rifiuto esplicito rilevato"
    FAILURES=$((FAILURES + 1))
  else
    echo -e "  ${GREEN}[OK]${RESET} Risposta pertinente in italiano"
  fi

  # Accumula storia per il turno successivo
  HISTORY_JSON=$(python3 - "$HISTORY_JSON" "$MSG" "$RESPONSE" << 'PYEOF'
import sys, json
h = json.loads(sys.argv[1])
h.append({"role": "user",      "content": sys.argv[2]})
h.append({"role": "assistant", "content": sys.argv[3]})
print(json.dumps(h))
PYEOF
)
done

# ---------------------------------------------------------------------------
# 9. Summary
# ---------------------------------------------------------------------------
echo ""
TOTAL=${#T4_MESSAGES[@]}
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}T4 PASSATO${RESET} — Bowie ($BOWIE_MODEL) gestisce correttamente tutti i $TOTAL messaggi dialettali"
  exit 0
else
  echo -e "${RED}${BOLD}T4 FALLITO${RESET} — $FAILURES/$TOTAL risposte non conformi (inglese o rifiuto)"
  echo -e "${RED}Regressione probabile del modello Bowie su input dialettali meridionali.${RESET}"
  echo -e "${RED}Verificare BOWIE_OLLAMA_MODEL (attuale: $BOWIE_MODEL) e rieseguire il benchmark T4.${RESET}"
  exit 1
fi
