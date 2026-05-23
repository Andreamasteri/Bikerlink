#!/bin/bash
# ============================================================
#  BikerLink — OTA Publisher (2-stage, sandbox-friendly)
#
#  USO INTERATTIVO (sandbox Replit, dove i processi background
#  vengono "reaped" al termine del bash tool dopo ~60s):
#    bash scripts/publish-ota.sh export "messaggio"   # ~80s
#    bash scripts/publish-ota.sh publish              # ~30s
#
#  USO FOREGROUND (CI, terminale lungo):
#    bash scripts/publish-ota.sh "messaggio"          # ~110s totali
#
#  ROLLBACK MANUALE (dopo export, se decidi di non pubblicare):
#    bash scripts/publish-ota.sh rollback
#
#  Lo state file `.local/ota-state.json` (+ backup file affianco)
#  viene scritto da `export` e letto da `publish`/`rollback`.
#  Viene rimosso automaticamente al successo o al rollback.
#
#  Lo stage `publish` chiama anche /api/admin/ota/assign-slot per
#  promuovere la release a slot=stable (i client leggono solo dallo
#  slot stable; senza questa chiamata la release resta archiviata).
# ============================================================
set -euo pipefail

# ─── Configurazione ───────────────────────────────────────
BACKEND_URL="${BIKERLINK_BACKEND_URL:-https://biker-link.replit.app}"
PUBLIC_URL="${BIKERLINK_PUBLIC_URL:-$BACKEND_URL}"
DIST_DIR="dist-ota"
OTA_UPDATES_FILE="ota-updates.json"
OTA_TS_FILE="lib/ota.ts"
STATE_DIR=".local"
STATE_FILE="$STATE_DIR/ota-state.json"
STATE_OTA_TS_BAK="$STATE_DIR/ota-state.lib-ota.ts.bak"
STATE_OTA_UPDATES_BAK="$STATE_DIR/ota-state.ota-updates.json.bak"

ADMIN_EMAIL="${BIKERLINK_ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${BIKERLINK_ADMIN_PASSWORD:-}"

OTA_TOKEN_FILE="$STATE_DIR/ota-token"

# ─── Stato di esecuzione (locale al processo) ─────────────
ROLLBACK_NEEDED=0
COOKIE_JAR=""
KEEP_DIST=0

