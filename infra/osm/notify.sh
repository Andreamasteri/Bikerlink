#!/usr/bin/env bash
set -euo pipefail

# ── Configurazione ───────────────────────────────────────────────────────────
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"     # es. https://hooks.slack.com/services/...
NOTIFY_EMAIL="${NOTIFY_EMAIL:-}"               # es. admin@bikerlink.app
SENDMAIL_BIN="${SENDMAIL_BIN:-sendmail}"

STATUS="${1:-UNKNOWN}"   # SUCCESS | ERROR
MESSAGE="${2:-Nessun messaggio}"
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S %Z')"
ICON="$([[ "$STATUS" == "SUCCESS" ]] && echo "✅" || echo "❌")"
SUBJECT="${ICON} BikerLink OSM Update — ${STATUS} — ${TIMESTAMP}"
BODY="${ICON} *BikerLink OSM Update*\nStatus: ${STATUS}\nTimestamp: ${TIMESTAMP}\n${MESSAGE}"

# ── Slack webhook ─────────────────────────────────────────────────────────────
if [[ -n "$SLACK_WEBHOOK_URL" ]]; then
  PAYLOAD="{\"text\":\"${BODY}\"}"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$SLACK_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" || true)
  echo "[notify] Slack → HTTP ${HTTP_CODE}"
fi

# ── Email via sendmail ────────────────────────────────────────────────────────
if [[ -n "$NOTIFY_EMAIL" ]] && command -v "$SENDMAIL_BIN" &>/dev/null; then
  printf "To: %s\nSubject: %s\nContent-Type: text/plain\n\n%b\n" \
    "$NOTIFY_EMAIL" "$SUBJECT" "$MESSAGE" \
    | "$SENDMAIL_BIN" -t
  echo "[notify] Email inviata a ${NOTIFY_EMAIL}"
fi

if [[ -z "$SLACK_WEBHOOK_URL" && -z "$NOTIFY_EMAIL" ]]; then
  echo "[notify] AVVISO: nessun canale di notifica configurato (SLACK_WEBHOOK_URL / NOTIFY_EMAIL)"
fi
