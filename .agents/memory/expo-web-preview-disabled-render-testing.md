---
name: Expo web preview disabled — how to verify screen rendering
description: Why browser/Playwright e2e can't verify this app's screens, and the react-test-renderer pattern that substitutes for it.
---

BikerLink's Metro config intentionally serves `/* BikerLink web preview disabled */` for `platform=web` — there is no browser-renderable build of the real UI, and no Detox/device pipeline wired to CI. So any task asking to "confirm a screen renders" or "drive it end-to-end" cannot be done via Playwright/browser automation, and there's no real device available either.

**Substitute verification**: mount the real screen component with `react-test-renderer` inside a real `QueryClientProvider`, mocking only `apiRequest` (`@/lib/query-client`) with response shapes matching the actual Express route contract. This drives real render + React Query + interaction logic, not just the Express route (which unit tests already cover separately).

**How to apply — react-test-renderer + async React Query gotchas:**
- Set `(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true` at the top of the test file, or React silently drops state updates that land outside a synchronous `act()` (e.g. query-resolved re-renders) and the tree stays stuck on initial/undefined data with no error.
- Do NOT await the flush loop *inside* the same `act()` call that creates the renderer — nesting `TestRenderer.create()` and a `for` loop of `await new Promise(r => setTimeout(r, 5))` in one `act()` doesn't flush query state. Call `TestRenderer.create()` in its own `act()`, then run each flush tick as its own separate `await act(async () => { await new Promise(r => setTimeout(r, 5)); })` call (~6 ticks is enough).
- `<Text>{"foo "}{bar}</Text>`-style JSX interpolation produces an **array** of children in the test renderer tree (`["foo ", "bar"]`), not a joined string — flatten with `.map(String).join("")` before doing text assertions, or `typeof children === "string"` checks will always miss them.
