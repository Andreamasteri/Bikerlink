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

**qwen3 quirk:** Horus (qwen3) leaves an orphan `</think>` even with think:false → strip it locally before sanitizing. Sanitize order = stripThink → redactPII → drop-if-sensitive.
