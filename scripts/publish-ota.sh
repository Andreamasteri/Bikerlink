#!/bin/bash
set -euo pipefail

VERSION="${1:-}"
RELEASE_NOTES="${2:-}"

if [ -z "$VERSION" ] || [ -z "$RELEASE_NOTES" ]; then
  echo "Uso: $0 <version> \"note di release\""
  echo "Esempio: $0 1.2.0 \"Corretto bug match, nuovo sistema OTA\""
  echo ""
  echo "  Entrambi i parametri sono obbligatori."
  echo ""
  echo "Variabili d'ambiente richieste:"
  echo "  BIKERLINK_ADMIN_EMAIL    — email dell'account admin"
  echo "  BIKERLINK_ADMIN_PASSWORD — password dell'account admin"
  echo ""
  echo "Variabili d'ambiente opzionali:"
  echo "  BIKERLINK_BACKEND_URL    — URL backend (default: http://localhost:5000)"
  echo "  EXPO_TOKEN               — token EAS (se mancante, passo EAS viene saltato)"
  exit 1
fi

BACKEND_URL="${BIKERLINK_BACKEND_URL:-http://localhost:5000}"
COOKIE_JAR="/tmp/ota-publish-cookies-$$.txt"
DIST_DIR="dist-ota"

ADMIN_EMAIL="${BIKERLINK_ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${BIKERLINK_ADMIN_PASSWORD:-}"

if [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ]; then
  echo "Errore: imposta BIKERLINK_ADMIN_EMAIL e BIKERLINK_ADMIN_PASSWORD"
  echo "  export BIKERLINK_ADMIN_EMAIL='admin@bikerlink.it'"
  echo "  export BIKERLINK_ADMIN_PASSWORD='tuapassword'"
  exit 1
fi

cleanup() {
  rm -f "$COOKIE_JAR"
  rm -rf "$DIST_DIR"
}
trap cleanup EXIT

