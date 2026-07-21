#!/bin/bash
set -e

# ⛔ NO-SPLIT — questo file NON deve essere diviso in part file.
#
# Il gate `scripts/check-deploy-build-step-numbers.sh` conta i label [N/TOTAL]
# leggendo UN SINGOLO FILE (questo).  Se i label venissero distribuiti su file
# part sourced, il gate opererebbe su un sottoinsieme incompleto, producendo
# TOTAL stantii che arrivano silenziosamente in produzione.
#
# Se il file dovesse crescere oltre la soglia del ratchet, la soluzione corretta
# è estrarre la logica degli step in sub-script CHIAMATI (non sourced/.) e
# mantenere i label [N/TOTAL] in questo wrapper principale.
#
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
# log()     → riga con timestamp UTC, così si vede QUANDO succede ogni step.
# size()    → dimensione di una dir (vuota/assente → "-"), per vedere quanto pesa
#             e quanto libera ogni pulizia. È proprio la metrica che mancava quando
#             il Repl layer superava i ~2 GB e il deploy falliva senza spiegazioni.
# elapsed() → secondi trascorsi dall'inizio dello script, per capire quale step
#             è lento senza dover fare differenze tra timestamp assoluti.
log()     { echo "[deploy $(date -u '+%H:%M:%SZ')] $*"; }
size()    { [ -e "$1" ] && du -sh "$1" 2>/dev/null | cut -f1 || echo "-"; }
elapsed() { echo "$(( $(date -u +%s) - SCRIPT_START_EPOCH ))s"; }

# ── Gate ROUTING_DISABLED ────────────────────────────────────────────────────
# ROUTING_DISABLED è DEPRECATA e non va mai impostata in produzione.
# Se presente nell'ambiente di build (es. residuo baked-in da un deploy
# precedente che Replit inietta automaticamente), la unsettiamo qui così
# NON viene baked nel nuovo container runtime.
# Il toggle routing è controllato esclusivamente dal kill-switch DB (Admin → Hub Routing).
if [ -n "${ROUTING_DISABLED+x}" ]; then
  log "⚠️  ROUTING_DISABLED trovata nell'ambiente di build (valore: \"${ROUTING_DISABLED}\")."
  log "   È una variabile DEPRECATA — la rimuoviamo dal processo prima del build"
  log "   così non viene baked nel container. Usa Admin → Hub Routing per il toggle."
  unset ROUTING_DISABLED
  log "   ✅ ROUTING_DISABLED rimossa dall'ambiente di build — deploy continua."
fi

SCRIPT_START_EPOCH=$(date -u +%s)
BUILD_START=$(date -u '+%H:%M:%SZ')

# ── Pre-flight: step-numbering integrity gate ────────────────────────────────
# Verifica che i label [N/TOTAL] in questo file siano sequenziali, senza
# duplicati, e che il TOTAL corrisponda al numero effettivo di step.
# Viene eseguito QUI, prima di qualsiasi step distruttivo (pulizia filesystem),
# così un TOTAL stantio viene rilevato prima di rimuovere .git/ o .local/state/.
# Questo gate è la stessa logica verificata dal workflow `check-deploy-build-step-numbers`
# ma cablata nel deploy stesso come secondo livello di difesa.
PRE_STEP_NUMBERS_EXIT=0
bash scripts/check-deploy-build-step-numbers.sh 2>&1 || PRE_STEP_NUMBERS_EXIT=$?
if [ "$PRE_STEP_NUMBERS_EXIT" -ne 0 ]; then
  echo "[deploy pre-flight] ❌ DEPLOY BLOCCATO — step numbering non valido in deploy-build.sh (exit ${PRE_STEP_NUMBERS_EXIT})."
  echo "[deploy pre-flight]    Rinumera i label [N/TOTAL] sequenzialmente prima di fare deploy."
  echo "[deploy pre-flight]    Dettagli: bash scripts/check-deploy-build-step-numbers.sh"
  exit 1
