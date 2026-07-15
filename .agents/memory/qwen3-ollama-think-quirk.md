---
name: qwen3-via-Ollama think:false quirk
description: qwen3 models on Ollama 0.30.11 don't honor providerOptions think:false — they drop the opening <think> tag but leave an orphan closing </think>, and reasoning eats numPredict budget.
---

Confirmed via raw curl against the ThinkCentre's qwen3:4b (Horus, Ollama
0.30.11): setting `think:false` in the request does NOT suppress chain-of-
thought reasoning text. The opening `<think>` tag disappears but a stray
closing `</think>` tag remains at the end of the reasoning block, right
before the real answer.

**Why:** any naive `content.split(/<think>[\s\S]*?<\/think>/)`-style stripper
does nothing, since there's no matching opening tag to anchor on. Also, the
verbose reasoning consumes the token budget before reaching `</think>`,
truncating the real answer if `numPredict` is too low (700 was not enough for
Horus's consult; 1600 worked reliably).

**How to apply:** any Ollama consult path for a qwen3-family persona needs:
1. A `stripThink()`-style helper that also detects and strips everything up
   to and including an *orphan* `</think>` even without an opening tag (see
   `server/ai/assistant/inter-agent.ts`).
2. Generous `numPredict` headroom for the reasoning phase.
3. Note: the main streaming persona-swap path (agent.ts) still leaks this
   text live to the client because deltas are sent before any stripping can
   happen — tracked as a separate follow-up, not yet fixed.