# ─── Usage ────────────────────────────────────────────────
usage() {
  cat <<EOF
Uso:
  $0 "messaggio"                          # legacy: export + publish in sequenza (foreground)
  $0 export "messaggio"                   # stage 1: bump + Metro export + verifica (~80s)
  $0 export "messaggio" "Note rilascio"   # stage 1 con note di rilascio separate
  $0 publish                              # stage 2: upload + create + publish + slot stable + verify + finalize (~30s)
  $0 rollback                             # ripristina lib/ota.ts e ota-updates.json dal backup
  $0 setup-token                          # genera token OTA e lo salva in .local/ota-token (una tantum)
  $0 revoke-token                         # revoca il token in .local/ota-token e lo elimina

Flusso raccomandato (senza password nell'environment):
  1. bash $0 setup-token                  # una tantum: richiede email/password admin, salva token
  2. bash $0 export "msg" "Note cambio"   # esporta bundle (note opzionali)
  3. bash $0 publish                      # pubblica — usa il token se .local/ota-token esiste

Variabili d'ambiente richieste (solo se .local/ota-token non esiste):
  BIKERLINK_ADMIN_EMAIL      — email account admin
  BIKERLINK_ADMIN_PASSWORD   — password account admin

Variabili d'ambiente opzionali:
  BIKERLINK_BACKEND_URL      — URL backend (default: https://biker-link.replit.app)
  BIKERLINK_PUBLIC_URL       — URL pubblico bundle (default: uguale a BACKEND_URL)

Per riattivare una release storica: bash scripts/rollback-ota.sh <updateNumber>
EOF
  exit 1
}

require_admin_creds() {
  # Se esiste un token OTA valido, le credenziali non sono necessarie
  if [ -f "$OTA_TOKEN_FILE" ] && [ -s "$OTA_TOKEN_FILE" ]; then
    return 0
  fi
  if [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ]; then
    echo "Errore: imposta BIKERLINK_ADMIN_EMAIL e BIKERLINK_ADMIN_PASSWORD"
    echo "  oppure genera un token con: bash $0 setup-token"
    exit 1
  fi
}

# ─── State file helper ────────────────────────────────────
# Read a scalar field from STATE_FILE. Returns non-zero if missing/null.
state_get() {
  STATE_FIELD="$1" STATE_FILE_PATH="$STATE_FILE" node -e "
    const s = JSON.parse(require('fs').readFileSync(process.env.STATE_FILE_PATH, 'utf8'));
    const v = s[process.env.STATE_FIELD];
    if (v === undefined || v === null) process.exit(1);
    process.stdout.write(String(v));
  " 2>/dev/null
}

# ─── Login admin (usato da setup-token e revoke-token) ───────
# Restituisce il session cookie in stdout; esce con 1 in caso di errore.
do_admin_login() {
  local email="${1:-$ADMIN_EMAIL}"
  local password="${2:-$ADMIN_PASSWORD}"
  if [ -z "$email" ]; then
    printf "Email admin: " >&2
    read -r email
  fi
  if [ -z "$password" ]; then
    printf "Password admin: " >&2
    read -rs password
    echo >&2
  fi
  local RAW_LOGIN LOGIN_BODY SESSION_COOKIE JSON_BODY
  JSON_BODY=$(node -e "process.stdout.write(JSON.stringify({identifier:process.argv[1],password:process.argv[2]}))" -- "$email" "$password")
  RAW_LOGIN=$(curl -s -D - -X POST "$BACKEND_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-Proto: https" \
    -d "$JSON_BODY")
  LOGIN_BODY=$(echo "$RAW_LOGIN" | awk 'BEGIN{body=0} /^\r$/{body=1; next} body{print}')
  if ! echo "$LOGIN_BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ try { const j=JSON.parse(d); process.exit(j.id ? 0 : 1); } catch { process.exit(1); } })" 2>/dev/null; then
    echo "ERRORE login: $LOGIN_BODY" >&2
    exit 1
  fi
  SESSION_COOKIE=$(echo "$RAW_LOGIN" | grep -i "^set-cookie:" | grep "connect.sid" | head -1 | sed 's/.*connect\.sid=\([^;]*\).*/connect.sid=\1/' | tr -d '\r')
  if [ -z "$SESSION_COOKIE" ]; then
    echo "ERRORE: nessun session cookie ricevuto" >&2
    exit 1
  fi
  echo "$SESSION_COOKIE"
}

# ─── setup-token: genera token OTA e lo salva in .local/ota-token ─
do_setup_token() {
  # Non eliminare dist-ota se creato da un export precedente
  KEEP_DIST=1
  mkdir -p "$STATE_DIR"

  # Se il token file esiste ed è non-vuoto, saltiamo la generazione
  if [ -f "$OTA_TOKEN_FILE" ] && [ -s "$OTA_TOKEN_FILE" ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════╗"
    echo "║  BikerLink OTA — Setup Token                     ║"
    echo "╚══════════════════════════════════════════════════╝"
    echo ""
    echo "  ✔ Token già presente in $OTA_TOKEN_FILE — skip generazione."
    echo "    Per rigenerarlo: rm $OTA_TOKEN_FILE && bash $0 setup-token"
    echo ""
    return 0
  fi

  echo ""
  echo "╔══════════════════════════════════════════════════╗"
  echo "║  BikerLink OTA — Setup Token                     ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo ""
  echo "  Backend: $BACKEND_URL"
  echo ""
  echo "  Login admin necessario per generare il token."
  echo "  Le credenziali non vengono salvate."
  echo ""

  local SESSION_COOKIE
  SESSION_COOKIE=$(do_admin_login) || exit 1
  echo "  ✔ Autenticato"

  local TOKEN_RESPONSE TOKEN_PLAIN TOKEN_ID
  TOKEN_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/admin/ota/token" \
    -H "Cookie: $SESSION_COOKIE" \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-Proto: https" \
    -d "{\"label\":\"publish-ota-script\",\"expiresInDays\":365}")
  TOKEN_PLAIN=$(echo "$TOKEN_RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ try { console.log(JSON.parse(d).token ?? ''); } catch { console.log(''); } })" 2>/dev/null || true)
  TOKEN_ID=$(echo "$TOKEN_RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ try { console.log(JSON.parse(d).id ?? ''); } catch { console.log(''); } })" 2>/dev/null || true)
  if [ -z "$TOKEN_PLAIN" ]; then
    echo "  ERRORE generazione token: $TOKEN_RESPONSE"
    exit 1
  fi

  echo "$TOKEN_PLAIN" > "$OTA_TOKEN_FILE"
  chmod 600 "$OTA_TOKEN_FILE"
  echo "  ✔ Token ID $TOKEN_ID salvato in $OTA_TOKEN_FILE (chmod 600)"
  echo "  ✔ Scadenza: 365 giorni da oggi"
  echo ""
  echo "  Prossimi step:"
  echo "    bash $0 export \"messaggio\"  # esporta bundle"
  echo "    bash $0 publish              # pubblica (usa il token automaticamente)"
  echo ""
  echo "  Per revocare il token in futuro:"
  echo "    bash $0 revoke-token"
  echo ""
}

# ─── revoke-token: revoca il token in .local/ota-token ────────────
do_revoke_token() {
  if [ ! -f "$OTA_TOKEN_FILE" ]; then
    echo "Errore: $OTA_TOKEN_FILE non trovato. Nulla da revocare."
    exit 1
  fi

  local RAW_TOKEN
  RAW_TOKEN=$(cat "$OTA_TOKEN_FILE")
  if [ -z "$RAW_TOKEN" ]; then
    echo "Errore: file $OTA_TOKEN_FILE vuoto."
    exit 1
  fi

  echo ""
  echo "╔══════════════════════════════════════════════════╗"
  echo "║  BikerLink OTA — Revoca Token                    ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo ""
  echo "  Backend: $BACKEND_URL"
  echo ""

  # Prima prova a ottenere la lista token con il token stesso (se non ancora scaduto).
  # Fallback: login admin.
  local SESSION_COOKIE
  SESSION_COOKIE=$(do_admin_login) || exit 1
  echo "  ✔ Autenticato"

  local TOKENS_RESPONSE TOKEN_ID
  TOKENS_RESPONSE=$(curl -s "$BACKEND_URL/api/admin/ota/tokens" \
    -H "Cookie: $SESSION_COOKIE" \
    -H "X-Forwarded-Proto: https")
  TOKEN_ID=$(echo "$TOKENS_RESPONSE" | node -e "
    const rawToken = process.argv[1];
    const crypto = require('crypto');
    // Non possiamo calcolare l'hash lato client qui facilmente.
    // Identifichiamo il token per label 'publish-ota-script' non ancora revocato.
    let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
      try {
        const tokens = JSON.parse(d);
        const t = tokens.find(x => x.label === 'publish-ota-script' && !x.revoked);
        console.log(t ? t.id : '');
      } catch { console.log(''); }
    });
  " 2>/dev/null || true)

  if [ -z "$TOKEN_ID" ]; then
    echo "  ⚠ Token non trovato nel DB (forse già revocato o label diversa)."
    echo "  Rimuovo solo il file locale."
    rm -f "$OTA_TOKEN_FILE"
    echo "  ✔ $OTA_TOKEN_FILE rimosso"
    exit 0
  fi

  local REVOKE_RESPONSE REVOKE_OK
  REVOKE_RESPONSE=$(curl -s -X DELETE "$BACKEND_URL/api/admin/ota/token/$TOKEN_ID" \
    -H "Cookie: $SESSION_COOKIE" \
    -H "X-Forwarded-Proto: https")
  REVOKE_OK=$(echo "$REVOKE_RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ try { const j=JSON.parse(d); process.stdout.write(j.ok ? '1' : ''); } catch { process.stdout.write(''); } })" 2>/dev/null || true)
  if [ "$REVOKE_OK" != "1" ]; then
    echo "  ERRORE revoca token ID $TOKEN_ID: $REVOKE_RESPONSE"
    exit 1
  fi

  rm -f "$OTA_TOKEN_FILE"
  echo "  ✔ Token ID $TOKEN_ID revocato nel DB"
  echo "  ✔ $OTA_TOKEN_FILE rimosso"
  echo ""
}

# ─── Restore from backup files (used by rollback + cleanup) ──
do_restore() {
  local orig_num
  if [ -f "$STATE_OTA_TS_BAK" ]; then
    cp "$STATE_OTA_TS_BAK" "$OTA_TS_FILE"
    orig_num=$(grep -oE 'CURRENT_OTA_NUMBER\s*=\s*[0-9]+' "$OTA_TS_FILE" | grep -oE '[0-9]+$' || echo "?")
    echo "   ✔ lib/ota.ts ripristinato (CURRENT_OTA_NUMBER=$orig_num)"
  fi
  if [ -f "$STATE_OTA_UPDATES_BAK" ]; then
    cp "$STATE_OTA_UPDATES_BAK" "$OTA_UPDATES_FILE"
    echo "   ✔ ota-updates.json ripristinato"
  fi
  rm -f "$STATE_FILE" "$STATE_OTA_TS_BAK" "$STATE_OTA_UPDATES_BAK"
  rm -rf "$DIST_DIR"
}

cleanup() {
  [ -n "$COOKIE_JAR" ] && rm -f "$COOKIE_JAR"
  [ "$KEEP_DIST" = "0" ] && rm -rf "$DIST_DIR"
  if [ "$ROLLBACK_NEEDED" = "1" ]; then
    echo ""
    echo "   ⚠ Rollback automatico in corso..."
    do_restore
    echo "   ✘ Pubblicazione annullata — stato pre-pubblicazione ripristinato"
  fi
}
trap cleanup EXIT

# ============================================================
#  STAGE 1 — EXPORT (A, B, C, D, E)
# ============================================================
do_export() {
  local RELEASE_MESSAGE="${1:-}"
  local RELEASE_NOTES="${2:-}"
  if [ -z "$RELEASE_MESSAGE" ]; then
    echo "Errore: messaggio di release richiesto per 'export'"
    usage
  fi

  # ─── Guard: Runtime Health Check (Sistema B) ─────────────────
  # Blocca il publish se il backend non è sano prima di qualsiasi modifica.
  echo ""
  echo "  [Health] Verifica runtime backend prima dell'export..."
  local SCRIPT_DIR
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if ! bash "$SCRIPT_DIR/check-runtime-health.sh" --quiet; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║  ⛔ EXPORT BLOCCATO — Backend non sano (ESITO: ROSSO)   ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    echo "║  Il check runtime ha rilevato almeno un problema        ║"
    echo "║  bloccante. Correggere i processi e riprovare.          ║"
    echo "║                                                          ║"
    echo "║  Diagnostica dettagliata:                                ║"
    echo "║    bash scripts/check-runtime-health.sh                 ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    exit 1
  fi
  echo "  [Health] ✔ Backend sano — export autorizzato"
  echo ""

  # ─── Guard: messaggio identico all'ultima OTA pubblicata ─────
  local DUP_CHECK
  DUP_CHECK=$(RELEASE_MSG_V="$RELEASE_MESSAGE" OTA_UPDATES_FILE_PATH="$OTA_UPDATES_FILE" node -e "
    const fs = require('fs');
    try {
      const appJson = JSON.parse(fs.readFileSync('app.json','utf8'));
      const rv = appJson?.expo?.runtimeVersion ?? null;
      const data = JSON.parse(fs.readFileSync(process.env.OTA_UPDATES_FILE_PATH,'utf8'));
      const cycle = data.filter(e => typeof e.updateNumber === 'number' && e.runtimeVersion === rv);
      if (cycle.length === 0) { console.log('OK'); process.exit(0); }
      const lastEntry = cycle[cycle.length - 1];
      const lastMsg = (lastEntry.message ?? '').trim().toLowerCase();
      const newMsg  = (process.env.RELEASE_MSG_V ?? '').trim().toLowerCase();
      if (lastMsg === newMsg) {
        console.log('DUPLICATE:OTA-' + lastEntry.updateNumber);
      } else {
        console.log('OK');
      }
    } catch(e) {
      console.log('READ_ERROR:' + e.message.replace(/\n/g,' '));
    }
  " 2>/dev/null || echo "READ_ERROR:node_failed")

  if [[ "$DUP_CHECK" == DUPLICATE:* ]]; then
    local DUP_OTA="${DUP_CHECK#DUPLICATE:}"
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║  ⛔ EXPORT BLOCCATO — Messaggio identico a $DUP_OTA      ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    echo "║  Il messaggio fornito è uguale (case-insensitive) al    ║"
    echo "║  messaggio dell'ultima OTA già pubblicata:              ║"
    echo "║                                                          ║"
    echo "║  \"$RELEASE_MESSAGE\""
    echo "║                                                          ║"
    echo "║  Fornire un messaggio distinto che descriva le          ║"
    echo "║  modifiche reali incluse in questa OTA.                 ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    exit 1
  elif [[ "$DUP_CHECK" == READ_ERROR:* ]]; then
    echo "   ⚠ Impossibile verificare il messaggio dell'ultima OTA: ${DUP_CHECK#READ_ERROR:}"
    echo "   Procedendo con cautela..."
  fi

  # ─── Guard: stage file esistente → Stage 2 ancora pendente ──
  # Non richiedere stdin: questo script può essere eseguito da workflow
  # non interattivi e una read() vuota causerebbe exit silenzioso.
  if [ -f "$STATE_FILE" ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║  🔒 EXPORT BLOCCATO — Stage 2 ancora pendente           ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    echo "║  State file trovato: $STATE_FILE"
    echo "║  Una OTA è stata esportata ma non ancora pubblicata.    ║"
    echo "║                                                          ║"
    echo "║  Opzioni:                                                ║"
    echo "║    bash $0 publish    — esegui Stage 2 (pubblica)  ║"
    echo "║    bash $0 rollback   — annulla l'export esistente  ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    exit 1
  fi

  # ─── Guard: entry pending in ota-updates.json ─────────────────
  # Anche se il state file non esiste (es. rimosso manualmente),
  # ota-updates.json potrebbe avere un'entry con status='pending'
  # il che indica che Stage 2 non è ancora stato eseguito.
  local PENDING_GUARD
  PENDING_GUARD=$(OTA_UPDATES_FILE_PATH="$OTA_UPDATES_FILE" node -e "
    const fs = require('fs');
    try {
      const appJson = JSON.parse(fs.readFileSync('app.json','utf8'));
      const rv = appJson?.expo?.runtimeVersion ?? null;
      const data = JSON.parse(fs.readFileSync(process.env.OTA_UPDATES_FILE_PATH,'utf8'));
      const cycle = data.filter(e => typeof e.updateNumber === 'number' && e.runtimeVersion === rv);
      const pending = cycle.filter(e => e.status === 'pending');
      if (pending.length > 0) {
        const nums = pending.map(e => 'OTA-' + e.updateNumber).join(', ');
        console.log('BLOCKED:' + nums);
      } else {
        console.log('OK');
      }
    } catch(e) {
      console.log('READ_ERROR:' + e.message.replace(/\n/g,' '));
    }
  " 2>/dev/null || echo "READ_ERROR:node_failed")

  if [[ "$PENDING_GUARD" == BLOCKED:* ]]; then
    local BLOCKED_ENTRIES="${PENDING_GUARD#BLOCKED:}"
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║  🔒 EXPORT BLOCCATO — Stage 2 ancora pendente           ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    echo "║  ota-updates.json ha entry con status='pending':        ║"
    echo "║    $BLOCKED_ENTRIES"
    echo "║                                                          ║"
    echo "║  Pubblicare prima lo Stage 2 pendente:                  ║"
    echo "║    bash $0 publish    — esegui Stage 2 (pubblica)  ║"
    echo "║    bash $0 rollback   — annulla l'export esistente  ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    exit 1
  elif [[ "$PENDING_GUARD" == READ_ERROR:* ]]; then
    echo "   ⚠ Impossibile verificare entry pending in $OTA_UPDATES_FILE: ${PENDING_GUARD#READ_ERROR:}"
    echo "   Procedendo con cautela..."
  fi

  mkdir -p "$STATE_DIR"

  # ─── Lettura runtimeVersion da app.json ───────────────────
  local RUNTIME_VERSION
  RUNTIME_VERSION=$(node -e "
    try {
      const j = JSON.parse(require('fs').readFileSync('app.json','utf8'));
      const rv = j?.expo?.runtimeVersion ?? null;
      if (!rv) { process.stderr.write('runtimeVersion non trovato in app.json\n'); process.exit(1); }
      process.stdout.write(rv);
    } catch(e) { process.stderr.write('Impossibile leggere app.json: ' + e.message + '\n'); process.exit(1); }
  " 2>&1) || { echo "   ERRORE: $RUNTIME_VERSION"; exit 1; }

  # ─── Calcolo automatico updateNumber ──────────────────────
  local NEXT_OTA_INFO
  NEXT_OTA_INFO=$(node -e "
    const fs = require('fs');
    const appJson = JSON.parse(fs.readFileSync('app.json','utf8'));
    const rv = appJson?.expo?.runtimeVersion ?? null;
    const data = JSON.parse(fs.readFileSync('$OTA_UPDATES_FILE','utf8'));
    const cycle = data.filter(e => typeof e.updateNumber === 'number' && e.runtimeVersion === rv);
    const lastNum = cycle.length > 0 ? cycle[cycle.length - 1].updateNumber : 0;
    const nextNum = lastNum + 1;
    const lastEntry = cycle.length > 0 ? cycle[cycle.length - 1] : null;
    console.log(JSON.stringify({
      nextNum, lastNum,
      apkBuildId: lastEntry?.apkBuildId ?? null,
      apkVersionCode: lastEntry?.apkVersionCode ?? null,
      apkVersionName: lastEntry?.apkVersionName ?? null,
      apkUrl: lastEntry?.apkUrl ?? null,
      apkBuildDashboard: lastEntry?.apkBuildDashboard ?? null
    }));
  " 2>/dev/null) || { echo "   ERRORE: impossibile calcolare updateNumber"; exit 1; }

  local NEXT_OTA LAST_OTA APK_BUILD_ID APK_VERSION_CODE APK_VERSION_NAME APK_URL APK_BUILD_DASHBOARD
  NEXT_OTA=$(echo "$NEXT_OTA_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).nextNum))")
  LAST_OTA=$(echo "$NEXT_OTA_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).lastNum))")
  APK_BUILD_ID=$(echo "$NEXT_OTA_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ const j=JSON.parse(d); console.log(j.apkBuildId ?? ''); })")
  APK_VERSION_CODE=$(echo "$NEXT_OTA_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ const j=JSON.parse(d); console.log(j.apkVersionCode ?? ''); })")
  APK_VERSION_NAME=$(echo "$NEXT_OTA_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ const j=JSON.parse(d); console.log(j.apkVersionName ?? ''); })")
  APK_URL=$(echo "$NEXT_OTA_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ const j=JSON.parse(d); console.log(j.apkUrl ?? ''); })")
  APK_BUILD_DASHBOARD=$(echo "$NEXT_OTA_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ const j=JSON.parse(d); console.log(j.apkBuildDashboard ?? ''); })")

  # Formato versione OTA: <build>.<updateNumber>.<ciclo_ota>
  # 48 = versionCode APK corrente, NEXT_OTA = numero progressivo OTA nel ciclo, 10 = ciclo runtimeVersion (10.0.0)
  local VERSION="48.${NEXT_OTA}.10"
  local GIT_COMMIT_HASH GIT_COMMIT_SHORT
  GIT_COMMIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "N/A")
  GIT_COMMIT_SHORT="${GIT_COMMIT_HASH:0:12}"

  echo ""
  echo "╔══════════════════════════════════════════════════╗"
  echo "║  BikerLink OTA Publisher — Stage 1: EXPORT       ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo ""
  echo "  OTA-$NEXT_OTA (rv $RUNTIME_VERSION) — v$VERSION"
  echo "  Commit: $GIT_COMMIT_SHORT"
  echo "  Backend: $BACKEND_URL"
  echo ""

  # ─── Backup file originali per rollback ───────────────────
  cp "$OTA_TS_FILE" "$STATE_OTA_TS_BAK"
  cp "$OTA_UPDATES_FILE" "$STATE_OTA_UPDATES_BAK"
  local ORIG_OTA_NUMBER
  ORIG_OTA_NUMBER=$(grep -oE 'CURRENT_OTA_NUMBER\s*=\s*[0-9]+' "$OTA_TS_FILE" | grep -oE '[0-9]+$' || echo "")
  ROLLBACK_NEEDED=1

  # Scrivi state file iniziale
  NEXT_OTA_V="$NEXT_OTA" \
  RUNTIME_VERSION_V="$RUNTIME_VERSION" \
  VERSION_V="$VERSION" \
  RELEASE_MESSAGE_V="$RELEASE_MESSAGE" \
  RELEASE_NOTES_V="$RELEASE_NOTES" \
  ORIG_OTA_NUMBER_V="$ORIG_OTA_NUMBER" \
  GIT_COMMIT_HASH_V="$GIT_COMMIT_HASH" \
  APK_BUILD_ID_V="$APK_BUILD_ID" \
  APK_VERSION_CODE_V="$APK_VERSION_CODE" \
  APK_VERSION_NAME_V="$APK_VERSION_NAME" \
  APK_URL_V="$APK_URL" \
  APK_BUILD_DASHBOARD_V="$APK_BUILD_DASHBOARD" \
  STATE_FILE_PATH="$STATE_FILE" \
  node -e "
    const fs = require('fs');
    const state = {
      stage: 'export-started',
      nextOta: parseInt(process.env.NEXT_OTA_V, 10),
      runtimeVersion: process.env.RUNTIME_VERSION_V,
      version: process.env.VERSION_V,
      releaseMessage: process.env.RELEASE_MESSAGE_V,
      releaseNotes: process.env.RELEASE_NOTES_V || null,
      origOtaNumber: process.env.ORIG_OTA_NUMBER_V,
      gitCommitHash: process.env.GIT_COMMIT_HASH_V,
      apkBuildId: process.env.APK_BUILD_ID_V || null,
      apkVersionCode: process.env.APK_VERSION_CODE_V || null,
      apkVersionName: process.env.APK_VERSION_NAME_V || null,
      apkUrl: process.env.APK_URL_V || null,
      apkBuildDashboard: process.env.APK_BUILD_DASHBOARD_V || null,
      bundleFile: null,
      bundleUrl: null,
      releaseId: null,
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(process.env.STATE_FILE_PATH, JSON.stringify(state, null, 2) + '\n');
  "

  # ─── Step A ───────────────────────────────────────────────
  echo "[A] Aggiornamento CURRENT_OTA_NUMBER in lib/ota.ts ($ORIG_OTA_NUMBER → $NEXT_OTA)..."
  local COMMENT_LINE="// ⚠️ CHECKLIST RELEASE: aggiornare questo numero PRIMA di ogni pubblicazione OTA
// Ciclo $RUNTIME_VERSION — APK v${APK_VERSION_CODE:-?} — aggiornare ad ogni nuova OTA pubblicata"
  # Scrive anche __OTA_BUILD_TAG__: stringa letterale che sopravvive alla
  # minificazione Hermes e permette al step E di verificare il bundle
  # senza ambiguità con le note storiche in ota-updates.json.
  printf '%s\nexport const CURRENT_OTA_NUMBER = %s;\nexport const __OTA_BUILD_TAG__ = "BL-OTA-%s";\n' \
    "$COMMENT_LINE" "$NEXT_OTA" "$NEXT_OTA" > "$OTA_TS_FILE"
  echo "   ✔ CURRENT_OTA_NUMBER=$NEXT_OTA"

  # ─── Step B ───────────────────────────────────────────────
  echo "[B] Aggiornamento ota-updates.json (supersede OTA-$LAST_OTA, inserisce OTA-$NEXT_OTA pending)..."
  OTA_UPDATES_FILE="$OTA_UPDATES_FILE" \
  OTA_NEXT="$NEXT_OTA" \
  OTA_VERSION="$VERSION" \
  OTA_RUNTIME_VERSION="$RUNTIME_VERSION" \
  OTA_COMMIT="$GIT_COMMIT_HASH" \
  OTA_APK_BUILD_ID="$APK_BUILD_ID" \
  OTA_APK_VERSION_CODE="$APK_VERSION_CODE" \
  OTA_APK_VERSION_NAME="$APK_VERSION_NAME" \
  OTA_APK_URL="$APK_URL" \
  OTA_APK_BUILD_DASHBOARD="$APK_BUILD_DASHBOARD" \
  OTA_RELEASE_MESSAGE="$RELEASE_MESSAGE" \
  node -e "
    const fs = require('fs');
    const rv = process.env.OTA_RUNTIME_VERSION;
    const nextNum = parseInt(process.env.OTA_NEXT, 10);
    const releaseMsg = process.env.OTA_RELEASE_MESSAGE;
    const data = JSON.parse(fs.readFileSync(process.env.OTA_UPDATES_FILE, 'utf8'));
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].runtimeVersion === rv && typeof data[i].updateNumber === 'number') {
        if (data[i].status === 'published' || data[i].status === 'active') {
          data[i].status = 'superseded';
          break;
        }
      }
    }
    const apkVersionCode = process.env.OTA_APK_VERSION_CODE ? parseInt(process.env.OTA_APK_VERSION_CODE, 10) : null;
    const newEntry = {
      updateNumber: nextNum,
      version: process.env.OTA_VERSION,
      cycle: (rv.split('.')[0] || '?') + '.x',
      channel: 'preview',
      platform: 'android',
      message: JSON.stringify('OTA-' + nextNum + ' rv' + rv + ': ' + releaseMsg).slice(1, -1),
      note: 'CURRENT_OTA_NUMBER=' + nextNum + '. Pubblicato da publish-ota.sh (2-stage).',
      runtimeVersion: rv,
      jsEngine: 'hermes',
      platforms: ['android'],
      releaseId: null,
      bundleUrl: null,
      updateGroupId: null,
      androidUpdateId: null,
      iosUpdateId: null,
      commitBase: process.env.OTA_COMMIT,
      easDashboard: null,
      apkBuildId: process.env.OTA_APK_BUILD_ID || null,
      apkBuildDashboard: process.env.OTA_APK_BUILD_DASHBOARD || null,
      apkVersionCode: apkVersionCode,
      apkVersionName: process.env.OTA_APK_VERSION_NAME || null,
      apkUrl: process.env.OTA_APK_URL || null,
      status: 'pending'
    };
    data.push(newEntry);
    fs.writeFileSync(process.env.OTA_UPDATES_FILE, JSON.stringify(data, null, 2) + '\n');
  " || { echo "   ERRORE: impossibile aggiornare $OTA_UPDATES_FILE"; exit 1; }
  echo "   ✔ Entry OTA-$NEXT_OTA inserita (pending)"

  # ─── Step C ───────────────────────────────────────────────
  echo "[C] Esportazione bundle JavaScript (Metro --reset-cache)..."
  rm -rf "$DIST_DIR"
  local EXPO_LOG="/tmp/ota-expo-$$.log"
  if ! EXPO_PUBLIC_DOMAIN=biker-link.replit.app npx expo export --platform android --output-dir "$DIST_DIR" --reset-cache > "$EXPO_LOG" 2>&1; then
    echo "   ERRORE: expo export fallito"
    tail -20 "$EXPO_LOG"
    rm -f "$EXPO_LOG"
    exit 1
  fi
  grep -E "(✓|✗|Bundle|Error)" "$EXPO_LOG" | tail -5 || true
  rm -f "$EXPO_LOG"
  echo "   ✔ Esportazione completata"

  # ─── Step D ───────────────────────────────────────────────
  echo "[D] Ricerca bundle principale..."
  local ANDROID_DIR="$DIST_DIR/_expo/static/js/android"
  if [ ! -d "$ANDROID_DIR" ]; then
    echo "   ERRORE: directory $ANDROID_DIR non trovata"
    find "$DIST_DIR" -type f 2>/dev/null | head -20
    exit 1
  fi

  local BUNDLE_FILE
  BUNDLE_FILE=$(find "$ANDROID_DIR" \( -name "index*.hbc" -o -name "index*.js" -o -name "entry*.hbc" -o -name "entry*.js" \) ! -name "*.map" 2>/dev/null | head -1)
  if [ -z "$BUNDLE_FILE" ]; then
    BUNDLE_FILE=$(find "$ANDROID_DIR" \( -name "*.hbc" -o -name "*.js" \) ! -name "*.map" -type f 2>/dev/null \
      -exec wc -c {} + 2>/dev/null | sort -n | tail -2 | head -1 | awk '{print $2}')
  fi

  if [ -z "$BUNDLE_FILE" ] || [ ! -f "$BUNDLE_FILE" ]; then
    echo "   ERRORE: bundle non trovato in $ANDROID_DIR"
    find "$DIST_DIR" -type f 2>/dev/null | head -20
    exit 1
  fi

  local BUNDLE_SIZE BUNDLE_SIZE_HUMAN
  BUNDLE_SIZE=$(wc -c < "$BUNDLE_FILE")
  BUNDLE_SIZE_HUMAN=$(node -e "const s=$BUNDLE_SIZE; process.stdout.write(s>1048576 ? (s/1048576).toFixed(1)+' MB' : Math.round(s/1024)+' KB')")
  echo "   ✔ Bundle trovato: $(basename "$BUNDLE_FILE") ($BUNDLE_SIZE_HUMAN)"

  # ─── Step E ───────────────────────────────────────────────
  # Usa il marker stringa "BL-OTA-N" scritto in lib/ota.ts (__OTA_BUILD_TAG__).
  # Le stringhe letterali sopravvivono alla minificazione Hermes, a differenza
  # del nome della variabile CURRENT_OTA_NUMBER che viene rinominata dal bundler.
  # "BL-OTA-N" è univoco e non compare nelle note storiche di ota-updates.json
  # (che usavano "CURRENT_OTA_NUMBER=N" causando falsi positivi — fixed).
  echo "[E] Verifica marker BL-OTA-$NEXT_OTA nel bundle compilato..."
  local BUNDLE_EXT="${BUNDLE_FILE##*.}"
  if grep -qoa "BL-OTA-${NEXT_OTA}[^0-9]" "$BUNDLE_FILE" 2>/dev/null || \
     grep -qoa "BL-OTA-${NEXT_OTA}\"" "$BUNDLE_FILE" 2>/dev/null; then
    echo "   ✔ Bundle verificato: BL-OTA-$NEXT_OTA trovato (corretto)"
  else
    # Nessun marker trovato — lib/ota.ts non aggiornato o Metro cache stale
    local FOUND_MARKER
    FOUND_MARKER=$(grep -oa "BL-OTA-[0-9]*" "$BUNDLE_FILE" 2>/dev/null | grep -oE "[0-9]+$" | sort -n | tail -1 || true)
    if [ -z "$FOUND_MARKER" ]; then
      echo ""
      echo "   ╔════════════════════════════════════════════════════════╗"
      echo "   ║  ❌ PUBBLICAZIONE BLOCCATA — marker non trovato       ║"
      echo "   ║  BL-OTA-$NEXT_OTA non trovato nel bundle ($BUNDLE_EXT)   ║"
      echo "   ║  Assicurarsi che lib/ota.ts esporti __OTA_BUILD_TAG__ ║"
      echo "   ╚════════════════════════════════════════════════════════╝"
    else
      echo ""
      echo "   ╔════════════════════════════════════════════════════════╗"
      echo "   ║  ❌ PUBBLICAZIONE BLOCCATA — marker errato nel bundle ║"
      echo "   ║  Bundle contiene BL-OTA-$FOUND_MARKER                  "
      echo "   ║  Atteso:          BL-OTA-$NEXT_OTA                     "
      echo "   ║  Probabile cache Metro stale — riprovare.             ║"
      echo "   ╚════════════════════════════════════════════════════════╝"
    fi
    exit 1
  fi

  # ─── Aggiorna state file con bundleFile e marca stage=exported ──
  BUNDLE_FILE_V="$BUNDLE_FILE" \
  STATE_FILE_PATH="$STATE_FILE" \
  node -e "
    const fs = require('fs');
    const s = JSON.parse(fs.readFileSync(process.env.STATE_FILE_PATH, 'utf8'));
    s.stage = 'exported';
    s.bundleFile = process.env.BUNDLE_FILE_V;
    fs.writeFileSync(process.env.STATE_FILE_PATH, JSON.stringify(s, null, 2) + '\n');
  "

  # Stage 1 completato — non rollbackare, non rimuovere dist
  ROLLBACK_NEEDED=0
  KEEP_DIST=1

  echo ""
  echo "✅ Stage 1 (EXPORT) completato."
  echo "   State file: $STATE_FILE"
  echo "   Bundle: $BUNDLE_FILE"
  echo ""
  echo "   Prossimo step:"
  echo "     bash $0 publish        # pubblica su produzione (~30s)"
  echo "   Per annullare:"
  echo "     bash $0 rollback       # ripristina file e rimuove bundle"
  echo ""
}

# ============================================================
#  STAGE 2 — PUBLISH (F, G, H, I, I+slot, J, K)
# ============================================================
do_publish() {
  # Proteggi dist-ota da cleanup su preflight failure: il bundle dello Stage 1
  # deve sopravvivere a qualsiasi errore prima dello step F (upload riuscito).
  # Verrà rimosso esplicitamente al successo finale (vedi fine do_publish).
  KEEP_DIST=1

  if [ ! -f "$STATE_FILE" ]; then
    echo "Errore: state file $STATE_FILE non trovato."
    echo "Esegui prima: bash $0 export \"messaggio\""
    exit 1
  fi

  local STAGE NEXT_OTA RUNTIME_VERSION VERSION RELEASE_MESSAGE BUNDLE_FILE GIT_COMMIT_HASH GIT_COMMIT_SHORT
  STAGE=$(state_get stage) || { echo "Errore: stage non leggibile da state file"; exit 1; }
  if [ "$STAGE" != "exported" ] && [ "$STAGE" != "uploaded" ]; then
    echo "Errore: state file in stato '$STAGE' — atteso 'exported' o 'uploaded'."
    echo "Possibile crash a metà export. Eseguire: bash $0 rollback"
    exit 1
  fi

  NEXT_OTA=$(state_get nextOta)
  RUNTIME_VERSION=$(state_get runtimeVersion)
  VERSION=$(state_get version)
  RELEASE_MESSAGE=$(state_get releaseMessage)
  RELEASE_NOTES=$(state_get releaseNotes 2>/dev/null || true)
  BUNDLE_FILE=$(state_get bundleFile)
  GIT_COMMIT_HASH=$(state_get gitCommitHash)
  GIT_COMMIT_SHORT="${GIT_COMMIT_HASH:0:12}"

  if [ ! -f "$BUNDLE_FILE" ]; then
    echo "Errore: bundle $BUNDLE_FILE non più presente."
    echo "Re-esportare con: bash $0 rollback && bash $0 export \"messaggio\""
    exit 1
  fi

  # ─── Guard: Runtime Health Check (Sistema B) ─────────────────
  # Gate definitivo prima della pubblicazione live: blocca se backend non sano.
  echo ""
  echo "  [Health] Verifica runtime backend prima del publish..."
  local SCRIPT_DIR_PUB
  SCRIPT_DIR_PUB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if ! bash "$SCRIPT_DIR_PUB/check-runtime-health.sh" --quiet; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║  ⛔ PUBLISH BLOCCATO — Backend non sano (ESITO: ROSSO)  ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    echo "║  Il check runtime ha rilevato almeno un problema        ║"
    echo "║  bloccante. Correggere i processi e riprovare.          ║"
    echo "║                                                          ║"
    echo "║  Il bundle OTA-$NEXT_OTA è già esportato e può essere   ║"
    echo "║  ripubblicato non appena il backend è sano:             ║"
    echo "║    bash $0 publish                                  ║"
    echo "║                                                          ║"
    echo "║  Diagnostica dettagliata:                                ║"
    echo "║    bash scripts/check-runtime-health.sh                 ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    exit 1
  fi
  echo "  [Health] ✔ Backend sano — publish autorizzato"

  # Da qui ogni errore deve attivare rollback dei file locali
  ROLLBACK_NEEDED=1

  echo ""
  echo "╔══════════════════════════════════════════════════╗"
  echo "║  BikerLink OTA Publisher — Stage 2: PUBLISH      ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo ""
  echo "  OTA-$NEXT_OTA (rv $RUNTIME_VERSION) — v$VERSION"
  echo "  Commit: $GIT_COMMIT_SHORT"
  echo "  Bundle: $(basename "$BUNDLE_FILE")"
  echo "  Backend: $BACKEND_URL"
  echo ""

  # ─── Step F: Upload bundle su object storage ──────────────
  echo "[F] Upload bundle su object storage..."
  local UPLOAD_RESPONSE BUNDLE_URL
  UPLOAD_RESPONSE=$(node "$(dirname "$0")/ota-upload-bundle.mjs" "$BUNDLE_FILE" "$VERSION" 2>&1)
  BUNDLE_URL=$(echo "$UPLOAD_RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ try { console.log(JSON.parse(d).url ?? ''); } catch { console.log(''); } })" 2>/dev/null || true)
  if [ -z "$BUNDLE_URL" ]; then
    echo "   ERRORE upload: $UPLOAD_RESPONSE"
    exit 1
  fi
  echo "   ✔ Bundle URL: $BUNDLE_URL"

  # Persisti bundleUrl in state file (per debug/audit)
  BUNDLE_URL_V="$BUNDLE_URL" STATE_FILE_PATH="$STATE_FILE" node -e "
    const fs = require('fs');
    const s = JSON.parse(fs.readFileSync(process.env.STATE_FILE_PATH, 'utf8'));
    s.bundleUrl = process.env.BUNDLE_URL_V;
    s.stage = 'uploaded';
    fs.writeFileSync(process.env.STATE_FILE_PATH, JSON.stringify(s, null, 2) + '\n');
  "

  # ─── Step G: Autenticazione (token + session login) ──────────
  # Il token OTA viene usato per POST /ota (create).
  # Il session cookie viene usato per POST /ota/:id/publish che richiede
  # assertAdminSession (session-based auth).
  local OTA_TOKEN="" SESSION_COOKIE="" AUTH_HEADER=""
  if [ -f "$OTA_TOKEN_FILE" ]; then
    OTA_TOKEN=$(cat "$OTA_TOKEN_FILE")
    if [ -n "$OTA_TOKEN" ]; then
      echo "[G] Token OTA trovato in $OTA_TOKEN_FILE."
      AUTH_HEADER="Authorization: Bearer $OTA_TOKEN"
    fi
  fi
  # Session login: sempre necessario per il publish endpoint (assertAdminSession).
  echo "[G] Login admin su $BACKEND_URL per session auth..."
  require_admin_creds
  SESSION_COOKIE=$(do_admin_login "$ADMIN_EMAIL" "$ADMIN_PASSWORD") || exit 1
  echo "   ✔ Autenticato (session)"

  # auth_curl: usa token OTA (per create); session_curl: usa cookie (per publish).
  auth_curl() {
    if [ -n "$OTA_TOKEN" ]; then
      curl -s -H "$AUTH_HEADER" -H "X-Forwarded-Proto: https" "$@"
    else
      curl -s -H "Cookie: $SESSION_COOKIE" -H "X-Forwarded-Proto: https" "$@"
    fi
  }
  session_curl() {
    curl -s -H "Cookie: $SESSION_COOKIE" -H "X-Forwarded-Proto: https" "$@"
  }

  # ─── Step H: Creazione release draft ──────────────────────
  echo "[H] Creazione release OTA (draft)..."
  local NOTES_JSON RV_JSON CREATE_RESPONSE RELEASE_ID
  # Se sono state fornite note di rilascio separate, usarle; altrimenti usa il messaggio.
  local EFFECTIVE_NOTES="${RELEASE_NOTES:-OTA-$NEXT_OTA rv$RUNTIME_VERSION: $RELEASE_MESSAGE}"
  NOTES_JSON=$(node -e "process.stdout.write(JSON.stringify(process.argv[1]))" -- "$EFFECTIVE_NOTES")
  RV_JSON=$(node -e "process.stdout.write(JSON.stringify(process.argv[1]))" -- "$RUNTIME_VERSION")
  CREATE_RESPONSE=$(auth_curl -X POST "$BACKEND_URL/api/admin/ota" \
    -H "Content-Type: application/json" \
    -d "{\"version\":\"$VERSION\",\"runtimeVersion\":$RV_JSON,\"bundlePath\":\"$BUNDLE_URL\",\"releaseNotes\":$NOTES_JSON}")
  RELEASE_ID=$(echo "$CREATE_RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ try { console.log(JSON.parse(d).id ?? ''); } catch { console.log(''); } })" 2>/dev/null || true)
  if [ -z "$RELEASE_ID" ]; then
    echo "   ERRORE creazione release: $CREATE_RESPONSE"
    exit 1
  fi
  echo "   ✔ Release creata — ID: $RELEASE_ID"

  # Persisti releaseId in state file
  RELEASE_ID_V="$RELEASE_ID" STATE_FILE_PATH="$STATE_FILE" node -e "
    const fs = require('fs');
    const s = JSON.parse(fs.readFileSync(process.env.STATE_FILE_PATH, 'utf8'));
    s.releaseId = process.env.RELEASE_ID_V;
    fs.writeFileSync(process.env.STATE_FILE_PATH, JSON.stringify(s, null, 2) + '\n');
  "

  # ─── Step I: Pubblicazione release ────────────────────────
  # Usa session_curl (cookie admin) perché assertAdminSession richiede req.session.userId.
  echo "[I] Pubblicazione release..."
  local PUBLISH_RESPONSE PUBLISH_STATUS
  PUBLISH_RESPONSE=$(session_curl -X POST "$BACKEND_URL/api/admin/ota/$RELEASE_ID/publish")
  PUBLISH_STATUS=$(echo "$PUBLISH_RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ try { console.log(JSON.parse(d).status ?? ''); } catch { console.log(''); } })" 2>/dev/null || true)
  if [ "$PUBLISH_STATUS" != "active" ]; then
    echo "   ERRORE pubblicazione: $PUBLISH_RESPONSE"
    exit 1
  fi
  echo "   ✔ Release pubblicata (status: active)"

  # ─── Step I+: Verifica che la release sia in slot=admin-preview ────
  # Il publish endpoint ora promuove a admin-preview (approved=false) per il
  # test admin prima della distribuzione. Verifichiamo che la risposta lo confermi.
  local PUBLISHED_SLOT PUBLISHED_APPROVED
  PUBLISHED_SLOT=$(echo "$PUBLISH_RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ try { console.log(JSON.parse(d).slot ?? ''); } catch { console.log(''); } })" 2>/dev/null || true)
  PUBLISHED_APPROVED=$(echo "$PUBLISH_RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ try { console.log(JSON.parse(d).approved ? 'true' : 'false'); } catch { console.log('false'); } })" 2>/dev/null || true)
  if [ "$PUBLISHED_SLOT" = "admin-preview" ] && [ "$PUBLISHED_APPROVED" = "false" ]; then
    echo "   ✔ Release in admin-preview (slot=admin-preview, approved=false)"
    echo ""
    echo "   ╔══════════════════════════════════════════════════════════╗"
    echo "   ║  ⚠  OTA IN ATTESA DI TEST ADMIN                        ║"
    echo "   ║                                                          ║"
    echo "   ║  1. Apri BikerLink sul tuo dispositivo Android           ║"
    echo "   ║  2. Vai in: Profilo → Admin → Sistema OTA                ║"
    echo "   ║  3. Tocca  [Applica OTA]  per ricevere l'aggiornamento   ║"
    echo "   ║  4. Testa l'app                                          ║"
    echo "   ║  5. Tocca  [Distribuisci OTA]  per rilasciare a tutti    ║"
    echo "   ║                                                          ║"
    echo "   ║  Oppure usa il pannello web: /admin/ota                  ║"
    echo "   ╚══════════════════════════════════════════════════════════╝"
    echo ""
  else
    echo "   ⚠ Attenzione: risposta inattesa (slot=$PUBLISHED_SLOT, approved=$PUBLISHED_APPROVED)"
    echo "     Verificare il backend. Stato atteso: slot=admin-preview, approved=false"
  fi

  # ─── Step J: Verifica raggiungibilità backend ─────────────
  # La release è in slot=admin-preview (non ancora distribuita).
  # Verifichiamo solo che il backend risponda correttamente su /api/expo-updates.
  # 200/204/304 sono tutti accettabili — 200 significa che esiste un update
  # assegnato al device, 204 significa nessun update (normale per device senza
  # assignment admin-preview). Non blocchiamo su 204 perché è lo stato atteso.
  echo "[J] Verifica raggiungibilità backend (backoff max 30s)..."
  local MAX_WAIT=30 WAIT_INTERVAL=5 ELAPSED=0 VERIFIED=0
  while [ $ELAPSED -le $MAX_WAIT ]; do
    local HTTP_RESPONSE HTTP_CODE
    HTTP_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "expo-runtime-version: $RUNTIME_VERSION" \
      -H "expo-platform: android" \
      -H "expo-protocol-version: 1" \
      --max-time 10 \
      "$BACKEND_URL/api/expo-updates" 2>/dev/null || echo "CURL_FAILED")
    HTTP_CODE="$HTTP_RESPONSE"

    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "304" ]; then
      echo "   ✔ Backend raggiungibile (HTTP $HTTP_CODE)"
      VERIFIED=1
      break
    else
      echo "   ⚠ Produzione risponde HTTP $HTTP_CODE — retry in ${WAIT_INTERVAL}s..."
    fi
    sleep $WAIT_INTERVAL
    ELAPSED=$((ELAPSED + WAIT_INTERVAL))
  done

  if [ "$VERIFIED" != "1" ]; then
    echo ""
    echo "   ╔════════════════════════════════════════════════════════╗"
    echo "   ║  ❌ PUBBLICAZIONE BLOCCATA — backend non raggiungibile ║"
    echo "   ║  La release è nel DB ma il backend non risponde.      ║"
    echo "   ║  Verifica: bash scripts/validate-ota.sh               ║"
    echo "   ╚════════════════════════════════════════════════════════╝"
    exit 1
  fi

  # ─── Step K: Finalizzazione ota-updates.json ──────────────
  echo "[K] Finalizzazione ota-updates.json con ID reali..."
  OTA_UPDATES_FILE="$OTA_UPDATES_FILE" \
  OTA_NEXT="$NEXT_OTA" \
  OTA_RUNTIME_VERSION="$RUNTIME_VERSION" \
  OTA_RELEASE_ID="$RELEASE_ID" \
  OTA_BUNDLE_URL="$BUNDLE_URL" \
  node -e "
    const fs = require('fs');
    const rv = process.env.OTA_RUNTIME_VERSION;
    const nextNum = parseInt(process.env.OTA_NEXT, 10);
    const data = JSON.parse(fs.readFileSync(process.env.OTA_UPDATES_FILE, 'utf8'));
    let updated = false;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].updateNumber === nextNum && data[i].runtimeVersion === rv) {
        data[i].releaseId = process.env.OTA_RELEASE_ID;
        data[i].bundleUrl = process.env.OTA_BUNDLE_URL;
        data[i].status = 'published';
        data[i].publishedAt = new Date().toISOString();
        updated = true;
        break;
      }
    }
    if (!updated) { process.stderr.write('Entry OTA-' + nextNum + ' non trovata\n'); process.exit(1); }
    fs.writeFileSync(process.env.OTA_UPDATES_FILE, JSON.stringify(data, null, 2) + '\n');
  " || {
    echo ""
    echo "   ╔════════════════════════════════════════════════════════╗"
    echo "   ║  ⚠ Finalizzazione ota-updates.json fallita            ║"
    echo "   ║  Release LIVE in produzione: $RELEASE_ID  "
    echo "   ║  Aggiornare manualmente ota-updates.json.             ║"
    echo "   ║  NESSUN rollback (release già attiva).                ║"
    echo "   ╚════════════════════════════════════════════════════════╝"
    # Release già pubblica: non rollbackare, ma rimuovi state file/backup
    ROLLBACK_NEEDED=0
    rm -f "$STATE_FILE" "$STATE_OTA_TS_BAK" "$STATE_OTA_UPDATES_BAK"
    exit 1
  }
  echo "   ✔ ota-updates.json aggiornato (status: published)"

  # ─── Successo completo — pulisci tutto ────────────────────
  ROLLBACK_NEEDED=0
  KEEP_DIST=0
  rm -f "$STATE_FILE" "$STATE_OTA_TS_BAK" "$STATE_OTA_UPDATES_BAK"

  # ─── Step L: Generazione PDF schema OTA ───────────────────
  echo "[L] Generazione PDF schema OTA (docs/ota-schema-a4.pdf)..."
  if python3 scripts/generate-ota-schema.py; then
    echo "   ✔ PDF aggiornato: docs/ota-schema-a4.pdf"
  else
    echo "   ⚠ Generazione PDF fallita (non bloccante — OTA già attiva)"
  fi

  # ─── Step M: Aggiornamento skill bikerlink-ota-publish ────
  echo "[M] Aggiornamento skill bikerlink-ota-publish con OTA-$NEXT_OTA..."
  local SKILL_FILE=".agents/skills/bikerlink-ota-publish/SKILL.md"
  if [ -f "$SKILL_FILE" ]; then
    OTA_NEXT_VAR="$NEXT_OTA" \
    OTA_VERSION_VAR="$VERSION" \
    OTA_RELEASE_ID_VAR="$RELEASE_ID" \
    OTA_RUNTIME_VERSION_VAR="$RUNTIME_VERSION" \
    OTA_RELEASE_MSG_VAR="$RELEASE_MESSAGE" \
    SKILL_FILE_PATH="$SKILL_FILE" \
    node -e "
      const fs = require('fs');
      const path = process.env.SKILL_FILE_PATH;
      const nextOta = parseInt(process.env.OTA_NEXT_VAR, 10);
      const version = process.env.OTA_VERSION_VAR;
      const releaseId = process.env.OTA_RELEASE_ID_VAR;
      const msg = process.env.OTA_RELEASE_MSG_VAR;
      const shortId = releaseId.substring(0, 8);
      let content = fs.readFileSync(path, 'utf8');

      // 1. Aggiorna la riga 'OTA corrente' nella sezione Contesto fisso
      content = content.replace(
        /- \*\*OTA corrente\*\*: OTA-\d+[^\n]*/,
        \`- **OTA corrente**: OTA-\${nextOta} (ciclo 10.x)\`
      );

      // 2. Aggiorna CURRENT_OTA_NUMBER nella sezione Ciclo 10.x
      content = content.replace(
        /  - CURRENT_OTA_NUMBER=\d+[^\n]*/,
        \`  - CURRENT_OTA_NUMBER=\${nextOta}, __OTA_BUILD_TAG__=\"BL-OTA-\${nextOta}-cycle10\"\`
      );

      // 3. Aggiunge entry OTA nella sezione Ciclo 10.x dopo l'ultima riga '  - OTA-'
      const newEntry = \`  - OTA-\${nextOta} (v\${version}): \${msg}, releaseId: \\\`\${shortId}\\\`\`;
      const lastOtaIdx = content.lastIndexOf('\n  - OTA-');
      if (lastOtaIdx !== -1) {
        const endOfLine = content.indexOf('\n', lastOtaIdx + 1);
        const insertPos = endOfLine !== -1 ? endOfLine : content.length;
        content = content.slice(0, insertPos) + '\n' + newEntry + content.slice(insertPos);
      }

      fs.writeFileSync(path, content, 'utf8');
      process.stdout.write('OK');
    " 2>/dev/null && echo "   ✔ Skill aggiornata: OTA-$NEXT_OTA in $SKILL_FILE" \
      || echo "   ⚠ Aggiornamento skill fallito (non bloccante — OTA già attiva)"
  else
    echo "   ⚠ Skill file non trovato: $SKILL_FILE (non bloccante)"
  fi

  echo ""
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║  ✅ OTA-$NEXT_OTA in admin-preview — test prima di distribuire  ║"
  echo "╠══════════════════════════════════════════════════════════════════╣"
  printf "║  %-20s: %-43s║\n" "Commit" "$GIT_COMMIT_SHORT"
  printf "║  %-20s: %-43s║\n" "Release ID" "$RELEASE_ID"
  printf "║  %-20s: %-43s║\n" "Bundle URL" "$BUNDLE_URL"
  printf "║  %-20s: %-43s║\n" "Slot" "${PUBLISHED_SLOT:-admin-preview}"
  printf "║  %-20s: %-43s║\n" "Approvata" "no — test admin richiesto"
  printf "║  %-20s: %-43s║\n" "Rollback storico" "bash scripts/rollback-ota.sh $((NEXT_OTA - 1))"
  echo "╚══════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "   ⚠ La release NON è ancora disponibile a tutti gli utenti."
  echo "   Dopo il test admin, tocca [Distribuisci OTA] nell'app o usa:"
  echo "   POST /api/admin/ota/$RELEASE_ID/distribute"
  echo ""
}

# ============================================================
#  ROLLBACK MANUALE (annulla un export non ancora pubblicato)
# ============================================================
do_rollback_cmd() {
  if [ ! -f "$STATE_FILE" ] && [ ! -f "$STATE_OTA_TS_BAK" ] && [ ! -f "$STATE_OTA_UPDATES_BAK" ]; then
    echo "Nessun state file trovato — niente da rollbackare."
    exit 0
  fi
  echo ""
  echo "╔══════════════════════════════════════════════════╗"
  echo "║  BikerLink OTA Rollback — annulla export pending ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo ""
  do_restore
  echo ""
  echo "✔ Rollback completato. Stato pre-export ripristinato."
  echo ""
}

# ============================================================
#  Entry point — parse comando
# ============================================================
COMMAND="${1:-}"

if [ -z "$COMMAND" ]; then
  usage
fi

case "$COMMAND" in
  export)
    do_export "${2:-}" "${3:-}"
    ;;
  publish)
    do_publish
    ;;
  rollback)
    do_rollback_cmd
    ;;
  setup-token)
    do_setup_token
    ;;
  revoke-token)
    do_revoke_token
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    # Modalità legacy: $1 è il messaggio di release → esegui entrambi gli stage.
    # Non richiede credenziali admin se esiste .local/ota-token.
    if [ ! -f "$OTA_TOKEN_FILE" ]; then
      require_admin_creds
    fi
    do_export "$COMMAND"
    do_publish
    ;;
esac
