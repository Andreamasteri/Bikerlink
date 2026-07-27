#!/usr/bin/env bash
# =============================================================================
# ai-agent-access.sh — Canonical protocol for calling Horus, Ares, TC-agent
#
# Source this file to get four functions:
#   ai_check_tc              — check if ThinkCentre Ollama is reachable (≤10s)
#   ai_call_horus PROMPT     — call Horus (qwen3:4b, stream:true, think:false)
#   ai_call_ares  PROMPT     — call Ares (DIAG_OLLAMA_*, diagnostics-only)
#   ai_call_tc_agent EP ...  — call ThinkCentre agent API
#
# Or run directly:
#   bash scripts/ai-agent-access.sh --self-test
# =============================================================================

# ---------------------------------------------------------------------------
# ai_check_tc — verify ThinkCentre Ollama is reachable
# Exit 0 = online, Exit 1 = offline/error
# Stdout: one of: online | offline | cf-blocked | auth-failed | secret-empty
# ---------------------------------------------------------------------------
ai_check_tc() {
  # Check required secrets
  if [ -z "$HORUS_OLLAMA_URL" ] || [ -z "$CF_ACCESS_CLIENT_ID" ] || [ -z "$CF_ACCESS_CLIENT_SECRET" ]; then
    echo "secret-empty"
    return 1
  fi

  local response
  local http_code
  local body

  # Use a temp file to capture both body and http code
  local tmp
  tmp=$(mktemp)

  http_code=$(curl -s --max-time 10 \
    -o "$tmp" \
    -w "%{http_code}" \
    -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
    -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
    -H "Authorization: Bearer ${HORUS_OLLAMA_TOKEN:-}" \
    "${HORUS_OLLAMA_URL%/}/api/tags" 2>/dev/null)

  body=$(cat "$tmp" 2>/dev/null)
  rm -f "$tmp"

  case "$http_code" in
    200)
      # Verify it's actually JSON with models
      if echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'models' in d else 1)" 2>/dev/null; then
        echo "online"
        return 0
      else
        echo "offline"
        return 1
      fi
      ;;
    401)
      echo "auth-failed"
      return 1
      ;;
    403)
      echo "cf-blocked"
      return 1
      ;;
    000|"")
      # curl failed entirely — empty URL, DNS fail, or secret-empty caused bad URL
      echo "offline"
      return 1
      ;;
    *)
      echo "offline"
      return 1
      ;;
  esac
}

# ---------------------------------------------------------------------------
# _ai_parse_ndjson — shared NDJSON parser for Horus/Ares streaming responses.
# Reads NDJSON lines from stdin, assembles text, strips think tags + English
# reasoning leakage. Exits 1 if no content was extracted (empty stream).
# ---------------------------------------------------------------------------
_ai_parse_ndjson() {
  python3 -c "
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

# Strip complete <think>...</think> blocks (may contain newlines)
text = re.sub(r'<think>[\s\S]*?</think>', '', text)

# Strip orphan closing </think> and everything before it
# (qwen3 sometimes emits reasoning without the opening tag)
text = re.sub(r'^[\s\S]*?</think>\s*', '', text)

# Strip English reasoning leakage lines at the start:
# lines starting with 'Okay,', 'Sure,', 'Let me', 'Alright,' before the real answer
lines = text.split('\n')
while lines and re.match(r'^(Okay,|Sure,|Let me|Alright,|Of course,)', lines[0].strip()):
    lines.pop(0)
text = '\n'.join(lines).strip()

# Exit 1 if no content — lets callers distinguish empty-stream from real output
if not text:
    sys.exit(1)
print(text)
"
}

