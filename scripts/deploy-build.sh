#!/bin/bash
set -e

# Task #1150 — deploy build minimale.
#
# Storia: lo script ha avuto in passato uno step `npx expo export --platform web`
# (4.8 MB di JS in static-build/web/) e poi un marker statico static-build/index.html.
# Entrambi sono stati rimossi: BikerLink non gira via web, server/index.ts non
# referenzia più static-build, e la cartella confondeva il classifier autoscale di
# Replit.
#
# Task #2678 – #2800 — la sincronizzazione schema avviene tramite server/migrate.ts
# (legge migrations/0001-NNN.sql, traccia in schema_migrations, gira a ogni boot).
# Regola: ogni cambio schema → file .sql numerato in migrations/ → commit.

# --- Helper di logging -------------------------------------------------------
# Obiettivo: rendere i build log del pannello Publish auto-esplicativi.
# log()  → riga con timestamp UTC, così si vede QUANDO succede ogni step.
# size() → dimensione di una dir (vuota/assente → "-"), per vedere quanto pesa
#          e quanto libera ogni pulizia. È proprio la metrica che mancava quando
#          il Repl layer superava i ~2 GB e il deploy falliva senza spiegazioni.
log()  { echo "[deploy $(date -u '+%H:%M:%SZ')] $*"; }
size() { [ -e "$1" ] && du -sh "$1" 2>/dev/null | cut -f1 || echo "-"; }

BUILD_START=$(date -u '+%H:%M:%SZ')
log "════════════════════════════════════════════════════════════"
log " DEPLOY/PUBLISH — mappa delle 4 fasi:"
log "   FASE 1/4 [piattaforma] security scan · copia dev→prod DB · install pacchetti"
log " ▶ FASE 2/4 [questo script] pulizia workspace + build server   ◀ SEI QUI"
log "   FASE 3/4 [piattaforma] Creating image · Pushing Repl layer · Creating Autoscale"
log "   FASE 4/4 [runtime]     avvio container + migrazioni DB (log [boot]/[migrate])"
log " NB: le fasi 1 e 3 le logga Replit (pannello Publish); le fasi 2 e 4 le logghiamo noi."
log "════════════════════════════════════════════════════════════"
log "▶ FASE 2/4 — INIZIO build script (start $BUILD_START)"
log "Workspace iniziale: $(size .) totali"

# Task #2800-fix — Pulizia asset non necessari prima del push del Repl layer.
# attached_assets/ contiene screenshot del workspace Replit (usati dall'agente
# per riferimento visivo) che crescono nel tempo e gonfiano il Repl layer fino
# a superare il limite Cloud Run (~2 GB), facendo fallire silenziosamente
# "Creating Autoscale service" senza alcun log di errore.
# Questi file non servono a runtime: il server Express non li serve.
# La pulizia avviene PRIMA del build così il layer risultante è snello.
log "=== [0/3] Pulizia asset workspace non necessari ==="
log "  attached_assets/ prima: $(size attached_assets)"
rm -rf attached_assets/
mkdir -p attached_assets   # ricrea la dir vuota (evita errori se qualcuno la referenzia)
log "  attached_assets/ svuotata → $(size attached_assets)"

# Task #2820-fix — Pulizia .local/state/replit/ prima del push del Repl layer.
# .local/state/replit/ contiene transcript dell'agente AI (~376 MB) e un database
# di query log (log-query.db, ~124 MB) che crescono nel tempo.
# Questi file NON servono a runtime: il server Express non li usa.
# Senza questa pulizia il Repl layer supera il limite Cloud Run (~2 GB), causando
# il fallimento silenzioso di "Creating Autoscale service" senza alcun log.
# Misurato: .local/state/replit/ = 504 MB → Repl layer totale ~1.7 GB → KO.
# Dopo la pulizia: ~1.2 GB → ampiamente sotto il limite.
log "=== [1/3] Pulizia .local/state/ (transcript agente + log DB) ==="
log "  .local/state/ prima: $(size .local/state)"
rm -rf .local/state/replit/
rm -rf .local/state/scribe/
rm -rf .local/state/workflow-logs/
log "  .local/state/ dopo:  $(size .local/state) (replit/, scribe/, workflow-logs/ rimossi)"

