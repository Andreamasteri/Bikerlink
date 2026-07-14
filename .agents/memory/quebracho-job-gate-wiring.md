---
name: Quebracho job-gate wiring patterns
description: Durable lessons from wiring ~35+ background loops through the Quebracho AI-coordinator job gate (withJobGate/canRunJob).
---

- **`withJobGate` must be generic over the wrapped function's return type.** A
  non-generic wrapper that always resolves `void` silently breaks every
  caller that consumes the wrapped function's result (e.g. `if (out) log(...)`
  after `await gated()`), with no type error — the discard is not detected by
  the compiler because the original narrow return type still "matches"
  `unknown`/`void` in call sites that don't destructure. Always spot-check
  callers of a job after wrapping, not just the wrapper itself.

- **Queue consumers (BullMQ processors, etc.) should NOT be gated the same
  way as scheduler triggers.** Gating a queue's `process()` callback with an
  on/off registry check risks silently dropping or double-completing jobs
  that were already dequeued. Only gate the scheduler/cron side that decides
  *whether to enqueue/trigger*, leave the consumer ungated.

- **Multi-authority directive state (e.g. admin + two independent AI
  coordinators pausing the same subsystem) needs one persisted slot PER
  issuer**, not one shared slot. A shared "current directive" field lets a
  later issuer's resume silently cancel an earlier issuer's still-active
  pause. Pattern: a `Record<Issuer, Directive | null>` in memory, each
  mirrored to its own persisted key (e.g. `appSetting:<subsystem>:<issuer>`),
  plus a pure `resolveEffectivePauses()`/`pickActiveDirective()` step that
  applies priority (human/admin > automated issuers) and per-issuer
  reachability fallback (an issuer's pause is only effective while that
  issuer's backend is reachable; otherwise log+ignore, don't block forever).

- **Edit-tool "success" is not proof the change persisted**, especially
  across many sequential edits to the same file in one session. When in
  doubt (e.g. resuming work after a gap, or right before writing tests
  against a file), do a fresh read of the actual file content rather than
  trusting the last reported diff.
