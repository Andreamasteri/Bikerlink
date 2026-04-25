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
 * Thrown by Semaphore.acquire() when the waiting queue has reached its
 * configured maximum depth (maxQueue).  Callers should translate this into an
 * HTTP 503 response so clients can back off and retry.
 */
export class SemaphoreQueueFullError extends Error {
  constructor(max: number) {
    super(`Semaphore queue full (maxQueue=${max})`);
    this.name = "SemaphoreQueueFullError";
  }
}

/**
 * A lightweight semaphore that bounds the number of concurrently running async
 * operations server-wide.  Excess callers are queued (FIFO) and resume as slots
 * become available.
 *
 * @param max      - Maximum number of concurrent executions.
 * @param maxQueue - Optional maximum number of requests allowed to wait in the
 *                   queue.  When the queue is full, acquire() rejects with a
 *                   SemaphoreQueueFullError instead of adding to the queue.
 *                   Defaults to Infinity (unlimited queueing — original behaviour).
 */
export class Semaphore {
  private running = 0;
  private readonly queue: (() => void)[] = [];
  private readonly maxQueue: number;

  constructor(private readonly max: number, options: { maxQueue?: number } = {}) {
    if (max < 1) throw new RangeError(`Semaphore: max must be >= 1, got ${max}`);
    const mq = options.maxQueue ?? Infinity;
    if (typeof mq !== "number" || (isFinite(mq) && (mq < 0 || !Number.isInteger(mq)))) {
      throw new RangeError(`Semaphore: maxQueue must be a non-negative integer or Infinity, got ${mq}`);
    }
    this.maxQueue = mq;
  }

  /** Acquire a slot.  Resolves immediately if capacity is available, otherwise waits.
   *  Throws SemaphoreQueueFullError if the wait queue has reached maxQueue. */
  acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return Promise.resolve();
    }
    if (this.queue.length >= this.maxQueue) {
      return Promise.reject(new SemaphoreQueueFullError(this.maxQueue));
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
 * Maximum number of requests allowed to wait in the match-enrichment queue.
 * When the backlog exceeds this value, new requests are immediately rejected
 * so the route can return HTTP 503.
 *
 * Override with the MATCH_ENRICHMENT_MAX_QUEUE environment variable.
 * Default: Infinity (unlimited queueing — preserves original behaviour).
 */
export const MATCH_ENRICHMENT_MAX_QUEUE = (() => {
  const val = parseInt(process.env.MATCH_ENRICHMENT_MAX_QUEUE ?? "", 10);
  return isNaN(val) || val < 0 ? Infinity : val;
})();

/**
 * Shared semaphore instance used by /garage-matches and /biker-matches routes.
 * At most MATCH_ENRICHMENT_GLOBAL_LIMIT of those handlers will execute their
 * enrichment work concurrently across all connected users.
 * When the queue depth reaches MATCH_ENRICHMENT_MAX_QUEUE, acquire() rejects
 * with SemaphoreQueueFullError so the route can return HTTP 503.
 */
export const matchEnrichmentSemaphore = new Semaphore(
  MATCH_ENRICHMENT_GLOBAL_LIMIT,
  { maxQueue: MATCH_ENRICHMENT_MAX_QUEUE }
);
