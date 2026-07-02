---
name: Date.now mock fragility with vi.resetModules
description: Why call-count-based Date.now() mocks break under vi.resetModules(), and the fix pattern.
---

Mocking `Date.now()` by tracking a call counter (e.g. "1st call = start, 2nd call = end") is fragile whenever a test uses `vi.resetModules()` to force a fresh module import between phases. Third-party libraries with module-scope side effects — e.g. `Bottleneck` instantiated at import time in a rate-limiter module — call `Date.now()` themselves during that fresh import, silently shifting the counter's parity and breaking the mock's assumptions.

**Why:** discovered while fixing `db-collector-antiblip.test.ts` — a `bg-db-limiter` module re-import (triggered by `vi.resetModules()`) called `Date.now()` internally via its `Bottleneck` instance, polluting an even/odd call-count scheme used to fake elapsed time.

**How to apply:** instead of counting calls, drive a controllable clock (`let currentTime = ...`) that only advances when a specific, identifiable operation happens — e.g. when the mocked DB client intercepts a known query like `SELECT 1` (a ping). This decouples the fake clock from incidental `Date.now()` calls made by unrelated module-scope code.

Also: never add `console.log` inside a `Date.now()` spy's mock implementation to debug it — Node's internal `Writable.write` stream machinery can trigger recursive/extra `Date.now()` calls from the console.log itself, corrupting the very call sequence you're trying to observe. Capture a stack trace into a variable instead and inspect it after the test, or avoid instrumenting mid-call.