# ---------------------------------------------------------------------------
# ai_call_horus PROMPT [num_predict=1200]
# Calls Horus (qwen3:4b), stream:true, think:false, CF Access + Bearer.
# Max-time: 180s (allows qwen3:4b cold load ~125s before first token).
# Strips <think>…</think> blocks and English reasoning leakage.
# Output: clean text on stdout.
# Exit 0 = success (non-empty response), Exit 1 = any error.
#
# Failure contract:
#   - curl transport errors   → exit 1 (PIPESTATUS[0] != 0)
#   - HTTP 4xx/5xx from CF    → exit 1 (--fail-with-body, PIPESTATUS[0] != 0)
#   - Empty/unparseable stream → exit 1 (parser exits 1 on empty output)
# ---------------------------------------------------------------------------
ai_call_horus() {
  local prompt="${1:-}"
  local num_predict="${2:-1200}"

  if [ -z "$prompt" ]; then
    echo "[ai_call_horus] ERROR: PROMPT argument is required" >&2
    return 1
  fi

  if [ -z "$HORUS_OLLAMA_URL" ] || [ -z "$CF_ACCESS_CLIENT_ID" ] || [ -z "$CF_ACCESS_CLIENT_SECRET" ]; then
    echo "[Horus non configurato: secret HORUS_OLLAMA_URL / CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET mancanti]" >&2
    return 1
  fi

  local model="${HORUS_OLLAMA_MODEL:-qwen3:4b}"

  # Step 1: stream curl to a raw temp file. --no-buffer keeps CF alive (first
  # byte reaches CF in ~2s, resetting its idle timer). --fail-with-body exits
  # non-zero on HTTP 4xx/5xx. We check $? directly — no pipeline ambiguity.
  local tmpraw
  tmpraw=$(mktemp)

  curl -s --no-buffer --max-time 180 --fail-with-body \
    -H "Content-Type: application/json" \
    -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
    -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
    -H "Authorization: Bearer ${HORUS_OLLAMA_TOKEN:-}" \
    -d "{
      \"model\": $(echo "$model" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))'),
      \"stream\": true,
      \"think\": false,
      \"options\": {\"num_predict\": ${num_predict}},
      \"messages\": [{\"role\": \"user\", \"content\": $(echo "$prompt" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')}]
    }" \
    "${HORUS_OLLAMA_URL%/}/api/chat" > "$tmpraw"
  local curl_exit=$?

  if [ "$curl_exit" -ne 0 ]; then
    rm -f "$tmpraw"
    echo "[ai_call_horus] ERROR: curl failed (exit $curl_exit — transport error, timeout, or HTTP 4xx/5xx)" >&2
    return 1
  fi

  # Step 2: parse the captured NDJSON. $? is curl's exit code (simple command,
  # no pipeline), so parse_exit is reliable.
  local output
  output=$(cat "$tmpraw" | _ai_parse_ndjson)
  local parse_exit=$?
  rm -f "$tmpraw"

  if [ "$parse_exit" -ne 0 ]; then
    echo "[ai_call_horus] ERROR: empty or unparseable response from Horus" >&2
    return 1
  fi

  echo "$output"
  return 0
}

# ---------------------------------------------------------------------------
# ai_call_ares PROMPT [num_predict=1200]
# Calls Ares diagnostics AI (DIAG_OLLAMA_* secrets).
# Same pattern as ai_call_horus but uses dedicated DIAG_OLLAMA_* secrets.
# If secrets are absent, prints a clear message and exits 1 (no crash).
# ---------------------------------------------------------------------------
ai_call_ares() {
  local prompt="${1:-}"
  local num_predict="${2:-1200}"

  if [ -z "$prompt" ]; then
    echo "[ai_call_ares] ERROR: PROMPT argument is required" >&2
    return 1
  fi

  # Ares uses DIAG_OLLAMA_* — separate from HORUS_OLLAMA_*
  if [ -z "$DIAG_OLLAMA_URL" ] || [ -z "$DIAG_OLLAMA_TOKEN" ]; then
    echo "[Ares non configurato in questo env: DIAG_OLLAMA_URL / DIAG_OLLAMA_TOKEN mancanti]" >&2
    return 1
  fi

  # CF Access is still needed for the CF tunnel
  if [ -z "$CF_ACCESS_CLIENT_ID" ] || [ -z "$CF_ACCESS_CLIENT_SECRET" ]; then
    echo "[Ares non configurato in questo env: CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET mancanti]" >&2
    return 1
  fi

  local model="${DIAG_OLLAMA_MODEL:-devstral:latest}"

  # Run the pipeline OUTSIDE command substitution so PIPESTATUS is preserved
  # in the current shell (not a subshell). Output goes to a temp file.
  # Step 1: stream curl to a raw temp file. --no-buffer keeps CF alive.
  # --fail-with-body exits non-zero on HTTP 4xx/5xx. $? is curl's exit code directly.
  local tmpraw
  tmpraw=$(mktemp)

  curl -s --no-buffer --max-time 180 --fail-with-body \
    -H "Content-Type: application/json" \
    -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
    -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
    -H "Authorization: Bearer ${DIAG_OLLAMA_TOKEN}" \
    -d "{
      \"model\": $(echo "$model" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))'),
      \"stream\": true,
      \"think\": false,
      \"options\": {\"num_predict\": ${num_predict}},
      \"messages\": [{\"role\": \"user\", \"content\": $(echo "$prompt" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')}]
    }" \
    "${DIAG_OLLAMA_URL%/}/api/chat" > "$tmpraw"
  local curl_exit=$?

  if [ "$curl_exit" -ne 0 ]; then
    rm -f "$tmpraw"
    echo "[ai_call_ares] ERROR: curl failed (exit $curl_exit — transport error, timeout, or HTTP 4xx/5xx)" >&2
    return 1
  fi

  # Step 2: parse the captured NDJSON. Simple command substitution — $? is reliable.
  local output
  output=$(cat "$tmpraw" | _ai_parse_ndjson)
  local parse_exit=$?
  rm -f "$tmpraw"

  if [ "$parse_exit" -ne 0 ]; then
    echo "[ai_call_ares] ERROR: empty or unparseable response from Ares" >&2
    return 1
  fi

  echo "$output"
  return 0
}

