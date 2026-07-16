/**
 * Shared admin-auth cache (Task #397).
 *
 * Previously each route file kept its own independent Map, making it
 * impossible to invalidate both caches atomically when an admin's role or
 * status was mutated by another admin.
 *
 * This module is the single source of truth:
 *   • _requireAdmin   (server/routes/admin.ts)
 *   • requireAdmin    (server/routes/more-routes.ts)
 * both delegate here, and any path that suspends or demotes an admin
 * calls invalidateAdminAuthCache(userId) to evict the entry immediately.
 */

const _cache = new Map<string, { user: unknown; expiresAt: number }>();
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
}

/**
 * Immediately evict a user from the admin-auth cache.
 * Call this whenever an admin's role is demoted or their account is
 * suspended/blocked, so the change takes effect on the very next request
 * rather than waiting for the 10-second TTL to expire.
 */
export function invalidateAdminAuthCache(userId: string): void {
  _cache.delete(userId);
}
