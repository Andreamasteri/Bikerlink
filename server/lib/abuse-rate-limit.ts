// Task #1125: shared in-memory per-user + per-IP rate limit for abuse-prone
// authenticated endpoints.
//
// This is intentionally a tiny in-process token-counter, not an
// express-rate-limit middleware, because:
//   1. The check needs to run AFTER req.session.userId resolves, so a
//      classic IP-only middleware would not key correctly on the user.
//   2. Two routes sharing the same logical quota (e.g. legacy
//      /api/users/:id/report and the new /api/reports) must read & write
//      the same counter, which a route-local middleware does not give us
//      out of the box.
//   3. State per process is acceptable for this app: we only run one
//      backend instance, and on a restart any partial counter resets — at
//      worst an attacker gets one extra burst per restart.
//
// If we ever scale horizontally, swap the Map for a shared store (Redis)
// behind the same `isOverLimit` helper signature.

interface Bucket {
  count: number;
  resetAt: number;
}

export interface UserIpQuota {
  /** Max requests per user-id per `windowMs`. */
  maxPerUser: number;
  /** Max requests per IP per `windowMs`. Use 0 to disable the IP gate. */
  maxPerIp: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface UserIpRateLimiter {
  /** Returns true if the (userId, ip) tuple has exceeded its quota. */
  isOverLimit: (userId: string, ip: string | undefined) => boolean;
}

function check(map: Map<string, Bucket>, key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now > entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (entry.count >= max) return true;
  entry.count++;
  return false;
}

// Probabilistic pruning of expired buckets. Called from inside isOverLimit,
// so it runs lazily on traffic — no setInterval timer to leak across hot
// reloads — and only after the map grows past PRUNE_THRESHOLD so normal
// low-traffic operation has zero overhead. This addresses long-uptime
// memory growth when many distinct attacker IPs / userIds churn through
// the limiter.
const PRUNE_PROBABILITY = 0.01;
const PRUNE_THRESHOLD = 500;
function maybePrune(map: Map<string, Bucket>): void {
  if (map.size < PRUNE_THRESHOLD) return;
  if (Math.random() >= PRUNE_PROBABILITY) return;
  const now = Date.now();
  for (const [k, v] of map) {
    if (now > v.resetAt) map.delete(k);
  }
}

export function createUserIpRateLimiter(quota: UserIpQuota): UserIpRateLimiter {
  const userMap = new Map<string, Bucket>();
  const ipMap = new Map<string, Bucket>();
  return {
    isOverLimit(userId: string, ip: string | undefined): boolean {
      maybePrune(userMap);
      maybePrune(ipMap);
      // Order matters: increment the user counter first so a single client
      // cannot shield a per-IP burst by switching IPs (still bounded by
      // per-user). Both gates are evaluated; either one trips the limit.
      if (check(userMap, userId, quota.maxPerUser, quota.windowMs)) return true;
      if (quota.maxPerIp > 0 && ip && check(ipMap, ip, quota.maxPerIp, quota.windowMs)) return true;
      return false;
    },
  };
}

// Exported singleton for the report flow. Both /api/reports (the new
// route) and the legacy /api/users/:id/report must share this so an
// attacker cannot bypass throttling by switching endpoints.
export const reportRateLimiter = createUserIpRateLimiter({
  maxPerUser: 10,
  maxPerIp: 20,
  windowMs: 60 * 60 * 1000,
});

// Exported singleton for the feedback flow. Per-user quota is tighter
// than reports because every accepted ticket triggers an outbound email
// from the shared Gmail transporter (which also powers password reset
// and email verification). Per-IP quota is larger to avoid penalising
// shared NAT (cafés, schools) more than necessary while still giving a
// hard ceiling for scripted abuse from a single host.
export const feedbackRateLimiter = createUserIpRateLimiter({
  maxPerUser: 5,
  maxPerIp: 15,
  windowMs: 60 * 60 * 1000,
});