fi
echo "[deploy pre-flight] ✅ Step numbering OK — deploy-build.sh ha label [N/TOTAL] coerenti."

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
STEP_TS_1=$(date -u +%s)
log "=== [1/16] Pulizia asset workspace non necessari — $(elapsed) elapsed ==="
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
STEP_TS_2=$(date -u +%s)
log "=== [2/16] Pulizia .local/state/ (transcript agente + log DB) — $(elapsed) elapsed ==="
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
STEP_TS_3=$(date -u +%s)
log "=== [3/16] Pulizia directory transitorie non runtime — $(elapsed) elapsed ==="
log "  backups=$(size .local/backups) dist=$(size dist) dist-ota-env=$(size dist-ota-env) logs=$(size logs)"
rm -rf .local/backups/
rm -rf dist/
rm -rf dist-ota-env/
rm -rf tmp_review_frames/
rm -rf tmp_check/
rm -rf logs/
log "  backups, dist, dist-ota-env e artefatti temporanei rimossi."

STEP_TS_4=$(date -u +%s)
log "=== [4/16] Gate Index Drift (DESC/WHERE — regressioni migration, solo statico) — $(elapsed) elapsed ==="
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
#
# ⚠️  PERCHÉ PRIMA della pulizia .git/ ed exports/:
#   Questo gate legge solo file .ts e .sql del workspace — non il DB live.
#   Eseguirlo prima della pulizia pesante (.git/ ~3.4 GB) permette di bloccare
#   un deploy errato prima di attendere l'I/O di pulizia più lento.
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

# Pulizia directory non necessarie a runtime che fanno superare il limite ~2 GB del Repl layer.
# - exports/ → bundle Git e PDF generati dall'agente (~500 MB), non serviti da Express
# - .git/    → storia git (~3.4 GB di cui ~1.9 GB LFS objects), non necessaria a runtime
#              Il server non esegue comandi git; il repository completo è su GitHub.
STEP_TS_5=$(date -u +%s)
log "=== [5/16] Pulizia exports/ e .git/ per rispettare il limite Repl layer — $(elapsed) elapsed ==="
log "  exports=$(size exports) .git=$(size .git)"
rm -rf exports/
rm -rf .git/
log "  exports/ e .git/ rimossi — Repl layer ora sotto il limite ~2 GB."

STEP_TS_6=$(date -u +%s)
log "=== [6/16] Gate Lint Migration Indexes (CREATE IF NOT EXISTS senza DROP) — $(elapsed) elapsed ==="
# ── Gate Lint Migration Indexes (drift silenzioso CREATE IF NOT EXISTS) ──────
# check-index-drift --static-only NON cattura il drift "silenzioso": una migration
# che crea un indice speciale con `CREATE INDEX IF NOT EXISTS ... DESC` SENZA un
# DROP precedente. L'SQL sembra corretto, ma se l'indice già esiste (anche da
# auto-push del diff schema in prod) IF NOT EXISTS salta la CREATE e DESC/WHERE
# non vengono mai applicati → "🔴 Index Drift rilevato" ad ogni boot.
#
# Questo lint (modalità --all) impone il pattern idempotente DROP IF EXISTS +
# CREATE per OGNI indice speciale. Le violazioni storiche già in prod sono
# grandfathered nelle baseline dello script; ogni NUOVA violazione blocca qui.
# Non tocca il DB live (legge solo schema TS + file .sql) → safe in FASE 2.
LINT_IDX_EXIT=0
npx tsx scripts/lint-migration-indexes.ts --all 2>&1 || LINT_IDX_EXIT=$?
if [ "$LINT_IDX_EXIT" -eq 0 ]; then
  log "  ✅ Lint Migration Indexes OK — nessun CREATE IF NOT EXISTS speciale senza DROP."