# Task #2821-fix — altre directory di workspace cresciute nel tempo, non necessarie
# a runtime (il server Express non le serve). Senza questa pulizia tornano a gonfiare
# il Repl layer oltre il limite Cloud Run (~2 GB) → deploy fallisce silenziosamente.
# - .local/backups/      → dump/JSONL di backup DB (~53 MB)
# - dist/                → export web/OTA Expo (server gira da server_dist/, non da dist/)
# - dist-ota-env/        → ambiente di build OTA
# - tmp_review_frames/, tmp_check/, logs/ → artefatti temporanei
# NB: uploads/ e assets/ NON si toccano — sono serviti a runtime (express.static).
log "=== [1b/3] Pulizia directory transitorie non runtime ==="
log "  backups=$(size .local/backups) dist=$(size dist) dist-ota-env=$(size dist-ota-env) logs=$(size logs)"
rm -rf .local/backups/
rm -rf dist/
rm -rf dist-ota-env/
rm -rf tmp_review_frames/
rm -rf tmp_check/
rm -rf logs/
log "  backups, dist, dist-ota-env e artefatti temporanei rimossi."

log "=== [1c/3] Gate Index Drift (DESC/WHERE — regressioni migration, solo statico) ==="
# Verifica che nessuna migration SQL abbia introdotto una regressione sugli
# indici speciali (DESC / WHERE) dichiarati nello schema Drizzle TS.
#
# ⚠️  PERCHÉ --static-only (no DB live):
#   Il deploy-build.sh gira in FASE 2, PRIMA che migrate.ts applichi le nuove
#   migration al DB di produzione (FASE 4 — al boot del container).
#   Se interroghiamo il DB live in questa fase, troviamo lo stato PRE-migration
#   che potrebbe non avere ancora gli indici corretti → falso positivo → deploy
#   bloccato in loop (il gate impedisce il deploy che applicherebbe il fix).
#   La verifica live POST-migration è già in place in server/boot-sequence.ts
#   (Task #4052): gira in background dopo il boot, non blocca il server.
#
# Exit code semantica (--static-only):
#   0 → nessuna regressione nelle migration SQL → OK
#   1 → regressione trovata (es. DROP + CREATE senza DESC) → GATE DURO
INDEX_DRIFT_EXIT=0
npx tsx scripts/check-index-drift.ts --static-only 2>&1 || INDEX_DRIFT_EXIT=$?
if [ "$INDEX_DRIFT_EXIT" -eq 0 ]; then
  log "  ✅ Index Drift OK — nessuna regressione DESC/WHERE nelle migration SQL."
  log "     La verifica live degli indici avverrà al boot (boot-sequence.ts)."
else
  log "  ❌ DEPLOY BLOCCATO — Regressione indici rilevata nelle migration SQL (exit ${INDEX_DRIFT_EXIT})."
  log "     Una migration ha droppato e ricreato un indice speciale senza DESC/WHERE."
  log "     Azione richiesta:"
  log "       1. Eseguire: npx tsx scripts/check-index-drift.ts --static-only"
  log "       2. Per ogni regressione segnalata: aggiungere migration correttiva in"
  log "          migrations/NNNN_fix-index-<nome>.sql con DROP + CREATE corretto."
  log "       3. Oppure correggere la migration che ha perso la caratteristica speciale."
  exit 1
fi

log "=== [2/3] Build server TypeScript ==="
node scripts/server-build.js
log "  server_dist/ prodotto → $(size server_dist) ($(size server_dist/index.js 2>/dev/null) il bundle)"

