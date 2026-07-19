# ai-agent-access.sh — Self-test verification result

**Date:** 2026-07-19  
**Task:** #789 — Confirm the canonical ai-agent-access script works end-to-end from a fresh skill session  
**Command:** `bash scripts/ai-agent-access.sh --self-test`  
**Exit code:** 0

## Output

```
=== ai-agent-access.sh self-test ===

--- Secret presence ---
[OK]   HORUS_OLLAMA_URL present (32 chars)
[OK]   CF_ACCESS_CLIENT_ID present (39 chars)
[OK]   CF_ACCESS_CLIENT_SECRET present (64 chars)
[OK]   HORUS_OLLAMA_TOKEN present
[OK]   HORUS_OLLAMA_MODEL present
[INFO] DIAG_OLLAMA_URL not set — Ares will be skipped
[INFO] DIAG_OLLAMA_TOKEN not set — Ares will be skipped
[INFO] DIAG_OLLAMA_MODEL not set — Ares will be skipped
[OK]   THINKCENTRE_METRICS_URL present (25 chars)
[OK]   THINKCENTRE_AGENT_TOKEN present (85 chars)

--- TC reachability (ai_check_tc, max 10s) ---
    Status: online
[OK]   check_tc

--- Horus LLM call (smoke only — no actual call to avoid cold load) ---
[SKIP] call_horus (smoke only — call ai_call_horus manually to test)

--- Ares LLM call ---
[SKIP] call_ares (secret not set)

--- TC agent /sys-metrics ---
[OK]   tc_agent /sys-metrics
    Response: {"cpuTempC":59,"gpuTempC":66,"gpuUtilPct":95,"vramUsedMb":3819,"vramTotalMb":8192,"gpuName":"NVIDIA GeForce GTX 1070",...

--- Unit tests (success + failure contract) ---
[OK]   _ai_parse_ndjson exits 0, text='Ciao mondo!' (success path)
[OK]   _ai_parse_ndjson strips <think> tags correctly
[OK]   _ai_parse_ndjson exits 1 on empty input
[OK]   _ai_parse_ndjson exits 1 on HTML (CF error page)
[OK]   check_tc exits 1 on missing secret (got: secret-empty)
[OK]   call_horus exits 1 on unreachable URL (exit=1)
[OK]   call_horus exits 1 on empty prompt (exit=1)
[OK]   call_ares exits 1 on missing secrets (no stdout, exit=1)

=== self-test complete ===
[PASS] All mandatory checks passed
```

## Notes

- **TC status:** `online` — Horus Ollama reachable via CF tunnel with correct auth headers
- **Ares:** `DIAG_OLLAMA_*` secrets not set in this environment — `[SKIP]` is the correct and documented behaviour (`ai_call_ares` exits 1 with a clear message, no crash)
- **Unit tests:** all 8 unit-test cases passed (NDJSON parser success, think-strip, empty-stream guard, HTML guard, secret-empty guard, unreachable-URL guard, empty-prompt guard, missing-secrets guard)
- **TC agent:** `/sys-metrics` returned a live JSON payload confirming the `ai_call_tc_agent` function works end-to-end

## Relevant files

- `scripts/ai-agent-access.sh` — the script under test
- `.agents/skills/ai-agent-access/SKILL.md` — skill documentation referencing this script