# ---------------------------------------------------------------------------
# ai_call_tc_agent ENDPOINT [METHOD=GET] [JSON_BODY]
# Calls the ThinkCentre agent API at THINKCENTRE_METRICS_URL/ENDPOINT.
# Sends X-Agent-Token + CF Access headers.
# Max-time: 30s (agent ops are fast; no cold model load involved).
# Output: raw JSON response on stdout.
# Exit 0 = success (HTTP 2xx), Exit 1 = error.
# ---------------------------------------------------------------------------
ai_call_tc_agent() {
  local endpoint="${1:-health}"
  local method="${2:-GET}"
  local json_body="${3:-}"

  if [ -z "$THINKCENTRE_METRICS_URL" ] || [ -z "$THINKCENTRE_AGENT_TOKEN" ]; then
    echo '{"error":"secret-empty","detail":"THINKCENTRE_METRICS_URL or THINKCENTRE_AGENT_TOKEN not set"}' >&2
    return 1
  fi

  if [ -z "$CF_ACCESS_CLIENT_ID" ] || [ -z "$CF_ACCESS_CLIENT_SECRET" ]; then
    echo '{"error":"secret-empty","detail":"CF_ACCESS_CLIENT_ID or CF_ACCESS_CLIENT_SECRET not set"}' >&2
    return 1
  fi

  local url="${THINKCENTRE_METRICS_URL%/}/${endpoint#/}"
  local tmp
  tmp=$(mktemp)

  local curl_args=(
    -s
    --max-time 30
    -o "$tmp"
    -w "%{http_code}"
    -X "$method"
    -H "X-Agent-Token: $THINKCENTRE_AGENT_TOKEN"
    -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID"
    -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET"
  )

  if [ -n "$json_body" ]; then
    curl_args+=(-H "Content-Type: application/json" -d "$json_body")
  fi

  local http_code
  http_code=$(curl "${curl_args[@]}" "$url" 2>/dev/null)

  local body
  body=$(cat "$tmp" 2>/dev/null)
  rm -f "$tmp"

  if [[ "$http_code" =~ ^2 ]]; then
    echo "$body"
    return 0
  else
    echo '{"error":"http-error","http_code":'"$http_code"',"body":'"$(echo "$body" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo '""')"'}' >&2
    return 1
  fi
}

