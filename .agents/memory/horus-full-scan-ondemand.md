---
name: Horus full-app scan (on-demand code+DB analysis / manual)
description: Durable invariants for Horus's two on-demand full-app scans (analysis proposals + manual generation)
---

# Horus full-app scan (on-demand only)

Two on-demand Horus capabilities from one full read of the local codebase + DB structure: **analysis** → actionable proposals, and **manual** generation → Nadir manual storage.

**Rule: never auto/scheduled.** No timer, no boot hook, no scheduler wiring. The batch loop self-reschedules only *after* an explicit start.
**Why:** the plan mandates strictly on-demand; a continuous version is a future option to evaluate only after seeing manual-run impact.
**How to apply:** a grep for the scanner module under schedule/boot/cron/nightly must stay empty.

**Repo layout gotcha (caused a code-review rejection):** this is an Expo app — there is NO `client/` dir. "Full app" = backend (`server`) + shared (`shared`) + the frontend spread across `app/`, `components/`, `hooks/`, `lib/`, `constants/`. Any inventory that scopes to `server/client/shared` silently omits the entire frontend. The inventory is an allowlist of source roots; keep it matching the real layout and covered by a regression test.

**Reuse, don't duplicate:** files read from the LOCAL checkout (not GitHub; excludes `.bikerblog-ref`); DB analysis input = existing db-integrity check summary/violations (same safe source the autonomous analyzer uses); analysis persisted via the SAME dual-write as the existing autonomous analysis; manual saved to Nadir's EXISTING storage (back up prior version before overwrite) + reindex.

**Fingerprinting:** per-file content-hash store in AppSettings JSONB, separate per mode (the stored note differs: observations vs description) → unchanged files skip for free.

**Clean interruption:** if Ollama unreachable mid-scan, stop cleanly; only truly-analyzed files enter the store (persisted after each batch), so a later explicit run re-picks the rest. Resume requires a new explicit request.

**qwen3 quirk:** Horus (qwen3) leaves an orphan `</think>` even with think:false → strip it locally before sanitizing. Sanitize order = stripThink → redactPII → drop-if-sensitive. For longer synthesis/manual prompts it can omit ALL think tags and leak raw reasoning — fixed via a shared `system` tag-contract, see qwen3-ollama-think-quirk.md.

**Model-resolution bug (found+fixed live, 2026-07-15):** both scanner files called `callOllamaChat(..., {persona:"horus"})` with no explicit `model` — per inter-agent-consult-model-mismatch.md, `persona` only picks the endpoint, so every scan call (and the persisted `run.modelId`) silently ran on Bowie's `qwen3:1.7b` instead of Horus's `qwen3:4b`. Fixed with a `HORUS_MODEL_ID` constant passed explicitly on every `callOllamaChat` call in both files. `horus-analyzer.ts` (~line 135, the separate autonomous/scheduled analyzer, not this on-demand scanner) has the same latent bug — not fixed here, flagged as a follow-up.

**Verifying a 2000+ file cold scan without babysitting hours:** a full run is not babysittable in the agent loop (detached background processes die when the spawning shell call returns — tested and confirmed, no real backgrounding survives across tool calls here). Bound each verification call by pre-seeding the fingerprint store (all files hashed with an empty note except N real target files) — this drives the *real* `startHorusScan`/`getHorusScanStatus` loop over a small, real subset. For the **manual** mode specifically, pick target files from a SINGLE `areaOf()` bucket (`horus-scanner-finalize.ts`) — finalize has no per-area checkpoint and writes one section per area sequentially, so spreading targets across many areas can blow past a 300s call budget and force a full restart-from-scratch every retry.
