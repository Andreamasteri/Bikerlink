#!/usr/bin/env bash
# publish-ota.sh — Pubblica un aggiornamento OTA su EAS Update (canale staging)
# Uso: ./scripts/publish-ota.sh --message "Descrizione del cambiamento"
#
# Richiede:
#   - EAS_TOKEN nell'ambiente (unico secret necessario)
#   - eas CLI installato globalmente (npx eas)
#
# NON richiede e NON deve ricevere: password admin, credenziali Play Store, ecc.

set -euo pipefail

# ──────────────────────────────────────────────
# 1. Argomenti
# ──────────────────────────────────────────────
MESSAGE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --message|-m)
      MESSAGE="$2"
      shift 2
      ;;
    *)
      echo "❌ Argomento sconosciuto: $1" >&2
      echo "   Uso: $0 --message \"Descrizione del cambiamento\"" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$MESSAGE" ]]; then
  echo "❌ Parametro --message obbligatorio." >&2
  echo "   Uso: $0 --message \"Descrizione del cambiamento\"" >&2
  exit 1
fi

# ──────────────────────────────────────────────
# 2. Controllo EAS_TOKEN
# ──────────────────────────────────────────────
if [[ -z "${EAS_TOKEN:-}" ]]; then
  echo "❌ EAS_TOKEN non presente nell'ambiente." >&2
  echo "   Imposta il secret EAS_TOKEN nel pannello Replit (Secrets)." >&2
  exit 1
fi

export EXPO_TOKEN="$EAS_TOKEN"

# ──────────────────────────────────────────────
# 3. Controllo EAS CLI
# ──────────────────────────────────────────────
if ! command -v eas &>/dev/null && ! npx eas --version &>/dev/null 2>&1; then
  echo "❌ EAS CLI non trovato. Installa con: npm install -g eas-cli" >&2
  exit 1
fi

EAS_CMD="npx eas"
if command -v eas &>/dev/null; then
  EAS_CMD="eas"
fi

# ──────────────────────────────────────────────
# 4. Determina NEXT_OTA tramite EAS GraphQL API
#    Filtra esplicitamente per canali "staging" e "production"
# ──────────────────────────────────────────────
echo "🔍 Recupero updateNumber massimo da EAS (canali staging + production)..."

APP_SLUG=$(node -e "const a=require('./app.json'); console.log(a.expo?.slug || '')" 2>/dev/null || echo "")
APP_OWNER=$(node -e "const a=require('./app.json'); console.log(a.expo?.owner || '')" 2>/dev/null || echo "")

GQL_FALLBACK=false

if [[ -z "$APP_SLUG" || -z "$APP_OWNER" ]]; then
  echo "⚠️  Impossibile leggere slug/owner da app.json — NEXT_OTA impostato a 1." >&2
  echo "   ⚠️  ATTENZIONE: se esistono OTA precedenti, potrebbe esserci una collisione di versione." >&2
  NEXT_OTA=1
  GQL_FALLBACK=true
