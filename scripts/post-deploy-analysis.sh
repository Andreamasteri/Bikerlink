#!/usr/bin/env bash
# BikerLink — Analisi post-deploy automatica
#
# Questo script implementa la procedura analisi-deploy-horus in modo non interattivo.
# Viene avviato da server/boot-sequence.ts (runPostReady) quando rileva un nuovo
# deploy in produzione (server_dist/.deploy-stamp presente, .deploy-stamp.analyzed assente).
#
# Può anche essere lanciato manualmente:
#   bash scripts/post-deploy-analysis.sh
#   FORCE_RERUN=1 bash scripts/post-deploy-analysis.sh   # ignora il marker "già analizzato"
#
# Output:
#   logs/deploy-analysis-<timestamp>.md    — report completo
#   logs/horus-tasks-pending.json          — task pronti per la proposta formale
#   .local/tasks/deploy-fix-<slug>.md      — file plan per ogni task proposto
#
# Se TC è offline: raccoglie solo i dati locali e scrive il report parziale.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
LOGS_DIR="$ROOT/logs"
TASKS_DIR="$ROOT/.local/tasks"
STAMP_FILE="$ROOT/server_dist/.deploy-stamp"
ANALYZED_MARKER="$ROOT/server_dist/.deploy-stamp.analyzed"
TIMING_FILE="$ROOT/server_dist/.deploy-timing.json"

mkdir -p "$LOGS_DIR" "$TASKS_DIR"

TIMESTAMP=$(date -u +%Y-%m-%dT%H-%M-%S-%3NZ)
REPORT_FILE="$LOGS_DIR/deploy-analysis-${TIMESTAMP}.md"
PENDING_TASKS_FILE="$LOGS_DIR/horus-tasks-pending.json"
LOG_PREFIX="[post-deploy-analysis]"

log() { echo "$LOG_PREFIX $(date -u '+%H:%M:%SZ') $*"; }
log_to_report() { echo "$*" >> "$REPORT_FILE"; }

# ── Verifica stamp (salvo override FORCE_RERUN=1) ────────────────────────────
if [ "${FORCE_RERUN:-0}" != "1" ]; then
  if [ ! -f "$STAMP_FILE" ]; then
    log "⚠️  $STAMP_FILE non trovato — script non avviato da un deploy recente. Usa FORCE_RERUN=1 per forzare."
    exit 0
  fi
  if [ -f "$ANALYZED_MARKER" ]; then
    log "ℹ️  Deploy già analizzato (marker: $ANALYZED_MARKER). Usa FORCE_RERUN=1 per ri-eseguire."
    exit 0
  fi
fi

# Usa un marker "in progress" per evitare doppie esecuzioni simultanee.
# Il marker finale (.analyzed) viene scritto SOLO al termine con successo;
# se lo script crashasse a metà, il prossimo boot troverà solo .analyzing
# (non .analyzed) e potrà ri-eseguire l'analisi.
ANALYZING_MARKER="$ROOT/server_dist/.deploy-stamp.analyzing"
if [ -f "$ANALYZING_MARKER" ] && [ "${FORCE_RERUN:-0}" != "1" ]; then
  log "ℹ️  Analisi già in corso (marker: $ANALYZING_MARKER). Usa FORCE_RERUN=1 per forzare."
  exit 0
fi
touch "$ANALYZING_MARKER"
# Cleanup marker in-progress all'uscita (successo o errore)
trap 'rm -f "$ANALYZING_MARKER"' EXIT

DEPLOY_EPOCH=$(cat "$STAMP_FILE" 2>/dev/null || echo "0")
DEPLOY_ISO=$(date -u -d "@$DEPLOY_EPOCH" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null \
  || python3 -c "import datetime; print(datetime.datetime.utcfromtimestamp($DEPLOY_EPOCH).strftime('%Y-%m-%dT%H:%M:%SZ'))" 2>/dev/null \
  || echo "sconosciuto")

