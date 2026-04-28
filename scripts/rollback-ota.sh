#!/bin/bash
# ============================================================
#  BikerLink — OTA Rollback
#  Uso: bash scripts/rollback-ota.sh <updateNumber>
#
#  Riattiva una release storica del ciclo corrente:
#   - chiama /api/admin/ota/:id/publish sull'ID storico
#   - aggiorna ota-updates.json (target → published, corrente → rolled-back)
#   - aggiorna CURRENT_OTA_NUMBER in lib/ota.ts
# ============================================================
set -euo pipefail

TARGET_OTA="${1:-}"

if [ -z "$TARGET_OTA" ]; then
  echo "Uso: $0 <updateNumber>"
  echo "Esempio: $0 17    # rollback a OTA-17"
  echo ""
  echo "Variabili d'ambiente richieste:"
  echo "  BIKERLINK_ADMIN_EMAIL    — email account admin"
  echo "  BIKERLINK_ADMIN_PASSWORD — password account admin"
  echo ""
  echo "Variabili d'ambiente opzionali:"
  echo "  BIKERLINK_BACKEND_URL    — URL backend (default: https://biker-link.replit.app)"
  exit 1
fi

if ! [[ "$TARGET_OTA" =~ ^[0-9]+$ ]]; then
  echo "Errore: updateNumber deve essere un numero intero positivo"
  exit 1
fi

BACKEND_URL="${BIKERLINK_BACKEND_URL:-https://biker-link.replit.app}"
OTA_UPDATES_FILE="ota-updates.json"
OTA_TS_FILE="lib/ota.ts"

ADMIN_EMAIL="${BIKERLINK_ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${BIKERLINK_ADMIN_PASSWORD:-}"

if [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ]; then
  echo "Errore: imposta BIKERLINK_ADMIN_EMAIL e BIKERLINK_ADMIN_PASSWORD"
  exit 1
fi

