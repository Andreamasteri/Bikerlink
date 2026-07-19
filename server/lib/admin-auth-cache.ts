/**
 * Shared admin-auth cache (Task #397).
 *
 * Previously each route file kept its own independent Map, making it
 * impossible to invalidate both caches atomically when an admin's role or
 * status was mutated by another admin.
 *
 * This module is the single source of truth:
 *   • _requireAdmin   (server/routes.ts)
 *   • requireAdmin    (server/routes/more-routes.ts)
 * both delegate here, and any path that suspends or demotes an admin
 * calls invalidateAdminAuthCache(userId) to evict the entry immediately.
 *
 * In-flight deduplication (Task #770)
 * ------------------------------------
 * The cache alone is not enough when N parallel requests arrive for the
 * same userId within the same ~50 ms window (e.g. the admin panel opens
 * five components that all poll /api/admin/uptime at the same time).
 * All N requests see a cold cache, each launches a SELECT users query,
 * and the DB receives N identical queries — a "cache stampede".
 *
 * `getOrFetchAdminCached` eliminates this by keeping a secondary
 * Map<userId, Promise<unknown | null>> for in-flight lookups.  The second
 * (and third, …) concurrent request for the same userId attaches to the
 * already-running Promise instead of issuing its own DB query.
 */

const _cache = new Map<string, { user: unknown; expiresAt: number }>();
const _inflight = new Map<string, Promise<unknown | null>>();
const ADMIN_CACHE_TTL_MS = 10_000;

export function getAdminCached(userId: string): unknown | null {
  const entry = _cache.get(userId);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.user;
  }
  return null;
}

export function setAdminCached(userId: string, user: unknown): void {
  _cache.set(userId, { user, expiresAt: Date.now() + ADMIN_CACHE_TTL_MS });
}

export function deleteAdminCached(userId: string): void {
  _cache.delete(userId);
  _inflight.delete(userId);
}

/**
 * Immediately evict a user from the admin-auth cache.
 * Call this whenever an admin's role is demoted or their account is
 * suspended/blocked, so the change takes effect on the very next request
 * rather than waiting for the 10-second TTL to expire.
 * Also cancels any in-flight deduplication entry so the next request
 * issues a fresh DB query.
 */
export function invalidateAdminAuthCache(userId: string): void {
  _cache.delete(userId);
  _inflight.delete(userId);
}

/**
 * Deduplicating admin lookup.
 *
 * Fast path  — cache hit: returns the cached user synchronously (wrapped).
 * Dedup path — in-flight: attaches to the already-running Promise.
 * Slow path  — cold: calls `fetchFn`, registers the Promise, populates the
 *              cache on success, removes the in-flight entry either way.
 *
 * `fetchFn` must return the user object on success, or `null` when the user
 * does not exist / is not an admin.  Returning null does NOT populate the
 * cache (the next request will retry the DB).
 */
export async function getOrFetchAdminCached(
  userId: string,
  fetchFn: () => Promise<unknown | null>,
): Promise<unknown | null> {
  // Fast path: valid cache entry.
  const cached = getAdminCached(userId);
  if (cached !== null) return cached;

  // Dedup path: a concurrent request is already fetching this userId.
  const existing = _inflight.get(userId);
  if (existing) return existing;

  // Slow path: issue the DB query and register the Promise so concurrent
  // requests can attach to it.
  const promise = fetchFn()
    .then((user) => {
      _inflight.delete(userId);
      if (user !== null) {
        setAdminCached(userId, user);
      }
      return user;
    })
    .catch((err: unknown) => {
      _inflight.delete(userId);
      throw err;
    });

  _inflight.set(userId, promise);
  return promise;
}
