---
name: Horus qwen3:4b think:true latency
description: qwen3:4b with think:true reasons for 45–60s before any text-delta on simple prompts; also num_predict expands reasoning proportionally.
---

## Rule
Horus (qwen3:4b, think:true) produces zero visible `text-delta` tokens for 45–60 s on
typical 1:1 chat prompts. All reasoning goes to the `thinking` channel (correct, no leaks),
but users see a blank stream for the full thinking phase.

**Why:** qwen3:4b reasons heavily even on simple prompts (~8000–9700 chars of thinking,
~2000–2500 tokens at ~45 tok/s). With `think:true`, Ollama puts all of this in the
`thinking` channel; agent.ts consumes only `result.textStream` which yields nothing until
reasoning ends.

**num_predict interaction:** num_predict applies to thinking+content combined. If the
reasoning fills the entire budget, content=0. Verified:
- num_predict:1200 → thinking=4658 chars, content=0
- num_predict:2500 → thinking=9895 chars, content=0
- num_predict:4000 + short prompt → thinking=9721 chars, content=377 chars ✓

For test scripts: use short/focused prompts + num_predict ≥ 4000 for Horus tests to
guarantee content after reasoning.

**How to apply:**
- Production backend (no num_predict cap) does generate content correctly after reasoning —
  qwen3:4b eventually finishes thinking and emits text. Follow-up #141 tracks the UX fix
  (surface a "thinking" indicator to the user during the reasoning phase).
- Verification script: `scripts/verify-bowie-horus-think.py` (runs on ThinkCentre via
  background nohup + poll pattern; tc.py SSH timeout is 90s).
- Never use num_predict < 4000 for Horus interactive chat tests.