else
  log "  ❌ DEPLOY BLOCCATO — pattern indice speciale a rischio nelle migration (exit ${LINT_IDX_EXIT})."
  log "     Una migration crea un indice DESC/WHERE con IF NOT EXISTS senza DROP precedente."
  log "     Fix: usa il pattern idempotente DROP INDEX IF EXISTS + CREATE INDEX."
  log "     Dettagli: npx tsx scripts/lint-migration-indexes.ts --all"
  exit 1
fi

STEP_TS_7=$(date -u +%s)
log "=== [7/16] Gate Dedup Pattern (DELETE…NOT IN → ROW_NUMBER CTE) — $(elapsed) elapsed ==="
# Verifica che nessuna migration SQL usi il pattern NULL-unsafe
# `DELETE FROM <t> WHERE id NOT IN (SELECT id FROM <t>)` per deduplicare
# righe prima di aggiungere un vincolo UNIQUE.
#
# Perché è pericoloso:
#   - Se la subquery ritorna anche un solo NULL, l'intera NOT IN restituisce
#     UNKNOWN → nessuna riga viene cancellata (silenziosamente sbagliato).
#   - Su tabelle grandi la NOT IN non può usare un indice → timeout.
#
# Pattern corretto: CTE con ROW_NUMBER() (vedi 0105_crash_logs_unique_session.sql)
#   WITH dupes AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY … ORDER BY …) AS rn FROM t)
#   DELETE FROM t WHERE id IN (SELECT id FROM dupes WHERE rn > 1);
#
# Exit code:
#   0 → nessun pattern insicuro → OK
#   1 → trovato pattern insicuro → GATE DURO
DEDUP_EXIT=0
npx tsx scripts/check-migration-unsafe-dedup.ts 2>&1 || DEDUP_EXIT=$?
if [ "$DEDUP_EXIT" -eq 0 ]; then
  log "  ✅ Dedup Pattern OK — nessun DELETE…NOT IN self-referenziale nelle migration SQL."
else
  log "  ❌ DEPLOY BLOCCATO — Migration usa DELETE…NOT IN (NULL-unsafe) per deduplicare."
  log "     Azione richiesta:"
  log "       1. Eseguire: npx tsx scripts/check-migration-unsafe-dedup.ts"
  log "       2. Sostituire il pattern con la CTE ROW_NUMBER()."
  log "       3. Riferimento: migrations/0105_crash_logs_unique_session.sql"
  exit 1
fi

STEP_TS_8=$(date -u +%s)
log "=== [8/16] Gate Undefined Route Handlers (.next.ts stubs) — $(elapsed) elapsed ==="
# Rileva file .next.ts senza `export default` che siano importati come handler
# di default in un file router. Questi causano:
#   TypeError: argument handler must be a function
# all'avvio di Express, crashando il server in produzione.
#
# Exit code:
#   0 → nessun handler non definito trovato → OK
#   1 → trovato import default di uno stub senza export default → GATE DURO
UNDEF_HANDLER_EXIT=0
bash scripts/check-undefined-handlers.sh 2>&1 || UNDEF_HANDLER_EXIT=$?
if [ "$UNDEF_HANDLER_EXIT" -eq 0 ]; then
  log "  ✅ Undefined Handlers OK — nessun .next.ts stub importato come default senza export."
else
  log "  ❌ DEPLOY BLOCCATO — uno o più .next.ts stub sono importati come router ma non hanno 'export default'."
  log "     Fix: aggiungere 'export default router;' al file stub, oppure rimuovere l'import."
  log "     Dettagli: bash scripts/check-undefined-handlers.sh"
  exit 1
fi

