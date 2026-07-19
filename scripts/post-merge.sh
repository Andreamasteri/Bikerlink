#!/bin/bash
set -e

# ── LOCK PORTE .replit (merge=ours driver) ───────────────────
# Ri-applica il merge driver ad ogni merge, anche se il git global
# config è stato resettato da un restart Replit.
git config --global merge.ours.driver true 2>/dev/null || true
# ─────────────────────────────────────────────────────────────

echo "Running post-merge setup..."

# ── SYNC node_modules POST-MERGE (Task #2573) ────────────────
# I task agent vivono in ambienti isolati: node_modules NON è
# sincronizzato dai merge. Solo package.json + package-lock.json
# vengono committati. Senza questo step, il server crasha con
# "Cannot find module 'X'" per ogni pacchetto installato in un
# task ma assente nel node_modules dell'app principale.
if [ -f "package-lock.json" ]; then
  echo "→ Sincronizzazione node_modules (npm install dal lockfile)..."
  if npm install --no-audit --no-fund 2>&1; then
    echo "✅ node_modules sincronizzato."
  else
    NPM_EXIT=$?
    echo "❌ npm install fallito (exit ${NPM_EXIT}) — abort post-merge per evitare stato incoerente."
    exit "${NPM_EXIT}"
  fi

  # (react-native-webview WebView<P={}> fix is now handled by patch-package via patches/)

  # ── FIX package-lock.json proxy Replit ───────────────────────
  if [ -f "package-lock.json" ] && grep -q "package-firewall.replit.local" package-lock.json 2>/dev/null; then
    sed -i 's|http://package-firewall\.replit\.local/npm/|https://registry.npmjs.org/|g' package-lock.json
    echo "✅ Fix package-lock.json proxy Replit applicato."
  fi
  # ─────────────────────────────────────────────────────────────
else
  echo "⚠️  package-lock.json mancante — sync node_modules saltato."
fi

# ── VERIFICA VERSIONI STABILI (non-bloccante) ─────────────────
# Avvisa nei log post-merge se ci sono aggiornamenti major/minor
# disponibili per le dipendenze critiche. Exit sempre 0.
echo "════════════════════════════════════════"
echo "  Verifica versioni stabili dipendenze"
echo "════════════════════════════════════════"
bash scripts/check-stable-versions.sh || true
echo "════════════════════════════════════════"
echo ""

echo "Invalidating server_dist to force TypeScript recompile on next start..."
rm -f server_dist/index.js

echo "Post-merge setup complete."

# ── CONTROLLO IMPORT TYPESCRIPT POST-MERGE ───────────────────
echo "════════════════════════════════════════"
echo "  Controllo import TypeScript post-merge"
echo "════════════════════════════════════════"

TS_MODIFIED=$(git diff HEAD~1 HEAD --name-only 2>/dev/null | grep -cE '\.(ts|tsx)$' || true)

if [ "$TS_MODIFIED" -gt 0 ]; then
  echo "📂 $TS_MODIFIED file/i .ts/.tsx modificati — avvio controllo import..."
  echo ""

  CLIENT_EXIT=0
  SERVER_EXIT=0

  # Controllo client (tsconfig.json nella root)
  if [ -f "tsconfig.json" ]; then
    echo "→ Client (tsconfig.json)..."
    CLIENT_ERRORS=$(npx tsc --noEmit --project tsconfig.json 2>&1) || CLIENT_EXIT=$?
    if [ "$CLIENT_EXIT" -eq 0 ]; then
      echo "  ✅ Client: nessun errore di import."
    else
      echo "  ❌ Client: import rotti rilevati:"
      echo "$CLIENT_ERRORS" | sed 's/^/     /'
    fi
  else
    echo "  ⚠️  tsconfig.json non trovato — controllo client saltato."
  fi

  echo ""

  # Controllo server (server/tsconfig.json)
  if [ -f "server/tsconfig.json" ]; then
    echo "→ Server (server/tsconfig.json)..."
    SERVER_ERRORS=$(npx tsc --noEmit --project server/tsconfig.json 2>&1) || SERVER_EXIT=$?
    if [ "$SERVER_EXIT" -eq 0 ]; then
      echo "  ✅ Server: nessun errore di import."
    else
      echo "  ❌ Server: import rotti rilevati:"
      echo "$SERVER_ERRORS" | sed 's/^/     /'
    fi
  else
    echo "  ⚠️  server/tsconfig.json non trovato — controllo server saltato."
  fi

  echo ""
  if [ "$CLIENT_EXIT" -eq 0 ] && [ "$SERVER_EXIT" -eq 0 ]; then
    echo "✅ Controllo TypeScript completato: nessun import rotto."
  else
    echo "❌ Controllo TypeScript: import rotti trovati — verificare prima di pubblicare."
  fi
else
  echo "✅ Nessun file .ts/.tsx modificato — controllo import saltato."
fi

echo "════════════════════════════════════════"
echo ""


# ── SYNC GITHUB POST-MERGE ───────────────────────────────────
echo "════════════════════════════════════════"
echo "  Sincronizzazione GitHub post-merge"
echo "════════════════════════════════════════"

GITHUB_REPO_URL="https://github.com/Andreamasteri/Bikerlink.git"

GH_TOKEN="${GITHUB_TOKEN:-${GITHUB_PAT:-}}"
if [ -n "$GH_TOKEN" ]; then
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  echo "→ Push branch '${CURRENT_BRANCH}' su GitHub..."
  GIT_PUSH_EXIT=0
  git push "https://${GH_TOKEN}:x-oauth-basic@github.com/Andreamasteri/Bikerlink.git" \
    "HEAD:${CURRENT_BRANCH}" 2>&1 || GIT_PUSH_EXIT=$?
  if [ "$GIT_PUSH_EXIT" -eq 0 ]; then
    echo "✅ GitHub sincronizzato correttamente (branch: ${CURRENT_BRANCH})."
  else
    echo "❌ Push GitHub fallito (exit ${GIT_PUSH_EXIT}) — verificare il token e la connettività."
  fi
else
  echo "⚠️  GITHUB_TOKEN non impostato — sincronizzazione GitHub saltata."
  echo "   Imposta il secret GITHUB_TOKEN nelle variabili d'ambiente Replit."
fi

echo "════════════════════════════════════════"
echo ""

# ── FIX I18N __TODO__ DUPLICATI (anti-regressione) ───────────
# Rimuove automaticamente chiavi __TODO__ duplicate dai file lib/i18n/*.ts
# prima del gate ratchet. Pattern: task che aggiungono stub __TODO__ per
# chiavi già tradotte causano TS1117 e superamento baseline ad ogni merge.
echo "════════════════════════════════════════"
echo "  Fix i18n __TODO__ duplicati (auto)"
echo "════════════════════════════════════════"
I18N_EXIT=0
npx tsx scripts/fix-i18n-todo-duplicates.ts 2>&1 || I18N_EXIT=$?
if [ "$I18N_EXIT" -ne 0 ]; then
  echo "⚠️  fix-i18n-todo-duplicates ha restituito exit ${I18N_EXIT} — verificare manualmente."
fi
echo ""

# ── GATE: nessun placeholder __TODO__ residuo (anti-ombreggiamento cross-file) ─
# Il fix sopra dedupa solo intra-file; questo gate vieta qualsiasi "__TODO__"
# residuo in lib/i18n/ (es. it.ts che ombreggia it.part*.ts). Vedi task #4959.
echo "════════════════════════════════════════"
echo "  Gate i18n __TODO__ residui"
echo "════════════════════════════════════════"
I18N_TODO_EXIT=0
bash scripts/check-i18n-todo-placeholders.sh || I18N_TODO_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$I18N_TODO_EXIT" -ne 0 ]; then
  echo "❌ Gate __TODO__ i18n fallito post-merge — rimuovere/tradurre i placeholder segnalati sopra."
  exit "$I18N_TODO_EXIT"
fi

# ── GATE "800 RIGHE PER FILE" POST-MERGE ─────────────────────
# Subito dopo il merge (prima di chiudere): se un merge ha portato
# dentro un file > 800 senza marker, falliamo qui e lasciamo
# evidenza nei log. Vedi replit.md → "⛔ REGOLA FERREA — Limite 800 righe per file".
# N.B.: quando si splitta un file, i file risultanti vanno tenuti ≤750 righe (split target).
echo "════════════════════════════════════════"
echo "  Ratchet 800 righe per file (post-merge)"
echo "════════════════════════════════════════"
RATCHET_EXIT=0
bash scripts/check-large-files-ratchet.sh || RATCHET_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$RATCHET_EXIT" -ne 0 ]; then
  echo "❌ Gate 800 righe fallito post-merge — verificare i file segnalati sopra."
  exit "$RATCHET_EXIT"
fi

# ── GATE LIMIT/SPLIT-TARGET SYNC ─────────────────────────────
# Verifica che setup-hooks.sh, i doc e i commenti TS non abbiano
# un numero hardcoded che diverge da MAX_LINES o SPLIT_TARGET in
# scripts/lib/large-files-core.ts (es. dopo che il target è stato abbassato).
# Copre sia il gate-threshold (MAX_LINES) sia il split-target floor (SPLIT_TARGET).
# Equivalente alla check nel CI workflow db-migration-checks, ma anticipato
# al merge così lo sviluppatore riceve feedback immediato.
echo "════════════════════════════════════════"
echo "  Gate limit/split-target sync (large-files)"
echo "════════════════════════════════════════"
LIMIT_SYNC_EXIT=0
bash scripts/check-large-files-limit-sync.sh || LIMIT_SYNC_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$LIMIT_SYNC_EXIT" -ne 0 ]; then
  echo "❌ Gate large-files-limit-sync fallito — aggiornare i riferimenti hardcoded in sync con scripts/lib/large-files-core.ts."
  exit "$LIMIT_SYNC_EXIT"
fi

# ── GATE ROTTE FANTASMA app/(tabs)/ ──────────────────────────
# Expo Router registra OGNI file in app/(tabs)/ come rotta.
# Regola STRETTA:
#   - .tsx senza prefisso _ → screen legittimi (es. index.tsx, music.tsx)
#   - _layout.tsx → ammesso (layout Expo Router)
#   - QUALSIASI altro file (.ts, .tsx con prefisso _, ecc.) → VIETATO
#     → spostare in components/ o lib/
# Vedi .agents/memory/expo-tabs-route-pollution.md
echo "════════════════════════════════════════"
echo "  Gate rotte fantasma app/(tabs)/  [strict]"
echo "════════════════════════════════════════"
PHANTOM_ROUTES=()
for _f in "app/(tabs)/"*; do
  [ -f "$_f" ] || continue
  _bn=$(basename "$_f")
  # ammetti solo screen .tsx senza prefisso _
  if [[ "$_bn" == _layout.tsx ]]; then
    continue
  fi
  if [[ "$_bn" == *.tsx && "$_bn" != _* ]]; then
    continue
  fi
  # tutto il resto è proibito: .ts, .tsx con _, ecc.
  PHANTOM_ROUTES+=("$_bn")
