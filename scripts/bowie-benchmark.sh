#!/usr/bin/env bash
# =============================================================================
# bowie-benchmark.sh — Benchmark singolo modello Bowie candidato
#
# Usage: bash scripts/bowie-benchmark.sh <model_name> [skip_rm]
#   skip_rm: "skip_rm" = non fare ollama rm alla fine (per baseline)
#
# Output: aggiunge risultati a logs/bowie-benchmark-raw.jsonl
# =============================================================================
set -euo pipefail

MODEL="${1:-}"
SKIP_RM="${2:-}"
RESULTS_FILE="logs/bowie-benchmark-raw.jsonl"
REPORT_FILE="logs/bowie-benchmark-results.md"

if [ -z "$MODEL" ]; then
  echo "ERROR: MODEL argument required" >&2
  exit 1
fi

source scripts/ai-agent-access.sh

# ─── Helpers ─────────────────────────────────────────────────────────────────

vram_read() {
  python3 .agents/skills/thinkcentre-access/tc.py exec \
    "nvidia-smi --query-gpu=memory.used,memory.free,temperature.gpu,utilization.gpu --format=csv,noheader,nounits" 2>/dev/null \
    | grep -v "Warning:" | head -1 | tr -d ' '
}

vram_used() {
  vram_read | cut -d',' -f1
}

vram_free() {
  vram_read | cut -d',' -f2
}

check_horus_alive() {
  local ps_out
  ps_out=$(curl -s --max-time 10 \
    -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
    -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
    -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
    "$HORUS_OLLAMA_URL/api/ps" 2>/dev/null)
  echo "$ps_out" | python3 -c "
import sys, json
d = json.load(sys.stdin)
models = [m['name'] for m in d.get('models', [])]
print('horus_ok' if 'qwen3:4b' in models else 'horus_missing')
print('loaded: ' + ', '.join(models))
" 2>/dev/null || echo "horus_check_failed"
}

pin_horus() {
  echo "[pin] Pinning qwen3:4b keep_alive:-1..."
  curl -s --no-buffer --max-time 60 \
    -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
    -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
    -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
    -H "Content-Type: application/json" \
    "$HORUS_OLLAMA_URL/api/generate" \
    -d '{"model":"qwen3:4b","prompt":"ok","stream":true,"keep_alive":-1,"options":{"num_predict":1}}' \
    > /dev/null 2>&1 || true
  echo "[pin] Horus pinned."
}

restore_horus() {
  local status
  status=$(check_horus_alive | head -1)
  if [ "$status" != "horus_ok" ]; then
    echo "[WARN] Horus missing from VRAM! Restoring..."
    pin_horus
    sleep 5
    local status2
    status2=$(check_horus_alive | head -1)
    echo "[restore] After restore: $status2"
  else
    echo "[ok] Horus still in VRAM."
  fi
}

unload_model() {
  local m="${1:-}"
  [ -z "$m" ] && return 0
  echo "[unload] Unloading $m..."
  curl -s --no-buffer --max-time 30 \
    -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
    -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
    -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
    -H "Content-Type: application/json" \
    "$HORUS_OLLAMA_URL/api/generate" \
    -d "{\"model\":$(echo "$m" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read().strip()))'),\"prompt\":\"x\",\"stream\":true,\"keep_alive\":0,\"options\":{\"num_predict\":1}}" \
    > /dev/null 2>&1 || true
  sleep 3
  echo "[unload] Done."
}

