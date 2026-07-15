---
name: Test DB-mock & static-scan drift
description: Why server/__tests__ suites silently rot when db.ts / route DB-access shape changes or the 600-line ratchet splits files, and how to fix each drift class.
---

# Test DB-mock & static-scan drift

The `server/__tests__` suites use **per-file hand-rolled** `vi.mock("../db", …)`
factories — there is **no shared db-mock helper** (extracting one was considered
and rejected: too much structural variance between suites + `vi.mock` hoisting
friction makes a shared factory the higher-risk choice). Consequence: whenever a
route changes how it touches the DB, the matching mock must be updated by hand,
one file at a time. Failing suites then show 500s / TypeErrors that look like
product bugs but are pure mock drift → real regressions can hide behind them.

**Why:** a full `vitest run` after a big migration surfaced ~40 failing tests
across ~18 files, all mock/test drift (routes evolved, mocks didn't).

## Drift class 1 — missing DB method / wrapper on the `../db` mock
- Route now calls `db.selectDistinctOn(...)` → add it to the mock as a chainable
  (from/innerJoin/where return `this`; the terminal `orderBy`/`limit` resolves
  `[]`). If the route `await`s the chain directly, make the chain **thenable**
  (`.then` resolves `[]`).
- Route now wraps calls in `withDbRetry(...)` (see `db-background-resilience.md`)
  → export `withDbRetry` from the mock as a **passthrough** `(fn) => fn()`.
- Route makes MORE `db.execute()` calls than the test primes (e.g. a new
  zero-match COUNT added before the users SELECT): set a robust default
  `mockResolvedValue({ rows: [] })` for trailing calls AND add the extra
  `mockResolvedValueOnce` in the route's real call order. A per-test
  `mockReset()` wipes the default → later `.rows` reads crash on `undefined`.

## Drift class 2 — static source-scan tests break on 600-line ratchet splits
- A test that `readFileSync`s a route by path and asserts a pattern (e.g. "≥3
  ILIKE mentions") must follow the code when the ratchet moves it into a split
  file (`users.next.ts` → `users.next-match-summary.ts`). Update the path.
- The matching protection-filter guard (`matching-protection-coverage.test.ts`)
  flags every `run-*.ts` not importing `./protection-filter` and not in
  `REVIEWED_EXEMPT`. Ratchet splits create `run-<x>.part2.ts` continuations that
  don't re-import the filter → add them to `REVIEWED_EXEMPT` **only when** the
  parent is already exempt and the split uses the same storage-guarded methods
  (no direct `users.nickname` SQL). Do NOT blanket-exempt a split of a file that
  genuinely needs the filter — that would mask a protected-account leak.

## Not mock drift — flag separately
- Importing a storage class in isolation (e.g. `MapStorage` from `../storage/map`)
  can trip a latent **source-level circular dependency** (map → users →
  biker-matches → matching → contest → `extends MapStorage`) → "Class extends
  undefined". A test-only mock can't fix it because the inheritance chain needs
  the real base class; it needs source decoupling. Leave the test as-found + flag.
- AI provider-chain wording changes (429 "…servizi AI…saturi", generic 503 with
  no provider) are intentional behavioral changes, not DB drift — update the
  stale assertion (status code stays correct), don't chase a "bug".
