import Redlock, { type Lock } from "redlock";
import { getRawRedis, isRedisAvailable } from "./redis";

/**
 * Distributed matching lock (Task #2517).
 *
 * Replaces the in-process `isMatchingRunning` boolean with a Redlock-backed
 * distributed lock so multiple backend instances can't run overlapping cycles.
 * Falls back transparently to an in-memory lock when DragonflyDB is unavailable —
 * single-instance deployments keep working unchanged. Backed by DragonflyDB
 * (drop-in Redis-protocol compatible, Task #5244): Redlock works unchanged.
 */

const LOCK_KEY = "bl:lock:matching";
const LOCK_OWNER_KEY = "bl:lock:matching:owner";
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes — covers a long cycle, auto-expires if instance dies.

type Holder = {
  owner: string;
  acquiredAt: number;
  expiresAt: number;
  source: "dragonfly" | "memory";
};

const HISTORY_MAX = 10;
const history: Array<{ event: "acquired" | "released" | "expired" | "rejected"; at: string; owner: string; source: string; reason?: string; ttlMs?: number }> = [];

let memoryLockHeld = false;
let memoryLockHolder: Holder | null = null;
let lastHolder: Holder | null = null;

let redlock: Redlock | null = null;

function pushHistory(entry: { event: "acquired" | "released" | "expired" | "rejected"; owner: string; source: string; reason?: string; ttlMs?: number }) {
  history.push({ at: new Date().toISOString(), ...entry });
  if (history.length > HISTORY_MAX) history.shift();
}

function getRedlock(): Redlock | null {
  if (redlock) return redlock;
  const client = getRawRedis();
  if (!client) return null;
  try {
    redlock = new Redlock([client], {
      driftFactor: 0.01,
      retryCount: 0, // No retry: caller decides what to do when busy.
      retryDelay: 200,
      retryJitter: 100,
      automaticExtensionThreshold: 500,
    });
    redlock.on("error", (err: unknown) => {
      console.warn("[matching-lock] redlock error:", err instanceof Error ? err.message : err);
    });
    return redlock;
  } catch (err) {
    console.warn("[matching-lock] failed to init redlock:", err instanceof Error ? err.message : err);
    return null;
  }
}

export type LockResult<T> =
  | { acquired: true; result: T; source: "dragonfly" | "memory" }
  | { acquired: false; reason: string };

export async function withMatchingLock<T>(
  owner: string,
  fn: () => Promise<T>,
): Promise<LockResult<T>> {
  const useRedis = isRedisAvailable();
  const rl = useRedis ? getRedlock() : null;

  if (rl) {
    let lock: Lock;
    try {
      lock = await rl.acquire([LOCK_KEY], LOCK_TTL_MS);
    } catch (_err) {
      pushHistory({ event: "rejected", owner, source: "dragonfly", reason: "already_held" });
      return { acquired: false, reason: "already_running" };
    }
    const holder: Holder = {
      owner,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + LOCK_TTL_MS,
      source: "dragonfly",
    };
    memoryLockHolder = holder;
    lastHolder = holder;
    // Persist holder metadata in DragonflyDB so other instances can read it via
    // getMatchingLockStatus(). Mirrors lock TTL so it auto-expires.
    const rawClient = getRawRedis();
    if (rawClient) {
      try {
        await rawClient.set(
          LOCK_OWNER_KEY,
          JSON.stringify({ owner, acquiredAt: holder.acquiredAt, expiresAt: holder.expiresAt, pid: process.pid }),
          "PX",
          LOCK_TTL_MS,
        );
      } catch { /* best-effort */ }
    }
    pushHistory({ event: "acquired", owner, source: "dragonfly", ttlMs: LOCK_TTL_MS });
    try {
      const result = await fn();
      return { acquired: true, result, source: "dragonfly" };
    } finally {
      const ttlResidualMs = Math.max(0, holder.expiresAt - Date.now());
      try {
        await lock.release();
        pushHistory({ event: "released", owner, source: "dragonfly", ttlMs: ttlResidualMs });
      } catch (err: unknown) {
        pushHistory({ event: "expired", owner, source: "dragonfly", ttlMs: ttlResidualMs, reason: err instanceof Error ? err.message : String(err) });
      }
      memoryLockHolder = null;
      if (rawClient) {
        rawClient.del(LOCK_OWNER_KEY).catch(() => { /* ignore */ });
      }
    }
  }

  // In-memory fallback (single-instance mode).
  if (memoryLockHeld) {
    // Auto-recover stale lock: if the TTL has elapsed the previous holder never
    // released (e.g. an unhandled throw outside the try/finally), release it
    // now instead of permanently blocking new acquisitions until process restart.
    if (memoryLockHolder && memoryLockHolder.expiresAt < Date.now()) {
      console.warn(
        `[matching-lock] In-memory lock stale (owner=${memoryLockHolder.owner}, expired=${new Date(memoryLockHolder.expiresAt).toISOString()}) — auto-releasing and allowing new acquisition`
      );
      pushHistory({ event: "expired", owner: memoryLockHolder.owner, source: "memory", reason: "lock_force_expired" });
      memoryLockHeld = false;
      memoryLockHolder = null;
      // Fall through to acquire the lock below.
    } else {
      pushHistory({ event: "rejected", owner, source: "memory", reason: "already_held" });
      return { acquired: false, reason: "already_running" };
    }
  }
  memoryLockHeld = true;
  const holder: Holder = {
    owner,
    acquiredAt: Date.now(),
    expiresAt: Date.now() + LOCK_TTL_MS,
    source: "memory",
  };
  memoryLockHolder = holder;
  lastHolder = holder;
  pushHistory({ event: "acquired", owner, source: "memory", ttlMs: LOCK_TTL_MS });
  if (!useRedis) {
    console.warn("[matching-lock] DragonflyDB not available — using in-memory lock fallback");
  }
  try {
    const result = await fn();
    return { acquired: true, result, source: "memory" };
  } finally {
    const ttlResidualMs = Math.max(0, holder.expiresAt - Date.now());
    memoryLockHeld = false;
    memoryLockHolder = null;
    pushHistory({ event: "released", owner, source: "memory", ttlMs: ttlResidualMs });
  }
}

