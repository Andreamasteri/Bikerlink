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

# ─── Stato di esecuzione (locale al processo) ─────────────
ROLLBACK_NEEDED=0
COOKIE_JAR=""
KEEP_DIST=0

# ─── Usage ────────────────────────────────────────────────
usage() {
  cat <<EOF
Uso:
  $0 "messaggio"             # legacy: export + publish in sequenza (foreground)
  $0 export "messaggio"      # stage 1: bump + Metro export + verifica (~80s)
  $0 publish                 # stage 2: upload + create + publish + slot stable + verify + finalize (~30s)
  $0 rollback                # ripristina lib/ota.ts e ota-updates.json dal backup

Variabili d'ambiente richieste (per export legacy e publish):
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
  if [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ]; then
    echo "Errore: imposta BIKERLINK_ADMIN_EMAIL e BIKERLINK_ADMIN_PASSWORD"
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
  if [ -z "$RELEASE_MESSAGE" ]; then
    echo "Errore: messaggio di release richiesto per 'export'"
    usage
  fi

  # State file pre-esistente → chiedi conferma prima di sovrascrivere
  if [ -f "$STATE_FILE" ]; then
    echo "⚠ State file esistente: $STATE_FILE"
    echo "  Una OTA è già stata esportata ma non pubblicata. Opzioni:"
    echo "  • bash $0 publish    — pubblica l'export esistente"
    echo "  • bash $0 rollback   — annulla l'export esistente"
    echo ""
    echo "  Sovrascrivo ora con un nuovo export? [y/N]"
    read -r CONFIRM
    if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
      exit 1
    fi
    do_restore
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
  # 46 = versionCode APK corrente, NEXT_OTA = numero progressivo OTA nel ciclo, 9 = ciclo runtimeVersion (9.0.0)
  local VERSION="46.${NEXT_OTA}.9"
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
  printf '%s\nexport const CURRENT_OTA_NUMBER = %s;\n' "$COMMENT_LINE" "$NEXT_OTA" > "$OTA_TS_FILE"
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
      cycle: '9.x',
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
  # Cerca corrispondenza ESATTA di NEXT_OTA per evitare falsi positivi:
  # ota-updates.json è importato staticamente nel bundle e contiene note storiche
  # del tipo "CURRENT_OTA_NUMBER=31. Pubblicato..." da tutti i cicli precedenti.
  # Usare sort+tail-1 (max) causa false failure all'apertura di ogni nuovo ciclo
  # (es. ciclo 9.x che parte da OTA-1 mentre il bundle contiene ancora note OTA-31).
  echo "[E] Verifica CURRENT_OTA_NUMBER=$NEXT_OTA nel bundle compilato..."
  local BUNDLE_EXT="${BUNDLE_FILE##*.}"
  local FOUND_OTA=""
  # Cerca corrispondenza ESATTA con grep -oa (funziona su .hbc e .js).
  # grep -oa estrae tutti i match del pattern dal binario — molto più affidabile
  # di `strings` (che su NixOS/HBC produce output non delimitato da newline).
  # Strategia:
  #  1. cerca "CURRENT_OTA_NUMBER=N[^0-9]" nel binario → match esatto
  #  2. oppure: il token estratto da grep -oa è esattamente "CURRENT_OTA_NUMBER=N"
  #  3. fallback: usa il massimo trovato (comportamento pre-fix, per OTA >1)
  if grep -qoa "CURRENT_OTA_NUMBER=${NEXT_OTA}[^0-9]" "$BUNDLE_FILE" 2>/dev/null || \
     grep -oa "CURRENT_OTA_NUMBER=[0-9]*" "$BUNDLE_FILE" 2>/dev/null | grep -qxF "CURRENT_OTA_NUMBER=${NEXT_OTA}"; then
    FOUND_OTA="$NEXT_OTA"
  else
    if grep -qoa "CURRENT_OTA_NUMBER=${NEXT_OTA}[^0-9]" "$BUNDLE_FILE" 2>/dev/null; then
      FOUND_OTA="$NEXT_OTA"
    else
      FOUND_OTA=$(grep -oa "CURRENT_OTA_NUMBER=[0-9]*" "$BUNDLE_FILE" 2>/dev/null | grep -oE "[0-9]+$" | sort -n | tail -1 || true)
    fi
  fi

  if [ -z "$FOUND_OTA" ]; then
    echo ""
    echo "   ╔════════════════════════════════════════════════════════╗"
    echo "   ║  ❌ PUBBLICAZIONE BLOCCATA — marker non trovato       ║"
    echo "   ║  CURRENT_OTA_NUMBER non trovato nel bundle ($BUNDLE_EXT)   ║"
    echo "   ║  Probabile cache Metro stale — riprovare.             ║"
    echo "   ╚════════════════════════════════════════════════════════╝"
    exit 1
  elif [ "$FOUND_OTA" = "$NEXT_OTA" ]; then
    echo "   ✔ Bundle verificato: CURRENT_OTA_NUMBER=$FOUND_OTA (corretto)"
  else
    echo ""
    echo "   ╔════════════════════════════════════════════════════════╗"
    echo "   ║  ❌ PUBBLICAZIONE BLOCCATA — Bundle ha numero errato  ║"
    echo "   ║  Bundle contiene CURRENT_OTA_NUMBER=$FOUND_OTA         "
    echo "   ║  Atteso: CURRENT_OTA_NUMBER=$NEXT_OTA                  "
    echo "   ║  (ota-updates.json contiene note storiche — verifica lib/ota.ts) ║"
    echo "   ╚════════════════════════════════════════════════════════╝"
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

  require_admin_creds

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
  BUNDLE_FILE=$(state_get bundleFile)
  GIT_COMMIT_HASH=$(state_get gitCommitHash)
  GIT_COMMIT_SHORT="${GIT_COMMIT_HASH:0:12}"

  if [ ! -f "$BUNDLE_FILE" ]; then
    echo "Errore: bundle $BUNDLE_FILE non più presente."
    echo "Re-esportare con: bash $0 rollback && bash $0 export \"messaggio\""
    exit 1
  fi

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

  # ─── Step G: Login admin ──────────────────────────────────
  echo "[G] Login admin su $BACKEND_URL..."
  COOKIE_JAR="/tmp/ota-publish-cookies-$$.txt"
  local RAW_LOGIN LOGIN_BODY SESSION_COOKIE
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

  # ─── Step H: Creazione release draft ──────────────────────
  echo "[H] Creazione release OTA (draft)..."
  local NOTES_JSON RV_JSON CREATE_RESPONSE RELEASE_ID
  NOTES_JSON=$(node -e "process.stdout.write(JSON.stringify(process.argv[1]))" -- "OTA-$NEXT_OTA rv$RUNTIME_VERSION: $RELEASE_MESSAGE")
  RV_JSON=$(node -e "process.stdout.write(JSON.stringify(process.argv[1]))" -- "$RUNTIME_VERSION")
  CREATE_RESPONSE=$(curl -s -H "Cookie: $SESSION_COOKIE" -H "X-Forwarded-Proto: https" -X POST "$BACKEND_URL/api/admin/ota" \
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
  echo "[I] Pubblicazione release..."
  local PUBLISH_RESPONSE PUBLISH_STATUS
  PUBLISH_RESPONSE=$(curl -s -H "Cookie: $SESSION_COOKIE" -H "X-Forwarded-Proto: https" -X POST "$BACKEND_URL/api/admin/ota/$RELEASE_ID/publish")
  PUBLISH_STATUS=$(echo "$PUBLISH_RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ try { console.log(JSON.parse(d).status ?? ''); } catch { console.log(''); } })" 2>/dev/null || true)
  if [ "$PUBLISH_STATUS" != "active" ]; then
    echo "   ERRORE pubblicazione: $PUBLISH_RESPONSE"
    exit 1
  fi
  echo "   ✔ Release pubblicata (status: active)"

  # ─── Step I+: Promozione slot=stable ──────────────────────
  # I client leggono solo dallo slot stable. Senza questa chiamata
  # la release resta archived e nessun dispositivo la riceve.
  echo "[I+] Promozione slot=stable..."
  local SLOT_RESPONSE SLOT_OK
  SLOT_RESPONSE=$(curl -s -H "Cookie: $SESSION_COOKIE" -H "X-Forwarded-Proto: https" -X POST "$BACKEND_URL/api/admin/ota/assign-slot" \
    -H "Content-Type: application/json" \
    -d "{\"releaseId\":\"$RELEASE_ID\",\"slot\":\"stable\"}")
  SLOT_OK=$(echo "$SLOT_RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ try { const j=JSON.parse(d); process.stdout.write(j.ok ? '1' : ''); } catch { process.stdout.write(''); } })" 2>/dev/null || true)
  if [ "$SLOT_OK" != "1" ]; then
    echo "   ERRORE promozione slot: $SLOT_RESPONSE"
    exit 1
  fi
  echo "   ✔ Release promossa a slot=stable (precedente → archived)"

  # ─── Step J: Verifica live con backoff ────────────────────
  echo "[J] Verifica live su produzione (backoff max 30s)..."
  local MAX_WAIT=30 WAIT_INTERVAL=5 ELAPSED=0 VERIFIED=0
  while [ $ELAPSED -le $MAX_WAIT ]; do
    local HTTP_RESPONSE HTTP_BODY HTTP_CODE
    HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
      -H "expo-runtime-version: $RUNTIME_VERSION" \
      -H "expo-platform: android" \
      -H "expo-protocol-version: 1" \
      --max-time 10 \
      "$BACKEND_URL/api/expo-updates" 2>/dev/null || echo -e "\nCURL_FAILED")
    HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
    HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -1)

    if [ "$HTTP_CODE" = "200" ]; then
      local SERVED_RELEASE_ID
      SERVED_RELEASE_ID=$(echo "$HTTP_BODY" | grep -oP '"id"\s*:\s*"\K[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || echo "")
      if [ "$SERVED_RELEASE_ID" = "$RELEASE_ID" ]; then
        echo "   ✔ Produzione serve OTA-$NEXT_OTA (releaseId=$RELEASE_ID) — ${ELAPSED}s"
        VERIFIED=1
        break
      else
        echo "   ⟳ Produzione serve releaseId=$SERVED_RELEASE_ID (atteso $RELEASE_ID) — retry in ${WAIT_INTERVAL}s..."
      fi
    elif [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "304" ]; then
      echo "   ⟳ Produzione risponde $HTTP_CODE (cache) — retry in ${WAIT_INTERVAL}s..."
    else
      echo "   ⚠ Produzione risponde HTTP $HTTP_CODE — retry in ${WAIT_INTERVAL}s..."
    fi
    sleep $WAIT_INTERVAL
    ELAPSED=$((ELAPSED + WAIT_INTERVAL))
  done

  if [ "$VERIFIED" != "1" ]; then
    echo ""
    echo "   ╔════════════════════════════════════════════════════════╗"
    echo "   ║  ❌ PUBBLICAZIONE BLOCCATA — verifica live fallita    ║"
    echo "   ║  La produzione non serve OTA-$NEXT_OTA dopo ${MAX_WAIT}s.             "
    echo "   ║  La release è nel DB ma NON attiva in produzione.     ║"
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

  echo ""
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║  ✅ OTA-$NEXT_OTA pubblicata con successo!"
  echo "╠══════════════════════════════════════════════════════════════════╣"
  printf "║  %-20s: %-43s║\n" "Commit" "$GIT_COMMIT_SHORT"
  printf "║  %-20s: %-43s║\n" "Release ID" "$RELEASE_ID"
  printf "║  %-20s: %-43s║\n" "Bundle URL" "$BUNDLE_URL"
  printf "║  %-20s: %-43s║\n" "Slot" "stable"
  printf "║  %-20s: %-43s║\n" "Rollback storico" "bash scripts/rollback-ota.sh $((NEXT_OTA - 1))"
  echo "╚══════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "   Tutti gli utenti riceveranno l'aggiornamento al prossimo avvio."
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
    do_export "${2:-}"
    ;;
  publish)
    do_publish
    ;;
  rollback)
    do_rollback_cmd
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    # Modalità legacy: $1 è il messaggio di release → esegui entrambi gli stage.
    # Valida le credenziali admin PRIMA di toccare qualsiasi file, per preservare
    # l'atomicità del single-shot (originale: nessuna mutazione se mancano creds).
    require_admin_creds
    do_export "$COMMAND"
    do_publish
    ;;
esac