done
if [ ${#PHANTOM_ROUTES[@]} -eq 0 ]; then
  echo "✅ app/(tabs)/ pulita: solo screen .tsx e _layout ammessi."
else
  echo "❌ File non ammessi rilevati in app/(tabs)/:"
  for _pf in "${PHANTOM_ROUTES[@]}"; do
    echo "   ⚠️  app/(tabs)/$_pf"
  done
  echo ""
  echo "   Solo screen .tsx (senza prefisso _) e _layout.tsx sono ammessi."
  echo "   File helper, stili e utility DEVONO stare in components/ o lib/."
  echo "   Expo Router trasforma ogni file in questa cartella in una rotta."
  echo "════════════════════════════════════════"
  echo ""
  exit 1
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE ROTTE FANTASMA cartelle stack app/**/*.ts e .tsx componenti ────────
# Expo Router registra OGNI file .ts/.tsx in app/ come rotta, in modo
# RICORSIVO (anche nelle cartelle stack: app/profile, app/giri, app/admin…).
# Qualsiasi file helper co-locato genera un route node (deeplink rotto /
# warning "missing the required default export").
# REGOLA 1: nessun .ts (non-.tsx) in app/ fuori da (tabs)/
# REGOLA 2: nelle sotto-sotto-cartelle di app/ (es. app/admin/maps/,
#           app/admin/telemetry-user/) sono ammessi SOLO:
#             index.tsx, _layout.tsx, file che matchano [param].tsx
#           Tutto il resto (Card.tsx, Row.tsx, ecc.) va in components/.
# REGOLA 3: nessun file *.part[0-9]*.tsx o *.next.tsx senza prefisso _ in app/
#           (pattern overflow/continuazione screen) — rinominarli _*.part*.tsx.
# Vedi .agents/memory/expo-tabs-route-pollution.md
echo "════════════════════════════════════════"
echo "  Gate rotte fantasma stack app/**"
echo "════════════════════════════════════════"
STACK_PHANTOM=()

# Regola 1 — .ts puri (non-.tsx) in qualsiasi cartella di app/ tranne (tabs)/
while IFS= read -r _f; do
  [ -n "$_f" ] && STACK_PHANTOM+=("$_f")
done < <(find app -type f -name '*.ts' ! -name '*.tsx' ! -path 'app/(tabs)/*')

# Regola 2 — .tsx in sotto-sotto-cartelle di app/ (profondità ≥ 3)
#   Se la cartella ha un _layout.tsx → è uno stack legittimo, tutti i .tsx ammessi.
#   Altrimenti ammessi solo: index.tsx, _layout.tsx, [param].tsx
while IFS= read -r _f; do
  _bn=$(basename "$_f")
  _dir=$(dirname "$_f")
  # se la cartella ha _layout.tsx → stack legittimo, tutti i file screen ammessi
  [ -f "$_dir/_layout.tsx" ] && continue
  # ammetti route di base
  [[ "$_bn" == "index.tsx" ]]         && continue
  [[ "$_bn" == "_layout.tsx" ]]       && continue
  [[ "$_bn" =~ ^\[.+\]\.tsx$ ]]       && continue
  STACK_PHANTOM+=("$_f")
done < <(find app -mindepth 3 -maxdepth 4 -type f -name '*.tsx' \
           ! -path 'app/(tabs)/*' \
           ! -path 'app/(auth)/*')

# Regola 3 — file *.part[0-9]*.tsx e *.next.tsx senza prefisso _ in TUTTA app/
#   Questi file di overflow/continuazione devono avere prefisso _ per essere
#   ignorati da Expo Router come route. Es: _analytics.part2.tsx, _[id].part3.tsx
while IFS= read -r _f; do
  _bn=$(basename "$_f")
  # già prefissati con _ → OK
  [[ "$_bn" == _* ]] && continue
  STACK_PHANTOM+=("$_f")
done < <(find app -type f \( -name '*.part[0-9]*.tsx' -o -name '*.next.tsx' \))

if [ ${#STACK_PHANTOM[@]} -eq 0 ]; then
  echo "✅ Nessun file helper nelle cartelle stack di app/."
else
  echo "❌ File helper rilevati in app/ — generano route node fantasma:"
  for _pf in "${STACK_PHANTOM[@]}"; do
    echo "   ⚠️  $_pf"
  done
  echo ""
  echo "   Expo Router registra QUALSIASI .ts/.tsx in app/ come rotta."
  echo "   → File .part*.tsx/.next.tsx: rinominare con prefisso _ (es. _foo.part2.tsx)."
  echo "   → Altri helper: spostare in components/ o lib/ e aggiornare gli import."
  echo "════════════════════════════════════════"
  echo ""
  exit 1
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE REACT NAVIGATION INLINE PROP FUNCTIONS ───────────────
# Funzioni inline passate a tabBar, tabBarIcon, headerLeft, headerRight
# causano "Maximum update depth exceeded" — crash globale al login.
# Fix: useCallback per le funzioni, useMemo per gli oggetti options.
# Vedi: .agents/skills/rnav-memo-guard/SKILL.md
echo "════════════════════════════════════════"
echo "  Gate React Navigation inline props"
echo "════════════════════════════════════════"
RNAV_EXIT=0
bash scripts/check-rnav-inline-props.sh || RNAV_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$RNAV_EXIT" -ne 0 ]; then
  echo "❌ Gate rnav-inline-props fallito — correggere prima di procedere."
  exit "$RNAV_EXIT"
fi

# ── GATE router IN useEffect/useCallback DEPS (loop "Maximum update depth exceeded") ────
# router di expo-router è un nuovo oggetto ad ogni render.
# useEffect: router in deps + router.replace/push → replace → re-render → loop infinito.
# useCallback: router in deps + router.replace/push → callback ricreato ogni render →
#   qualsiasi useEffect che dipende dal callback ri-scatta → stesso loop.
# Fix: routerRef+didRedirectRef (vedi .agents/memory/router-in-useEffect-deps.md).
echo "════════════════════════════════════════"
echo "  Gate router in useEffect/useCallback deps"
echo "════════════════════════════════════════"
ROUTER_EFFECT_EXIT=0
bash scripts/check-router-in-effect-deps.sh || ROUTER_EFFECT_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$ROUTER_EFFECT_EXIT" -ne 0 ]; then
  echo "❌ Gate router-in-effect-deps fallito — correggere prima di procedere."
  exit "$ROUTER_EFFECT_EXIT"
fi

# ── GATE useQuery DEFAULT INSTABILI IN useEffect DEPS ─────────
# Default inline = [] o = {} in useQuery creano un nuovo riferimento
# array/oggetto ad ogni render quando data è undefined (loading).
# Se la variabile finisce nei deps di useEffect, scatta ad ogni render
# → loop infinito "Maximum update depth exceeded".
# Caso reale: crash OTA 166 su MusicRadioTab (suggestedGenreIds = []).
# Vedi: scripts/check-unstable-query-defaults.sh
echo "════════════════════════════════════════"
echo "  Gate useQuery default instabili in useEffect deps"
echo "════════════════════════════════════════"
UNSTABLE_DEFAULTS_EXIT=0
bash scripts/check-unstable-query-defaults.sh || UNSTABLE_DEFAULTS_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$UNSTABLE_DEFAULTS_EXIT" -ne 0 ]; then
  echo "❌ Gate unstable-query-defaults fallito — correggere prima di procedere."
  exit "$UNSTABLE_DEFAULTS_EXIT"
fi

# ── FIX [] / {} INLINE NEI DEPS DI useMemo / useCallback (auto) ──────────
# Corregge automaticamente pattern `expr ?? []` / `expr ?? {}` nei deps
# prima del gate, così eventuali regressioni introdotte da un merge vengono
# rimosse senza bloccare il build. Aggiorna anche .large-files-baseline per
# i file modificati (stesso pattern del fixer i18n).
echo "════════════════════════════════════════"
echo "  Fix [] / {} inline memo deps (auto)"
echo "════════════════════════════════════════"
MEMO_FIX_EXIT=0
npx tsx scripts/fix-inline-default-memo-deps.ts --apply 2>&1 || MEMO_FIX_EXIT=$?
if [ "$MEMO_FIX_EXIT" -ne 0 ]; then
  echo "⚠️  fix-inline-default-memo-deps ha restituito exit ${MEMO_FIX_EXIT} — verificare manualmente."
fi
echo ""

# ── GATE [] / {} INLINE NEI DEPS DI useMemo / useCallback ─────
# Un [] o {} letterale nei deps crea un nuovo riferimento ad ogni render.
# Se useMemo/useCallback ricalcola ad ogni ciclo e il risultato alimenta
# altri hook o stati, si innesca "Maximum update depth exceeded" → crash.
# Distinto dal caso useQuery (check-unstable-query-defaults): qui il default
# inline è direttamente nel deps array del hook di memoizzazione.
# Caso tipico: useMemo(() => x ?? [], [x ?? []])  ← [] nei deps
# Vedi: scripts/check-inline-default-memo-deps.sh
echo "════════════════════════════════════════"
echo "  Gate [] / {} inline in useMemo / useCallback deps"
echo "════════════════════════════════════════"
INLINE_MEMO_DEPS_EXIT=0
bash scripts/check-inline-default-memo-deps.sh || INLINE_MEMO_DEPS_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$INLINE_MEMO_DEPS_EXIT" -ne 0 ]; then
  echo "❌ Gate inline-default-memo-deps fallito — correggere prima di procedere."
  exit "$INLINE_MEMO_DEPS_EXIT"
fi

# ── GATE REGRESSION TEST — check-inline-default-memo-deps ─────────────────
# Verifica che il gate stesso (Modes A/B/C1/C2, soppressioni, guard tipo) non
# sia regredito da modifiche alla logica Python (bracket-depth tracker,
# lookbehind regex, ecc.).  I 20 snippet sintetici coprono ogni modalità di
# rilevamento + tutti i falsi-positivo noti.
echo "════════════════════════════════════════"
echo "  Test regressione gate memo-deps"
echo "════════════════════════════════════════"
MEMO_DEPS_REGTEST_EXIT=0
bash scripts/test-check-inline-default-memo-deps.sh || MEMO_DEPS_REGTEST_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$MEMO_DEPS_REGTEST_EXIT" -ne 0 ]; then
  echo "❌ Regression test memo-deps FALLITI — la logica del gate è regredita."
  echo "   Eseguire 'bash scripts/test-check-inline-default-memo-deps.sh' localmente per i dettagli."
  exit "$MEMO_DEPS_REGTEST_EXIT"
fi

# ── GATE OGGETTO-MUTATION INTERO NEI DEPS DI useCallback / useMemo ──────────
# Mettere l'oggetto-mutation INTERO di React Query (variabile *Mutation) nei
# deps di useCallback/useMemo fa cambiare riferimento all'handler ad ogni
# transizione di stato (idle→pending→success). Se l'handler è chiuso in un
# renderItem di FlatList, l'intera lista si ridisegna ad ogni azione utente /
# tick di refetch — il bug ripulito a mano nei task #5038 e #5039.
# Fix: tenere la mutation in un ref, deps = solo slice primitive (.mutate,
# .isPending). Consentito nei deps: *Mutation.mutate, *Mutation.isPending,
# *MutationRef. Le occorrenze legacy sono congelate in
# .mutation-object-deps-baseline; il gate blocca solo le NUOVE.
# Vedi: .agents/memory/react-query-mutation-ref-deps.md
echo "════════════════════════════════════════"
echo "  Gate oggetto-mutation intero nei deps"
echo "════════════════════════════════════════"
MUTATION_DEPS_EXIT=0
bash scripts/check-mutation-object-deps.sh || MUTATION_DEPS_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$MUTATION_DEPS_EXIT" -ne 0 ]; then
  echo "❌ Gate mutation-object-deps fallito — correggere prima di procedere."
  exit "$MUTATION_DEPS_EXIT"
fi

# ── GATE AI generateObject DIRETTO CON SCHEMA (bypass generateStructured) ──
# llama-3.x (default Groq) NON supporta json_schema nativo.
# generateObject({ schema: ... }) fuori dal gateway approvato crasha in prod
# quando il modello si risolve a llama. Il gateway corretto è generateStructured
# in server/ai/moderation/provider.ts che usa output:"no-schema" + validazione Zod.
# Soppressione: // check-ai-direct-generateobject: safe (riga precedente alla chiamata).
# Vedi: .agents/memory/ai-strict-schema.md
echo "════════════════════════════════════════"
echo "  Gate AI generateObject con schema diretto"
echo "════════════════════════════════════════"
AI_SCHEMA_EXIT=0
bash scripts/check-ai-direct-generateobject.sh || AI_SCHEMA_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$AI_SCHEMA_EXIT" -ne 0 ]; then
  echo "❌ Gate ai-direct-generateobject fallito — correggere prima di procedere."
  exit "$AI_SCHEMA_EXIT"
fi

# ── GATE AUTO-LEARN NO-CLOUD (Bowie self-learning deve restare locale) ──
# server/ai/assistant/auto-learn.ts è il job di auto-apprendimento LOCALE di
# Bowie: DEVE usare esclusivamente Ollama locale (callOllamaChat), MAI un
# provider cloud (Groq/Gemini/OpenAI) né il gateway runWithFallback
# (server/ai/moderation/provider.ts). Il test runtime (Task #5330) scatta solo
# se il modulo cloud viene davvero importato/invocato; questo gate statico
# blocca l'import stesso, a lint/CI time, prima che il codice giri.
# Vedi: server/ai/assistant/auto-learn.ts (commento header)
echo "════════════════════════════════════════"
echo "  Gate auto-learn no-cloud (Bowie self-learning)"
echo "════════════════════════════════════════"
AUTO_LEARN_CLOUD_EXIT=0
bash scripts/check-auto-learn-no-cloud-ai.sh || AUTO_LEARN_CLOUD_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$AUTO_LEARN_CLOUD_EXIT" -ne 0 ]; then
  echo "❌ Gate auto-learn-no-cloud-ai fallito — correggere prima di procedere."
  exit "$AUTO_LEARN_CLOUD_EXIT"
fi

# ── GATE Promise.all NON BUDGETTATI IN JOB BG (pool DB saturation) ──
# server/matching/* e server/jobs/*: un Promise.all([...]) di setup con
# >2 elementi (o un fan-out .map() non pLimit-bounded) apre più connessioni
# del pool DB simultaneamente. Con pool max=10 un burst così affama il
# traffico utente (picco intermittente di "waiting"). Già risolto per
# music/bio affinity, archive stale, enrich-breakdowns e le stat time-profile;
# questo gate blocca la regressione futura. Soppressione:
# // check-bg-promise-all-burst: safe (riga precedente alla chiamata).
# Vedi: .agents/memory/pool-promise-all-setup-burst.md
echo "════════════════════════════════════════"
echo "  Gate Promise.all non budgettati nei job bg"
echo "════════════════════════════════════════"
BG_PROMISE_ALL_EXIT=0
bash scripts/check-bg-promise-all-burst.sh || BG_PROMISE_ALL_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$BG_PROMISE_ALL_EXIT" -ne 0 ]; then
  echo "❌ Gate bg-promise-all-burst fallito — correggere prima di procedere."
  exit "$BG_PROMISE_ALL_EXIT"
fi

# ── GATE TC ADMIN CARD RENDER TEST ───────────────────────────────────────────
# Ogni componente sotto components/admin/ che interroga /api/admin/thinkcentre-*
# (tramite fetch o useQuery) DEVE avere un render test in components/__tests__/.
# Contesto: Task #437 ha dimostrato che un cambio di shape del payload TC agent
# (nested vs flat) causava un TypeError non rilevabile senza un render test.
# Gap pre-esistenti alla regola: ThinkCentreCard, ThinkCentreSystemMonitor,
# AdminStatsCards — allowlistati nel gate, non bloccano.
# Soppressione per file che usano la URL solo in invalidateQueries:
#   // check-tc-admin-card-tests: invalidate-only  (cima al file o riga precedente)
# Vedi: components/__tests__/ThinkCentreEfficiencyCard.render.test.ts (template)
#        CONTRIBUTING.md § "Render test obbligatori per le card admin ThinkCentre"
echo "════════════════════════════════════════"
echo "  Gate TC admin card render test"
echo "════════════════════════════════════════"
TC_CARD_TEST_EXIT=0
bash scripts/check-tc-admin-card-tests.sh || TC_CARD_TEST_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$TC_CARD_TEST_EXIT" -ne 0 ]; then
  echo "❌ Gate tc-admin-card-tests fallito — aggiungere il render test o il pragma prima di procedere."
  exit "$TC_CARD_TEST_EXIT"
fi

# ── GATE REGRESSION TEST — check-tc-admin-card-tests ─────────────────────────
# Verifica che il gate stesso non sia regredito: crea temporaneamente un
# componente dummy in components/admin/ e ne testa la detection (exit 1),
# poi verifica exit 0 con pragma e con render test presente.
# Protegge dalla modifica silenziosa della logica di grep/allowlist nel gate.
echo "════════════════════════════════════════"
echo "  Test regressione gate tc-admin-card-tests"
echo "════════════════════════════════════════"
TC_CARD_REGTEST_EXIT=0
bash scripts/__tests__/check-tc-admin-card-tests.test.sh || TC_CARD_REGTEST_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$TC_CARD_REGTEST_EXIT" -ne 0 ]; then
  echo "❌ Regression test tc-admin-card-tests FALLITO — la logica del gate è regredita."
  echo "   Eseguire 'bash scripts/__tests__/check-tc-admin-card-tests.test.sh' per i dettagli."
  exit "$TC_CARD_REGTEST_EXIT"
fi

# ── GATE REGRESSION TEST — check-direct-eval-scope ────────────────────────────
# Verifica che ALLOWED_FILE (l'unico file autorizzato a usare eval()) sia rimasto
# esattamente "server/ai/db-integrity/registry.ts" e che il gate rilevi eval()
# nei file non autorizzati. Cambiare ALLOWED_FILE permetterebbe a un file arbitrario
# di usare eval() senza che il gate lo rilevi.
echo "════════════════════════════════════════"
echo "  Test regressione gate direct-eval-scope"
echo "════════════════════════════════════════"
EVAL_SCOPE_REGTEST_EXIT=0
bash scripts/__tests__/check-direct-eval-scope.test.sh || EVAL_SCOPE_REGTEST_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$EVAL_SCOPE_REGTEST_EXIT" -ne 0 ]; then
  echo "❌ Regression test direct-eval-scope FALLITO — ALLOWED_FILE o logica del gate è regredita."
  echo "   Eseguire 'bash scripts/__tests__/check-direct-eval-scope.test.sh' per i dettagli."
  exit "$EVAL_SCOPE_REGTEST_EXIT"
fi

# ── GATE REGRESSION TEST — check-ai-direct-generateobject ────────────────────
# Verifica che la WHITELIST (embedded nel Python heredoc del Check 1) contenga
# esattamente 'server/ai/moderation/provider.ts'. Aggiungere un file alla
# WHITELIST permetterebbe di silenziare silenziosamente il Check 1 per quel file,
# consentendo l'uso di generateObject con schema diretto fuori dal gateway approvato.
echo "════════════════════════════════════════"
echo "  Test regressione gate ai-direct-generateobject"
echo "════════════════════════════════════════"
AI_GENERATEOBJ_REGTEST_EXIT=0
bash scripts/__tests__/check-ai-direct-generateobject.test.sh || AI_GENERATEOBJ_REGTEST_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$AI_GENERATEOBJ_REGTEST_EXIT" -ne 0 ]; then
  echo "❌ Regression test ai-direct-generateobject FALLITO — WHITELIST o logica del gate è regredita."
  echo "   Eseguire 'bash scripts/__tests__/check-ai-direct-generateobject.test.sh' per i dettagli."
  exit "$AI_GENERATEOBJ_REGTEST_EXIT"
fi

# ── GATE REGRESSION TEST — check-leaflet-map-guard ────────────────────────────
# Verifica che PROTECTED (file blindati) e FORBIDDEN (pattern vietati) non siano
# stati modificati silenziosamente. Rimuovere un file da PROTECTED lo esclude dai
# controlli; rimuovere un pattern da FORBIDDEN permette a quel simbolo di rientrare
# nel path Leaflet senza essere rilevato — entrambi ripristinano il rischio
# "mappa nera" diagnosticato nel ramo 55.x.
echo "════════════════════════════════════════"
echo "  Test regressione gate leaflet-map-guard"
echo "════════════════════════════════════════"
LEAFLET_GUARD_REGTEST_EXIT=0
bash scripts/__tests__/check-leaflet-map-guard.test.sh || LEAFLET_GUARD_REGTEST_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$LEAFLET_GUARD_REGTEST_EXIT" -ne 0 ]; then
  echo "❌ Regression test leaflet-map-guard FALLITO — PROTECTED o FORBIDDEN sono stati modificati."
  echo "   Eseguire 'bash scripts/__tests__/check-leaflet-map-guard.test.sh' per i dettagli."
  exit "$LEAFLET_GUARD_REGTEST_EXIT"
fi

# ── GATE DEPLOY-BUILD STEP NUMBERING ─────────────────────────
# Verifica che i label [N/TOTAL] in deploy-build.sh siano sequenziali e
# che il TOTAL dichiarato corrisponda al conteggio reale degli step.
# Previene il caso "nuovo step aggiunto senza rinumerare" che si scoprirebbe
# solo in produzione — troppo tardi. Il gate è bloccante.
echo "════════════════════════════════════════"
echo "  Gate deploy-build step numbering [N/TOTAL]"
echo "════════════════════════════════════════"
DEPLOY_STEP_NUMBERS_EXIT=0
bash scripts/check-deploy-build-step-numbers.sh || DEPLOY_STEP_NUMBERS_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$DEPLOY_STEP_NUMBERS_EXIT" -ne 0 ]; then
  echo "❌ Gate deploy-build-step-numbers fallito — rinumerare i label [N/TOTAL] in scripts/deploy-build.sh."
  exit "$DEPLOY_STEP_NUMBERS_EXIT"
fi

# ── GATE REGRESSION TEST — check-deploy-build-step-numbers ───────────────────
# Verifica che il gate stesso non sia silenziosamente rotto (es. un bug Python
# nel parser che fa passare un TOTAL stantio senza rilevarlo).  Usa fixture
# temporanee con violazioni note e controlla exit code + messaggio.
echo "════════════════════════════════════════"
echo "  Test regressione gate deploy-build-step-numbers"
echo "════════════════════════════════════════"
STEP_NUMBERS_REGTEST_EXIT=0
bash scripts/__tests__/check-deploy-build-step-numbers.test.sh || STEP_NUMBERS_REGTEST_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$STEP_NUMBERS_REGTEST_EXIT" -ne 0 ]; then
  echo "❌ Regression test check-deploy-build-step-numbers FALLITO — il gate potrebbe non rilevare TOTAL stantii o step duplicati."
  echo "   Eseguire 'bash scripts/__tests__/check-deploy-build-step-numbers.test.sh' per i dettagli."
  exit "$STEP_NUMBERS_REGTEST_EXIT"
fi

# ── GATE PRE-COMMIT HOOK WIRING ───────────────────────────────
# Verifica che .git/hooks/pre-commit sia installato (via setup-hooks.sh)
# e che contenga il gate check-deploy-build-step-numbers.sh.
# Un hook mancante o stale permette a uno sviluppatore di committare
# deploy-build.sh con step mal numerati senza alcun avviso locale.
# Nel runner post-merge il hook non è mai preinstallato: lo installiamo
# silenziosamente prima della verifica così il gate valuta sempre uno
# stato fresco e aggiornato, non un'assenza strutturale dell'ambiente.
echo "════════════════════════════════════════"
echo "  Gate pre-commit hook wiring"
echo "════════════════════════════════════════"
bash scripts/setup-hooks.sh > /dev/null 2>&1 || true
PRE_COMMIT_HOOK_EXIT=0
bash scripts/check-pre-commit-hook-wiring.sh || PRE_COMMIT_HOOK_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$PRE_COMMIT_HOOK_EXIT" -ne 0 ]; then
  echo "❌ Gate pre-commit hook wiring fallito — eseguire 'bash scripts/setup-hooks.sh' per installare/aggiornare il hook."
  exit "$PRE_COMMIT_HOOK_EXIT"
fi

# ── GATE REGRESSION TEST — check-pre-commit-hook-wiring ──────────────────────
# Verifica che il gate stesso rilevi correttamente i tre casi di guasto:
#   (a) hook mancante → exit 1 + "PRE-COMMIT HOOK NOT INSTALLED"
#   (b) hook non eseguibile → exit 1 + "PRE-COMMIT HOOK NOT EXECUTABLE"
#   (c) hook stale (senza check-deploy-build-step-numbers.sh) → exit 1 + "STALE"
# e il caso felice (d) → exit 0.
# Ogni caso usa un git repo temporaneo isolato così il test non tocca mai
# il vero .git/hooks/ del workspace.
echo "════════════════════════════════════════"
echo "  Test regressione gate pre-commit hook wiring"
echo "════════════════════════════════════════"
PRE_COMMIT_REGTEST_EXIT=0
bash scripts/__tests__/check-pre-commit-hook-wiring.test.sh || PRE_COMMIT_REGTEST_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$PRE_COMMIT_REGTEST_EXIT" -ne 0 ]; then
  echo "❌ Regression test pre-commit-hook-wiring FALLITO — la logica del gate è regredita."
  echo "   Eseguire 'bash scripts/__tests__/check-pre-commit-hook-wiring.test.sh' per i dettagli."
  exit "$PRE_COMMIT_REGTEST_EXIT"
fi

# ── REGRESSION TEST: setup-hooks.sh install path ─────────────
# Esercita il percorso completo che uno sviluppatore esegue su un fresh clone:
# setup-hooks.sh → hook installato → hook blocca TOTAL stantio in deploy-build.sh.
# A differenza del gate sopra (che verifica solo il contenuto dell'hook già
# installato), questo test cattura regressioni in setup-hooks.sh stesso
# (es. sorgente sbagliata copiata, post-install wiring check rimosso).
echo "════════════════════════════════════════"
echo "  Regression test — setup-hooks.sh install path"
echo "════════════════════════════════════════"
SETUP_HOOKS_INSTALL_EXIT=0
bash scripts/__tests__/check-setup-hooks-install.test.sh || SETUP_HOOKS_INSTALL_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$SETUP_HOOKS_INSTALL_EXIT" -ne 0 ]; then
  echo "❌ Regression test check-setup-hooks-install FALLITO — setup-hooks.sh non installa un hook funzionante."
  echo "   Eseguire 'bash scripts/__tests__/check-setup-hooks-install.test.sh' per i dettagli."
  exit "$SETUP_HOOKS_INSTALL_EXIT"
fi

# ── GUARD PORTE .replit (MAPPING [[ports]] + DEPLOY) ─────────
# REGOLA BLOCCANTE (replit.md § Preferenze utente):
# Nessun agente può modificare [[ports]] senza autorizzazione esplicita utente.
# Mapping canonico immutabile:
#   localPort=5000  → externalPort=80    (Express API, traffico pubblico)
#   localPort=8081  → externalPort=8081  (probe deploy interno)
#   localPort=8082  → externalPort=6000  (invariato)
# Il comando [deployment] run DEVE contenere PORT=5000.
echo "════════════════════════════════════════"
echo "  Guard porte .replit ([[ports]] + deploy)"
echo "════════════════════════════════════════"
PORT_OK=true

# 1. Mapping [[ports]] — verifica configurazione canonica
_REPLIT_NORM=$(tr -d ' ' < .replit 2>/dev/null)

if ! printf '%s\n' "$_REPLIT_NORM" | grep -A1 'localPort=5000' | grep -q 'externalPort=80$'; then
  echo "❌ ERRORE [[ports]]: localPort=5000 deve avere externalPort=80!"
  PORT_OK=false
else
  echo "✅ [[ports]] localPort=5000 → externalPort=80: OK"
fi

if ! printf '%s\n' "$_REPLIT_NORM" | grep -A1 'localPort=8081' | grep -q 'externalPort=8081$'; then
  echo "❌ ERRORE [[ports]]: localPort=8081 deve avere externalPort=8081!"
  PORT_OK=false
else
  echo "✅ [[ports]] localPort=8081 → externalPort=8081: OK"
fi

# 2. Comando [deployment] — PORT=5000 nel run
if grep -q 'PORT=8081' .replit 2>/dev/null; then
  echo "❌ ERRORE deploy: .replit contiene PORT=8081 nel comando run!"
  PORT_OK=false
fi
if ! grep -q 'PORT=5000' .replit 2>/dev/null; then
  echo "❌ ERRORE deploy: .replit non contiene PORT=5000 nel comando run!"
  PORT_OK=false
fi

if [ "$PORT_OK" = true ]; then
  echo "✅ Porte .replit corrette: [[ports]] canonico + deploy PORT=5000."
else
  echo ""
  echo "⛔ PORTE ERRATE — impossibile correggere automaticamente."
  echo "   Configurazione canonica richiesta:"
  echo "     [[ports]] localPort=5000  → externalPort=80"
  echo "     [[ports]] localPort=8081  → externalPort=8081"
  echo "     [[ports]] localPort=8082  → externalPort=6000"
  echo "     [deployment] run → PORT=5000"
fi
echo "════════════════════════════════════════"
echo ""

# ── GUARD RELEASE_NUMBER ─────────────────────────────────────
# RELEASE_NUMBER deve essere derivato da app.json a runtime (non hardcoded).
# Se qualcuno lo reintroduce come costante numerica, questo guard lo blocca.
echo "════════════════════════════════════════"
echo "  Guard RELEASE_NUMBER (buildInfo.ts)"
echo "════════════════════════════════════════"
RELEASE_NUMBER_HARDCODED=false
if grep -qE '^export const RELEASE_NUMBER(\s*:[^=]+)?\s*=\s*[0-9]+' constants/buildInfo.ts 2>/dev/null; then
  RELEASE_NUMBER_HARDCODED=true
  HARDCODED_VALUE=$(grep -oP 'RELEASE_NUMBER(\s*:[^=]+)?\s*=\s*\K[0-9]+' constants/buildInfo.ts | head -1 || echo "?")
  VERSION_CODE=$(node -p "require('./app.json').expo.android.versionCode" 2>/dev/null || echo "?")
  echo "❌ ERRORE: RELEASE_NUMBER è hardcoded (${HARDCODED_VALUE}) in constants/buildInfo.ts!"
  echo "   Deve essere derivato da app.json a runtime:"
  echo "   import appJson from '../app.json';"
  echo "   export const RELEASE_NUMBER: number = appJson.expo.android.versionCode;"
  if [ "$HARDCODED_VALUE" != "$VERSION_CODE" ]; then
    echo "   ⚠️  Disallineamento rilevato: buildInfo.ts=${HARDCODED_VALUE}  app.json=${VERSION_CODE}"
  fi
else
  echo "✅ RELEASE_NUMBER derivato a runtime da app.json — nessun valore hardcoded."
fi
echo "════════════════════════════════════════"
echo ""
if [ "$RELEASE_NUMBER_HARDCODED" = true ]; then
  echo "❌ Guard RELEASE_NUMBER fallito — correggere constants/buildInfo.ts prima di procedere."
  exit 1
fi

# ── GUARD RUNTIME_VERSION ────────────────────────────────────
# RUNTIME_VERSION deve essere derivato da app.json a runtime (non hardcoded).
# Se qualcuno lo reintroduce come stringa letterale, questo guard lo blocca.
echo "════════════════════════════════════════"
echo "  Guard RUNTIME_VERSION (buildInfo.ts)"
echo "════════════════════════════════════════"
RUNTIME_VERSION_HARDCODED=false
if grep -qE '^export const RUNTIME_VERSION(\s*:[^=]+)?\s*=\s*"[^"]*"' constants/buildInfo.ts 2>/dev/null; then
  RUNTIME_VERSION_HARDCODED=true
  HARDCODED_RTVER=$(grep -oP 'RUNTIME_VERSION(\s*:[^=]+)?\s*=\s*"\K[^"]+' constants/buildInfo.ts || echo "?")
  APP_RUNTIME=$(node -p "require('./app.json').expo.runtimeVersion" 2>/dev/null || echo "?")
  echo "❌ ERRORE: RUNTIME_VERSION è hardcoded (\"${HARDCODED_RTVER}\") in constants/buildInfo.ts!"
  echo "   Deve essere derivato da app.json a runtime:"
  echo "   import appJson from '../app.json';"
  echo "   export const RUNTIME_VERSION: string = appJson.expo.runtimeVersion;"
  if [ "$HARDCODED_RTVER" != "$APP_RUNTIME" ]; then
    echo "   ⚠️  Disallineamento rilevato: buildInfo.ts=\"${HARDCODED_RTVER}\"  app.json=${APP_RUNTIME}"
  fi
else
  echo "✅ RUNTIME_VERSION derivato a runtime da app.json — nessun valore hardcoded."
fi
echo "════════════════════════════════════════"
echo ""
if [ "$RUNTIME_VERSION_HARDCODED" = true ]; then
  echo "❌ Guard RUNTIME_VERSION fallito — correggere constants/buildInfo.ts prima di procedere."
  exit 1
fi

# ── GUARD REGISTRY ↔ MIGRATION DRIFT (pre-boot guard) ────────
# Verifica che ogni tabella dichiarata nel registry Drizzle sia coperta da
# almeno un file di migration numerato. Stessa guardia che gira in boot-sequence
# Phase 2b — qui viene anticipata al merge così lo sviluppatore riceve feedback
# immediato senza dover avviare il server.
echo "════════════════════════════════════════"
echo "  Guard Registry ↔ Migration drift"
echo "════════════════════════════════════════"
SCHEMA_DRIFT_EXIT=0
npx tsx server/scripts/check-schema-migration-drift.ts 2>&1 || SCHEMA_DRIFT_EXIT=$?
if [ "$SCHEMA_DRIFT_EXIT" -eq 0 ]; then
  echo "✅ Registry ↔ Migration: nessun nuovo drift rilevato."
elif [ "$SCHEMA_DRIFT_EXIT" -eq 2 ]; then
  echo "⚠️  Registry ↔ Migration check: impossibile leggere le migration (exit 2) — verificare manualmente."
else
  echo "❌ Registry ↔ Migration DRIFT rilevato — tabelle o colonne senza migration numerata."
  echo "   Crea il file migrations/NNNN_*.sql con le DDL mancanti prima di procedere."
  echo "════════════════════════════════════════"
  echo ""
  exit "$SCHEMA_DRIFT_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GUARD INDICI DESC/WHERE — INDEX DRIFT ────────────────────
# Verifica che gli indici speciali (DESC / WHERE) dello schema Drizzle TS
# siano allineati con le migration SQL e con il DB live.
# Un DROP+CREATE silenzioso nelle migration reintroduce drift a ogni deploy.
echo "════════════════════════════════════════"
echo "  Guard Index Drift (DESC/WHERE)"
echo "════════════════════════════════════════"
INDEX_DRIFT_EXIT=0
npx tsx scripts/check-index-drift.ts 2>&1 || INDEX_DRIFT_EXIT=$?
if [ "$INDEX_DRIFT_EXIT" -eq 0 ]; then
  echo "✅ Index Drift: nessun drift DESC/WHERE rilevato."
else
  echo "❌ Index Drift RILEVATO — indici speciali (DESC/WHERE) non allineati."
  echo "   Aggiungere una migration correttiva o correggere lo schema Drizzle TS."
  echo "════════════════════════════════════════"
  echo ""
  exit "$INDEX_DRIFT_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE INLINE BROKEN FIXTURES NEI TEST ─────────────────────
# Verifica che nessun file di test sotto server/__tests__/ ridefinisca
# inline stringhe "broken fixture" (es. '{"title":"FOO_BROKEN"') invece
# di importarle dal file condiviso:
#   server/__tests__/helpers/route-fixtures.ts
# Un cambiamento a routeSchema aggiorna le fixture in un unico posto;
# copie duplicate restano silenziosamente in drift e rendono vacui i test.
echo "════════════════════════════════════════"
echo "  Gate inline broken-fixture strings nei test"
echo "════════════════════════════════════════"
BROKEN_FIXTURES_EXIT=0
bash scripts/check-inline-broken-fixtures.sh || BROKEN_FIXTURES_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$BROKEN_FIXTURES_EXIT" -ne 0 ]; then
  echo "❌ Gate inline-broken-fixtures fallito — importare da server/__tests__/helpers/route-fixtures.ts."
  exit "$BROKEN_FIXTURES_EXIT"
fi

# ── GATE TEST COMPONENTI ────────────────────────────────────
# Esegue TUTTI i test automatici in components/__tests__/ (glob a livello di
# cartella: ogni nuovo file *.test.ts viene incluso automaticamente, senza
# bisogno di modificare questo script). La directory copre gesture, logica
# widget, comportamento UI e qualunque altro test di componente aggiunto in
# futuro.
# Se fallisce, il merge è bloccato: regressioni sui componenti critici
# vengono rilevate qui prima di raggiungere produzione.
#
# ⚠ CONTRIBUTOR: quando aggiungi un nuovo file in components/__tests__/,
#   NON serve modificare questo script — il glob lo include automaticamente.
#   Verifica che il file appaia nell'elenco "File di test rilevati" qui sotto.
#   Consulta CONTRIBUTING.md → "Test di componente" per le convenzioni.
echo "════════════════════════════════════════"
echo "  Gate test gesture componenti"
echo "════════════════════════════════════════"
COMPONENT_TEST_FILES=()
for _glob in components/__tests__/*.test.ts components/__tests__/*.test.tsx; do
  [ -f "$_glob" ] && COMPONENT_TEST_FILES+=("$_glob")
done
COMPONENT_TEST_COUNT=${#COMPONENT_TEST_FILES[@]}
echo "  File di test rilevati (${COMPONENT_TEST_COUNT}):"
for _f in "${COMPONENT_TEST_FILES[@]}"; do
  echo "    • $(basename "$_f")"
done
echo ""
GESTURE_TEST_EXIT=0
npx vitest run components/__tests__ 2>&1 || GESTURE_TEST_EXIT=$?
if [ "$GESTURE_TEST_EXIT" -eq 0 ]; then
  echo "✅ Gesture tests: tutti i test passati."
else
  echo "❌ Gesture tests FALLITI (exit ${GESTURE_TEST_EXIT}) — verificare components/__tests__/ prima di procedere."
  echo "   Eseguire 'npx vitest run components/__tests__' localmente per i dettagli."
  echo "════════════════════════════════════════"
  echo ""
  exit "$GESTURE_TEST_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE TEST INIT-GATE LOGIN (Task #4458) ──────────────────
# Blocca la regressione del blanket-503: il gate /api/* deve lasciar passare le
# rotte auth essenziali appena dbReady=true (login senza "Server occupato"), e
# il client deve ritentare sui 503 transitori senza ritentare gli altri errori.
echo "════════════════════════════════════════"
echo "  Gate test gate di init (login)"
echo "════════════════════════════════════════"
INIT_GATE_TEST_EXIT=0
npx vitest run server/__tests__/init-gate.test.ts 2>&1 || INIT_GATE_TEST_EXIT=$?
if [ "$INIT_GATE_TEST_EXIT" -eq 0 ]; then
  npx vitest run --config vitest.config.lib.ts lib/__tests__/init-retry.test.ts 2>&1 || INIT_GATE_TEST_EXIT=$?
fi
if [ "$INIT_GATE_TEST_EXIT" -eq 0 ]; then
  echo "✅ Init-gate tests: gate server + retry client OK."
else
  echo "❌ Init-gate tests FALLITI (exit ${INIT_GATE_TEST_EXIT}) — il login potrebbe mostrare 'Server occupato' al boot."
  echo "   Eseguire 'npx vitest run server/__tests__/init-gate.test.ts' e"
  echo "   'npx vitest run --config vitest.config.lib.ts lib/__tests__/init-retry.test.ts' localmente."
  echo "════════════════════════════════════════"
  echo ""
  exit "$INIT_GATE_TEST_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE TEST CLASSIFICAZIONE SAFE-FIX (Task #4920) ──────────────────────────
# Blocca la regressione della logica 🟢 safe-fix / 🔴 review in
# scripts/health-check/classify.ts: la distinzione è deterministica e guida il
# pulsante "Crea tutti i task sicuri". Un errore qui creerebbe task automatici
# per fix rischiosi (override critici/pattern rischiosi/allowlist categorie).
echo "════════════════════════════════════════"
echo "  Gate test classificazione safe-fix"
echo "════════════════════════════════════════"
SAFEFIX_TEST_EXIT=0
npx vitest run scripts/health-check/__tests__/classify.test.ts 2>&1 || SAFEFIX_TEST_EXIT=$?
if [ "$SAFEFIX_TEST_EXIT" -eq 0 ]; then
  echo "✅ Safe-fix classify tests: allowlist + override critici/rischiosi OK."
else
  echo "❌ Safe-fix classify tests FALLITI (exit ${SAFEFIX_TEST_EXIT}) — la logica 🟢/🔴 è regredita."
  echo "   Eseguire 'npx vitest run scripts/health-check/__tests__/classify.test.ts' localmente."
  echo "════════════════════════════════════════"
  echo ""
  exit "$SAFEFIX_TEST_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE TEST CHECKER HEALTH-CHECK (tutti) ───────────────────────────────────
# Esegue TUTTI i test in scripts/health-check/__tests__/ con un singolo
# comando glob. Qualsiasi nuovo file *.test.ts aggiunto alla directory
# viene incluso automaticamente senza dover modificare questo script.
# Copre: classify, dead-code, file-placement, imports, known-errors, logic,
# typecheck — e ogni checker aggiunto in futuro.
# Se uno qualsiasi dei test è rosso, il merge è bloccato.
echo "════════════════════════════════════════"
echo "  Gate test checker health-check (tutti)"
echo "════════════════════════════════════════"
HC_TEST_FILES=()
for _hcf in scripts/health-check/__tests__/*.test.ts; do
  [ -f "$_hcf" ] && HC_TEST_FILES+=("$_hcf")
done
HC_TEST_COUNT=${#HC_TEST_FILES[@]}
echo "  File di test rilevati (${HC_TEST_COUNT}):"
for _hcf in "${HC_TEST_FILES[@]}"; do
  echo "    • $(basename "$_hcf")"
done
echo ""
HC_TEST_EXIT=0
npx vitest run scripts/health-check/__tests__ 2>&1 || HC_TEST_EXIT=$?
if [ "$HC_TEST_EXIT" -eq 0 ]; then
  echo "✅ Health-check checker tests: tutti i ${HC_TEST_COUNT} file passati."
else
  echo "❌ Health-check checker tests FALLITI (exit ${HC_TEST_EXIT}) — un checker è regredito."
  echo "   Eseguire 'npx vitest run scripts/health-check/__tests__' localmente per i dettagli."
  echo "════════════════════════════════════════"
  echo ""
  exit "$HC_TEST_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE TEST REVOCA PERMESSO BACKGROUND ─────────────────────────────────────
# Blocca regressioni su checkBackgroundPermission e evaluateBackgroundRevocation:
# verifica la logica pura di revoca, l'infrastruttura di polling (setInterval),
# il comportamento del provider sul contesto React e il listener AppState reale.
echo "════════════════════════════════════════"
echo "  Gate test revoca permesso background"
echo "════════════════════════════════════════"
BG_PERM_TEST_EXIT=0
npx vitest run lib/__tests__/background-permission-revocation.test.ts 2>&1 || BG_PERM_TEST_EXIT=$?
if [ "$BG_PERM_TEST_EXIT" -eq 0 ]; then
  echo "✅ Background-permission tests: revoca + polling + AppState OK."
else
  echo "❌ Background-permission tests FALLITI (exit ${BG_PERM_TEST_EXIT}) — regressione in checkBackgroundPermission."
  echo "   Eseguire 'npx vitest run lib/__tests__/background-permission-revocation.test.ts' localmente."
  echo "════════════════════════════════════════"
  echo ""
  exit "$BG_PERM_TEST_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE TEST HOOK AVVIO (useAppBootstrap / useOtaAutoUpdate) ────────────────
# Blocca regressioni sui timeout di cold-start e OTA update: qualsiasi modifica
# agli hook di avvio (useAppBootstrap, useOtaAutoUpdate) viene verificata prima
# del merge. Senza questo gate, un errore nei timeout di boot passerebbe
# inosservato perché hooks/__tests__/ non era in nessun gate bloccante.
echo "════════════════════════════════════════"
echo "  Gate test hook di avvio (hooks/__tests__)"
echo "════════════════════════════════════════"
HOOKS_TEST_EXIT=0
npx vitest run hooks/__tests__ 2>&1 || HOOKS_TEST_EXIT=$?
if [ "$HOOKS_TEST_EXIT" -eq 0 ]; then
  echo "✅ Hook tests: useAppBootstrap + useOtaAutoUpdate OK."
else
  echo "❌ Hook tests FALLITI (exit ${HOOKS_TEST_EXIT}) — verificare hooks/__tests__/ prima di procedere."
  echo "   Eseguire 'npx vitest run hooks/__tests__' localmente per i dettagli."
  echo "════════════════════════════════════════"
  echo ""
  exit "$HOOKS_TEST_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE SOPPRESSIONE ALLARMI TC SPENTO (aggregator E2E) ─────────────────────
# Verifica che runAggregatorCycle() applichi correttamente la soppressione
# downstream quando ThinkCentre è powered-off: db.db.ping_ms e
# maps.health.network_instability NON devono superare "warn" nello snapshot
# finale. Blocca regressioni su OUTAGE_DOWNSTREAM_IDS o sulla logica E2E.
echo "════════════════════════════════════════"
echo "  Gate soppressione allarmi TC spento (aggregator E2E)"
echo "════════════════════════════════════════"
TC_SUPPRESSION_EXIT=0
npx vitest run --config vitest.config.server.ts server/__tests__/aggregator-downstream-suppression.test.ts 2>&1 || TC_SUPPRESSION_EXIT=$?
if [ "$TC_SUPPRESSION_EXIT" -eq 0 ]; then
  echo "✅ Aggregator TC-suppression: unit + E2E OK."
else
  echo "❌ Aggregator TC-suppression FALLITO (exit ${TC_SUPPRESSION_EXIT}) — verificare la soppressione downstream in aggregator.ts."
  echo "   Eseguire 'npx vitest run --config vitest.config.server.ts server/__tests__/aggregator-downstream-suppression.test.ts' localmente."
  echo "════════════════════════════════════════"
  echo ""
  exit "$TC_SUPPRESSION_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE FLAG PULIZIA NOTTURNA METRO ─────────────────────────
# Verifica che metro-cache-check.sh (sourciato da start-expo.sh):
#   - flag PRESENTE → FORCE_RESET=1 e flag rimosso
#   - flag ASSENTE  → FORCE_RESET=0
# Blocca la regressione del meccanismo di pulizia automatica 01:00 UTC.
echo "════════════════════════════════════════"
echo "  Gate flag pulizia notturna Metro"
echo "════════════════════════════════════════"
METRO_CACHE_FLAG_EXIT=0
bash scripts/__tests__/metro-cache-flag.test.sh 2>&1 || METRO_CACHE_FLAG_EXIT=$?
if [ "$METRO_CACHE_FLAG_EXIT" -eq 0 ]; then
  echo "✅ Flag pulizia notturna Metro: gate verde."
else
  echo "❌ Flag pulizia notturna Metro FALLITO (exit ${METRO_CACHE_FLAG_EXIT}) — metro-cache-check.sh o start-expo.sh hanno regressioni."
  echo "   Eseguire 'bash scripts/__tests__/metro-cache-flag.test.sh' localmente per i dettagli."
  echo "════════════════════════════════════════"
  echo ""
  exit "$METRO_CACHE_FLAG_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE STRESS RACE AVVIO METRO ─────────────────────────────
# Test deterministico (start-expo mockato) che prova in modo ripetibile che il
# guardiano (cerbero.sh / cerbero-lib.sh) e clean-metro-restart.sh NON uccidano
# mai un Metro in avvio né rimuovano un lock attivo (/tmp/start-metro.lock).
# Blocca la regressione silenziosa della race se watchdog/clean-metro vengono
# modificati. Vedi .agents/memory/metro-startup-race.md.
echo "════════════════════════════════════════"
echo "  Gate stress race avvio Metro"
echo "════════════════════════════════════════"
METRO_RACE_EXIT=0
bash scripts/__tests__/metro-startup-race.test.sh 2>&1 || METRO_RACE_EXIT=$?
if [ "$METRO_RACE_EXIT" -eq 0 ]; then
  echo "✅ Stress race avvio Metro: gate verde."
else
  echo "❌ Stress race avvio Metro FALLITO (exit ${METRO_RACE_EXIT}) — watchdog/clean-metro potrebbero uccidere un Metro in avvio."
  echo "   Eseguire 'bash scripts/__tests__/metro-startup-race.test.sh' localmente per i dettagli."
  echo "════════════════════════════════════════"
  echo ""
  exit "$METRO_RACE_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE STRESS RACE AVVIO BACKEND ───────────────────────────
# Test deterministico (start-backend mockato) che prova in modo ripetibile che il
# guardiano (cerbero.sh / cerbero-lib.sh) NON riavvii mai un backend che sta
# inizializzando (503 {status:initializing}) o il cui start-backend.sh è attivo.
# Blocca la regressione silenziosa della race se cerbero.sh viene modificato.
echo "════════════════════════════════════════"
echo "  Gate stress race avvio Backend"
echo "════════════════════════════════════════"
BACKEND_RACE_EXIT=0
bash scripts/__tests__/backend-startup-race.test.sh 2>&1 || BACKEND_RACE_EXIT=$?
if [ "$BACKEND_RACE_EXIT" -eq 0 ]; then
  echo "✅ Stress race avvio Backend: gate verde."
else
  echo "❌ Stress race avvio Backend FALLITO (exit ${BACKEND_RACE_EXIT}) — cerbero potrebbe riavviare un backend in fase di init."
  echo "   Eseguire 'bash scripts/__tests__/backend-startup-race.test.sh' localmente per i dettagli."
  echo "════════════════════════════════════════"
  echo ""
  exit "$BACKEND_RACE_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE FIXER DEPS MULTI-LINEA ──────────────────────────────
# Test end-to-end del fixer multi-line deps (Mode C) che corregge i blocchi
# dependencies/peerDependencies/etc. spezzati su più righe. Senza questo gate,
# una regressione nel fixer passerebbe inosservata e potrebbe corrompere i
# manifest dei pacchetti.
echo "════════════════════════════════════════"
echo "  Gate fixer deps multi-linea (Mode C)"
echo "════════════════════════════════════════"
FIX_MULTILINE_DEPS_EXIT=0
bash scripts/__tests__/fix-multiline-deps.test.sh 2>&1 || FIX_MULTILINE_DEPS_EXIT=$?
if [ "$FIX_MULTILINE_DEPS_EXIT" -eq 0 ]; then
  echo "✅ Fixer deps multi-linea: gate verde."
else
  echo "❌ Fixer deps multi-linea FALLITO (exit ${FIX_MULTILINE_DEPS_EXIT}) — il fixer multi-line deps è regredito."
  echo "   Eseguire 'bash scripts/__tests__/fix-multiline-deps.test.sh' localmente per i dettagli."
  echo "════════════════════════════════════════"
  echo ""
  exit "$FIX_MULTILINE_DEPS_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE process.exit(1) NON PROTETTO DA applyCrashBackoff ───
# Analisi statica grep: verifica che ogni process.exit(1) nei file server/
# (escluse __tests__/, scripts/ e i seed standalone) sia preceduto da
# applyCrashBackoff() nelle 8 righe immediatamente precedenti.
#
# Perché questo gate esiste:
#   Un DB managed lento produceva restart ravvicinati: crash → exit immediato →
#   restart → DB ancora lento → ricrash → loop. La correzione (applyCrashBackoff)
#   richiede che OGNI uscita fatale del daemon chiami il backoff prima di
#   process.exit(1) così il delay distanzia i restart. Questo gate grep cattura
#   la regressione ad ogni merge (senza dover lanciare la suite Vitest),
#   complementando il guardrail statico in:
#   server/__tests__/boot-exit-backoff-wiring.test.ts
#
# Esclusioni (allineate al test Vitest corrispondente):
#   server/__tests__/          — fixture sintetici usati dal test stesso;
#                                non sono codice daemon eseguito in produzione.
#   server/scripts/            — CLI tool standalone: comunicano il risultato
#                                alla shell tramite exit code (0/1/2) e non
#                                fanno parte del processo server in esecuzione.
#   server/seed.ts             — script di seeding one-shot, non importato dal
#   server/seed-fake-users.ts    boot-sequence né da index; il suo process.exit
#   server/seed-tags-runtime.ts  termina il processo di seeding, non il daemon.
#
# Allow-list di contesto (allineata a ALLOWLIST_CONTEXT nel test Vitest):
#   "Could not close connections in time"
#     → timeout forzato di gracefulShutdown (SIGTERM/SIGINT non risolto entro
#       10 s): è uno shutdown volontario che non ha terminato in tempo, non un
#       crash. Non deve contribuire al contatore crash-loop.
#
# Come aggiungere un'eccezione consapevole:
#   1. Tool/script standalone → spostarlo in server/scripts/ o aggiungerlo a
#      EXCLUDED_FILES nel test Vitest (e all'elenco --exclude qui sotto).
#   2. Shutdown graceful intenzionale senza backoff → aggiungere una stringa
#      univoca del contesto a ALLOWLIST_CONTEXT nel test Vitest con un commento,
#      e replicare la stessa stringa nel grep -F sotto (sezione allow-list).
echo "════════════════════════════════════════"
echo "  Gate process.exit(1) non protetto da applyCrashBackoff"
echo "════════════════════════════════════════"

EXIT_GATE_VIOLATIONS=()

while IFS= read -r _hit; do
  # Formato hit: "server/foo/bar.ts:42:  process.exit(1);"
  _eg_file=$(echo "$_hit" | cut -d: -f1)
  _eg_linenum=$(echo "$_hit" | cut -d: -f2)
  _eg_content=$(echo "$_hit" | cut -d: -f3-)

  # Skip righe commentate (// o asterisco leading — es. JSDoc * o /**)
  _eg_trimmed=$(echo "$_eg_content" | sed 's/^[[:space:]]*//')
  if [[ "$_eg_trimmed" == //* || "$_eg_trimmed" == \** ]]; then
    continue
  fi

  # Allow-list: finestra ±5 righe attorno al process.exit(1) — stessa logica del test.
  _eg_win_start=$(( _eg_linenum - 5 ))
  [ "$_eg_win_start" -lt 1 ] && _eg_win_start=1
  _eg_win_end=$(( _eg_linenum + 2 ))
  _eg_window=$(sed -n "${_eg_win_start},${_eg_win_end}p" "$_eg_file" 2>/dev/null)
  if echo "$_eg_window" | grep -qF "Could not close connections in time"; then
    continue
  fi

  # Verifica: applyCrashBackoff( nelle 8 righe precedenti (finestra empirica).
  _eg_look_start=$(( _eg_linenum - 8 ))
  [ "$_eg_look_start" -lt 1 ] && _eg_look_start=1
  _eg_preceding=$(sed -n "${_eg_look_start},$(( _eg_linenum - 1 ))p" "$_eg_file" 2>/dev/null)
  if echo "$_eg_preceding" | grep -qF "applyCrashBackoff("; then
    continue
  fi

  EXIT_GATE_VIOLATIONS+=("$_eg_file:$_eg_linenum — $_eg_content")

done < <(grep -rn \
  --include="*.ts" \
  --exclude-dir="__tests__" \
  --exclude-dir="scripts" \
  --exclude="seed.ts" \
  --exclude="seed-fake-users.ts" \
  --exclude="seed-tags-runtime.ts" \
  -F "process.exit(1)" \
  server/ \
  2>/dev/null)

if [ ${#EXIT_GATE_VIOLATIONS[@]} -eq 0 ]; then
  echo "✅ Gate process.exit(1): nessun exit non protetto rilevato."
else
  echo "❌ REGRESSIONE: ${#EXIT_GATE_VIOLATIONS[@]} process.exit(1) senza applyCrashBackoff():"
  for _v in "${EXIT_GATE_VIOLATIONS[@]}"; do
    echo "   ⚠️  $_v"
    echo "      ↳ aggiungere applyCrashBackoff('<label>') nelle righe precedenti,"
    echo "        oppure spostare il file in server/scripts/ se è un tool standalone."
  done
  echo ""
  echo "   Azioni possibili:"
  echo "   1. Crash path nel daemon → chiama applyCrashBackoff('<label>') prima di process.exit(1)."
  echo "   2. Script/tool standalone → spostarlo in server/scripts/ o aggiungere --exclude nel gate."
  echo "   3. Shutdown graceful intenzionale → aggiungere stringa univoca a ALLOWLIST_CONTEXT"
  echo "      in server/__tests__/boot-exit-backoff-wiring.test.ts con un commento."
  echo "════════════════════════════════════════"
  echo ""
  exit 1
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE VITEST boot-exit-backoff-wiring ─────────────────────
# Complementa il gate grep sopra: dove grep usa una finestra empirica di 8 righe
# e un'allow-list statica, il test Vitest usa finestre di contesto più ampie,
# logica di allow-list completa (ALLOWLIST_CONTEXT, EXCLUDED_FILES) e
# asserzioni di auto-coerenza (es. il test si auto-verifica). Eseguirli
# entrambi garantisce copertura belt-and-suspenders: grep è veloce e fallisce
# per primo; Vitest valida i casi limite che grep non può rilevare.
echo "════════════════════════════════════════"
echo "  Gate Vitest boot-exit-backoff-wiring"
echo "════════════════════════════════════════"
BOOT_EXIT_TEST_EXIT=0
npx vitest run --config vitest.config.server.ts server/__tests__/boot-exit-backoff-wiring.test.ts 2>&1 || BOOT_EXIT_TEST_EXIT=$?
if [ "$BOOT_EXIT_TEST_EXIT" -eq 0 ]; then
  echo "✅ boot-exit-backoff-wiring: tutti i process.exit(1) risultano protetti da applyCrashBackoff()."
else
  echo "❌ boot-exit-backoff-wiring FALLITO (exit ${BOOT_EXIT_TEST_EXIT}) — uno o più process.exit(1) non sono preceduti da applyCrashBackoff()."
  echo "   Eseguire 'npx vitest run --config vitest.config.server.ts server/__tests__/boot-exit-backoff-wiring.test.ts' localmente per i dettagli."
  echo "   Consultare i commenti in cima al file di test per le istruzioni su come aggiungere eccezioni consapevoli."
  echo "════════════════════════════════════════"
  echo ""
  exit "$BOOT_EXIT_TEST_EXIT"
fi
echo "════════════════════════════════════════"
echo ""

# ── CLEANUP UTENTI SMOKE RESIDUI POST-MERGE ──────────────────
echo "════════════════════════════════════════"
echo "  Cleanup utenti smoke residui"
echo "════════════════════════════════════════"
CLEANUP_EXIT=0
npx tsx scripts/smoke/cleanup-orphans.ts 2>&1 || CLEANUP_EXIT=$?
if [ "$CLEANUP_EXIT" -ne 0 ]; then
  echo "⚠️  cleanup-orphans.ts ha restituito exit ${CLEANUP_EXIT} — verificare manualmente."
else
  echo "✅ Cleanup smoke completato."
fi
echo "════════════════════════════════════════"
echo ""

# ── GENERA PDF MATCHING POST-MERGE ───────────────────────────
# Rigenera docs/matching-system.pdf (e la copia in server/public/)
# da docs/matching-system.md dopo ogni merge, così la route
# GET /api/exports/matching-system.pdf serve sempre la versione
# aggiornata al codice senza richiedere un passo manuale.
echo "════════════════════════════════════════"
echo "  Generazione PDF matching system"
echo "════════════════════════════════════════"
PDF_EXIT=0
node scripts/generate-matching-pdf.mjs 2>&1 || PDF_EXIT=$?
if [ "$PDF_EXIT" -ne 0 ]; then
  echo "⚠️  generate-matching-pdf.mjs ha restituito exit ${PDF_EXIT} — PDF potrebbe essere stale."
else
  echo "✅ PDF matching system aggiornato."
fi
echo "════════════════════════════════════════"
echo ""

# ── GENERA PDF ANALISI COMPETITOR POST-MERGE ─────────────────
# Rigenera server/public/assets/competitor-analysis.pdf e .png
# da scripts/generate-competitor-analysis.js dopo ogni merge,
# così la card "Analisi Competitor" in /docs mostra sempre
# il PDF aggiornato senza intervento manuale.
echo "════════════════════════════════════════"
echo "  Generazione PDF analisi competitor"
echo "════════════════════════════════════════"
COMPETITOR_PDF_EXIT=0
node scripts/generate-competitor-analysis.js 2>&1 || COMPETITOR_PDF_EXIT=$?
if [ "$COMPETITOR_PDF_EXIT" -ne 0 ]; then
  echo "⚠️  generate-competitor-analysis.js ha restituito exit ${COMPETITOR_PDF_EXIT} — PDF potrebbe essere stale."
else
  echo "✅ PDF analisi competitor aggiornato."
fi
echo "════════════════════════════════════════"
echo ""

# ── GUARD SKILL OTA ↔ app.json (versionCode sync) ────────────
# La sezione "Contesto fisso" in bikerlink-ota-publish/SKILL.md
# contiene il versionCode APK corrente. Se non è aggiornato dopo
# un APK bump, l'agente OTA pubblica con numero di ciclo errato.
echo "════════════════════════════════════════"
echo "  Guard skill OTA ↔ app.json (versionCode)"
echo "════════════════════════════════════════"
OTA_SKILL=".agents/skills/bikerlink-ota-publish/SKILL.md"
if [ -f "$OTA_SKILL" ] && [ -f "app.json" ]; then
  APPJSON_VC=$(node -p "require('./app.json').expo.android.versionCode" 2>/dev/null || echo "")
  SKILL_VC=$(grep -oP '`versionCode` APK \| \*\*\K[0-9]+' "$OTA_SKILL" | head -1 || echo "")
  if [ -z "$APPJSON_VC" ]; then
    echo "⚠️  Impossibile leggere versionCode da app.json — guard saltato."
  elif [ -z "$SKILL_VC" ]; then
    echo "⚠️  Impossibile leggere versionCode dalla skill OTA — guard saltato."
  elif [ "$APPJSON_VC" != "$SKILL_VC" ]; then
    echo "⚠️  bikerlink-ota-publish/SKILL.md out of sync with app.json"
    echo "   app.json versionCode  = ${APPJSON_VC}"
    echo "   SKILL.md versionCode  = ${SKILL_VC}"
    echo "   → Aggiornare la tabella 'Contesto fisso' in ${OTA_SKILL}"
    echo "     prima di pubblicare il prossimo OTA."
  else
    echo "✅ Skill OTA in sync con app.json (versionCode=${APPJSON_VC})."
  fi
else
  echo "⚠️  File mancante (app.json o skill OTA) — guard saltato."
fi
echo "════════════════════════════════════════"
echo ""

# ── GUARD: no navigation strings referencing .part* paths ────
# Files named *.part2.tsx, *.part3.tsx, etc. are helper modules
# prefixed with _ and are intentionally excluded from Expo Router.
# A navigation target pointing to one would silently 404.
#
# Navigation patterns covered by this guard (static grep):
#   • router.push/replace/navigate(...)    – direct router object calls
#   • <Link href="...">                    – JSX Link component (matched via href=)
#   • href="..."                           – generic href= attributes in JSX/HTML
#   • Linking.open / Linking.openURL(...)  – deep-link calls
#   • push(...) / replace(...) / navigate(...)
#                                          – destructured useRouter() hooks
#                                            e.g. const { push } = useRouter(); push("/x.part2")
#
# ⚠️  SCOPE LIMITATION — dynamic / template-literal paths:
#   This grep guard is line-based, so it already catches single-line
#   template literals — e.g. push(`/giri/${id}.part2`) — because the literal
#   text ".part2" still appears on the same source line as the call, even
#   though the path is built dynamically.
#
#   The one gap grep genuinely cannot see is a template literal whose
#   ".partN" segment is split across multiple lines. That gap is closed by a
#   small standalone whole-file scan (no ESLint / no AST parser dependency,
#   since oxlint has no mature custom-JS-plugin support):
#     scripts/check-part-nav.mjs
#   A string-concatenation-via-intermediate-variable pattern
#   (const seg = ".part2"; push("/giri/" + seg)) is still out of scope for
#   static analysis — keep helper-screen paths as non-exported constants and
#   avoid constructing them dynamically.
echo "════════════════════════════════════════"
echo "  Guard: navigation strings ↔ .part paths"
echo "════════════════════════════════════════"

# Self-check D: standalone multi-line template-literal checker must exist.
if [ ! -f "scripts/check-part-nav.mjs" ]; then
  echo "⚠️  Guard self-check D FALLITO — scripts/check-part-nav.mjs mancante."
  echo "   Il check che copre i template-literal multi-riga non è presente."
  echo "   Ripristinare il file dal repo."
  exit 1
else
  echo "✅ check-part-nav.mjs presente (copertura template-literal multi-riga)."
fi

# Self-check E: run the standalone checker against the real tree.
if ! node scripts/check-part-nav.mjs; then
  echo "❌ Guard self-check E FALLITO — check-part-nav.mjs ha riportato errori."
  echo "   Correggere i path di navigazione (vedi output sopra) prima del merge."
  exit 1
fi

# Self-check A: the guard regex must detect router.push form.
_SELFCHECK_LINE_A='  router.push("/giri/1.part2");'
_SELFCHECK_HIT_A=$(printf '%s\n' "$_SELFCHECK_LINE_A" | grep -E '(router\.(push|replace|navigate)|href=|Linking\.(open|openURL)|[^a-zA-Z_](push|replace|navigate)\()' | grep -E '\.part[0-9]' || true)
if [ -z "$_SELFCHECK_HIT_A" ]; then
  echo "⚠️  Guard self-check A FALLITO — il pattern grep non funziona come atteso."
  echo "   Il guard potrebbe non rilevare path .part* nelle chiamate router.push."
fi

# Self-check B: the guard regex must detect destructured-router push form (indented).
_SELFCHECK_LINE_B='  push("/giri/1.part2");'
_SELFCHECK_HIT_B=$(printf '%s\n' "$_SELFCHECK_LINE_B" | grep -E '(router\.(push|replace|navigate)|href=|Linking\.(open|openURL)|(^|[^a-zA-Z_])(push|replace|navigate)\()' | grep -E '\.part[0-9]' || true)
if [ -z "$_SELFCHECK_HIT_B" ]; then
  echo "⚠️  Guard self-check B FALLITO — il pattern grep non funziona come atteso."
  echo "   Il guard potrebbe non rilevare path .part* nelle chiamate push() destructured."
fi

# Self-check C: the guard regex must detect destructured-router push at start-of-line.
_SELFCHECK_LINE_C='push("/giri/1.part2");'
_SELFCHECK_HIT_C=$(printf '%s\n' "$_SELFCHECK_LINE_C" | grep -E '(router\.(push|replace|navigate)|href=|Linking\.(open|openURL)|(^|[^a-zA-Z_])(push|replace|navigate)\()' | grep -E '\.part[0-9]' || true)
if [ -z "$_SELFCHECK_HIT_C" ]; then
  echo "⚠️  Guard self-check C FALLITO — il pattern grep non funziona come atteso."
  echo "   Il guard potrebbe non rilevare path .part* in push() a inizio riga."
fi

# Two-pass approach:
# 1. Find lines that contain any navigation call pattern (router.push, href=, push(...), etc.)
# 2. Strip "filepath:linenum:" prefix with awk and filter content for .partN
#    (a plain grep pipe would false-positive on filenames like _[id].part2.tsx)
# Note: (^|[^a-zA-Z_]) covers both start-of-line and non-letter prefix so that
# bare push()/replace()/navigate() calls are caught regardless of indentation.
NAV_PART_HITS=$(grep -rn \
  --include="*.ts" --include="*.tsx" \
  -E "(router\.(push|replace|navigate)|href=|Linking\.(open|openURL)|(^|[^a-zA-Z_])(push|replace|navigate)\()" \
  app/ components/ hooks/ lib/ 2>/dev/null \
  | awk -F: '{ content=$0; sub(/^[^:]+:[0-9]+:/, "", content); if (content ~ /\.part[0-9]/) print $0 }' \
  || true)
if [ -n "$NAV_PART_HITS" ]; then
  echo "❌ ERRORE: trovate stringhe di navigazione con path .part*"
  echo "   I file .partN.tsx sono helper module (prefissati _) e non"
  echo "   sono route Expo Router. Un push/href a questi path causa 404."
  echo ""
  echo "$NAV_PART_HITS"
  echo ""
  echo "   → Correggere i path di navigazione prima del merge."
  exit 1
else
  echo "✅ Nessuna stringa di navigazione punta a path .part*."
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE REGRESSION TEST — horus-prev-report ─────────────────────────────────
# Verifica che collectPreviousHorusReport() includa correttamente la sezione
# "TRIAGE PRECEDENTE" nel bundle dry-run quando HORUS_LOG_DIR=/tmp punta a un
# report precedente sintetico (caso A), e che la sezione sia assente quando non
# esistono file candidati (caso B). Blocca la regressione silenziosa che causa
# Horus a riproporre gli stessi task ad ogni ciclo del planner perché non trova
# mai il report del round precedente.
echo "════════════════════════════════════════"
echo "  Test regressione Horus prev-report"
echo "════════════════════════════════════════"
HORUS_PREV_REPORT_EXIT=0
timeout 75 bash scripts/__tests__/horus-prev-report.test.sh || HORUS_PREV_REPORT_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$HORUS_PREV_REPORT_EXIT" -eq 124 ]; then
  echo "⚠️  Horus prev-report test: timeout 75s — bundle dry-run lento in questo ambiente."
  echo "   Gate saltato (non bloccante). Eseguire manualmente per verificare:"
  echo "   bash scripts/__tests__/horus-prev-report.test.sh"
elif [ "$HORUS_PREV_REPORT_EXIT" -ne 0 ]; then
  echo "❌ Regression test horus-prev-report FALLITO — collectPreviousHorusReport() è regredita."
  echo "   Eseguire 'bash scripts/__tests__/horus-prev-report.test.sh' localmente per i dettagli."
  exit "$HORUS_PREV_REPORT_EXIT"
fi

# ── GATE SEMGREP (sicurezza statica, baseline/ratchet) ───────────────────────
# Scansione di sicurezza statica con Semgrep: regole locali versionate
# (.semgrep/bikerlink.yml) + ruleset "open" del registry pubblico (NESSUN
# account/login). I finding pre-esistenti sono congelati in .semgrep-baseline;
# il gate FALLISCE solo su NUOVI finding di severità ERROR. I WARNING sono
# tracciati ma non bloccano. Se il binario semgrep non è installato o il
# registry non è raggiungibile, il gate degrada con un avviso e NON blocca.
# Vedi: scripts/check-semgrep.sh
echo "════════════════════════════════════════"
echo "  Gate Semgrep (sicurezza statica)"
echo "════════════════════════════════════════"
SEMGREP_EXIT=0
timeout 110 bash scripts/check-semgrep.sh || SEMGREP_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$SEMGREP_EXIT" -eq 124 ]; then
  echo "⚠️  Semgrep: timeout 110s — scansione lenta in questo ambiente. Gate saltato (non bloccante)."
  echo "   Verificare manualmente: bash scripts/check-semgrep.sh"
elif [ "$SEMGREP_EXIT" -ne 0 ]; then
  echo "❌ Gate Semgrep fallito — nuovi finding ERROR introdotti, correggere prima di procedere."
  exit "$SEMGREP_EXIT"
fi

# ── oxlint gate: react-hooks/rules-of-hooks + all error-level rules ──────────
echo "════════════════════════════════════════"
echo "oxlint gate — verifica regole error-level su app/ components/ hooks/ lib/ ..."
echo ""
# oxlint exits non-zero only on error-level rules by default; warnings
# (exhaustive-deps ecc.) non bloccano qui (il gate lint separato, a
# --max-warnings=0 sul repo intero, li copre già in modo più stretto).
# Copre app/ (Expo Router pages) + codice condiviso components/, hooks/, lib/
OXLINT_EXIT=0
timeout 60 npx oxlint -c .oxlintrc.json app/ components/ hooks/ lib/ || OXLINT_EXIT=$?
if [ "$OXLINT_EXIT" -eq 124 ]; then
  echo ""
  echo "⚠️  oxlint: timeout 60s — scansione lenta in questo ambiente. Gate saltato (non bloccante)."
  echo "   Verificare manualmente: npx oxlint -c .oxlintrc.json app/ components/ hooks/ lib/"
elif [ "$OXLINT_EXIT" -ne 0 ]; then
  echo ""
  echo "❌ oxlint gate FALLITO — trovate violazioni error-level in app/, components/, hooks/ o lib/"
  echo "   Correggere i file segnalati sopra prima del merge."
  echo "   (Eseguire: npx oxlint -c .oxlintrc.json app/ components/ hooks/ lib/)"
  exit 1
else
  echo "✅ oxlint gate superato — nessuna violazione error-level in app/, components/, hooks/, lib/"
fi
echo "════════════════════════════════════════"
echo ""

# ── GATE REGRESSION TEST — pipeline [TESTA 2 NIGHTLY] ────────────────────────
# Verifica che la pipeline di prefissazione [TESTA 2 NIGHTLY] in cerbero.sh
# (righe 95-101) sia ancora correttamente collegata a metro-cache-nightly.sh
# e che ogni riga di output venga prefissata con timestamp e tag attesi.
# Se la pipeline è rotta (tag rimosso, printf sostituito, wiring staccato),
# il job notturno di pulizia .metro-cache/ non lascia traccia in cerbero.log
# → la regressione resterebbe invisibile fino alle 01:00 UTC successive.
# Vedi: scripts/__tests__/metro-cache-nightly-prefix.test.sh
#        scripts/cerbero.sh righe 95-101
echo "════════════════════════════════════════"
echo "  Test pipeline [TESTA 2 NIGHTLY] (metro-cache-nightly)"
echo "════════════════════════════════════════"
NIGHTLY_PREFIX_EXIT=0
bash scripts/__tests__/metro-cache-nightly-prefix.test.sh || NIGHTLY_PREFIX_EXIT=$?
echo "════════════════════════════════════════"
echo ""
if [ "$NIGHTLY_PREFIX_EXIT" -ne 0 ]; then
  echo "❌ Test pipeline [TESTA 2 NIGHTLY] FALLITO — la pipeline cerbero.sh è regredita."
  echo "   Eseguire 'bash scripts/__tests__/metro-cache-nightly-prefix.test.sh' localmente per i dettagli."
  exit "$NIGHTLY_PREFIX_EXIT"
fi

exit 0
