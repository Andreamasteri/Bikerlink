---
name: Quebracho coordinator gate
description: canRunJob gate semantics + deterministic fallback for the Quebracho background-job control-plane
---

# Quebracho coordinator control-plane (gate + registry + serial loop)

Base control-plane built in `server/ai/coordinator/`: `job-registry.ts` (in-memory
map = live truth, `ai_coordinator_jobs` table = persistence across restart),
`job-gate.ts` (`canRunJob`), `quebracho-loop.ts` (serial continuous supervisor).

## Rules (the non-obvious decisions)

- **`canRunJob(name)` never throws and never blocks a job forever.** On any internal
  error (e.g. AppSetting read blip for the kill-switch) it **fails open** (allows).
  The kill-switch is rare; a transient DB error must not freeze all background work.

- **Fallback = "who issued the pause".** Directives carry `issuedBy`:
  `admin_manual` pauses/throttles are **always** respected; `quebracho` (AI) pauses
  are **ignored** when Quebracho is unreachable (`isQuebrachoUnreachable()` =
  TC offline OR `isQuebrachoReachable()` false). Same for the existing AI pause layer
  (`isAiPaused`). This mirrors matching-coordinator's `admin_manual`-never-bypassed rule.

- **Critical jobs skip the health check.** A job registered `{ critical: true }` is
  NOT deferred when `isPoolHealthy()` is false; non-critical jobs are.

- **`force` is a one-shot.** It scavenges past a pause exactly once (consumed on the
  next allowing decision), it does NOT clear the directive.

- **`/api/health` coordinator field is purely informative.** It does NOT feed the
  health-arbiter and does NOT change `status`/`degraded` — a coordinator offline must
  not degrade the backend (the fallback is deterministic). Exposed via a **sync**
  `getCoordinatorHealthSummary()` (no await/probe in the health hot-path); reachability
  is a cached value refreshed once per loop round.

## Scope boundary
Task #5 built ONLY the control-plane. Wiring the ~26 real background loops through
`canRunJob` / registering them with `run` callbacks is Task #9 (Quebracho b); the
4-AI monitor / escalation / VRAM arbiter is Task #10 (Quebracho c). Until #9, the
serial loop iterates a registry with no `run` callbacks → harmless no-op round.