STEP_TS_9=$(date -u +%s)
log "=== [9/16] Gate Hardcoded Agent Model Names — $(elapsed) elapsed ==="
# Verifica che nessun file .ts/.tsx fuori da server/lib/agent-constants.ts
# contenga i nomi dei modelli Ollama come letterali stringa hardcoded.
# La sorgente di verità è AGENT_MODEL_DEFAULTS in agent-constants.ts;
# ogni callsite deve importare da lì invece di duplicare il default.
#
# Modelli rilevati: qwen3:1.7b (Bowie), qwen3:4b (Horus), all-minilm (Nadir), devstral:latest (Ares).
# (granite4:tiny-h / Quebracho rimosso — Task #591: unificato in Horus.)
#
# Soppressione (riga precedente al letterale):
#   // check-hardcoded-agent-models: ok
HARDCODED_MODELS_EXIT=0
bash scripts/check-hardcoded-agent-models.sh 2>&1 || HARDCODED_MODELS_EXIT=$?
if [ "$HARDCODED_MODELS_EXIT" -eq 0 ]; then
  log "  ✅ Hardcoded Agent Models OK — nessun nome modello hardcoded fuori da agent-constants.ts."
else
  log "  ❌ DEPLOY BLOCCATO — nome modello Ollama hardcoded rilevato fuori da agent-constants.ts (exit ${HARDCODED_MODELS_EXIT})."
  log "     Fix: importare AGENT_MODEL_DEFAULTS da server/lib/agent-constants.ts"
  log "     e usare il default da lì invece del letterale stringa."
  log "     Dettagli: bash scripts/check-hardcoded-agent-models.sh"
  exit 1
fi

STEP_TS_10=$(date -u +%s)
log "=== [10/16] Gate Quebracho Bridge Import (modulo eliminato) — $(elapsed) elapsed ==="
# Verifica che nessun file importi da quebracho-bridge, rimosso quando
# Quebracho è stato assorbito in Horus (Task #591 / #597).
# Un re-import produrrebbe un "module not found" senza spiegazione;
# questo gate lo blocca con un messaggio chiaro.
QUEBRACHO_BRIDGE_EXIT=0
bash scripts/check-quebracho-bridge-import.sh 2>&1 || QUEBRACHO_BRIDGE_EXIT=$?
if [ "$QUEBRACHO_BRIDGE_EXIT" -eq 0 ]; then
  log "  ✅ Quebracho Bridge Import OK — nessun riferimento stale a quebracho-bridge."
else
  log "  ❌ DEPLOY BLOCCATO — import stale di quebracho-bridge rilevato (exit ${QUEBRACHO_BRIDGE_EXIT})."
  log "     quebracho-bridge è stato eliminato (Task #591). Usa Horus direttamente:"
  log "       server/ai/horus/"
  log "     Dettagli: bash scripts/check-quebracho-bridge-import.sh"
  exit 1
fi

STEP_TS_11=$(date -u +%s)
log "=== [11/16] Gate Quebracho Question Import (modulo eliminato) — $(elapsed) elapsed ==="
# Verifica che nessun file importi da quebracho-question, rimosso insieme
# a Quebracho (Task #591). Il flusso di composizione domanda non esiste più.
QUEBRACHO_QUESTION_EXIT=0
bash scripts/check-quebracho-question-import.sh 2>&1 || QUEBRACHO_QUESTION_EXIT=$?
if [ "$QUEBRACHO_QUESTION_EXIT" -eq 0 ]; then
  log "  ✅ Quebracho Question Import OK — nessun riferimento stale a quebracho-question."
else
  log "  ❌ DEPLOY BLOCCATO — import stale di quebracho-question rilevato (exit ${QUEBRACHO_QUESTION_EXIT})."
  log "     quebracho-question è stato eliminato (Task #591). Usa Horus direttamente:"
  log "       server/ai/coordinator/horus-coordinator-loop.ts"
  log "       server/ai/horus/"
  log "     Dettagli: bash scripts/check-quebracho-question-import.sh"
  exit 1
fi

