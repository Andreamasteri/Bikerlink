---
name: Watchdog recovery/all-clear alert gate
description: Why an "all-clear" push must be latched to a real start alert, not read from raw snapshot metrics.
---

# Recovery ("rientrato"/all-clear) pushes must be gated on a real start alert

**Rule:** in `server/ai/watchdog/alerts.ts`, an overload *recovery* push (`db.db.overload_recovered` / `app.backend.overload_recovered`, read from `snap.metrics`) must fire ONLY if the corresponding *start* alert was actually emitted. Use a module-level latch armed in the sustained-start block and consumed when the recovery push fires.

**Why:** start alerts for outage-downstream problems (`db.db.overload_sustained`, `app.backend.overload_sustained`, in `OUTAGE_DOWNSTREAM_IDS`) are demoted high→warn by `suppressDownstreamWhenPoweredOff` when the ThinkCentre is powered off, so no start push goes out. The recovery path reads raw metrics and bypasses that suppression, so an admin could get a "✅ rientrato" for an overload they were never warned about — confusing during a TC outage.

**How to apply:** arm the latch inside the `if (dbOverloadProblem)` / `if (backendOverloadProblem)` block (which only matches severity "high", i.e. NOT suppressed), not inside `shouldSend` (so it re-arms even when the start push is throttled). Consume the latch (set false) when the recovery push actually fires. Reset both latches in `_resetThrottleForTests`. Any future "recovered/all-clear" signal that reads raw snapshot metrics needs the same latch pattern, or it re-introduces the phantom all-clear.