export function forceUnlockMatchingLock(): { wasHeld: boolean; holder: Holder | null } {
  const wasHeld = memoryLockHeld || !!memoryLockHolder;
  const holder = memoryLockHolder;
  const ttlResidualMs = holder ? Math.max(0, holder.expiresAt - Date.now()) : undefined;
  memoryLockHeld = false;
  memoryLockHolder = null;
  pushHistory({ event: "released", owner: holder?.owner ?? "force", source: holder?.source ?? "memory", reason: "force_unlock", ttlMs: ttlResidualMs });
  // Best-effort DragonflyDB release.
  const r = getRawRedis();
  if (r) {
    r.del(LOCK_KEY).catch(() => { /* ignore */ });
    r.del(LOCK_OWNER_KEY).catch(() => { /* ignore */ });
  }
  return { wasHeld, holder };
}

export async function getMatchingLockStatus() {
  const r = getRawRedis();
  let redisLock: { exists: boolean; ttlSeconds: number | null; remoteHolder: unknown } = { exists: false, ttlSeconds: null, remoteHolder: null };
  if (r) {
    try {
      const ttl = await r.pttl(LOCK_KEY);
      let remoteHolder: unknown = null;
      try {
        const raw = await r.get(LOCK_OWNER_KEY);
        if (raw) remoteHolder = JSON.parse(raw);
      } catch { /* ignore */ }
      redisLock = {
        exists: ttl > 0,
        ttlSeconds: ttl > 0 ? Math.ceil(ttl / 1000) : null,
        remoteHolder,
      };
    } catch {
      /* ignore */
    }
  }
  const currentHolder = memoryLockHolder;
  return {
    active: !!currentHolder || redisLock.exists,
    holder: currentHolder
      ? {
          owner: currentHolder.owner,
          source: currentHolder.source,
          acquiredAt: new Date(currentHolder.acquiredAt).toISOString(),
          expiresAt: new Date(currentHolder.expiresAt).toISOString(),
          elapsedMs: Date.now() - currentHolder.acquiredAt,
        }
      : null,
    lastHolder: lastHolder
      ? {
          owner: lastHolder.owner,
          source: lastHolder.source,
          acquiredAt: new Date(lastHolder.acquiredAt).toISOString(),
        }
      : null,
    redis: {
      available: isRedisAvailable(),
      lockKey: LOCK_KEY,
      ...redisLock,
    },
    history: [...history],
  };
}