log "════ Analisi post-deploy BikerLink ════"
log "Deploy del: $DEPLOY_ISO"
log "Report: $REPORT_FILE"

# ── Inizia il report ─────────────────────────────────────────────────────────
{
  echo "# Analisi Post-Deploy BikerLink"
  echo ""
  echo "**Deploy**: $DEPLOY_ISO"
  echo "**Analisi avviata**: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo ""
  echo "---"
} > "$REPORT_FILE"

# ── STEP 1 — Raccolta dati locali ────────────────────────────────────────────
log "STEP 1 — Raccolta dimensioni directory (Repl layer)"
{
  echo "## STEP 1 — Dimensioni directory Repl layer"
  echo ""
  echo "Misurate all'avvio del container (dopo le pulizie di Fase 2):"
  echo ""
} >> "$REPORT_FILE"

TOTAL_SIZE=$(du -sh "$ROOT" 2>/dev/null | cut -f1 || echo "N/D")
for dir in \
  ".local/state/replit" \
  "exports" \
  ".git" \
  "dist" \
  "dist-ota-env" \
  "logs" \
  ".local/backups" \
  "attached_assets" \
  "server_dist" \
  "uploads"; do
  full_path="$ROOT/$dir"
  if [ -e "$full_path" ]; then
    sz=$(du -sh "$full_path" 2>/dev/null | cut -f1)
    log "  $dir: $sz"
    echo "- \`$dir\`: $sz" >> "$REPORT_FILE"
  else
    log "  $dir: (assente)"
    echo "- \`$dir\`: (assente)" >> "$REPORT_FILE"
  fi
done
log "  TOTALE workspace: $TOTAL_SIZE"
{
  echo "- **TOTALE workspace**: $TOTAL_SIZE"
  echo ""
} >> "$REPORT_FILE"

# ── STEP 2 — Timing Fase 2 da deploy-timing.json ────────────────────────────
log "STEP 2 — Timing Fase 2 (da $TIMING_FILE)"
{
  echo "## STEP 2 — Timing Fase 2 (deploy-build.sh)"
  echo ""
} >> "$REPORT_FILE"

