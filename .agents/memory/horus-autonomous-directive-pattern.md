---
name: Horus autonomous directive pattern
description: How Horus was given its own pause authority in the coordinator job-registry/gate, mirroring Quebracho's fallback contract.
---

Horus is a full `DirectiveIssuer`/`PauseSource` (`server/ai/coordinator/job-registry.ts`), on par with `quebracho`/`admin_manual`. The gate (`job-gate.ts`) only *honors* a Horus-issued pause/throttle when `isHorusUnreachable()` says Horus's backing service (self-hosted Ollama, persona "horus") is up — same fallback contract as Quebracho, so a stuck pause can't survive Horus going offline. Admin pauses are always honored regardless.

`escalateFinding` (`server/ai/coordinator/escalation.ts`) can turn a severe (`status:"error"`), repeated (in-memory counter, default 3x/24h) finding into a real `applyJobDirective(job, "pause", ..., "horus")` call — decoupled from whether the Horus LLM assessment call itself succeeds (the pause decision is deterministic; only the *reason text* uses the LLM if available). This wiring exists but is currently dormant: no guard in `guards.ts` sets `affectedJob`/`status:"error"` yet (see follow-up task).

**Why:** the whole point of "Horus acts without waiting on an admin" is that the *decision to escalate* must not depend on a live LLM call succeeding — only the *gate's decision to honor it later* depends on Horus's reachability at execution time.

**How to apply:** when wiring a new guard/monitor to auto-pause its own job, pass `affectedJob: "<withJobGate name>"` and `status: "error"` to `escalateFinding`; don't invent a new pause path.

A parallel, independent implementation of the same "horus" DirectiveIssuer pattern already existed in `server/matching/coordinator.ts` (the matching coordinator, unrelated to the generic job-registry) before this — it uses the identical contract, so keep the two consistent if either changes.