# Task #3501 — Garantisce che server/public/matching-system.pdf sia presente nel
# Repl layer. Il file viene creato dal post-merge hook (scripts/generate-matching-pdf.mjs)
# e copiato in server/public/. Se per qualsiasi motivo manca (primo deploy senza
# post-merge, workspace pulito), lo rigeneriamo qui in modo che la route
# GET /api/exports/matching-system.pdf non torni mai 500 in produzione.
# NB: in caso di errore logghiamo un warning ma NON usciamo (set -e è attivo,
# quindi usiamo || true per non bloccare l'intero deploy).
log "=== [2b/3] Verifica PDF matching-system ==="
MATCHING_PDF="server/public/matching-system.pdf"
if [ -f "$MATCHING_PDF" ]; then
  log "  $MATCHING_PDF già presente ($(size $MATCHING_PDF)) — nessuna azione."
else
  log "  $MATCHING_PDF assente — rigenero con scripts/generate-matching-pdf.mjs..."
  PDF_EXIT=0
  node scripts/generate-matching-pdf.mjs 2>&1 || PDF_EXIT=$?
  if [ "$PDF_EXIT" -eq 0 ] && [ -f "$MATCHING_PDF" ]; then
    log "  PDF rigenerato con successo ($(size $MATCHING_PDF))."
  else
    log "  ⚠️  Rigenerazione PDF fallita (exit ${PDF_EXIT}) — il fallback dinamico della route gestirà la richiesta a runtime."
  fi
fi

# Task #2781-fix — invalida la cache hash delle migration.
# server/migrate.ts ha un fast-skip basato su server_dist/.migrations-hash
# (hash dei nomi file). In produzione il filesystem PERSISTE tra i deploy:
# una cache vecchia (ferma a 0061) combaciava con l'hash corrente e faceva
# saltare l'intero controllo DB ("cache hit — schema hash unchanged"),
# impedendo l'esecuzione di nuove migration DML come 0062.
# Rimuovendo il file qui, al primo avvio il runner fa SEMPRE il round-trip
# sul DB e confronta con schema_migrations (la vera fonte di verità).
rm -f server_dist/.migrations-hash
log "  Cache migration invalidata (al boot migrate.ts farà sempre il controllo DB)."

# NB: NON rimuovere .cache/ qui.
# Verificato dai build log Replit (31 mag 2026):
#  - il build RIUSCITO (09:38) NON aveva alcuno step di pulizia .cache/ e ha
#    spinto .cache come layer dedicato ("Pushing Repl (cache) layer" →
#    "Created Repl (cache) layer") arrivando a "Deployment successful".
#  - i build FALLITI (09:46 / 09:58) avevano lo step di pulizia .cache/ e sono
#    morti ESATTAMENTE lì: i file dentro .cache/dotslash ("React Native
#    DevTools-linux-x64") nell'ambiente di build sono di proprietà di un altro
#    utente → `rm -rf .cache/` dà "Permission denied" ed exit NON-ZERO → con
#    `set -e` l'intero deploy falliva all'ultimo step.
# Conclusione: la piattaforma gestisce .cache/ come layer separato; non va toccata
# dal build script. Pulire .cache/ era sia la CAUSA del fallimento sia inutile.

log "▶ FASE 2/4 — FINE build script (iniziata $BUILD_START)"
log "Workspace finale che entra nel Repl layer: $(size .) totali"
log "────────────────────────────────────────────────────────────"
log "▶ FASE 3/4 [piattaforma Replit] — prossimi step nel pannello Publish:"
log "    Creating image → Pushing Repl layer → Pushing Repl (cache) layer"
log "    → Creating Autoscale service → Waiting for service to be ready → Deployment successful"
log "▶ FASE 4/4 [runtime] — all'avvio del container vedrai, nei log di produzione:"
log "    [.../5] (boot in 5 step interni) e [migrate] (migrazioni applicate al DB)"