# Call model with full prompt, return raw response text + latency in ms
# call_model <model> <system_prompt> <user_prompt> [history_json]
call_model() {
  local m="$1"
  local system_prompt="$2"
  local user_prompt="$3"
  local history="${4:-}"  # JSON array of {role,content} pairs

  local messages
  if [ -n "$history" ]; then
    # Build messages: history + new user message
    messages=$(python3 -c "
import json, sys
hist = json.loads('''$history''')
sys_msg = {'role':'system','content':$(echo "$system_prompt" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read().strip()))')}
user_msg = {'role':'user','content':$(echo "$user_prompt" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read().strip()))')}
msgs = [sys_msg] + hist + [user_msg]
print(json.dumps(msgs))
")
  else
    messages=$(python3 -c "
import json
sys_msg = {'role':'system','content':$(echo "$system_prompt" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read().strip()))')}
user_msg = {'role':'user','content':$(echo "$user_prompt" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read().strip()))')}
print(json.dumps([sys_msg, user_msg]))
")
  fi

  local tmpraw
  tmpraw=$(mktemp)
  local t_start
  t_start=$(date +%s%3N)

  curl -s --no-buffer --max-time 90 \
    -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
    -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
    -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
    -H "Content-Type: application/json" \
    "$HORUS_OLLAMA_URL/api/chat" \
    -d "{\"model\":$(echo "$m" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read().strip()))'),\"messages\":${messages},\"stream\":true,\"think\":false,\"options\":{\"num_predict\":400}}" \
    > "$tmpraw" 2>/dev/null

  local t_end
  t_end=$(date +%s%3N)
  local latency=$(( t_end - t_start ))

  local response
  response=$(python3 -c "
import sys, json, re
chunks = []
for line in open('$tmpraw'):
    line = line.strip()
    if not line: continue
    try:
        d = json.loads(line)
        chunk = d.get('message', {}).get('content', '') or ''
        if chunk: chunks.append(chunk)
    except: pass
text = ''.join(chunks)
text = re.sub(r'<think>[\s\S]*?</think>', '', text)
text = re.sub(r'^[\s\S]*?</think>\s*', '', text)
print(text.strip())
" 2>/dev/null)
  rm -f "$tmpraw"

  echo "LATENCY_MS:$latency"
  echo "RESPONSE:$response"
}

load_model() {
  local m="$1"
  echo "[load] Loading $m (keep_alive:300)..."
  local t_start
  t_start=$(date +%s%3N)
  curl -s --no-buffer --max-time 120 \
    -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
    -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
    -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
    -H "Content-Type: application/json" \
    "$HORUS_OLLAMA_URL/api/generate" \
    -d "{\"model\":$(echo "$m" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read().strip()))'),\"prompt\":\"ciao\",\"stream\":true,\"keep_alive\":300,\"options\":{\"num_predict\":1}}" \
    > /dev/null 2>&1 || true
  local t_end
  t_end=$(date +%s%3N)
  echo "[load] Done in $(( t_end - t_start ))ms"
}

rm_model() {
  local m="$1"
  echo "[rm] Removing $m from disk..."
  python3 .agents/skills/thinkcentre-access/tc.py exec \
    "ollama rm $(echo "$m" | tr '/' '_' | sed 's/:/_/g') 2>/dev/null || ollama rm '$m' 2>/dev/null || echo 'rm: model not found (ok)'" \
    2>/dev/null | grep -v Warning || true
  # Try via Ollama API delete
  curl -s --max-time 15 -X DELETE \
    -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
    -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
    -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
    -H "Content-Type: application/json" \
    "$HORUS_OLLAMA_URL/api/delete" \
    -d "{\"model\":$(echo "$m" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read().strip()))')}" \
    2>/dev/null | head -c 200 || true
  echo "[rm] Done."
}

# ─── Score helpers ─────────────────────────────────────────────────────────

score_t1_snapshot() {
  local resp="$1"
  local expected="$2"
  python3 -c "
import json, sys, re
resp = '''$resp'''
expected = '$expected'
# Try to parse JSON from response
try:
    # Find JSON in response
    m = re.search(r'\{[^{}]*\}', resp)
    if m:
        d = json.loads(m.group())
        got = d.get('status','').lower().strip()
        if got == expected:
            print(1)
        else:
            print(0)
            print(f'  Expected {expected}, got {got}', file=sys.stderr)
    else:
        print(0)
        print(f'  No JSON found in: {repr(resp[:100])}', file=sys.stderr)
except Exception as e:
    print(0)
    print(f'  Parse error: {e}: {repr(resp[:100])}', file=sys.stderr)
" 2>&1
}

# ─── MAIN ─────────────────────────────────────────────────────────────────────

echo ""
echo "========================================"
echo "BENCHMARKING: $MODEL"
echo "========================================"

# Step 0: Pin Horus
pin_horus

# Step 1: VRAM pre-load check
VRAM_BEFORE=$(vram_read)
VRAM_FREE_MB=$(echo "$VRAM_BEFORE" | cut -d',' -f2)
echo "[vram] Pre-load: used=$(echo $VRAM_BEFORE|cut -d,'-f1) free=${VRAM_FREE_MB} temp=$(echo $VRAM_BEFORE|cut -d,'-f3)°C"

if [ "$VRAM_FREE_MB" -lt 2000 ]; then
  echo "[SKIP] VRAM libera ${VRAM_FREE_MB} MB < 2000 MB — skip $MODEL"
  echo "{\"model\":\"$MODEL\",\"skipped\":true,\"reason\":\"VRAM_LOW\",\"vram_free_mb\":$VRAM_FREE_MB}" >> "$RESULTS_FILE"
  exit 0
fi

# Step 2: Load model
load_model "$MODEL"
sleep 3

VRAM_AFTER_LOAD=$(vram_read)
VRAM_IDLE=$(echo "$VRAM_AFTER_LOAD" | cut -d',' -f1)
echo "[vram] Post-load (idle): ${VRAM_IDLE} MB used"

# Check Horus still alive
restore_horus

# ─── T1: Monitor Matching ─────────────────────────────────────────────────────
echo ""
echo "--- T1: Monitor Matching ---"

T1_SYS="Soglie: db_pool_used>=8=WARN >=9=ERROR; last_cycle_min_ago>=70=WARN >=120=ERROR; errors>0=ERROR; hnsw_ok=false=ERROR; heartbeat_age_sec>=300=ERROR. Rispondi SOLO con JSON valido: {\"status\":\"ok|warn|error\",\"reason\":\"stringa breve\"}"

T1_TOTAL=0
T1_LATENCIES=()
VRAM_T1_PEAK=0

# S1: ok
RAW=$(call_model "$MODEL" "$T1_SYS" '{"db_pool_used":5,"last_cycle_min_ago":45,"errors":0,"hnsw_ok":true,"heartbeat_age_sec":12}')
T1_LAT1=$(echo "$RAW" | grep "LATENCY_MS:" | cut -d: -f2)
T1_RESP1=$(echo "$RAW" | grep -v "LATENCY_MS:" | sed 's/^RESPONSE://')
SNAP1=$(vram_used); [ "$SNAP1" -gt "$VRAM_T1_PEAK" ] && VRAM_T1_PEAK=$SNAP1
S1=$(echo "$T1_RESP1" | python3 -c "import json,sys,re; resp=sys.stdin.read(); m=re.search(r'\{[^{}]*\}',resp); d=json.loads(m.group()) if m else {}; print(1 if d.get('status','').lower()=='ok' else 0)" 2>/dev/null || echo 0)
echo "  S1 (expect ok): score=$S1 lat=${T1_LAT1}ms resp=$(echo $T1_RESP1|head -c 80)"
T1_TOTAL=$((T1_TOTAL + S1))

# S2: error
RAW=$(call_model "$MODEL" "$T1_SYS" '{"db_pool_used":9,"last_cycle_min_ago":80,"errors":0,"hnsw_ok":true,"heartbeat_age_sec":30}')
T1_LAT2=$(echo "$RAW" | grep "LATENCY_MS:" | cut -d: -f2)
T1_RESP2=$(echo "$RAW" | grep -v "LATENCY_MS:" | sed 's/^RESPONSE://')
SNAP2=$(vram_used); [ "$SNAP2" -gt "$VRAM_T1_PEAK" ] && VRAM_T1_PEAK=$SNAP2
S2=$(echo "$T1_RESP2" | python3 -c "import json,sys,re; resp=sys.stdin.read(); m=re.search(r'\{[^{}]*\}',resp); d=json.loads(m.group()) if m else {}; print(1 if d.get('status','').lower()=='error' else 0)" 2>/dev/null || echo 0)
echo "  S2 (expect error): score=$S2 lat=${T1_LAT2}ms resp=$(echo $T1_RESP2|head -c 80)"
T1_TOTAL=$((T1_TOTAL + S2))

# S3: error
RAW=$(call_model "$MODEL" "$T1_SYS" '{"db_pool_used":6,"last_cycle_min_ago":55,"errors":3,"hnsw_ok":false,"heartbeat_age_sec":480}')
T1_LAT3=$(echo "$RAW" | grep "LATENCY_MS:" | cut -d: -f2)
T1_RESP3=$(echo "$RAW" | grep -v "LATENCY_MS:" | sed 's/^RESPONSE://')
SNAP3=$(vram_used); [ "$SNAP3" -gt "$VRAM_T1_PEAK" ] && VRAM_T1_PEAK=$SNAP3
S3=$(echo "$T1_RESP3" | python3 -c "import json,sys,re; resp=sys.stdin.read(); m=re.search(r'\{[^{}]*\}',resp); d=json.loads(m.group()) if m else {}; print(1 if d.get('status','').lower()=='error' else 0)" 2>/dev/null || echo 0)
echo "  S3 (expect error): score=$S3 lat=${T1_LAT3}ms resp=$(echo $T1_RESP3|head -c 80)"
T1_TOTAL=$((T1_TOTAL + S3))

# S4: warn
RAW=$(call_model "$MODEL" "$T1_SYS" '{"db_pool_used":8,"last_cycle_min_ago":71,"errors":0,"hnsw_ok":true,"heartbeat_age_sec":20}')
T1_LAT4=$(echo "$RAW" | grep "LATENCY_MS:" | cut -d: -f2)
T1_RESP4=$(echo "$RAW" | grep -v "LATENCY_MS:" | sed 's/^RESPONSE://')
SNAP4=$(vram_used); [ "$SNAP4" -gt "$VRAM_T1_PEAK" ] && VRAM_T1_PEAK=$SNAP4
S4=$(echo "$T1_RESP4" | python3 -c "import json,sys,re; resp=sys.stdin.read(); m=re.search(r'\{[^{}]*\}',resp); d=json.loads(m.group()) if m else {}; print(1 if d.get('status','').lower()=='warn' else 0)" 2>/dev/null || echo 0)
echo "  S4 (expect warn): score=$S4 lat=${T1_LAT4}ms resp=$(echo $T1_RESP4|head -c 80)"
T1_TOTAL=$((T1_TOTAL + S4))

T1_LAT_AVG=$(( (T1_LAT1 + T1_LAT2 + T1_LAT3 + T1_LAT4) / 4 ))
echo "  T1 total: $T1_TOTAL/4 avg_lat=${T1_LAT_AVG}ms"

# ─── T2: Escalation Horus ────────────────────────────────────────────────────
echo ""
echo "--- T2: Escalation Horus ---"

T2_SYS="Sei Bowie, assistant BikerLink. Hai rilevato un segnale critico nel sistema matching. Decidi se svegliare Horus e prepara il messaggio di escalation. Rispondi SOLO JSON: {\"wake_horus\":bool,\"priority\":\"low|high|critical\",\"message\":\"max 80 char\"}"

RAW=$(call_model "$MODEL" "$T2_SYS" '{"signal":"heartbeat_dead","heartbeat_age_sec":510,"errors":4,"hnsw_ok":false,"db_pool":9}')
T2_LAT=$(echo "$RAW" | grep "LATENCY_MS:" | cut -d: -f2)
T2_RESP=$(echo "$RAW" | grep -v "LATENCY_MS:" | sed 's/^RESPONSE://')
VRAM_T2_PEAK=$(vram_used)

T2_SCORES=$(echo "$T2_RESP" | python3 -c "
import json, sys, re
resp = sys.stdin.read()
score = 0
details = []
try:
    m = re.search(r'\{[^{}]*\}', resp, re.DOTALL)
    if m:
        d = json.loads(m.group())
        if d.get('wake_horus') == True:
            score += 1
            details.append('wake_horus=true OK')
        else:
            details.append(f'wake_horus={d.get(\"wake_horus\")} FAIL')
        if str(d.get('priority','')).lower() == 'critical':
            score += 1
            details.append('priority=critical OK')
        else:
            details.append(f'priority={d.get(\"priority\")} FAIL')
        msg = str(d.get('message',''))
        if msg and len(msg) <= 80:
            score += 1
            details.append(f'message OK ({len(msg)} chars)')
        else:
            details.append(f'message FAIL (len={len(msg)})')
    else:
        details.append('no JSON found')
except Exception as e:
    details.append(f'error: {e}')
print(f'{score}|{\" / \".join(details)}')
" 2>/dev/null || echo "0|parse_error")

T2_SCORE=$(echo "$T2_SCORES" | cut -d'|' -f1)
T2_DETAIL=$(echo "$T2_SCORES" | cut -d'|' -f2-)
echo "  T2: $T2_SCORE/3 lat=${T2_LAT}ms — $T2_DETAIL"
echo "  resp: $(echo $T2_RESP|head -c 120)"

# ─── T3: Tool Calling ────────────────────────────────────────────────────────
echo ""
echo "--- T3: Tool Calling ---"

T3_SYS='Sei Bowie, assistant BikerLink. Hai accesso a questi tool:
- search_manual(query): cerca nel manuale BikerLink via Nadir
- get_weather(city, date): meteo per città e data
- web_search(query): cerca informazioni sul web
Rispondi SOLO JSON: {"tool":"nome","args":{...}}
oppure {"tool":"none","reply":"..."} se non serve un tool.'

T3_TOTAL=0
T3_LATS=()

# Q1: meteo → get_weather
RAW=$(call_model "$MODEL" "$T3_SYS" "che tempo farà domani a napoli?")
T3_LAT1=$(echo "$RAW" | grep "LATENCY_MS:" | cut -d: -f2)
T3_RESP1=$(echo "$RAW" | grep -v "LATENCY_MS:" | sed 's/^RESPONSE://')
VRAM_T3_PEAK=$(vram_used)
SQ1=$(echo "$T3_RESP1" | python3 -c "
import json, sys, re
resp = sys.stdin.read()
try:
    m = re.search(r'\{[^{}]*\}', resp)
    d = json.loads(m.group()) if m else {}
    print(1 if d.get('tool','').lower() == 'get_weather' else 0)
except: print(0)
" 2>/dev/null || echo 0)
echo "  Q1 (expect get_weather): score=$SQ1 lat=${T3_LAT1}ms resp=$(echo $T3_RESP1|head -c 80)"
T3_TOTAL=$((T3_TOTAL + SQ1))

# Q2: manuale → search_manual
RAW=$(call_model "$MODEL" "$T3_SYS" "come funziona il matching su bikerlink?")
T3_LAT2=$(echo "$RAW" | grep "LATENCY_MS:" | cut -d: -f2)
T3_RESP2=$(echo "$RAW" | grep -v "LATENCY_MS:" | sed 's/^RESPONSE://')
SQ2=$(echo "$T3_RESP2" | python3 -c "
import json, sys, re
resp = sys.stdin.read()
try:
    m = re.search(r'\{[^{}]*\}', resp)
    d = json.loads(m.group()) if m else {}
    print(1 if d.get('tool','').lower() == 'search_manual' else 0)
except: print(0)
" 2>/dev/null || echo 0)
echo "  Q2 (expect search_manual): score=$SQ2 lat=${T3_LAT2}ms resp=$(echo $T3_RESP2|head -c 80)"
T3_TOTAL=$((T3_TOTAL + SQ2))

# Q3: web → web_search
RAW=$(call_model "$MODEL" "$T3_SYS" "qual è il limite di velocità in autostrada in italia?")
T3_LAT3=$(echo "$RAW" | grep "LATENCY_MS:" | cut -d: -f2)
T3_RESP3=$(echo "$RAW" | grep -v "LATENCY_MS:" | sed 's/^RESPONSE://')
SQ3=$(echo "$T3_RESP3" | python3 -c "
import json, sys, re
resp = sys.stdin.read()
try:
    m = re.search(r'\{[^{}]*\}', resp)
    d = json.loads(m.group()) if m else {}
    print(1 if d.get('tool','').lower() == 'web_search' else 0)
except: print(0)
" 2>/dev/null || echo 0)
echo "  Q3 (expect web_search): score=$SQ3 lat=${T3_LAT3}ms resp=$(echo $T3_RESP3|head -c 80)"
T3_TOTAL=$((T3_TOTAL + SQ3))

T3_LAT_AVG=$(( (T3_LAT1 + T3_LAT2 + T3_LAT3) / 3 ))
echo "  T3 total: $T3_TOTAL/3 avg_lat=${T3_LAT_AVG}ms"

# ─── T4: Dialetto Meridionale ────────────────────────────────────────────────
echo ""
echo "--- T4: Dialetto Meridionale ---"

T4_SYS="Sei Bowie, assistant di BikerLink. Rispondi sempre in italiano standard, gentile e utile. L'utente potrebbe scrivere con errori di battitura o termini dialettali meridionali."

T4_TOTAL=0
T4_HISTORY="[]"
T4_LATS=()

score_relevance() {
  local resp="$1"
  local keywords="$2"
  python3 -c "
import sys, re
resp = '''$resp'''.lower()
keywords = '''$keywords'''.lower().split(',')
# Score 1 if response is non-empty, not in English, and contains at least one keyword OR is clearly helpful
if len(resp.strip()) < 10:
    print(0)
    sys.exit()
# Check if English dominant
it_indicators = ['ciao','grazie','puoi','puoi','hai','moto','app','bikerlink','viaggio','cerca','trova','ducati','palermo','compagni','iscrivers','profil','aggiunger','andare','napoli','passegger','posso','puoi','come','non']
eng_indicators = ['hello','sorry','cannot','please','the ','this ','your ','you ']
it_score = sum(1 for w in it_indicators if w in resp)
eng_score = sum(1 for w in eng_indicators if w in resp)
# Penalize refusals
refusal_words = ['non posso','impossibile rispondere','non sono in grado']
if any(w in resp for w in refusal_words):
    print(0)
    sys.exit()
if eng_score > it_score and eng_score > 3:
    print(0)
    sys.exit()
# Check keywords
kw_hit = any(k.strip() in resp for k in keywords if k.strip())
print(1 if (len(resp.strip()) > 20 and (kw_hit or it_score > 2)) else 0)
" 2>/dev/null || echo 0
}

add_to_history() {
  local history="$1"
  local user_msg="$2"
  local asst_msg="$3"
  python3 -c "
import json, sys
h = json.loads('''$history''')
h.append({'role':'user','content':$(echo "$user_msg" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read().strip()))')})
h.append({'role':'assistant','content':$(echo "$asst_msg" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read().strip()))')})
print(json.dumps(h))
" 2>/dev/null || echo "$history"
}

# M1: trovare compagni
RAW=$(call_model "$MODEL" "$T4_SYS" "oi nun riesc a truva compagni pe viaggià, cumm si fa?" "$T4_HISTORY")
T4_LAT1=$(echo "$RAW" | grep "LATENCY_MS:" | cut -d: -f2)
T4_RESP1=$(echo "$RAW" | grep -v "LATENCY_MS:" | sed 's/^RESPONSE://')
VRAM_T4_SNAP1=$(vram_used)
SM1=$(score_relevance "$T4_RESP1" "compagni,viaggio,cerca,trova,profilo,matching")
echo "  M1 (cerca compagni): score=$SM1 lat=${T4_LAT1}ms"
echo "  resp: $(echo $T4_RESP1|head -c 100)"
T4_TOTAL=$((T4_TOTAL + SM1))
T4_HISTORY=$(add_to_history "$T4_HISTORY" "oi nun riesc a truva compagni pe viaggià, cumm si fa?" "$T4_RESP1")

# M2: app non parte
RAW=$(call_model "$MODEL" "$T4_SYS" "appicciato l app ma nun part, che cazz succede" "$T4_HISTORY")
T4_LAT2=$(echo "$RAW" | grep "LATENCY_MS:" | cut -d: -f2)
T4_RESP2=$(echo "$RAW" | grep -v "LATENCY_MS:" | sed 's/^RESPONSE://')
VRAM_T4_SNAP2=$(vram_used)
SM2=$(score_relevance "$T4_RESP2" "app,aggiorna,riavvia,problema,controlla,versione")
echo "  M2 (app non parte): score=$SM2 lat=${T4_LAT2}ms"
echo "  resp: $(echo $T4_RESP2|head -c 100)"
T4_TOTAL=$((T4_TOTAL + SM2))
T4_HISTORY=$(add_to_history "$T4_HISTORY" "appicciato l app ma nun part, che cazz succede" "$T4_RESP2")

# M3: ducati nel profilo
RAW=$(call_model "$MODEL" "$T4_SYS" "voglo saper se posso mettere la mia moto preferita sulapp, ho na ducati" "$T4_HISTORY")
T4_LAT3=$(echo "$RAW" | grep "LATENCY_MS:" | cut -d: -f2)
T4_RESP3=$(echo "$RAW" | grep -v "LATENCY_MS:" | sed 's/^RESPONSE://')
VRAM_T4_SNAP3=$(vram_used)
SM3=$(score_relevance "$T4_RESP3" "ducati,moto,profilo,aggiungere,sì,puoi,inserire")
echo "  M3 (ducati profilo): score=$SM3 lat=${T4_LAT3}ms"
echo "  resp: $(echo $T4_RESP3|head -c 100)"
T4_TOTAL=$((T4_TOTAL + SM3))
T4_HISTORY=$(add_to_history "$T4_HISTORY" "voglo saper se posso mettere la mia moto preferita sulapp, ho na ducati" "$T4_RESP3")

# M4: palermo
RAW=$(call_model "$MODEL" "$T4_SYS" "sto cercando qualcunno pe fare un viaggio vrs palermo, sai aiutarm?" "$T4_HISTORY")
T4_LAT4=$(echo "$RAW" | grep "LATENCY_MS:" | cut -d: -f2)
T4_RESP4=$(echo "$RAW" | grep -v "LATENCY_MS:" | sed 's/^RESPONSE://')
VRAM_T4_PEAK=$(vram_used)
[ "$VRAM_T4_SNAP1" -gt "$VRAM_T4_PEAK" ] && VRAM_T4_PEAK=$VRAM_T4_SNAP1
[ "$VRAM_T4_SNAP2" -gt "$VRAM_T4_PEAK" ] && VRAM_T4_PEAK=$VRAM_T4_SNAP2
[ "$VRAM_T4_SNAP3" -gt "$VRAM_T4_PEAK" ] && VRAM_T4_PEAK=$VRAM_T4_SNAP3
SM4=$(score_relevance "$T4_RESP4" "palermo,viaggio,compagni,cerca,trova,percorso")
echo "  M4 (palermo viaggio): score=$SM4 lat=${T4_LAT4}ms"
echo "  resp: $(echo $T4_RESP4|head -c 100)"
T4_TOTAL=$((T4_TOTAL + SM4))

T4_LAT_AVG=$(( (T4_LAT1 + T4_LAT2 + T4_LAT3 + T4_LAT4) / 4 ))
echo "  T4 total: $T4_TOTAL/4 avg_lat=${T4_LAT_AVG}ms"

# ─── T5: Multi-Turn Coerenza ─────────────────────────────────────────────────
echo ""
echo "--- T5: Multi-Turn Coerenza ---"

T5_SYS="Sei Bowie, assistant di BikerLink. Rispondi in italiano. Sei esperto di BikerLink, app per motociclisti."

T5_TOTAL=0
T5_HISTORY="[]"

# Turn 1: matching
RAW=$(call_model "$MODEL" "$T5_SYS" "ciao, come funziona la ricerca di compagni di viaggio su BikerLink?" "$T5_HISTORY")
T5_LAT1=$(echo "$RAW" | grep "LATENCY_MS:" | cut -d: -f2)
T5_RESP1=$(echo "$RAW" | grep -v "LATENCY_MS:" | sed 's/^RESPONSE://')
VRAM_T5_SNAP1=$(vram_used)
ST1=$(score_relevance "$T5_RESP1" "matching,compagni,viaggio,ricerca,trova,profilo,preferenze")
echo "  T1 (matching): score=$ST1 lat=${T5_LAT1}ms"
echo "  resp: $(echo $T5_RESP1|head -c 100)"
T5_TOTAL=$((T5_TOTAL + ST1))
T5_HISTORY=$(add_to_history "$T5_HISTORY" "ciao, come funziona la ricerca di compagni di viaggio su BikerLink?" "$T5_RESP1")

# Turn 2: ducati km pieno - should admit ignorance
RAW=$(call_model "$MODEL" "$T5_SYS" "ah ok grazie. invece, quanti km fa una ducati monster con un pieno?" "$T5_HISTORY")
T5_LAT2=$(echo "$RAW" | grep "LATENCY_MS:" | cut -d: -f2)
T5_RESP2=$(echo "$RAW" | grep -v "LATENCY_MS:" | sed 's/^RESPONSE://')
VRAM_T5_SNAP2=$(vram_used)
# Score: 1 if doesn't confidently invent specific km number, or says "non so"/"fonte esterna"
ST2=$(echo "$T5_RESP2" | python3 -c "
import sys, re
resp = sys.stdin.read().lower()
# If it's empty or very short, fail
if len(resp.strip()) < 10:
    print(0)
    sys.exit()
# Bad: confidently states specific km like '200 km', '250 km' etc as absolute truth
# Good: uses words like 'dipende','circa','varia','non sono sicuro','non lo so','consulta','sito'
hedge_words = ['dipende','circa','varia','non sono sicuro','non lo so','consulta','sito','scheda tecnica','specifiche','fonte','approssimativamente','stima','generalmente']
# Confident specific claims (bad)
confident = re.findall(r'\b(\d{2,3})\s*km\b', resp)
has_hedge = any(w in resp for w in hedge_words)
if has_hedge or not confident:
    print(1)
else:
    print(0)
" 2>/dev/null || echo 0)
echo "  T2 (ducati km): score=$ST2 lat=${T5_LAT2}ms (hedges or admits ignorance)"
echo "  resp: $(echo $T5_RESP2|head -c 120)"
T5_TOTAL=$((T5_TOTAL + ST2))
T5_HISTORY=$(add_to_history "$T5_HISTORY" "ah ok grazie. invece, quanti km fa una ducati monster con un pieno?" "$T5_RESP2")

# Turn 3: back to matching - filter per marca
RAW=$(call_model "$MODEL" "$T5_SYS" "torniamo al matching — posso filtrare per marca di moto?" "$T5_HISTORY")
T5_LAT3=$(echo "$RAW" | grep "LATENCY_MS:" | cut -d: -f2)
T5_RESP3=$(echo "$RAW" | grep -v "LATENCY_MS:" | sed 's/^RESPONSE://')
VRAM_T5_PEAK=$(vram_used)
[ "$VRAM_T5_SNAP1" -gt "$VRAM_T5_PEAK" ] && VRAM_T5_PEAK=$VRAM_T5_SNAP1
[ "$VRAM_T5_SNAP2" -gt "$VRAM_T5_PEAK" ] && VRAM_T5_PEAK=$VRAM_T5_SNAP2
# Score: mentions matching/filtrare/marca context
ST3=$(score_relevance "$T5_RESP3" "matching,marca,filtro,filtrare,moto,preferenze,ricerca,compagni")
echo "  T3 (matching marca): score=$ST3 lat=${T5_LAT3}ms"
echo "  resp: $(echo $T5_RESP3|head -c 100)"
T5_TOTAL=$((T5_TOTAL + ST3))

T5_LAT_AVG=$(( (T5_LAT1 + T5_LAT2 + T5_LAT3) / 3 ))
echo "  T5 total: $T5_TOTAL/3 avg_lat=${T5_LAT_AVG}ms"

# ─── Summary ──────────────────────────────────────────────────────────────────
TOTAL=$((T1_TOTAL + T2_SCORE + T3_TOTAL + T4_TOTAL + T5_TOTAL))
ALL_LATS=($T1_LAT1 $T1_LAT2 $T1_LAT3 $T1_LAT4 $T2_LAT $T3_LAT1 $T3_LAT2 $T3_LAT3 $T4_LAT1 $T4_LAT2 $T4_LAT3 $T4_LAT4 $T5_LAT1 $T5_LAT2 $T5_LAT3)
LAT_SUM=0
for l in "${ALL_LATS[@]}"; do LAT_SUM=$((LAT_SUM + l)); done
LAT_AVG=$((LAT_SUM / ${#ALL_LATS[@]}))

echo ""
echo "=== RESULT: $MODEL ==="
echo "  T1=$T1_TOTAL/4 T2=$T2_SCORE/3 T3=$T3_TOTAL/3 T4=$T4_TOTAL/4 T5=$T5_TOTAL/3 TOTAL=$TOTAL/17"
echo "  VRAM_idle=${VRAM_IDLE} T1_peak=${VRAM_T1_PEAK} T2_peak=${VRAM_T2_PEAK} T3_peak=${VRAM_T3_PEAK} T4_peak=${VRAM_T4_PEAK} T5_peak=${VRAM_T5_PEAK}"
echo "  LAT_avg=${LAT_AVG}ms"

# Persist raw results as JSON
VRAM_TEMP=$(echo "$VRAM_AFTER_LOAD" | cut -d',' -f3)
GPU_UTIL_LOAD=$(echo "$VRAM_AFTER_LOAD" | cut -d',' -f4)

cat >> "$RESULTS_FILE" << JSONEOF
{"model":"$MODEL","t1":$T1_TOTAL,"t2":$T2_SCORE,"t3":$T3_TOTAL,"t4":$T4_TOTAL,"t5":$T5_TOTAL,"total":$TOTAL,"lat_avg_ms":$LAT_AVG,"vram_idle_mb":$VRAM_IDLE,"vram_t1_peak_mb":${VRAM_T1_PEAK:-0},"vram_t2_peak_mb":${VRAM_T2_PEAK:-0},"vram_t3_peak_mb":${VRAM_T3_PEAK:-0},"vram_t4_peak_mb":${VRAM_T4_PEAK:-0},"vram_t5_peak_mb":${VRAM_T5_PEAK:-0},"temp_c":$VRAM_TEMP,"t1_lats":[$T1_LAT1,$T1_LAT2,$T1_LAT3,$T1_LAT4],"t2_lat":$T2_LAT,"t3_lats":[$T3_LAT1,$T3_LAT2,$T3_LAT3],"t4_lats":[$T4_LAT1,$T4_LAT2,$T4_LAT3,$T4_LAT4],"t5_lats":[$T5_LAT1,$T5_LAT2,$T5_LAT3]}
JSONEOF

echo "[done] Results written to $RESULTS_FILE"

# ─── Cleanup ─────────────────────────────────────────────────────────────────
echo ""
unload_model "$MODEL"
restore_horus

if [ "$SKIP_RM" != "skip_rm" ] && \
   [ "$MODEL" != "qwen3:1.7b" ] && \
   [ "$MODEL" != "qwen3:4b" ] && \
   [ "$MODEL" != "qwen3:14b" ] && \
   [ "$MODEL" != "bikerlink:latest" ] && \
   [ "$MODEL" != "bikerlink-routing:latest" ]; then
  rm_model "$MODEL"
fi

echo ""
FINAL_VRAM=$(vram_read)
echo "[final] VRAM after cleanup: used=$(echo $FINAL_VRAM|cut -d,'-f1) free=$(echo $FINAL_VRAM|cut -d,'-f2) temp=$(echo $FINAL_VRAM|cut -d,'-f3)°C"
echo ""
echo "========================================"
echo "DONE: $MODEL → $TOTAL/17"
echo "========================================"