STEP_TS_12=$(date -u +%s)
log "=== [12/16] Verifica versioni stabili dipendenze critiche (non-bloccante) — $(elapsed) elapsed ==="
# Avvisa se esistono versioni major/minor più recenti per le dipendenze critiche.
# Non blocca il deploy: exit sempre 0.
# Interroga il registry npm — se la rete è irraggiungibile, lo step viene saltato
# silenziosamente senza impatto sul deploy.
STABLE_VER_EXIT=0
bash scripts/check-stable-versions.sh 2>&1 || STABLE_VER_EXIT=$?
if [ "$STABLE_VER_EXIT" -ne 0 ]; then
  log "  ⚠️  check-stable-versions.sh ha restituito exit ${STABLE_VER_EXIT} (inatteso — lo script dovrebbe sempre uscire 0)."
fi

STEP_TS_13=$(date -u +%s)
log "=== [13/16] Gate Neon DB Branching (dev≠prod, solo in CI) — $(elapsed) elapsed ==="
# Verifica che DATABASE_URL_DEV e DATABASE_URL puntino a branch Neon SEPARATI.
# Il guard è attivo SOLO in ambienti CI (REPLIT_DEPLOYMENT impostato): in locale
# DATABASE_URL_DEV potrebbe non essere settata e non vogliamo bloccare il flusso
# di sviluppo. In produzione invece la separazione dev≠prod è obbligatoria.
# Parsing-only: nessuna connessione TCP, sicuro da eseguire in FASE 2.
if [ -n "${REPLIT_DEPLOYMENT:-}" ]; then
  NEON_BRANCH_EXIT=0
  npx tsx scripts/verify-neon-branching.ts 2>&1 || NEON_BRANCH_EXIT=$?
  if [ "$NEON_BRANCH_EXIT" -eq 0 ]; then
    log "  ✅ Neon Branching OK — DATABASE_URL_DEV e DATABASE_URL su branch separati."
  else
    log "  ❌ DEPLOY BLOCCATO — Neon branching guard fallito (exit ${NEON_BRANCH_EXIT})."
    log "     dev e prod potrebbero puntare allo stesso branch Neon."
    log "     Rischio: drizzle-kit push nel workspace colpirebbe il DB di produzione."
    log "     Azione: verifica DATABASE_URL_DEV e DATABASE_URL, poi rilancia il deploy."
    log "     Dettagli: npx tsx scripts/verify-neon-branching.ts"
    exit 1
  fi
else
  log "  ⏭  REPLIT_DEPLOYMENT non impostato — guard Neon branching saltato (ambiente locale)."
fi

STEP_TS_14=$(date -u +%s)
log "=== [14/16] Build server TypeScript — $(elapsed) elapsed ==="
node scripts/server-build.js
log "  server_dist/ prodotto → $(size server_dist) ($(size server_dist/index.js 2>/dev/null) il bundle)"

# Task #5261 / #19 — Bake del binario cloudflared nel Repl layer (CONDIVISO).
# Due bridge lo usano: il TCP verso il DragonflyDB (server/cache/redis-tunnel.ts,
# `cloudflared access tcp`) e l'SSH verso il ThinkCentre (server/lib/tc-ssh-bridge.ts,
# stesso `cloudflared access tcp` per la route server/routes/ssh-exec.ts). Scarichiamo
# il binario qui così è presente a runtime nel container autoscale (la rete in FASE 4
# potrebbe non essere garantita). NON-FATALE: se il download fallisce, i bridge
# degradano con grazia (Redis → fallback in-memory; SSH → errore descrittivo, niente
# crash) e il deploy non è bloccato.
STEP_TS_15=$(date -u +%s)
log "=== [15/16] Bake binario cloudflared (bridge Redis TCP + SSH) — $(elapsed) elapsed ==="
CF_BIN="bin/cloudflared"
if [ -x "$CF_BIN" ]; then
  log "  $CF_BIN già presente ($(size $CF_BIN)) — skip download."
