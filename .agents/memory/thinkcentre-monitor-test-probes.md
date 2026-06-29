---
name: ThinkCentre monitor test — probe isolation & db mock
description: Why thinkcentre-gh-monitor.test.ts hangs/breaks and how to keep it green when the monitor or its probes change.
---

# ThinkCentre GraphHopper monitor test gotchas

`server/__tests__/thinkcentre-gh-monitor.test.ts` exercises `probeGraphHopperAreas`,
`computeOverallStatus`, and `runThinkCentreProbe` from `server/jobs/thinkcentre-monitor.ts`.
The probe implementations live in `server/jobs/thinkcentre-monitor-probes.ts`; the monitor
must re-export `probeGraphHopperAreas`/`computeOverallStatus`/`OverallStatus` for the test
to import them from the monitor module.

**Why it broke / can break again:**

1. **Probe symbols moved.** When probes are split out, the test imports from the monitor
   but the monitor only re-exported some of them → `X is not a function` (surfaces as
   timeouts under parallel load). Keep the monitor's re-export list in sync.

2. **Rule: TCP probes must never open real sockets under test, and probe env isolation must
   be a single source of truth — not a hand-kept delete list in the test.**
   **Why:** raw `net.createConnection` probes (Postgres/Redis) never settle under
   `vi.useFakeTimers()` (the abort `setTimeout` never fires), so any forgotten env var caused a
   silent 15s hang. HTTP probes are safe (they go through the mocked `global.fetch`).
   **How it's enforced now (so don't reintroduce the old pattern):** the low-level TCP helper
   short-circuits when running under a test runner (VITEST / NODE_ENV==="test"); the env list
   lives next to the probes and the test resets via that one helper + a parity test that fails
   loudly if a probe reads an env var not registered in the list. Adding a probe = register its
   env var next to the probe; never edit the test's isolation by hand.

3. **db mock must match query shapes.** `isThinkCentreOffline` ends its query at `.where()`
   (awaited directly → expects an array, calls `rows.some`), while other helpers chain
   `.where().limit()`. The `where()` mock must be both awaitable-to-`[]` and carry `.limit`:
   `where: () => Object.assign(Promise.resolve([]), { limit: dbLimitMock })`. The `../db` mock
   must also export `withDbRetry` (helpers wrap queries in it); missing it throws
   "No withDbRetry export". Drizzle mock needs `inArray` in addition to `eq`.

**How to apply:** when editing the monitor, its probes, or the offline/ignore/push helpers,
re-run `npx vitest run server/__tests__/thinkcentre-gh-monitor.test.ts` and confirm it
finishes in <1s (not 75s). A multi-second/timeout run = a real socket probe leaked because
an env var wasn't deleted.