# Cattura hash git corrente (per il log finale)
GIT_COMMIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "N/A")
GIT_COMMIT_SHORT="${GIT_COMMIT_HASH:0:12}"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║       BikerLink OTA Publisher v${VERSION}$(printf '%*s' $((28 - ${#VERSION})) '')║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Commit: $GIT_COMMIT_SHORT"
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  CHECKLIST PRE-PUBBLICAZIONE (da fare PRIMA)    ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  ① Aggiungi entry in ota-updates.json con:     ║"
echo "║     - commitBase = hash git (non PENDING)       ║"
echo "║     - IDs sconosciuti = null (non PENDING)      ║"
echo "║  ② Aggiorna CURRENT_OTA_NUMBER in profile.tsx  ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Questo script esegue automaticamente:          ║"
echo "║  ③ Guard validate-ota.sh  (blocca se fallisce) ║"
echo "║  ④ Export bundle JavaScript (Metro bundler)    ║"
echo "║  ⑤ Upload bundle su object storage             ║"
echo "║  ⑥ Pubblicazione release sul backend custom    ║"
echo "║  ⑦ Pubblicazione aggiornamento su EAS          ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  DOPO la pubblicazione (usa gli ID qui sotto):  ║"
echo "║  ⑧ Aggiorna ota-updates.json con ID reali      ║"
echo "║  ⑨ Riesegui validate-ota.sh per conferma       ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Step 0 (Guard): Esecuzione validate-ota.sh — blocca se fallisce
echo "[0/7] Guard OTA — validate-ota.sh..."
GUARD_SCRIPT="$(dirname "$0")/validate-ota.sh"
if [ ! -f "$GUARD_SCRIPT" ]; then
  echo "   ERRORE: script di validazione non trovato: $GUARD_SCRIPT"
  exit 1
fi
if ! bash "$GUARD_SCRIPT"; then
  echo ""
  echo "   ╔════════════════════════════════════════════════════╗"
  echo "   ║  ❌ PUBBLICAZIONE BLOCCATA — Guard OTA fallito    ║"
  echo "   ║  Correggi gli errori sopra e riprova.              ║"
  echo "   ╚════════════════════════════════════════════════════╝"
  echo ""
  exit 1
fi
echo "   Guard OK — procedo con la pubblicazione"
echo ""

# Step 1: Login — extract session cookie from headers (needed for Secure cookies over HTTP)
echo "[1/7] Login come admin..."
LOGIN_JSON=$(jq -n --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" '{"identifier":$e,"password":$p}')
RAW_LOGIN=$(curl -s -D - -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-Proto: https" \
  -d "$LOGIN_JSON")
LOGIN_RESPONSE=$(echo "$RAW_LOGIN" | sed '/^\r$/q' | tail -1 && echo "$RAW_LOGIN" | awk 'BEGIN{body=0} /^\r$/{body=1; next} body{print}')
LOGIN_BODY=$(echo "$RAW_LOGIN" | awk 'BEGIN{body=0} /^\r$/{body=1; next} body{print}')
if ! echo "$LOGIN_BODY" | jq -e '.id' > /dev/null 2>&1; then
  echo "   ERRORE login: $LOGIN_BODY"
  exit 1
fi
SESSION_COOKIE=$(echo "$RAW_LOGIN" | grep -i "^set-cookie:" | grep "connect.sid" | head -1 | sed 's/.*connect\.sid=\([^;]*\).*/connect.sid=\1/' | tr -d '\r')
if [ -z "$SESSION_COOKIE" ]; then
  echo "   ERRORE: nessun session cookie ricevuto"
  exit 1
fi
echo "   OK — autenticato"

# Step 2: Export bundle
echo "[2/7] Esportazione bundle JavaScript..."
rm -rf "$DIST_DIR"
EXPO_LOG="/tmp/ota-expo-$$.log"
if ! EXPO_PUBLIC_DOMAIN=biker-link.replit.app npx expo export --platform android --output-dir "$DIST_DIR" > "$EXPO_LOG" 2>&1; then
  echo "   ERRORE: expo export fallito"
  tail -20 "$EXPO_LOG"
  rm -f "$EXPO_LOG"
  exit 1
fi
grep -E "(✓|✗|Bundle|Error)" "$EXPO_LOG" | tail -5 || true
rm -f "$EXPO_LOG"
echo "   Esportazione completata"

# Step 3: Find bundle file — prefer entry bundle (.hbc Hermes or .js Metro)
# Expo SDK 55+ with jsEngine:hermes exports .hbc (Hermes Bytecode) instead of .js
echo "[3/7] Ricerca bundle principale..."
ANDROID_DIR="$DIST_DIR/_expo/static/js/android"
if [ ! -d "$ANDROID_DIR" ]; then
  echo "   ERRORE: directory $ANDROID_DIR non trovata"
  find "$DIST_DIR" -type f 2>/dev/null | head -20
  exit 1
fi

# Prefer file with "index" or "entry" in name — support .js (Metro) and .hbc (Hermes, SDK 55+)
BUNDLE_FILE=$(find "$ANDROID_DIR" \( -name "index*.hbc" -o -name "index*.js" -o -name "entry*.hbc" -o -name "entry*.js" \) ! -name "*.map" 2>/dev/null | head -1)

# Fallback: largest .hbc or .js file (exclude .map)
if [ -z "$BUNDLE_FILE" ]; then
  BUNDLE_FILE=$(find "$ANDROID_DIR" \( -name "*.hbc" -o -name "*.js" \) ! -name "*.map" -type f 2>/dev/null \
    -exec wc -c {} + 2>/dev/null | sort -n | tail -2 | head -1 | awk '{print $2}')
fi

if [ -z "$BUNDLE_FILE" ] || [ ! -f "$BUNDLE_FILE" ]; then
  echo "   ERRORE: bundle non trovato in $ANDROID_DIR"
  find "$DIST_DIR" -type f 2>/dev/null | head -20
  exit 1
fi

BUNDLE_SIZE=$(wc -c < "$BUNDLE_FILE")
BUNDLE_SIZE_HUMAN=$(node -e "const s=$BUNDLE_SIZE; process.stdout.write(s>1048576 ? (s/1048576).toFixed(1)+' MB' : Math.round(s/1024)+' KB')")
echo "   Bundle trovato: $(basename "$BUNDLE_FILE") ($BUNDLE_SIZE_HUMAN)"

# Step 4: Upload bundle directly via object storage (bypass HTTP layer)
echo "[4/7] Upload bundle su object storage..."
UPLOAD_RESPONSE=$(node "$(dirname "$0")/ota-upload-bundle.mjs" "$BUNDLE_FILE" "$VERSION" 2>&1)
BUNDLE_URL=$(echo "$UPLOAD_RESPONSE" | jq -r '.url // empty' 2>/dev/null || true)
if [ -z "$BUNDLE_URL" ]; then
  echo "   ERRORE upload: $UPLOAD_RESPONSE"
  exit 1
fi
echo "   Bundle URL: $BUNDLE_URL"

# Step 5: Create release (draft) then publish explicitly
echo "[5/7] Creazione release OTA..."
NOTES_JSON=$(node -e "process.stdout.write(JSON.stringify(process.argv[1]))" -- "$RELEASE_NOTES")
CREATE_RESPONSE=$(curl -s -H "Cookie: $SESSION_COOKIE" -H "X-Forwarded-Proto: https" -X POST "$BACKEND_URL/api/admin/ota" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"$VERSION\",\"bundlePath\":\"$BUNDLE_URL\",\"releaseNotes\":$NOTES_JSON}")
RELEASE_ID=$(echo "$CREATE_RESPONSE" | jq -r '.id // empty' 2>/dev/null)
if [ -z "$RELEASE_ID" ]; then
  echo "   ERRORE creazione release: $CREATE_RESPONSE"
  exit 1
fi
echo "   Release creata (draft) — ID: $RELEASE_ID"

echo "   Pubblicazione release..."
PUBLISH_RESPONSE=$(curl -s -H "Cookie: $SESSION_COOKIE" -H "X-Forwarded-Proto: https" -X POST "$BACKEND_URL/api/admin/ota/$RELEASE_ID/publish")
PUBLISH_STATUS=$(echo "$PUBLISH_RESPONSE" | jq -r '.status // empty' 2>/dev/null)
if [ "$PUBLISH_STATUS" != "active" ]; then
  echo "   ERRORE pubblicazione: $PUBLISH_RESPONSE"
  exit 1
fi
echo "   Release pubblicata — stato: $PUBLISH_STATUS"

# Step 6: Confirm active version via /api/updates/check
echo "[6/7] Verifica stato OTA attivo..."
CHECK_RESPONSE=$(curl -s "$BACKEND_URL/api/updates/check?appVersion=$VERSION")
ACTIVE_VERSION=$(echo "$CHECK_RESPONSE" | jq -r '.version // "nessuno"' 2>/dev/null)
ACTIVE_BUNDLE=$(echo "$CHECK_RESPONSE" | jq -r '.bundlePath // "N/A"' 2>/dev/null)
MANIFEST_URL=$(echo "$CHECK_RESPONSE" | jq -r '.manifestUrl // "N/A"' 2>/dev/null)
PUBLISHED_AT=$(echo "$CHECK_RESPONSE" | jq -r '.publishedAt // "N/A"' 2>/dev/null)
echo "   Versione attiva: $ACTIVE_VERSION"

# Step 7: Publish to EAS (best-effort — if EXPO_TOKEN is missing or EAS fails, warn and continue)
echo "[7/7] Pubblicazione su EAS (expo-updates)..."
EAS_UPDATE_GROUP_ID="N/A"
EAS_ANDROID_UPDATE_ID="N/A"
EAS_DASHBOARD_URL="N/A"
EAS_STATUS="skipped"

EAS_COMPLETED=0
EAS_LOG=""
EAS_STAGED_DIR=""
PUBLISH_START_TS=$(date +%s)

if [ -z "${EXPO_TOKEN:-}" ]; then
  echo "   ⚠️  EXPO_TOKEN non impostato — passo EAS saltato."
  echo "   Per abilitarlo: imposta EXPO_TOKEN nei secrets Replit."
  EAS_STATUS="skipped (EXPO_TOKEN mancante)"
else
  EAS_LOG="/tmp/ota-eas-$$.log"
  EAS_EXIT_FILE="/tmp/ota-eas-$$.exit"
  rm -f "$EAS_EXIT_FILE"

  # Copia DIST_DIR in /tmp per EAS: il trap cleanup EXIT del parent rimuove DIST_DIR all'uscita,
  # ma il processo setsid (background) deve ancora leggere i file. Usando una copia in /tmp,
  # cleanup e EAS non interferiscono.
  EAS_STAGED_DIR="/tmp/ota-eas-staged-$$"
  cp -a "$DIST_DIR" "$EAS_STAGED_DIR"

  # Avvia EAS in background staccato — setsid crea nuovo process group che sopravvive alla morte del parent bash
  # Variabili passate via env (sicuro contro caratteri speciali nei valori, es. apostrofi nelle note)
  set +e
  env \
    _EAS_INPUT_DIR="$EAS_STAGED_DIR" \
    _EAS_NOTES="$RELEASE_NOTES" \
    _EAS_LOG="$EAS_LOG" \
    _EAS_EXIT_FILE="$EAS_EXIT_FILE" \
  setsid bash -c '
    CI=1 EXPO_PUBLIC_DOMAIN=biker-link.replit.app \
    npx eas-cli@18 update \
      --skip-bundler \
      --input-dir "$_EAS_INPUT_DIR" \
      --channel preview \
      --message "$_EAS_NOTES" \
      --non-interactive \
      --platform android \
      >> "$_EAS_LOG" 2>&1
    echo $? > "$_EAS_EXIT_FILE"
  ' &
  EAS_BG_PID=$!
  echo "   EAS avviato (PID $EAS_BG_PID) — attendo fino a 300s..."

  # Polling ogni 10s fino a completamento o timeout 300s
  EAS_WAITED=0
  while [ $EAS_WAITED -lt 300 ]; do
    sleep 10
    EAS_WAITED=$((EAS_WAITED + 10))
    if [ -f "$EAS_EXIT_FILE" ]; then
      echo "   EAS completato in ${EAS_WAITED}s"
      EAS_COMPLETED=1
      break
    fi
    echo "   EAS in corso... ${EAS_WAITED}s"
  done

  if [ "$EAS_COMPLETED" -eq 1 ]; then
    EAS_EXIT=$(cat "$EAS_EXIT_FILE")
  else
    echo "   ⚠️  EAS timeout dopo 300s — processo setsid continua in background."
    echo "   Monitorare: tail -f $EAS_LOG"
    echo "   Quando completato, leggere gli ID da quel file."
    EAS_EXIT=1
    EAS_STATUS="IN_BACKGROUND — monitorare: tail -f $EAS_LOG"
  fi
  set -e

  if [ $EAS_EXIT -ne 0 ] && [ "$EAS_COMPLETED" -eq 1 ]; then
    # EAS completato ma con errore
    if grep -qiE "(timeout|timed out|ETIMEDOUT|ECONNRESET)" "$EAS_LOG" 2>/dev/null; then
      echo "   ⚠️  EAS update andato in TIMEOUT (exit $EAS_EXIT) — il bundle custom è già attivo sul backend."
      echo "   PROCEDURA CORRETTA: pubblica una nuova OTA superseding con numero N+1."
      EAS_STATUS="TIMEOUT — pubblicare nuova OTA superseding con publish-ota.sh"
    else
      echo "   ⚠️  EAS update fallito (exit $EAS_EXIT) — custom backend rimane attivo."
      echo "   Errore:"
      tail -10 "$EAS_LOG" | sed 's/^/     /'
      echo "   PROCEDURA CORRETTA: pubblica una nuova OTA superseding con numero N+1."
      EAS_STATUS="FALLITO — pubblicare nuova OTA superseding con publish-ota.sh"
    fi
    rm -f "$EAS_LOG" "$EAS_EXIT_FILE"
    rm -rf "$EAS_STAGED_DIR"
  elif [ "$EAS_COMPLETED" -eq 1 ]; then
    # EAS completato con successo
    set +e
    EAS_UPDATE_GROUP_ID=$(grep -o 'Update group ID[[:space:]]*[a-f0-9-]*' "$EAS_LOG" 2>/dev/null | awk '{print $NF}' | head -1 || true)
    EAS_ANDROID_UPDATE_ID=$(grep -o 'Android update ID[[:space:]]*[a-f0-9-]*' "$EAS_LOG" 2>/dev/null | awk '{print $NF}' | head -1 || true)
    EAS_DASHBOARD_URL=$(grep -o 'https://expo\.dev/accounts/[^ ]*' "$EAS_LOG" 2>/dev/null | head -1 || true)
    set -e
    [ -z "$EAS_UPDATE_GROUP_ID" ] && EAS_UPDATE_GROUP_ID="N/A (vedi log EAS)"
    [ -z "$EAS_ANDROID_UPDATE_ID" ] && EAS_ANDROID_UPDATE_ID="N/A (vedi log EAS)"
    [ -z "$EAS_DASHBOARD_URL" ] && EAS_DASHBOARD_URL="N/A"
    EAS_STATUS="pubblicato"
    echo "   ✅ EAS update pubblicato — group: $EAS_UPDATE_GROUP_ID"
    rm -f "$EAS_LOG" "$EAS_EXIT_FILE"
    rm -rf "$EAS_STAGED_DIR"
  fi
  # In caso di background in corso (EAS_COMPLETED=0), NON eliminare EAS_LOG né EAS_STAGED_DIR
  # — sono necessari per il processo setsid ancora in esecuzione

  # ── Auto-recupero IDs EAS dopo timeout ──────────────────────────────────────
  # Se EAS è andato in timeout, aspetta 60s e prova a recuperare gli ID
  # interrogando prima il log (se il processo ha finito) poi l'API Expo GraphQL.
  # Se gli ID vengono trovati, aggiorna automaticamente ota-updates.json.
  if [ "$EAS_COMPLETED" -eq 0 ]; then
    echo ""
    echo "   ⏳ Auto-recupero EAS — attendo 60s e riprovo a leggere gli ID..."
    sleep 60

    # 1) Controlla se il processo ha terminato durante l'attesa
    if [ -f "$EAS_EXIT_FILE" ]; then
      EAS_EXIT_RECOVERED=$(cat "$EAS_EXIT_FILE")
      echo "   Processo EAS terminato (exit $EAS_EXIT_RECOVERED) — leggo il log..."
      if [ "$EAS_EXIT_RECOVERED" -eq 0 ]; then
        set +e
        EAS_UPDATE_GROUP_ID=$(grep -o 'Update group ID[[:space:]]*[a-f0-9-]*' "$EAS_LOG" 2>/dev/null | awk '{print $NF}' | head -1 || true)
        EAS_ANDROID_UPDATE_ID=$(grep -o 'Android update ID[[:space:]]*[a-f0-9-]*' "$EAS_LOG" 2>/dev/null | awk '{print $NF}' | head -1 || true)
        EAS_DASHBOARD_URL=$(grep -o 'https://expo\.dev/accounts/[^ ]*' "$EAS_LOG" 2>/dev/null | head -1 || true)
        set -e
        rm -f "$EAS_LOG" "$EAS_EXIT_FILE"
        rm -rf "$EAS_STAGED_DIR"
      else
        echo "   ⚠️  Processo EAS terminato con errore (exit $EAS_EXIT_RECOVERED)."
        rm -f "$EAS_LOG" "$EAS_EXIT_FILE"
        rm -rf "$EAS_STAGED_DIR"
      fi
    fi

    # 2) Se IDs non trovati nel log, interroga l'API Expo GraphQL
    if [ -z "${EAS_UPDATE_GROUP_ID:-}" ] || [ "${EAS_UPDATE_GROUP_ID:-}" = "N/A" ]; then
      echo "   Interrogo API Expo GraphQL per recuperare gli ID..."
      GQL_QUERY='{"query":"{ app { byFullName(fullName: \"@andreamasteri/bikerlink\") { updateBranchByName(name: \"preview\") { updates(limit: 10) { id group message createdAt } } } } }"}'
      set +e
      GQL_RESPONSE=$(curl -s --max-time 30 -X POST https://api.expo.dev/graphql \
        -H "Authorization: Bearer $EXPO_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$GQL_QUERY" 2>/dev/null || true)
      set -e

      if echo "${GQL_RESPONSE:-}" | grep -q '"updates"'; then
        # Filtra per messaggio == RELEASE_NOTES E createdAt >= PUBLISH_START_TS - 600s
        # per evitare di associare IDs di OTA diverse pubblicate sullo stesso branch.
        _GQL_NOTES="$RELEASE_NOTES"
        _GQL_START="$PUBLISH_START_TS"
        EAS_UPDATE_GROUP_ID=$(echo "$GQL_RESPONSE" | \
          EAS_NOTES="$_GQL_NOTES" EAS_START="$_GQL_START" node -e "
process.stdin.resume();
const chunks=[];
process.stdin.on('data',c=>chunks.push(c));
process.stdin.on('end',()=>{
  try{
    const d=JSON.parse(chunks.join(''));
    const all=(d&&d.data&&d.data.app&&d.data.app.byFullName&&d.data.app.byFullName.updateBranchByName&&d.data.app.byFullName.updateBranchByName.updates)||[];
    const notes=process.env.EAS_NOTES;
    const startTs=parseInt(process.env.EAS_START||'0',10);
    const match=all.find(u=>u.message===notes && (new Date(u.createdAt).getTime()/1000)>=(startTs-600));
    process.stdout.write((match&&match.group)||'');
  }catch(e){process.stdout.write('');}
});
" 2>/dev/null || true)
        EAS_ANDROID_UPDATE_ID=$(echo "$GQL_RESPONSE" | \
          EAS_NOTES="$_GQL_NOTES" EAS_START="$_GQL_START" node -e "
process.stdin.resume();
const chunks=[];
process.stdin.on('data',c=>chunks.push(c));
process.stdin.on('end',()=>{
  try{
    const d=JSON.parse(chunks.join(''));
    const all=(d&&d.data&&d.data.app&&d.data.app.byFullName&&d.data.app.byFullName.updateBranchByName&&d.data.app.byFullName.updateBranchByName.updates)||[];
    const notes=process.env.EAS_NOTES;
    const startTs=parseInt(process.env.EAS_START||'0',10);
    const match=all.find(u=>u.message===notes && (new Date(u.createdAt).getTime()/1000)>=(startTs-600));
    process.stdout.write((match&&match.id)||'');
  }catch(e){process.stdout.write('');}
});
" 2>/dev/null || true)
        if [ -z "${EAS_UPDATE_GROUP_ID:-}" ]; then
          echo "   ⚠️  Nessun update trovato su GraphQL con messaggio corrispondente e timestamp >= avvio EAS."
        fi
      else
        echo "   ⚠️  Risposta GraphQL non valida o IDs non ancora disponibili."
      fi
    fi

    # 3) Se IDs trovati, costruisci dashboard URL e aggiorna ota-updates.json
    if [ -n "${EAS_UPDATE_GROUP_ID:-}" ] && [ "${EAS_UPDATE_GROUP_ID:-}" != "N/A" ]; then
      [ -z "${EAS_DASHBOARD_URL:-}" ] && EAS_DASHBOARD_URL="https://expo.dev/accounts/andreamasteri/projects/bikerlink/updates/$EAS_UPDATE_GROUP_ID"
      EAS_STATUS="pubblicato (IDs recuperati automaticamente dopo timeout)"
      EAS_COMPLETED=1
      echo "   ✅ IDs EAS recuperati — group: $EAS_UPDATE_GROUP_ID"

      # Aggiorna ota-updates.json: trova entry con commitBase == GIT_COMMIT_HASH
      # e updateGroupId mancante/null, e imposta gli ID recuperati.
      OTA_JSON_FILE="$(cd "$(dirname "$0")/.." && pwd)/ota-updates.json"
      if [ -f "$OTA_JSON_FILE" ]; then
        set +e
        _UPD_RESULT=$(EAS_GRP="$EAS_UPDATE_GROUP_ID" \
          EAS_AID="$EAS_ANDROID_UPDATE_ID" \
          EAS_DASH="$EAS_DASHBOARD_URL" \
          OTA_COMMIT="$GIT_COMMIT_HASH" \
          OTA_FILE="$OTA_JSON_FILE" \
          node -e "
const fs=require('fs');
const file=process.env.OTA_FILE;
const grp=process.env.EAS_GRP;
const aid=process.env.EAS_AID;
const dash=process.env.EAS_DASH;
const commit=process.env.OTA_COMMIT;
try{
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  let updated=false;
  for(const e of data){
    if(e.commitBase===commit && (!e.updateGroupId||e.updateGroupId===null)){
      e.updateGroupId=grp;
      if(aid)e.androidUpdateId=aid;
      if(dash)e.easDashboard=dash;
      updated=true;
      break;
    }
  }
  if(updated){
    fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
    process.stdout.write('OK');
  }else{
    process.stdout.write('NO_MATCH');
  }
}catch(err){
  process.stderr.write(err.message);
  process.stdout.write('ERR');
}
" 2>/tmp/ota-json-update-err-$$.txt)
        _UPD_EXIT=$?
        set -e
        if [ "$_UPD_RESULT" = "OK" ] && [ $_UPD_EXIT -eq 0 ]; then
          echo "   ✅ ota-updates.json aggiornato automaticamente con gli ID recuperati"
        elif [ "$_UPD_RESULT" = "NO_MATCH" ]; then
          echo "   ⚠️  ota-updates.json: nessuna entry con commitBase=$GIT_COMMIT_SHORT e updateGroupId=null"
          echo "   Aggiorna manualmente: updateGroupId=$EAS_UPDATE_GROUP_ID"
        else
          echo "   ⚠️  Errore aggiornamento ota-updates.json: $(cat /tmp/ota-json-update-err-$$.txt 2>/dev/null || true)"
        fi
        rm -f "/tmp/ota-json-update-err-$$.txt"
      else
        echo "   ⚠️  ota-updates.json non trovato — aggiorna manualmente:"
        echo "   updateGroupId=$EAS_UPDATE_GROUP_ID"
        [ -n "${EAS_ANDROID_UPDATE_ID:-}" ] && echo "   androidUpdateId=$EAS_ANDROID_UPDATE_ID"
      fi
    else
      echo "   ⚠️  IDs EAS non disponibili dopo 60s di attesa."
      echo "   Dashboard: https://expo.dev/accounts/andreamasteri/projects/bikerlink/updates"
      echo "   Quando la pubblicazione EAS sarà completata, aggiorna manualmente ota-updates.json."
    fi
  fi
  # ── Fine auto-recupero ───────────────────────────────────────────────────────
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  ✅ Release OTA v${VERSION} pubblicata con successo!$(printf '%*s' $((17 - ${#VERSION})) '')║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  Commit hash      : $GIT_COMMIT_HASH"
echo "║  Release ID       : $RELEASE_ID"
echo "║  Bundle URL       : $BUNDLE_URL"
echo "║  Manifest URL     : $MANIFEST_URL"
echo "║  Versione att.    : $ACTIVE_VERSION"
echo "║  Bundle attivo    : $ACTIVE_BUNDLE"
echo "║  Pubblicato il    : $PUBLISHED_AT"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  EAS Status       : $EAS_STATUS"
echo "║  EAS Update Group : $EAS_UPDATE_GROUP_ID"
echo "║  EAS Android ID   : $EAS_ANDROID_UPDATE_ID"
echo "║  EAS Dashboard    : $EAS_DASHBOARD_URL"
if [ "$EAS_COMPLETED" != "1" ] && [ -n "${EAS_LOG:-}" ]; then
  echo "║  EAS Log (live)   : tail -f $EAS_LOG"
fi
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  ⑧ Aggiorna ota-updates.json con gli ID qui sopra             ║"
echo "║  ⑨ Riesegui: bash scripts/validate-ota.sh                     ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "   Tutti gli utenti riceveranno l'aggiornamento al prossimo avvio."
echo ""
