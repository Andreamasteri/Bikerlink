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

**How to apply — two DIFFERENT strategies depending on streaming:**

1. **Non-streaming consult path** (`inter-agent.ts`, `task-review.ts`): keep
   `think:false` and post-process with a `stripThink()`-style helper that also
   detects and strips everything up to and including an *orphan* `</think>`
   even without an opening tag. Give generous `numPredict` headroom so the
   reasoning phase doesn't truncate the real answer (700 too low, 1600 ok).

2. **Streaming persona path** (`server/ai/assistant/agent.ts`): a post-hoc
   stripper is USELESS here — deltas are sent to the client before any strip
   could run, and the reasoning is 4000+ chars (no early `</think>`), so a
   buffer-till-`</think>` cap would either leak thousands of chars or stall a
   clean answer. **Fix: pass `think:true` (not false) for the qwen3 persona.**
   Ollama then puts reasoning in the separate `thinking` channel; the provider
   `ollama-ai-provider-v2` maps it to **`reasoning-delta` parts of the
   fullStream, NEVER `text-delta` of the textStream**. Since agent.ts consumes
   only `result.textStream`, the reasoning never reaches the user, and the
   answer still streams token-by-token (same perceived latency — the model
   reasons either way, just silently now).
   **Why counter-intuitive:** `think:false` sounds like "no reasoning" but on
   qwen3 it means "reason anyway, dump it into content"; `think:true` means
   "reason into a side channel we can ignore." Verified live 2026-07-15:
   think:true → content=127 clean chars, thinking=4232 chars separate.
   Scoped to Horus in agent.ts; Bowie's streaming stays on think:false.

**Worse case confirmed live (2026-07-15, Horus full-scan verification):** for
longer, more "thoughtful" prompts (Horus's manual-section synthesis), qwen3:4b
reasons in English with **no `<think>`/`</think>` tags at all** — not even the
orphan closing tag. A tag-based stripper can't help here; the raw reasoning
preamble ("Okay, l'utente chiede...") lands directly in the delivered content.
**Fix that works:** don't fight brevity (the user explicitly wants full-depth
reasoning, no rush) — instead give the model an explicit **contract** via
`options.system`: "wrap ALL reasoning in `<think>...</think>`, write ONLY the
final answer after the closing tag" + a generous `numPredict` so the reasoning
has room to finish. Verified: the model still omits the *opening* tag but
reliably emits the *closing* one, which the existing orphan-aware stripThink
handles — output was clean, coherent, non-hallucinated. Applied in
`server/ai/assistant/horus-scanner.ts` / `horus-scanner-finalize.ts` via the
shared `HORUS_THINK_TAG_CONTRACT` constant in `codebase-inventory.ts`.