else
  mkdir -p bin
  CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
  CF_DL_START=$(date -u +%s)
  if curl -fsSL "$CF_URL" -o "$CF_BIN" 2>/dev/null; then
    CF_DL_SECS=$(( $(date -u +%s) - CF_DL_START ))
    chmod +x "$CF_BIN"
    log "  cloudflared scaricato → $(size $CF_BIN) — download: ${CF_DL_SECS}s"
  else
    log "  ⚠️  download cloudflared fallito — il bridge Redis TCP degraderà a no-op (fallback in-memory)."
    rm -f "$CF_BIN"
  fi
fi

# Task #3501 — Garantisce che server/public/matching-system.pdf sia presente nel
# Repl layer. Il file viene creato dal post-merge hook (scripts/generate-matching-pdf.mjs)
# e copiato in server/public/. Se per qualsiasi motivo manca (primo deploy senza
# post-merge, workspace pulito), lo rigeneriamo qui in modo che la route
# GET /api/exports/matching-system.pdf non torni mai 500 in produzione.
# NB: in caso di errore logghiamo un warning ma NON usciamo (set -e è attivo,
# quindi usiamo || true per non bloccare l'intero deploy).
STEP_TS_16=$(date -u +%s)
log "=== [16/16] Verifica PDF matching-system — $(elapsed) elapsed ==="
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

STEP_TS_17=$(date -u +%s)

# ── Slow-step detector (warning only — non blocca il deploy) ──────────────────
# Calcola il delta di ogni step e avvisa se supera la soglia configurabile.
# Soglia default: 120s. Override: variabile DEPLOY_SLOW_STEP_THRESHOLD (secondi).
SLOW_STEP_THRESHOLD=${DEPLOY_SLOW_STEP_THRESHOLD:-120}
declare -a _STEP_TS=( $STEP_TS_1 $STEP_TS_2 $STEP_TS_3 $STEP_TS_4 $STEP_TS_5
                      $STEP_TS_6 $STEP_TS_7 $STEP_TS_8 $STEP_TS_9 $STEP_TS_10
                      $STEP_TS_11 $STEP_TS_12 $STEP_TS_13 $STEP_TS_14 $STEP_TS_15
                      $STEP_TS_16 $STEP_TS_17 )
declare -a _STEP_NAMES=(
  "Pulizia asset workspace"
  "Pulizia .local/state/"
  "Pulizia directory transitorie"
  "Gate Index Drift"
  "Pulizia exports/ e .git/"
  "Gate Lint Migration Indexes"
  "Gate Dedup Pattern"
  "Gate Undefined Route Handlers"
  "Gate Hardcoded Agent Model Names"
  "Gate Quebracho Bridge Import"
  "Gate Quebracho Question Import"
  "Verifica versioni stabili"
  "Gate Neon Branching"
  "Build server TypeScript"
  "Bake cloudflared"
  "Verifica PDF matching-system"
)
log "=== Slow-step report (soglia: ${SLOW_STEP_THRESHOLD}s) ==="
_SLOW_FOUND=0
for _i in $(seq 0 15); do
  _N=$(( _i + 1 ))
  _DELTA=$(( _STEP_TS[_i+1] - _STEP_TS[_i] ))
  if [ "$_DELTA" -gt "$SLOW_STEP_THRESHOLD" ]; then
    log "  ⚠️  STEP LENTO [${_N}/16] '${_STEP_NAMES[$_i]}' — ${_DELTA}s (soglia: ${SLOW_STEP_THRESHOLD}s)"
    _SLOW_FOUND=$(( _SLOW_FOUND + 1 ))
  fi
done
if [ "$_SLOW_FOUND" -eq 0 ]; then
  log "  ✅ Tutti i 16 step entro la soglia di ${SLOW_STEP_THRESHOLD}s."
fi

