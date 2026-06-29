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

2. **runAllProbes opens REAL sockets for every configured service.** `runThinkCentreProbe`
   → `runAllProbes` probes Ollama/Whisper/Valhalla/Nominatim/UFW/Redis/Postgres/pgAdmin/
   nginx/UptimeKuma/GH. HTTP probes go through `global.fetch` (mocked), but **TCP probes
   (`probePostgresOk`, `probeRedisOk`) use `net.createConnection` directly — not mocked.**
   In this env `POSTGRES_PROBE_HOST` (etc.) are set, so with `vi.useFakeTimers()` active the
   abort `setTimeout` never fires and the socket promise never settles → **15s timeout/hang.**
   Any test that calls `runThinkCentreProbe` under fake timers MUST `delete` every probe env
   var except the one under test. When a new probe/env var is added to `runAllProbes`, add it
   to the test's `beforeEach` delete list too.

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