else
  # Query GraphQL che filtra esplicitamente staging e production per nome
  GQL_QUERY=$(node -e "
    const owner = '${APP_OWNER}';
    const slug  = '${APP_SLUG}';
    const query = \`{
      app {
        byFullName(fullName: \"\${owner}/\${slug}\") {
          staging:  updateChannelByName(name: \"staging\")  { updates(offset: 0, limit: 1) { updateNumber } }
          production: updateChannelByName(name: \"production\") { updates(offset: 0, limit: 1) { updateNumber } }
        }
      }
    }\`;
    console.log(JSON.stringify({ query }));
  " 2>/dev/null || echo "")

  if [[ -z "$GQL_QUERY" ]]; then
    echo "⚠️  Impossibile costruire la query GraphQL — NEXT_OTA impostato a 1." >&2
    echo "   ⚠️  ATTENZIONE: se esistono OTA precedenti, potrebbe esserci una collisione di versione." >&2
    NEXT_OTA=1
    GQL_FALLBACK=true
  else
    RESPONSE=$(curl -s -X POST \
      -H "Authorization: bearer ${EAS_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$GQL_QUERY" \
      "https://api.expo.dev/graphql" 2>/dev/null || echo "")

    MAX_OTA=$(echo "$RESPONSE" | node -e "
      let data = '';
      process.stdin.on('data', d => data += d);
      process.stdin.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const app = parsed?.data?.app?.byFullName;
          let max = 0;
          for (const ch of [app?.staging, app?.production]) {
            if (!ch) continue;
            (ch.updates || []).forEach(u => {
              if (u.updateNumber > max) max = u.updateNumber;
            });
          }
          console.log(max);
        } catch(e) {
          console.log(-1);
        }
      });
    " 2>/dev/null || echo "-1")

    if ! [[ "$MAX_OTA" =~ ^[0-9]+$ ]]; then
      echo "⚠️  Risposta EAS non valida (MAX_OTA=${MAX_OTA}) — NEXT_OTA impostato a 1." >&2
      echo "   ⚠️  ATTENZIONE: se esistono OTA precedenti, potrebbe esserci una collisione di versione." >&2
      NEXT_OTA=1
      GQL_FALLBACK=true
    else
      NEXT_OTA=$(( MAX_OTA + 1 ))
    fi
  fi
fi

if [[ "$GQL_FALLBACK" == "true" ]]; then
  echo "   ℹ️  Verifica manualmente su expo.dev che NEXT_OTA=1 sia corretto prima di procedere."
fi

echo "   MAX_OTA rilevato: ${MAX_OTA:-N/D} → NEXT_OTA: ${NEXT_OTA}"

# ──────────────────────────────────────────────
# 5. Calcola la versione OTA
# ──────────────────────────────────────────────
# Formato versione OTA: <build>.<updateNumber>.<ciclo_ota>
# 49 = versionCode APK corrente, NEXT_OTA = numero progressivo OTA nel ciclo, 10 = ciclo runtimeVersion (10.0.0)
VERSION="49.${NEXT_OTA}.10"

echo "📦 Versione OTA calcolata: ${VERSION}"

# ──────────────────────────────────────────────
# 6. Pubblica con EAS Update (output JSON per parsing affidabile)
# ──────────────────────────────────────────────
echo ""
echo "🚀 Pubblicazione OTA in corso..."
echo "   Canale  : staging"
echo "   Versione: ${VERSION}"
echo "   Messaggio: ${MESSAGE}"
echo ""

UPDATE_JSON=$($EAS_CMD update \
  --channel staging \
  --message "${MESSAGE}" \
  --non-interactive \
  --json \
  2>&1) || {
  echo "❌ Pubblicazione OTA fallita." >&2
  echo "$UPDATE_JSON" >&2
  exit 1
}

# ──────────────────────────────────────────────
# 7. Estrai Update ID dall'output JSON strutturato
# ──────────────────────────────────────────────
UPDATE_ID=$(echo "$UPDATE_JSON" | node -e "
  let data = '';
  process.stdin.on('data', d => data += d);
  process.stdin.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      // L'output EAS --json è un array di update group (uno per piattaforma)
      const id = Array.isArray(parsed)
        ? (parsed[0]?.id || parsed[0]?.updateId || 'N/D')
        : (parsed?.id || parsed?.updateId || 'N/D');
      console.log(id);
    } catch(e) {
      console.log('N/D');
    }
  });
" 2>/dev/null || echo "N/D")

# Fallback: se il parsing JSON non ha trovato un ID, cerca un UUID nel testo grezzo
if [[ "$UPDATE_ID" == "N/D" ]]; then
  UPDATE_ID=$(echo "$UPDATE_JSON" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || echo "N/D")
fi

# ──────────────────────────────────────────────
# 8. Riepilogo finale
# ──────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ OTA pubblicata con successo!"
echo "   Versione  : ${VERSION}"
echo "   Update ID : ${UPDATE_ID}"
echo "   Canale    : staging"
echo "   Messaggio : ${MESSAGE}"
echo ""
echo "   ➡️  Approva/rifiuta su: https://expo.dev/accounts/${APP_OWNER:-<owner>}/projects/${APP_SLUG:-<slug>}/updates"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
