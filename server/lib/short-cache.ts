/**
 * Shared short-lived in-process cache with stampede protection.
 *
 * `withShortCache` is the single canonical implementation for all admin
 * routes that need short-TTL caching on frequently-polled endpoints
 * (server-metrics, server-logs, uptime crash-count, …).
 *
 * Stampede protection
 * -------------------
 * When N parallel requests all arrive while the cache is cold, only the
 * first one executes fn(); the rest attach to the already-running Promise
 * instead of each issuing their own query/syscall.  This is the same
 * pattern used in admin-auth-cache (getOrFetchAdminCached) and resolves
 * the cache stampede that caused 26 Sentry events on /api/admin/uptime.
 */

const _shortCache = new Map<string, { value: unknown; expiresAt: number }>();
const _shortCacheInflight = new Map<string, Promise<unknown>>();

/**
 * Return a cached value for `key` if still within `ttlMs`, otherwise call
 * `fn()` once (even under concurrent load) and cache the result.
 */
export async function withShortCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  // Fast path: cache valida.
  const cached = _shortCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }
  // Dedup path: una richiesta parallela sta già eseguendo fn().
  const inflight = _shortCacheInflight.get(key);
  if (inflight) return inflight as Promise<T>;
  // Slow path: esegui fn(), popola la cache, rimuovi l'in-flight.
  const promise = fn()
    .then((value) => {
      _shortCacheInflight.delete(key);
      _shortCache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((err: unknown) => {
      _shortCacheInflight.delete(key);
      throw err;
    });
  _shortCacheInflight.set(key, promise as Promise<unknown>);
  return promise;
}

/**
 * Evict a specific key from both the value cache and the in-flight map.
 * Primarily useful in tests to reset state between cases.
 */
export function clearShortCache(key: string): void {
  _shortCache.delete(key);
  _shortCacheInflight.delete(key);
}
