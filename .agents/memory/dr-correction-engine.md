---
name: DR correction engine
description: Architecture + invariants of the deterministic dead-reckoning/GPS correction subsystem (NOT an AI agent).
---

# DR correction engine

Deterministic/statistical correction of dead-reckoning drift. **Not** an LLM/AI agent
and deliberately kept OUT of `server/ai/*` — must never be confused with the
routing-health "Horus" analyzer/proposer/escalation (those are GraphHopper/Valhalla/
Photon health, not physical DR). Named "DR correction engine"; code lives in
`server/dr-correction/`, `shared/dr-correction.ts` (pure math), `shared/db/dr-correction.ts`.

## Core invariants (don't break)
- **Update cadence is split on purpose:** per-user model recomputed in REAL TIME on
  every ingestion batch (cheap median over that user's recent samples); GLOBAL
  aggregate only via a PERIODIC job (~6h, `server/jobs/dr-correction-global.ts`,
  registered in `scheduler.engine.ts` under `withJobGate`). Global exists only to
  bootstrap users with too few samples of their own (`blendWithGlobal`).
- **The DR gap stays RAW (unscaled).** In `useTrackingState` sensors_only block the
  learned `distanceScale` is applied to the LIVE total contribution, but `drGapKmRef`
  accumulates the raw step. Reason: the gap is both (a) what blocks the bridging
  segment on recovery and (b) the ground truth the model learns the true ratio from —
  scaling it would corrupt the learning loop and prevent convergence.
- **No double-count on recovery:** the GPS anchor stays frozen during a blackout AND
  during the multi-fix recovery wait; on confirm the gap is zeroed and the anchor is
  reseeded to the recovery position with NO bridging segment added.
- **2–3 coherent-fix gate before trusting recovery:** the first recovery fix is often
  noisy (tunnel/multipath). Require `RECOVERY_FIXES_REQUIRED` consecutive usable fixes
  whose implied speed between them ≤ `RECOVERY_COHERENCE_MAX_KMH`; a bad fix resets the
  streak. State held in `gps.drRecoveryPendingRef` (snapshot of anchor/drEst/gap/speed).
- **Test users excluded from global:** `is_test` is set SERVER-SIDE on ingestion from
  the user's own flags (`isFake`/`isSystem`/`mapTester`), and the global recompute
  filters `WHERE is_test = false`. Never trust a client-supplied test flag.

## Convergence note
With few samples the effective model is intentionally shrunk toward identity (blends
with global/identity), so early `distanceScale` looks damped (e.g. 1.056 not 1.11 for a
10% under-report). This is correct — it converges toward the true ratio as km/samples
accumulate. Don't "fix" the damping.

## Tables
`dr_deviation_samples` (per-session log, FK user_id→users), `dr_correction_model`
(per-user, userId PK), `dr_correction_global` (singleton id='global'). Migration is
boot-gated via `server/migrate.ts` (not publish-diffed); drizzle indexes must match
the migration exactly or the boot index-drift check fails.

## Raw (per-user model) vs effective (blended) — don't confuse them
`dr_correction_model` and the admin users-list `distanceScale` store the RAW
model computed straight from that user's samples (`computeModelFromSamples`). BUT
`GET /api/telemetry/dr-correction` and the export's `effectiveModel` return
`blendWithGlobal(user, global)` — a smaller/damped value (w = n/(n+K),
K=MIN_SAMPLES_FOR_USER_MODEL=5). Same user shows e.g. 1.10 in the admin list and
~1.06 in the export. Intended; a numeric assertion must target the RIGHT one.

## Verified end-to-end (Task #67)
`server/scripts/verify-dr-correction-e2e.ts` proves the deterministic path:
synthetic route+telemetry (GPS + sensor-only blackout + reacquire) with a KNOWN
injected deviation → real `POST /api/telemetry/batch` + `/dr-deviation` → real
per-user recompute → admin read + export. N identical deviation samples make the
robust median EXACT, so the engine reproduces the injected ratio to ~1e-12.
`is_test` is stamped server-side from `is_fake` and the global job excludes it.
