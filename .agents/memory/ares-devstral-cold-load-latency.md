---
name: Ares/devstral cold-load latency
description: askAres against devstral:latest (14GB, CPU-bound) takes 55-170s to cold-load and answer; timeout must have wide margin above 90s.
---

Live-tested (Task #56): `askAres` (server/ai/assistant/inter-agent.ts) calling
`devstral:latest` (14GB, CPU-bound) on the Ollama endpoint took anywhere from
~55s to ~122s to cold-load and produce an answer, with one run landing right
at the original 90s timeout and aborting.

**Why:** devstral is large and runs on CPU (no dedicated GPU reservation like
the smaller personas); latency varies a lot run to run depending on whether
the model is already resident.

**How to apply:** `ARES_TIMEOUT_MS` was raised to 170_000 (170s). This is
acceptable because the Ares consult is rare, on-demand, admin-only, and the
UI announces the wait — don't shrink it back toward 90s without re-measuring
on live hardware. `ARES_OLLAMA_URL` currently resolves to the same TC
hostname as Bowie/Horus's Ollama endpoint (not a separate physical Ares box)
— double-check this isn't just a temporary override before trusting older
notes about Ares being on distinct hardware.
