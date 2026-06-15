import type { Request } from "express";

// Task #1126: centralized helper that returns the trusted client IP for use
// as a rate-limit key or for persistence in telemetry tables. ALL public
// telemetry endpoints (/api/errors, /api/admin/ota-error,
// /api/admin/client-error, /api/feedback, /api/reports, …) must derive
// their IP via this helper instead of reading `req.headers["x-forwarded-for"]`
// directly.
//
// Why this matters: the raw X-Forwarded-For header is fully attacker-
// controlled. Code that rate-limited on `xff.split(",")[0]` could be defeated
// by rotating the spoofed value across requests, allowing one attacker to
// blow past per-IP caps and flood the operator email transport / poison
// stored telemetry with arbitrary "source" addresses.
//
// `req.ip` is safe in this app because:
//   - server/middleware.ts calls `app.set("trust proxy", true)`, which tells
//     Express to trust all proxy hops in Replit's managed infra. Express then
//     resolves req.ip to the left-most non-trusted (i.e. real client) IP in
//     X-Forwarded-For rather than the raw socket address.
//   - getTrustedClientIp() adds explicit loopback filtering and XFF/X-Real-IP
//     fallbacks for cases where req.ip still resolves to a loopback address
//     due to unusual proxy configurations.
//
// Concentrating the derivation here means a future maintainer who needs the
// client IP can simply call this function instead of reaching for headers,
// and any regression toward raw-header parsing becomes easy to grep for and
// reject in code review.
/** Returns true if the IP looks like a loopback / local address we should skip. */
function isLoopback(ip: string): boolean {
  return (
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("::ffff:127.")
  );
}

/**
 * Extract the first non-loopback IP from a comma-separated X-Forwarded-For
 * value, or return undefined if nothing useful is found.
 */
function firstRealIpFromXff(xff: string | string[] | undefined): string | undefined {
  if (!xff) return undefined;
  const raw = Array.isArray(xff) ? xff.join(",") : xff;
  for (const part of raw.split(",")) {
    const candidate = part.trim();
    if (candidate && !isLoopback(candidate)) return candidate;
  }
  return undefined;
}

export function getTrustedClientIp(req: Request): string | undefined {
  // Primary: req.ip resolved by Express via trust-proxy setting.
  // This is safe as long as trust-proxy is configured correctly.
  const reqIp = (req.ip ?? "").toString().trim();
  if (reqIp && !isLoopback(reqIp)) {
    return reqIp.substring(0, 64);
  }

  // Fallback 1: parse X-Forwarded-For ourselves, picking the first
  // non-loopback entry.  Handles the case where trust-proxy resolves to
  // a loopback due to extra hops in Replit's infra.
  const xffIp = firstRealIpFromXff(req.headers["x-forwarded-for"]);
  if (xffIp) return xffIp.substring(0, 64);

  // Fallback 2: X-Real-IP (set by some Nginx / Replit proxy configs).
  const xRealIp = (req.headers["x-real-ip"] as string | undefined)?.trim();
  if (xRealIp && !isLoopback(xRealIp)) return xRealIp.substring(0, 64);

  // Last resort: raw socket address.
  const socketIp = (req.socket?.remoteAddress ?? "").toString().trim();
  if (socketIp) return socketIp.substring(0, 64);

  return undefined;
}

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

// Tile proxy — authenticated users fetching map tiles through the server-side
// proxy. 500 tiles/min per user comfortably covers aggressive map panning and
// zoom sweeps; 200/min per IP gives a hard ceiling for shared NAT without
// penalising normal households. A scripted sweep of a zoom range would require
// thousands of tiles per minute, so the per-user cap blocks it cleanly.
export const tileProxyRateLimiter = createUserIpRateLimiter({
  maxPerUser: 500,
  maxPerIp: 200,
  windowMs: 60 * 1000,
});

