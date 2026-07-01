import { getRedis, isRedisAvailable } from "./redis";
import { recordHit, recordMiss, recordError } from "./cache-metrics";

/**
 * Thin JSON cache wrapper around DragonflyDB via the ioredis client (Task #2517).
 *
 * All methods are no-ops or fall through when DragonflyDB is unavailable, so callers
 * can use them without conditionals. Namespaces double as cache-metric keys.
 */

const KEY_PREFIX = "bl:";

function k(namespace: string, key: string): string {
  return `${KEY_PREFIX}${namespace}:${key}`;
}

export async function cacheGet<T>(namespace: string, key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const raw = await r.get(k(namespace, key));
    if (raw == null) {
      recordMiss(namespace);
      return null;
    }
    recordHit(namespace);
    return JSON.parse(raw) as T;
  } catch (err) {
    recordError(namespace);
    console.warn(`[cache] get error ns=${namespace}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function cacheSet<T>(
  namespace: string,
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(k(namespace, key), JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    recordError(namespace);
    console.warn(`[cache] set error ns=${namespace}:`, err instanceof Error ? err.message : err);
  }
}

export async function cacheDel(namespace: string, key: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(k(namespace, key));
  } catch {
    recordError(namespace);
  }
}

/** Delete all keys in a namespace (SCAN-based, safe for large keyspaces). */
export async function cacheDelNamespace(namespace: string): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  const pattern = `${KEY_PREFIX}${namespace}:*`;
  let total = 0;
  try {
    let cursor = "0";
    do {
      const [next, keys] = await r.scan(cursor, "MATCH", pattern, "COUNT", 200);
      cursor = next;
      if (keys.length > 0) {
        await r.del(...keys);
        total += keys.length;
      }
    } while (cursor !== "0");
  } catch {
    recordError(namespace);
  }
  return total;
}

export async function cacheGetOrSet<T>(
  namespace: string,
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(namespace, key);
  if (cached !== null) return cached;
  const fresh = await loader();
  if (fresh !== undefined && fresh !== null) {
    await cacheSet(namespace, key, fresh, ttlSeconds);
  }
  return fresh;
}

export { isRedisAvailable };
