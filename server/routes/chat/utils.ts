export const CONV_CACHE_TTL_MS = 15_000;
export const CONV_CACHE_MAX_SIZE = 500;
export interface ConvCacheEntry { data: any[]; expiresAt: number }
export const convCache = new Map<string, ConvCacheEntry>();

export function convCacheKey(userId: string, limit: number, offset: number) { 
  return `${userId}:${limit}:${offset}`; 
}

export function invalidateConvCache(userId: string) {
  for (const key of convCache.keys()) {
    if (key.startsWith(`${userId}:`)) convCache.delete(key);
  }
}

export function pruneConvCache() {
  const now = Date.now();
  for (const [key, entry] of convCache.entries()) {
    if (entry.expiresAt <= now) convCache.delete(key);
  }
  if (convCache.size > CONV_CACHE_MAX_SIZE) {
    const excess = convCache.size - CONV_CACHE_MAX_SIZE;
    let removed = 0;
    for (const key of convCache.keys()) {
      if (removed >= excess) break;
      convCache.delete(key);
      removed++;
    }
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