# ─── Leggi runtime version e trova entry target ───────────
ROLLBACK_INFO=$(node -e "
  const fs = require('fs');
  const appJson = JSON.parse(fs.readFileSync('app.json','utf8'));
  const rv = appJson?.expo?.runtimeVersion ?? null;
  const data = JSON.parse(fs.readFileSync('$OTA_UPDATES_FILE','utf8'));
  const cycle = data.filter(e => typeof e.updateNumber === 'number' && e.runtimeVersion === rv);

  const target = cycle.find(e => e.updateNumber === $TARGET_OTA);
  if (!target) {
    process.stderr.write('OTA-$TARGET_OTA non trovata nel ciclo corrente (rv=' + rv + ')\n');
    process.exit(1);
  }
  if (!target.releaseId) {
    process.stderr.write('OTA-$TARGET_OTA non ha releaseId — non può essere rollbackata\n');
    process.exit(1);
  }

  const current = cycle.find(e => e.status === 'published' || e.status === 'active');
  const currentOta = current ? current.updateNumber : null;
  console.log(JSON.stringify({ rv, releaseId: target.releaseId, currentOta }));
" 2>/dev/null) || { echo "   ERRORE: impossibile leggere $OTA_UPDATES_FILE"; exit 1; }

RUNTIME_VERSION=$(echo "$ROLLBACK_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).rv))")
TARGET_RELEASE_ID=$(echo "$ROLLBACK_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).releaseId))")
CURRENT_OTA=$(echo "$ROLLBACK_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ const j=JSON.parse(d); console.log(j.currentOta ?? ''); })")

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║        BikerLink OTA Rollback                    ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Target: OTA-$TARGET_OTA (releaseId=$TARGET_RELEASE_ID)"
if [ -n "$CURRENT_OTA" ]; then
  echo "  Corrente: OTA-$CURRENT_OTA → rolled-back"
fi
echo "  Backend: $BACKEND_URL"
echo ""
echo "  Continuare? [y/N]"
read -r CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "Annullato."
  exit 0
fi

# ─── Login al backend ──────────────────────────────────────
echo "[1/4] Login admin su $BACKEND_URL..."
RAW_LOGIN=$(curl -s -D - -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-Proto: https" \
  -d "{\"identifier\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
LOGIN_BODY=$(echo "$RAW_LOGIN" | awk 'BEGIN{body=0} /^\r$/{body=1; next} body{print}')
if ! echo "$LOGIN_BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ try { const j=JSON.parse(d); process.exit(j.id ? 0 : 1); } catch { process.exit(1); } })" 2>/dev/null; then
  echo "   ERRORE login: $LOGIN_BODY"
  exit 1
fi
SESSION_COOKIE=$(echo "$RAW_LOGIN" | grep -i "^set-cookie:" | grep "connect.sid" | head -1 | sed 's/.*connect\.sid=\([^;]*\).*/connect.sid=\1/' | tr -d '\r')
if [ -z "$SESSION_COOKIE" ]; then
  echo "   ERRORE: nessun session cookie ricevuto"
  exit 1
fi
echo "   ✔ Autenticato"

# ─── Ripubblica release target ────────────────────────────
echo "[2/4] Pubblicazione OTA-$TARGET_OTA ($TARGET_RELEASE_ID)..."
PUBLISH_RESPONSE=$(curl -s -H "Cookie: $SESSION_COOKIE" -H "X-Forwarded-Proto: https" -X POST "$BACKEND_URL/api/admin/ota/$TARGET_RELEASE_ID/publish")
PUBLISH_STATUS=$(echo "$PUBLISH_RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ try { console.log(JSON.parse(d).status ?? ''); } catch { console.log(''); } })" 2>/dev/null || true)
if [ "$PUBLISH_STATUS" != "active" ]; then
  echo "   ERRORE pubblicazione: $PUBLISH_RESPONSE"
  exit 1
fi
echo "   ✔ OTA-$TARGET_OTA riattivata (status: active)"

# ─── Aggiorna lib/ota.ts ──────────────────────────────────
echo "[3/4] Aggiornamento CURRENT_OTA_NUMBER=$TARGET_OTA in lib/ota.ts..."
OTA_TS_FILE="$OTA_TS_FILE" \
OTA_TARGET="$TARGET_OTA" \
node -e "
  const fs = require('fs');
  const targetNum = parseInt(process.env.OTA_TARGET, 10);
  let content = fs.readFileSync(process.env.OTA_TS_FILE, 'utf8');
  content = content.replace(/CURRENT_OTA_NUMBER\s*=\s*[0-9]+/, 'CURRENT_OTA_NUMBER = ' + targetNum);
  fs.writeFileSync(process.env.OTA_TS_FILE, content);
  console.log('OK');
" || { echo "   ERRORE: impossibile aggiornare lib/ota.ts — aggiornare manualmente prima di continuare"; exit 1; }
echo "   ✔ CURRENT_OTA_NUMBER=$TARGET_OTA"

# ─── Aggiorna ota-updates.json ────────────────────────────
echo "[4/4] Aggiornamento ota-updates.json..."
OTA_UPDATES_FILE="$OTA_UPDATES_FILE" \
OTA_RUNTIME_VERSION="$RUNTIME_VERSION" \
OTA_CURRENT="$CURRENT_OTA" \
OTA_TARGET="$TARGET_OTA" \
node -e "
  const fs = require('fs');
  const rv = process.env.OTA_RUNTIME_VERSION;
  const targetNum = parseInt(process.env.OTA_TARGET, 10);
  const currentNum = process.env.OTA_CURRENT ? parseInt(process.env.OTA_CURRENT, 10) : null;
  const data = JSON.parse(fs.readFileSync(process.env.OTA_UPDATES_FILE, 'utf8'));

  // Segna la entry corrente come rolled-back
  if (currentNum !== null) {
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].runtimeVersion === rv && data[i].updateNumber === currentNum &&
          (data[i].status === 'published' || data[i].status === 'active')) {
        data[i].status = 'rolled-back';
        break;
      }
    }
  }

  // Segna la entry target come published
  let found = false;
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].runtimeVersion === rv && data[i].updateNumber === targetNum) {
      data[i].status = 'published';
      data[i].publishedAt = new Date().toISOString();
      found = true;
      break;
    }
  }
  if (!found) { process.stderr.write('Entry OTA-' + targetNum + ' non trovata\n'); process.exit(1); }

  fs.writeFileSync(process.env.OTA_UPDATES_FILE, JSON.stringify(data, null, 2) + '\n');
  console.log('OK');
" || { echo "   ERRORE: impossibile aggiornare ota-updates.json — aggiornare manualmente"; exit 1; }
echo "   ✔ ota-updates.json aggiornato"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Rollback OTA-$TARGET_OTA completato!$(printf '%*s' $((29 - ${#TARGET_OTA})) '')║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Tutti gli utenti riceveranno OTA-$TARGET_OTA al prossimo avvio. ║"
echo "║  Verifica: bash scripts/validate-ota.sh                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