# ── Deploy stamp + timing summary per l'analisi post-deploy (su richiesta) ────
# Scritto in server_dist/ (sempre presente dopo il step [14/16] Build TS) così
# l'operatore può eseguire manualmente l'analisi post-deploy tramite il workflow
# "Post-Deploy Analysis" oppure con: FORCE_RERUN=1 bash scripts/post-deploy-analysis.sh
#
# .deploy-stamp        → epoch Unix del deploy (usato come "id" del deploy)
# .deploy-timing.json  → timing step + step lenti + dimensione workspace finale
# .deploy-stamp.analyzed viene RIMOSSO qui così la prossima esecuzione manuale
# non viene bloccata dal marker "già analizzato".
_DEPLOY_EPOCH=$(date -u +%s)
_DEPLOY_ISO=$(date -u -d "@$_DEPLOY_EPOCH" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || python3 -c "import datetime; print(datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'))" 2>/dev/null || echo "unknown")
_WS_FINAL=$(size .)

# Raccoglie deltas step per il JSON
_STEP_DELTAS_JSON="{"
for _si in $(seq 0 15); do
  _sn=$(( _si + 1 ))
  _sd=$(( _STEP_TS[_si+1] - _STEP_TS[_si] ))
  _STEP_DELTAS_JSON="${_STEP_DELTAS_JSON}\"${_sn}\":${_sd},"
done
_STEP_DELTAS_JSON="${_STEP_DELTAS_JSON%,}}"

# Raccoglie step lenti come array JSON
_SLOW_ARRAY_JSON="["
for _si in $(seq 0 15); do
  _sn=$(( _si + 1 ))
  _sd=$(( _STEP_TS[_si+1] - _STEP_TS[_si] ))
  if [ "$_sd" -gt "$SLOW_STEP_THRESHOLD" ]; then
    _SLOW_ARRAY_JSON="${_SLOW_ARRAY_JSON}\"[${_sn}/16] ${_STEP_NAMES[$_si]} — ${_sd}s\","
  fi
done
_SLOW_ARRAY_JSON="${_SLOW_ARRAY_JSON%,}]"

# Calcola durata totale
_TOTAL_SECS=$(( _STEP_TS[16] - SCRIPT_START_EPOCH ))

echo "$_DEPLOY_EPOCH" > server_dist/.deploy-stamp
cat > server_dist/.deploy-timing.json << EOF
{
  "deployEpoch": $_DEPLOY_EPOCH,
  "deployIso": "$_DEPLOY_ISO",
  "totalSecs": $_TOTAL_SECS,
  "workspaceSizeAfterBuild": "$_WS_FINAL",
  "slowStepThreshold": $SLOW_STEP_THRESHOLD,
  "slowSteps": $_SLOW_ARRAY_JSON,
  "stepDeltas": $_STEP_DELTAS_JSON
}
EOF

# Rimuovi il marker "già analizzato" così il prossimo boot può rilevare il deploy
# come fresco e avviare post-deploy-analysis.sh
rm -f server_dist/.deploy-stamp.analyzed

log "  📋 Deploy stamp scritto: server_dist/.deploy-stamp (epoch: $_DEPLOY_EPOCH)"
log "  📋 Timing JSON scritto: server_dist/.deploy-timing.json (${_TOTAL_SECS}s totali)"

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

log "▶ FASE 2/4 — FINE build script (iniziata $BUILD_START, durata totale $(elapsed))"
log "Workspace finale che entra nel Repl layer: $(size .) totali"
log "────────────────────────────────────────────────────────────"
log "▶ FASE 3/4 [piattaforma Replit] — prossimi step nel pannello Publish:"
log "    Creating image → Pushing Repl layer → Pushing Repl (cache) layer"
log "    → Creating Autoscale service → Waiting for service to be ready → Deployment successful"
log "▶ FASE 4/4 [runtime] — all'avvio del container vedrai, nei log di produzione:"
log "    [.../5] (boot in 5 step interni) e [migrate] (migrazioni applicate al DB)"
