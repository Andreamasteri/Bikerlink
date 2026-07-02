---
name: Full vitest run in Replit sandbox
description: Background/detached vitest processes get killed when the spawning bash tool call ends; how to still validate a full suite.
---

In this Replit agent sandbox, `nohup`/`setsid`/`disown`-detached `npx vitest run` (full suite) processes do NOT survive past the end of the bash tool call that spawned them, even with double-fork-style detachment. The process is torn down together with the call's process group, regardless of `disown -a`. This mid-run kill happens silently — the log file just stops growing with no final "Test Files"/"Tests" summary line.

**Why:** confirmed empirically while validating BikerLink test fixes — repeated attempts to background a 157-file vitest run and poll for it in a *separate* subsequent tool call always found the process already dead (`pgrep` empty), whereas polling *within the same* call (a single bash invocation with an internal sleep-loop) let it run for the full duration of that call.

**How to apply:** to validate a large test suite that will not finish within the ~120s single-call ceiling, split file globs into N chunks (e.g. via `ls '*.test.ts' | sort | split -n l/N`) sized so each chunk finishes within ~115s in the foreground (`timeout 115 npx vitest run <files> --reporter=dot > log 2>&1`), then aggregate the per-chunk summaries. Don't rely on detached background runs for anything that must outlive a single tool call.