if [ -f "$TIMING_FILE" ]; then
  TOTAL_DEPLOY_SECS=$(python3 -c "import json,sys; d=json.load(open('$TIMING_FILE')); print(d.get('totalSecs','N/D'))" 2>/dev/null || echo "N/D")
  SLOW_STEPS=$(python3 -c "
import json,sys
d=json.load(open('$TIMING_FILE'))
slow=d.get('slowSteps',[])
print('\n'.join(slow) if slow else 'Nessuno')
" 2>/dev/null || echo "N/D")
  WS_SIZE=$(python3 -c "import json; d=json.load(open('$TIMING_FILE')); print(d.get('workspaceSizeAfterBuild','N/D'))" 2>/dev/null || echo "N/D")
  log "  Durata totale Fase 2: ${TOTAL_DEPLOY_SECS}s"
  log "  Step lenti: $SLOW_STEPS"
  log "  Workspace dopo build: $WS_SIZE"
  {
    echo "- Durata totale Fase 2: **${TOTAL_DEPLOY_SECS}s**"
    echo "- Workspace finale inviato al Repl layer: **$WS_SIZE**"
    echo "- Step lenti (soglia 120s): $SLOW_STEPS"
    echo ""
  } >> "$REPORT_FILE"
else
  log "  $TIMING_FILE non trovato — timing Fase 2 non disponibile"
  {
    echo "- Timing Fase 2 non disponibile (\`server_dist/.deploy-timing.json\` assente)."
    echo ""
  } >> "$REPORT_FILE"
  TOTAL_DEPLOY_SECS="N/D"
  SLOW_STEPS="N/D"
  WS_SIZE="$TOTAL_SIZE"
fi

# ── Verifica TC online ───────────────────────────────────────────────────────
log "Verifica ThinkCentre online..."
TC_ONLINE=0
if [ -n "${HORUS_OLLAMA_URL:-}" ]; then
  TC_CHECK=$(curl -s --max-time 10 \
    ${CF_ACCESS_CLIENT_ID:+-H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID"} \
    ${CF_ACCESS_CLIENT_SECRET:+-H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET"} \
    ${HORUS_OLLAMA_TOKEN:+-H "Authorization: Bearer $HORUS_OLLAMA_TOKEN"} \
    "$HORUS_OLLAMA_URL/api/tags" 2>/dev/null || echo "")
  if echo "$TC_CHECK" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok')" 2>/dev/null | grep -q "ok"; then
    TC_ONLINE=1
    log "  ✅ ThinkCentre online"
  else
    log "  ⚠️  ThinkCentre offline o irraggiungibile — analisi Horus saltata"
  fi
else
  log "  ⚠️  HORUS_OLLAMA_URL non impostata — analisi Horus saltata"
fi

# ── STEP 3 — Horus boot analysis (solo se TC online) ─────────────────────────
HORUS_ANOMALIES=""
HORUS_TASKS_RAW=""

if [ "$TC_ONLINE" -eq 1 ]; then
  log "STEP 3 — Analisi Horus area boot (può richiedere 5-10 minuti)..."
  {
    echo "## STEP 3 — Analisi Horus (area: boot)"
    echo ""
  } >> "$REPORT_FILE"

  # Bundle per Horus: misure locali + timing
  BUNDLE="Deploy BikerLink del $DEPLOY_ISO.

DIMENSIONI DIRECTORY (nel container dopo il deploy):
$(for dir in ".local/state/replit" "exports" ".git" "dist" "dist-ota-env" "logs" ".local/backups" "attached_assets"; do
  full_path="$ROOT/$dir"
  if [ -e "$full_path" ]; then
    sz=$(du -sh "$full_path" 2>/dev/null | cut -f1)
    echo "  $dir: $sz"
  else
    echo "  $dir: (assente)"
  fi
done)
  TOTALE workspace: $TOTAL_SIZE

FASE 2 TIMING:
  Durata totale: ${TOTAL_DEPLOY_SECS}s
  Workspace finale Repl layer: $WS_SIZE
  Step lenti: $SLOW_STEPS

Analizza queste misure rispetto alle soglie di allerta (layer>1.5GB, step singolo>120s).
Per ogni anomalia trovata, proponi un task correttivo con il formato ESATTO:
TASK: <titolo breve in italiano (max 10 parole)>
PRIORITA: alta|media|bassa
PROBLEMA: <evidenza concreta>
AZIONE: <cosa modificare e in quale file>

Se non ci sono anomalie, scrivi solo: TUTTO_OK"

  HORUS_MODEL="${HORUS_OLLAMA_MODEL:-qwen3:4b}"
  PROMPT_JSON=$(python3 -c "import sys,json; print(json.dumps(sys.argv[1]))" "$BUNDLE" 2>/dev/null \
    || echo '"analisi deploy"')

  HORUS_RESPONSE=$(curl -s --no-buffer --max-time 300 \
    ${CF_ACCESS_CLIENT_ID:+-H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID"} \
    ${CF_ACCESS_CLIENT_SECRET:+-H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET"} \
    ${HORUS_OLLAMA_TOKEN:+-H "Authorization: Bearer $HORUS_OLLAMA_TOKEN"} \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"$HORUS_MODEL\",
      \"stream\": true,
      \"think\": false,
      \"options\": {\"num_predict\": 800},
      \"messages\": [{\"role\": \"user\", \"content\": $PROMPT_JSON}]
    }" \
    "$HORUS_OLLAMA_URL/api/chat" 2>/dev/null \
  | python3 -c "
import sys, json, re
chunks = []
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        d = json.loads(line)
        chunk = d.get('message', {}).get('content', '') or ''
        if chunk:
            chunks.append(chunk)
    except Exception:
        pass
text = ''.join(chunks)
text = re.sub(r'<think>[\s\S]*?</think>', '', text)
text = re.sub(r'^[\s\S]*?</think>\s*', '', text)
print(text.strip())
" 2>/dev/null || echo "")

  if [ -n "$HORUS_RESPONSE" ]; then
    log "  Risposta Horus ricevuta ($(echo "$HORUS_RESPONSE" | wc -c) bytes)"
    {
      echo "$HORUS_RESPONSE"
      echo ""
    } >> "$REPORT_FILE"
    HORUS_TASKS_RAW="$HORUS_RESPONSE"
  else
    log "  ⚠️  Nessuna risposta da Horus"
    {
      echo "Nessuna risposta da Horus (timeout o errore)."
      echo ""
    } >> "$REPORT_FILE"
  fi
else
  {
    echo "## STEP 3 — Analisi Horus"
    echo ""
    echo "ThinkCentre offline — analisi Horus saltata. Dati locali salvati per revisione manuale."
    echo ""
  } >> "$REPORT_FILE"
fi

# ── STEP 4 — Parsing task dalla risposta Horus ───────────────────────────────
TASKS_JSON="[]"
TASK_COUNT=0

if [ -n "$HORUS_TASKS_RAW" ] && ! echo "$HORUS_TASKS_RAW" | grep -q "^TUTTO_OK"; then
  log "STEP 4 — Parsing task da risposta Horus..."

  TASKS_JSON=$(python3 - "$HORUS_TASKS_RAW" "$DEPLOY_ISO" "$ROOT" "$TASKS_DIR" << 'PYEOF'
import sys, json, re, os
raw = sys.argv[1]
deploy_iso = sys.argv[2]
root = sys.argv[3]
tasks_dir = sys.argv[4]

# Parse blocchi TASK: / PRIORITA: / PROBLEMA: / AZIONE:
blocks = re.split(r'\n(?=TASK:)', raw)
results = []
for block in blocks:
    m_title    = re.search(r'^TASK:\s*(.+)', block, re.MULTILINE)
    m_priority = re.search(r'^PRIORITA:\s*(.+)', block, re.MULTILINE | re.IGNORECASE)
    m_problem  = re.search(r'^PROBLEMA:\s*(.+)', block, re.MULTILINE)
    m_action   = re.search(r'^AZIONE:\s*(.+)', block, re.MULTILINE)
    if not m_title:
        continue
    title    = m_title.group(1).strip()
    priority = (m_priority.group(1).strip().lower() if m_priority else "media")
    problem  = (m_problem.group(1).strip() if m_problem else "")
    action   = (m_action.group(1).strip() if m_action else "")

    # Genera slug
    slug = re.sub(r'[^a-z0-9-]', '', re.sub(r'\s+', '-', title.lower()))[:40]
    if not slug:
        slug = f"deploy-task-{len(results)+1}"

    # Scrivi file plan
    plan_path = os.path.join(tasks_dir, f"deploy-fix-{slug}.md")
    plan_content = f"""# {title}

## What & Why
Deploy BikerLink del {deploy_iso}. Anomalia rilevata dall'analisi Horus post-deploy.

**Evidenza**: {problem}

## Done looks like
- Il sintomo descritto in "Problema" non si ripresenta al deploy successivo.
- I log di Fase 3/4 mostrano timing nella norma.

## Out of scope
- Modifiche non correlate al sintomo sopra.

## Steps
1. {action}
2. Verificare nei log del deploy successivo che il sintomo sia risolto.

## Relevant files
- `scripts/deploy-build.sh` — build script Fase 2
- `server/boot-sequence.ts` — boot Fase 4
- `server/boot-phase3-db-init.ts` — DB init e migration runner
"""
    os.makedirs(tasks_dir, exist_ok=True)
    with open(plan_path, 'w') as f:
        f.write(plan_content)

    rel_path = os.path.relpath(plan_path, root)
    results.append({
        "title": title,
        "priority": priority,
        "problem": problem,
        "action": action,
        "slug": slug,
        "filePath": rel_path,
    })

print(json.dumps(results))
PYEOF
  )

  TASK_COUNT=$(python3 -c "import json,sys; print(len(json.loads(sys.argv[1])))" "$TASKS_JSON" 2>/dev/null || echo "0")
  log "  Task estratti: $TASK_COUNT"
fi

# ── STEP 5 — Scrivi horus-tasks-pending.json ────────────────────────────────
if [ "$TASK_COUNT" -gt 0 ]; then
  log "STEP 5 — Scrittura $PENDING_TASKS_FILE ($TASK_COUNT task)"
  python3 - "$TASKS_JSON" "$REPORT_FILE" "$ROOT" "$PENDING_TASKS_FILE" << 'PYEOF'
import json, sys, os
tasks_raw = json.loads(sys.argv[1])
report_path = sys.argv[2]
root = sys.argv[3]
out_path = sys.argv[4]

manifest = {
    "generatedAt": __import__('datetime').datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z'),
    "reportPath": os.path.relpath(report_path, root),
    "source": "post-deploy-analysis",
    "hasArchitectReview": False,
    "architectFormatValid": False,
    "tasks": [
        {
            "title": t["title"],
            "priority": t["priority"],
            "filePath": t["filePath"],
            "slug": t["slug"],
        }
        for t in tasks_raw
    ],
    "skipped": [],
}
with open(out_path, 'w') as f:
    json.dump(manifest, f, indent=2)
print(f"Manifest scritto: {out_path}")
PYEOF

  log "  ✅ horus-tasks-pending.json aggiornato"
  {
    echo ""
    echo "---"
    echo ""
    echo "## TASK PROPOSTI DA HORUS"
    echo ""
    python3 -c "
import json, sys
tasks = json.loads(sys.argv[1])
for t in tasks:
    print(f\"- **{t['title']}** (priorità: {t['priority']})\")
    if t.get('problem'):
        print(f\"  - Problema: {t['problem']}\")
" "$TASKS_JSON"
    echo ""
    echo "Task salvati in \`logs/horus-tasks-pending.json\` — verranno proposti alla prossima sessione di pianificazione."
  } >> "$REPORT_FILE"
else
  log "  ℹ️  Nessun task da proporre"
  {
    echo ""
    echo "---"
    echo ""
    if [ "$TC_ONLINE" -eq 0 ]; then
      echo "## RISULTATO: TC offline"
      echo ""
      echo "ThinkCentre non raggiungibile. Dati locali raccolti e salvati per revisione manuale."
      echo "Rieseguire l'analisi quando TC è online: \`FORCE_RERUN=1 bash scripts/post-deploy-analysis.sh\`"
    else
      echo "## RISULTATO: ✅ TUTTO OK"
      echo ""
      echo "Horus non ha rilevato anomalie nel deploy."
    fi
  } >> "$REPORT_FILE"
fi

# ── Chiusura ─────────────────────────────────────────────────────────────────
{
  echo ""
  echo "---"
  echo "*Report generato automaticamente da \`scripts/post-deploy-analysis.sh\` — $(date -u '+%Y-%m-%dT%H:%M:%SZ')*"
} >> "$REPORT_FILE"

log "════ Analisi completata ════"
log "Report: $REPORT_FILE"
if [ "$TASK_COUNT" -gt 0 ]; then
  log "Task proposti: $TASK_COUNT → $PENDING_TASKS_FILE"
fi

# Scrivi il marker di completamento (solo qui, a fine script con successo).
# Il trap EXIT rimuove .analyzing; questa riga scrive .analyzed.
# Se lo script crasha prima di arrivare qui, .analyzed non verrà scritto
# e il prossimo boot potrà ri-eseguire l'analisi.
touch "$ANALYZED_MARKER"
