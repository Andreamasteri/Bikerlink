---
name: Watchdog collector reset pattern
description: How admin "svuota lista" resets in-process collector state without a server restart
---

# Watchdog collector state reset

The system-health panel showed "sticky" problems because collectors keep in-process
anti-blip counters/latches that only cleared on server restart. `POST /watchdog/reset-state`
(admin route in `ai-watchdog.ts`) zeroes them and regenerates a clean snapshot.

**Convention:** each collector with durable in-process state exports `resetState(): void`
conforming to `ICollectorReset` (`server/ai/watchdog/collector-types.ts`). The endpoint
calls each one, then `runAggregatorCycle()`. When adding a new stateful collector, add
`resetState()` and wire it into the endpoint, or its accumulated state becomes un-clearable
from the UI.

**Non-obvious gotchas:**
- `overload-collector` is *stateless* itself — the sustained-overload counters/latches live in
  `server/db-monitor-history.ts` (`resetSustainedOverloadState()`); the collector delegates.
- `crash-signals-collector` is *stateless* (pure 2h sliding-window SQL); its `resetState()` is a
  documented no-op kept only for interface conformity.
- Anti-race: `runAggregatorCycle` now sets a `cycleInFlight` flag (aggregator.part2, exposed via
  `isAggregatorCycleInFlight()`); the reset endpoint polls it up to 2s so it doesn't zero counters
  mid-read.

**Why:** avoids coupling the endpoint to each collector's internals and keeps "reset" honest
(some collectors have nothing in-process to reset — don't invent state for them).
