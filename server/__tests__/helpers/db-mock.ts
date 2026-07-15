/**
 * Shared, opt-in db-mock factory for `server/__tests__` suites.
 *
 * ## Why this exists
 * Every suite hand-rolls its own `vi.mock("../db", …)` factory. When a route
 * changes HOW it touches the DB — wraps a call in `withDbRetry(...)`, switches to
 * `db.selectDistinctOn(...)`, or adds an extra `db.execute()` — each per-file
 * mock drifts and the suite fails with 500s / TypeErrors that look like product
 * bugs but are pure mock drift. Real backend regressions can then hide behind
 * them. See `.agents/memory/test-db-mock-and-static-scan-drift.md`.
 *
 * This helper centralizes the common `../db` surface so a future DB-shape change
 * needs ONE edit here, not N edits across suites that opt in.
 *
 * ## How to use it (hoisting-safe)
 * `vi.mock(...)` is hoisted above imports, so a top-level `import` of this helper
 * is NOT visible inside a sync factory. Use an **async factory with a dynamic
 * import** — the import resolves lazily when `../db` is first loaded, after
 * hoisting is done:
 *
 * ```ts
 * vi.mock("../db", async () => {
 *   const { createDbMock } = await import("./helpers/db-mock");
 *   return createDbMock();
 * });
 * ```
 *
 * Override any top-level export or specific `db` method as needed:
 *
 * ```ts
 * vi.mock("../db", async () => {
 *   const { createDbMock } = await import("./helpers/db-mock");
 *   return createDbMock({
 *     db: { execute: myControlledExecuteMock },      // override one db method
 *     isPoolHealthy: () => false,                    // override a top-level export
 *   });
 * });
 * ```
 *
 * Suites that must exercise the REAL `withDbRetry`/`isTransientDbError` (e.g. the
 * retry-resilience tests) should keep using `importOriginal` and NOT adopt this
 * helper — it intentionally provides a passthrough `withDbRetry`.
 */
import { vi } from "vitest";

/**
 * A query-builder stub that is BOTH chainable and thenable.
 *
 * - Any method access (`.from`, `.where`, `.innerJoin`, `.leftJoin`, `.orderBy`,
 *   `.limit`, `.groupBy`, `.values`, `.set`, `.onConflictDoUpdate`, `.returning`,
 *   …) returns the same builder, so arbitrarily long chains never throw
 *   "undefined is not a function" when a route adds a link the mock didn't
 *   anticipate.
 * - Awaiting the builder at ANY point resolves to `rows` (default `[]`). This
 *   covers both terminal-op chains (`await db.select().from(...).limit(1)`) and
 *   directly-awaited chains (`await db.select().from(...).where(...)`).
 *
 * Pass `rows` to make a chain resolve to specific data.
 */
export type QueryBuilder = PromiseLike<unknown[]> &
  Record<string, (...args: unknown[]) => unknown>;

export function createQueryBuilder(rows: unknown[] = []): QueryBuilder {
  const settle = (): Promise<unknown[]> => Promise.resolve(rows);
  const builder = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (
            onFulfilled?: (value: unknown[]) => unknown,
            onRejected?: (reason: unknown) => unknown,
          ) => settle().then(onFulfilled, onRejected);
        }
        if (prop === "catch") {
          return (onRejected?: (reason: unknown) => unknown) =>
            settle().catch(onRejected);
        }
        if (prop === "finally") {
          return (onFinally?: () => void) => settle().finally(onFinally);
        }
        // Symbols (e.g. Symbol.toPrimitive) — behave as a plain object.
        if (typeof prop === "symbol") return undefined;
        // Any other property is treated as a chainable builder method.
        return () => builder;
      },
    },
  ) as QueryBuilder;
  return builder;
}

/**
 * A transaction stub passed to the callback of `db.transaction(fn)`. Exposes the
 * same chainable/thenable builder surface as the top-level `db` object plus an
 * `execute` that resolves to `{ rows: [] }`.
 */
export function createTxMock(): Record<string, unknown> {
  return {
    select: vi.fn(() => createQueryBuilder()),
    selectDistinct: vi.fn(() => createQueryBuilder()),
    selectDistinctOn: vi.fn(() => createQueryBuilder()),
    insert: vi.fn(() => createQueryBuilder()),
    update: vi.fn(() => createQueryBuilder()),
    delete: vi.fn(() => createQueryBuilder()),
    execute: vi.fn(async () => ({ rows: [] })),
  };
}

/** The default chainable/thenable `db` object surface. */
export function createDbObjectMock(): Record<string, unknown> {
  return {
    select: vi.fn(() => createQueryBuilder()),
    selectDistinct: vi.fn(() => createQueryBuilder()),
    selectDistinctOn: vi.fn(() => createQueryBuilder()),
    insert: vi.fn(() => createQueryBuilder()),
    update: vi.fn(() => createQueryBuilder()),
    delete: vi.fn(() => createQueryBuilder()),
    // execute() resolves to a pg-style result; the safe default `{ rows: [] }`
    // prevents `.rows` reads from crashing on `undefined` for un-primed calls.
    execute: vi.fn(async () => ({ rows: [] })),
    transaction: vi.fn(
      async (fn: (tx: Record<string, unknown>) => unknown) => fn(createTxMock()),
    ),
  };
}

/** A minimal `pg.Pool` stand-in with the counters/methods suites read. */
export function createPoolMock(): Record<string, unknown> {
  return {
    query: vi.fn(async () => ({ rows: [] })),
    connect: vi.fn(),
    end: vi.fn(async () => {}),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
}

export interface DbMockOptions {
  /** Overrides merged into the default `db` object (per-method). */
  db?: Record<string, unknown>;
  /** Any other top-level `../db` exports to override (e.g. `pool`, `isPoolHealthy`). */
  [key: string]: unknown;
}

/**
 * Build the mocked `../db` module object. Spread its result (or return it
 * directly) from an async `vi.mock("../db", …)` factory. See the file header for
 * the hoisting-safe usage pattern.
 *
 * Defaults cover the common surface:
 * - `db.{select,selectDistinct,selectDistinctOn,insert,update,delete}` →
 *   chainable + thenable builders resolving to `[]`.
 * - `db.execute` → resolves `{ rows: [] }`.
 * - `db.transaction(fn)` → calls `fn(tx)` with a tx stub.
 * - `withDbRetry` → passthrough `(fn) => fn()`.
 * - `pool` → counter/method stub; `isPoolHealthy` → `() => true`.
 */
export function createDbMock(options: DbMockOptions = {}): Record<string, unknown> {
  const { db: dbOverrides, ...moduleOverrides } = options;
  const baseDb = createDbObjectMock();
  const base: Record<string, unknown> = {
    db: baseDb,
    pool: createPoolMock(),
    // Passthrough: the retry wrapper must only run the wrapped fn in tests.
    withDbRetry: <T>(fn: () => Promise<T> | T): Promise<T> | T => fn(),
    isPoolHealthy: vi.fn(() => true),
  };
  return {
    ...base,
    ...moduleOverrides,
    db: { ...baseDb, ...(dbOverrides ?? {}) },
  };
}
