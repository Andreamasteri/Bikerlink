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

/**
 * A lightweight semaphore that bounds the number of concurrently running async
 * operations server-wide.  Excess callers are queued (FIFO) and resume as slots
 * become available.
 */
export class Semaphore {
  private running = 0;
  private readonly queue: (() => void)[] = [];

  constructor(private readonly max: number) {
    if (max < 1) throw new RangeError(`Semaphore: max must be >= 1, got ${max}`);
  }

  /** Acquire a slot.  Resolves immediately if capacity is available, otherwise waits. */
  acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  /** Release the slot back to the pool, unblocking the next queued waiter if any. */
  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.running--;
    }
  }

  /** Convenience wrapper: acquire → run fn → release (even on error). */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /** Number of requests currently holding a slot. */
  get activeCount(): number {
    return this.running;
  }

  /** Number of requests waiting for a slot. */
  get pendingCount(): number {
    return this.queue.length;
  }
}

/**
 * Global concurrency limit for the heavy match-enrichment routes
 * (/garage-matches, /biker-matches).
 *
 * Override with the MATCH_ENRICHMENT_CONCURRENCY environment variable.
 * Default: 5 simultaneous requests server-wide.
 */
export const MATCH_ENRICHMENT_GLOBAL_LIMIT = (() => {
  const val = parseInt(process.env.MATCH_ENRICHMENT_CONCURRENCY ?? "", 10);
  return isNaN(val) || val < 1 ? 5 : val;
})();

/**
 * Shared semaphore instance used by /garage-matches and /biker-matches routes.
 * At most MATCH_ENRICHMENT_GLOBAL_LIMIT of those handlers will execute their
 * enrichment work concurrently across all connected users.
 */
export const matchEnrichmentSemaphore = new Semaphore(MATCH_ENRICHMENT_GLOBAL_LIMIT);