# ---------------------------------------------------------------------------
# --self-test mode
# Runs all checks in ≤12s without blocking on cold model loads.
# Output: [OK], [SKIP], or [FAIL] lines for each check.
# ---------------------------------------------------------------------------
_ai_self_test() {
  local all_ok=true

  echo "=== ai-agent-access.sh self-test ==="

  # 1. Secret presence check (no network, instant)
  echo ""
  echo "--- Secret presence ---"

  local horus_config_ok=true
  local ares_config_ok=true
  local tc_config_ok=true

  for var in HORUS_OLLAMA_URL CF_ACCESS_CLIENT_ID CF_ACCESS_CLIENT_SECRET; do
    local val
    val=$(printenv "$var" 2>/dev/null || true)
    if [ "${#val}" -lt 5 ]; then
      echo "[WARN] $var is empty or too short"
      horus_config_ok=false
    else
      echo "[OK]   $var present (${#val} chars)"
    fi
  done

  for var in HORUS_OLLAMA_TOKEN HORUS_OLLAMA_MODEL; do
    local val
    val=$(printenv "$var" 2>/dev/null || true)
    if [ -z "$val" ]; then
      echo "[WARN] $var is empty (optional but expected)"
    else
      echo "[OK]   $var present"
    fi
  done

  for var in DIAG_OLLAMA_URL DIAG_OLLAMA_TOKEN DIAG_OLLAMA_MODEL; do
    local val
    val=$(printenv "$var" 2>/dev/null || true)
    if [ -z "$val" ]; then
      echo "[INFO] $var not set — Ares will be skipped"
      ares_config_ok=false
    else
      echo "[OK]   $var present"
    fi
  done

  for var in THINKCENTRE_METRICS_URL THINKCENTRE_AGENT_TOKEN; do
    local val
    val=$(printenv "$var" 2>/dev/null || true)
    if [ "${#val}" -lt 5 ]; then
      echo "[WARN] $var is empty or too short"
      tc_config_ok=false
    else
      echo "[OK]   $var present (${#val} chars)"
    fi
  done

  # 2. TC reachability check (≤10s)
  echo ""
  echo "--- TC reachability (ai_check_tc, max 10s) ---"

  local tc_status
  tc_status=$(ai_check_tc 2>/dev/null)
  echo "    Status: $tc_status"

  if [ "$tc_status" = "online" ]; then
    echo "[OK]   check_tc"
    local tc_online=true
  else
    echo "[FAIL] check_tc — TC is $tc_status (non-blocking for self-test)"
    all_ok=false
    local tc_online=false
  fi

  # 3. Horus smoke — skip actual LLM call (cold load would exceed 12s budget)
  echo ""
  echo "--- Horus LLM call (smoke only — no actual call to avoid cold load) ---"
  if [ "$horus_config_ok" = "true" ] && [ "$tc_online" = "true" ]; then
    echo "[SKIP] call_horus (smoke only — call ai_call_horus manually to test)"
  elif [ "$horus_config_ok" != "true" ]; then
    echo "[SKIP] call_horus (secrets missing)"
  else
    echo "[SKIP] call_horus (TC offline)"
  fi

  # 4. Ares smoke — skip if secrets not set
  echo ""
  echo "--- Ares LLM call ---"
  if [ "$ares_config_ok" != "true" ]; then
    echo "[SKIP] call_ares (secret not set)"
  else
    echo "[SKIP] call_ares (smoke only — call ai_call_ares manually to test)"
  fi

  # 5. TC agent sys-metrics (≤30s, but usually <2s)
  echo ""
  echo "--- TC agent /sys-metrics ---"
  if [ "$tc_config_ok" != "true" ]; then
    echo "[SKIP] tc_agent /sys-metrics (secrets missing)"
  elif [ "$tc_online" != "true" ]; then
    echo "[SKIP] tc_agent /sys-metrics (TC offline)"
  else
    local health_out
    if health_out=$(ai_call_tc_agent "sys-metrics" 2>/dev/null); then
      echo "[OK]   tc_agent /sys-metrics"
      echo "    Response: $(echo "$health_out" | head -c 120)..."
    else
      echo "[FAIL] tc_agent /sys-metrics"
      all_ok=false
    fi
  fi

  # 6. Unit tests — parser success path + failure contract (no network, <1s each)
  echo ""
  echo "--- Unit tests (success + failure contract) ---"

  # 6a. _ai_parse_ndjson success: valid Ollama NDJSON stream → exit 0, correct text
  local mock_ndjson
  mock_ndjson='{"message":{"content":"Ciao"},"done":false}
{"message":{"content":" mondo"},"done":false}
{"message":{"content":"!"},"done":true}'
  local mock_out
  mock_out=$(echo "$mock_ndjson" | _ai_parse_ndjson)
  local mock_exit=$?
  if [ "$mock_exit" -eq 0 ] && [ "$mock_out" = "Ciao mondo!" ]; then
    echo "[OK]   _ai_parse_ndjson exits 0, text='$mock_out' (success path)"
  else
    echo "[FAIL] _ai_parse_ndjson success path: exit=$mock_exit output='$mock_out'"
    all_ok=false
  fi

  # 6b. _ai_parse_ndjson: think-tag stripping + English leakage strip
  local mock_think
  mock_think='{"message":{"content":"<think>reasoning here</think>"},"done":false}
{"message":{"content":"Risposta vera"},"done":true}'
  mock_out=$(echo "$mock_think" | _ai_parse_ndjson)
  mock_exit=$?
  if [ "$mock_exit" -eq 0 ] && [ "$mock_out" = "Risposta vera" ]; then
    echo "[OK]   _ai_parse_ndjson strips <think> tags correctly"
  else
    echo "[FAIL] _ai_parse_ndjson think-strip: exit=$mock_exit output='$mock_out'"
    all_ok=false
  fi

  # 6c. _ai_parse_ndjson exits 1 on empty input (empty-stream guard)
  local neg_parse_out
  neg_parse_out=$(echo "" | _ai_parse_ndjson 2>/dev/null)
  local neg_parse_exit=$?
  if [ "$neg_parse_exit" -ne 0 ] && [ -z "$neg_parse_out" ]; then
    echo "[OK]   _ai_parse_ndjson exits 1 on empty input"
  else
    echo "[FAIL] _ai_parse_ndjson should exit 1 on empty input; got exit=$neg_parse_exit output='$neg_parse_out'"
    all_ok=false
  fi

  # 6d. _ai_parse_ndjson exits 1 on HTML error page (CF blocked / non-JSON response)
  neg_parse_out=$(echo "<html><body>Access Denied</body></html>" | _ai_parse_ndjson 2>/dev/null)
  neg_parse_exit=$?
  if [ "$neg_parse_exit" -ne 0 ] && [ -z "$neg_parse_out" ]; then
    echo "[OK]   _ai_parse_ndjson exits 1 on HTML (CF error page)"
  else
    echo "[FAIL] _ai_parse_ndjson should exit 1 on HTML; got exit=$neg_parse_exit output='$neg_parse_out'"
    all_ok=false
  fi

  # 6e. ai_check_tc with empty URL → must return "secret-empty" and exit 1
  local saved_url="$HORUS_OLLAMA_URL"
  HORUS_OLLAMA_URL=""
  local neg_status
  neg_status=$(ai_check_tc 2>/dev/null)
  local neg_exit=$?
  HORUS_OLLAMA_URL="$saved_url"
  if [ "$neg_status" = "secret-empty" ] && [ "$neg_exit" -ne 0 ]; then
    echo "[OK]   check_tc exits 1 on missing secret (got: $neg_status)"
  else
    echo "[FAIL] check_tc should exit 1 with secret-empty; got '$neg_status' exit=$neg_exit"
    all_ok=false
  fi

  # 6f. ai_call_horus with unreachable URL → must exit 1 (curl $? check)
  local neg_horus_out
  neg_horus_out=$(HORUS_OLLAMA_URL="https://unreachable.invalid" \
    ai_call_horus "test" 2>/dev/null)
  local neg_horus_exit=$?
  if [ "$neg_horus_exit" -ne 0 ] && [ -z "$neg_horus_out" ]; then
    echo "[OK]   call_horus exits 1 on unreachable URL (exit=$neg_horus_exit)"
  else
    echo "[FAIL] call_horus should exit 1 on unreachable URL; got exit=$neg_horus_exit output='$neg_horus_out'"
    all_ok=false
  fi

  # 6g. ai_call_horus with empty PROMPT → must exit 1 immediately (pre-check)
  neg_horus_out=$(ai_call_horus "" 2>/dev/null)
  neg_horus_exit=$?
  if [ "$neg_horus_exit" -ne 0 ]; then
    echo "[OK]   call_horus exits 1 on empty prompt (exit=$neg_horus_exit)"
  else
    echo "[FAIL] call_horus should exit 1 on empty prompt; got exit=$neg_horus_exit"
    all_ok=false
  fi

  # 6h. ai_call_ares with missing secrets → must exit 1 with no stdout output
  local neg_ares_out
  neg_ares_out=$(DIAG_OLLAMA_URL="" DIAG_OLLAMA_TOKEN="" \
    ai_call_ares "test" 2>/dev/null)
  local neg_ares_exit=$?
  if [ "$neg_ares_exit" -ne 0 ] && [ -z "$neg_ares_out" ]; then
    echo "[OK]   call_ares exits 1 on missing secrets (no stdout, exit=$neg_ares_exit)"
  else
    echo "[FAIL] call_ares should exit 1 with no stdout on missing secrets; got exit=$neg_ares_exit output='$neg_ares_out'"
    all_ok=false
  fi

  echo ""
  echo "=== self-test complete ==="
  if [ "$all_ok" = "true" ]; then
    echo "[PASS] All mandatory checks passed"
    return 0
  else
    echo "[WARN] Some checks failed (see above)"
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Entry point — allow direct execution
# ---------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  case "${1:-}" in
    --self-test)
      _ai_self_test
      ;;
    "")
      echo "Usage: source scripts/ai-agent-access.sh   (to use functions)"
      echo "       bash   scripts/ai-agent-access.sh --self-test"
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: bash scripts/ai-agent-access.sh --self-test"
      exit 1
      ;;
  esac
fi
