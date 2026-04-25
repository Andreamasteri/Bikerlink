/**
 * Default maximum number of concurrent async operations used across the server.
 * Tune this value (or pass a custom limit) if profiling shows DB connection pressure.
 */
export const DEFAULT_CONCURRENCY = 10;

/**
 * Run an array of async factory functions with a bounded concurrency limit,
 * collecting results exactly like Promise.allSettled.
 *
 * @param fns   - Array of zero-argument async factory functions to execute.
 * @param limit - Maximum number of concurrent executions (default: DEFAULT_CONCURRENCY).
 * @throws {RangeError} if limit is less than 1.
 */
export async function allSettledLimited<T>(
  fns: (() => Promise<T>)[],
  limit = DEFAULT_CONCURRENCY
): Promise<PromiseSettledResult<T>[]> {
  if (limit < 1) throw new RangeError(`allSettledLimited: limit must be >= 1, got ${limit}`);
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < fns.length; i += limit) {
    const batch = fns.slice(i, i + limit).map((fn) => fn());
    results.push(...(await Promise.allSettled(batch)));
  }
  return results;
}

/**
 * Run an array of async factory functions with a bounded concurrency limit,
 * collecting results exactly like Promise.all (rejects on first failure).
 *
 * @param fns   - Array of zero-argument async factory functions to execute.
 * @param limit - Maximum number of concurrent executions (default: DEFAULT_CONCURRENCY).
 * @throws {RangeError} if limit is less than 1.
 */
export async function allLimited<T>(
  fns: (() => Promise<T>)[],
  limit = DEFAULT_CONCURRENCY
): Promise<T[]> {
  if (limit < 1) throw new RangeError(`allLimited: limit must be >= 1, got ${limit}`);
  const results: T[] = [];
  for (let i = 0; i < fns.length; i += limit) {
    const batch = fns.slice(i, i + limit).map((fn) => fn());
    results.push(...(await Promise.all(batch)));
  }
  return results;
}
